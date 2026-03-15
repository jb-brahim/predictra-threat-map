const axios = require('axios');
const geoip = require('geoip-lite');

/**
 * URLhaus (abuse.ch) Scraper
 *
 * Fetches recent malicious URLs hosting malware.
 *
 * API: https://urlhaus-api.abuse.ch/v1/urls/recent/
 * Optionally set URLHAUS_API_KEY in your .env for authenticated (higher rate limit) access.
 * The API still works without a key until June 30, 2025, after which a free key is required.
 * Get a free key at: https://auth.abuse.ch/
 *
 * For the destination we use the SANS/Checkpoint-style approach:
 * show arcs flowing TO a randomized major hub country.
 */

const TARGET_COUNTRIES = [
  { cc: 'US', lat: 37.0902, lon: -95.7129 },
  { cc: 'GB', lat: 55.3781, lon: -3.4360 },
  { cc: 'DE', lat: 51.1657, lon: 10.4515 },
  { cc: 'FR', lat: 46.2276, lon: 2.2137 },
  { cc: 'JP', lat: 36.2048, lon: 138.2529 },
  { cc: 'CA', lat: 56.1304, lon: -106.3468 },
  { cc: 'AU', lat: -25.2744, lon: 133.7751 },
  { cc: 'NL', lat: 52.1326, lon: 5.2913 },
];

function randomTarget() {
  return TARGET_COUNTRIES[Math.floor(Math.random() * TARGET_COUNTRIES.length)];
}

async function startUrlhaus(broadcast) {
  console.log('[URLhaus] Scraper started. Polling every 90 seconds.');

  const poll = async () => {
    try {
      const headers = {};
      const apiKey = process.env.URLHAUS_API_KEY;
      if (apiKey) {
        headers['Auth-Key'] = apiKey;
      }

      const response = await axios.get('https://urlhaus-api.abuse.ch/v1/urls/recent/', {
        headers,
        timeout: 15000,
      });

      if (
        !response.data ||
        !response.data.urls ||
        !Array.isArray(response.data.urls)
      ) {
        console.warn('[URLhaus] Unexpected response format');
        return;
      }

      // Filter to only "online" (active) malware URLs
      const activeUrls = response.data.urls
        .filter(item => item.url_status === 'online' || item.url_status === 'unknown')
        .slice(0, 50);

      console.log(`[URLhaus] Fetched ${response.data.urls.length} URLs. Using ${activeUrls.length} active ones.`);

      let emitted = 0;
      activeUrls.forEach(item => {
        let host = '';
        try {
          const url = new URL(item.url);
          host = url.hostname;
        } catch {
          return;
        }

        const geo = geoip.lookup(host);
        if (!geo || !geo.ll) return;

        const [lat, lon] = geo.ll;
        const target = randomTarget();

        const mappedEvent = {
          a_c: 1,
          a_n: `[URLhaus] Malware Distribution: ${item.threat || 'unknown'} (${host})`,
          a_t: 'malware',
          s_ip: host,
          s_co: geo.country || 'UN',
          s_la: lat + (Math.random() - 0.5) * 1,
          s_lo: lon + (Math.random() - 0.5) * 1,
          d_co: target.cc,
          d_la: target.lat + (Math.random() - 0.5) * 4,
          d_lo: target.lon + (Math.random() - 0.5) * 4,
          meta: {
            threat_type: item.threat,
            tags: item.tags || [],
            url: item.url,
            reporter: item.reporter,
            status: item.url_status
          }
        };

        broadcast('attack', mappedEvent, 'urlhaus');
        emitted++;
      });

      console.log(`[URLhaus] Emitted ${emitted} geo-valid events.`);
    } catch (err) {
      console.error('[URLhaus] Error polling:', err.message);
    }
  };

  await poll();
  setInterval(poll, 90000);
}

module.exports = { startUrlhaus };
