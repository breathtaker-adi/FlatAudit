/**
 * FlatAudit - Price per Sq.Ft Check & Aggregation Engine
 * 
 * Implements Part A of the FlatAudit Area Report + Price Check Spec:
 * - Pure deterministic functions (no side effects, no network calls).
 * - Compares sale flat ₹/sq ft against like-for-like cell packs within 3 km.
 * - Strictly follows docs/buyer-mode-wording-guide.md:
 *     Forbidden: "overpriced", "cheap", "good deal", "bad area", "worth it", "scam", "safe", "unsafe"
 *     Allowed: facts, distances, counts, percentages, dates.
 */

// Supported pilot cities and their tier classifications
export const SUPPORTED_CITIES = {
  bengaluru: 'metro',
  bangalore: 'metro',
  jaipur: 'smaller',
  jodhpur: 'smaller'
};

// Exact user-facing strings specified in Section 7 of spec
export const EXACT_STRINGS = {
  MODE_UNCLEAR: 'Pick rent or sale first to see a price comparison.',
  AREA_TYPE_UNKNOWN: 'Area type not clear on this page, so no price comparison.',
  INSUFFICIENT_LISTINGS: 'Not enough listings to compare.',
  UNSUPPORTED_CITY: 'Not available for this city yet.',
  AREA_REPORT_OFF: 'Area Report is off. Turn it on in settings to see what is nearby.',
  LOADING: 'Checking the map…',
  MAP_FAILED: 'Area data unavailable right now.',
  THIN_MAP: 'Not enough map data here.',
  NIGHT_THIN: 'Not enough night data on the map.',
  SAFETY_LABEL: 'Nearby map facts, not crime data.',
  FOOTER_ON: 'Area Report on: rounded location sent to OpenStreetMap'
};

import { normalizeAreaType } from './price_check.js';
export { normalizeAreaType };

/**
 * Checks if city is supported in the current pilot.
 * @param {string} city 
 * @returns {boolean}
 */
export function isCitySupported(city) {
  if (!city || typeof city !== 'string') return false;
  const clean = city.trim().toLowerCase().replace(/[^a-z]/g, '');
  return Boolean(SUPPORTED_CITIES[clean]);
}

/**
 * Computes the n-weighted median of an array of numeric values with positive integer weights.
 * 
 * Algorithm:
 * 1. Sort values ascending, keeping weights aligned.
 * 2. Total weight W = sum(weights).
 * 3. Find value where cumulative weight reaches W / 2.
 * 
 * @param {Array<{ value: number, weight: number }>} items 
 * @returns {number|null}
 */
export function computeWeightedMedian(items = []) {
  if (!Array.isArray(items) || items.length === 0) return null;

  const valid = items.filter(
    it => it && typeof it.value === 'number' && !isNaN(it.value) &&
               typeof it.weight === 'number' && it.weight > 0
  );
  if (valid.length === 0) return null;

  // Sort by value ascending
  valid.sort((a, b) => a.value - b.value);

  const totalWeight = valid.reduce((sum, it) => sum + it.weight, 0);
  if (totalWeight <= 0) return null;

  const halfWeight = totalWeight / 2;
  let accumulated = 0;

  for (let i = 0; i < valid.length; i++) {
    accumulated += valid[i].weight;
    if (accumulated >= halfWeight) {
      // If exactly at half and another item follows, average them; otherwise return current
      if (accumulated === halfWeight && i + 1 < valid.length) {
        return Math.round((valid[i].value + valid[i + 1].value) / 2);
      }
      return Math.round(valid[i].value);
    }
  }

  return Math.round(valid[valid.length - 1].value);
}

/**
 * Compares a target flat's ₹/sq ft with peer cell pack entries.
 * 
 * Rules:
 * - Slice S0: If mode is 'unknown', block comparison -> EXACT_STRINGS.MODE_UNCLEAR
 * - Rent listings: Price per sq ft check is sale listings only -> status: 'not_applicable'
 * - Area type: carpet vs super built-up must be known -> EXACT_STRINGS.AREA_TYPE_UNKNOWN
 * - City: must be in pilot cities -> EXACT_STRINGS.UNSUPPORTED_CITY
 * - Sample gate: n >= 8 listings combined across cells from at least 2 distinct cells OR >= 8 in one cell
 *   Below gate -> EXACT_STRINGS.INSUFFICIENT_LISTINGS
 * 
 * @param {object} flat - Flat details { listingType, price, area_sqft, bhk, areaType, city, pricePerSqft, locality }
 * @param {Array<object>} cellEntries - Candidate cell pack entries matching (sale, bhk, area_type)
 * @param {object} [options]
 * @param {number} [options.minSample=8] - Minimum listings required across cells
 * @param {number} [options.radiusKm=3] - Search radius in km
 * @param {string} [options.dataAsOf='2026-11'] - Data timestamp
 * @returns {object} Standard result object
 */
export function comparePricePerSqft(flat = {}, cellEntries = [], options = {}) {
  const minSample = typeof options.minSample === 'number' ? options.minSample : 8;
  const radiusKm = typeof options.radiusKm === 'number' ? options.radiusKm : 3;
  const dataAsOf = options.dataAsOf || '2026-11';

  // 1. Slice S0: Check mode
  if (!flat || flat.listingType === 'unknown') {
    return {
      status: 'mode_unknown',
      point: EXACT_STRINGS.MODE_UNCLEAR,
      reason: EXACT_STRINGS.MODE_UNCLEAR,
      usable: false
    };
  }

  // Price check is sale listings only (Assumption 2)
  if (flat.listingType === 'rent') {
    return {
      status: 'not_applicable',
      point: '',
      reason: '',
      usable: false
    };
  }

  // 2. Check City Support
  const city = (flat.city || flat.locality || '').toLowerCase();
  const citySupported = Object.keys(SUPPORTED_CITIES).some(c => city.includes(c));
  if (!citySupported && city) {
    return {
      status: 'unsupported_city',
      point: EXACT_STRINGS.UNSUPPORTED_CITY,
      reason: EXACT_STRINGS.UNSUPPORTED_CITY,
      usable: false
    };
  }

  // 3. Check Area Type (carpet vs super built-up)
  const targetAreaType = normalizeAreaType(flat.areaType);
  if (targetAreaType !== 'carpet' && targetAreaType !== 'super_builtup') {
    return {
      status: 'area_type_unknown',
      point: EXACT_STRINGS.AREA_TYPE_UNKNOWN,
      reason: EXACT_STRINGS.AREA_TYPE_UNKNOWN,
      usable: false
    };
  }

  // 4. Calculate flat ₹/sq ft
  const targetArea = typeof flat.area_sqft === 'number' && flat.area_sqft > 0
    ? flat.area_sqft
    : (typeof flat.areaSqft === 'number' && flat.areaSqft > 0 ? flat.areaSqft : null);

  let flatPsf = null;
  if (typeof flat.pricePerSqft === 'number' && flat.pricePerSqft > 0) {
    flatPsf = Math.round(flat.pricePerSqft);
  } else if (targetArea && typeof flat.price === 'number' && flat.price > 0) {
    flatPsf = Math.round(flat.price / targetArea);
  }

  if (!flatPsf || flatPsf <= 0) {
    return {
      status: 'missing_price_or_area',
      point: EXACT_STRINGS.INSUFFICIENT_LISTINGS,
      reason: EXACT_STRINGS.INSUFFICIENT_LISTINGS,
      usable: false
    };
  }

  const targetBhk = typeof flat.bhk === 'number' && flat.bhk >= 1 ? flat.bhk : null;
  if (!targetBhk) {
    return {
      status: 'missing_bhk',
      point: EXACT_STRINGS.INSUFFICIENT_LISTINGS,
      reason: EXACT_STRINGS.INSUFFICIENT_LISTINGS,
      usable: false
    };
  }

  // 5. Filter matching cell entries: same BHK and same area_type
  const matchingCells = (Array.isArray(cellEntries) ? cellEntries : []).filter(c => {
    if (!c || typeof c !== 'object') return false;
    // BHK match
    if (c.bhk && Number(c.bhk) !== targetBhk) return false;
    // Area type match
    if (c.area_type && normalizeAreaType(c.area_type) !== targetAreaType) return false;
    // Must have positive n and psf_median
    return typeof c.n === 'number' && c.n > 0 &&
           typeof c.psf_median === 'number' && c.psf_median > 0;
  });

  // 6. Evaluate Sample Gate (Assumption 4):
  // Combined n >= 8 across included cells from at least 2 distinct cells OR >= 8 in one cell
  const totalN = matchingCells.reduce((sum, c) => sum + c.n, 0);
  const distinctCellsCount = new Set(matchingCells.map(c => c.cell || c.name || c.id)).size;
  const hasSingleCellSufficient = matchingCells.some(c => c.n >= minSample);
  const gatePassed = totalN >= minSample && (distinctCellsCount >= 2 || hasSingleCellSufficient);

  if (!gatePassed) {
    return {
      status: 'insufficient',
      point: EXACT_STRINGS.INSUFFICIENT_LISTINGS,
      reason: EXACT_STRINGS.INSUFFICIENT_LISTINGS,
      n: totalN,
      localities_used: distinctCellsCount,
      usable: false
    };
  }

  // 7. Calculate n-weighted median of cell medians
  const weightedItems = matchingCells.map(c => ({
    value: c.psf_median,
    weight: c.n
  }));
  const areaPsfMedian = computeWeightedMedian(weightedItems);

  if (!areaPsfMedian || areaPsfMedian <= 0) {
    return {
      status: 'insufficient',
      point: EXACT_STRINGS.INSUFFICIENT_LISTINGS,
      reason: EXACT_STRINGS.INSUFFICIENT_LISTINGS,
      usable: false
    };
  }

  // Percentage difference: positive = above, negative = below
  const diffPctRaw = ((flatPsf - areaPsfMedian) / areaPsfMedian) * 100;
  const diffPct = Math.round(diffPctRaw * 10) / 10;

  // Identify own-locality count if available
  const ownLocalityCell = matchingCells.find(c => c.is_own_locality || (flat.locality && c.name && c.name.toLowerCase().includes(flat.locality.toLowerCase())));
  const ownLocalityN = ownLocalityCell ? ownLocalityCell.n : 0;

  // Output object conforming to section 5.4
  const result = {
    status: 'ok',
    flat_psf: flatPsf,
    area_psf_median: areaPsfMedian,
    diff_pct: diffPct,
    n: totalN,
    localities_used: distinctCellsCount,
    radius_km: radiusKm,
    own_locality_n: ownLocalityN,
    data_as_of: dataAsOf,
    usable: true
  };

  // Generate factual display strings
  const display = formatPriceCheckDisplay(result, {
    bhk: targetBhk,
    areaType: targetAreaType,
    daysOld: options.daysOld || 0
  });

  return {
    ...result,
    ...display
  };
}

/**
 * Formats the Key Observations line and details following section 5.5 and wording rules.
 * 
 * Rules:
 * - Line: ₹9,120/sq ft, 6% above the middle rate of ₹8,600/sq ft (23 listings, 3 localities within 3 km).
 * - Say "above/below the middle rate", never "overpriced" or "cheap".
 * - Details: how it was compared, one fact, one drawback.
 * 
 * @param {object} res - Result from comparePricePerSqft
 * @param {object} [context]
 * @returns {{ point: string, headline: string, how_compared: string, fact: string, drawback: string, reason: string }}
 */
export function formatPriceCheckDisplay(res, context = {}) {
  if (!res || res.status !== 'ok') {
    return {
      point: res?.point || EXACT_STRINGS.INSUFFICIENT_LISTINGS,
      headline: res?.point || EXACT_STRINGS.INSUFFICIENT_LISTINGS,
      how_compared: '',
      fact: '',
      drawback: '',
      reason: res?.reason || EXACT_STRINGS.INSUFFICIENT_LISTINGS
    };
  }

  const flatFormatted = `₹${res.flat_psf.toLocaleString('en-IN')}/sq ft`;
  const medianFormatted = `₹${res.area_psf_median.toLocaleString('en-IN')}/sq ft`;
  const absDiff = Math.abs(res.diff_pct);
  const diffStr = Number.isInteger(absDiff) ? `${absDiff}%` : `${absDiff.toFixed(1)}%`;

  let comparisonClause = '';
  if (res.diff_pct > 0) {
    comparisonClause = `${diffStr} above the middle rate of ${medianFormatted}`;
  } else if (res.diff_pct < 0) {
    comparisonClause = `${diffStr} below the middle rate of ${medianFormatted}`;
  } else {
    comparisonClause = `matches the middle rate of ${medianFormatted}`;
  }

  const localitiesNoun = res.localities_used === 1 ? '1 locality' : `${res.localities_used} localities`;
  const headline = `${flatFormatted}, ${comparisonClause} (${res.n} listings, ${localitiesNoun} within ${res.radius_km} km).`;

  const bhkStr = context.bhk ? `${context.bhk} BHK ` : '';
  const areaTypeStr = context.areaType === 'carpet' ? 'carpet area' : 'super built-up area';
  const howCompared = `Compared with sale listings of the same ${bhkStr}and same ${areaTypeStr} within ${res.radius_km} km (straight line). Based on asking prices, not registered sale deeds.`;

  const fact = `Middle rate across ${res.localities_used} nearby localities is ${medianFormatted} (${res.n} listings combined).`;

  let drawback = 'Listing asking prices, not registered sale deeds.';
  if (res.own_locality_n > 0 && res.own_locality_n < 5) {
    drawback = 'Most listings come from neighbouring localities.';
  } else if (context.daysOld && context.daysOld > 60) {
    drawback = 'Latest listings are over 60 days old.';
  }

  const reason = `${howCompared} ${fact} Drawback: ${drawback}`;

  return {
    point: headline,
    headline,
    how_compared: howCompared,
    fact,
    drawback,
    reason
  };
}
