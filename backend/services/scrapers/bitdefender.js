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
    
    payloads.forEach(event => {
      // Accept all event types that have geo data
      const from = event.from || {};
      const to = event.to || {};
      
      // Skip events without valid coordinates
      if (!from.x && !from.y && !to.x && !to.y) return;

      totalAttacks++;
      todayAttacks++;

      let a_t = 'exploit';
      if (event.n === 'spam' || event.n === 'phishing') a_t = 'phishing';
      if (event.n === 'botnet' || event.n === 'infections' || event.n === 'iot_botnet') a_t = 'malware';

      const mappedEvent = {
        a_c: 1,
        a_n: event.v || event.n || 'Unknown Threat',
        a_t: a_t,
        s_co: countryCode(from.c),
        s_la: from.x || 0,
        s_lo: from.y || 0,
        d_co: countryCode(to.c),
        d_la: to.x || 0,
        d_lo: to.y || 0
      };

      broadcast('attack', mappedEvent);

      if (totalAttacks % 50 === 0) {
        broadcast('counter', {
          recentPeriod: totalAttacks,
          today: todayAttacks
        });
      }
    });
  });

  socket.on("connect_error", (err) => {
    console.error("[Bitdefender] Connection error:", err.message);
  });

  socket.on("disconnect", (reason) => {
    console.log("[Bitdefender] Disconnected:", reason);
  });
}

module.exports = { startBitdefender };

