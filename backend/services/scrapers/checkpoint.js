const { EventSource } = require('eventsource');

function startCheckpoint(broadcast) {
  console.log("[Checkpoint] Connecting to SSE feed...");
  
  const es = new EventSource('https://threatmap-api.checkpoint.com/ThreatMap/api/feed');

  es.onopen = () => {
    console.log("[Checkpoint] Connected to SSE feed");
  };

  // Handle both specific 'attack' events and generic 'onmessage'
  const handleData = (e) => {
    try {
      const data = JSON.parse(e.data);
      
      // Debug: Log structure 
      if (Math.random() < 0.1) {
        console.log(`[Checkpoint] Stream Data Received. Fields: ${Object.keys(data).join(',')}`);
      }

      // Checkpoint format check
      if (!data.a_t) return;

      // Ensure arc visibility for same-region attacks
      let d_la_mapped = data.d_la;
      let d_lo_mapped = data.d_lo;
      if (data.s_la === d_la_mapped && data.s_lo === d_lo_mapped) {
        d_la_mapped += (Math.random() - 0.5) * 2;
        d_lo_mapped += (Math.random() - 0.5) * 2;
      }

      const mappedEvent = {
        a_c: data.a_c || 1,
        a_n: data.a_n || 'Checkpoint Threat',
        a_t: (['exploit', 'malware', 'phishing'].includes(data.a_t) ? data.a_t : 'exploit'),
        s_ip: data.s_ip || 'unknown',
        s_co: (data.s_co === 'RF' ? 'RU' : data.s_co) || '??',
        s_la: Number(data.s_la) || 0,
        s_lo: Number(data.s_lo) || 0,
        d_ip: data.d_ip || 'unknown',
        d_co: (data.d_co === 'RF' ? 'RU' : data.d_co) || '??',
        d_la: Number(d_la_mapped) || 0,
        d_lo: Number(d_lo_mapped) || 0,
        meta: {
          service_name: data.a_n,
          original_type: data.a_t
        }
      };

      broadcast('attack', mappedEvent, 'checkpoint');
    } catch (err) {
      // silent fail
    }
  };

  es.onmessage = handleData;
  es.addEventListener('attack', handleData);

  es.onerror = (err) => {
    console.error("[Checkpoint] SSE error - reconnecting...");
  };
}

module.exports = { startCheckpoint };
