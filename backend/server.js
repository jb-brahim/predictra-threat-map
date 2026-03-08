const express = require('express');
const cors = require('cors');
const { startBitdefender } = require('./services/scrapers/bitdefender');
const { startFortinet } = require('./services/scrapers/fortinet');
const { startKaspersky } = require('./services/scrapers/kaspersky');

const app = express();
app.use(cors());

const PORT = 3001;

// Keep track of connected clients
let clients = [];

// Helper to broadcast events to all connected clients
const broadcast = (event, data) => {
  clients.forEach(client => {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  });
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
startBitdefender(broadcast);
startFortinet(broadcast);
startKaspersky(broadcast);

app.listen(PORT, () => {
  console.log(`[Server] SSE Backend listening on http://localhost:${PORT}`);
});
