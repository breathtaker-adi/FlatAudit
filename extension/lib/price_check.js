/**
 * FlatAudit - Price per Sq.Ft Check & Like-for-Like Matching Engine
 * 
 * Rules defined in FlatAudit Area Report + Price Check Plan:
 * - Piece 0 (Safety Rule): If mode is "unknown", suppress comparison and show "Pick rent or sale first".
 * - Part A1 (Matching Rules):
 *     1. Strictly like-for-like: same BHK and same size type (carpet vs super built-up).
 *     2. Similar size only (within ±20% of target flat's area).
 *     3. Minimum sample threshold (n >= 3); below it, show "Not enough listings to compare" and nothing else.
 *     4. Objective tone only: "X% above/below the middle rate" (no subjective words like "cheap" or "overpriced").
 */

import { computeMedian } from './benchmarks.js';

/**
 * Normalizes raw area type to standard canonical tokens.
 * @param {string} raw 
 * @returns {'carpet'|'super_builtup'|'builtup'|'unknown'}
 */
export function normalizeAreaType(raw) {
  if (!raw || typeof raw !== 'string') return 'unknown';
  const lower = raw.trim().toLowerCase();
  if (/carpet/i.test(lower)) return 'carpet';
  if (/super[-_\s]*built|sbua/i.test(lower)) return 'super_builtup';
  if (/built[-_\s]*up/i.test(lower)) return 'builtup';
  return 'unknown';
}

/**
 * Filters candidate listings enforcing strictly like-for-like criteria:
 * 1. Matching mode (sale vs sale, rent vs rent).
 * 2. Exact same BHK.
 * 3. Exact same size type (carpet vs super built-up).
 * 4. Similar size within ±20% tolerance.
 * 5. Excludes self if listingKey or id matches.
 * 
 * @param {object} target - Flat being audited
 * @param {Array<object>} candidates - Pool of candidate listings
 * @param {object} [options]
 * @param {number} [options.sizeTolerance=0.20] - Allowed size variance (0.20 = ±20%)
 * @param {boolean} [options.strictAreaType=true] - Discard peers with mismatched or unknown area types
 * @returns {Array<object>} Filtered peer listings meeting all criteria
 */
export function filterLikeForLikeListings(target = {}, candidates = [], options = {}) {
  if (!target || typeof target !== 'object' || !Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }

  // Piece 0: Unclear / unknown mode cannot be matched safely
  if (target.listingType === 'unknown') {
    return [];
  }

  const targetBhk = typeof target.bhk === 'number' && target.bhk >= 1 ? target.bhk : null;
  const targetArea = typeof target.area_sqft === 'number' && target.area_sqft > 0
    ? target.area_sqft
    : (typeof target.areaSqft === 'number' && target.areaSqft > 0 ? target.areaSqft : null);

  if (!targetBhk || !targetArea) {
    return [];
  }

  const targetMode = target.listingType === 'sale' || Boolean(target.price && !target.rent) ? 'sale' : 'rent';
  const targetAreaType = normalizeAreaType(target.areaType);
  const strictAreaType = options.strictAreaType !== false;

  // If strict area type is required and target has unknown area type, like-for-like cannot be established
  if (strictAreaType && targetAreaType === 'unknown') {
    return [];
  }

  const sizeTolerance = typeof options.sizeTolerance === 'number' ? options.sizeTolerance : 0.20;
  const minArea = targetArea * (1 - sizeTolerance);
  const maxArea = targetArea * (1 + sizeTolerance);

  const targetKey = target.listingKey || target.id || target.url || null;

  return candidates.filter(candidate => {
    if (!candidate || typeof candidate !== 'object') return false;

    // Exclude target itself
    const candidateKey = candidate.listingKey || candidate.id || candidate.url || null;
    if (targetKey && candidateKey && targetKey === candidateKey) {
      return false;
    }

    // 1. Mode Match
    const candidateMode = candidate.listingType === 'sale' || Boolean(candidate.price && !candidate.rent)
      ? 'sale'
      : (candidate.listingType === 'rent' || Boolean(candidate.rent && !candidate.price) ? 'rent' : 'unknown');

    if (candidateMode !== targetMode) {
      return false;
    }

    // 2. Same BHK
    const candidateBhk = typeof candidate.bhk === 'number' ? candidate.bhk : null;
    if (candidateBhk !== targetBhk) {
      return false;
    }

    // 3. Same Size Type (carpet vs super built-up)
    const candidateAreaType = normalizeAreaType(candidate.areaType);
    if (strictAreaType) {
      if (candidateAreaType === 'unknown' || candidateAreaType !== targetAreaType) {
        return false;
      }
    }

    // 4. Similar Size Only (within ±20% of this flat)
    const candidateArea = typeof candidate.area_sqft === 'number' && candidate.area_sqft > 0
      ? candidate.area_sqft
      : (typeof candidate.areaSqft === 'number' && candidate.areaSqft > 0 ? candidate.areaSqft : null);

    if (!candidateArea || candidateArea < minArea || candidateArea > maxArea) {
      return false;
    }

    // 5. Must have positive price/rent
    if (targetMode === 'sale') {
      const hasRate = (typeof candidate.pricePerSqft === 'number' && candidate.pricePerSqft > 0);
      const hasPrice = (typeof candidate.price === 'number' && candidate.price > 0) ||
                        (typeof candidate.salePrice === 'number' && candidate.salePrice > 0);
      if (!hasRate && !hasPrice) return false;
    } else {
      const hasRent = typeof candidate.rent === 'number' && candidate.rent > 0;
      if (!hasRent) return false;
    }

    return true;
  });
}

/**
 * Evaluates price per sq.ft against like-for-like local listings.
 * 
 * Implements:
 * - Piece 0: Block price comparison when rent/sale is unclear -> "Pick rent or sale first"
 * - Part A1: Like-for-like matching rules & minimum sample threshold -> "Not enough listings to compare"
 * - Part A3: Strictly objective presentation: "X% above/below the middle rate"
 * 
 * @param {object} target - Target listing
 * @param {Array<object>} [candidateListings=[]] - Candidate peer listings
 * @param {object} [options={}]
 * @param {number} [options.minListings=3] - Minimum sample count required to compare
 * @param {number} [options.sizeTolerance=0.20] - Allowed size variance
 * @returns {object} Standard Price Check Observation Result
 */
export function evaluatePricePerSqftCheck(target = {}, candidateListings = [], options = {}) {
  const minListings = typeof options.minListings === 'number' && options.minListings >= 1 ? options.minListings : 3;

  // ==========================================
  // PIECE 0: Safety Rule - Block if mode is unknown
  // ==========================================
  if (!target || target.listingType === 'unknown') {
    return {
      status: 'mode_unknown',
      category: 'Price per Sq.Ft',
      icon: '📏',
      fired: false,
      blocked: true,
      statusLabel: 'Blocked',
      point: 'Pick rent or sale first',
      reason: 'Listing mode is unconfirmed. Price per sq ft comparison is blocked until you choose rent or sale.',
      ratePerSqft: null,
      middleRate: null,
      percentDelta: null,
      sampleSize: 0,
      minRequired: minListings,
      usable: false,
      matchedListings: []
    };
  }

  const isSale = target.listingType === 'sale' || Boolean(target.price && !target.rent);
  const targetArea = typeof target.area_sqft === 'number' && target.area_sqft > 0
    ? target.area_sqft
    : (typeof target.areaSqft === 'number' && target.areaSqft > 0 ? target.areaSqft : null);

  // Missing area in listing
  if (!targetArea) {
    return {
      status: 'missing_area',
      category: 'Price per Sq.Ft',
      icon: '📏',
      fired: false,
      blocked: true,
      statusLabel: 'Info',
      point: 'Not enough listings to compare',
      reason: 'Not enough listings to compare (area in sq ft not specified).',
      ratePerSqft: null,
      middleRate: null,
      percentDelta: null,
      sampleSize: 0,
      minRequired: minListings,
      usable: false,
      matchedListings: []
    };
  }

  // Compute target flat rate per sq ft
  let targetRate = null;
  if (isSale) {
    const saleAmt = target.price || target.salePrice || target.rawPrice || null;
    if (typeof target.pricePerSqft === 'number' && target.pricePerSqft > 0) {
      targetRate = target.pricePerSqft;
    } else if (typeof saleAmt === 'number' && saleAmt > 0) {
      targetRate = Math.round(saleAmt / targetArea);
    }
  } else {
    const rentAmt = target.rent || target.rawPrice || null;
    if (typeof rentAmt === 'number' && rentAmt > 0) {
      targetRate = Math.round((rentAmt / targetArea) * 10) / 10;
    }
  }

  // Missing price in listing
  if (!targetRate || targetRate <= 0) {
    return {
      status: 'missing_price',
      category: 'Price per Sq.Ft',
      icon: '📏',
      fired: false,
      blocked: true,
      statusLabel: 'Info',
      point: 'Not enough listings to compare',
      reason: 'Not enough listings to compare (price unlisted or unparsed).',
      ratePerSqft: null,
      middleRate: null,
      percentDelta: null,
      sampleSize: 0,
      minRequired: minListings,
      usable: false,
      matchedListings: []
    };
  }

  const targetAreaType = normalizeAreaType(target.areaType);
  if (targetAreaType === 'unknown') {
    return {
      status: 'unspecified_area_type',
      category: 'Price per Sq.Ft',
      icon: '📏',
      fired: false,
      blocked: true,
      statusLabel: 'Info',
      point: 'Not enough listings to compare',
      reason: 'Not enough listings to compare (area type carpet vs super built-up is not specified).',
      ratePerSqft: targetRate,
      middleRate: null,
      percentDelta: null,
      sampleSize: 0,
      minRequired: minListings,
      usable: false,
      matchedListings: []
    };
  }

  // Apply like-for-like filters
  const matched = filterLikeForLikeListings(target, candidateListings, options);

  // ==========================================
  // PART A1: Minimum sample threshold
  // Below minimum threshold -> show "Not enough listings to compare" and nothing else
  // ==========================================
  if (matched.length < minListings) {
    return {
      status: 'insufficient_sample',
      category: 'Price per Sq.Ft',
      icon: '📏',
      fired: false,
      statusLabel: 'Info',
      point: 'Not enough listings to compare',
      reason: 'Not enough listings to compare',
      ratePerSqft: targetRate,
      middleRate: null,
      percentDelta: null,
      sampleSize: matched.length,
      minRequired: minListings,
      areaType: targetAreaType,
      usable: false,
      matchedListings: matched
    };
  }

  // ==========================================
  // Compute Peer Rates & Middle Rate (Median)
  // ==========================================
  const peerRates = matched.map(p => {
    const pArea = p.area_sqft || p.areaSqft;
    if (isSale) {
      if (typeof p.pricePerSqft === 'number' && p.pricePerSqft > 0) return p.pricePerSqft;
      const amt = p.price || p.salePrice;
      return Math.round(amt / pArea);
    } else {
      return Math.round((p.rent / pArea) * 10) / 10;
    }
  }).filter(r => typeof r === 'number' && !isNaN(r) && r > 0);

  const middleRate = computeMedian(peerRates);
  if (!middleRate || middleRate <= 0) {
    return {
      status: 'insufficient_sample',
      category: 'Price per Sq.Ft',
      icon: '📏',
      fired: false,
      statusLabel: 'Info',
      point: 'Not enough listings to compare',
      reason: 'Not enough listings to compare',
      ratePerSqft: targetRate,
      middleRate: null,
      percentDelta: null,
      sampleSize: matched.length,
      minRequired: minListings,
      areaType: targetAreaType,
      usable: false,
      matchedListings: matched
    };
  }

  const deltaPct = Math.round(((targetRate - middleRate) / middleRate) * 100);

  // Objective Tone: "X% above/below the middle rate" (no "overpriced" or "cheap")
  let point = '';
  if (deltaPct > 0) {
    point = `${deltaPct}% above the middle rate`;
  } else if (deltaPct < 0) {
    point = `${Math.abs(deltaPct)}% below the middle rate`;
  } else {
    point = 'Matches the middle rate';
  }

  const unit = isSale ? '₹/sqft' : '₹/sqft/mo';
  const targetRateFormatted = `₹${targetRate.toLocaleString('en-IN')}`;
  const middleRateFormatted = `₹${middleRate.toLocaleString('en-IN')}`;
  const areaTypeLabel = targetAreaType === 'carpet' ? 'carpet area' : (targetAreaType === 'super_builtup' ? 'super built-up' : 'built-up');

  const fact = `This flat: ${targetRateFormatted} ${unit} (${areaTypeLabel}). Middle rate: ${middleRateFormatted} ${unit} across ${matched.length} similar ${target.bhk} BHK listings (±20% size).`;
  const drawback = matched.length < 5
    ? `Few listings (n=${matched.length}), treat comparison as rough.`
    : 'Rate reflects asking prices of similar listings; actual transacted rates may vary.';

  const fullReason = `${fact} ${drawback}`;

  return {
    status: 'compared',
    category: 'Price per Sq.Ft',
    icon: '📏',
    fired: false,
    statusLabel: 'Validated',
    point,
    reason: fullReason,
    fact,
    drawback,
    ratePerSqft: targetRate,
    middleRate,
    percentDelta: deltaPct,
    sampleSize: matched.length,
    minRequired: minListings,
    areaType: targetAreaType,
    bhk: target.bhk,
    usable: true,
    matchedListings: matched
  };
}
