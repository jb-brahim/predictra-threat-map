require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const ThreatEvent = require('./models/ThreatEvent');
const { startCheckpoint } = require('./services/scrapers/checkpoint');
const { startMispGalaxy, getGalaxyData } = require('./services/scrapers/misp-galaxy');
const { startUrlhaus } = require('./services/scrapers/urlhaus');
const { startAlienVault } = require('./services/scrapers/alienvault');
const { startRansomWatch } = require('./services/scrapers/ransomwatch');
const { startC2Tracker } = require('./services/scrapers/c2tracker');
const { startBitdefender } = require('./services/scrapers/bitdefender');
const { startFortinet } = require('./services/scrapers/fortinet');
const { startKaspersky } = require('./services/scrapers/kaspersky');
const { getEnrichedSector } = require('./services/enrichment');


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
let dbSizeLimitReached = false;   // Database size limit flag
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
  if (isDatabaseEnabled && !dbSizeLimitReached && pendingDbDocs.length >= BATCH_DB_INSERT) {
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

// ─── Database Quota Monitor ──────────────────────────────────────────────────
const MAX_DB_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB
setInterval(async () => {
  if (!mongoose.connection || mongoose.connection.readyState !== 1) return;
  try {
    const stats = await mongoose.connection.db.stats();
    const size = stats.totalSize || (stats.storageSize + stats.indexSize) || stats.dataSize;
    if (size >= MAX_DB_SIZE_BYTES) {
      if (!dbSizeLimitReached) {
        console.warn(`[MongoDB] WARNING: Database size (${(size / 1024 / 1024).toFixed(2)} MB) exceeds 500 MB limit! Disabling database storage to save space.`);
        dbSizeLimitReached = true;
        isDatabaseEnabled = false; // Auto shutoff
      }
    } else {
      if (dbSizeLimitReached) {
        console.log(`[MongoDB] Database size (${(size / 1024 / 1024).toFixed(2)} MB) is below limit. Storage can be resumed automatically or manually.`);
        dbSizeLimitReached = false;
        // Optionally auto-resume: isDatabaseEnabled = true;
      }
    }
  } catch (err) {
    console.error('[MongoDB] Error checking db size:', err.message);
  }
}, 60000); // Check every minute

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
  if (dbSizeLimitReached && !isDatabaseEnabled) {
    return res.status(403).json({ error: 'Database size limit reached (500 MB). Cannot enable storage.', enabled: false });
  }
  isDatabaseEnabled = !isDatabaseEnabled;
  res.json({ enabled: isDatabaseEnabled });
});

app.get('/api/db/on', (req, res) => {
  if (dbSizeLimitReached) {
    return res.status(403).json({ error: 'Database size limit reached (500 MB). Cannot enable storage.', enabled: false });
  }
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

// Helper to get analytics match stage
const getAnalyticsMatchStage = (query = {}) => {
  const { type, country, from } = query;
  const matchStage = { 
    source_api: { $in: ['misp-galaxy', 'ransomwatch', 'alienvault'] } 
  };

  if (type) matchStage.a_t = type;
  if (country) matchStage.$or = [{ s_co: country.toUpperCase() }, { d_co: country.toUpperCase() }];
  if (from) matchStage.timestamp = { $gte: new Date(from) };

  return matchStage;
};

// Aggregated Stats Endpoint
app.get('/api/stats', async (req, res) => {
  try {
    const matchStage = getAnalyticsMatchStage(req.query);

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
      // For IP-only sources, "Vector" will be the organization/owner if available
      ThreatEvent.aggregate([
        { $match: matchStage },
        { $group: { _id: { $ifNull: ['$meta.organization', '$a_n'] }, count: { $sum: 1 } } },
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
    const matchStage = getAnalyticsMatchStage({ from: since });

    const agg = await ThreatEvent.aggregate([
      { $match: matchStage },
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

// ─── Sector mapping utility ──────────────────────────────────────────────────
// Now using the intelligent Enrichment Service for "Real Data" classification.
// Prioritizes enriched real-world sectors (Finance, Healthcare) if found over IP organization.
function estimateSector(event) {
  const enriched = getEnrichedSector(event);
  if (enriched && enriched !== 'General / Other') {
    return enriched;
  }
  return event.meta?.organization || enriched;
}


// ─── Analytics: Country Classification ───────────────────────────────────────
app.get('/api/analytics/countries', async (req, res) => {
  try {
    const matchStage = getAnalyticsMatchStage(req.query);

    const [origins, targets, typeByCountry] = await Promise.all([
      ThreatEvent.aggregate([
        { $match: matchStage },
        { $group: { _id: '$s_co', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 50 }
      ]),
      ThreatEvent.aggregate([
        { $match: matchStage },
        { $group: { _id: '$d_co', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 50 }
      ]),
      ThreatEvent.aggregate([
        { $match: matchStage },
        { $group: {
          _id: { co: '$s_co', type: '$a_t' },
          count: { $sum: 1 }
        }},
        { $sort: { count: -1 } }
      ])
    ]);

    // Merge into a single country list
    const countryMap = {};
    origins.forEach(d => {
      if (!d._id) return;
      if (!countryMap[d._id]) countryMap[d._id] = { code: d._id, asOrigin: 0, asTarget: 0, total: 0, topType: null, types: {} };
      countryMap[d._id].asOrigin = d.count;
      countryMap[d._id].total += d.count;
    });
    targets.forEach(d => {
      if (!d._id) return;
      if (!countryMap[d._id]) countryMap[d._id] = { code: d._id, asOrigin: 0, asTarget: 0, total: 0, topType: null, types: {} };
      countryMap[d._id].asTarget = d.count;
      countryMap[d._id].total += d.count;
    });
    typeByCountry.forEach(d => {
      if (!d._id?.co || !countryMap[d._id.co]) return;
      countryMap[d._id.co].types[d._id.type] = (countryMap[d._id.co].types[d._id.type] || 0) + d.count;
    });
    Object.values(countryMap).forEach(c => {
      const entries = Object.entries(c.types);
      if (entries.length > 0) {
        c.topType = entries.sort((a, b) => b[1] - a[1])[0][0];
      }
    });

    const countries = Object.values(countryMap).sort((a, b) => b.total - a.total);
    const totalGlobal = countries.reduce((s, c) => s + c.total, 0);

    res.json({ countries, totalGlobal });
  } catch (error) {
    console.error('[API] Error fetching country analytics:', error.message);
    res.status(500).json({ error: 'Failed to fetch country analytics' });
  }
});

// ─── Analytics: Trends ───────────────────────────────────────────────────────
app.get('/api/analytics/trends', async (req, res) => {
  try {
    const { period = '24h' } = req.query;

    let since, dateFormat, bucketLabel;
    switch (period) {
      case '7d':
        since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
        dateFormat = '%Y-%m-%d';
        bucketLabel = 'day';
        break;
      case '30d':
        since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
        dateFormat = '%Y-%m-%d';
        bucketLabel = 'day';
        break;
      default: // 24h
        since = new Date(Date.now() - 24 * 3600 * 1000);
        dateFormat = '%Y-%m-%dT%H:00:00Z';
        bucketLabel = 'hour';
    }

    const matchStage = getAnalyticsMatchStage({ ...req.query, from: since });

    // Total timeline
    const totalTimeline = await ThreatEvent.aggregate([
      { $match: matchStage },
      { $group: {
        _id: { $dateToString: { format: dateFormat, date: '$timestamp' } },
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);

    // By type timeline
    const typeTimeline = await ThreatEvent.aggregate([
      { $match: matchStage },
      { $group: {
        _id: {
          bucket: { $dateToString: { format: dateFormat, date: '$timestamp' } },
          type: '$a_t'
        },
        count: { $sum: 1 }
      }},
      { $sort: { '_id.bucket': 1 } }
    ]);

    // Calculate period comparison
    const prevStart = new Date(since.getTime() - (Date.now() - since.getTime()));
    const prevMatch = getAnalyticsMatchStage({ ...req.query, from: prevStart });
    prevMatch.timestamp.$lt = since;

    const [currentTotal, previousTotal] = await Promise.all([
      ThreatEvent.countDocuments(matchStage),
      ThreatEvent.countDocuments(prevMatch)
    ]);

    const changePercent = previousTotal > 0
      ? Math.round(((currentTotal - previousTotal) / previousTotal) * 100)
      : currentTotal > 0 ? 100 : 0;

    res.json({
      period,
      bucketLabel,
      timeline: totalTimeline.map(d => ({ bucket: d._id, count: d.count })),
      byType: typeTimeline.map(d => ({ bucket: d._id.bucket, type: d._id.type, count: d.count })),
      currentTotal,
      previousTotal,
      changePercent
    });
  } catch (error) {
    console.error('[API] Error fetching trend analytics:', error.message);
    res.status(500).json({ error: 'Failed to fetch trend analytics' });
  }
});

// ─── Analytics: Sectors (now Organizations for IP-only) ────────────────────────────
app.get('/api/analytics/sectors', async (req, res) => {
  try {
    const matchStage = getAnalyticsMatchStage(req.query);

    // Fetch raw events (limited) to classify by organization
    const events = await ThreatEvent.find(matchStage)
      .sort({ timestamp: -1 })
      .limit(5000)
      .lean();

    const sectorCounts = {};
    const sectorTypes = {};  // sector → { exploit: N, malware: N, phishing: N }

    events.forEach(ev => {
      const sector = estimateSector(ev);
      sectorCounts[sector] = (sectorCounts[sector] || 0) + 1;
      if (!sectorTypes[sector]) sectorTypes[sector] = { exploit: 0, malware: 0, phishing: 0 };
      if (ev.a_t && sectorTypes[sector][ev.a_t] !== undefined) {
        sectorTypes[sector][ev.a_t]++;
      }
    });

    const sectors = Object.entries(sectorCounts)
      .map(([name, count]) => ({
        name,
        count,
        percentage: events.length > 0 ? ((count / events.length) * 100).toFixed(1) : '0',
        topTypes: sectorTypes[name] || {}
      }))
      .sort((a, b) => b.count - a.count);

    res.json({
      sectors,
      totalAnalyzed: events.length,
      note: 'Analytics powered by MISP Galaxy intelligence. Categories represent identified industry sectors.'
    });
  } catch (error) {
    console.error('[API] Error fetching sector analytics:', error.message);
    res.status(500).json({ error: 'Failed to fetch sector analytics' });
  }
});

// ─── Analytics: Combined (Country × Organization) ─────────────────────────────────
app.get('/api/analytics/combined', async (req, res) => {
  try {
    const { sector } = req.query;
    const matchStage = getAnalyticsMatchStage(req.query);

    const events = await ThreatEvent.find(matchStage)
      .sort({ timestamp: -1 })
      .limit(5000)
      .lean();

    // Build country×sector matrix
    const matrix = {}; // { countryCode: { sector: count } }
    const sectorTotals = {};
    const countryTotals = {};

    events.forEach(ev => {
      const s = estimateSector(ev);
      // Filter by sector if specified
      if (sector && s !== sector) return;

      const countries = [ev.s_co, ev.d_co].filter(Boolean);
      countries.forEach(co => {
        if (!matrix[co]) matrix[co] = {};
        matrix[co][s] = (matrix[co][s] || 0) + 1;
        sectorTotals[s] = (sectorTotals[s] || 0) + 1;
        countryTotals[co] = (countryTotals[co] || 0) + 1;
      });
    });

    // If a country is selected, return sector breakdown
    // If a sector is selected, return country breakdown
    // Otherwise return the full matrix for top entries
    const topCountries = Object.entries(countryTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([code, total]) => ({
        code,
        total,
        sectors: matrix[code] || {}
      }));

    const topSectors = Object.entries(sectorTotals)
      .sort((a, b) => b[1] - a[1])
      .map(([name, total]) => ({ name, total }));

    res.json({
      countries: topCountries,
      sectors: topSectors,
      totalAnalyzed: events.length,
      note: 'Country and Sector breakdown of attacks.'
    });
  } catch (error) {
    console.error('[API] Error fetching combined analytics:', error.message);
    res.status(500).json({ error: 'Failed to fetch combined analytics' });
  }
});

// ─── MISP Galaxy API Endpoints ────────────────────────────────────────────────

// Galaxy: All Threat Actors
app.get('/api/galaxy/actors', (req, res) => {
  const { country, search } = req.query;
  const data = getGalaxyData();
  let actors = data.threatActors || [];

  if (country) {
    actors = actors.filter(a => {
      const cc = (a.meta?.country || '').toUpperCase();
      return cc === country.toUpperCase();
    });
  }
  if (search) {
    const q = search.toLowerCase();
    actors = actors.filter(a =>
      (a.value || '').toLowerCase().includes(q) ||
      (a.description || '').toLowerCase().includes(q) ||
      (a.meta?.synonyms || []).some(s => s.toLowerCase().includes(q))
    );
  }

  const mapped = actors.map(a => ({
    name: a.value,
    uuid: a.uuid,
    description: (a.description || '').slice(0, 500),
    country: a.meta?.country || null,
    stateSponsor: a.meta?.['cfr-suspected-state-sponsor'] || null,
    victims: a.meta?.['cfr-suspected-victims'] || [],
    targetSectors: a.meta?.['cfr-target-category'] || a.meta?.['targeted-sector'] || [],
    incidentType: a.meta?.['cfr-type-of-incident'] || null,
    synonyms: a.meta?.synonyms || [],
    refs: (a.meta?.refs || []).slice(0, 5),
  }));

  res.json({ total: mapped.length, actors: mapped });
});

// Galaxy: Ransomware Families
app.get('/api/galaxy/ransomware', (req, res) => {
  const { search } = req.query;
  const data = getGalaxyData();
  let rw = data.ransomware || [];

  if (search) {
    const q = search.toLowerCase();
    rw = rw.filter(r =>
      (r.value || '').toLowerCase().includes(q) ||
      (r.description || '').toLowerCase().includes(q) ||
      (r.meta?.synonyms || []).some(s => s.toLowerCase().includes(q))
    );
  }

  const mapped = rw.map(r => ({
    name: r.value,
    uuid: r.uuid,
    description: (r.description || '').slice(0, 500),
    synonyms: r.meta?.synonyms || [],
    refs: (r.meta?.refs || []).slice(0, 5),
    encryption: r.meta?.encryption || null,
    extensions: r.meta?.extensions || null,
    ransomnotes: r.meta?.ransomnotes || null,
  }));

  res.json({ total: mapped.length, ransomware: mapped });
});

// Galaxy: Adversary Tools
app.get('/api/galaxy/tools', (req, res) => {
  const { search } = req.query;
  const data = getGalaxyData();
  let tools = data.tools || [];

  if (search) {
    const q = search.toLowerCase();
    tools = tools.filter(t =>
      (t.value || '').toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q) ||
      (t.meta?.synonyms || []).some(s => s.toLowerCase().includes(q))
    );
  }

  const mapped = tools.map(t => ({
    name: t.value,
    uuid: t.uuid,
    description: (t.description || '').slice(0, 500),
    synonyms: t.meta?.synonyms || [],
    refs: (t.meta?.refs || []).slice(0, 5),
    type: t.meta?.type || [],
  }));

  res.json({ total: mapped.length, tools: mapped });
});

// Galaxy: Aggregate Statistics
app.get('/api/galaxy/stats', (req, res) => {
  const data = getGalaxyData();
  const actors = data.threatActors || [];

  // By country of origin
  const byCountry = {};
  actors.forEach(a => {
    const cc = (a.meta?.country || '').toUpperCase();
    if (cc) byCountry[cc] = (byCountry[cc] || 0) + 1;
  });

  // By target sector
  const bySector = {};
  actors.forEach(a => {
    const sectors = a.meta?.['cfr-target-category'] || a.meta?.['targeted-sector'] || [];
    sectors.forEach(s => { bySector[s] = (bySector[s] || 0) + 1; });
  });

  // By incident type
  const byIncident = {};
  actors.forEach(a => {
    const t = a.meta?.['cfr-type-of-incident'] || 'Unknown';
    byIncident[t] = (byIncident[t] || 0) + 1;
  });

  // Most targeted countries
  const byVictim = {};
  actors.forEach(a => {
    (a.meta?.['cfr-suspected-victims'] || []).forEach(v => {
      byVictim[v] = (byVictim[v] || 0) + 1;
    });
  });

  res.json({
    totalActors: actors.length,
    totalRansomware: (data.ransomware || []).length,
    totalTools: (data.tools || []).length,
    totalExploitKits: (data.exploitKits || []).length,
    byCountry,
    bySector,
    byIncident,
    byVictim,
    lastFetch: data.lastFetch,
  });
});

// Start Scraping Services
startCheckpoint((ev, data) => broadcast(ev, data, 'checkpoint'));
startMispGalaxy((ev, data) => broadcast(ev, data, 'misp-galaxy'));
startUrlhaus((ev, data) => broadcast(ev, data, 'urlhaus'));
startAlienVault((ev, data) => broadcast(ev, data, 'alienvault'));
startRansomWatch((ev, data) => broadcast(ev, data, 'ransomwatch'));
startC2Tracker((ev, data) => broadcast(ev, data, 'c2tracker'));
startBitdefender((ev, data) => broadcast(ev, data, 'bitdefender'));
startFortinet((ev, data) => broadcast(ev, data, 'fortinet'));
startKaspersky((ev, data) => broadcast(ev, data, 'kaspersky'));

app.listen(PORT, () => {
  console.log(`[Server] SSE Backend listening on http://localhost:${PORT}`);
});
