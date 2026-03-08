const axios = require('axios');

async function startKaspersky(broadcast) {
  try {
    let topMalware = [];
    const getStats = async () => {
      try {
        const res = await axios.get('https://sm-cybermap-mediaprod.smweb.tech/data/securelist/top10_oas_w_0.json');
        topMalware = res.data;
        console.log("[Kaspersky] Fetched trending malware list");
      } catch (e) {
        console.error("[Kaspersky] Failed to fetch stats");
      }
    };

    await getStats();
    setInterval(getStats, 60000);

    // Provide occasional Kaspersky-themed events
    setInterval(() => {
      if (topMalware.length === 0) return;
      const randomMalware = topMalware[Math.floor(Math.random() * topMalware.length)];
      
      const src_lat = (Math.random() * 140) - 70;
      const src_lo = (Math.random() * 360) - 180;
      const dst_lat = (Math.random() * 140) - 70;
      const dst_lo = (Math.random() * 360) - 180;

      const mappedEvent = {
        a_c: 1,
        a_n: `[Kaspersky] ${randomMalware.name}`,
        a_t: 'malware',
        s_co: 'UK', // Unknown simulated country code
        s_la: src_lat,
        s_lo: src_lo,
        d_co: 'UK',
        d_la: dst_lat,
        d_lo: dst_lo
      };

      broadcast('attack', mappedEvent);
    }, 2500); // Send 1 kaspersky event every 2.5 seconds

  } catch (err) {
    console.error("[Kaspersky] Error:", err.message);
  }
}

module.exports = { startKaspersky };
