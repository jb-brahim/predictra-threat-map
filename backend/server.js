const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const ThreatEvent = require('./models/ThreatEvent');
const { startBitdefender } = require('./services/scrapers/bitdefender');
const { startFortinet } = require('./services/scrapers/fortinet');
const { startKaspersky } = require('./services/scrapers/kaspersky');
const { startCheckpoint } = require('./services/scrapers/checkpoint');

const app = express();
app.use(cors());

// Connect to MongoDB
connectDB();

const PORT = 3001;

// Keep track of connected clients
let clients = [];

// Helper to broadcast events to all connected clients and save to DB
const broadcast = async (event, data, sourceApi = 'unknown') => {
  if (event === 'attack') {
    console.log(`[Aggregator] ${sourceApi} attack: ${data.a_n} | src: (${data.s_la},${data.s_lo}) | dst: (${data.d_la},${data.d_lo})`);
  }

  clients.forEach(client => {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  });

  // Save to MongoDB if it's an attack event
  if (event === 'attack') {
    try {
      const newThreat = new ThreatEvent({
        ...data,
        source_api: sourceApi
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

// Start Scraping Services
startBitdefender((ev, data) => broadcast(ev, data, 'bitdefender'));
startFortinet((ev, data) => broadcast(ev, data, 'fortinet'));
startKaspersky((ev, data) => broadcast(ev, data, 'kaspersky'));
startCheckpoint((ev, data) => broadcast(ev, data, 'checkpoint'));

app.listen(PORT, () => {
  console.log(`[Server] SSE Backend listening on http://localhost:${PORT}`);
});
