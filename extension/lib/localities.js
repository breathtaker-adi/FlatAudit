/**
 * FlatAudit - Locality Lookup, Haversine Math & Neighbour Cell Engine
 * 
 * Implements Part A Section 5.2 of the FlatAudit Area Report + Price Check Spec:
 * - Deterministic haversine distance computation.
 * - Flat locality resolution (by name/alias, else nearest centroid within 1.5 km).
 * - Finds included localities within 3.0 km radius (haversine).
 * - Maps included localities to standard geohash cells (reuses geohash.js).
 */

import bengaluruData from './data/localities_bengaluru.json' with { type: 'json' };
import jaipurData from './data/localities_jaipur.json' with { type: 'json' };
import jodhpurData from './data/localities_jodhpur.json' with { type: 'json' };
import { encodeGeohash } from './geohash.js';

export const CITY_LOCALITIES = {
  bengaluru: bengaluruData,
  bangalore: bengaluruData,
  jaipur: jaipurData,
  jodhpur: jodhpurData
};

/**
 * Calculates straight-line distance in kilometers between two lat/lng coordinates using Haversine formula.
 * @param {number} lat1 
 * @param {number} lon1 
 * @param {number} lat2 
 * @param {number} lon2 
 * @returns {number} Distance in kilometers rounded to 2 decimals
 */
export function haversineKm(lat1, lon1, lat2, lon2) {
  if (typeof lat1 !== 'number' || typeof lon1 !== 'number' ||
      typeof lat2 !== 'number' || typeof lon2 !== 'number' ||
      isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) {
    return 0;
  }

  const R = 6371.0; // Earth mean radius in km
  const toRad = Math.PI / 180.0;

  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

/**
 * Normalizes city string to supported key.
 * @param {string} city 
 * @returns {'bengaluru'|'jaipur'|'jodhpur'|null}
 */
export function normalizeCityName(city) {
  if (!city || typeof city !== 'string') return null;
  const lower = city.trim().toLowerCase();
  if (/bengaluru|bangalore/i.test(lower)) return 'bengaluru';
  if (/jaipur/i.test(lower)) return 'jaipur';
  if (/jodhpur/i.test(lower)) return 'jodhpur';
  return null;
}

/**
 * Retrieves all registered locality records for a city.
 * @param {string} city 
 * @returns {Array<object>}
 */
export function getLocalitiesForCity(city) {
  const norm = normalizeCityName(city);
  if (!norm || !CITY_LOCALITIES[norm]) return [];
  return CITY_LOCALITIES[norm];
}

/**
 * Resolves a locality within a city by text query (name or alias), or by closest coordinate centroid.
 * Section 5.2: "Find the flat's locality (by name/alias, else nearest centroid within 1.5 km)."
 * 
 * @param {string|object} queryOrCoords - Locality string OR { lat, lng }
 * @param {string} [cityHint='bengaluru'] - City name
 * @param {object} [options]
 * @param {number} [options.maxCentroidDistanceKm=1.5] - Max distance to assign centroid
 * @returns {object|null} Matched locality object with distanceKm (if by coords)
 */
export function findLocality(queryOrCoords, cityHint = 'bengaluru', options = {}) {
  const normCity = normalizeCityName(cityHint);
  const localities = getLocalitiesForCity(normCity || 'bengaluru');
  if (localities.length === 0) return null;

  // Case A: Query is text string
  if (typeof queryOrCoords === 'string' && queryOrCoords.trim().length > 0) {
    const cleanQuery = queryOrCoords.trim().toLowerCase();

    // 1. Exact or alias match
    for (const loc of localities) {
      if (loc.name.toLowerCase() === cleanQuery) {
        return { ...loc, matchType: 'exact_name', distanceKm: 0 };
      }
      if (loc.aliases && loc.aliases.some(a => a.toLowerCase() === cleanQuery)) {
        return { ...loc, matchType: 'exact_alias', distanceKm: 0 };
      }
    }

    // 2. Substring match
    for (const loc of localities) {
      if (cleanQuery.includes(loc.name.toLowerCase())) {
        return { ...loc, matchType: 'substring_name', distanceKm: 0 };
      }
      if (loc.aliases && loc.aliases.some(a => cleanQuery.includes(a.toLowerCase()))) {
        return { ...loc, matchType: 'substring_alias', distanceKm: 0 };
      }
    }
  }

  // Case B: Coordinate lookup (or fallback if queryOrCoords is object { lat, lng })
  const coords = typeof queryOrCoords === 'object' && queryOrCoords !== null
    ? queryOrCoords
    : null;

  if (coords && typeof coords.lat === 'number' && typeof coords.lng === 'number') {
    const maxCentroidKm = typeof options.maxCentroidDistanceKm === 'number' ? options.maxCentroidDistanceKm : 1.5;
    let closestLoc = null;
    let minDistance = Infinity;

    for (const loc of localities) {
      const dist = haversineKm(coords.lat, coords.lng, loc.lat, loc.lng);
      if (dist < minDistance) {
        minDistance = dist;
        closestLoc = loc;
      }
    }

    if (closestLoc && minDistance <= maxCentroidKm) {
      return { ...closestLoc, matchType: 'nearest_centroid', distanceKm: minDistance };
    }
  }

  return null;
}

/**
 * Finds all localities within a given radius (default 3.0 km) of the flat's locality or coordinates.
 * Section 5.2: "Included localities: itself plus any centroid within 3.0 km (haversine)."
 * 
 * @param {string|object} targetLocalityOrCoords - Locality name OR { lat, lng }
 * @param {string} city - City name ('bengaluru', 'jaipur', 'jodhpur')
 * @param {number} [maxRadiusKm=3.0] - Search radius in km (default 3.0 km)
 * @returns {{ targetLocality: object|null, includedLocalities: Array<object>, radiusKm: number }}
 */
export function findNeighbourLocalities(targetLocalityOrCoords, city, maxRadiusKm = 3.0) {
  const normCity = normalizeCityName(city);
  const localities = getLocalitiesForCity(normCity || 'bengaluru');
  if (localities.length === 0) {
    return { targetLocality: null, includedLocalities: [], radiusKm: maxRadiusKm };
  }

  // 1. Resolve Target Locality
  const target = findLocality(targetLocalityOrCoords, normCity);
  let centerLat = null;
  let centerLng = null;

  if (target) {
    centerLat = target.lat;
    centerLng = target.lng;
  } else if (typeof targetLocalityOrCoords === 'object' && targetLocalityOrCoords !== null &&
             typeof targetLocalityOrCoords.lat === 'number' && typeof targetLocalityOrCoords.lng === 'number') {
    centerLat = targetLocalityOrCoords.lat;
    centerLng = targetLocalityOrCoords.lng;
  }

  if (centerLat === null || centerLng === null) {
    return { targetLocality: null, includedLocalities: [], radiusKm: maxRadiusKm };
  }

  // 2. Filter all localities in city within maxRadiusKm
  const included = [];

  for (const loc of localities) {
    const dist = haversineKm(centerLat, centerLng, loc.lat, loc.lng);
    if (dist <= maxRadiusKm) {
      const isTarget = target ? loc.name === target.name : dist === 0;
      included.push({
        ...loc,
        distanceKm: dist,
        is_own_locality: isTarget,
        geohash5: loc.geohash5 || encodeGeohash(loc.lat, loc.lng, 5)
      });
    }
  }

  // Sort ascending by distance (own locality at distance 0 is first)
  included.sort((a, b) => a.distanceKm - b.distanceKm);

  return {
    targetLocality: target ? { ...target, geohash5: target.geohash5 || encodeGeohash(target.lat, target.lng, 5) } : null,
    includedLocalities: included,
    radiusKm: maxRadiusKm
  };
}
