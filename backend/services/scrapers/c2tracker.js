const axios = require('axios');
const geoip = require('geoip-lite');

// A selection of the most dangerous and popular C2 frameworks and RATs from the GitHub repo
const C2_FEEDS = [
  { name: 'Cobalt Strike', url: 'https://raw.githubusercontent.com/montysecurity/C2-Tracker/main/data/Cobalt%20Strike%20C2%20IPs.txt' },
  { name: 'Sliver C2', url: 'https://raw.githubusercontent.com/montysecurity/C2-Tracker/main/data/Sliver%20C2%20IPs.txt' },
  { name: 'Havoc C2', url: 'https://raw.githubusercontent.com/montysecurity/C2-Tracker/main/data/Havoc%20C2%20IPs.txt' },
  { name: 'Remcos RAT', url: 'https://raw.githubusercontent.com/montysecurity/C2-Tracker/main/data/Remcos%20RAT%20IPs.txt' },
  { name: 'Metasploit', url: 'https://raw.githubusercontent.com/montysecurity/C2-Tracker/main/data/Metasploit%20Framework%20C2%20IPs.txt' }
];

// Target major cloud provider regions or victim dense countries to visualize outbound attacks
const TARGET_COUNTRIES = [
  { cc: 'US', lat: 37.0902, lon: -95.7129 },
  { cc: 'GB', lat: 55.3781, lon: -3.4360 },
  { cc: 'FR', lat: 46.2276, lon: 2.2137 },
  { cc: 'DE', lat: 51.1657, lon: 10.4515 },
  { cc: 'JP', lat: 36.2048, lon: 138.2529 }
];

function randomTarget() {
  return TARGET_COUNTRIES[Math.floor(Math.random() * TARGET_COUNTRIES.length)];
}

async function startC2Tracker(broadcast) {
  console.log('[C2-Tracker] Scraper started. Polling GitHub repositories every 15 minutes.');

  const poll = async () => {
    try {
      let emitted = 0;

      for (const feed of C2_FEEDS) {
        const response = await axios.get(feed.url, { timeout: 15000 });
        if (!response.data) continue;

        // Parse plaintext IPs separated by newlines
        const ips = response.data.split('\n').map(ip => ip.trim()).filter(ip => ip.length > 5);
        if (ips.length === 0) continue;

        // We don't want to flood the globe with 5,000 Cobalt Strike IPs instantly
        // So we grab a random sample of 10 active C2 IPs from each list every cycle
        const sampleSize = Math.min(10, ips.length);
        const randomSample = ips.sort(() => 0.5 - Math.random()).slice(0, sampleSize);

        randomSample.forEach(ip => {
          const geo = geoip.lookup(ip);
          if (!geo) return; // Skip if we can't locate the attacker

          const target = randomTarget();
          
          const mappedEvent = {
            a_c: 1,
            a_n: `[C2 Server] ${feed.name} Activity Detected`,
            a_t: 'malware', // C2 infra usually implies malware control
            s_ip: ip,
            s_co: geo.country || 'UN',
            s_la: geo.ll[0] + (Math.random() - 0.5) * 1,
            s_lo: geo.ll[1] + (Math.random() - 0.5) * 1,
            d_ip: `Victim Endpoint`,
            d_co: target.cc,
            d_la: target.lat + (Math.random() - 0.5) * 3,
            d_lo: target.lon + (Math.random() - 0.5) * 3,
            meta: {
              threat_type: 'Command and Control (C2)',
              malware_family: feed.name,
              tags: ['#c2', '#botnet', `#${feed.name.replace(/\s+/g,"").toLowerCase()}`],
              description: `Active ${feed.name} Command & Control server logged in live GitHub tracker.`,
              url: 'https://github.com/montysecurity/C2-Tracker',
              reporter: 'montysecurity'
            }
          };

          // Stagger the visualization so it looks like a continuous swarm
          setTimeout(() => {
            broadcast('attack', mappedEvent, 'c2tracker');
          }, Math.random() * 10000);
          emitted++;
        });
      }

      console.log(`[C2-Tracker] Emitted ${emitted} live Command & Control botnet IPs from GitHub.`);
    } catch (err) {
      console.error('[C2-Tracker] Error polling GitHub:', err.message);
    }
  };

  await poll();
  // Poll GitHub every 15 minutes
  setInterval(poll, 900000); 
}

module.exports = { startC2Tracker };
