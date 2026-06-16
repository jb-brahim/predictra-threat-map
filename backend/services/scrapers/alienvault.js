const axios = require('axios'); // Import Axios library for HTTP client functionality
const geoip = require('geoip-lite'); // Import geoip-lite library to map IP addresses to physical coordinates

// Define list of major countries to act as mock target locations for threat visualization
const TARGET_COUNTRIES = [
  { cc: 'US', lat: 37.0902, lon: -95.7129 }, // USA coordinate and country code metadata
  { cc: 'GB', lat: 55.3781, lon: -3.4360 }, // UK coordinate and country code metadata
  { cc: 'DE', lat: 51.1657, lon: 10.4515 }, // Germany coordinate and country code metadata
  { cc: 'FR', lat: 46.2276, lon: 2.2137 }, // France coordinate and country code metadata
  { cc: 'JP', lat: 36.2048, lon: 138.2529 } // Japan coordinate and country code metadata
]; // End of TARGET_COUNTRIES array definition

// Define helper to return a random target country object from the list
function randomTarget() {
  return TARGET_COUNTRIES[Math.floor(Math.random() * TARGET_COUNTRIES.length)]; // Math floor random array lookup
} // End of randomTarget definition

// Define asynchronous main function to launch and manage the AlienVault scraper
async function startAlienVault(broadcast) {
  console.log('[AlienVault OTX] Scraper started. Polling every 5 minutes.'); // Log scraper initialization message

  const poll = async () => { // Define inner async poller function
    try { // Try block to execute requests and data mappings safely
      const headers = {}; // Initialize empty request headers configuration object
      const apiKey = process.env.ALIENVAULT_API_KEY; // Read AlienVault OTX API key from environment configuration
      if (apiKey) { // If an API key is available in environment
        headers['X-OTX-API-KEY'] = apiKey; // Assign OTX API key header attribute
      } // End of API key check

      // Fetch recent global pulses (cyber attack reports)
      const response = await axios.get('https://otx.alienvault.com/api/v1/pulses/activity', { // Query the AlienVault activity feed
        headers, // Attach generated headers (API key if present)
        timeout: 10000, // Timeout the request after 10 seconds
      }); // Store promise response object

      if (!response.data || !response.data.results) { // Validate response payload structure has results
        console.warn('[AlienVault OTX] Unexpected response format'); // Log parsing warning message
        return; // Early return to avoid runtime errors on undefined results
      } // End of response structure validation

      // Process the top recent pulses
      const pulses = response.data.results.slice(0, 20); // Extract first 20 records to process
      let emitted = 0; // Initialize counter for tracking successfully processed records

      pulses.forEach(item => { // Iterate through each pulse report item
        // OTX Pulses are deeply detailed reports containing IP/Domain indicators
        // We will broadcast the Pulse itself as a major attack event
        const target = randomTarget(); // Fetch a random target country context
        
        const mappedEvent = { // Map pulse information to the global ThreatEvent format
          a_c: item.indicator_count || 1, // Number of indicators in the pulse, default to 1
          a_n: `[AlienVault] ${item.name || 'Threat Intelligence Pulse'}`, // Name signature referencing the OTX report name
          a_t: 'exploit', // Categorizing as exploit/APT activity
          s_ip: item.author_name || 'OTX Community', // Source attribution to author or community name
          s_co: '??', // Set to unknown origin country since pulse reports represent global indicators
          s_la: (Math.random() - 0.5) * 60, // Set randomized origin latitude coordinate
          s_lo: (Math.random() - 0.5) * 180, // Set randomized origin longitude coordinate
          d_co: target.cc, // Set destination country code from random target location
          d_la: target.lat + (Math.random() - 0.5) * 4, // Jitter target latitude coordinate for visual spacing
          d_lo: target.lon + (Math.random() - 0.5) * 4, // Jitter target longitude coordinate for visual spacing
          meta: { // Populate scraper-specific metadata properties
            threat_type: 'APT / Deep Intel', // Threat type categorization
            malware_family: item.malware_families?.[0] || 'Unknown', // Primary malware family name or default to Unknown
            tags: item.tags || [], // Attach all tags associated with the pulse
            reporter: item.author_name, // Attach pulse author string
            url: `https://otx.alienvault.com/pulse/${item.id}`, // Build direct web URL referencing the pulse report
            description: item.description || '' // Attach report description if present
          } // End of meta definition
        }; // End of mappedEvent object mapping

        // Delay slightly so they don't all hit the globe at the exact same millisecond
        setTimeout(() => { // Schedule event broadcast using standard timer
          broadcast('attack', mappedEvent, 'alienvault'); // Trigger broadcast callback passing attack details and source API
        }, Math.random() * 5000); // Randomized delay interval up to 5000ms
        emitted++; // Increment successfully scheduled event counter
      }); // End of pulses processing loop

      console.log(`[AlienVault OTX] Emitted ${emitted} deep threat intelligence pulses.`); // Log final processing report
    } catch (err) { // Capture networking or execution errors
      console.error('[AlienVault OTX] Error polling activity:', err.message); // Log query failures
    } // End of try-catch block
  }; // End of poll definition

  await poll(); // Execute immediate initial poll on startup
  setInterval(poll, 300000); // Setup recurring poller execution interval of 5 minutes (300,000ms)
} // End of startAlienVault function definition

module.exports = { startAlienVault }; // Export startAlienVault function configuration
