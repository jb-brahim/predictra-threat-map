const axios = require('axios'); // Import Axios library for fetching threat intelligence payloads via HTTP

let outbreakId = null; // Initialize state variable for tracking Fortinet outbreak ID
let totalAttacks = 0; // Initialize state variable for tracking aggregated attack count

async function getOutbreakId() { // Define asynchronous function to fetch the current active tracking outbreak ID
  try { // Start try block to wrap outbreak endpoint request safely
    const res = await axios.get('https://fortiguard.fortinet.com/api/threatmap/outbreaks'); // Fetch list of active outbreaks from Fortinet API
    if (res.data && res.data.length > 0) { // Check if the response contains data array elements
      // Skip "All Outbreaks" (id: 0) and pick the first real outbreak
      const validOutbreak = res.data.find(o => o.id !== 0); // Search the outbreak array to find a record whose ID is not 0
      outbreakId = validOutbreak ? validOutbreak.id : res.data[0].id; // Assign valid ID if found, otherwise default to first array entry
      console.log(`[Fortinet] Selected tracking outbreak ID: ${outbreakId}`); // Log selected outbreak ID
    } // End of response structure validation check
  } catch (err) { // Catch block for network or lookup exceptions
    console.error("[Fortinet] Error fetching outbreaks:", err.message); // Log outbreak ID lookup errors
  } // End of try-catch block
} // End of getOutbreakId definition

async function pollFortinet(broadcast) { // Define asynchronous function to poll live outbreak events
  if (!outbreakId) { // Check if outbreak ID tracking state is currently unassigned
    await getOutbreakId(); // Await outbreak ID retrieval sequence
    if (!outbreakId) return; // If outbreak ID is still resolved to falsy, terminate polling loop cycle
  } // End of outbreak ID validation check

  try { // Start try block for live threat map event endpoint query
    // Query outbreak events API using current outbreakId tracking state
    const res = await axios.get(`https://fortiguard.fortinet.com/api/threatmap/live/outbreak?outbreak_id=${outbreakId}&limit=50&segment_sec=1800&last_sec=10800&replay=false`);
    
    if (res.data && res.data.ips) { // Validate response data structure contains an ips collection dictionary
      const slices = Object.keys(res.data.ips); // Extract array of keys representing time slices
      let eventCount = 0; // Initialize cycle counter for tracking events unpacked
      for (const ts in res.data.ips) { // Iterate through each time slice property in the ips dictionary
        const events = res.data.ips[ts]; // Reference array of events registered at this time stamp
        if (Array.isArray(events)) eventCount += events.length; // If events variable is a valid list, increment the event count
        if (!Array.isArray(events)) continue; // If events variable is not a valid list, skip to next timestamp slice
        events.forEach(ev => { // Iterate through each individual event object in slice
          if (!ev || !ev.src_lat || !ev.dest_lat) return; // Skip item if event coordinate mappings are missing
          totalAttacks += ev.count || 1; // Increment running attacks count by event occurrences quantity or default to 1
          
          const mappedEvent = { // Map retrieved attributes to global ThreatEvent model properties
            a_c: ev.count || 1, // Set attack count to occurrences count or default to 1
            a_n: ev.vuln_name || (ev.outbreak_alert && ev.outbreak_alert[0]) || 'Fortinet Alert', // Set attack name descriptive string
            a_t: 'exploit', // Set category type mapping to exploit
            s_ip: ev.src_ip || 'unknown', // Map source attacker IP address or default to unknown string
            s_co: ev.src_country || '??', // Map source country code prefix or default to ??
            s_la: ev.src_lat, // Assign source latitude coordinate
            s_lo: ev.src_long, // Assign source longitude coordinate
            d_ip: ev.dest_ip || 'unknown', // Map target destination IP address or default to unknown string
            d_co: ev.dest_country || '??', // Map target country code prefix or default to ??
            d_la: ev.dest_lat, // Assign destination latitude coordinate
            d_lo: ev.dest_long, // Assign destination longitude coordinate
            meta: { // Populate Fortinet specific metadata fields
              vulnerability: ev.vuln_name, // Attributed vulnerability signature name
              outbreak_id, // Active outbreak ID token
              severity: ev.severity, // Threat severity classification level
              threat_score: ev.threat_score // Threat score magnitude value
            } // End of meta property definition
          }; // End of mappedEvent mapping

          broadcast('attack', mappedEvent); // Invoke broadcast helper passing mapped attack details
        }); // End of individual events array loop
      } // End of timeslices iteration loop
      console.log(`[Fortinet] Polled Outbreak ${outbreakId}. Found ${eventCount} events across ${slices.length} time slices.`); // Log cycle summary status message
    } else { // Handle state where response data is missing ips property
      console.log(`[Fortinet] Polled Outbreak ${outbreakId}. No event data in current window.`); // Log empty interval warning message
    } // End of response structure validation block
  } catch (err) { // Catch endpoint lookup or loop runtime exceptions
    console.error("[Fortinet] Error polling:", err.message); // Log network polling failures
  } // End of try-catch block
} // End of pollFortinet definition

function startFortinet(broadcast) { // Define scraper orchestrator entrypoint function
  console.log("[Fortinet] Scraper started. Polling every 4 seconds."); // Log scraper start message
  setInterval(() => pollFortinet(broadcast), 4000); // Register recurring task schedule to poll Fortinet every 4 seconds (4000ms)
  getOutbreakId(); // Trigger immediate asynchronous check to determine current outbreak ID
} // End of startFortinet definition

module.exports = { startFortinet }; // Export startFortinet setup function
