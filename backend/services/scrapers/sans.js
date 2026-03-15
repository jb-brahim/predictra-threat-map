const axios = require('axios');
const geoip = require('geoip-lite');

/**
 * SANS ISC (DShield) Scraper
 * Fetches recent high-volume attack data.
 */

async function startSans(broadcast) {
    console.log("[SANS ISC] Scraper started. Polling every 10 seconds.");

    const poll = async () => {
        try {
            // Fetching 'top 100' source IPs from the last 24 hours
            // This is one of the most 'real-time' feeling feeds from SANS
            const response = await axios.get('https://isc.sans.edu/api/sources/attacks/100/1?json');

            if (response.data && Array.isArray(response.data)) {
                console.log(`[SANS ISC] Fetched ${response.data.length} attack sources.`);

                response.data.forEach(item => {
                    const ip = item.ip;
                    const geo = geoip.lookup(ip);

                    if (geo && geo.ll) {
                        const [lat, lon] = geo.ll;

                        // SANS doesn't give us a specific destination IP per attack in this API,
                        // so we "invent" a destination within a random major target country
                        // to create a nice-looking arc on the map.
                        const targetCountries = [
                            { cc: 'US', lat: 37.0902, lon: -95.7129 },
                            { cc: 'GB', lat: 55.3781, lon: -3.4360 },
                            { cc: 'DE', lat: 51.1657, lon: 10.4515 },
                            { cc: 'CN', lat: 35.8617, lon: 104.1954 },
                            { cc: 'FR', lat: 46.2276, lon: 2.2137 }
                        ];
                        const target = targetCountries[Math.floor(Math.random() * targetCountries.length)];

                        const mappedEvent = {
                            a_c: parseInt(item.attacks) || 1,
                            a_n: `[SANS] Port Scan / Firewall Probe (Port ${item.port || 'unk'})`,
                            a_t: 'exploit',
                            s_ip: ip,
                            s_co: geo.country || 'UN',
                            s_la: lat,
                            s_lo: lon,
                            d_co: target.cc,
                            d_la: target.lat + (Math.random() - 0.5) * 5,
                            d_lo: target.lon + (Math.random() - 0.5) * 5,
                            meta: {
                                port: item.port,
                                attacks_count: item.attacks,
                                last_seen: item.lastseen
                            }
                        };

                        broadcast('attack', mappedEvent, 'sans');
                    }
                });
            }
        } catch (error) {
            console.error("[SANS ISC] Error polling SANS API:", error.message);
        }
    };

    // Initial poll
    await poll();

    // SANS ISC doesn't update every second, so every 10-30 seconds is plenty
    setInterval(poll, 15000);
}

module.exports = { startSans };
