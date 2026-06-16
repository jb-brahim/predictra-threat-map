const io = require("socket.io-client"); // Import the socket.io-client library to establish WebSockets client connections

let totalAttacks = 0; // Initialize global counter for total attacks processed from Bitdefender
let todayAttacks = 0; // Initialize global counter for attacks processed in the current session/today

// Common country name → 2-letter ISO code
const COUNTRY_CODES = { // Define dictionary mapping country name strings to standard two-letter codes
  'United States': 'US', 'United Kingdom': 'GB', 'Germany': 'DE', 'France': 'FR', // USA, UK, Germany, France codes
  'China': 'CN', 'Russia': 'RU', 'Japan': 'JP', 'India': 'IN', 'Brazil': 'BR', // China, Russia, Japan, India, Brazil codes
  'Canada': 'CA', 'Australia': 'AU', 'Italy': 'IT', 'Spain': 'ES', 'Mexico': 'MX', // Canada, Australia, Italy, Spain, Mexico codes
  'South Korea': 'KR', 'Netherlands': 'NL', 'Turkey': 'TR', 'Indonesia': 'ID', // South Korea, Netherlands, Turkey, Indonesia codes
  'Saudi Arabia': 'SA', 'Switzerland': 'CH', 'Poland': 'PL', 'Sweden': 'SE', // Saudi Arabia, Switzerland, Poland, Sweden codes
  'Belgium': 'BE', 'Argentina': 'AR', 'Thailand': 'TH', 'South Africa': 'ZA', // Belgium, Argentina, Thailand, South Africa codes
  'Nigeria': 'NG', 'Egypt': 'EG', 'Israel': 'IL', 'Ireland': 'IE', 'Denmark': 'DK', // Nigeria, Egypt, Israel, Ireland, Denmark codes
  'Finland': 'FI', 'Norway': 'NO', 'Austria': 'AT', 'Romania': 'RO', 'Ukraine': 'UA', // Finland, Norway, Austria, Romania, Ukraine codes
  'Czech Republic': 'CZ', 'Portugal': 'PT', 'Greece': 'GR', 'Hungary': 'HU', // Czech Republic, Portugal, Greece, Hungary codes
  'Vietnam': 'VN', 'Philippines': 'PH', 'Colombia': 'CO', 'Chile': 'CL', // Vietnam, Philippines, Colombia, Chile codes
  'Malaysia': 'MY', 'Pakistan': 'PK', 'Bangladesh': 'BD', 'Peru': 'PE', // Malaysia, Pakistan, Bangladesh, Peru codes
  'Singapore': 'SG', 'Hong Kong': 'HK', 'Taiwan': 'TW', 'New Zealand': 'NZ', // Singapore, Hong Kong, Taiwan, New Zealand codes
  'Iran': 'IR', 'Iraq': 'IQ', 'Morocco': 'MA', 'Algeria': 'DZ', 'Kenya': 'KE', // Iran, Iraq, Morocco, Algeria, Kenya codes
  'Bulgaria': 'BG', 'Croatia': 'HR', 'Slovakia': 'SK', 'Lithuania': 'LT', // Bulgaria, Croatia, Slovakia, Lithuania codes
  'Latvia': 'LV', 'Estonia': 'EE', 'Slovenia': 'SI', 'Serbia': 'RS', // Latvia, Estonia, Slovenia, Serbia codes
}; // End of COUNTRY_CODES dictionary definition

function countryCode(name) { // Helper function to resolve/convert a country name to a 2-letter ISO code
  if (!name) return '??'; // If country name is falsy, return the unknown indicator code '??'
  if (name.length <= 3) return name.toUpperCase().slice(0, 2); // If name is already a code-like short string, return upper-case slice
  return COUNTRY_CODES[name] || name.slice(0, 2).toUpperCase(); // Perform lookup or return uppercase two-letter prefix fallback
} // End of countryCode helper definition

function startBitdefender(broadcast) { // Main function to establish WebSocket listener and stream Bitdefender threat map data
  console.log("[Bitdefender] Connecting to WebSocket..."); // Log socket connection initialization message
  const socket = io("https://threatmap.bitdefender.com", { // Connect socket client to Bitdefender's threat map endpoint
    path: "/socket.io/", // Specify custom path path for socket server handshake
    transports: ["websocket"], // Restrict transport layer strictly to WebSockets
    reconnection: true, // Enable automatic reconnect strategy
    reconnectionDelay: 3000, // Delay socket reconnection attempts by 3 seconds (3000ms)
  }); // Store reference to Socket.io client instance

  socket.on("connect", () => { // Bind connection event callback handler
    console.log("[Bitdefender] Connected to WebSocket"); // Log successful WebSocket connection message
    
    const events = ['botnet', 'portscan', 'telnet', 'ssh', 'rdp', 'vnc', 'mysql', 'mssql', 'http', 'iot', 'iot_botnet', 'infections', 'spam']; // Define array of attack topics
    events.forEach(eventName => { // Loop through each attack topic string
      socket.emit("subscribe", { event_name: eventName }); // Emit subscription message for the specific channel
    }); // End of events subscription loop
  }); // End of connect event callback

  socket.on("ev", (payloads) => { // Bind threat event payload callback listener
    if (!Array.isArray(payloads)) return; // If payload is not a valid list, skip processing
    if (payloads.length > 0) { // If payloads list contains elements
       console.log(`[Bitdefender] Received ${payloads.length} raw events. Sample: ${JSON.stringify(payloads[0]).slice(0, 200)}`); // Log debug sample representation
    } // End of payloads length validation check
    
    let processed = 0; // Initialize counter for tracking successfully formatted geo-valid items
    payloads.forEach(event => { // Iterate through each raw event in the batch payload list
      const from = event.from || (event.t === 'attacker' ? event.loc : null); // Extract source node details
      const to = event.to || (event.t === 'victim' ? event.loc : null); // Extract target node details
      
      let s_la = from ? (from.x || from.lat) : undefined; // Assign source latitude from coordinates
      let s_lo = from ? (from.y || from.long) : undefined; // Assign source longitude from coordinates
      let d_la = to ? (to.x || to.lat) : undefined; // Assign destination latitude from coordinates
      let d_lo = to ? (to.y || to.long) : undefined; // Assign destination longitude from coordinates

      if (s_la !== undefined && d_la === undefined) { // If source exists but target doesn't
          d_la = s_la + (Math.random() - 0.5) * 10; // Jitter source lat to create fake destination lat
          d_lo = s_lo + (Math.random() - 0.5) * 10; // Jitter source long to create fake destination long
      } else if (d_la !== undefined && s_la === undefined) { // If target exists but source doesn't
          s_la = d_la + (Math.random() - 0.5) * 10; // Jitter target lat to create fake source lat
          s_lo = d_lo + (Math.random() - 0.5) * 10; // Jitter target long to create fake source long
      } // End of one-sided coordinate fallbacks

      if (s_la === undefined || d_la === undefined) return; // Ignore event if coordinates couldn't be resolved or generated
      processed++; // Increment geo-valid processed events counter

      totalAttacks++; // Increment global sessions counter
      todayAttacks++; // Increment current session counter

      let a_t = 'exploit'; // Default attack type classification to exploit
      if (event.n === 'spam' || event.n === 'phishing') a_t = 'phishing'; // Map email/spam indicators to phishing
      if (event.n === 'botnet' || event.n === 'infections' || event.n === 'iot_botnet') a_t = 'malware'; // Map botnets/infections to malware

      const mappedEvent = { // Map socket event info to global ThreatEvent schema format
        a_c: 1, // Set attack count to 1 occurrence
        a_n: event.v || event.n || 'Bitdefender Threat', // Threat signature name or category name label
        a_t: a_t, // Set resolved attack type category
        s_ip: (from && (from.ip || from.host)) || 'unknown', // Map source IP address/host string
        s_co: countryCode((from && (from.c || from.c_iso)) || '??'), // Set parsed source country ISO code
        s_la: Number(s_la), // Set casted numeric source latitude coordinate
        s_lo: Number(s_lo), // Set casted numeric source longitude coordinate
        d_ip: (to && (to.ip || to.host)) || 'unknown', // Map destination IP address/host string
        d_co: countryCode((to && (to.c || to.c_iso)) || '??'), // Set parsed destination country ISO code
        d_la: Number(d_la), // Set casted numeric destination latitude coordinate
        d_lo: Number(d_lo), // Set casted numeric destination longitude coordinate
        meta: { // Populate Bitdefender specific metadata object
          service: event.n, // Original socket service channel name
          threat_name: event.v, // Specific signature name value
          attacker_info: from, // Raw attacker node details
          victim_info: to // Raw victim node details
        } // End of meta property definition
      }; // End of mappedEvent mapping

      broadcast('attack', mappedEvent); // Invoke broadcast callback passing mapped attack details

      if (totalAttacks % 50 === 0) { // Check if we should broadcast counter packets (every 50 events)
        broadcast('counter', { // Invoke broadcast callback passing event counts
          recentPeriod: totalAttacks, // Send total accumulated attack session statistics
          today: todayAttacks // Send session today statistics
        }); // End of counter payload dispatch
      } // End of modulo counter block
    }); // End of batch array parsing loop
    if (payloads.length > 0) { // If there were events in raw stream batch
      console.log(`[Bitdefender] Raw Events: ${payloads.length}, Geo-Valid Attacks: ${processed}`); // Log summary report
    } // End of batch logging conditional check
  }); // End of socket payloads listener

  socket.on("connect_error", (err) => { // Bind connection error callback listener
    console.error("[Bitdefender] Connection error:", err.message); // Log connection failure details
  }); // End of socket connect_error handler

  socket.on("disconnect", (reason) => { // Bind disconnection callback listener
    console.log("[Bitdefender] Disconnected:", reason); // Log termination reason string
  }); // End of socket disconnect handler
} // End of startBitdefender function definition

module.exports = { startBitdefender }; // Export the startBitdefender wrapper listener function

