const axios = require('axios');
const geoip = require('geoip-lite');

/**
 * Kaspersky / Feodo Tracker Scraper
 *
 * Kaspersky has no public API for their cybermap live data.
 * Instead, we use Feodo Tracker (by abuse.ch) — a real-time feed of
 * active botnet Command & Control (C2) servers. This is the same kind
 * of data Kaspersky's map displays: malware & botnet activity globally.
 * No API key required.
 *
 * Endpoint: https://feodotracker.abuse.ch/downloads/ipblocklist.json
 */

const TARGET_COUNTRIES = [
  { cc: 'US', lat: 37.0902, lon: -95.7129 },
  { cc: 'GB', lat: 55.3781, lon: -3.4360 },
  { cc: 'DE', lat: 51.1657, lon: 10.4515 },
  { cc: 'FR', lat: 46.2276, lon: 2.2137 },
  { cc: 'JP', lat: 36.2048, lon: 138.2529 },
  { cc: 'AU', lat: -25.2744, lon: 133.7751 },
  { cc: 'BR', lat: -14.2350, lon: -51.9253 },
  { cc: 'IN', lat: 20.5937, lon: 78.9629 },
  { cc: 'CA', lat: 56.1304, lon: -106.3468 },
  { cc: 'NL', lat: 52.1326, lon: 5.2913 },
];

function randomTarget() {
  return TARGET_COUNTRIES[Math.floor(Math.random() * TARGET_COUNTRIES.length)];
}

// Feodo Tracker malware family → our attack type mapping
function mapMalwareType(malware) {
  if (!malware) return 'malware';
  const m = malware.toLowerCase();
  if (m.includes('bot') || m.includes('trickbot') || m.includes('emotet') || m.includes('dridex') || m.includes('qakbot')) return 'malware';
  if (m.includes('cobalt') || m.includes('metasploit') || m.includes('empire')) return 'exploit';
  return 'malware';
}

async function startKaspersky(broadcast) {
  console.log('[Kaspersky/FeodoTracker] Scraper started. Polling every 60 seconds.');

  const poll = async () => {
    try {
      // Feodo Tracker: JSON list of active botnet C2 IP addresses
      // No API key required. Updated every ~5 minutes by abuse.ch.
      const res = await axios.get('https://feodotracker.abuse.ch/downloads/ipblocklist.json', {
        timeout: 10000,
        headers: { 'User-Agent': 'PredictraThreatMap/1.0 (educational project)' }
      });

      if (!res.data || !Array.isArray(res.data)) {
        console.log('[Kaspersky/FeodoTracker] Unexpected response format');
        return;
      }

      // Filter to only actively reported C2 servers
      const active = res.data.filter(entry => entry.ip_address);
      const sample = active.slice(0, 40); // use 40 per poll cycle

      console.log(`[Kaspersky/FeodoTracker] Feed has ${active.length} active C2 servers. Emitting ${sample.length}.`);

      sample.forEach(entry => {
        const geo = geoip.lookup(entry.ip_address);
        if (!geo || !geo.ll) return;

        const [lat, lon] = geo.ll;
        const target = randomTarget();

        // Add small jitter so arcs spread out nicely
        const mappedEvent = {
          a_c: 1,
          a_n: `[Kaspersky] Botnet C2: ${entry.malware || 'Unknown Malware'} (${entry.ip_address})`,
          a_t: mapMalwareType(entry.malware),
          s_ip: entry.ip_address,
          s_co: geo.country || '??',
          s_la: lat + (Math.random() - 0.5) * 1.5,
          s_lo: lon + (Math.random() - 0.5) * 1.5,
          d_co: target.cc,
          d_la: target.lat + (Math.random() - 0.5) * 5,
          d_lo: target.lon + (Math.random() - 0.5) * 5,
          meta: {
            malware_family: entry.malware,
            as_name: entry.as_name,
            as_number: entry.as_number,
            port: entry.port,
            last_online: entry.last_online
          }
        };

        broadcast('attack', mappedEvent, 'kaspersky');
      });

    } catch (err) {
      console.error('[Kaspersky/FeodoTracker] Error polling:', err.message);
    }
  };

  // Initial poll immediately
  await poll();

  // Then every 60 seconds
  setInterval(poll, 60000);
}

module.exports = { startKaspersky };
