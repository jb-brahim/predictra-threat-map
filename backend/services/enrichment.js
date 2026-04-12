/**
 * Intelligence-driven Sector Enrichment Service
 * 
 * This service maps raw threat data (victim names, ports, malware families)
 * to real-world industrial sectors.
 */

const axios = require('axios');

// Cache to avoid repeated RDAP lookups
const rdapCache = new Map();

/**
 * RDAP-based IP Owner/Organization Lookup
 * Fetches the organization/owner of an IP address using RDAP (modern WHOIS).
 */
async function getIpOrganization(ip) {
  if (!ip || ip === 'unknown') return 'Unknown Organization';
  if (rdapCache.has(ip)) return rdapCache.get(ip);

  try {
    // Using rdap.org as a redirector to the correct regional registry (ARIN, RIPE, etc.)
    const response = await axios.get(`https://rdap.org/ip/${ip}`, { 
      timeout: 3000,
      headers: { 'Accept': 'application/rdap+json' }
    });

    let orgName = 'Unknown Organization';

    if (response.data) {
      // Try to find organization name in 'entities' or 'remarks'
      const entities = response.data.entities || [];
      const vcardOrg = entities
        .flatMap(e => e.vcardArray?.[1] || [])
        .find(entry => entry[0] === 'fn' || entry[0] === 'org');

      if (vcardOrg) {
        orgName = vcardOrg[3];
      } else if (response.data.name) {
        orgName = response.data.name;
      }
    }

    rdapCache.set(ip, orgName);
    return orgName;
  } catch (err) {
    // If RDAP fails, we don't want to block the scraper
    return 'Unknown Organization';
  }
}

// 1. Known Sector Keywords (High-Confidence)
const KEYWORD_MAP = {
  // Healthcare
  healthcare: ['hospital', 'clinic', 'medical', 'pharma', 'health', 'patient', 'biotech', 'dental', 'nursing', 'pediatric', 'healthcare', 'sanatorium'],
  // Finance
  finance: ['bank', 'insurance', 'crypto', 'asset', 'capital', 'investment', 'lending', 'credit', 'wealth', 'fintech', 'trading', 'chase', 'goldman', 'morgan', 'barclays', 'hsbc', 'citi'],
  // Government
  government: ['ministry', 'department', 'gov', 'state', 'federal', 'military', 'defense', 'agency', 'council', 'police', 'embassy', 'army', 'navy', 'parliament'],
  // Education
  education: ['university', 'college', 'school', 'academy', 'institute', 'education', 'district', 'campus', 'scholar'],
  // Energy / Utilities
  energy: ['oil', 'gas', 'power', 'electric', 'energy', 'utility', 'solar', 'hydro', 'nuclear', 'grid', 'petroleum', 'pipeline'],
  // Technology
  technology: ['software', 'tech', 'digital', 'systems', 'networks', 'cloud', 'computing', 'cyber', 'data', 'silicon', 'technology', 'intelligence'],
  // Manufacturing
  manufacturing: ['industrial', 'manufacturing', 'factory', 'steel', 'automotive', 'aerospace', 'chemicals', 'machinery', 'textiles', 'construction'],
  // Retail
  retail: ['shop', 'retail', 'market', 'commerce', 'store', 'fashion', 'luxury', 'mall', 'supermarket'],
  // Telecommunications
  telecom: ['telecom', 'mobile', 'wireless', 'broadband', 'satellite', 'connectivity', 'communication', 'telephony']
};

// 2. Mapping to your friend's established categories (Migration Layer)
const CATEGORY_MAPPING = {
  healthcare: 'Healthcare / Medical',
  finance: 'Finance / Business',
  government: 'Government / Defense',
  education: 'Education / Academic',
  energy: 'Energy / Utilities',
  technology: 'IT Infrastructure',
  manufacturing: 'Industrial Manufacturing',
  retail: 'Retail / Commerce',
  telecom: 'Telecommunications',
  web: 'Web Services',
  db: 'Database Services'
};

/**
 * Main enrichment logic
 */
function getEnrichedSector(event) {
  const victimName = (event.d_ip || '').toLowerCase(); // Actually the victim name in Ransomwatch
  const attackName = (event.a_n || '').toLowerCase();
  const malwareFamily = (event.meta?.malware_family || '').toLowerCase();
  const threatType = (event.meta?.threat_type || '').toLowerCase();
  const port = event.meta?.port;
  
  const combinedText = `${victimName} ${attackName} ${malwareFamily} ${threatType}`;

  // Helper for matching with word boundaries
  const matches = (text, keywords) => {
    return keywords.some(kw => {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      return regex.test(text);
    });
  };

  // 1. Try Keyword Matching on Victim Name (Highest Confidence)
  for (const [sector, keywords] of Object.entries(KEYWORD_MAP)) {
    if (matches(victimName, keywords)) {
      return CATEGORY_MAPPING[sector];
    }
  }

  // 2. Try Keyword Matching on Combined Text
  for (const [sector, keywords] of Object.entries(KEYWORD_MAP)) {
    if (matches(combinedText, keywords)) {
      return CATEGORY_MAPPING[sector];
    }
  }


  // 3. Port-Based Fallback (Infrastructure classification)
  if (port) {
    const p = parseInt(port);
    if ([80, 443, 8080, 8443].includes(p)) return CATEGORY_MAPPING.web;
    if ([3306, 5432, 1433, 27017, 6379].includes(p)) return CATEGORY_MAPPING.db;
    if ([22, 23, 21, 53, 161].includes(p)) return CATEGORY_MAPPING.technology;
    if ([445, 139, 3389].includes(p)) return 'Enterprise Network';
    if ([25, 587, 465, 110, 143].includes(p)) return 'Email / Communication';
  }

  // 4. Source-API based fallback
  const src = event.source_api || '';
  if (src === 'ransomwatch') return 'Finance / Business'; // Ransomware usually hits business
  if (src === 'c2tracker') return 'IT Infrastructure';
  if (src === 'urlhaus') return 'Web Services';

  return 'General / Other';
}

module.exports = { getEnrichedSector, getIpOrganization };
