const axios = require('axios');

const TARGET_COUNTRIES = [
  { cc: 'US', lat: 37.0902, lon: -95.7129 },
  { cc: 'GB', lat: 55.3781, lon: -3.4360 },
  { cc: 'CA', lat: 56.1304, lon: -106.3468 },
  { cc: 'AU', lat: -25.2744, lon: 133.7751 },
];

function randomTarget() {
  return TARGET_COUNTRIES[Math.floor(Math.random() * TARGET_COUNTRIES.length)];
}

let lastRecordCount = 0;

async function startRansomWatch(broadcast) {
  console.log('[RansomWatch] Scraper started. Polling dark web ransomware leaks every 10 minutes.');

  const poll = async () => {
    try {
      // Open source community project index of ransomware leak sites (e.g. Lockbit, ALPHV, etc.)
      const response = await axios.get('https://raw.githubusercontent.com/joshhighet/ransomwatch/main/posts.json', {
        timeout: 15000,
      });

      const posts = response.data;
      if (!Array.isArray(posts)) return;

      // On first run, just establish a baseline, or take the top 15 leaks
      let newLeaks = [];
      if (lastRecordCount === 0) {
        newLeaks = posts.slice(0, 15); 
      } else if (posts.length > lastRecordCount) {
        newLeaks = posts.slice(0, posts.length - lastRecordCount);
      }
      
      lastRecordCount = posts.length;

      let emitted = 0;
      newLeaks.forEach(item => {
        const target = randomTarget();
        
        const mappedEvent = {
          a_c: 1,
          a_n: `[Ransomware Data Leak] ${item.post_title || 'Unknown Victim'}`,
          a_t: 'malware', 
          s_ip: item.group_name || 'Dark Web Actor',
          // Ransomware rings are often operating out of Eastern Europe / Russian block, but routing through Tor
          s_co: 'RU', 
          s_la: 61.5240 + (Math.random() - 0.5) * 10,
          s_lo: 105.3188 + (Math.random() - 0.5) * 20,
          d_ip: item.post_title || 'Victim Org',
          d_co: target.cc,
          d_la: target.lat + (Math.random() - 0.5) * 4,
          d_lo: target.lon + (Math.random() - 0.5) * 4,
          meta: {
            threat_type: 'Ransomware Extortion',
            malware_family: item.group_name,
            tags: ['#ransomware', '#dataleak', `#${item.group_name}`],
            description: item.description || 'Data published on ransomware actor TOR site.',
            published_date: item.published || item.discovered
          }
        };

        setTimeout(() => {
          broadcast('attack', mappedEvent, 'ransomwatch');
        }, Math.random() * 8000);
        emitted++;
      });

      console.log(`[RansomWatch] Emitted ${emitted} dark web ransomware leaks.`);
    } catch (err) {
      console.error('[RansomWatch] Error polling dark web:', err.message);
    }
  };

  await poll();
  // Ransomware leaks update slowly, polling every 10 min is fine
  setInterval(poll, 600000); 
}

module.exports = { startRansomWatch };
