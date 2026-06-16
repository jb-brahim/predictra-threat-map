const axios = require('axios'); // Import Axios library for query client capability
const geoip = require('geoip-lite'); // Import geoip-lite library to map attacker IP addresses to coordinate values

/**
 * Kaspersky / Feodo Tracker Scraper
 *
 * Kaspersky has no public API for their cybermap live data.
 * Instead, we use Feodo Tracker (by abuse.ch) — a real-time feed of
 * active botnet Command & Control (C2) servers. This is the same kind
 * of data Kaspersky's map displays: malware & botnet activity globally.
 * No API key required.
 *
 * Endpoint: https://feodotracker.abuse.ch/downloads/ipblocklist.json
 */

// Define array of target coordinates representing major country targets
const TARGET_COUNTRIES = [
  { cc: 'US', lat: 37.0902, lon: -95.7129 }, // US target coordinates
  { cc: 'GB', lat: 55.3781, lon: -3.4360 }, // UK target coordinates
  { cc: 'DE', lat: 51.1657, lon: 10.4515 }, // Germany target coordinates
  { cc: 'FR', lat: 46.2276, lon: 2.2137 }, // France target coordinates
  { cc: 'JP', lat: 36.2048, lon: 138.2529 }, // Japan target coordinates
  { cc: 'AU', lat: -25.2744, lon: 133.7751 }, // Australia target coordinates
  { cc: 'BR', lat: -14.2350, lon: -51.9253 }, // Brazil target coordinates
  { cc: 'IN', lat: 20.5937, lon: 78.9629 }, // India target coordinates
  { cc: 'CA', lat: 56.1304, lon: -106.3468 }, // Canada target coordinates
  { cc: 'NL', lat: 52.1326, lon: 5.2913 }, // Netherlands target coordinates
]; // End of TARGET_COUNTRIES list definition

function randomTarget() { // Define helper function to select target country destination
  return TARGET_COUNTRIES[Math.floor(Math.random() * TARGET_COUNTRIES.length)]; // Math random index selector
} // End of randomTarget definition

// Feodo Tracker malware family → our attack type mapping
function mapMalwareType(malware) { // Define function mapping malware strings to general threat enums
  if (!malware) return 'malware'; // If malware name is falsy, default to malware enum
  const m = malware.toLowerCase(); // Cast malware signature to lowercase
  if (m.includes('bot') || m.includes('trickbot') || m.includes('emotet') || m.includes('dridex') || m.includes('qakbot')) return 'malware'; // Map botnets to malware
  if (m.includes('cobalt') || m.includes('metasploit') || m.includes('empire')) return 'exploit'; // Map APT frameworks to exploit
  return 'malware'; // Fallback mapping to malware enum
} // End of mapMalwareType definition

async function startKaspersky(broadcast) { // Define main orchestrator function to handle polling Feodo Tracker
  console.log('[Kaspersky/FeodoTracker] Scraper started. Polling every 60 seconds.'); // Log Kaspersky scraper startup message

  const poll = async () => { // Define inner async poller function
    try { // Begin try block for processing Feodo JSON list
      // Feodo Tracker: JSON list of active botnet C2 IP addresses
      // No API key required. Updated every ~5 minutes by abuse.ch.
      const res = await axios.get('https://feodotracker.abuse.ch/downloads/ipblocklist.json', { // Query abuse.ch endpoint
        timeout: 10000, // Timeout network request after 10s
        headers: { 'User-Agent': 'PredictraThreatMap/1.0 (educational project)' } // Attach customized user-agent header
      }); // Store promise response object

      if (!res.data || !Array.isArray(res.data)) { // Check if response data is an invalid array structure
        console.log('[Kaspersky/FeodoTracker] Unexpected response format'); // Log network payload error warning
        return; // Early return to prevent execution crashes
      } // End of response structure validation check

      // Filter to only actively reported C2 servers
      const active = res.data.filter(entry => entry.ip_address); // Filter list to retrieve objects containing valid IP addresses
      const sample = active.slice(0, 40); // Extract slice sample of 40 active entries per cycle

      console.log(`[Kaspersky/FeodoTracker] Feed has ${active.length} active C2 servers. Emitting ${sample.length}.`); // Log sample count status

      sample.forEach(entry => { // Iterate through each C2 server item in sample list
        const geo = geoip.lookup(entry.ip_address); // Query geoip details matching C2 server IP address
        if (!geo || !geo.ll) return; // Skip item if geolocation details are missing

        const [lat, lon] = geo.ll; // Destructure latitude and longitude array coordinates
        const target = randomTarget(); // Pick a randomized destination target details

        // Add small jitter so arcs spread out nicely
        const mappedEvent = { // Map retrieved values to standard ThreatEvent schema parameters
          a_c: 1, // Set attack count defaults to 1 occurrence
          a_n: `[Kaspersky] Botnet C2: ${entry.malware || 'Unknown Malware'} (${entry.ip_address})`, // Set descriptive attack name signature string
          a_t: mapMalwareType(entry.malware), // Map threat type based on malware family name
          s_ip: entry.ip_address, // Attacker C2 IP address
          s_co: geo.country || '??', // Attacker country code fallback to ??
          s_la: lat + (Math.random() - 0.5) * 1.5, // Attacker latitude coordinate with minor random jitter
          s_lo: lon + (Math.random() - 0.5) * 1.5, // Attacker longitude coordinate with minor random jitter
          d_co: target.cc, // Target destination country code
          d_la: target.lat + (Math.random() - 0.5) * 5, // Target destination latitude coordinate with jitter
          d_lo: target.lon + (Math.random() - 0.5) * 5, // Target destination longitude coordinate with jitter
          meta: { // Populate scraper-specific metadata fields
            malware_family: entry.malware, // Malware family taxonomy
            as_name: entry.as_name, // Attributed AS name
            as_number: entry.as_number, // Attributed AS number
            port: entry.port, // Port associated with C2 activity
            last_online: entry.last_online // Timestamp representing last active heartbeat
          } // End of meta property definition
        }; // End of mappedEvent mapping

        broadcast('attack', mappedEvent, 'kaspersky'); // Invoke broadcast helper passing mapped attack details and source tag
      }); // End of entries iteration loop

    } catch (err) { // Catch block for network or parsing errors
      console.error('[Kaspersky/FeodoTracker] Error polling:', err.message); // Log connection failure details
    } // End of try-catch block
  }; // End of poll definition

  // Initial poll immediately
  await poll(); // Execute immediate first poll invocation

  // Then every 60 seconds
  setInterval(poll, 60000); // Setup recurring interval trigger of 60 seconds (60000ms)
} // End of startKaspersky function definition

module.exports = { startKaspersky }; // Export startKaspersky scraper function
