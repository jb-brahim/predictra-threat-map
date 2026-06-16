require('dotenv').config(); // Load environment variables from .env file into process.env
const express = require('express'); // Import Express framework for handling routing and HTTP requests
const cors = require('cors'); // Import CORS middleware to allow cross-origin requests
const mongoose = require('mongoose'); // Import Mongoose library to manage MongoDB connections and states
const { pipeline, Transform } = require('stream'); // Import stream utilities for backpressure-aware memory safety
const connectDB = require('./config/db'); // Import database connector module function
const ThreatEvent = require('./models/ThreatEvent'); // Import Mongoose ThreatEvent database model definition
const { startCheckpoint } = require('./services/scrapers/checkpoint'); // Import Checkpoint SSE scraper activation trigger
const { startMispGalaxy, getGalaxyData } = require('./services/scrapers/misp-galaxy'); // Import MISP Galaxy scraper and data cache accessor
const { startUrlhaus } = require('./services/scrapers/urlhaus'); // Import URLhaus scraper activation trigger
const { startAlienVault } = require('./services/scrapers/alienvault'); // Import AlienVault scraper activation trigger
const { startRansomWatch } = require('./services/scrapers/ransomwatch'); // Import Ransomwatch scraper activation trigger
const { startC2Tracker } = require('./services/scrapers/c2tracker'); // Import C2Tracker scraper activation trigger
const { startBitdefender } = require('./services/scrapers/bitdefender'); // Import Bitdefender scraper activation trigger
const { startFortinet } = require('./services/scrapers/fortinet'); // Import Fortinet scraper activation trigger
const { startKaspersky } = require('./services/scrapers/kaspersky'); // Import Kaspersky scraper activation trigger
const { getEnrichedSector } = require('./services/enrichment'); // Import Enrichment service sector lookup function


const app = express(); // Initialize Express application instance
app.use(cors()); // Register CORS middleware for all HTTP routes

// Connect to MongoDB
connectDB(); // Trigger initial database connection sequence

const PORT = process.env.PORT || 3001; // Assign server port using environment setting or fallback default value 3001

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
const flushBatch = () => { // Define function to flush batch buffers to clients and database
  if (pendingEvents.length === 0) return; // Exit early if there are no pending events to flush

  const batch = pendingEvents; // Extract staging array contents to local variable reference
  pendingEvents = []; // Reset global pending events array buffer to empty list

  // Broadcast ONE SSE message with the entire array
  const payload = JSON.stringify(batch); // Serialize batch events list to JSON payload string
  clients.forEach(client => { // Loop through all registered SSE client connection objects
    try { // Start try block to handle write operations safely
      client.res.write(`event: attacks\ndata: ${payload}\n\n`); // Write SSE format payload message containing the serialized batch
    } catch (e) { // Capture write failure errors (e.g. disconnected clients)
      // Client likely disconnected; it will be cleaned up on 'close'
    } // End of inner try-catch block
  }); // End of clients dispatch loop

  // Bulk-insert into MongoDB to avoid N individual save() calls
  if (isDatabaseEnabled && !dbSizeLimitReached && pendingDbDocs.length >= BATCH_DB_INSERT) { // Check database flags and threshold limit
    const docs = pendingDbDocs.splice(0, pendingDbDocs.length); // Extract and clear all currently staged database documents
    ThreatEvent.insertMany(docs, { ordered: false }) // Execute MongoDB bulk insert query in unordered mode
      .catch(err => console.error('[MongoDB] Bulk insert error:', err.message)); // Catch bulk insertion exceptions and log error
  } // End of database persist check block
}; // End of flushBatch definition

setInterval(flushBatch, BATCH_INTERVAL_MS); // Setup recurring interval trigger for flushing event batch buffers

// Heartbeat – keeps SSE connections alive through proxies / load balancers
setInterval(() => { // Setup recurring interval trigger to send heartbeats every 30 seconds
  clients.forEach(client => { // Loop through all connected SSE client handles
    try { client.res.write('event: ping\ndata: {}\n\n'); } catch (_) { } // Write empty SSE ping packet, catching failures silently
  }); // End of clients heartbeat loop
}, 30_000); // Trigger interval set to 30000ms

// ─── Database Quota Monitor ──────────────────────────────────────────────────
const MAX_DB_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB quota threshold level definition
setInterval(async () => { // Setup recurring async interval task to check DB size limit
  if (!mongoose.connection || mongoose.connection.readyState !== 1) return; // Terminate cycle if Mongoose connection is not ready
  try { // Start try block to execute database statistics query safely
    const stats = await mongoose.connection.db.stats(); // Retrieve stats object from current active database instance
    const size = stats.totalSize || (stats.storageSize + stats.indexSize) || stats.dataSize; // Resolve total allocated size bytes
    if (size >= MAX_DB_SIZE_BYTES) { // Check if resolved database size exceeds defined limit quota
      if (!dbSizeLimitReached) { // If quota warning state was not already registered
        console.warn(`[MongoDB] WARNING: Database size (${(size / 1024 / 1024).toFixed(2)} MB) exceeds 500 MB limit! Disabling database storage to save space.`); // Log storage cutoff warning
        dbSizeLimitReached = true; // Set database size limit state flag to true
        isDatabaseEnabled = false; // Disable database logging auto-shutoff
      } // End of warning state update check
    } else { // Handle database size within safe quota limits
      if (dbSizeLimitReached) { // If database limit state flag was set to true previously
        console.log(`[MongoDB] Database size (${(size / 1024 / 1024).toFixed(2)} MB) is below limit. Storage can be resumed automatically or manually.`); // Log quota recovery message
        dbSizeLimitReached = false; // Reset database size limit state flag to false
        // Optionally auto-resume: isDatabaseEnabled = true;
      } // End of limit recovery check
    } // End of quota verification condition
  } catch (err) { // Catch statistics check failures
    console.error('[MongoDB] Error checking db size:', err.message); // Log statistical query error message
  } // End of try-catch block
}, 60000); // Check every minute (60000ms)

// ─── Main broadcast entry-point (called by each scraper) ─────────────────────
const broadcast = (event, data, sourceApi = 'unknown') => { // Define main data router broadcast function
  if (event === 'counter') { // Handle immediate non-batch counter events
    // Counter events are rare and time-sensitive – send immediately
    const payload = JSON.stringify(data); // Serialize counter event payload object to JSON string
    clients.forEach(client => { // Loop through active SSE connections list
      try { client.res.write(`event: counter\ndata: ${payload}\n\n`); } catch (_) { } // Write immediate counter SSE packet, catch failures silently
    }); // End of clients broadcast loop
    return; // Exit function immediately
  } // End of counter event check

  if (event !== 'attack') return; // Exit function early if the event topic is not 'attack'

  // Enforce queue cap (drop oldest to make room) 
  if (pendingEvents.length >= MAX_PENDING) { // If the pending events queue length reaches maximum threshold
    pendingEvents.shift(); // Remove the oldest item from the front of the queue
  } // End of queue cap validation

  const enriched = { ...data, source_api: sourceApi }; // Append source API identifier to event payload object
  pendingEvents.push(enriched); // Insert enriched threat event record to flush queue

  // Stage for MongoDB bulk insert
  if (isDatabaseEnabled) { // If database persistence logging is enabled
    if (pendingDbDocs.length >= MAX_PENDING) pendingDbDocs.shift(); // Evict oldest staged database document if database queue limit is met
    pendingDbDocs.push({ // Stage new document insertion properties
      ...data, // Copy base event details properties
      source_api: sourceApi, // Attach scraper origin identifier property
      s_ip: data.s_ip || 'unknown', // Map source IP defaulting to unknown string
      d_ip: data.d_ip || 'unknown', // Map destination IP/victim defaulting to unknown string
      meta: data.meta || {}, // Assign metadata details defaulting to empty object
    }); // End of pending database document push mapping
  } // End of database staging validation check
}; // End of broadcast function definition


// SSE Feed endpoint – clients connect here for live events
app.get('/api/feed', (req, res) => { // Bind GET route handler for streaming real-time events feed
  res.setHeader('Content-Type', 'text/event-stream'); // Assign SSE stream headers Content-Type configuration
  res.setHeader('Cache-Control', 'no-cache'); // Assign cache bypass instructions in Cache-Control header
  res.setHeader('Connection', 'keep-alive'); // Instruct intermediaries to keep connection open via connection keep-alive header
  res.flushHeaders(); // Flush request headers immediately to establish active streaming socket

  const clientId = Date.now(); // Generate unique numeric client identifier using current millisecond timestamp
  const newClient = { id: clientId, res }; // Package client metadata record holding identifier and response socket handle
  clients.push(newClient); // Insert package to global client connections list array

  req.on('close', () => { // Bind connection closed callback event handler
    clients = clients.filter(c => c.id !== clientId); // Remove reference from active clients array matching connection ID
  }); // End of connection close trigger binding
}); // End of feed route definition

// DB persistence management
app.post('/api/db/toggle', (req, res) => { // Bind POST route to toggle database storage state on/off
  if (dbSizeLimitReached && !isDatabaseEnabled) { // Prevent state change if database quota limit cutoff is active
    return res.status(403).json({ error: 'Database size limit reached (500 MB). Cannot enable storage.', enabled: false }); // Return HTTP Forbidden error response
  } // End of quota validation check
  isDatabaseEnabled = !isDatabaseEnabled; // Negate database logging boolean state flag
  res.json({ enabled: isDatabaseEnabled }); // Send JSON payload showing new state status value
}); // End of toggle route definition

app.get('/api/db/on', (req, res) => { // Bind GET route to explicitly enable database logging state
  if (dbSizeLimitReached) { // Prevent activation if database size limit cutoff is active
    return res.status(403).json({ error: 'Database size limit reached (500 MB). Cannot enable storage.', enabled: false }); // Return HTTP Forbidden error response
  } // End of quota check
  isDatabaseEnabled = true; // Force database logging boolean state flag to true
  res.json({ status: 'Database logging ENABLED', enabled: isDatabaseEnabled }); // Send JSON payload showing enabled state status
}); // End of db/on route definition

app.get('/api/db/off', (req, res) => { // Bind GET route to explicitly disable database logging state
  isDatabaseEnabled = false; // Force database logging boolean state flag to false
  res.json({ status: 'Database logging DISABLED', enabled: isDatabaseEnabled }); // Send JSON payload showing disabled state status
}); // End of db/off route definition

app.get('/api/db/status', (req, res) => { // Bind GET route to query active database logging status state
  res.json({ enabled: isDatabaseEnabled }); // Send JSON payload returning current active logging state flag
}); // End of db/status route definition

// History Endpoint with Search
const buildHistoryQuery = (queryParams) => { // Helper to build MongoDB query based on query params
  const { q, ip, country, startTime, endTime } = queryParams;
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

  if ((startTime && startTime !== '') || (endTime && endTime !== '')) {
    query.timestamp = {};
    if (startTime && startTime !== '') {
      const d = new Date(startTime);
      if (!isNaN(d.getTime())) query.timestamp.$gte = d;
    }
    if (endTime && endTime !== '') {
      const d = new Date(endTime);
      if (!isNaN(d.getTime())) query.timestamp.$lte = d;
    }
    if (Object.keys(query.timestamp).length === 0) {
      delete query.timestamp;
    }
  }

  return query;
};

app.get('/api/history', async (req, res) => { // Bind GET route to query historic threat database records
  try { // Start try block to handle query execution safely
    const query = buildHistoryQuery(req.query);
    let limitVal = 200;
    if (req.query.limit) {
      const parsed = parseInt(req.query.limit, 10);
      if (!isNaN(parsed)) {
        limitVal = parsed;
      }
    }

    console.log('[API GET /api/history] Executing MongoDB query:', query, 'with limit:', limitVal);

    let queryExec = ThreatEvent.find(query).sort({ timestamp: -1 }).lean();
    if (limitVal > 0) {
      queryExec = queryExec.limit(limitVal);
    }
    const history = await queryExec;
    
    console.log(`[API GET /api/history] Found and returning ${history.length} records.`);
    res.json(history); // Return results list as a JSON format response payload
  } catch (error) { // Catch database lookup exceptions
    console.error('[API] Error fetching history:', error.message); // Log query failures details
    res.status(500).json({ error: 'Failed to fetch attack history' }); // Return HTTP Internal Server Error payload message
  } // End of try-catch block
}); // End of history route definition

app.get('/api/history/export/csv', async (req, res) => { // Endpoint to stream database records as a CSV download
  try {
    const query = buildHistoryQuery(req.query);
    console.log('[API GET /api/history/export/csv] Streaming CSV export for query:', query);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Threat_History_Report_${new Date().toISOString().slice(0, 10)}.csv"`);
    
    res.write('\uFEFF'); // Write UTF-8 BOM
    res.write('Event ID,Local Time,Threat Type,Attack Vector,Source IP,Source Country,Target IP,Target Country,Intel Source\n');

    const cursor = ThreatEvent.find(query).sort({ timestamp: -1 }).lean().cursor();

    const csvTransform = new Transform({
      writableObjectMode: true,
      transform(e, encoding, callback) {
        try {
          const date = new Date(e.timestamp || Date.now()).toLocaleString();
          const type = (e.a_t || '').toUpperCase();
          const name = `"${String(e.a_n || '').replace(/"/g, '""')}"`;
          const row = [
            e._id.toString(),
            `"${date}"`,
            type,
            name,
            e.s_ip || 'unknown',
            e.s_co || '??',
            e.d_ip || 'unknown',
            e.d_co || '??',
            e.source_api || 'unknown'
          ].join(',');
          this.push(row + '\n');
          callback();
        } catch (err) {
          callback(err);
        }
      }
    });

    pipeline(cursor, csvTransform, res, (err) => {
      if (err) {
        console.error('[API Export CSV] Pipeline failure or cancellation:', err.message);
        if (!res.headersSent) {
          res.status(500).send('Export stream encountered an error');
        } else {
          res.end();
        }
      } else {
        console.log('[API Export CSV] Streaming export finished successfully.');
      }
    });
  } catch (error) {
    console.error('[API Export CSV] Error:', error.message);
    res.status(500).send('Failed to prepare CSV stream');
  }
});

app.get('/api/history/export/json', async (req, res) => { // Endpoint to stream database records as a JSON download
  try {
    const query = buildHistoryQuery(req.query);
    console.log('[API GET /api/history/export/json] Streaming JSON export for query:', query);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Threat_History_Report_${new Date().toISOString().slice(0, 10)}.json"`);

    const cursor = ThreatEvent.find(query).sort({ timestamp: -1 }).lean().cursor();

    let first = true;
    const jsonTransform = new Transform({
      writableObjectMode: true,
      transform(e, encoding, callback) {
        try {
          let prefix = '';
          if (first) {
            prefix = '[\n';
            first = false;
          } else {
            prefix = ',\n';
          }
          this.push(prefix + JSON.stringify(e));
          callback();
        } catch (err) {
          callback(err);
        }
      },
      flush(callback) {
        if (first) {
          this.push('[\n');
        }
        this.push('\n]');
        callback();
      }
    });

    pipeline(cursor, jsonTransform, res, (err) => {
      if (err) {
        console.error('[API Export JSON] Pipeline failure or cancellation:', err.message);
        if (!res.headersSent) {
          res.status(500).send('Export stream encountered an error');
        } else {
          res.end();
        }
      } else {
        console.log('[API Export JSON] Streaming export finished successfully.');
      }
    });
  } catch (error) {
    console.error('[API Export JSON] Error:', error.message);
    res.status(500).send('Failed to prepare JSON stream');
  }
});

// Helper to get analytics match stage
const getAnalyticsMatchStage = (query = {}) => { // Define helper method to build MongoDB aggregation matching stage parameters
  const { type, country, from } = query; // Destructure filters from query input argument
  const matchStage = { // Set initial match properties restricting data search to threat-actor APIs
    source_api: { $in: ['misp-galaxy', 'ransomwatch', 'alienvault'] } 
  }; // End of initial match stage object

  if (type) matchStage.a_t = type; // Append search restriction for attack type category if present
  if (country) matchStage.$or = [{ s_co: country.toUpperCase() }, { d_co: country.toUpperCase() }]; // Append search restriction matching country code if present
  if (from) matchStage.timestamp = { $gte: new Date(from) }; // Append search constraint checking timestamp thresholds if present

  return matchStage; // Return constructed aggregation match stage configuration object
}; // End of getAnalyticsMatchStage definition

// Aggregated Stats Endpoint
app.get('/api/stats', async (req, res) => { // Bind GET route to retrieve database statistics dashboard summaries
  try { // Start try block to execute aggregation pipelines safely
    const matchStage = getAnalyticsMatchStage(req.query); // Resolve MongoDB match constraints using request queries params

    const [typeAgg, originAgg, targetAgg, vectorAgg, sourceAgg, total] = await Promise.all([ // Await execution of multiple database aggregations in parallel
      ThreatEvent.aggregate([ // Aggregation pipeline tracking threat types distribution count
        { $match: matchStage }, // Match records based on current filters
        { $group: { _id: '$a_t', count: { $sum: 1 } } }, // Group matching records by attack type property and sum counts
        { $sort: { count: -1 } } // Sort results in descending order by count magnitude
      ]), // End of type agg pipeline
      ThreatEvent.aggregate([ // Aggregation pipeline tracking origin source country distribution count
        { $match: matchStage }, // Match records based on current filters
        { $group: { _id: '$s_co', count: { $sum: 1 } } }, // Group matching records by source country property and sum counts
        { $sort: { count: -1 } }, // Sort results in descending order by count magnitude
        { $limit: 20 } // Limit country list output results to top 20
      ]), // End of origin agg pipeline
      ThreatEvent.aggregate([ // Aggregation pipeline tracking target destination country distribution count
        { $match: matchStage }, // Match records based on current filters
        { $group: { _id: '$d_co', count: { $sum: 1 } } }, // Group matching records by destination country property and sum counts
        { $sort: { count: -1 } }, // Sort results in descending order by count magnitude
        { $limit: 20 } // Limit country list output results to top 20
      ]), // End of target agg pipeline
      // For IP-only sources, "Vector" will be the organization/owner if available
      ThreatEvent.aggregate([ // Aggregation pipeline tracking threat organization vector count
        { $match: matchStage }, // Match records based on current filters
        { $group: { _id: { $ifNull: ['$meta.organization', '$a_n'] }, count: { $sum: 1 } } }, // Group records by metadata organization or attack name if organization is null, sum counts
        { $sort: { count: -1 } }, // Sort results in descending order by count magnitude
        { $limit: 20 } // Limit organization vector results to top 20 records
      ]), // End of vector agg pipeline
      ThreatEvent.aggregate([ // Aggregation pipeline tracking threat API data source count
        { $match: matchStage }, // Match records based on current filters
        { $group: { _id: '$source_api', count: { $sum: 1 } } }, // Group matching records by source API property and sum counts
        { $sort: { count: -1 } } // Sort results in descending order by count magnitude
      ]), // End of source agg pipeline
      ThreatEvent.countDocuments(matchStage) // Fetch raw total document counts matching filter parameters
    ]); // End of Promise.all lists resolve

    res.json({ // Send JSON payload containing formatted stats mappings
      total, // Mapped total matches count
      byType: Object.fromEntries(typeAgg.map(d => [d._id, d.count])), // Convert type aggregation results list to dictionary map
      byOrigin: Object.fromEntries(originAgg.map(d => [d._id, d.count])), // Convert origin country aggregation list to dictionary map
      byTarget: Object.fromEntries(targetAgg.map(d => [d._id, d.count])), // Convert destination country aggregation list to dictionary map
      byVector: Object.fromEntries(vectorAgg.map(d => [d._id, d.count])), // Convert vector/organization aggregation list to dictionary map
      bySource: Object.fromEntries(sourceAgg.map(d => [d._id, d.count])), // Convert scraper API source aggregation list to dictionary map
    }); // End of JSON response payload dispatch
  } catch (error) { // Catch aggregation process failures
    console.error('[API] Error fetching stats:', error.message); // Log database stats failure details
    res.status(500).json({ error: 'Failed to fetch stats' }); // Return HTTP Internal Server Error payload message
  } // End of try-catch block
}); // End of stats route definition

// Timeline – hourly buckets for last 24 hours
app.get('/api/stats/timeline', async (req, res) => { // Bind GET route to retrieve event count timeline charts details
  try { // Start try block to execute timeline database queries safely
    const since = new Date(Date.now() - 24 * 3600 * 1000); // Calculate date threshold representing exactly 24 hours ago
    const matchStage = getAnalyticsMatchStage({ from: since }); // Generate match filters stages injecting calculated date constraint

    const agg = await ThreatEvent.aggregate([ // Execute aggregation pipeline grouping events into timeline time intervals
      { $match: matchStage }, // Filter target data based on timeline constraints
      { // Group items
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%dT%H:00:00Z', date: '$timestamp' } // Construct group key by formatting timestamps to hourly string representation
          }, // End of _id key mapping
          count: { $sum: 1 } // Sum count of events falling into each hourly slot
        } // End of group logic definition
      }, // End of group pipeline stage
      { $sort: { _id: 1 } } // Sort buckets chronologically ascending by hourly ID key
    ]); // Store aggregation results array
    res.json(agg.map(d => ({ hour: d._id, count: d.count }))); // Return hourly map list as timeline JSON response payload
  } catch (error) { // Catch database aggregation exceptions
    console.error('[API] Error fetching timeline:', error.message); // Log database timeline retrieval error details
    res.status(500).json({ error: 'Failed to fetch timeline' }); // Return HTTP Internal Server Error payload message
  } // End of try-catch block
}); // End of timeline route definition

// ─── Sector mapping utility ──────────────────────────────────────────────────
// Now using the intelligent Enrichment Service for "Real Data" classification.
// Prioritizes enriched real-world sectors (Finance, Healthcare) if found over IP organization.
function estimateSector(event) { // Define helper method to classify industrial sector attributes
  const enriched = getEnrichedSector(event); // Resolve classified sector code using Enrichment Service mapping definitions
  if (enriched && enriched !== 'General / Other') { // If classification returned a specific industry sector name
    return enriched; // Return resolved enriched sector name string
  } // End of validation check
  return event.meta?.organization || enriched; // Fallback to returning organization metadata name if present, otherwise default sector classification
} // End of estimateSector definition


// ─── Analytics: Country Classification ───────────────────────────────────────
app.get('/api/analytics/countries', async (req, res) => { // Bind GET route to retrieve country matrix statistics analysis details
  try { // Start try block to execute country statistics query safely
    const matchStage = getAnalyticsMatchStage(req.query); // Resolve matching filters config object from request queries

    const [origins, targets, typeByCountry] = await Promise.all([ // Await database aggregate operations concurrently
      ThreatEvent.aggregate([ // Query listing top country codes by origin threat count volume
        { $match: matchStage }, // Match filters constraints
        { $group: { _id: '$s_co', count: { $sum: 1 } } }, // Group by source country code and sum counts
        { $sort: { count: -1 } }, // Sort in descending order by volume count
        { $limit: 50 } // Limit results list to top 50 countries
      ]), // End of origins aggregation
      ThreatEvent.aggregate([ // Query listing top country codes by destination target threat volume
        { $match: matchStage }, // Match filters constraints
        { $group: { _id: '$d_co', count: { $sum: 1 } } }, // Group by destination country code and sum counts
        { $sort: { count: -1 } }, // Sort in descending order by volume count
        { $limit: 50 } // Limit results list to top 50 countries
      ]), // End of targets aggregation
      ThreatEvent.aggregate([ // Query grouping attack threat types volume distribution within each country
        { $match: matchStage }, // Match filters constraints
        { $group: {
          _id: { co: '$s_co', type: '$a_t' }, // Group by compound key of country code and attack type
          count: { $sum: 1 } // Sum count metrics
        }}, // End of group mappings
        { $sort: { count: -1 } } // Sort in descending order by count magnitude
      ]) // End of typeByCountry aggregation
    ]); // End of Promise.all resolution list

    // Merge into a single country list
    const countryMap = {}; // Initialize empty dictionary to merge counts for countries
    origins.forEach(d => { // Iterate through each origin threat volume data record
      if (!d._id) return; // Skip if country code is missing
      if (!countryMap[d._id]) countryMap[d._id] = { code: d._id, asOrigin: 0, asTarget: 0, total: 0, topType: null, types: {} }; // Initialize map attributes with defaults
      countryMap[d._id].asOrigin = d.count; // Set source count property
      countryMap[d._id].total += d.count; // Increment aggregated total property
    }); // End of origins loop
    targets.forEach(d => { // Iterate through target volume data records
      if (!d._id) return; // Skip if country code is missing
      if (!countryMap[d._id]) countryMap[d._id] = { code: d._id, asOrigin: 0, asTarget: 0, total: 0, topType: null, types: {} }; // Initialize map attributes with defaults
      countryMap[d._id].asTarget = d.count; // Set destination target count property
      countryMap[d._id].total += d.count; // Increment aggregated total property
    }); // End of targets loop
    typeByCountry.forEach(d => { // Iterate through type breakdown records
      if (!d._id?.co || !countryMap[d._id.co]) return; // Skip if country code attributes are missing in map
      countryMap[d._id.co].types[d._id.type] = (countryMap[d._id.co].types[d._id.type] || 0) + d.count; // Increment specific threat count inside types dictionary
    }); // End of typeByCountry loop
    Object.values(countryMap).forEach(c => { // Iterate through compiled country mapping objects list
      const entries = Object.entries(c.types); // Extract dictionary items list of threat type count attributes
      if (entries.length > 0) { // If country has registered threat categories
        c.topType = entries.sort((a, b) => b[1] - a[1])[0][0]; // Sort list descending by count value and assign top name key to topType
      } // End of entries verify check
    }); // End of countryMap topType checks loop

    const countries = Object.values(countryMap).sort((a, b) => b.total - a.total); // Convert mapping dictionary to array and sort descending by total volume
    const totalGlobal = countries.reduce((s, c) => s + c.total, 0); // Calculate global threats totals volume sum

    res.json({ countries, totalGlobal }); // Return compiled records list as a JSON format response payload
  } catch (error) { // Catch database retrieval errors
    console.error('[API] Error fetching country analytics:', error.message); // Log query failures details
    res.status(500).json({ error: 'Failed to fetch country analytics' }); // Return HTTP Internal Server Error payload message
  } // End of try-catch block
}); // End of countries analytics route definition

// ─── Analytics: Trends ───────────────────────────────────────────────────────
app.get('/api/analytics/trends', async (req, res) => { // Bind GET route to retrieve threat trends timeline metrics
  try { // Start try block to execute aggregation processes safely
    const { period = '24h' } = req.query; // Extract period parameter from query strings, default to '24h'

    let since, dateFormat, bucketLabel; // Initialize configuration variables
    switch (period) { // Evaluate target period parameter string value
      case '7d': // If period parameter equals '7d'
        since = new Date(Date.now() - 7 * 24 * 3600 * 1000); // Calculate date limit threshold representing 7 days ago
        dateFormat = '%Y-%m-%d'; // Set timezone conversion pattern format to group values by day
        bucketLabel = 'day'; // Set bucketLabel string parameter to 'day'
        break; // Exit switch block
      case '30d': // If period parameter equals '30d'
        since = new Date(Date.now() - 30 * 24 * 3600 * 1000); // Calculate date limit threshold representing 30 days ago
        dateFormat = '%Y-%m-%d'; // Set timezone conversion pattern format to group values by day
        bucketLabel = 'day'; // Set bucketLabel string parameter to 'day'
        break; // Exit switch block
      default: // Handle default cases (representing last 24h timeline)
        since = new Date(Date.now() - 24 * 3600 * 1000); // Calculate date limit threshold representing 24 hours ago
        dateFormat = '%Y-%m-%dT%H:00:00Z'; // Set timezone conversion pattern format to group values hourly
        bucketLabel = 'hour'; // Set bucketLabel string parameter to 'hour'
    } // End of period evaluate switch block

    const matchStage = getAnalyticsMatchStage({ ...req.query, from: since }); // Generate match filters configuration object using resolved since parameter

    // Total timeline
    const totalTimeline = await ThreatEvent.aggregate([ // Query total threat volume counts grouped by timeline intervals
      { $match: matchStage }, // Filter target data based on trends filters
      { $group: {
        _id: { $dateToString: { format: dateFormat, date: '$timestamp' } }, // Group values using parsed dateFormat pattern
        count: { $sum: 1 } // Sum count metrics
      }}, // End of group pipeline configuration
      { $sort: { _id: 1 } } // Sort timeline buckets chronologically ascending
    ]); // Store aggregate results list

    // By type timeline
    const typeTimeline = await ThreatEvent.aggregate([ // Query type breakdown counts grouped by timeline intervals
      { $match: matchStage }, // Filter target data based on trends filters
      { $group: {
        _id: {
          bucket: { $dateToString: { format: dateFormat, date: '$timestamp' } }, // Group by time interval bucket key format
          type: '$a_t' // Group by attack type category key
        }, // End of compound group key mapping
        count: { $sum: 1 } // Sum count metrics
      }}, // End of group pipeline configuration
      { $sort: { '_id.bucket': 1 } } // Sort timeline buckets chronologically ascending
    ]); // Store aggregate results list

    // Calculate period comparison
    const prevStart = new Date(since.getTime() - (Date.now() - since.getTime())); // Calculate timestamp boundary representing previous relative offset duration
    const prevMatch = getAnalyticsMatchStage({ ...req.query, from: prevStart }); // Generate matching query limits mapping comparison period
    prevMatch.timestamp.$lt = since; // Bind comparison date upper ceiling timestamp check

    const [currentTotal, previousTotal] = await Promise.all([ // Await document counts for both intervals concurrently
      ThreatEvent.countDocuments(matchStage), // Retrieve current matching documents count total
      ThreatEvent.countDocuments(prevMatch) // Retrieve relative comparative previous documents count total
    ]); // Store results list

    const changePercent = previousTotal > 0 // Calculate percentage value representation of trends variation
      ? Math.round(((currentTotal - previousTotal) / previousTotal) * 100) // Math equation mapping relative difference
      : currentTotal > 0 ? 100 : 0; // Return 100% on new data fallback, otherwise default to 0%

    res.json({ // Send JSON payload containing trend analytics charts data
      period, // Mapped active query period code
      bucketLabel, // Mapped timeline bucket label code
      timeline: totalTimeline.map(d => ({ bucket: d._id, count: d.count })), // Map total timeline results to formatted label object properties list
      byType: typeTimeline.map(d => ({ bucket: d._id.bucket, type: d._id.type, count: d.count })), // Map type timeline results to formatted label properties list
      currentTotal, // Active timeline period counts total
      previousTotal, // Comparative previous period counts total
      changePercent // Mapped percentage trends variance statistic
    }); // End of JSON response dispatch
  } catch (error) { // Catch trend aggregation failures
    console.error('[API] Error fetching trend analytics:', error.message); // Log trend calculation failure details
    res.status(500).json({ error: 'Failed to fetch trend analytics' }); // Return HTTP Internal Server Error payload message
  } // End of try-catch block
}); // End of trends analytics route definition

// ─── Analytics: Sectors (now Organizations for IP-only) ────────────────────────────
app.get('/api/analytics/sectors', async (req, res) => { // Bind GET route to retrieve industrial sector distribution metrics
  try { // Start try block to query threat records safely
    const matchStage = getAnalyticsMatchStage(req.query); // Resolve active aggregation matching filters from request queries

    // Fetch raw events (limited) to classify by organization
    const events = await ThreatEvent.find(matchStage) // Fetch raw documents matching current filters list
      .sort({ timestamp: -1 }) // Sort documents in descending order (newest first)
      .limit(5000) // Limit extraction batch size to 5000 items to balance performance
      .lean(); // Return plain javascript objects array to bypass models overhead

    const sectorCounts = {}; // Initialize empty dictionary mapping sector names to totals
    const sectorTypes = {};  // Initialize empty dictionary mapping sector names to specific threat categories totals

    events.forEach(ev => { // Loop through each fetched threat document record
      const sector = estimateSector(ev); // Classify sector name attribute using classification helper function
      sectorCounts[sector] = (sectorCounts[sector] || 0) + 1; // Increment sector count tally matching resolved classification
      if (!sectorTypes[sector]) sectorTypes[sector] = { exploit: 0, malware: 0, phishing: 0 }; // Initialize empty category mapping attributes on first access
      if (ev.a_t && sectorTypes[sector][ev.a_t] !== undefined) { // If document contains category field mapping initialized attribute
        sectorTypes[sector][ev.a_t]++; // Increment category count inside sector breakdown dictionary
      } // End of category validation check
    }); // End of events loop

    const sectors = Object.entries(sectorCounts) // Convert sector counts mapping dictionary to array
      .map(([name, count]) => ({ // Map array entries to structured object mappings
        name, // Sector label name string
        count, // Aggregated occurrence count total
        percentage: events.length > 0 ? ((count / events.length) * 100).toFixed(1) : '0', // Calculate percentage representation format
        topTypes: sectorTypes[name] || {} // Attach threat types categories breakdown
      })) // End of array mapping logic
      .sort((a, b) => b.count - a.count); // Sort sectors list in descending order by occurrence count volume

    res.json({ // Send JSON payload containing sector statistics
      sectors, // Mapped sectors array list
      totalAnalyzed: events.length, // Total number of processed records details
      note: 'Analytics powered by MISP Galaxy intelligence. Categories represent identified industry sectors.' // Mapped attribution footnote string
    }); // End of JSON response dispatch
  } catch (error) { // Catch sector stats calculation failures
    console.error('[API] Error fetching sector analytics:', error.message); // Log sector query failure details
    res.status(500).json({ error: 'Failed to fetch sector analytics' }); // Return HTTP Internal Server Error payload message
  } // End of try-catch block
}); // End of sectors analytics route definition

// ─── Analytics: Combined (Country × Organization) ─────────────────────────────────
app.get('/api/analytics/combined', async (req, res) => { // Bind GET route to query joint country and sector threat mapping matrix details
  try { // Start try block to execute query safely
    const { sector } = req.query; // Extract target sector filter parameter from query string parameters list
    const matchStage = getAnalyticsMatchStage(req.query); // Resolve active aggregation matching filters from request queries

    const events = await ThreatEvent.find(matchStage) // Fetch threat documents matching query filter parameters
      .sort({ timestamp: -1 }) // Sort documents descending chronologically
      .limit(5000) // Limit extraction batch size to 5000 items
      .lean(); // Return plain javascript objects array to bypass document models overhead

    // Build country×sector matrix
    const matrix = {}; // Initialize empty matrix map dictionary { countryCode: { sectorName: count } }
    const sectorTotals = {}; // Initialize empty mapping map to track sector totals volume
    const countryTotals = {}; // Initialize empty mapping map to track country totals volume

    events.forEach(ev => { // Loop through each extracted threat document record
      const s = estimateSector(ev); // Classify sector name attribute using classification helper function
      // Filter by sector if specified
      if (sector && s !== sector) return; // Skip item if a target sector filter is active and does not match resolved sector name

      const countries = [ev.s_co, ev.d_co].filter(Boolean); // Extract non-empty country codes properties list
      countries.forEach(co => { // Iterate through each resolved country code string
        if (!matrix[co]) matrix[co] = {}; // Initialize empty sector mapping nested dictionary for country code on first access
        matrix[co][s] = (matrix[co][s] || 0) + 1; // Increment sector threat count for country key mapping
        sectorTotals[s] = (sectorTotals[s] || 0) + 1; // Increment global count totals matching sector key
        countryTotals[co] = (countryTotals[co] || 0) + 1; // Increment global count totals matching country code key
      }); // End of countries loop
    }); // End of events loop

    // If a country is selected, return sector breakdown
    // If a sector is selected, return country breakdown
    // Otherwise return the full matrix for top entries
    const topCountries = Object.entries(countryTotals) // Convert country totals dictionary to list
      .sort((a, b) => b[1] - a[1]) // Sort countries list descending by threat count volume
      .slice(0, 20) // Slice top 20 countries
      .map(([code, total]) => ({ // Map entries to structured object mappings
        code, // Country ISO code string
        total, // Total aggregated occurrences count
        sectors: matrix[code] || {} // Mapped sector metrics inside country code nested dictionary
      })); // End of array mapping definition

    const topSectors = Object.entries(sectorTotals) // Convert sector totals dictionary to list
      .sort((a, b) => b[1] - a[1]) // Sort list descending by volume
      .map(([name, total]) => ({ name, total })); // Map to simple array containing name and total count properties

    res.json({ // Send JSON payload containing combined analytics matrix
      countries: topCountries, // Mapped top countries array list
      sectors: topSectors, // Mapped top sectors array list
      totalAnalyzed: events.length, // Mapped count of analyzed documents
      note: 'Country and Sector breakdown of attacks.' // Footnote caption
    }); // End of JSON response dispatch
  } catch (error) { // Catch matrix calculation failures
    console.error('[API] Error fetching combined analytics:', error.message); // Log combined stats query failures details
    res.status(500).json({ error: 'Failed to fetch combined analytics' }); // Return HTTP Internal Server Error payload message
  } // End of try-catch block
}); // End of combined analytics route definition

// ─── MISP Galaxy API Endpoints ────────────────────────────────────────────────

// Galaxy: All Threat Actors
app.get('/api/galaxy/actors', (req, res) => { // Bind GET route to retrieve threat actors profile collection from cached galaxy metrics
  const { country, search } = req.query; // Extract country filter and search string query parameters
  const data = getGalaxyData(); // Access global cache reference
  let actors = data.threatActors || []; // Assign threat actors array reference defaulting to empty array list

  if (country) { // If a country code filter is specified
    actors = actors.filter(a => { // Filter actors list based on origin country criteria
      const cc = (a.meta?.country || '').toUpperCase(); // Extract country field value from metadata, convert to uppercase
      return cc === country.toUpperCase(); // Validate country matches requested target code uppercase string
    }); // End of country filter block
  } // End of country check
  if (search) { // If a search query string is specified
    const q = search.toLowerCase(); // Cast query search string to lowercase
    actors = actors.filter(a => // Filter actors list based on text search criteria
      (a.value || '').toLowerCase().includes(q) || // Match query string against actor name string
      (a.description || '').toLowerCase().includes(q) || // Match query string against actor description summary details
      (a.meta?.synonyms || []).some(s => s.toLowerCase().includes(q)) // Check if query matches any alias synonmys string
    ); // End of search filter block
  } // End of search check

  const mapped = actors.map(a => ({ // Map filtered entities to clean UI objects representation list
    name: a.value, // Canonical threat actor name value
    uuid: a.uuid, // Canonical registry UUID
    description: (a.description || '').slice(0, 500), // Mapped description summary text slice up to 500 characters
    country: a.meta?.country || null, // Origin country attribute or null fallback
    stateSponsor: a.meta?.['cfr-suspected-state-sponsor'] || null, // State sponsor attribute or null fallback
    victims: a.meta?.['cfr-suspected-victims'] || [], // Targeted victims list array
    targetSectors: a.meta?.['cfr-target-category'] || a.meta?.['targeted-sector'] || [], // Mapped target industrial sector strings
    incidentType: a.meta?.['cfr-type-of-incident'] || null, // Historical incident type taxonomy
    synonyms: a.meta?.synonyms || [], // Mapped alias synonyms list
    refs: (a.meta?.refs || []).slice(0, 5), // Reference links list slice limited to top 5
  })); // End of mapping logic definition

  res.json({ total: mapped.length, actors: mapped }); // Send actors JSON payload response returning list and total counts
}); // End of actors route definition

// Galaxy: Ransomware Families
app.get('/api/galaxy/ransomware', (req, res) => { // Bind GET route to retrieve ransomware profiles collection from cached galaxy metrics
  const { search } = req.query; // Extract search string query parameter
  const data = getGalaxyData(); // Access global cache reference
  let rw = data.ransomware || []; // Assign ransomware array reference defaulting to empty array list

  if (search) { // If a search query string is specified
    const q = search.toLowerCase(); // Cast query search string to lowercase
    rw = rw.filter(r => // Filter ransomware list based on search criteria
      (r.value || '').toLowerCase().includes(q) || // Match query string against ransomware family name value
      (r.description || '').toLowerCase().includes(q) || // Match query string against ransomware profile details
      (r.meta?.synonyms || []).some(s => s.toLowerCase().includes(q)) // Check if query matches any alias synonyms string
    ); // End of search filter block
  } // End of search check

  const mapped = rw.map(r => ({ // Map filtered entities to clean UI objects representation list
    name: r.value, // Canonical ransomware gang name value
    uuid: r.uuid, // Canonical registry UUID
    description: (r.description || '').slice(0, 500), // Mapped profile description text slice up to 500 characters
    synonyms: r.meta?.synonyms || [], // Mapped synonyms array list
    refs: (r.meta?.refs || []).slice(0, 5), // Reference links list slice limited to top 5
    encryption: r.meta?.encryption || null, // Target encryption details or null fallback
    extensions: r.meta?.extensions || null, // Appended encryption extension string or null fallback
    ransomnotes: r.meta?.ransomnotes || null, // Ransom note filename string or null fallback
  })); // End of mapping logic definition

  res.json({ total: mapped.length, ransomware: mapped }); // Send ransomware JSON payload response returning list and total counts
}); // End of ransomware route definition

// Galaxy: Adversary Tools
app.get('/api/galaxy/tools', (req, res) => { // Bind GET route to retrieve adversary tools profiles from cached galaxy metrics
  const { search } = req.query; // Extract search string query parameter
  const data = getGalaxyData(); // Access global cache reference
  let tools = data.tools || []; // Assign tools array reference defaulting to empty array list

  if (search) { // If a search query string is specified
    const q = search.toLowerCase(); // Cast query search string to lowercase
    tools = tools.filter(t => // Filter tools list based on search criteria
      (t.value || '').toLowerCase().includes(q) || // Match query string against tool name value
      (t.description || '').toLowerCase().includes(q) || // Match query string against tool profile description details
      (t.meta?.synonyms || []).some(s => s.toLowerCase().includes(q)) // Check if query matches any alias synonyms string
    ); // End of search filter block
  } // End of search check

  const mapped = tools.map(t => ({ // Map filtered entities to clean UI objects representation list
    name: t.value, // Canonical tool name value
    uuid: t.uuid, // Canonical registry UUID
    description: (t.description || '').slice(0, 500), // Mapped description text slice up to 500 characters
    synonyms: t.meta?.synonyms || [], // Mapped synonyms array list
    refs: (t.meta?.refs || []).slice(0, 5), // Reference links list slice limited to top 5
    type: t.meta?.type || [], // Target tool category classifications array list
  })); // End of mapping logic definition

  res.json({ total: mapped.length, tools: mapped }); // Send tools JSON payload response returning list and total counts
}); // End of tools route definition

// Galaxy: Aggregate Statistics
app.get('/api/galaxy/stats', (req, res) => { // Bind GET route to retrieve cached galaxy metrics overall summaries
  const data = getGalaxyData(); // Access global cache reference
  const actors = data.threatActors || []; // Assign threat actors list reference defaulting to empty array

  // By country of origin
  const byCountry = {}; // Initialize empty mapping map to count actors by origin country code
  actors.forEach(a => { // Loop through threat actors entities
    const cc = (a.meta?.country || '').toUpperCase(); // Extract country field value, convert to uppercase
    if (cc) byCountry[cc] = (byCountry[cc] || 0) + 1; // Increment country count tally if country code is defined
  }); // End of country counts loop

  // By target sector
  const bySector = {}; // Initialize empty mapping map to count actors by targeted sector
  actors.forEach(a => { // Loop through threat actors entities
    const sectors = a.meta?.['cfr-target-category'] || a.meta?.['targeted-sector'] || []; // Extract targeted sectors list or default to empty list
    sectors.forEach(s => { bySector[s] = (bySector[s] || 0) + 1; }); // Loop through sector strings and increment counts in sector stats dictionary
  }); // End of sector counts loop

  // By incident type
  const byIncident = {}; // Initialize empty mapping map to count actors by incident type category
  actors.forEach(a => { // Loop through threat actors entities
    const t = a.meta?.['cfr-type-of-incident'] || 'Unknown'; // Extract incident type description or default to Unknown string
    byIncident[t] = (byIncident[t] || 0) + 1; // Increment incident count tally matching type description key
  }); // End of incident counts loop

  // Most targeted countries
  const byVictim = {}; // Initialize empty mapping map to count actors targeting specific victim countries
  actors.forEach(a => { // Loop through threat actors entities
    (a.meta?.['cfr-suspected-victims'] || []).forEach(v => { // Loop through suspected victims names list
      byVictim[v] = (byVictim[v] || 0) + 1; // Increment victim country count tally matching victim name key
    }); // End of victims names list loop
  }); // End of victim counts loop

  res.json({ // Send JSON payload containing overall galaxy cache summaries
    totalActors: actors.length, // Mapped total threat actors count
    totalRansomware: (data.ransomware || []).length, // Mapped total ransomware families count
    totalTools: (data.tools || []).length, // Mapped total adversary tools count
    totalExploitKits: (data.exploitKits || []).length, // Mapped total exploit kits count
    byCountry, // Country distribution statistics mapping
    bySector, // Targeted sectors distribution statistics mapping
    byIncident, // Incident types distribution statistics mapping
    byVictim, // Victim targets distribution statistics mapping
    lastFetch: data.lastFetch, // Last successful cache update timestamp details
  }); // End of JSON response dispatch
}); // End of stats route definition

// Start Scraping Services
startCheckpoint((ev, data) => broadcast(ev, data, 'checkpoint')); // Start Checkpoint live scraper pass broadcast callback binding checkpoint origin tag
startMispGalaxy((ev, data) => broadcast(ev, data, 'misp-galaxy')); // Start MISP Galaxy scraper pass broadcast callback binding misp-galaxy origin tag
startUrlhaus((ev, data) => broadcast(ev, data, 'urlhaus')); // Start URLhaus live scraper pass broadcast callback binding urlhaus origin tag
startAlienVault((ev, data) => broadcast(ev, data, 'alienvault')); // Start AlienVault live scraper pass broadcast callback binding alienvault origin tag
startRansomWatch((ev, data) => broadcast(ev, data, 'ransomwatch')); // Start Ransomwatch dark web scraper pass broadcast callback binding ransomwatch origin tag
startC2Tracker((ev, data) => broadcast(ev, data, 'c2tracker')); // Start C2Tracker scraper pass broadcast callback binding c2tracker origin tag
startBitdefender((ev, data) => broadcast(ev, data, 'bitdefender')); // Start Bitdefender live socket scraper pass broadcast callback binding bitdefender tag
startFortinet((ev, data) => broadcast(ev, data, 'fortinet')); // Start Fortinet live outbreak scraper pass broadcast callback binding fortinet tag
startKaspersky((ev, data) => broadcast(ev, data, 'kaspersky')); // Start Kaspersky botnet scraper pass broadcast callback binding kaspersky tag

app.listen(PORT, () => { // Bind Express server HTTP listening port listener
  console.log(`[Server] SSE Backend listening on http://localhost:${PORT}`); // Log successful HTTP listening server message
}); // End of app.listen definition
