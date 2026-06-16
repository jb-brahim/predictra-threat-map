/**
 * Intelligence-driven Sector Enrichment Service
 * 
 * This service maps raw threat data (victim names, ports, malware families)
 * to real-world industrial sectors.
 */

const axios = require('axios'); // Import Axios library for making HTTP requests

// Cache to avoid repeated RDAP lookups
const rdapCache = new Map(); // Create an in-memory Map to cache IP RDAP query results

/**
 * RDAP-based IP Owner/Organization Lookup
 * Fetches the organization/owner of an IP address using RDAP (modern WHOIS).
 */
async function getIpOrganization(ip) { // Define async function to fetch IP owner organization
  if (!ip || ip === 'unknown') return 'Unknown Organization'; // Return default string if IP is falsy or marked 'unknown'
  if (rdapCache.has(ip)) return rdapCache.get(ip); // Return cached organization if lookup was already performed

  try { // Try block to perform network request safely
    // Using rdap.org as a redirector to the correct regional registry (ARIN, RIPE, etc.)
    const response = await axios.get(`https://rdap.org/ip/${ip}`, { // Call regional registry redirector API for IP details
      timeout: 3000, // Timeout request after 3000ms
      headers: { 'Accept': 'application/rdap+json' } // Request RDAP JSON format via headers
    }); // Store promise response

    let orgName = 'Unknown Organization'; // Initialize organization name with fallback default string

    if (response.data) { // If response contains body data
      // Try to find organization name in 'entities' or 'remarks'
      const entities = response.data.entities || []; // Extract entities array from response data, defaulting to empty list
      const vcardOrg = entities // Map over entities to extract organization or name vcard details
        .flatMap(e => e.vcardArray?.[1] || []) // Flatten vcard array entries
        .find(entry => entry[0] === 'fn' || entry[0] === 'org'); // Locate vcard entry for formal name or organization

      if (vcardOrg) { // If a matching vcard entry is found
        orgName = vcardOrg[3]; // Extract the text name from the vcard structure
      } else if (response.data.name) { // Fall back to checking the main body object name property
        orgName = response.data.name; // Assign root name property as organization name
      } // End of inner conditional checks
    } // End of response data check

    rdapCache.set(ip, orgName); // Cache lookup results to prevent duplicate network calls for this IP
    return orgName; // Return resolved organization name string
  } catch (err) { // Catch block for network or parsing failures
    // If RDAP fails, we don't want to block the scraper
    return 'Unknown Organization'; // Return default fallback string on error
  } // End of try-catch block
} // End of getIpOrganization function definition

// 1. Known Sector Keywords (High-Confidence)
const KEYWORD_MAP = { // Define dictionary mapping sectors to lists of indicator keywords
  // Healthcare
  healthcare: ['hospital', 'clinic', 'medical', 'pharma', 'health', 'patient', 'biotech', 'dental', 'nursing', 'pediatric', 'healthcare', 'sanatorium'], // Keywords for medical sector
  // Finance
  finance: ['bank', 'insurance', 'crypto', 'asset', 'capital', 'investment', 'lending', 'credit', 'wealth', 'fintech', 'trading', 'chase', 'goldman', 'morgan', 'barclays', 'hsbc', 'citi'], // Keywords for banking and finance
  // Government
  government: ['ministry', 'department', 'gov', 'state', 'federal', 'military', 'defense', 'agency', 'council', 'police', 'embassy', 'army', 'navy', 'parliament'], // Keywords for state entities
  // Education
  education: ['university', 'college', 'school', 'academy', 'institute', 'education', 'district', 'campus', 'scholar'], // Keywords for academic entities
  // Energy / Utilities
  energy: ['oil', 'gas', 'power', 'electric', 'energy', 'utility', 'solar', 'hydro', 'nuclear', 'grid', 'petroleum', 'pipeline'], // Keywords for energy sector
  // Technology
  technology: ['software', 'tech', 'digital', 'systems', 'networks', 'cloud', 'computing', 'cyber', 'data', 'silicon', 'technology', 'intelligence'], // Keywords for tech sector
  // Manufacturing
  manufacturing: ['industrial', 'manufacturing', 'factory', 'steel', 'automotive', 'aerospace', 'chemicals', 'machinery', 'textiles', 'construction'], // Keywords for manufacturing sector
  // Retail
  retail: ['shop', 'retail', 'market', 'commerce', 'store', 'fashion', 'luxury', 'mall', 'supermarket'], // Keywords for commerce/retail sector
  // Telecommunications
  telecom: ['telecom', 'mobile', 'wireless', 'broadband', 'satellite', 'connectivity', 'communication', 'telephony'] // Keywords for telecom sector
}; // End of KEYWORD_MAP definition

// 2. Mapping to your friend's established categories (Migration Layer)
const CATEGORY_MAPPING = { // Define user-facing labels for each sector key
  healthcare: 'Healthcare / Medical', // Mapping healthcare sector key
  finance: 'Finance / Business', // Mapping finance sector key
  government: 'Government / Defense', // Mapping government sector key
  education: 'Education / Academic', // Mapping education sector key
  energy: 'Energy / Utilities', // Mapping energy sector key
  technology: 'IT Infrastructure', // Mapping technology sector key
  manufacturing: 'Industrial Manufacturing', // Mapping manufacturing sector key
  retail: 'Retail / Commerce', // Mapping retail sector key
  telecom: 'Telecommunications', // Mapping telecom sector key
  web: 'Web Services', // Mapping web infrastructure key
  db: 'Database Services' // Mapping database infrastructure key
}; // End of CATEGORY_MAPPING definition

/**
 * Main enrichment logic
 */
function getEnrichedSector(event) { // Define main sector classification extractor function
  const victimName = (event.d_ip || '').toLowerCase(); // Actually the victim name in Ransomwatch - extract and cast to lowercase
  const attackName = (event.a_n || '').toLowerCase(); // Extract attack name/signature, cast to lowercase
  const malwareFamily = (event.meta?.malware_family || '').toLowerCase(); // Extract malware family from metadata, cast to lowercase
  const threatType = (event.meta?.threat_type || '').toLowerCase(); // Extract threat type from metadata, cast to lowercase
  const port = event.meta?.port; // Extract network port if present in metadata
  
  const combinedText = `${victimName} ${attackName} ${malwareFamily} ${threatType}`; // Concatenate threat context strings to form search corpus

  // Helper for matching with word boundaries
  const matches = (text, keywords) => { // Define inner helper to search for list of keywords
    return keywords.some(kw => { // Check if any keyword matches the search pattern
      const regex = new RegExp(`\\b${kw}\\b`, 'i'); // Create a case-insensitive regular expression anchored to word boundaries
      return regex.test(text); // Execute regex test and return boolean result
    }); // End of keyword check loop
  }; // End of matches helper definition

  // 1. Try Keyword Matching on Victim Name (Highest Confidence)
  for (const [sector, keywords] of Object.entries(KEYWORD_MAP)) { // Iterate through the high confidence keyword map entries
    if (matches(victimName, keywords)) { // Perform search specifically on victim name string
      return CATEGORY_MAPPING[sector]; // Return mapped human-readable sector on match
    } // End of matches condition
  } // End of loop over key words

  // 2. Try Keyword Matching on Combined Text
  for (const [sector, keywords] of Object.entries(KEYWORD_MAP)) { // Iterate through map entries again for broader match
    if (matches(combinedText, keywords)) { // Perform search across concatenated text corpus
      return CATEGORY_MAPPING[sector]; // Return mapped human-readable sector on match
    } // End of matches condition
  } // End of loop over keywords


  // 3. Port-Based Fallback (Infrastructure classification)
  if (port) { // If a network port was extracted
    const p = parseInt(port); // Parse port value to integer
    if ([80, 443, 8080, 8443].includes(p)) return CATEGORY_MAPPING.web; // Return Web Services if matching HTTP/HTTPS ports
    if ([3306, 5432, 1433, 27017, 6379].includes(p)) return CATEGORY_MAPPING.db; // Return Database Services if database port
    if ([22, 23, 21, 53, 161].includes(p)) return CATEGORY_MAPPING.technology; // Return IT Infrastructure for management/infrastructure ports
    if ([445, 139, 3389].includes(p)) return 'Enterprise Network'; // Return Enterprise Network for SMB/RDP protocols
    if ([25, 587, 465, 110, 143].includes(p)) return 'Email / Communication'; // Return Email / Communication for SMTP/POP/IMAP protocols
  } // End of port check block

  // 4. MISP Galaxy sector enrichment
  const galaxySectors = event.meta?.galaxy_target_sectors || []; // Extract target sectors list from MISP galaxy metadata
  if (galaxySectors.length > 0) { // If target sectors are defined in the intelligence source
    const s = galaxySectors[0].toLowerCase(); // Take primary sector tag and convert to lowercase
    if (s.includes('government') || s.includes('military') || s.includes('defense')) return 'Government / Defense'; // Return Government / Defense sector
    if (s.includes('private sector') || s.includes('finance') || s.includes('business')) return 'Finance / Business'; // Return Finance / Business sector
    if (s.includes('health') || s.includes('medical') || s.includes('biomedical')) return 'Healthcare / Medical'; // Return Healthcare / Medical sector
    if (s.includes('education') || s.includes('academic')) return 'Education / Academic'; // Return Education / Academic sector
    if (s.includes('energy') || s.includes('utilities')) return 'Energy / Utilities'; // Return Energy / Utilities sector
    if (s.includes('telecom') || s.includes('communication')) return 'Telecommunications'; // Return Telecommunications sector
    if (s.includes('technology') || s.includes('information') || s.includes('it ')) return 'IT Infrastructure'; // Return IT Infrastructure sector
    if (s.includes('civil society') || s.includes('ngo') || s.includes('non-profit')) return 'General / Other'; // Return General / Other sector
    if (s.includes('retail') || s.includes('commerce')) return 'Retail / Commerce'; // Return Retail / Commerce sector
    if (s.includes('defense') || s.includes('aerospace') || s.includes('intelligence')) return 'Government / Defense'; // Return Government / Defense sector
    if (s.includes('manufacturing') || s.includes('industrial')) return 'Industrial Manufacturing'; // Return Industrial Manufacturing sector
  } // End of Galaxy sectors check block

  // 5. Source-API based fallback
  const src = event.source_api || ''; // Extract source API identifier defaulting to empty string
  if (src === 'misp-galaxy') return 'IT Infrastructure'; // Map MISP Galaxy events to IT infrastructure sector by default
  if (src === 'ransomwatch') return 'Finance / Business'; // Map Ransomwatch ransomware leaks to Business/Finance sector
  if (src === 'c2tracker' || src === 'kaspersky') return 'IT Infrastructure'; // Map botnet indicators to IT Infrastructure sector
  if (src === 'urlhaus') return 'Web Services'; // Map malicious URL feeds to Web Services sector
  if (src === 'bitdefender' || src === 'fortinet' || src === 'checkpoint' || src === 'alienvault') return 'General / Other'; // Map endpoint feeds to General sector

  return 'General / Other'; // Final fallback to default sector classification
} // End of getEnrichedSector function definition

module.exports = { getEnrichedSector, getIpOrganization }; // Export the getEnrichedSector and getIpOrganization services
