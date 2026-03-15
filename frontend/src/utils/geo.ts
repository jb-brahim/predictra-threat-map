import * as THREE from 'three';

const GLOBE_RADIUS = 1.0;
const DEG2RAD = Math.PI / 180;

/**
 * Convert latitude/longitude to 3D position on a sphere
 */
export function latLonToVector3(
  lat: number,
  lon: number,
  radius: number = GLOBE_RADIUS
): [number, number, number] {
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lon + 180) * DEG2RAD;

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);

  return [x, y, z];
}

// Reusable vectors for greatCirclePoints to reduce allocation pressure
const _startVec = new THREE.Vector3();
const _endVec = new THREE.Vector3();
const _interpVec = new THREE.Vector3();

/**
 * Generate great-circle arc points between two positions on the globe.
 * Returns an array of Vector3 points including intermediate elevated points.
 * Optimized: reuses temporary vectors for interpolation.
 */
export function greatCirclePoints(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  segments: number = 64,
  radius: number = GLOBE_RADIUS
): THREE.Vector3[] {
  const sPos = latLonToVector3(startLat, startLon, radius);
  const ePos = latLonToVector3(endLat, endLon, radius);
  _startVec.set(sPos[0], sPos[1], sPos[2]);
  _endVec.set(ePos[0], ePos[1], ePos[2]);

  const distance = _startVec.distanceTo(_endVec);
  const maxArcHeight = arcHeight(distance, radius);

  // Pre-allocate result array
  const points = new Array<THREE.Vector3>(segments + 1);

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;

    // Spherical interpolation for position on globe surface
    _interpVec.copy(_startVec).lerp(_endVec, t);
    _interpVec.normalize();

    // Elevation: parabolic arc above the surface
    const elevation = Math.sin(t * Math.PI) * maxArcHeight;
    _interpVec.multiplyScalar(radius + elevation);

    points[i] = _interpVec.clone();
  }

  return points;
}

/**
 * Calculate arc peak height based on distance between points.
 * Longer distances = taller arcs.
 */
export function arcHeight(
  distance: number,
  radius: number = GLOBE_RADIUS
): number {
  // Clamp distance relative to globe size
  const normalizedDist = Math.min(distance / (2 * radius), 1);
  // Arc height: 5% to 30% of radius depending on distance
  return radius * (0.05 + normalizedDist * 0.25);
}

/**
 * Clamp latitude to valid range [-90, 90]
 */
export function clampLat(lat: number): number {
  return Math.max(-90, Math.min(90, lat));
}

/**
 * Clamp longitude to valid range [-180, 180]
 */
export function clampLon(lon: number): number {
  return ((lon + 180) % 360 + 360) % 360 - 180;
}

/**
 * Validate coordinates
 */
export function isValidCoordinate(lat: number, lon: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    !isNaN(lat) &&
    !isNaN(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

// Map UI country names to backend ISO 3166-1 Alpha-2 Codes
const COUNTRY_CODES: Record<string, string> = {
  'United States of America': 'US', 'United States': 'US', 'United Kingdom': 'GB',
  'Germany': 'DE', 'France': 'FR', 'China': 'CN', 'Russia': 'RU',
  'Japan': 'JP', 'India': 'IN', 'Brazil': 'BR', 'Canada': 'CA',
  'Australia': 'AU', 'Italy': 'IT', 'Spain': 'ES', 'Mexico': 'MX',
  'South Korea': 'KR', 'Netherlands': 'NL', 'Turkey': 'TR', 'Indonesia': 'ID',
  'Saudi Arabia': 'SA', 'Switzerland': 'CH', 'Poland': 'PL', 'Sweden': 'SE',
  'Belgium': 'BE', 'Argentina': 'AR', 'Thailand': 'TH', 'South Africa': 'ZA',
  'Nigeria': 'NG', 'Egypt': 'EG', 'Israel': 'IL', 'Ireland': 'IE',
  'Denmark': 'DK', 'Finland': 'FI', 'Norway': 'NO', 'Austria': 'AT',
  'Romania': 'RO', 'Ukraine': 'UA', 'Czechia': 'CZ', 'Czech Republic': 'CZ',
  'Portugal': 'PT', 'Greece': 'GR', 'Hungary': 'HU', 'Vietnam': 'VN',
  'Philippines': 'PH', 'Colombia': 'CO', 'Chile': 'CL', 'Malaysia': 'MY',
  'Pakistan': 'PK', 'Bangladesh': 'BD', 'Peru': 'PE', 'Singapore': 'SG',
  'Hong Kong': 'HK', 'Taiwan': 'TW', 'New Zealand': 'NZ', 'Iran': 'IR',
  'Iraq': 'IQ', 'Morocco': 'MA', 'Algeria': 'DZ', 'Kenya': 'KE',
  'Bulgaria': 'BG', 'Croatia': 'HR', 'Slovakia': 'SK', 'Lithuania': 'LT',
  'Latvia': 'LV', 'Estonia': 'EE', 'Slovenia': 'SI', 'Serbia': 'RS'
};

export function getIsoCode(countryName: string): string {
  if (!countryName || countryName.startsWith('Region')) return '??';
  
  // Exact match override
  if (COUNTRY_CODES[countryName]) {
    return COUNTRY_CODES[countryName];
  }
  
  // Fallback to strict 3166-2 conventions if missing (e.g prefix matching)
  for (const [name, code] of Object.entries(COUNTRY_CODES)) {
    if (countryName.toLowerCase().includes(name.toLowerCase())) {
      return code;
    }
  }

  // Last resort fallback (try grabbing first 2 uppercase letters as a guess if valid otherwise unknown)
  return '??';
}
