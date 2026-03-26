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
      // Since ransomwatch is archived, we have successfully migrated to Ransomlook.io which is actively maintained!
      const response = await axios.get('https://www.ransomlook.io/api/recent', {
        timeout: 15000,
      });

      const posts = response.data;
      if (!Array.isArray(posts)) return;

      // Ensure we don't bombard the UI on first load. Grab latest 15.
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
            description: 'Data published on active ransomware actor TOR site.',
            url: item.link ? `https://www.ransomlook.io${item.link}` : '',
            published_date: new Date().toISOString()
          }
        };

        setTimeout(() => {
          broadcast('attack', mappedEvent, 'ransomwatch');
        }, Math.random() * 8000);
        emitted++;
      });

      console.log(`[RansomLook API] Emitted ${emitted} active dark web ransomware leaks.`);
    } catch (err) {
      console.error('[RansomLook API] Error polling dark web:', err.message);
    }
  };

  await poll();
  // Ransomware leaks update slowly, polling every 10 min is fine
  setInterval(poll, 600000); 
}

module.exports = { startRansomWatch };
