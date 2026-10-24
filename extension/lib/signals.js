/**
 * Listing Trust Analyzer - Signal Evaluation Engine
 *
 * Observable-facts based threat signal detection for Indian rental portals.
 * Uses dynamic market benchmarks and peer-page data instead of hardcoded numbers.
 * Never uses defamatory labels ("scammer", "fraud"); only states verifiable observations.
 */

import { getBenchmark, robustZScore } from './benchmarks.js';
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
 * Composite evaluator running all signals and constructing factual points & reasons.
 * Accepts optional options parameter to provide peerListings or customPacks.
 */
export function analyzeListing(listing, options = {}) {
  const seenCount = options.seenCount || 1;
  const fullText = `${listing.title || ''} ${listing.description || ''}`;

  // Evaluate individual signals with benchmark context
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

  // Observable Facts (Defamation-free statements)
  const observableFacts = firedSignals.map(s => s.reason);

  // Human-Readable Points & Reasons (Always 4 structured cards)
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

  const safetyAdvice = [
    'Never transfer any token fee, gate entry pass fee, or courier charge via UPI before you physically enter and tour the apartment.',
    'Always request to meet the owner, building security guard, or society manager in person at the property gate first.',
    'Legitimate landlords in India never charge entry or registration fees to inspect a rental property.'
  ];

  const resolvedBenchmark = getBenchmark(listing, options);

  return {
    badgeLabel,
    badgeTone,
    headlineSummary,
    scamKillChainStage: killChainStage,
    firedCount,
    observableFacts,
    humanReadablePoints,
    safetyAdvice,
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
