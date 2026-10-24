/**
 * FlatAudit - Geohash & Coordinate Extraction Engine
 * 
 * Provides:
 * - Standard 32-character geohash encoder/decoder for hierarchical location indexing
 * - Multi-source coordinate extraction from web pages (JSON-LD, meta tags, map URLs, DOM data attributes)
 * - Geohash prefix hierarchy:
 *     - Length 6 (~1.2km x 0.6km): Neighborhood / locality cell
 *     - Length 5 (~4.9km x 4.9km): Sub-district / area cell
 *     - Length 4 (~39km x 19.5km): District / metro area
 *     - Length 3 (~156km x 156km): Regional state level
 */

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/**
 * Encodes latitude and longitude into a standard base32 geohash string.
 * @param {number} lat - Latitude in degrees [-90, 90]
 * @param {number} lng - Longitude in degrees [-180, 180]
 * @param {number} [precision=6] - Number of characters in geohash (default 6)
 * @returns {string} Geohash string
 */
export function encodeGeohash(lat, lng, precision = 6) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
    return '';
  }

  let latMin = -90.0;
  let latMax = 90.0;
  let lngMin = -180.0;
  let lngMax = 180.0;

  let geohash = '';
  let bits = 0;
  let bitCount = 0;
  let isEven = true; // start with longitude

  while (geohash.length < precision) {
    if (isEven) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) {
        bits = (bits << 1) | 1;
        lngMin = mid;
      } else {
        bits = (bits << 1) | 0;
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        bits = (bits << 1) | 1;
        latMin = mid;
      } else {
        bits = (bits << 1) | 0;
        latMax = mid;
      }
    }

    isEven = !isEven;
    bitCount++;

    if (bitCount === 5) {
      geohash += BASE32[bits];
      bits = 0;
      bitCount = 0;
    }
  }

  return geohash;
}

/**
 * Decodes a geohash into bounding box and center coordinate.
 * @param {string} geohash 
 * @returns {{ lat: number, lng: number }|null}
 */
export function decodeGeohash(geohash) {
  if (!geohash || typeof geohash !== 'string') return null;

  let latMin = -90.0;
  let latMax = 90.0;
  let lngMin = -180.0;
  let lngMax = 180.0;
  let isEven = true;

  const clean = geohash.toLowerCase().trim();
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    const cd = BASE32.indexOf(c);
    if (cd === -1) return null;

    for (let mask = 16; mask > 0; mask >>= 1) {
      const bit = (cd & mask) !== 0;
      if (isEven) {
        const mid = (lngMin + lngMax) / 2;
        if (bit) lngMin = mid;
        else lngMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (bit) latMin = mid;
        else latMax = mid;
      }
      isEven = !isEven;
    }
  }

  return {
    lat: (latMin + latMax) / 2,
    lng: (lngMin + lngMax) / 2
  };
}

/**
 * Robustly extracts geographic coordinates from a Document DOM using multiple fallback strategies:
 * 1. Schema.org JSON-LD (<script type="application/ld+json">)
 * 2. Geo meta tags (geo.position, ICBM, place:location:latitude)
 * 3. Map URLs in iframes, anchor links, or static map images
 * 4. Custom data attributes (data-lat, data-lng, data-latitude, data-longitude)
 * 
 * @param {Document|object} doc - DOM Document
 * @returns {{ lat: number, lng: number, geohash: string }|null}
 */
export function parseCoordinatesFromPage(doc) {
  if (!doc) return null;

  // Strategy 1: JSON-LD structured data
  if (typeof doc.querySelectorAll === 'function') {
    const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const script of jsonLdScripts) {
      try {
        const text = script.textContent || script.innerText || '';
        if (text.includes('geo') || text.includes('latitude') || text.includes('GeoCoordinates')) {
          const data = JSON.parse(text);
          const coords = findCoordinatesInObject(data);
          if (coords) {
            return {
              ...coords,
              geohash: encodeGeohash(coords.lat, coords.lng, 6)
            };
          }
        }
      } catch (e) {
        // Invalid JSON-LD; continue
      }
    }
  }

  // Strategy 2: Meta tags
  if (typeof doc.querySelector === 'function') {
    const latMeta = doc.querySelector('meta[property="place:location:latitude"], meta[name="geo.position"], meta[name="ICBM"]');
    if (latMeta) {
      const val = latMeta.getAttribute('content');
      if (val) {
        // format "lat, lng" or "lat;lng"
        const parts = val.split(/[,;\s]+/).map(p => parseFloat(p));
        if (parts.length >= 2 && isValidCoord(parts[0], parts[1])) {
          return {
            lat: parts[0],
            lng: parts[1],
            geohash: encodeGeohash(parts[0], parts[1], 6)
          };
        }
      }
    }

    const propLat = doc.querySelector('meta[property="place:location:latitude"]');
    const propLng = doc.querySelector('meta[property="place:location:longitude"]');
    if (propLat && propLng) {
      const lat = parseFloat(propLat.getAttribute('content'));
      const lng = parseFloat(propLng.getAttribute('content'));
      if (isValidCoord(lat, lng)) {
        return {
          lat,
          lng,
          geohash: encodeGeohash(lat, lng, 6)
        };
      }
    }
  }

  // Strategy 3: Map links or embed iframes
  if (typeof doc.querySelectorAll === 'function') {
    const mapLinks = doc.querySelectorAll('a[href*="maps"], iframe[src*="maps"], img[src*="maps.googleapis"], img[src*="staticmap"]');
    for (const el of mapLinks) {
      const src = el.href || el.src || el.getAttribute('src') || el.getAttribute('href') || '';
      const match = src.match(/(?:q|center|loc|ll|destination)=(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/i) ||
                    src.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (match) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        if (isValidCoord(lat, lng)) {
          return {
            lat,
            lng,
            geohash: encodeGeohash(lat, lng, 6)
          };
        }
      }
    }
  }

  // Strategy 4: DOM data attributes
  if (typeof doc.querySelector === 'function') {
    const elWithCoords = doc.querySelector('[data-lat], [data-latitude]');
    if (elWithCoords) {
      const lat = parseFloat(elWithCoords.getAttribute('data-lat') || elWithCoords.getAttribute('data-latitude'));
      const lng = parseFloat(elWithCoords.getAttribute('data-lng') || elWithCoords.getAttribute('data-longitude'));
      if (isValidCoord(lat, lng)) {
        return {
          lat,
          lng,
          geohash: encodeGeohash(lat, lng, 6)
        };
      }
    }
  }

  return null;
}

function isValidCoord(lat, lng) {
  return !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && (lat !== 0 || lng !== 0);
}

function findCoordinatesInObject(obj) {
  if (!obj || typeof obj !== 'object') return null;

  if (obj.geo && typeof obj.geo === 'object') {
    const lat = parseFloat(obj.geo.latitude);
    const lng = parseFloat(obj.geo.longitude);
    if (isValidCoord(lat, lng)) return { lat, lng };
  }

  if (obj.latitude !== undefined && obj.longitude !== undefined) {
    const lat = parseFloat(obj.latitude);
    const lng = parseFloat(obj.longitude);
    if (isValidCoord(lat, lng)) return { lat, lng };
  }

  // Recursive search for arrays or nested graphs
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const res = findCoordinatesInObject(item);
      if (res) return res;
    }
  } else {
    for (const k of Object.keys(obj)) {
      if (typeof obj[k] === 'object') {
        const res = findCoordinatesInObject(obj[k]);
        if (res) return res;
      }
    }
  }

  return null;
}
