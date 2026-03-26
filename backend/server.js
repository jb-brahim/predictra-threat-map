require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const ThreatEvent = require('./models/ThreatEvent');
const { startSans } = require('./services/scrapers/sans');
const { startThreatFox } = require('./services/scrapers/threatfox');
const { startUrlhaus } = require('./services/scrapers/urlhaus');
const { startAlienVault } = require('./services/scrapers/alienvault');
const { startRansomWatch } = require('./services/scrapers/ransomwatch');
const { startC2Tracker } = require('./services/scrapers/c2tracker');

const app = express();
app.use(cors());

// Connect to MongoDB
connectDB();

const PORT = process.env.PORT || 3001;

// ─── Batching infrastructure ──────────────────────────────────────────────────
// Instead of writing one SSE message per event (which causes browser-side
// processing storms), we queue all incoming attacks and flush them in a single
// JSON array every BATCH_INTERVAL_MS. This cuts SSE writes and frontend
// Zustand updates by ~50×.

const BATCH_INTERVAL_MS = 300;   // flush interval – tune between 200–500ms
const MAX_PENDING = 500;          // hard cap: drop oldest when queue overflows
const BATCH_DB_INSERT = 25;       // bulk-insert MongoDB after accumulating N docs

let pendingEvents = [];           // staging queue between flushes
let pendingDbDocs = [];           // staging queue for bulk Mongo inserts
let isDatabaseEnabled = true;     // Database persistance flag (Must be true to store attacks)
let clients = [];                 // SSE connected clients

// ─── Batch flush (runs every BATCH_INTERVAL_MS) ───────────────────────────────
const flushBatch = () => {
  if (pendingEvents.length === 0) return;

  const batch = pendingEvents;
  pendingEvents = [];

  // Broadcast ONE SSE message with the entire array
  const payload = JSON.stringify(batch);
  clients.forEach(client => {
    try {
      client.res.write(`event: attacks\ndata: ${payload}\n\n`);
    } catch (e) {
      // Client likely disconnected; it will be cleaned up on 'close'
    }
  });

  // Bulk-insert into MongoDB to avoid N individual save() calls
  if (isDatabaseEnabled && pendingDbDocs.length >= BATCH_DB_INSERT) {
    const docs = pendingDbDocs.splice(0, pendingDbDocs.length);
    ThreatEvent.insertMany(docs, { ordered: false })
      .catch(err => console.error('[MongoDB] Bulk insert error:', err.message));
  }
};

setInterval(flushBatch, BATCH_INTERVAL_MS);

// Heartbeat – keeps SSE connections alive through proxies / load balancers
setInterval(() => {
  clients.forEach(client => {
    try { client.res.write('event: ping\ndata: {}\n\n'); } catch (_) { }
  });
}, 30_000);

// ─── Main broadcast entry-point (called by each scraper) ─────────────────────
const broadcast = (event, data, sourceApi = 'unknown') => {
  if (event === 'counter') {
    // Counter events are rare and time-sensitive – send immediately
    const payload = JSON.stringify(data);
    clients.forEach(client => {
      try { client.res.write(`event: counter\ndata: ${payload}\n\n`); } catch (_) { }
    });
    return;
  }

  if (event !== 'attack') return;

  // Enforce queue cap (drop oldest to make room) 
  if (pendingEvents.length >= MAX_PENDING) {
    pendingEvents.shift();
  }

  const enriched = { ...data, source_api: sourceApi };
  pendingEvents.push(enriched);

  // Stage for MongoDB bulk insert
  if (isDatabaseEnabled) {
    if (pendingDbDocs.length >= MAX_PENDING) pendingDbDocs.shift();
    pendingDbDocs.push({
      ...data,
      source_api: sourceApi,
      s_ip: data.s_ip || 'unknown',
      d_ip: data.d_ip || 'unknown',
      meta: data.meta || {},
    });
  }
};


// SSE Feed endpoint – clients connect here for live events
app.get('/api/feed', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  clients.push(newClient);

  req.on('close', () => {
    clients = clients.filter(c => c.id !== clientId);
  });
});

// DB persistence management
app.post('/api/db/toggle', (req, res) => {
  isDatabaseEnabled = !isDatabaseEnabled;
  res.json({ enabled: isDatabaseEnabled });
});

app.get('/api/db/on', (req, res) => {
  isDatabaseEnabled = true;
  res.json({ status: 'Database logging ENABLED', enabled: isDatabaseEnabled });
});

app.get('/api/db/off', (req, res) => {
  isDatabaseEnabled = false;
  res.json({ status: 'Database logging DISABLED', enabled: isDatabaseEnabled });
});

app.get('/api/db/status', (req, res) => {
  res.json({ enabled: isDatabaseEnabled });
});

// History Endpoint with Search
app.get('/api/history', async (req, res) => {
  try {
    const { q, ip, country } = req.query;
    let query = {};

    if (ip) {
      query.$or = [{ s_ip: ip }, { d_ip: ip }];
    } else if (country) {
      query.$or = [{ s_co: country.toUpperCase() }, { d_co: country.toUpperCase() }];
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
        { 'meta.port': String(q) }
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

// Aggregated Stats Endpoint
app.get('/api/stats', async (req, res) => {
  try {
    const { type, source, country, from } = req.query;
    const matchStage = {};

    if (type) matchStage.a_t = type;
    if (source) matchStage.source_api = source;
    if (country) matchStage.$or = [{ s_co: country.toUpperCase() }, { d_co: country.toUpperCase() }];
    if (from) matchStage.timestamp = { $gte: new Date(from) };

    const [typeAgg, originAgg, targetAgg, vectorAgg, sourceAgg, total] = await Promise.all([
      ThreatEvent.aggregate([
        { $match: matchStage },
        { $group: { _id: '$a_t', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      ThreatEvent.aggregate([
        { $match: matchStage },
        { $group: { _id: '$s_co', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 }
      ]),
      ThreatEvent.aggregate([
        { $match: matchStage },
        { $group: { _id: '$d_co', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 }
      ]),
      ThreatEvent.aggregate([
        { $match: matchStage },
        { $group: { _id: '$a_n', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 }
      ]),
      ThreatEvent.aggregate([
        { $match: matchStage },
        { $group: { _id: '$source_api', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      ThreatEvent.countDocuments(matchStage)
    ]);

    res.json({
      total,
      byType: Object.fromEntries(typeAgg.map(d => [d._id, d.count])),
      byOrigin: Object.fromEntries(originAgg.map(d => [d._id, d.count])),
      byTarget: Object.fromEntries(targetAgg.map(d => [d._id, d.count])),
      byVector: Object.fromEntries(vectorAgg.map(d => [d._id, d.count])),
      bySource: Object.fromEntries(sourceAgg.map(d => [d._id, d.count])),
    });
  } catch (error) {
    console.error('[API] Error fetching stats:', error.message);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Timeline – hourly buckets for last 24 hours
app.get('/api/stats/timeline', async (req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const agg = await ThreatEvent.aggregate([
      { $match: { timestamp: { $gte: since } } },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%dT%H:00:00Z', date: '$timestamp' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    res.json(agg.map(d => ({ hour: d._id, count: d.count })));
  } catch (error) {
    console.error('[API] Error fetching timeline:', error.message);
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

// Start REAL Scraping Services only
startSans((ev, data) => broadcast(ev, data, 'sans'));
startThreatFox((ev, data) => broadcast(ev, data, 'threatfox'));
startUrlhaus((ev, data) => broadcast(ev, data, 'urlhaus'));
startAlienVault((ev, data) => broadcast(ev, data, 'alienvault'));
startRansomWatch((ev, data) => broadcast(ev, data, 'ransomwatch'));
startC2Tracker((ev, data) => broadcast(ev, data, 'c2tracker'));

app.listen(PORT, () => {
  console.log(`[Server] SSE Backend listening on http://localhost:${PORT}`);
});
