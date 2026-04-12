const axios = require('axios');

let outbreakId = null;
let totalAttacks = 0;

async function getOutbreakId() {
  try {
    const res = await axios.get('https://fortiguard.fortinet.com/api/threatmap/outbreaks');
    if (res.data && res.data.length > 0) {
      // Skip "All Outbreaks" (id: 0) and pick the first real outbreak
      const validOutbreak = res.data.find(o => o.id !== 0);
      outbreakId = validOutbreak ? validOutbreak.id : res.data[0].id;
      console.log(`[Fortinet] Selected tracking outbreak ID: ${outbreakId}`);
    }
  } catch (err) {
    console.error("[Fortinet] Error fetching outbreaks:", err.message);
  }
}

async function pollFortinet(broadcast) {
  if (!outbreakId) {
    await getOutbreakId();
    if (!outbreakId) return; 
  }

  try {
    const res = await axios.get(`https://fortiguard.fortinet.com/api/threatmap/live/outbreak?outbreak_id=${outbreakId}&limit=50&segment_sec=1800&last_sec=10800&replay=false`);
    
    if (res.data && res.data.ips) {
      const slices = Object.keys(res.data.ips);
      let eventCount = 0;
      for (const ts in res.data.ips) {
        const events = res.data.ips[ts];
        if (Array.isArray(events)) eventCount += events.length;
        if (!Array.isArray(events)) continue;
        events.forEach(ev => {
          if (!ev || !ev.src_lat || !ev.dest_lat) return;
          totalAttacks += ev.count || 1;
          
          const mappedEvent = {
            a_c: ev.count || 1,
            a_n: ev.vuln_name || (ev.outbreak_alert && ev.outbreak_alert[0]) || 'Fortinet Alert',
            a_t: 'exploit',
            s_ip: ev.src_ip || 'unknown',
            s_co: ev.src_country || '??',
            s_la: ev.src_lat,
            s_lo: ev.src_long,
            d_ip: ev.dest_ip || 'unknown',
            d_co: ev.dest_country || '??',
            d_la: ev.dest_lat,
            d_lo: ev.dest_long,
            meta: {
              vulnerability: ev.vuln_name,
              outbreak_id,
              severity: ev.severity,
              threat_score: ev.threat_score
            }
          };

          broadcast('attack', mappedEvent);
        });
      }
      console.log(`[Fortinet] Polled Outbreak ${outbreakId}. Found ${eventCount} events across ${slices.length} time slices.`);
    } else {
      console.log(`[Fortinet] Polled Outbreak ${outbreakId}. No event data in current window.`);
    }
  } catch (err) {
    console.error("[Fortinet] Error polling:", err.message);
  }
}

function startFortinet(broadcast) {
  console.log("[Fortinet] Scraper started. Polling every 4 seconds.");
  setInterval(() => pollFortinet(broadcast), 4000);
  getOutbreakId();
}

module.exports = { startFortinet };
