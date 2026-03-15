require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const ThreatEvent = require('./models/ThreatEvent');
const { startBitdefender } = require('./services/scrapers/bitdefender');
const { startFortinet } = require('./services/scrapers/fortinet');
const { startKaspersky } = require('./services/scrapers/kaspersky');
const { startCheckpoint } = require('./services/scrapers/checkpoint');
const { startSans } = require('./services/scrapers/sans');
const { startThreatFox } = require('./services/scrapers/threatfox');
const { startUrlhaus } = require('./services/scrapers/urlhaus');

const app = express();
app.use(cors());

// Connect to MongoDB
connectDB();

const PORT = process.env.PORT || 3001;

// Keep track of connected clients and database toggle
let clients = [];
let isDatabaseEnabled = true;

// Helper to broadcast events to all connected clients and save to DB
const broadcast = async (event, data, sourceApi = 'unknown') => {
  if (event === 'attack') {
    console.log(`[Aggregator] ${sourceApi} attack: ${data.a_n} | src: (${data.s_la},${data.s_lo}) | dst: (${data.d_la},${data.d_lo})`);
  }

  clients.forEach(client => {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  });

  // Save to MongoDB if it's an attack event and database is enabled
  if (event === 'attack' && isDatabaseEnabled) {
    try {
      const newThreat = new ThreatEvent({
        ...data,
        source_api: sourceApi,
        s_ip: data.s_ip || 'unknown',
        d_ip: data.d_ip || 'unknown',
        meta: data.meta || {}
      });
      // Save without awaiting strictly to not block the event loop aggressively
      newThreat.save().catch(err => console.error("[MongoDB] Error saving event:", err.message));
    } catch (err) {
      console.error("[MongoDB] Error saving event:", err.message);
    }
  }
};

// ... existing code ... (DB toggle endpoints)

// History Endpoint with Search
app.get('/api/history', async (req, res) => {
  try {
    const { q, ip } = req.query;
    let query = {};

    if (ip) {
      query.$or = [{ s_ip: ip }, { d_ip: ip }];
    } else if (q) {
      const searchRegex = new RegExp(q, 'i');
      query.$or = [
        { a_n: searchRegex },
        { s_ip: searchRegex },
        { d_ip: searchRegex },
        { 'meta.tags': searchRegex },
        { 'meta.malware_family': searchRegex },
        { 'meta.threat_type': searchRegex },
        { 'meta.as_name': searchRegex },
        { 'meta.port': String(q) } // Exact match for port if it's a number
      ];
    }

    const history = await ThreatEvent.find(query)
      .sort({ timestamp: -1 })
      .limit(200)
      .lean();
    res.json(history);
  } catch (error) {
    console.error('[API] Error fetching history:', error.message);
    res.status(500).json({ error: 'Failed to fetch attack history' });
  }
});

// Start Scraping Services
startBitdefender((ev, data) => broadcast(ev, data, 'bitdefender'));
startFortinet((ev, data) => broadcast(ev, data, 'fortinet'));
startKaspersky((ev, data) => broadcast(ev, data, 'kaspersky'));
startCheckpoint((ev, data) => broadcast(ev, data, 'checkpoint'));
startSans((ev, data) => broadcast(ev, data, 'sans'));
startThreatFox((ev, data) => broadcast(ev, data, 'threatfox'));
startUrlhaus((ev, data) => broadcast(ev, data, 'urlhaus'));

app.listen(PORT, () => {
  console.log(`[Server] SSE Backend listening on http://localhost:${PORT}`);
});
