const { EventSource } = require('eventsource'); // Import the eventsource library to listen to SSE streams

function startCheckpoint(broadcast) { // Define function to set up and manage Checkpoint scraper stream listener
  console.log("[Checkpoint] Connecting to SSE feed..."); // Log checkpoint stream listener start message
  
  const es = new EventSource('https://threatmap-api.checkpoint.com/ThreatMap/api/feed'); // Initialize EventSource connection pointing to Checkpoint's ThreatMap SSE API endpoint

  es.onopen = () => { // Bind connection open event handler
    console.log("[Checkpoint] Connected to SSE feed"); // Log successful SSE connection message
  }; // End of onopen callback definition

  // Handle both specific 'attack' events and generic 'onmessage'
  const handleData = (e) => { // Define callback function to parse SSE stream messages
    try { // Start try block to handle parsing safety
      const data = JSON.parse(e.data); // Deserialize event JSON message payload data string to object
      
      // Debug: Log structure 
      if (Math.random() < 0.1) { // Randomly sample 10% of stream logs for debugging
        console.log(`[Checkpoint] Stream Data Received. Fields: ${Object.keys(data).join(',')}`); // Log keys from stream details object
      } // End of log sampler validation

      // Checkpoint format check
      if (!data.a_t) return; // If event is missing the attack type field 'a_t', skip processing

      // Ensure arc visibility for same-region attacks
      let d_la_mapped = data.d_la; // Extract destination latitude from incoming data
      let d_lo_mapped = data.d_lo; // Extract destination longitude from incoming data
      if (data.s_la === d_la_mapped && data.s_lo === d_lo_mapped) { // If source coordinates and target coordinates are identical
        d_la_mapped += (Math.random() - 0.5) * 2; // Offset destination latitude coordinate by small random jitter
        d_lo_mapped += (Math.random() - 0.5) * 2; // Offset destination longitude coordinate by small random jitter
      } // End of overlapping coordinate jitter check

      const mappedEvent = { // Map retrieved event parameters to local ThreatEvent model schema
        a_c: data.a_c || 1, // Attack count defaulting to 1 occurrence
        a_n: data.a_n || 'Checkpoint Threat', // Attack name / threat classification label
        a_t: (['exploit', 'malware', 'phishing'].includes(data.a_t) ? data.a_t : 'exploit'), // Set validated attack type enum
        s_ip: data.s_ip || 'unknown', // Set source IP if available or default to unknown string
        s_co: (data.s_co === 'RF' ? 'RU' : data.s_co) || '??', // Map Russian Federation code RF to standard ISO code RU, fallback to ??
        s_la: Number(data.s_la) || 0, // Convert source latitude to number or default to 0
        s_lo: Number(data.s_lo) || 0, // Convert source longitude to number or default to 0
        d_ip: data.d_ip || 'unknown', // Set destination IP if available or default to unknown string
        d_co: (data.d_co === 'RF' ? 'RU' : data.d_co) || '??', // Map target country code RF to RU, fallback to ??
        d_la: Number(d_la_mapped) || 0, // Convert destination latitude to number or default to 0
        d_lo: Number(d_lo_mapped) || 0, // Convert destination longitude to number or default to 0
        meta: { // Populate checkpoint specific metadata object
          service_name: data.a_n, // Attach the original attack/service name signature string
          original_type: data.a_t // Attach the original threat category slug
        } // End of meta property definition
      }; // End of mappedEvent mapping

      broadcast('attack', mappedEvent, 'checkpoint'); // Invoke broadcast helper passing mapped attack details and scraper identifier
    } catch (err) { // Catch block for JSON parsing or runtime mapping failures
      // silent fail
    } // End of try-catch block
  }; // End of handleData definition

  es.onmessage = handleData; // Assign handleData callback to generic onmessage listener channel
  es.addEventListener('attack', handleData); // Assign handleData callback to specific EventSource event listener named attack

  es.onerror = (err) => { // Bind connection error callback listener
    console.error("[Checkpoint] SSE error - reconnecting..."); // Log SSE connection error / reconnection message
  }; // End of onerror callback definition
} // End of startCheckpoint definition

module.exports = { startCheckpoint }; // Export startCheckpoint function definition
