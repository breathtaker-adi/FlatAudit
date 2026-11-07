/**
 * FlatAudit OpenStreetMap Overpass Client (Slice S5)
 * 
 * Builds combined Overpass queries, respects 5-second rate limits,
 * supports primary/fallback mirrors, parses responses, filters tags,
 * and performs element density checks.
 */

import { haversineKm } from '../localities.js';
import { roundCoordinate, roundLocation } from '../settings.js';

export const OVERPASS_ENDPOINTS = Object.freeze([
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter'
]);

export const OVERPASS_TIMEOUT_SEC = 25;
export const MIN_QUERY_INTERVAL_MS = 5000;
export const OSM_ATTRIBUTION = 'Map data © OpenStreetMap contributors';

// Relevant tag keys retained in the reduced representation
export const RELEVANT_TAG_KEYS = Object.freeze([
  'name',
  'amenity',
  'shop',
  'healthcare',
  'highway',
  'railway',
  'station',
  'leisure',
  'landuse',
  'lit',
  'opening_hours',
  'emergency'
]);

// Rate limiting state
let _lastQueryTimestamp = 0;
let _isInFlight = false;

/**
 * Builds a single combined Overpass QL query around rounded center coordinates.
 * @param {number|string} rawLat
 * @param {number|string} rawLng
 * @returns {string|null} Overpass QL query
 */
export function buildOverpassQuery(rawLat, rawLng) {
  const { lat, lng } = roundLocation(rawLat, rawLng);
  if (lat === null || lng === null) return null;

  return `[out:json][timeout:${OVERPASS_TIMEOUT_SEC}];
(
  node["amenity"~"^(hospital|clinic|doctors|pharmacy|atm|bank|police|cafe|restaurant|school|college|place_of_worship|library|community_centre|bus_station)$"](around:3000,${lat},${lng});
  way["amenity"~"^(hospital|clinic|doctors|pharmacy|atm|bank|police|cafe|restaurant|school|college|place_of_worship|library|community_centre|bus_station)$"](around:3000,${lat},${lng});
  node["healthcare"="hospital"](around:3000,${lat},${lng});
  way["healthcare"="hospital"](around:3000,${lat},${lng});
  node["emergency"="ambulance_station"](around:3000,${lat},${lng});
  node["shop"~"^(supermarket|convenience|grocery|general|greengrocer)$"](around:2000,${lat},${lng});
  way["shop"~"^(supermarket|convenience|grocery|general|greengrocer)$"](around:2000,${lat},${lng});
  node["highway"="bus_stop"](around:1500,${lat},${lng});
  node["public_transport"="platform"](around:1500,${lat},${lng});
  node["railway"~"^(station|subway|subway_entrance|halt)$"](around:3000,${lat},${lng});
  way["railway"~"^(station|subway|halt|rail)$"](around:3000,${lat},${lng});
  way["highway"~"^(trunk|primary|secondary)$"](around:1000,${lat},${lng});
  node["leisure"~"^(park|fitness_centre)$"](around:2000,${lat},${lng});
  way["leisure"~"^(park|fitness_centre)$"](around:2000,${lat},${lng});
  way["landuse"~"^(grass|forest|industrial)$"](around:1000,${lat},${lng});
);
out center tags;`;
}

/**
 * Parses raw Overpass JSON response, filters tags to a minimal footprint,
 * computes straight-line distance, and applies 1km density gating.
 * @param {object|string} rawResponse
 * @param {number|string} centerLat
 * @param {number|string} centerLng
 * @returns {object} Normalized area query result
 */
export function parseOverpassResponse(rawResponse, centerLat, centerLng) {
  const cLat = roundCoordinate(centerLat, 3);
  const cLng = roundCoordinate(centerLng, 3);

  if (cLat === null || cLng === null) {
    return {
      status: 'unavailable',
      elements: [],
      density1km: 0,
      confidence: 'low',
      attribution: OSM_ATTRIBUTION
    };
  }

  let data = rawResponse;
  if (typeof rawResponse === 'string') {
    try {
      data = JSON.parse(rawResponse);
    } catch (e) {
      return {
        status: 'unavailable',
        elements: [],
        density1km: 0,
        confidence: 'low',
        attribution: OSM_ATTRIBUTION
      };
    }
  }

  if (!data || typeof data !== 'object' || !Array.isArray(data.elements)) {
    return {
      status: 'unavailable',
      elements: [],
      density1km: 0,
      confidence: 'low',
      attribution: OSM_ATTRIBUTION
    };
  }

  const reducedElements = [];
  let countWithin1km = 0;

  for (const el of data.elements) {
    if (!el || typeof el !== 'object') continue;

    const elLat = typeof el.lat === 'number' ? el.lat : el.center?.lat;
    const elLng = typeof el.lon === 'number' ? el.lon : (typeof el.lng === 'number' ? el.lng : el.center?.lon);

    if (typeof elLat !== 'number' || typeof elLng !== 'number') continue;

    const dist = haversineKm(cLat, cLng, elLat, elLng);
    if (dist <= 1.0) {
      countWithin1km++;
    }

    // Filter tags to essential keys only
    const filteredTags = {};
    if (el.tags && typeof el.tags === 'object') {
      for (const key of RELEVANT_TAG_KEYS) {
        if (el.tags[key] !== undefined && el.tags[key] !== null) {
          filteredTags[key] = String(el.tags[key]).trim();
        }
      }
    }

    reducedElements.push({
      id: el.id,
      type: el.type || 'node',
      lat: roundCoordinate(elLat, 4),
      lng: roundCoordinate(elLng, 4),
      distKm: Math.round(dist * 1000) / 1000,
      tags: filteredTags
    });
  }

  // Density Gate (Section 6.2):
  // count < 5 -> thin_map ("not enough map data here")
  // count < 15 -> confidence "low"
  // count >= 15 -> confidence "high"
  let status = 'ok';
  let confidence = 'high';

  if (countWithin1km < 5) {
    status = 'thin_map';
    confidence = 'low';
  } else if (countWithin1km < 15) {
    status = 'ok';
    confidence = 'low';
  }

  return {
    status,
    confidence,
    density1km: countWithin1km,
    elementsCount: reducedElements.length,
    elements: reducedElements,
    attribution: OSM_ATTRIBUTION
  };
}

/**
 * Enforces in-flight gating and 5-second rate limiting.
 * @param {number} now
 * @returns {boolean} Whether a new query is permitted
 */
export function canExecuteQuery(now = Date.now()) {
  if (_isInFlight) return false;
  return now - _lastQueryTimestamp >= MIN_QUERY_INTERVAL_MS;
}

/**
 * Resets rate-limiter state (useful in tests).
 */
export function resetRateLimiter() {
  _isInFlight = false;
  _lastQueryTimestamp = 0;
}

/**
 * Fetches area data from Overpass with rate-limiting, primary + mirror fallback,
 * and 25-second timeout.
 * @param {number|string} lat
 * @param {number|string} lng
 * @param {object} [fetchFn] Custom fetch implementation
 * @param {number} [now] Current timestamp in ms (for testing rate limiters)
 * @returns {Promise<object>} Parsed area report or unavailable status
 */
export async function queryOverpass(lat, lng, fetchFn = globalThis.fetch, now = Date.now()) {
  const query = buildOverpassQuery(lat, lng);
  if (!query) {
    return {
      status: 'unavailable',
      elements: [],
      density1km: 0,
      confidence: 'low',
      attribution: OSM_ATTRIBUTION
    };
  }

  const queryTime = typeof now === 'number' ? now : Date.now();
  if (!canExecuteQuery(queryTime)) {
    return {
      status: 'unavailable',
      elements: [],
      density1km: 0,
      confidence: 'low',
      error: 'Rate limit: query in flight or within 5s cooldown',
      attribution: OSM_ATTRIBUTION
    };
  }

  _isInFlight = true;
  _lastQueryTimestamp = queryTime;

  // Try endpoints (Primary then Fallback)
  try {
    for (const endpoint of OVERPASS_ENDPOINTS) {
      let timeoutId = null;
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        if (controller) {
          timeoutId = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_SEC * 1000);
        }

        const response = await fetchFn(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'FlatAudit/1.0 (Listing Trust; +https://github.com/breathtaker-adi/FlatAudit)'
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller?.signal
        });

        if (response.ok) {
          const json = await response.json();
          const parsed = parseOverpassResponse(json, lat, lng);
          return parsed;
        }
      } catch (err) {
        // Fallback to next mirror on network failure, timeout, or HTTP 429/5xx
        continue;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }

    return {
      status: 'unavailable',
      elements: [],
      density1km: 0,
      confidence: 'low',
      attribution: OSM_ATTRIBUTION
    };
  } finally {
    _isInFlight = false;
  }
}
