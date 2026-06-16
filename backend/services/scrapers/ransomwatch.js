const axios = require('axios'); // Import Axios library to perform HTTP requests to the dark web scraper API

const TARGET_COUNTRIES = [ // Define array containing candidate victim countries coordinates
  { cc: 'US', lat: 37.0902, lon: -95.7129 }, // US target node details
  { cc: 'GB', lat: 55.3781, lon: -3.4360 }, // UK target node details
  { cc: 'CA', lat: 56.1304, lon: -106.3468 }, // Canada target node details
  { cc: 'AU', lat: -25.2744, lon: 133.7751 }, // Australia target node details
]; // End of TARGET_COUNTRIES list definition

function randomTarget() { // Define helper function to select a random target country destination
  return TARGET_COUNTRIES[Math.floor(Math.random() * TARGET_COUNTRIES.length)]; // Math floor random index selector
} // End of randomTarget definition

let lastRecordCount = 0; // Initialize state variable for tracking the number of records seen in the previous poll cycle

async function startRansomWatch(broadcast) { // Define main function to start tracking ransomware leak site listings
  console.log('[RansomWatch] Scraper started. Polling dark web ransomware leaks every 10 minutes.'); // Log scraper launch message

  const poll = async () => { // Define inner async poller function
    try { // Begin try block for querying the external API
      // Since ransomwatch is archived, we have successfully migrated to Ransomlook.io which is actively maintained!
      const response = await axios.get('https://www.ransomlook.io/api/recent', { // Query Ransomlook recent leaks list API
        timeout: 15000, // Timeout request after 15s
      }); // Store promise response

      const posts = response.data; // Assign response payload array reference
      if (!Array.isArray(posts)) return; // Terminate cycle if parsed payload is not a valid list

      // Ensure we don't bombard the UI on first load. Grab latest 15.
      let newLeaks = []; // Initialize array to hold newly discovered leaks
      if (lastRecordCount === 0) { // If this is the initial launch query
        newLeaks = posts.slice(0, 15); // Process only the 15 most recent leaks to avoid flooding the UI
      } else if (posts.length > lastRecordCount) { // If the list size has grown since last cycle
        newLeaks = posts.slice(0, posts.length - lastRecordCount); // Extract the subset of newer records
      } // End of launch index check
      
      lastRecordCount = posts.length; // Update tracking count state with current total count

      let emitted = 0; // Initialize cycle counter for tracking dispatched items
      newLeaks.forEach(item => { // Iterate through each new leak listing item
        const target = randomTarget(); // Pick a randomized destination victim country details
        
        const mappedEvent = { // Map retrieved leak details to global ThreatEvent parameters
          a_c: 1, // Set attack count defaults to 1 occurrence
          a_n: `[Ransomware Data Leak] ${item.post_title || 'Unknown Victim'}`, // Build descriptive threat name signature showing target name
          a_t: 'malware', // Ransomware actions are classified under malware category
          s_ip: item.group_name || 'Dark Web Actor', // Attacked source IP defaults to ransomware group name string
          // Ransomware rings are often operating out of Eastern Europe / Russian block, but routing through Tor
          s_co: 'RU', // Set origin country source code to RU for Eastern European region mapping
          s_la: 61.5240 + (Math.random() - 0.5) * 10, // Attacker latitude coordinates mapping to RU region with jitter
          s_lo: 105.3188 + (Math.random() - 0.5) * 20, // Attacker longitude coordinates mapping to RU region with jitter
          d_ip: item.post_title || 'Victim Org', // Destination IP mapped to victim organization name string
          d_co: target.cc, // Destination country code
          d_la: target.lat + (Math.random() - 0.5) * 4, // Jitter destination latitude coordinate for display spacing
          d_lo: target.lon + (Math.random() - 0.5) * 4, // Jitter destination longitude coordinate for display spacing
          meta: { // Populate ransomware specific metadata fields
            threat_type: 'Ransomware Extortion', // Threat type categorization
            malware_family: item.group_name, // Ransomware gang identifier name
            tags: ['#ransomware', '#dataleak', `#${item.group_name}`], // Mapped tag indicators
            description: 'Data published on active ransomware actor TOR site.', // Generic context description
            url: item.link ? `https://www.ransomlook.io${item.link}` : '', // Build direct leak report URL link
            published_date: new Date().toISOString() // Mapped publication timestamp
          } // End of meta property definition
        }; // End of mappedEvent mapping

        setTimeout(() => { // Schedule delayed broadcast sequence
          broadcast('attack', mappedEvent, 'ransomwatch'); // Invoke broadcast helper passing mapped attack details and source tag
        }, Math.random() * 8000); // Randomized stagger delay up to 8 seconds (8000ms)
        emitted++; // Increment generated events count
      }); // End of newLeaks iteration loop

      console.log(`[RansomLook API] Emitted ${emitted} active dark web ransomware leaks.`); // Log polling status summary
    } catch (err) { // Catch networking or loop exceptions
      console.error('[RansomLook API] Error polling dark web:', err.message); // Log connection failure details
    } // End of try-catch block
  }; // End of poll definition

  await poll(); // Execute immediate initial poll call on startup
  // Ransomware leaks update slowly, polling every 10 min is fine
  setInterval(poll, 600000); // Setup recurring interval trigger of 10 minutes (600,000ms)
} // End of startRansomWatch definition

module.exports = { startRansomWatch }; // Export startRansomWatch scraper helper function
