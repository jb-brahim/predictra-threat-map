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
        d_ip: data.d_ip || 'unknown'
      });
      // Save without awaiting strictly to not block the event loop aggressively
      newThreat.save().catch(err => console.error("[MongoDB] Error saving event:", err.message));
    } catch (err) {
      console.error("[MongoDB] Error saving event:", err.message);
    }
  }
};

// SSE Endpoint
app.get('/api/feed', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  // Initial flush to establish connection
  res.write(': connected\n\n');

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  clients.push(newClient);

  console.log(`[SSE] Client connected: ${clientId} | Total clients: ${clients.length}`);

  req.on('close', () => {
    console.log(`[SSE] Client disconnected: ${clientId}`);
    clients = clients.filter(c => c.id !== clientId);
  });
});

// Database Toggle Endpoints
app.get('/api/db/on', (req, res) => {
  isDatabaseEnabled = true;
  console.log('[Database] Storage ENABLED via URL');
  res.send('MongoDB Storage is now ENABLED. Attacks will be saved.');
});

app.get('/api/db/off', (req, res) => {
  isDatabaseEnabled = false;
  console.log('[Database] Storage DISABLED via URL');
  res.send('MongoDB Storage is now DISABLED. Attacks will not be saved.');
});

// History Endpoint
app.get('/api/history', async (req, res) => {
  try {
    const history = await ThreatEvent.find()
      .sort({ timestamp: -1 })
      .limit(100)
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
