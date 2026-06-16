const axios = require('axios'); // Import Axios library to fetch malicious URLs list via HTTP
const geoip = require('geoip-lite'); // Import geoip-lite library to map domain hostnames to physical coordinates

/**
 * URLhaus (abuse.ch) Scraper
 *
 * Fetches recent malicious URLs hosting malware.
 *
 * API: https://urlhaus-api.abuse.ch/v1/urls/recent/
 * Optionally set URLHAUS_API_KEY in your .env for authenticated (higher rate limit) access.
 * The API still works without a key until June 30, 2025, after which a free key is required.
 * Get a free key at: https://auth.abuse.ch/
 *
 * For the destination we use the SANS/Checkpoint-style approach:
 * show arcs flowing TO a randomized major hub country.
 */

const TARGET_COUNTRIES = [ // Define array containing candidate destination coordinates for threat visualization
  { cc: 'US', lat: 37.0902, lon: -95.7129 }, // US target coordinates details
  { cc: 'GB', lat: 55.3781, lon: -3.4360 }, // UK target coordinates details
  { cc: 'DE', lat: 51.1657, lon: 10.4515 }, // Germany target coordinates details
  { cc: 'FR', lat: 46.2276, lon: 2.2137 }, // France target coordinates details
  { cc: 'JP', lat: 36.2048, lon: 138.2529 }, // Japan target coordinates details
  { cc: 'CA', lat: 56.1304, lon: -106.3468 }, // Canada target coordinates details
  { cc: 'AU', lat: -25.2744, lon: 133.7751 }, // Australia target coordinates details
  { cc: 'NL', lat: 52.1326, lon: 5.2913 }, // Netherlands target coordinates details
]; // End of TARGET_COUNTRIES list definition

function randomTarget() { // Define helper function to select a random target country destination
  return TARGET_COUNTRIES[Math.floor(Math.random() * TARGET_COUNTRIES.length)]; // Math floor random index selector
} // End of randomTarget definition

async function startUrlhaus(broadcast) { // Define main orchestrator function to poll URLhaus feed
  console.log('[URLhaus] Scraper started. Polling every 90 seconds.'); // Log URLhaus scraper start message

  const poll = async () => { // Define inner async poller function
    try { // Begin try block for safe retrieval and parsing of recent URLs
      const headers = {}; // Initialize empty request headers configuration object
      const apiKey = process.env.URLHAUS_API_KEY; // Read URLhaus API key from environment configuration
      if (apiKey) { // If an API key is available in environment
        headers['Auth-Key'] = apiKey; // Assign Auth-Key header parameter
      } // End of API key check

      const response = await axios.get('https://urlhaus-api.abuse.ch/v1/urls/recent/', { // Fetch recent malicious URLs listing
        headers, // Attach generated headers (auth key if present)
        timeout: 15000, // Timeout network request after 15 seconds
      }); // Store promise response object

      if ( // Start validation block to verify response payload has the expected list format
        !response.data || // Verify response contains data object
        !response.data.urls || // Verify response contains urls collection field
        !Array.isArray(response.data.urls) // Verify urls field is a valid list array
      ) { // End of conditions list
        console.warn('[URLhaus] Unexpected response format'); // Log unexpected payload warning
        return; // Early return to avoid runtime errors on undefined data
      } // End of response structure validation check

      // Filter to only "online" (active) malware URLs
      const activeUrls = response.data.urls // Process URLs list
        .filter(item => item.url_status === 'online' || item.url_status === 'unknown') // Filter list to retrieve online/unknown status elements
        .slice(0, 50); // Extract slice sample containing first 50 active items

      console.log(`[URLhaus] Fetched ${response.data.urls.length} URLs. Using ${activeUrls.length} active ones.`); // Log status stats

      let emitted = 0; // Initialize cycle counter for tracking dispatched items
      activeUrls.forEach(item => { // Iterate through each active URL record
        let host = ''; // Initialize empty variable to hold resolved host string
        try { // Try block to safely parse URL string
          const url = new URL(item.url); // Parse URL using standard browser/node URL parser utility
          host = url.hostname; // Extract hostname string from URL component structure
        } catch { // Catch parsing failure exceptions
          return; // Skip item if URL parsing failed
        } // End of inner try-catch block

        const geo = geoip.lookup(host); // Query geoip-lite matching host string
        if (!geo || !geo.ll) return; // Skip item if geolocation coordinate details are missing

        const [lat, lon] = geo.ll; // Destructure latitude and longitude array coordinates
        const target = randomTarget(); // Pick a randomized destination target details

        const mappedEvent = { // Map resolved parameters to global ThreatEvent schema format
          a_c: 1, // Set attack count defaults to 1 occurrence
          a_n: `[URLhaus] Malware Distribution: ${item.threat || 'unknown'} (${host})`, // Construct descriptive threat name signature string
          a_t: 'malware', // URLhaus malware URL activities are mapped to malware category type
          s_ip: host, // Set attacker source IP to host domain/IP string
          s_co: geo.country || '??', // Attacker country code fallback to ??
          s_la: lat + (Math.random() - 0.5) * 1, // Attacker latitude coordinate with minor random jitter
          s_lo: lon + (Math.random() - 0.5) * 1, // Attacker longitude coordinate with minor random jitter
          d_co: target.cc, // Destination country code
          d_la: target.lat + (Math.random() - 0.5) * 4, // Target latitude coordinate with jitter for visual spacing
          d_lo: target.lon + (Math.random() - 0.5) * 4, // Target longitude coordinate with jitter for visual spacing
          meta: { // Populate URLhaus specific metadata fields
            threat_type: item.threat, // Threat category classification
            tags: item.tags || [], // Mapped associated threat tags list
            url: item.url, // Host URL string hosting malware payload
            reporter: item.reporter, // Reporter username string
            status: item.url_status // Malware online/offline status parameter
          } // End of meta property definition
        }; // End of mappedEvent mapping

        broadcast('attack', mappedEvent, 'urlhaus'); // Invoke broadcast helper passing mapped attack details and scraper identifier
        emitted++; // Increment successfully processed event counter
      }); // End of activeUrls iteration loop

      console.log(`[URLhaus] Emitted ${emitted} geo-valid events.`); // Log polling status summary
    } catch (err) { // Catch networking or loop exceptions
      console.error('[URLhaus] Error polling:', err.message); // Log connection errors
    } // End of try-catch block
  }; // End of poll definition

  await poll(); // Execute immediate initial poll cycle on startup
  setInterval(poll, 90000); // Setup recurring interval trigger of 90 seconds (90,000ms)
} // End of startUrlhaus definition

module.exports = { startUrlhaus }; // Export startUrlhaus scraper setup helper
