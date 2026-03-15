const io = require("socket.io-client");

let totalAttacks = 0;
let todayAttacks = 0;

// Common country name → 2-letter ISO code
const COUNTRY_CODES = {
  'United States': 'US', 'United Kingdom': 'GB', 'Germany': 'DE', 'France': 'FR',
  'China': 'CN', 'Russia': 'RU', 'Japan': 'JP', 'India': 'IN', 'Brazil': 'BR',
  'Canada': 'CA', 'Australia': 'AU', 'Italy': 'IT', 'Spain': 'ES', 'Mexico': 'MX',
  'South Korea': 'KR', 'Netherlands': 'NL', 'Turkey': 'TR', 'Indonesia': 'ID',
  'Saudi Arabia': 'SA', 'Switzerland': 'CH', 'Poland': 'PL', 'Sweden': 'SE',
  'Belgium': 'BE', 'Argentina': 'AR', 'Thailand': 'TH', 'South Africa': 'ZA',
  'Nigeria': 'NG', 'Egypt': 'EG', 'Israel': 'IL', 'Ireland': 'IE', 'Denmark': 'DK',
  'Finland': 'FI', 'Norway': 'NO', 'Austria': 'AT', 'Romania': 'RO', 'Ukraine': 'UA',
  'Czech Republic': 'CZ', 'Portugal': 'PT', 'Greece': 'GR', 'Hungary': 'HU',
  'Vietnam': 'VN', 'Philippines': 'PH', 'Colombia': 'CO', 'Chile': 'CL',
  'Malaysia': 'MY', 'Pakistan': 'PK', 'Bangladesh': 'BD', 'Peru': 'PE',
  'Singapore': 'SG', 'Hong Kong': 'HK', 'Taiwan': 'TW', 'New Zealand': 'NZ',
  'Iran': 'IR', 'Iraq': 'IQ', 'Morocco': 'MA', 'Algeria': 'DZ', 'Kenya': 'KE',
  'Bulgaria': 'BG', 'Croatia': 'HR', 'Slovakia': 'SK', 'Lithuania': 'LT',
  'Latvia': 'LV', 'Estonia': 'EE', 'Slovenia': 'SI', 'Serbia': 'RS',
};

function countryCode(name) {
  if (!name) return 'UN';
  if (name.length <= 3) return name.toUpperCase().slice(0, 2);
  return COUNTRY_CODES[name] || name.slice(0, 2).toUpperCase();
}

function startBitdefender(broadcast) {
  console.log("[Bitdefender] Connecting to WebSocket...");
  const socket = io("https://threatmap.bitdefender.com", {
    path: "/socket.io/",
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 3000,
  });

  socket.on("connect", () => {
    console.log("[Bitdefender] Connected to WebSocket");
    
    const events = ['botnet', 'portscan', 'telnet', 'ssh', 'rdp', 'vnc', 'mysql', 'mssql', 'http', 'iot', 'iot_botnet', 'infections', 'spam'];
    events.forEach(eventName => {
      socket.emit("subscribe", { event_name: eventName });
    });
  });

  socket.on("ev", (payloads) => {
    if (!Array.isArray(payloads)) return;
    if (payloads.length > 0) {
       console.log(`[Bitdefender] Received ${payloads.length} raw events. Sample: ${JSON.stringify(payloads[0]).slice(0, 200)}`);
    }
    
    let processed = 0;
    payloads.forEach(event => {
      // Bitdefender structure can vary: some events have 'from'/'to', others just 'loc'
      const from = event.from || (event.t === 'attacker' ? event.loc : null);
      const to = event.to || (event.t === 'victim' ? event.loc : null);
      
      // Extract coordinates, defaulting to undefined
      let s_la = from ? (from.x || from.lat) : undefined;
      let s_lo = from ? (from.y || from.long) : undefined;
      let d_la = to ? (to.x || to.lat) : undefined;
      let d_lo = to ? (to.y || to.long) : undefined;

      // If we only have one side (common in Bitdefender), we "invent" the other side 
      // within a reasonable distance to ensure an arc is drawn on the globe.
      if (s_la !== undefined && d_la === undefined) {
          d_la = s_la + (Math.random() - 0.5) * 10;
          d_lo = s_lo + (Math.random() - 0.5) * 10;
      } else if (d_la !== undefined && s_la === undefined) {
          s_la = d_la + (Math.random() - 0.5) * 10;
          s_lo = d_lo + (Math.random() - 0.5) * 10;
      }

      // Final check: if we still don't have coordinates, skip
      if (s_la === undefined || d_la === undefined) return;
      processed++;

      totalAttacks++;
      todayAttacks++;

      let a_t = 'exploit';
      if (event.n === 'spam' || event.n === 'phishing') a_t = 'phishing';
      if (event.n === 'botnet' || event.n === 'infections' || event.n === 'iot_botnet') a_t = 'malware';

      const mappedEvent = {
        a_c: 1,
        a_n: event.v || event.n || 'Bitdefender Threat',
        a_t: a_t,
        s_ip: (from && (from.ip || from.host)) || 'unknown',
        s_co: countryCode((from && (from.c || from.c_iso)) || 'UN'),
        s_la: Number(s_la),
        s_lo: Number(s_lo),
        d_ip: (to && (to.ip || to.host)) || 'unknown',
        d_co: countryCode((to && (to.c || to.c_iso)) || 'UN'),
        d_la: Number(d_la),
        d_lo: Number(d_lo),
        meta: {
          service: event.n,
          threat_name: event.v,
          attacker_info: from,
          victim_info: to
        }
      };

      broadcast('attack', mappedEvent);

      if (totalAttacks % 50 === 0) {
        broadcast('counter', {
          recentPeriod: totalAttacks,
          today: todayAttacks
        });
      }
    });
    if (payloads.length > 0) {
      console.log(`[Bitdefender] Raw Events: ${payloads.length}, Geo-Valid Attacks: ${processed}`);
    }
  });

  socket.on("connect_error", (err) => {
    console.error("[Bitdefender] Connection error:", err.message);
  });

  socket.on("disconnect", (reason) => {
    console.log("[Bitdefender] Disconnected:", reason);
  });
}

module.exports = { startBitdefender };

