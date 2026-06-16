const axios = require('axios'); // Import Axios library to perform network queries for cluster feeds
const geoip = require('geoip-lite'); // Import geoip-lite library for physical location mapping capabilities

/**
 * MISP Galaxy Scraper
 *
 * Fetches curated threat intelligence from the MISP Galaxy open-source
 * knowledge base (GitHub). Generates data-driven threat events based on
 * real APT group profiles, ransomware families, and adversary tools.
 *
 * Data source: https://github.com/MISP/misp-galaxy
 */

const GALAXY_BASE = 'https://raw.githubusercontent.com/MISP/misp-galaxy/main/clusters'; // Define root repository path URL for raw cluster files

const CLUSTER_URLS = { // Define dictionary object containing raw content links for each galaxy category
  threatActors: `${GALAXY_BASE}/threat-actor.json`, // Path to raw threat actor JSON profile clusters
  ransomware:   `${GALAXY_BASE}/ransomware.json`, // Path to raw ransomware cluster definitions
  tools:        `${GALAXY_BASE}/tool.json`, // Path to raw adversary tools taxonomy
  exploitKits:  `${GALAXY_BASE}/exploit-kit.json`, // Path to raw exploit kits details
  sectors:      `${GALAXY_BASE}/sector.json`, // Path to raw industrial/targeted sectors taxonomy
}; // End of CLUSTER_URLS dictionary definition

// Country code → approximate lat/lon for event generation
const COUNTRY_COORDS = { // Define coordinate dictionary mapping country codes to central coordinates
  CN: { lat: 35.86, lon: 104.20 }, US: { lat: 37.09, lon: -95.71 }, // China and USA coordinates mapping
  RU: { lat: 61.52, lon: 105.32 }, IR: { lat: 32.43, lon: 53.69 }, // Russia and Iran coordinates mapping
  KP: { lat: 40.34, lon: 127.51 }, KR: { lat: 35.91, lon: 127.77 }, // North Korea and South Korea coordinates mapping
  IL: { lat: 31.05, lon: 34.85 }, IN: { lat: 20.59, lon: 78.96 }, // Israel and India coordinates mapping
  PK: { lat: 30.38, lon: 69.35 }, TR: { lat: 38.96, lon: 35.24 }, // Pakistan and Turkey coordinates mapping
  UA: { lat: 48.38, lon: 31.17 }, VN: { lat: 14.06, lon: 108.28 }, // Ukraine and Vietnam coordinates mapping
  GB: { lat: 55.38, lon: -3.44 }, DE: { lat: 51.17, lon: 10.45 }, // UK and Germany coordinates mapping
  FR: { lat: 46.23, lon: 2.21  }, JP: { lat: 36.20, lon: 138.25 }, // France and Japan coordinates mapping
  SA: { lat: 23.89, lon: 45.08 }, AE: { lat: 23.42, lon: 53.85 }, // Saudi Arabia and UAE coordinates mapping
  AU: { lat: -25.27, lon: 133.78 }, BR: { lat: -14.24, lon: -51.93 }, // Australia and Brazil coordinates mapping
  NL: { lat: 52.13, lon: 5.29 }, SE: { lat: 60.13, lon: 18.64 }, // Netherlands and Sweden coordinates mapping
  PL: { lat: 51.92, lon: 19.15 }, EG: { lat: 26.82, lon: 30.80 }, // Poland and Egypt coordinates mapping
  NG: { lat:  9.08, lon:  8.68 }, TW: { lat: 23.70, lon: 120.96 }, // Nigeria and Taiwan coordinates mapping
  SG: { lat:  1.35, lon: 103.82 }, MY: { lat:  4.21, lon: 101.98 }, // Singapore and Malaysia coordinates mapping
  TH: { lat: 15.87, lon: 100.99 }, PH: { lat: 12.88, lon: 121.77 }, // Thailand and Philippines coordinates mapping
  ID: { lat: -0.79, lon: 113.92 }, CA: { lat: 56.13, lon: -106.35 }, // Indonesia and Canada coordinates mapping
  IT: { lat: 41.87, lon: 12.57 }, ES: { lat: 40.46, lon: -3.75 }, // Italy and Spain coordinates mapping
}; // End of COUNTRY_COORDS coordinate dictionary definition

// Country name → CC mapping for Galaxy data
const COUNTRY_NAME_TO_CC = { // Define dictionary mapping full country names to standard two-letter ISO codes
  'china': 'CN', 'united states': 'US', 'russia': 'RU', 'iran': 'IR', // China, US, Russia, Iran mappings
  'north korea': 'KP', 'korea (republic of)': 'KR', 'south korea': 'KR', // North Korea, South Korea mappings
  'israel': 'IL', 'india': 'IN', 'pakistan': 'PK', 'turkey': 'TR', // Israel, India, Pakistan, Turkey mappings
  'ukraine': 'UA', 'vietnam': 'VN', 'united kingdom': 'GB', 'germany': 'DE', // Ukraine, Vietnam, UK, Germany mappings
  'france': 'FR', 'japan': 'JP', 'saudi arabia': 'SA', 'taiwan': 'TW', // France, Japan, Saudi Arabia, Taiwan mappings
  'singapore': 'SG', 'australia': 'AU', 'brazil': 'BR', 'netherlands': 'NL', // Singapore, Australia, Brazil, Netherlands mappings
  'canada': 'CA', 'italy': 'IT', 'spain': 'ES', 'philippines': 'PH', // Canada, Italy, Spain, Philippines mappings
  'indonesia': 'ID', 'thailand': 'TH', 'malaysia': 'MY', 'nigeria': 'NG', // Indonesia, Thailand, Malaysia, Nigeria mappings
  'egypt': 'EG', 'poland': 'PL', 'sweden': 'SE', // Egypt, Poland, Sweden mappings
  'united arab emirates': 'AE', 'hong kong': 'HK', // UAE, Hong Kong mappings
}; // End of COUNTRY_NAME_TO_CC dictionary definition

// ─── In-memory Galaxy Cache ───────────────────────────────────────────────
let galaxyCache = { // Initialize global cache storage object for parsed clusters data
  threatActors: [], // Array for threat actors elements
  ransomware: [], // Array for ransomware elements
  tools: [], // Array for tools elements
  exploitKits: [], // Array for exploit kits elements
  sectors: [], // Array for sectors elements
  lastFetch: null, // Holds timestamp representing the last successful update operation
}; // End of galaxyCache definition

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // Define cache expiration time limit of 6 hours in milliseconds

/**
 * Fetch and parse a single MISP Galaxy cluster from GitHub
 */
async function fetchCluster(url) { // Define async function to fetch a single raw cluster json file from GitHub
  try { // Start try block to handle fetch queries safely
    const res = await axios.get(url, { timeout: 30000 }); // Perform HTTP GET request with 30s timeout limit
    return res.data?.values || []; // Return array values nested inside response data or fallback to empty array
  } catch (err) { // Catch fetch failure exceptions
    console.error(`[MISP Galaxy] Failed to fetch ${url}:`, err.message); // Log connection errors
    return []; // Return empty array fallback on failure
  } // End of try-catch block
} // End of fetchCluster definition

/**
 * Refresh entire Galaxy cache
 */
async function refreshGalaxyCache() { // Define async function to update cache collections for all clusters
  console.log('[MISP Galaxy] Refreshing cluster cache from GitHub...'); // Log update start message

  const [threatActors, ransomware, tools, exploitKits, sectors] = await Promise.all([ // Await resolution of all five cluster fetch calls concurrently
    fetchCluster(CLUSTER_URLS.threatActors), // Fetch threat actors cluster payload
    fetchCluster(CLUSTER_URLS.ransomware), // Fetch ransomware cluster payload
    fetchCluster(CLUSTER_URLS.tools), // Fetch tools cluster payload
    fetchCluster(CLUSTER_URLS.exploitKits), // Fetch exploit kits cluster payload
    fetchCluster(CLUSTER_URLS.sectors), // Fetch sectors cluster payload
  ]); // End of Promise.all resolution list

  galaxyCache = { // Overwrite global cache object with fresh fetched lists
    threatActors, // Assign actors list
    ransomware, // Assign ransomware list
    tools, // Assign tools list
    exploitKits, // Assign exploit kits list
    sectors, // Assign sectors list
    lastFetch: Date.now(), // Store current timestamp as last successful updates marker
  }; // End of cache overwrite mapping

  console.log(`[MISP Galaxy] Cache loaded: ${threatActors.length} actors, ${ransomware.length} ransomware, ${tools.length} tools, ${exploitKits.length} exploit kits, ${sectors.length} sectors`); // Log cache refresh statistics
} // End of refreshGalaxyCache definition

/**
 * Public accessor for Galaxy data (used by API endpoints)
 */
function getGalaxyData() { // Define reader helper function for API endpoints to retrieve current cache state
  return galaxyCache; // Return reference to cached data object
} // End of getGalaxyData definition

/**
 * Resolve country code from Galaxy actor metadata
 */
function resolveCountryCode(actor) { // Define helper function to extract country codes from actor entries
  // Direct country field (2-letter code)
  if (actor.meta?.country) {
    const country = actor.meta.country;
    if (Array.isArray(country)) {
      return country[0] ? String(country[0]).toUpperCase() : null;
    }
    return String(country).toUpperCase();
  }
  // State sponsor field (full name)
  let sponsor = actor.meta?.['cfr-suspected-state-sponsor'];
  if (sponsor) {
    if (Array.isArray(sponsor)) {
      sponsor = sponsor[0] || '';
    }
    if (typeof sponsor === 'string') {
      const cc = COUNTRY_NAME_TO_CC[sponsor.toLowerCase()];
      if (cc) return cc;
    }
  }
  return null;
} // End of resolveCountryCode definition

/**
 * Get victim country codes from actor metadata
 */
function resolveVictimCountries(actor) { // Define helper function to extract targeted victim countries from actor metadata
  let victims = actor.meta?.['cfr-suspected-victims'] || [];
  if (!Array.isArray(victims)) {
    victims = [victims];
  }
  return victims
    .map(v => typeof v === 'string' ? COUNTRY_NAME_TO_CC[v.toLowerCase()] : null)
    .filter(Boolean);
} // End of resolveVictimCountries definition

/**
 * Resolve attack type from actor metadata
 */
function resolveAttackType(actor) { // Define helper to select threat category based on incident history descriptions
  let incident = actor.meta?.['cfr-type-of-incident'] || '';
  if (Array.isArray(incident)) {
    incident = incident.join(' ');
  } else if (typeof incident !== 'string') {
    incident = String(incident);
  }
  incident = incident.toLowerCase();

  if (incident.includes('espionage')) return 'exploit';
  if (incident.includes('sabotage') || incident.includes('destruct')) return 'malware';

  const desc = (actor.description || '').toLowerCase(); // Read actor description string, default to empty, convert to lowercase
  if (desc.includes('ransomware') || desc.includes('wiper')) return 'malware'; // Map ransomware/wiper keywords to malware category
  if (desc.includes('phish') || desc.includes('spear-phish')) return 'phishing'; // Map phishing/spear-phishing keywords to phishing category
  if (desc.includes('espionage') || desc.includes('exploit') || desc.includes('apt')) return 'exploit'; // Map espionage/exploit keywords to exploit category

  return ['exploit', 'malware', 'phishing'][Math.floor(Math.random() * 3)]; // If no keywords matched, return a randomly selected threat type category
} // End of resolveAttackType definition

/**
 * Build a jittered coordinate from a country code
 */
function jitterCoord(cc) { // Define helper function to generate jittered coordinates around country centers
  const base = COUNTRY_COORDS[cc]; // Look up base central coordinates for country code
  if (!base) return null; // Return null if country code coordinates are missing from mapping dictionary
  return { // Return coordinate object
    lat: base.lat + (Math.random() - 0.5) * 4, // Jitter latitude value within +/- 2 degrees range
    lon: base.lon + (Math.random() - 0.5) * 4, // Jitter longitude value within +/- 2 degrees range
  }; // End of returned object definition
} // End of jitterCoord definition

/**
 * Generate a single threat event from a Galaxy threat actor
 */
function generateActorEvent(actor) { // Define generator function mapping an actor entry to a threat event object
  const originCC = resolveCountryCode(actor); // Determine country code of the attacker origin
  if (!originCC) return null; // Skip if origin country cannot be resolved

  const victimCCs = resolveVictimCountries(actor); // Determine list of victim country codes
  const targetCC = victimCCs.length > 0 // Select target country code
    ? victimCCs[Math.floor(Math.random() * victimCCs.length)] // Pick randomized country from resolved victims list
    : Object.keys(COUNTRY_COORDS)[Math.floor(Math.random() * Object.keys(COUNTRY_COORDS).length)]; // Fallback to randomized code from coordinates dictionary

  const origin = jitterCoord(originCC); // Generate jittered origin coordinates matching source country code
  const target = jitterCoord(targetCC); // Generate jittered target coordinates matching target country code
  if (!origin || !target) return null; // Skip if coordinates generation failed for either end

  const attackType = resolveAttackType(actor); // Resolve event threat category based on actor metrics
  const synonyms = actor.meta?.synonyms || []; // Extract synonyms list, default to empty array
  const sectors = actor.meta?.['cfr-target-category'] || actor.meta?.['targeted-sector'] || []; // Extract targeted sectors
  const incidentType = actor.meta?.['cfr-type-of-incident'] || 'Unknown'; // Extract incident type description, default to Unknown

  return { // Return formatted ThreatEvent object
    a_c: 1, // Set attack count defaults to 1 occurrence
    a_n: `[MISP Galaxy] ${actor.value}${synonyms.length > 0 ? ` (${synonyms[0]})` : ''}`, // Construct descriptive name showing primary alias
    a_t: attackType, // Assign resolved threat category slug
    s_ip: 'galaxy-intel', // Set source IP moniker indicating static threat intel feed origin
    s_co: originCC, // Assign source country code
    s_la: origin.lat, // Assign source latitude coordinate
    s_lo: origin.lon, // Assign source longitude coordinate
    d_co: targetCC, // Assign destination target country code
    d_la: target.lat, // Assign destination latitude coordinate
    d_lo: target.lon, // Assign destination longitude coordinate
    meta: { // Populate detailed threat intelligence metadata parameters
      galaxy_source: 'threat-actor', // Trace tag identifying galaxy entity type
      galaxy_actor: actor.value, // Entity canonical value
      galaxy_uuid: actor.uuid, // Entity registry UUID
      galaxy_synonyms: synonyms.slice(0, 5), // Slice top 5 synonyms for metadata storage
      galaxy_description: (actor.description || '').slice(0, 300), // Slice top 300 characters of descriptive profile summary
      galaxy_target_sectors: sectors, // Mapped target sector indicators
      galaxy_incident_type: incidentType, // Category string for incident types
      galaxy_victims: (actor.meta?.['cfr-suspected-victims'] || []).slice(0, 10), // Mapped victim entities list slice
      galaxy_refs: (actor.meta?.refs || []).slice(0, 3), // Reference links list slice
      galaxy_state_sponsor: actor.meta?.['cfr-suspected-state-sponsor'] || null, // Suspected state sponsor attribute
      organization: actor.value, // Set organization profile field mapping to actor name
    } // End of meta property definition
  }; // End of threat event object mapping
} // End of generateActorEvent definition

/**
 * Generate a single threat event from a Galaxy ransomware entry
 */
function generateRansomwareEvent(rw) { // Define generator function mapping ransomware cluster to a threat event
  const targetCCs = Object.keys(COUNTRY_COORDS); // Extract array of key country codes from coordinate mappings dictionary
  const targetCC = targetCCs[Math.floor(Math.random() * targetCCs.length)]; // Select target country code randomly
  const target = jitterCoord(targetCC); // Generate target coordinate metrics mapping target code
  if (!target) return null; // Skip if destination target coordinates fail validation check

  // Ransomware origin is typically obscured; pick common origins
  const origins = ['RU', 'CN', 'KP', 'IR', 'UA']; // Define static list of Eastern Europe / Asia ransomware hubs
  const originCC = origins[Math.floor(Math.random() * origins.length)]; // Select origin country code randomly from list
  const origin = jitterCoord(originCC); // Generate origin coordinates matching selected code
  if (!origin) return null; // Skip if source coordinates fail validation check

  return { // Return formatted ThreatEvent object
    a_c: 1, // Set attack count defaults to 1 occurrence
    a_n: `[MISP Galaxy] Ransomware: ${rw.value}`, // Construct descriptive name showing ransomware family name value
    a_t: 'malware', // Hardcode type category to malware for ransomware indicators
    s_ip: 'galaxy-intel', // Set source IP moniker indicating static threat intel feed origin
    s_co: originCC, // Assign source country code
    s_la: origin.lat, // Assign source latitude coordinate
    s_lo: origin.lon, // Assign source longitude coordinate
    d_co: targetCC, // Assign destination country code
    d_la: target.lat, // Assign destination latitude coordinate
    d_lo: target.lon, // Assign destination longitude coordinate
    meta: { // Populate detailed metadata tracking variables
      galaxy_source: 'ransomware', // Trace tag identifying galaxy entity type
      galaxy_actor: rw.value, // Entity canonical value
      galaxy_uuid: rw.uuid, // Entity registry UUID
      galaxy_synonyms: (rw.meta?.synonyms || []).slice(0, 5), // Mapped synonyms array list slice
      galaxy_description: (rw.description || '').slice(0, 300), // Mapped description text slice
      galaxy_refs: (rw.meta?.refs || []).slice(0, 3), // Reference links list slice
      malware_family: rw.value, // Malware family metadata string
      organization: rw.value, // Mapped target sector organization mapping value
    } // End of meta property definition
  }; // End of mapped object structure definition
} // End of generateRansomwareEvent definition

/**
 * Main scraper loop
 */
async function startMispGalaxy(broadcast) { // Define orchestrator function to handle cache update schedules and event triggers
  console.log('[MISP Galaxy] Scraper started. Intelligence-driven event generation.'); // Log misp-galaxy start message

  // Initial fetch
  await refreshGalaxyCache(); // Execute initial cache download cycle on startup

  // Periodic cache refresh
  setInterval(refreshGalaxyCache, CACHE_TTL_MS); // Bind recurring schedule to refresh cache list every 6 hours

  // Generate events every 20 seconds from the cached Galaxy data
  const emitEvents = () => { // Define inner wrapper function to emit events derived from cache list
    const { threatActors, ransomware } = galaxyCache; // Destructure actors and ransomware arrays from cached galaxy metrics
    if (threatActors.length === 0 && ransomware.length === 0) return; // Terminate cycle if cache database is currently empty

    let emitted = 0; // Initialize tracker count of events successfully generated in this loop cycle

    // Emit 3-5 threat actor events per cycle
    const actorCount = 3 + Math.floor(Math.random() * 3); // Calculate random actor count limit ranging between 3 and 5 entries
    for (let i = 0; i < actorCount && threatActors.length > 0; i++) { // Loop to generate events up to calculated limit
      // Prefer actors with country attribution for richer data
      const attributed = threatActors.filter(a => resolveCountryCode(a)); // Filter cache to get actors with resolved origin country codes
      const pool = attributed.length > 0 ? attributed : threatActors; // Use filtered list pool if populated, fallback to main list pool
      const actor = pool[Math.floor(Math.random() * pool.length)]; // Extract a randomized actor entry from pool list
      const event = generateActorEvent(actor); // Convert raw actor profile metadata entry to threat event structure
      if (event) { // If threat event generation is successful
        broadcast('attack', event, 'misp-galaxy'); // Invoke broadcast helper passing attack event details and scraper signature
        emitted++; // Increment successfully processed event counter
      } // End of event check block
    } // End of threat actors generation loop

    // Emit 1-2 ransomware events per cycle
    const rwCount = 1 + Math.floor(Math.random() * 2); // Calculate random ransomware count limit ranging between 1 and 2 entries
    for (let i = 0; i < rwCount && ransomware.length > 0; i++) { // Loop to generate events up to calculated limit
      const rw = ransomware[Math.floor(Math.random() * ransomware.length)]; // Extract randomized ransomware entry from cache list
      const event = generateRansomwareEvent(rw); // Convert raw ransomware entry metadata to threat event structure
      if (event) { // If threat event generation is successful
        broadcast('attack', event, 'misp-galaxy'); // Invoke broadcast helper passing attack event details and scraper signature
        emitted++; // Increment successfully processed event counter
      } // End of event check block
    } // End of ransomware generation loop

    if (emitted > 0) { // If any events were generated and broadcasted
      console.log(`[MISP Galaxy] Emitted ${emitted} intelligence-driven events.`); // Log cycle emission totals summary
    } // End of status logging conditional check
  }; // End of emitEvents wrapper definition

  // Start after a short delay to let the cache populate
  setTimeout(() => { // Schedule delayed execution startup wrapper
    emitEvents(); // Execute immediate initial event generation dispatch
    setInterval(emitEvents, 20000); // Register recurring task schedule to trigger event generation loop every 20 seconds (20000ms)
  }, 3000); // Introduce 3 seconds (3000ms) startup delay
} // End of startMispGalaxy definition

module.exports = { startMispGalaxy, getGalaxyData }; // Export getGalaxyData cache reader and startMispGalaxy orchestrator
