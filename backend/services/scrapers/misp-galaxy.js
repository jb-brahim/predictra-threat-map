const axios = require('axios');
const geoip = require('geoip-lite');

/**
 * MISP Galaxy Scraper
 *
 * Fetches curated threat intelligence from the MISP Galaxy open-source
 * knowledge base (GitHub). Generates data-driven threat events based on
 * real APT group profiles, ransomware families, and adversary tools.
 *
 * Data source: https://github.com/MISP/misp-galaxy
 */

const GALAXY_BASE = 'https://raw.githubusercontent.com/MISP/misp-galaxy/main/clusters';

const CLUSTER_URLS = {
  threatActors: `${GALAXY_BASE}/threat-actor.json`,
  ransomware:   `${GALAXY_BASE}/ransomware.json`,
  tools:        `${GALAXY_BASE}/tool.json`,
  exploitKits:  `${GALAXY_BASE}/exploit-kit.json`,
  sectors:      `${GALAXY_BASE}/sector.json`,
};

// Country code → approximate lat/lon for event generation
const COUNTRY_COORDS = {
  CN: { lat: 35.86, lon: 104.20 }, US: { lat: 37.09, lon: -95.71 },
  RU: { lat: 61.52, lon: 105.32 }, IR: { lat: 32.43, lon: 53.69 },
  KP: { lat: 40.34, lon: 127.51 }, KR: { lat: 35.91, lon: 127.77 },
  IL: { lat: 31.05, lon: 34.85 }, IN: { lat: 20.59, lon: 78.96 },
  PK: { lat: 30.38, lon: 69.35 }, TR: { lat: 38.96, lon: 35.24 },
  UA: { lat: 48.38, lon: 31.17 }, VN: { lat: 14.06, lon: 108.28 },
  GB: { lat: 55.38, lon: -3.44 }, DE: { lat: 51.17, lon: 10.45 },
  FR: { lat: 46.23, lon: 2.21  }, JP: { lat: 36.20, lon: 138.25 },
  SA: { lat: 23.89, lon: 45.08 }, AE: { lat: 23.42, lon: 53.85 },
  AU: { lat: -25.27, lon: 133.78 }, BR: { lat: -14.24, lon: -51.93 },
  NL: { lat: 52.13, lon: 5.29 }, SE: { lat: 60.13, lon: 18.64 },
  PL: { lat: 51.92, lon: 19.15 }, EG: { lat: 26.82, lon: 30.80 },
  NG: { lat:  9.08, lon:  8.68 }, TW: { lat: 23.70, lon: 120.96 },
  SG: { lat:  1.35, lon: 103.82 }, MY: { lat:  4.21, lon: 101.98 },
  TH: { lat: 15.87, lon: 100.99 }, PH: { lat: 12.88, lon: 121.77 },
  ID: { lat: -0.79, lon: 113.92 }, CA: { lat: 56.13, lon: -106.35 },
  IT: { lat: 41.87, lon: 12.57 }, ES: { lat: 40.46, lon: -3.75 },
};

// Country name → CC mapping for Galaxy data
const COUNTRY_NAME_TO_CC = {
  'china': 'CN', 'united states': 'US', 'russia': 'RU', 'iran': 'IR',
  'north korea': 'KP', 'korea (republic of)': 'KR', 'south korea': 'KR',
  'israel': 'IL', 'india': 'IN', 'pakistan': 'PK', 'turkey': 'TR',
  'ukraine': 'UA', 'vietnam': 'VN', 'united kingdom': 'GB', 'germany': 'DE',
  'france': 'FR', 'japan': 'JP', 'saudi arabia': 'SA', 'taiwan': 'TW',
  'singapore': 'SG', 'australia': 'AU', 'brazil': 'BR', 'netherlands': 'NL',
  'canada': 'CA', 'italy': 'IT', 'spain': 'ES', 'philippines': 'PH',
  'indonesia': 'ID', 'thailand': 'TH', 'malaysia': 'MY', 'nigeria': 'NG',
  'egypt': 'EG', 'poland': 'PL', 'sweden': 'SE',
  'united arab emirates': 'AE', 'hong kong': 'HK',
};

// ─── In-memory Galaxy Cache ───────────────────────────────────────────────
let galaxyCache = {
  threatActors: [],
  ransomware: [],
  tools: [],
  exploitKits: [],
  sectors: [],
  lastFetch: null,
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Fetch and parse a single MISP Galaxy cluster from GitHub
 */
async function fetchCluster(url) {
  try {
    const res = await axios.get(url, { timeout: 30000 });
    return res.data?.values || [];
  } catch (err) {
    console.error(`[MISP Galaxy] Failed to fetch ${url}:`, err.message);
    return [];
  }
}

/**
 * Refresh entire Galaxy cache
 */
async function refreshGalaxyCache() {
  console.log('[MISP Galaxy] Refreshing cluster cache from GitHub...');

  const [threatActors, ransomware, tools, exploitKits, sectors] = await Promise.all([
    fetchCluster(CLUSTER_URLS.threatActors),
    fetchCluster(CLUSTER_URLS.ransomware),
    fetchCluster(CLUSTER_URLS.tools),
    fetchCluster(CLUSTER_URLS.exploitKits),
    fetchCluster(CLUSTER_URLS.sectors),
  ]);

  galaxyCache = {
    threatActors,
    ransomware,
    tools,
    exploitKits,
    sectors,
    lastFetch: Date.now(),
  };

  console.log(`[MISP Galaxy] Cache loaded: ${threatActors.length} actors, ${ransomware.length} ransomware, ${tools.length} tools, ${exploitKits.length} exploit kits, ${sectors.length} sectors`);
}

/**
 * Public accessor for Galaxy data (used by API endpoints)
 */
function getGalaxyData() {
  return galaxyCache;
}

/**
 * Resolve country code from Galaxy actor metadata
 */
function resolveCountryCode(actor) {
  // Direct country field (2-letter code)
  if (actor.meta?.country) return actor.meta.country.toUpperCase();
  // State sponsor field (full name)
  const sponsor = actor.meta?.['cfr-suspected-state-sponsor'];
  if (sponsor) {
    const cc = COUNTRY_NAME_TO_CC[sponsor.toLowerCase()];
    if (cc) return cc;
  }
  return null;
}

/**
 * Get victim country codes from actor metadata
 */
function resolveVictimCountries(actor) {
  const victims = actor.meta?.['cfr-suspected-victims'] || [];
  return victims
    .map(v => COUNTRY_NAME_TO_CC[v.toLowerCase()])
    .filter(Boolean);
}

/**
 * Resolve attack type from actor metadata
 */
function resolveAttackType(actor) {
  const incident = (actor.meta?.['cfr-type-of-incident'] || '').toLowerCase();
  if (incident.includes('espionage')) return 'exploit';
  if (incident.includes('sabotage') || incident.includes('destruct')) return 'malware';

  const desc = (actor.description || '').toLowerCase();
  if (desc.includes('ransomware') || desc.includes('wiper')) return 'malware';
  if (desc.includes('phish') || desc.includes('spear-phish')) return 'phishing';
  if (desc.includes('espionage') || desc.includes('exploit') || desc.includes('apt')) return 'exploit';

  return ['exploit', 'malware', 'phishing'][Math.floor(Math.random() * 3)];
}

/**
 * Build a jittered coordinate from a country code
 */
function jitterCoord(cc) {
  const base = COUNTRY_COORDS[cc];
  if (!base) return null;
  return {
    lat: base.lat + (Math.random() - 0.5) * 4,
    lon: base.lon + (Math.random() - 0.5) * 4,
  };
}

/**
 * Generate a single threat event from a Galaxy threat actor
 */
function generateActorEvent(actor) {
  const originCC = resolveCountryCode(actor);
  if (!originCC) return null;

  const victimCCs = resolveVictimCountries(actor);
  const targetCC = victimCCs.length > 0
    ? victimCCs[Math.floor(Math.random() * victimCCs.length)]
    : Object.keys(COUNTRY_COORDS)[Math.floor(Math.random() * Object.keys(COUNTRY_COORDS).length)];

  const origin = jitterCoord(originCC);
  const target = jitterCoord(targetCC);
  if (!origin || !target) return null;

  const attackType = resolveAttackType(actor);
  const synonyms = actor.meta?.synonyms || [];
  const sectors = actor.meta?.['cfr-target-category'] || actor.meta?.['targeted-sector'] || [];
  const incidentType = actor.meta?.['cfr-type-of-incident'] || 'Unknown';

  return {
    a_c: 1,
    a_n: `[MISP Galaxy] ${actor.value}${synonyms.length > 0 ? ` (${synonyms[0]})` : ''}`,
    a_t: attackType,
    s_ip: 'galaxy-intel',
    s_co: originCC,
    s_la: origin.lat,
    s_lo: origin.lon,
    d_co: targetCC,
    d_la: target.lat,
    d_lo: target.lon,
    meta: {
      galaxy_source: 'threat-actor',
      galaxy_actor: actor.value,
      galaxy_uuid: actor.uuid,
      galaxy_synonyms: synonyms.slice(0, 5),
      galaxy_description: (actor.description || '').slice(0, 300),
      galaxy_target_sectors: sectors,
      galaxy_incident_type: incidentType,
      galaxy_victims: (actor.meta?.['cfr-suspected-victims'] || []).slice(0, 10),
      galaxy_refs: (actor.meta?.refs || []).slice(0, 3),
      galaxy_state_sponsor: actor.meta?.['cfr-suspected-state-sponsor'] || null,
      organization: actor.value,
    }
  };
}

/**
 * Generate a single threat event from a Galaxy ransomware entry
 */
function generateRansomwareEvent(rw) {
  const targetCCs = Object.keys(COUNTRY_COORDS);
  const targetCC = targetCCs[Math.floor(Math.random() * targetCCs.length)];
  const target = jitterCoord(targetCC);
  if (!target) return null;

  // Ransomware origin is typically obscured; pick common origins
  const origins = ['RU', 'CN', 'KP', 'IR', 'UA'];
  const originCC = origins[Math.floor(Math.random() * origins.length)];
  const origin = jitterCoord(originCC);
  if (!origin) return null;

  return {
    a_c: 1,
    a_n: `[MISP Galaxy] Ransomware: ${rw.value}`,
    a_t: 'malware',
    s_ip: 'galaxy-intel',
    s_co: originCC,
    s_la: origin.lat,
    s_lo: origin.lon,
    d_co: targetCC,
    d_la: target.lat,
    d_lo: target.lon,
    meta: {
      galaxy_source: 'ransomware',
      galaxy_actor: rw.value,
      galaxy_uuid: rw.uuid,
      galaxy_synonyms: (rw.meta?.synonyms || []).slice(0, 5),
      galaxy_description: (rw.description || '').slice(0, 300),
      galaxy_refs: (rw.meta?.refs || []).slice(0, 3),
      malware_family: rw.value,
      organization: rw.value,
    }
  };
}

/**
 * Main scraper loop
 */
async function startMispGalaxy(broadcast) {
  console.log('[MISP Galaxy] Scraper started. Intelligence-driven event generation.');

  // Initial fetch
  await refreshGalaxyCache();

  // Periodic cache refresh
  setInterval(refreshGalaxyCache, CACHE_TTL_MS);

  // Generate events every 20 seconds from the cached Galaxy data
  const emitEvents = () => {
    const { threatActors, ransomware } = galaxyCache;
    if (threatActors.length === 0 && ransomware.length === 0) return;

    let emitted = 0;

    // Emit 3-5 threat actor events per cycle
    const actorCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < actorCount && threatActors.length > 0; i++) {
      // Prefer actors with country attribution for richer data
      const attributed = threatActors.filter(a => resolveCountryCode(a));
      const pool = attributed.length > 0 ? attributed : threatActors;
      const actor = pool[Math.floor(Math.random() * pool.length)];
      const event = generateActorEvent(actor);
      if (event) {
        broadcast('attack', event, 'misp-galaxy');
        emitted++;
      }
    }

    // Emit 1-2 ransomware events per cycle
    const rwCount = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < rwCount && ransomware.length > 0; i++) {
      const rw = ransomware[Math.floor(Math.random() * ransomware.length)];
      const event = generateRansomwareEvent(rw);
      if (event) {
        broadcast('attack', event, 'misp-galaxy');
        emitted++;
      }
    }

    if (emitted > 0) {
      console.log(`[MISP Galaxy] Emitted ${emitted} intelligence-driven events.`);
    }
  };

  // Start after a short delay to let the cache populate
  setTimeout(() => {
    emitEvents();
    setInterval(emitEvents, 20000); // Every 20 seconds
  }, 3000);
}

module.exports = { startMispGalaxy, getGalaxyData };
