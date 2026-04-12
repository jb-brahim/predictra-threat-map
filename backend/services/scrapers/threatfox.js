const axios = require('axios');
const geoip = require('geoip-lite');
const { getIpOrganization } = require('../enrichment');

/**
 * ThreatFox (abuse.ch) Scraper
 *
 * Fetches recent Indicators of Compromise (IoCs) — malware C2 IPs/domains.
 */

const TARGET_COUNTRIES = [
  { cc: 'US', lat: 37.0902, lon: -95.7129 },
  { cc: 'GB', lat: 55.3781, lon: -3.4360 },
  { cc: 'DE', lat: 51.1657, lon: 10.4515 },
  { cc: 'FR', lat: 46.2276, lon: 2.2137 },
  { cc: 'NL', lat: 52.1326, lon: 5.2913 },
];

function randomTarget() {
  return TARGET_COUNTRIES[Math.floor(Math.random() * TARGET_COUNTRIES.length)];
}

async function startThreatFox(broadcast) {
  console.log('[ThreatFox] Scraper started. Polling every 60 seconds.');

  const poll = async () => {
    try {
      const headers = { 'Content-Type': 'application/json' };
      const apiKey = process.env.THREATFOX_API_KEY;
      if (apiKey) {
        headers['Auth-Key'] = apiKey;
      }

      // Correct query: "get_iocs" with days parameter (max 7)
      const response = await axios.post(
        'https://threatfox-api.abuse.ch/api/v1/',
        { query: 'get_iocs', days: 1 },
        { headers, timeout: 15000 }
      );

      if (
        !response.data ||
        response.data.query_status !== 'ok' ||
        !Array.isArray(response.data.data)
      ) {
        console.warn('[ThreatFox] Unexpected response:', response.data?.query_status);
        return;
      }

      const iocs = response.data.data;
      console.log(`[ThreatFox] Fetched ${iocs.length} recent IoCs.`);

      // Process only IP:Port type IoCs (the ones we can geolocate)
      const ipIoCs = iocs.filter(item =>
        item.ioc_type === 'ip:port' && item.ioc_value
      ).slice(0, 40);

      let emitted = 0;
      for (const item of ipIoCs) {
        // Strip port number
        let host = item.ioc_value;
        if (host.includes(':')) host = host.split(':')[0];

        const geo = geoip.lookup(host);
        if (!geo || !geo.ll) continue;

        const [lat, lon] = geo.ll;
        const org = await getIpOrganization(host);

        let a_t = 'malware';
        const desc = (item.threat_type_desc || '').toLowerCase();
        if (desc.includes('phishing')) a_t = 'phishing';
        else if (desc.includes('exploit') || desc.includes('c2') || desc.includes('botnet')) a_t = 'exploit';

        const target = randomTarget();

        const mappedEvent = {
          a_c: 1,
          a_n: `[ThreatFox] ${org || 'Malware C2'}: ${item.malware_printable || 'Unknown Malware'}`,
          a_t,
          s_ip: host,
          s_co: geo.country || '??',
          s_la: lat + (Math.random() - 0.5) * 1,
          s_lo: lon + (Math.random() - 0.5) * 1,
          d_co: target.cc,
          d_la: target.lat + (Math.random() - 0.5) * 5,
          d_lo: target.lon + (Math.random() - 0.5) * 5,
          meta: {
            confidence: item.confidence_level,
            malware_family: item.malware_printable,
            malware_alias: item.malware_alias,
            tags: item.tags || [],
            ioc_type: item.ioc_type,
            reference: item.reference,
            organization: org
          }
        };

        broadcast('attack', mappedEvent, 'threatfox');
        emitted++;
      }

      console.log(`[ThreatFox] Emitted ${emitted} IP-based IoCs.`);
    } catch (err) {
      console.error('[ThreatFox] Error polling API:', err.message);
    }
  };

  await poll();
  setInterval(poll, 60000);
}

module.exports = { startThreatFox };
