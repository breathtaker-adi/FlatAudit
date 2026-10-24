/**
 * Listing Trust Analyzer - Signal Evaluation Engine
 *
 * Observable-facts based threat signal detection for Indian rental portals.
 * Never uses defamatory labels ("scammer", "fraud"); only states verifiable observations.
 */

export const LOCALITY_BENCHMARKS = {
  // Bangalore
  'indiranagar': { bhk1: 22000, bhk2: 40000, bhk3: 65000, depositMonths: [3, 6], city: 'Bangalore' },
  'hsr layout': { bhk1: 18000, bhk2: 32000, bhk3: 52000, depositMonths: [3, 6], city: 'Bangalore' },
  'koramangala': { bhk1: 22000, bhk2: 42000, bhk3: 68000, depositMonths: [3, 6], city: 'Bangalore' },
  'whitefield': { bhk1: 16000, bhk2: 28000, bhk3: 45000, depositMonths: [2, 5], city: 'Bangalore' },
  'bellandur': { bhk1: 18000, bhk2: 32000, bhk3: 50000, depositMonths: [2, 5], city: 'Bangalore' },

  // Mumbai
  'powai': { bhk1: 34000, bhk2: 55000, bhk3: 85000, depositMonths: [2, 4], city: 'Mumbai' },
  'andheri': { bhk1: 30000, bhk2: 50000, bhk3: 75000, depositMonths: [2, 4], city: 'Mumbai' },
  'bandra': { bhk1: 45000, bhk2: 75000, bhk3: 130000, depositMonths: [2, 5], city: 'Mumbai' },

  // Gurgaon / NCR
  'cyber city': { bhk1: 25000, bhk2: 42000, bhk3: 62000, depositMonths: [1, 3], city: 'Gurgaon' },
  'dlf phase 2': { bhk1: 24000, bhk2: 40000, bhk3: 60000, depositMonths: [1, 3], city: 'Gurgaon' },
  'sector 56': { bhk1: 16000, bhk2: 28000, bhk3: 42000, depositMonths: [1, 2], city: 'Gurgaon' },

  // Pune
  'hinjawadi': { bhk1: 14000, bhk2: 23000, bhk3: 35000, depositMonths: [1, 3], city: 'Pune' },
  'wakad': { bhk1: 15000, bhk2: 24000, bhk3: 36000, depositMonths: [1, 3], city: 'Pune' },

  // City-Level Fallbacks
  'bengaluru': { bhk1: 18000, bhk2: 32000, bhk3: 52000, depositMonths: [3, 6], city: 'Bengaluru' },
  'bangalore': { bhk1: 18000, bhk2: 32000, bhk3: 52000, depositMonths: [3, 6], city: 'Bengaluru' },
  'mumbai': { bhk1: 32000, bhk2: 52000, bhk3: 80000, depositMonths: [2, 4], city: 'Mumbai' },
  'gurgaon': { bhk1: 22000, bhk2: 36000, bhk3: 55000, depositMonths: [1, 3], city: 'Gurgaon' },
  'delhi': { bhk1: 16000, bhk2: 28000, bhk3: 45000, depositMonths: [1, 3], city: 'Delhi' },
  'noida': { bhk1: 14000, bhk2: 24000, bhk3: 38000, depositMonths: [1, 2], city: 'Noida' },
  'pune': { bhk1: 14000, bhk2: 23000, bhk3: 35000, depositMonths: [1, 3], city: 'Pune' },
  'hyderabad': { bhk1: 15000, bhk2: 26000, bhk3: 42000, depositMonths: [1, 3], city: 'Hyderabad' }
};

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
 * Normalizes locality query to match standard benchmarks
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
 * Evaluates price outlier signal against locality and BHK benchmarks.
 * Always returns rich, human-readable points even when the property is completely normal.
 */
export function evaluatePriceSignal(rent, localityStr, bhk = 2) {
  if (!rent || rent <= 0) {
    return {
      fired: false,
      reason: 'Rent amount not specified or unparsed',
      point: 'Monthly rent unlisted or not detected.',
      humanReason: 'Could not extract an explicit numeric monthly rent from the listing details.'
    };
  }

  let benchmark = findLocalityBenchmark(localityStr);
  if (!benchmark) {
    // Sensible metro fallback if specific locality string is unmapped
    benchmark = { key: 'metro area', bhk1: 18000, bhk2: 30000, bhk3: 48000, depositMonths: [2, 5], city: 'Metro Area' };
  }

  const bhkKey = `bhk${Math.min(Math.max(bhk, 1), 3)}`;
  const medianRent = benchmark[bhkKey] || 30000;
  const diffPercent = Math.round(((rent - medianRent) / medianRent) * 100);

  // Scammers use bait pricing significantly below market (e.g. 38%+ cheaper)
  if (diffPercent <= -38) {
    return {
      fired: true,
      severity: diffPercent <= -50 ? 'high' : 'medium',
      reason: `Rent of ₹${rent.toLocaleString('en-IN')} is ${Math.abs(diffPercent)}% below the ${benchmark.key.toUpperCase()} ${bhk}BHK median (₹${medianRent.toLocaleString('en-IN')})`,
      point: `Monthly rent (₹${rent.toLocaleString('en-IN')}) is ${Math.abs(diffPercent)}% lower than normal.`,
      humanReason: `Typical ${bhk}BHK flats in ${benchmark.key.toUpperCase()} rent for ~₹${medianRent.toLocaleString('en-IN')}/mo. Extremely cheap rent is often used as clickbait to attract urgent inquiries.`,
      details: { rent, medianRent, diffPercent, locality: benchmark.key, bhk }
    };
  }

  return {
    fired: false,
    reason: `Rent of ₹${rent.toLocaleString('en-IN')} is within normal range for ${benchmark.key.toUpperCase()} ${bhk}BHK (median: ₹${medianRent.toLocaleString('en-IN')})`,
    point: `Rent of ₹${rent.toLocaleString('en-IN')}/mo aligns with local market rates.`,
    humanReason: `Rent matches the typical rate for ${bhk}BHK apartments in ${benchmark.key.toUpperCase()} (market median: ₹${medianRent.toLocaleString('en-IN')}).`,
    details: { rent, medianRent, diffPercent }
  };
}

/**
 * Evaluates deposit ratio against local market norms.
 */
export function evaluateDepositSignal(rent, deposit, localityStr) {
  if (deposit === null || deposit === undefined || !rent || rent <= 0) {
    return {
      fired: false,
      reason: 'Deposit details not available',
      point: 'Deposit details not specified',
      humanReason: 'The listing does not mention an explicit security deposit amount.'
    };
  }

  const ratio = +(deposit / rent).toFixed(1);
  const benchmark = findLocalityBenchmark(localityStr);
  const [minNorm, maxNorm] = benchmark ? benchmark.depositMonths : [1.5, 6];

  // Condition 1: 0 deposit or token deposit on an expensive listing claiming urgency
  if (deposit === 0 || (deposit > 0 && ratio < 0.8 && minNorm >= 3)) {
    const isZero = deposit === 0;
    return {
      fired: true,
      severity: isZero ? 'medium' : 'low',
      reason: isZero
        ? `Listing advertises zero security deposit, atypical for ${benchmark?.city || 'this area'}`
        : `Deposit of ₹${deposit.toLocaleString('en-IN')} is only ${ratio}x monthly rent (expected ${minNorm}x–${maxNorm}x in ${benchmark?.city || 'this city'})`,
      point: isZero
        ? 'Zero security deposit advertised for a furnished apartment.'
        : `Security deposit is unusually low (only ${ratio}x monthly rent).`,
      humanReason: isZero
        ? `Landlords in ${benchmark?.city || 'this area'} customarily require ${minNorm} to ${maxNorm} months deposit. Zero deposit offers are frequently paired with high-pressure booking token fees.`
        : `Standard deposit in ${benchmark?.city || 'this city'} is usually ${minNorm}x to ${maxNorm}x monthly rent. A token-sized deposit can be a sign of a rushed booking pretext.`,
      details: { rent, deposit, ratio, expectedRange: [minNorm, maxNorm] }
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
      details: { rent, deposit, ratio }
    };
  }

  return {
    fired: false,
    reason: `Deposit ratio of ${ratio}x monthly rent is within normal bounds (${minNorm}x–${maxNorm}x)`,
    point: `Deposit of ₹${deposit.toLocaleString('en-IN')} (${ratio}x rent) is standard.`,
    humanReason: `Security deposit adheres to normal rental customs in ${benchmark?.city || 'this region'} (${minNorm}x–${maxNorm}x monthly rent).`,
    details: { rent, deposit, ratio }
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

  const matches = [];
  let highestSeverity = 'low';

  for (const group of PHRASE_PATTERNS) {
    for (const pattern of group.patterns) {
      if (pattern.test(text)) {
        matches.push({
          category: group.category,
          label: group.label,
          matchedTerm: text.match(pattern)[0]
        });
        if (group.severity === 'high') highestSeverity = 'high';
        else if (group.severity === 'medium' && highestSeverity !== 'high') highestSeverity = 'medium';
        break; // Match once per group
      }
    }
  }

  if (matches.length > 0) {
    const summary = matches.map(m => `"${m.matchedTerm}"`).join(', ');
    const labelsList = matches.map(m => m.label).join('; ');
    return {
      fired: true,
      severity: highestSeverity,
      matchedCount: matches.length,
      matches,
      reason: `Found ${matches.length} suspicious advance-fee phrase pattern(s): ${summary}`,
      point: `Demands advance fees or uses identity pretexts before physical visit.`,
      humanReason: `The listing mentions: ${labelsList} (e.g. ${summary}). Legitimate landlords and societies in India do not demand entry fees or gate pass payments prior to an in-person viewing.`,
      matchedTerms: matches.map(m => m.matchedTerm)
    };
  }

  return {
    fired: false,
    matchedCount: 0,
    matches: [],
    reason: 'No advance-fee or identity-pretext phrases detected',
    point: 'No advance-fee or identity-pretext phrases detected.',
    humanReason: 'Description contains regular property specifications (amenities, parking, direction) without suspicious token or gate pass demands.'
  };
}

/**
 * Evaluates image duplicate signal based on seen count in database.
 */
export function evaluateDuplicateImageSignal(seenCount) {
  if (!seenCount || seenCount <= 1) {
    return {
      fired: false,
      reason: 'Photo has not been observed across conflicting listings',
      point: 'Listing photo appears unique.',
      humanReason: 'This image fingerprint has not been seen across other conflicting addresses in the registry.'
    };
  }

  return {
    fired: true,
    severity: seenCount > 3 ? 'high' : 'medium',
    count: seenCount,
    reason: `This photo fingerprint has appeared across ${seenCount} distinct listings in the registry`,
    point: `Photo reused across ${seenCount} different listings.`,
    humanReason: `The visual fingerprint for this photo appeared in ${seenCount} separate listings. While genuine brokers occasionally share photos of identical builder units, heavy photo reuse can indicate downloaded internet imagery.`
  };
}

/**
 * Aggregates all individual signals into an objective observable report.
 * Label is strictly one of: 'Looks normal', 'Some signals', 'Many signals'.
 */
export function analyzeListing(listingData, duplicateStats = { seenCount: 1 }) {
  const fullText = `${listingData.title || ''} ${listingData.description || ''}`;

  const priceResult = evaluatePriceSignal(listingData.rent, listingData.locality, listingData.bhk);
  const depositResult = evaluateDepositSignal(listingData.rent, listingData.deposit, listingData.locality);
  const phraseResult = evaluatePhraseSignal(fullText);
  const duplicateResult = evaluateDuplicateImageSignal(duplicateStats.seenCount);

  const firedSignals = [];
  if (priceResult.fired) firedSignals.push({ id: 'price', category: 'Price Check', icon: '💰', ...priceResult });
  if (depositResult.fired) firedSignals.push({ id: 'deposit', category: 'Deposit Check', icon: '📑', ...depositResult });
  if (phraseResult.fired) firedSignals.push({ id: 'phrase', category: 'Advance Fee Pretext', icon: '⚠️', ...phraseResult });
  if (duplicateResult.fired) firedSignals.push({ id: 'image', category: 'Photo Duplication', icon: '🖼️', ...duplicateResult });

  const highSeverityCount = firedSignals.filter(s => s.severity === 'high').length;
  const totalFired = firedSignals.length;

  let badgeLabel = 'Looks normal';
  let badgeTone = 'ok'; // ok | warn | bad
  let headlineSummary = 'This listing looks normal. No major red flags detected.';

  if (highSeverityCount >= 2 || totalFired >= 3) {
    badgeLabel = 'Many signals';
    badgeTone = 'bad';
    headlineSummary = 'High Risk: Multiple scam signals flagged. Exercise extreme caution.';
  } else if (highSeverityCount === 1 || totalFired >= 1) {
    badgeLabel = 'Some signals';
    badgeTone = 'warn';
    headlineSummary = 'Notice: One or more unusual signals found. Review carefully.';
  }

  // Construct structured Human-Readable Points & Reasons
  const humanReadablePoints = [
    {
      category: 'Rent Pricing',
      icon: '💰',
      fired: priceResult.fired,
      severity: priceResult.severity || 'ok',
      point: priceResult.point,
      reason: priceResult.humanReason
    },
    {
      category: 'Security Deposit',
      icon: '📑',
      fired: depositResult.fired,
      severity: depositResult.severity || 'ok',
      point: depositResult.point,
      reason: depositResult.humanReason
    },
    {
      category: 'Terms & Phrasing',
      icon: '💬',
      fired: phraseResult.fired,
      severity: phraseResult.severity || 'ok',
      point: phraseResult.point,
      reason: phraseResult.humanReason
    },
    {
      category: 'Photo Authenticity',
      icon: '🖼️',
      fired: duplicateResult.fired,
      severity: duplicateResult.severity || 'ok',
      point: duplicateResult.point,
      reason: duplicateResult.humanReason
    }
  ];

  // Specific Actionable Safety Advice for Renters
  const safetyAdvice = [
    'Never transfer any token fee, gate entry pass fee, or courier charge via UPI before you physically enter and tour the apartment.',
    'Always request to meet the owner, building security guard, or society manager in person at the property gate first.',
    'If the poster claims to be an Army/CISF officer who cannot meet due to transfer, treat it with extreme caution — this is the #1 rental pretext in India.'
  ];

  return {
    badgeLabel,
    badgeTone,
    headlineSummary,
    firedCount: totalFired,
    signals: {
      price: priceResult,
      deposit: depositResult,
      phrase: phraseResult,
      duplicateImage: duplicateResult
    },
    observableFacts: firedSignals.map(s => s.reason),
    humanReadablePoints,
    safetyAdvice,
    scamKillChainStage: determineKillChainStage(firedSignals)
  };
}

function determineKillChainStage(firedSignals) {
  const hasPhrase = firedSignals.some(s => s.id === 'phrase');
  const hasPrice = firedSignals.some(s => s.id === 'price');
  const hasImage = firedSignals.some(s => s.id === 'image');

  if (hasPhrase) return 'Stage 3: The Excuse (Advance fee / Token request)';
  if (hasPrice || hasImage) return 'Stage 1: Fake Listing (Bait price / Stolen photos)';
  return 'Stage 0: Unflagged';
}
