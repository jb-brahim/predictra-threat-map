const axios = require('axios'); // Import Axios library for fetching text feeds via HTTP
const geoip = require('geoip-lite'); // Import geoip-lite library to map attacker IP addresses to coordinates

// A selection of the most dangerous and popular C2 frameworks and RATs from the GitHub repo
const C2_FEEDS = [ // Define array containing references to active command & control tracker text feeds on GitHub
  { name: 'Cobalt Strike', url: 'https://raw.githubusercontent.com/montysecurity/C2-Tracker/main/data/Cobalt%20Strike%20C2%20IPs.txt' }, // Cobalt Strike IP list source
  { name: 'Sliver C2', url: 'https://raw.githubusercontent.com/montysecurity/C2-Tracker/main/data/Sliver%20C2%20IPs.txt' }, // Sliver C2 IP list source
  { name: 'Havoc C2', url: 'https://raw.githubusercontent.com/montysecurity/C2-Tracker/main/data/Havoc%20C2%20IPs.txt' }, // Havoc C2 IP list source
  { name: 'Remcos RAT', url: 'https://raw.githubusercontent.com/montysecurity/C2-Tracker/main/data/Remcos%20RAT%20IPs.txt' }, // Remcos RAT IP list source
  { name: 'Metasploit', url: 'https://raw.githubusercontent.com/montysecurity/C2-Tracker/main/data/Metasploit%20Framework%20C2%20IPs.txt' } // Metasploit IP list source
]; // End of C2_FEEDS definition

// Target major cloud provider regions or victim dense countries to visualize outbound attacks
const TARGET_COUNTRIES = [ // Define array of coordinates representing major targets
  { cc: 'US', lat: 37.0902, lon: -95.7129 }, // US coordinates
  { cc: 'GB', lat: 55.3781, lon: -3.4360 }, // UK coordinates
  { cc: 'FR', lat: 46.2276, lon: 2.2137 }, // France coordinates
  { cc: 'DE', lat: 51.1657, lon: 10.4515 }, // Germany coordinates
  { cc: 'JP', lat: 36.2048, lon: 138.2529 } // Japan coordinates
]; // End of TARGET_COUNTRIES definition

function randomTarget() { // Define helper function to fetch random destination target
  return TARGET_COUNTRIES[Math.floor(Math.random() * TARGET_COUNTRIES.length)]; // Select target country randomly using index math
} // End of randomTarget definition

async function startC2Tracker(broadcast) { // Define async function to start polling the C2 tracking feeds
  console.log('[C2-Tracker] Scraper started. Polling GitHub repositories every 15 minutes.'); // Log C2-Tracker start message

  const poll = async () => { // Define inner async poller function
    try { // Begin try block to retrieve and process feeds safely
      let emitted = 0; // Initialize counter to track events generated in this polling cycle

      for (const feed of C2_FEEDS) { // Iterate through each feed in the C2 list
        const response = await axios.get(feed.url, { timeout: 15000 }); // Perform HTTP GET request on the raw feed URL with 15s timeout
        if (!response.data) continue; // If response body is empty, skip to the next feed

        // Parse plaintext IPs separated by newlines
        const ips = response.data.split('\n').map(ip => ip.trim()).filter(ip => ip.length > 5); // Split text body, trim strings, filter out invalid/empty IPs
        if (ips.length === 0) continue; // If no IPs remain after filtering, skip feed

        // We don't want to flood the globe with 5,000 Cobalt Strike IPs instantly
        // So we grab a random sample of 10 active C2 IPs from each list every cycle
        const sampleSize = Math.min(10, ips.length); // Limit sample size to 10 or the total number of IPs, whichever is smaller
        const randomSample = ips.sort(() => 0.5 - Math.random()).slice(0, sampleSize); // Shuffle list randomly and extract sample slice

        randomSample.forEach(ip => { // Iterate through each IP in the sampled array
          const geo = geoip.lookup(ip); // Query geoip-lite lookup to get geographic details for this IP
          if (!geo) return; // Skip IP if geolocation could not be resolved

          const target = randomTarget(); // Pick a randomized target destination country details
          
          const mappedEvent = { // Map resolved attributes into the standard ThreatEvent schema format
            a_c: 1, // Attack count defaults to 1 occurrence
            a_n: `[C2 Server] ${feed.name} Activity Detected`, // Build attack name descriptive string
            a_t: 'malware', // C2 infra usually implies malware control
            s_ip: ip, // Source attacker IP address
            s_co: geo.country || '??', // Source attacker country code from geo lookup
            s_la: geo.ll[0] + (Math.random() - 0.5) * 1, // Attacker latitude coordinate with minor jitter
            s_lo: geo.ll[1] + (Math.random() - 0.5) * 1, // Attacker longitude coordinate with minor jitter
            d_ip: `Victim Endpoint`, // Destination label representing the target endpoint
            d_co: target.cc, // Target destination country code
            d_la: target.lat + (Math.random() - 0.5) * 3, // Target latitude coordinate with jitter
            d_lo: target.lon + (Math.random() - 0.5) * 3, // Target longitude coordinate with jitter
            meta: { // Populate C2 tracking metadata attributes
              threat_type: 'Command and Control (C2)', // Threat category
              malware_family: feed.name, // Malware framework name
              tags: ['#c2', '#botnet', `#${feed.name.replace(/\s+/g,"").toLowerCase()}`], // Attach tagging labels
              description: `Active ${feed.name} Command & Control server logged in live GitHub tracker.`, // Detailed description
              url: 'https://github.com/montysecurity/C2-Tracker', // Code repository project source link
              reporter: 'montysecurity' // GitHub handle of intelligence feed author
            } // End of meta property definition
          }; // End of mappedEvent structure mapping

          // Stagger the visualization so it looks like a continuous swarm
          setTimeout(() => { // Schedule delayed broadcast execution
            broadcast('attack', mappedEvent, 'c2tracker'); // Dispatch attack event pass details and scraper slug
          }, Math.random() * 10000); // Apply random delay of up to 10 seconds (10000ms)
          emitted++; // Increment generated events counter
        }); // End of sample IPs processing loop
      } // End of C2 feeds loop

      console.log(`[C2-Tracker] Emitted ${emitted} live Command & Control botnet IPs from GitHub.`); // Log status report
    } catch (err) { // Catch networking or parsing exceptions
      console.error('[C2-Tracker] Error polling GitHub:', err.message); // Log connection errors
    } // End of try-catch block
  }; // End of poll definition

  await poll(); // Execute immediate initial poll sequence on launch
  // Poll GitHub every 15 minutes
  setInterval(poll, 900000); // Set recurring trigger interval to 15 minutes (900,000ms)
} // End of startC2Tracker definition

module.exports = { startC2Tracker }; // Export startC2Tracker function reference
