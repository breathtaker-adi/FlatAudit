/**
 * Listing Trust Analyzer - Signal Evaluation Engine
 *
 * Observable-facts based threat signal detection for Indian rental portals.
 * Uses dynamic market benchmarks and peer-page data instead of hardcoded numbers.
 * Never uses defamatory labels ("scammer", "fraud"); only states verifiable observations.
 */

import { getBenchmark, robustZScore, getGuidanceValue, getReraPortalUrl } from './benchmarks.js';
import { evaluatePricePerSqftCheck } from './price_check.js';
import marketPacksData from './data/market_packs.json' with { type: 'json' };

// Backwards-compatible export mapping for external tools & tests
export const LOCALITY_BENCHMARKS = Object.fromEntries(
  (marketPacksData?.packs || []).flatMap(pack => {
    const entries = [];
    if (pack.aliases) {
      for (const alias of pack.aliases) {
        entries.push([
          alias.toLowerCase(),
          {
            bhk1: pack.bhk?.['1']?.median || 20000,
            bhk2: pack.bhk?.['2']?.median || 35000,
            bhk3: pack.bhk?.['3']?.median || 55000,
            depositMonths: [pack.deposit_multiple?.min || 2, pack.deposit_multiple?.max || 5],
            city: pack.city,
            n: pack.bhk?.['2']?.n || 10
          }
        ]);
      }
    }
    return entries;
  })
);

export const PHRASE_PATTERNS = [
  {
    category: 'advance_fee',
    severity: 'high',
    patterns: [
      /gate\s*pass/i,
      /visiting\s*token/i,
      /token\s*before\s*(?:visit|viewing|seeing|inspection)/i,
      /entry\s*(?:pass|slip)/i,
      /visiting\s*card\s*charge/i,
      /registration\s*fee\s*before/i,
      /courier\s*clearance\s*pass/i,
      /refundable\s*upon\s*gate\s*entry/i
    ],
    label: 'Demands advance token/pass before physical flat inspection'
  },
  {
    category: 'military_impersonation',
    severity: 'high',
    patterns: [
      /(?:army|military|defence|defense|cisf|crpf)\s*officer/i,
      /(?:transferred|posted)\s*to\s*(?:srinagar|border|cantt|cantonment|jammu)/i,
      /military\s*camp\s*dispatch/i,
      /urgent\s*duty\s*posting/i
    ],
    label: 'Claims military/defense transfer pretext'
  },
  {
    category: 'absentee_pretext',
    severity: 'medium',
    patterns: [
      /relocated\s*(?:abroad|permanently|overseas)/i,
      /money\s*is\s*not\s*my\s*motive/i,
      /keys\s*are\s*(?:with|deposited\s*at)\s*courier/i,
      /key\s*courier\s*delivery/i
    ],
    label: 'Claims remote owner unavailable with courier key delivery'
  },
  {
    category: 'urgency_bait',
    severity: 'medium',
    patterns: [
      /(?:traveling|leaving)\s*out\s*of\s*country\s*tonight/i,
      /100%\s*refundable\s*if\s*you\s*do\s*not\s*like/i,
      /whatsapp\s*immediately\s*for\s*upi\s*qr/i
    ],
    label: 'High-pressure urgency or unusual refund assurance'
  },
  {
    category: 'sale_token_pressure',
    severity: 'high',
    patterns: [
      /token\s*to\s*(?:hold|block|reserve)\s*(?:the\s*flat|property|deal)/i,
      /non-?refundable\s*booking\s*(?:token|advance)/i,
      /advance\s*token\s*before\s*legal\s*verification/i
    ],
    label: 'Demands booking token before legal due diligence'
  },
  {
    category: 'sale_title_risk',
    severity: 'high',
    patterns: [
      /\b(?:gpa|power\s*of\s*attorney)\s*sale\b/i,
      /\bunapproved\s*layout\b/i,
      /\brevenue\s*(?:site|land)\s*without\s*dc\b/i,
      /\blitigation\s*pending\b/i
    ],
    label: 'Potential title or unapproved layout risk mentioned'
  }
];

/**
 * Normalizes locality query to match standard benchmarks (for legacy callers)
 */
export function findLocalityBenchmark(localityStr) {
  if (!localityStr) return null;
  const normalized = localityStr.toLowerCase();
  for (const [key, data] of Object.entries(LOCALITY_BENCHMARKS)) {
    if (normalized.includes(key)) {
      return { key, ...data };
    }
  }
  return null;
}

/**
 * Evaluates price outlier signal against dynamic fallback benchmarks.
 * Supports both function signatures:
 *   evaluatePriceSignal(listing, context)
 *   evaluatePriceSignal(rent, localityStr, bhk, context)
 */
export function evaluatePriceSignal(arg1, arg2, arg3, arg4) {
  let listing = {};
  let context = {};

  if (typeof arg1 === 'object' && arg1 !== null) {
    listing = arg1;
    context = arg2 || {};
  } else {
    listing = {
      rent: arg1,
      locality: arg2 || '',
      bhk: typeof arg3 === 'number' ? arg3 : 2
    };
    context = arg4 || {};
  }

  const rent = listing.rent;
  const bhk = listing.bhk || 2;
  const localityStr = listing.locality || '';

  if (!rent || rent <= 0) {
    return {
      fired: false,
      reason: 'Rent amount not specified or unparsed',
      point: 'Monthly rent unlisted or not detected.',
      humanReason: 'Could not extract an explicit numeric monthly rent from the listing details.',
      details: null
    };
  }

  // Walk the dynamic fallback ladder (Peer Page -> Area Cell -> District Cell -> City -> None)
  const benchmark = getBenchmark(listing, context);

  // If level is 'none' (insufficient local data): Stay silent! Do not flag without evidence
  if (benchmark.level === 'none' || !benchmark.median) {
    return {
      fired: false,
      reason: 'Not enough local price data to verify price deviation (sample size < 5)',
      point: 'Insufficient local benchmark data (price check deferred).',
      humanReason: 'FlatAudit requires at least 5 local peer observations to verify rent deviations. Non-price safety checks continue running.',
      details: {
        rent,
        level: 'none',
        sampleSize: 0,
        confidence: 'none'
      }
    };
  }

  const medianRent = benchmark.median;
  const diffPercent = Math.round(((rent - medianRent) / medianRent) * 100);
  const ratio = Math.round((rent / medianRent) * 100) / 100;
  const z = benchmark.mad > 0 ? robustZScore(rent, medianRent, benchmark.mad) : 0;

  // Extract locality descriptor for readable reporting
  const locLabel = (localityStr ? localityStr.split(',')[0].trim().toUpperCase() : 'MARKET');

  // Condition: Under 0.62x median (diff <= -38%) or robust z <= -2.5
  if (diffPercent <= -38 || (z <= -2.5 && benchmark.mad > 0)) {
    return {
      fired: true,
      severity: diffPercent <= -50 ? 'high' : 'medium',
      reason: `Rent of ₹${rent.toLocaleString('en-IN')} is ${Math.abs(diffPercent)}% below the ${locLabel} ${bhk}BHK median (₹${medianRent.toLocaleString('en-IN')}) [${benchmark.sourceLabel}]`,
      point: `Monthly rent (₹${rent.toLocaleString('en-IN')}) is ${Math.abs(diffPercent)}% lower than normal.`,
      humanReason: `Typical ${bhk}BHK flats in this area rent for ~₹${medianRent.toLocaleString('en-IN')}/mo. Extremely cheap rent is often used as bait to solicit advance tokens. (${benchmark.sourceLabel})`,
      details: {
        rent,
        medianRent,
        diffPercent,
        ratio,
        zScore: Math.round(z * 10) / 10,
        sampleSize: benchmark.n,
        level: benchmark.level,
        confidence: benchmark.confidence,
        sourceLabel: benchmark.sourceLabel,
        locality: locLabel,
        bhk
      }
    };
  }

  return {
    fired: false,
    reason: `Rent of ₹${rent.toLocaleString('en-IN')} is within normal range for ${locLabel} ${bhk}BHK (median: ₹${medianRent.toLocaleString('en-IN')}) [${benchmark.sourceLabel}]`,
    point: `Rent of ₹${rent.toLocaleString('en-IN')}/mo aligns with local market rates.`,
    humanReason: `Rent matches the typical rate for ${bhk}BHK apartments (market median: ₹${medianRent.toLocaleString('en-IN')}, ${benchmark.sourceLabel}).`,
    details: {
      rent,
      medianRent,
      diffPercent,
      ratio,
      sampleSize: benchmark.n,
      level: benchmark.level,
      confidence: benchmark.confidence,
      sourceLabel: benchmark.sourceLabel
    }
  };
}

/**
 * Evaluates deposit ratio against dynamic market norms.
 * Supports both signatures:
 *   evaluateDepositSignal(listing, context)
 *   evaluateDepositSignal(rent, deposit, localityStr, context)
 */
export function evaluateDepositSignal(arg1, arg2, arg3, arg4) {
  let listing = {};
  let context = {};

  if (typeof arg1 === 'object' && arg1 !== null) {
    listing = arg1;
    context = arg2 || {};
  } else {
    listing = {
      rent: arg1,
      deposit: arg2,
      locality: arg3 || ''
    };
    context = arg4 || {};
  }

  const rent = listing.rent;
  const deposit = listing.deposit;
  const localityStr = listing.locality || '';

  if (deposit === null || deposit === undefined || !rent || rent <= 0) {
    return {
      fired: false,
      reason: 'Deposit details not available',
      point: 'Deposit details not specified',
      humanReason: 'The listing does not mention an explicit security deposit amount.',
      details: null
    };
  }

  const ratio = +(deposit / rent).toFixed(1);
  const benchmark = getBenchmark(listing, context);
  const minNorm = benchmark.depositMultiple ? benchmark.depositMultiple.min : 1.5;
  const maxNorm = benchmark.depositMultiple ? benchmark.depositMultiple.max : 6.0;

  // Condition 1: 0 deposit or token deposit on an expensive listing claiming urgency
  if (deposit === 0 || (deposit > 0 && ratio < 0.8 && minNorm >= 2.5)) {
    const isZero = deposit === 0;
    return {
      fired: true,
      severity: isZero ? 'medium' : 'low',
      reason: isZero
        ? `Listing advertises zero security deposit, atypical for local rental norms [${benchmark.sourceLabel}]`
        : `Deposit of ₹${deposit.toLocaleString('en-IN')} is only ${ratio}x monthly rent (expected ${minNorm}x–${maxNorm}x) [${benchmark.sourceLabel}]`,
      point: isZero
        ? 'Zero security deposit advertised for a furnished apartment.'
        : `Security deposit is unusually low (only ${ratio}x monthly rent).`,
      humanReason: isZero
        ? `Landlords customarily require ${minNorm} to ${maxNorm} months deposit (${benchmark.sourceLabel}). Zero deposit offers are frequently paired with high-pressure booking token fees.`
        : `Standard deposit is usually ${minNorm}x to ${maxNorm}x monthly rent. A token-sized deposit can be a sign of a rushed booking pretext.`,
      details: { rent, deposit, ratio, expectedRange: [minNorm, maxNorm], sampleSize: benchmark.n }
    };
  }

  // Condition 2: Absurdly exorbitant deposit demand (> 10 months)
  if (ratio > 10) {
    return {
      fired: true,
      severity: 'medium',
      reason: `Deposit of ₹${deposit.toLocaleString('en-IN')} is ${ratio}x monthly rent (unusually high)`,
      point: `Demanding an abnormally high deposit (${ratio} months rent).`,
      humanReason: `Deposit is significantly above typical market standards (${minNorm}x–${maxNorm}x). Verify landlord identity and society ownership before transferring large sums.`,
      details: { rent, deposit, ratio, sampleSize: benchmark.n }
    };
  }

  return {
    fired: false,
    reason: `Deposit ratio of ${ratio}x monthly rent is within normal bounds (${minNorm}x–${maxNorm}x) [${benchmark.sourceLabel}]`,
    point: `Deposit of ₹${deposit.toLocaleString('en-IN')} (${ratio}x rent) is standard.`,
    humanReason: `Security deposit adheres to normal rental customs (${minNorm}x–${maxNorm}x monthly rent, ${benchmark.sourceLabel}).`,
    details: { rent, deposit, ratio, sampleSize: benchmark.n }
  };
}

/**
 * Evaluates text for known advance-fee and scam phrase signals.
 */
export function evaluatePhraseSignal(text) {
  if (!text || typeof text !== 'string') {
    return {
      fired: false,
      matchedPatterns: [],
      reason: 'No description text provided',
      point: 'No description text provided',
      humanReason: 'Could not evaluate description text.'
    };
  }

  const matched = [];
  let highestSeverity = 'low';

  for (const group of PHRASE_PATTERNS) {
    for (const pattern of group.patterns) {
      if (pattern.test(text)) {
        matched.push({ category: group.category, label: group.label, severity: group.severity });
        if (group.severity === 'high') highestSeverity = 'high';
        else if (group.severity === 'medium' && highestSeverity !== 'high') highestSeverity = 'medium';
        break;
      }
    }
  }

  if (matched.length > 0) {
    const labels = matched.map(m => m.label).join('; ');
    return {
      fired: true,
      severity: highestSeverity,
      matchedPatterns: matched,
      matchedCount: matched.length,
      reason: `Found ${matched.length} suspicious advance-fee phrase pattern(s): ${labels}`,
      point: `Contains ${matched.length} advance-fee or token payment demand phrase(s).`,
      humanReason: `Listing description contains terms frequently associated with rental advance fraud: "${labels}".`,
      details: { matchedCount: matched.length, categories: matched.map(m => m.category) }
    };
  }

  return {
    fired: false,
    matchedPatterns: [],
    matchedCount: 0,
    reason: 'No advance-fee or identity-pretext phrases detected',
    point: 'No advance payment or gate pass phrases detected.',
    humanReason: 'The listing text contains standard description wording with no requests for visiting tokens or gate fees.',
    details: { matchedCount: 0 }
  };
}

/**
 * Evaluates duplicate image fingerprint signal from historical registry observations.
 */
export function evaluateDuplicateImageSignal(seenCount = 1) {
  const count = typeof seenCount === 'number' ? seenCount : 1;

  if (count > 3) {
    return {
      fired: true,
      severity: 'high',
      seenCount: count,
      reason: `Photo fingerprint has appeared across ${count} distinct listings in the registry`,
      point: `Photo reused across ${count} different listings.`,
      humanReason: `This exact apartment photo has been indexed across ${count} separate listings. Scammers commonly reuse stolen high-resolution photos across multiple cities.`,
      details: { seenCount: count }
    };
  }

  if (count > 1) {
    return {
      fired: true,
      severity: 'medium',
      seenCount: count,
      reason: `Photo fingerprint has appeared across ${count} listings in the registry`,
      point: `Photo seen in ${count} listings.`,
      humanReason: `This photo fingerprint was observed in ${count} previous listings. Verify whether this is a multi-agent listing or reused stock photo.`,
      details: { seenCount: count }
    };
  }

  return {
    fired: false,
    seenCount: 1,
    reason: 'Photo has not been observed across conflicting listings',
    point: 'Photo appears unique to this listing.',
    humanReason: 'The image fingerprint has not been observed across conflicting rental posts.',
    details: { seenCount: 1 }
  };
}

/**
 * Evaluates asking price for sale listings relative to government circle rate (guidance value).
 */
export function evaluateSalePriceSignal(listing, context = {}) {
  const price = listing.price || listing.salePrice || 0;
  const area = listing.area_sqft || listing.areaSqft || 0;
  const psf = listing.pricePerSqft || (price > 0 && area > 0 ? Math.round(price / area) : null);
  const locality = listing.locality || '';
  const guidance = getGuidanceValue(locality, listing.city || 'bengaluru');

  if (!price || price <= 0) {
    return {
      fired: false,
      reason: 'No sale price specified',
      point: 'Price details not found on page.',
      humanReason: 'Could not extract numeric sale price.'
    };
  }

  // Compare against Guidance Value (Circle Rate) if available
  if (guidance && psf) {
    const guidanceRate = guidance.guidancePerSqft;
    // Suspiciously below circle rate (> 35% below government reference value)
    if (psf < guidanceRate * 0.65) {
      const discount = Math.round((1 - psf / guidanceRate) * 100);
      return {
        fired: true,
        severity: 'high',
        reason: `Asking rate of ₹${psf.toLocaleString('en-IN')}/sq.ft is ${discount}% below government guidance rate (₹${guidanceRate.toLocaleString('en-IN')}/sq.ft) [${guidance.source}, effective ${guidance.effectiveDate}]`,
        point: `Asking rate is ${discount}% below state guidance value.`,
        humanReason: `Asking price per sq ft is ${discount}% below the official state guidance value of ₹${guidanceRate.toLocaleString('en-IN')}/sq.ft (${guidance.source}, effective ${guidance.effectiveDate}). Lower rates can occur in older properties, distressed sales, or unrenovated units; buyers typically verify property title, encumbrances, and approved building plans with a legal professional before payment.`,
        details: { price, psf, guidanceRate, discount, source: guidance.source, effectiveDate: guidance.effectiveDate }
      };
    }

    return {
      fired: false,
      reason: `Asking rate of ₹${psf.toLocaleString('en-IN')}/sq.ft aligns with or exceeds government guidance rate (₹${guidanceRate.toLocaleString('en-IN')}/sq.ft) [${guidance.source}]`,
      point: `Asking rate (₹${psf.toLocaleString('en-IN')}/sq.ft) exceeds government circle rate.`,
      humanReason: `Price per square foot is above the official government guidance reference value of ₹${guidanceRate.toLocaleString('en-IN')}/sq.ft for ${guidance.localityKey} (${guidance.source}).`,
      details: { price, psf, guidanceRate, source: guidance.source }
    };
  }

  return {
    fired: false,
    reason: `Sale price ₹${price.toLocaleString('en-IN')} (₹${psf ? psf.toLocaleString('en-IN') + '/sq.ft' : 'N/A'}) [Not enough local guidance data]`,
    point: `Asking price: ₹${(price / 10000000).toFixed(2)} Cr (${psf ? '₹' + psf.toLocaleString('en-IN') + '/sq.ft' : ''}).`,
    humanReason: `Recorded asking price of ₹${(price / 10000000).toFixed(2)} Cr. Local government circle rate data is not yet indexed for this exact neighborhood.`,
    details: { price, psf }
  };
}

/**
 * Evaluates presence of RERA registration ID and links out to official state search portal.
 */
export function evaluateReraSignal(listing) {
  const reraId = listing.reraId || null;
  const portal = getReraPortalUrl(reraId, listing.locality || '');

  if (reraId) {
    return {
      fired: false,
      reraId,
      portalUrl: portal.url,
      portalLabel: portal.label,
      reason: `RERA Registration ID published: ${reraId} (${portal.label})`,
      point: `RERA Registration ID provided (${reraId}).`,
      humanReason: `Listing displays an official RERA registration number (${reraId}). You can independently verify builder disclosures and approvals directly on the official ${portal.label} (${portal.url}).`,
      details: { reraId, state: portal.state, portalUrl: portal.url }
    };
  }

  const isResale = /resale|ready\s*to\s*move/i.test(`${listing.title || ''} ${listing.description || ''} ${listing.possessionStatus || ''}`);

  return {
    fired: false,
    reraId: null,
    portalUrl: portal.url,
    portalLabel: portal.label,
    reason: isResale 
      ? `Resale property: RERA not published; physical OC/CC verification required.`
      : `No RERA registration ID displayed on listing page.`,
    point: isResale ? 'Resale flat: Verify physical OC & CC.' : 'No RERA registration ID displayed.',
    humanReason: isResale
      ? `Completed resale properties built prior to RERA require physical verification of the Occupancy Certificate (OC) and building sanction plan.`
      : `No RERA registration number is listed. Under RERA guidelines, all promotional listings for new projects must prominently display the official registration number. Verify directly on ${portal.label}.`,
    details: { isResale, portalUrl: portal.url }
  };
}

/**
 * Composite evaluator running all signals and constructing factual points & reasons.
 * Accepts optional options parameter to provide peerListings or customPacks.
 */
export function analyzeListing(listing, options = {}) {
  const seenCount = options.seenCount || 1;
  const fullText = `${listing.title || ''} ${listing.description || ''}`;

  // Handle explicit unknown mode: prompt user for mode toggle & block price comparisons
  if (listing.listingType === 'unknown') {
    const priceCheck = evaluatePricePerSqftCheck(listing, options.peerListings || [], options);
    return {
      listingType: 'unknown',
      badgeLabel: 'Select Mode',
      badgeTone: 'warn',
      headlineSummary: 'Listing intent uncertain. Select whether you are buying or renting to evaluate benchmarks.',
      firedCount: 0,
      observableFacts: ['Listing type (buying vs renting) could not be verified automatically with >= 2 independent signals.'],
      humanReadablePoints: [
        {
          category: 'Listing Intent',
          icon: '❓',
          fired: false,
          statusLabel: 'Action Required',
          point: 'Intent could not be determined automatically.',
          reason: 'Both rental and purchase signals are ambiguous or insufficient. Please choose whether this listing is for Rent or Sale using the switch in the companion drawer.'
        },
        {
          category: priceCheck.category,
          icon: priceCheck.icon,
          fired: priceCheck.fired,
          blocked: true,
          statusLabel: priceCheck.statusLabel,
          point: priceCheck.point,
          reason: priceCheck.reason,
          details: priceCheck
        }
      ],
      safetyAdvice: ['Select Rent or Sale to activate verified locality benchmarks.'],
      priceCheck,
      signals: {}
    };
  }

  const isSale = listing.listingType === 'sale' || Boolean(listing.price && !listing.rent);

  if (isSale) {
    const salePriceSignal = evaluateSalePriceSignal(listing, options);
    const reraSignal = evaluateReraSignal(listing);
    const phraseSignal = evaluatePhraseSignal(fullText);
    const imageSignal = evaluateDuplicateImageSignal(seenCount);

    const firedSignals = [];
    if (salePriceSignal.fired) firedSignals.push({ id: 'salePrice', ...salePriceSignal });
    if (phraseSignal.fired) firedSignals.push({ id: 'phrase', ...phraseSignal });
    if (imageSignal.fired) firedSignals.push({ id: 'duplicateImage', ...imageSignal });

    const firedCount = firedSignals.length;
    const highSeverityCount = firedSignals.filter(s => s.severity === 'high').length;

    let badgeLabel = 'Looks normal';
    let badgeTone = 'ok';
    let headlineSummary = 'Property sale listing appears standard based on observable facts and circle rates.';

    if (highSeverityCount >= 2 || firedCount >= 3) {
      badgeLabel = 'Many signals';
      badgeTone = 'bad';
      headlineSummary = 'High Risk: Multiple price, title, or token anomalies flagged for this sale listing.';
    } else if (highSeverityCount === 1 || firedCount >= 1) {
      badgeLabel = 'Some signals';
      badgeTone = 'warn';
      headlineSummary = 'Notice: One or more unusual sale conditions observed. Conduct thorough legal review.';
    }

    const humanReadablePoints = [
      {
        category: 'Sale Valuation',
        icon: '🏷️',
        fired: salePriceSignal.fired,
        point: salePriceSignal.point,
        reason: salePriceSignal.humanReason
      },
      {
        category: 'RERA Registration',
        icon: '🏛️',
        fired: reraSignal.fired,
        point: reraSignal.point,
        reason: reraSignal.humanReason,
        portalUrl: reraSignal.portalUrl
      },
      {
        category: 'Terms & Token Hold',
        icon: '📜',
        fired: phraseSignal.fired,
        point: phraseSignal.point,
        reason: phraseSignal.humanReason
      },
      {
        category: 'Photo Authenticity',
        icon: '🖼️',
        fired: imageSignal.fired,
        point: imageSignal.point,
        reason: imageSignal.humanReason
      }
    ];

    let priceCheck = null;
    if (options.peerListings || options.includePriceCheck) {
      priceCheck = evaluatePricePerSqftCheck(listing, options.peerListings || [], options);
      humanReadablePoints.push({
        category: priceCheck.category,
        icon: priceCheck.icon,
        fired: priceCheck.fired,
        statusLabel: priceCheck.statusLabel,
        point: priceCheck.point,
        reason: priceCheck.reason,
        details: priceCheck
      });
    }

    const buyerDueDiligenceChecklist = [
      '1. 30-Year Title Search: Hire an independent property advocate to verify chain of title documents.',
      '2. Encumbrance Certificate (EC): Obtain Nil Encumbrance Certificate (Form 15) from Sub-Registrar.',
      '3. Sanction Plan & OC: Verify physical Occupancy Certificate (OC) and approved building plan.',
      '4. Khata & Tax Receipts: Confirm latest property tax payment receipts and e-Khata extract.',
      '5. Official RERA Portal Check: Confirm project approvals directly on the official state RERA portal.'
    ];

    return {
      listingType: 'sale',
      badgeLabel,
      badgeTone,
      headlineSummary,
      firedCount,
      observableFacts: firedSignals.map(s => s.reason),
      humanReadablePoints,
      buyerDueDiligenceChecklist,
      safetyAdvice: buyerDueDiligenceChecklist,
      reraPortal: reraSignal.portalUrl,
      priceCheck,
      disclaimer: 'Observable facts only. FlatAudit does not verify property title deeds or provide financial/legal advice. Always engage an independent advocate before transferring funds.',
      signals: {
        price: salePriceSignal,
        rera: reraSignal,
        phrase: phraseSignal,
        duplicateImage: imageSignal
      }
    };
  }

  // ==========================================
  // Standard Rental Listing Analysis
  // ==========================================
  const priceSignal = evaluatePriceSignal(listing, options);
  const depositSignal = evaluateDepositSignal(listing, options);
  const phraseSignal = evaluatePhraseSignal(fullText);
  const imageSignal = evaluateDuplicateImageSignal(seenCount);

  const firedSignals = [];
  if (priceSignal.fired) firedSignals.push({ id: 'price', ...priceSignal });
  if (depositSignal.fired) firedSignals.push({ id: 'deposit', ...depositSignal });
  if (phraseSignal.fired) firedSignals.push({ id: 'phrase', ...phraseSignal });
  if (imageSignal.fired) firedSignals.push({ id: 'duplicateImage', ...imageSignal });

  const firedCount = firedSignals.length;
  const highSeverityCount = firedSignals.filter(s => s.severity === 'high').length;

  let badgeLabel = 'Looks normal';
  let badgeTone = 'ok';
  let headlineSummary = 'This listing looks normal. Pricing, deposit, and descriptions match local norms.';

  if (highSeverityCount >= 2 || firedCount >= 3) {
    badgeLabel = 'Many signals';
    badgeTone = 'bad';
    headlineSummary = 'High Risk: Multiple scam signals flagged. Exercise extreme caution.';
  } else if (highSeverityCount === 1 || firedCount >= 1) {
    badgeLabel = 'Some signals';
    badgeTone = 'warn';
    headlineSummary = 'Notice: One or more unusual signals found. Review observations carefully.';
  }

  // Kill Chain Stage determination
  let killChainStage = 'Stage 0: Unflagged';
  if (phraseSignal.fired) {
    killChainStage = 'Stage 3: The Excuse (Advance fee / Token request)';
  } else if (priceSignal.fired || imageSignal.fired) {
    killChainStage = 'Stage 1: Fake Listing (Bait price / Stolen photos)';
  }

  const observableFacts = firedSignals.map(s => s.reason);

  const humanReadablePoints = [
    {
      category: 'Rent Pricing',
      icon: '💰',
      fired: priceSignal.fired,
      point: priceSignal.point,
      reason: priceSignal.humanReason
    },
    {
      category: 'Security Deposit',
      icon: '📑',
      fired: depositSignal.fired,
      point: depositSignal.point,
      reason: depositSignal.humanReason
    },
    {
      category: 'Terms & Phrasing',
      icon: '💬',
      fired: phraseSignal.fired,
      point: phraseSignal.point,
      reason: phraseSignal.humanReason
    },
    {
      category: 'Photo Authenticity',
      icon: '🖼️',
      fired: imageSignal.fired,
      point: imageSignal.point,
      reason: imageSignal.humanReason
    }
  ];

  let priceCheck = null;
  if (options.peerListings || options.includePriceCheck) {
    priceCheck = evaluatePricePerSqftCheck(listing, options.peerListings || [], options);
    humanReadablePoints.push({
      category: priceCheck.category,
      icon: priceCheck.icon,
      fired: priceCheck.fired,
      statusLabel: priceCheck.statusLabel,
      point: priceCheck.point,
      reason: priceCheck.reason,
      details: priceCheck
    });
  }

  const safetyAdvice = [
    'Never transfer any token fee, gate entry pass fee, or courier charge via UPI before you physically enter and tour the apartment.',
    'Always request to meet the owner, building security guard, or society manager in person at the property gate first.',
    'Legitimate landlords in India never charge entry or registration fees to inspect a rental property.'
  ];

  const resolvedBenchmark = getBenchmark(listing, options);

  return {
    listingType: 'rent',
    badgeLabel,
    badgeTone,
    headlineSummary,
    scamKillChainStage: killChainStage,
    firedCount,
    observableFacts,
    humanReadablePoints,
    safetyAdvice,
    priceCheck,
    benchmark: {
      level: resolvedBenchmark.level,
      sourceLabel: resolvedBenchmark.sourceLabel,
      n: resolvedBenchmark.n,
      median: resolvedBenchmark.median,
      mad: resolvedBenchmark.mad,
      confidence: resolvedBenchmark.confidence
    },
    signals: {
      price: priceSignal,
      deposit: depositSignal,
      phrase: phraseSignal,
      duplicateImage: imageSignal
    }
  };
}
