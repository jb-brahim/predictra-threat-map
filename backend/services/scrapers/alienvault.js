const axios = require('axios');
const geoip = require('geoip-lite');

const TARGET_COUNTRIES = [
  { cc: 'US', lat: 37.0902, lon: -95.7129 },
  { cc: 'GB', lat: 55.3781, lon: -3.4360 },
  { cc: 'DE', lat: 51.1657, lon: 10.4515 },
  { cc: 'FR', lat: 46.2276, lon: 2.2137 },
  { cc: 'JP', lat: 36.2048, lon: 138.2529 }
];

function randomTarget() {
  return TARGET_COUNTRIES[Math.floor(Math.random() * TARGET_COUNTRIES.length)];
}

async function startAlienVault(broadcast) {
  console.log('[AlienVault OTX] Scraper started. Polling every 5 minutes.');

  const poll = async () => {
    try {
      const headers = {};
      const apiKey = process.env.ALIENVAULT_API_KEY;
      if (apiKey) {
        headers['X-OTX-API-KEY'] = apiKey;
      }

      // Fetch recent global pulses (cyber attack reports)
      const response = await axios.get('https://otx.alienvault.com/api/v1/pulses/activity', {
        headers,
        timeout: 10000,
      });

      if (!response.data || !response.data.results) {
        console.warn('[AlienVault OTX] Unexpected response format');
        return;
      }

      // Process the top recent pulses
      const pulses = response.data.results.slice(0, 20);
      let emitted = 0;

      pulses.forEach(item => {
        // OTX Pulses are deeply detailed reports containing IP/Domain indicators
        // We will broadcast the Pulse itself as a major attack event
        const target = randomTarget();
        
        const mappedEvent = {
          a_c: item.indicator_count || 1,
          a_n: `[AlienVault] ${item.name || 'Threat Intelligence Pulse'}`,
          a_t: 'exploit', // Categorizing as exploit/APT activity
          s_ip: item.author_name || 'OTX Community',
          s_co: 'UN', // Set to unknown origin since it's a global report
          s_la: (Math.random() - 0.5) * 60,
          s_lo: (Math.random() - 0.5) * 180,
          d_co: target.cc,
          d_la: target.lat + (Math.random() - 0.5) * 4,
          d_lo: target.lon + (Math.random() - 0.5) * 4,
          meta: {
            threat_type: 'APT / Deep Intel',
            malware_family: item.malware_families?.[0] || 'Unknown',
            tags: item.tags || [],
            reporter: item.author_name,
            url: `https://otx.alienvault.com/pulse/${item.id}`,
            description: item.description || ''
          }
        };

        // Delay slighty so they don't all hit the globe at the exact same millisecond
        setTimeout(() => {
          broadcast('attack', mappedEvent, 'alienvault');
        }, Math.random() * 5000);
        emitted++;
      });

      console.log(`[AlienVault OTX] Emitted ${emitted} deep threat intelligence pulses.`);
    } catch (err) {
      console.error('[AlienVault OTX] Error polling activity:', err.message);
    }
  };

  await poll();
  setInterval(poll, 300000); // 5 minutes
}

module.exports = { startAlienVault };
