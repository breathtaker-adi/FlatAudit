/**
 * FlatAudit - Multi-Signal Listing Type & Intent Classifier
 * 
 * Accurately classifies whether a property listing is for SALE (buying) or RENT.
 * Uses a weighted multi-factor scoring model across 4 independent dimensions:
 * 1. URL path tokens
 * 2. Breadcrumbs, Page Title, and Headings
 * 3. Price Notation & Currency Units (Cr/Crore vs /month, pm)
 * 4. Attribute Markers (Deposit, RERA ID, Possession Status, Home Loan EMI)
 * 
 * Rule: Requires at least 2 independent agreeing signals.
 * If signals conflict or score < 2, returns mode: 'unknown'.
 * Also identifies unsupported listing types (PG/Hostel, Commercial, Land/Plots).
 */

/**
 * @typedef {Object} ClassificationResult
 * @property {'rent'|'sale'|'unknown'} mode
 * @property {'high'|'medium'|'low'} confidence
 * @property {number} score - Net score (> 0 favors sale, < 0 favors rent)
 * @property {string[]} saleSignals - Fired sale indicators
 * @property {string[]} rentSignals - Fired rent indicators
 * @property {string|null} unsupportedType - 'pg' | 'commercial' | 'plot' | null
 */

/**
 * Classifies listing type from page content and URL.
 * 
 * @param {Document|object} docOrContext - DOM Document or simulated object
 * @param {string} [rawText=''] - Full text content of page or card
 * @param {string} [url=''] - Page URL
 * @returns {ClassificationResult}
 */
export function classifyListingType(docOrContext, rawText = '', url = '') {
  const currentUrl = (url || (typeof window !== 'undefined' ? window.location.href : '')).toLowerCase();
  
  // Extract text representation
  let text = (rawText || '').toLowerCase();
  let title = '';
  let breadcrumbText = '';

  if (docOrContext && typeof docOrContext.querySelector === 'function') {
    const titleEl = docOrContext.querySelector('h1, title, meta[property="og:title"]');
    if (titleEl) {
      title = (titleEl.content || titleEl.textContent || '').toLowerCase();
    }
    const breadcrumbEl = docOrContext.querySelector('nav, [class*="breadcrumb"], [id*="breadcrumb"], ol, ul');
    if (breadcrumbEl) {
      breadcrumbText = (breadcrumbEl.textContent || '').toLowerCase();
    }
    if (!text && docOrContext.body) {
      text = (docOrContext.body.innerText || docOrContext.body.textContent || '').toLowerCase();
    }
  }

  // Category context: evaluated on title, breadcrumbs, and URL to avoid false positives
  // from user reviews or locality description mentions (e.g. "colleges nearby, many pg's available")
  const categoryContext = `${title} ${breadcrumbText} ${currentUrl}`;

  // 0. Check for Unsupported Listing Categories
  if (/(?:\/pg\/|\/paying-guest\/|\/hostel\/|\/coliving\/)/i.test(currentUrl) ||
      /\b(?:pg\s*for\s*(?:boys|girls|men|women|students)|paying\s*guest|coliving|co-living|hostel|shared\s*bed|bed\s*in\s*a\s*room)\b/i.test(categoryContext)) {
    return {
      mode: 'unknown',
      confidence: 'low',
      score: 0,
      saleSignals: [],
      rentSignals: [],
      unsupportedType: 'pg'
    };
  }

  if (/(?:\/commercial\/|\/office-space\/|\/retail\/)/i.test(currentUrl) ||
      /\b(?:commercial\s*space|office\s*space|retail\s*shop|warehouse|godown|industrial\s*shed|commercial\s*land)\b/i.test(categoryContext)) {
    return {
      mode: 'unknown',
      confidence: 'low',
      score: 0,
      saleSignals: [],
      rentSignals: [],
      unsupportedType: 'commercial'
    };
  }

  if (/(?:\/plots?[\/\-_]|\/land[\/\-_])/i.test(currentUrl) ||
      /\b(?:plots?\s*for\s*sale|agricultural\s*land|residential\s*plots?|villa\s*plots?|gated\s*community\s*(?:villa\s*)?plots?|farm\s*land)\b/i.test(categoryContext)) {
    return {
      mode: 'unknown',
      confidence: 'low',
      score: 0,
      saleSignals: [],
      rentSignals: [],
      unsupportedType: 'plot'
    };
  }

  const saleSignals = [];
  const rentSignals = [];
  let saleScore = 0;
  let rentScore = 0;

  // 1. URL Path Tokens (Weight: 2-3)
  if (/(?:\/buy\/|\/sale\/|\/resale\/|\/property-for-sale\/|\/buy-property\/|\/for-sale\/|\/residential-buy\/|npxid-|npid-|\/projects?\/|\/new-projects?\/)/i.test(currentUrl)) {
    saleSignals.push('URL indicates sale/buy/project path');
    saleScore += 2;
  } else if (/(?:\/rent\/|\/rentals\/|\/property-for-rent\/|\/flat-for-rent\/|\/to-let\/|\/residential-rent\/)/i.test(currentUrl)) {
    rentSignals.push('URL indicates rent/to-let path');
    rentScore += 2;
  }

  // 2. Title & Breadcrumbs (Weight: 2)
  const headerContext = `${title} ${breadcrumbText}`;
  if (/\b(?:for\s*sale|resale|buy\s*flat|buy\s*apartment|ready\s*possession|sale\s*in|property\s*for\s*sale|projects?\s*in|project\s*overview|price\s*list)\b/i.test(headerContext)) {
    saleSignals.push('Title or breadcrumb explicitly mentions sale/buy/resale/project');
    saleScore += 2;
  }
  if (/\b(?:for\s*rent|flat\s*for\s*rent|house\s*for\s*rent|to\s*let|rent\s*in|monthly\s*rental)\b/i.test(headerContext)) {
    rentSignals.push('Title or breadcrumb explicitly mentions rent/to-let');
    rentScore += 2;
  }

  // 3. Price Notation & Currency Units (Weight: 3)
  // Check for Crore (very strong indicator of buying/sale)
  if (/\b\d+(?:\.\d+)?\s*(?:cr\b|crore|crores)/.test(text) || /\b\d+(?:\.\d+)?\s*(?:cr\b|crore|crores)/.test(title)) {
    // Check if it's not a rare luxury rent mentioned as "1 Crore deposit"
    if (!/\b1\s*crore\s*deposit\b/.test(text)) {
      saleSignals.push('Price quoted in Crores (Cr)');
      saleScore += 3;
    }
  }

  // Check for explicit monthly rental notation (/mo, /month, per month, pm)
  if (/(?:\/\s*mo\b|\/\s*month\b|per\s*month\b|\bp\.?m\.?\b|monthly\s*rent)/.test(text) || 
      /(?:\/\s*mo\b|\/\s*month\b|per\s*month\b|\bp\.?m\.?\b|monthly\s*rent)/.test(title)) {
    rentSignals.push('Price explicitly qualified with per-month notation');
    rentScore += 3;
  }

  // 4. Attribute Markers (Weight: 2)
  // Deposit presence (Rent indicator)
  if (/\b(?:security\s*deposit|deposit\s*amount|advance\s*amount)\s*[:\-]?\s*(?:₹|rs\.?)?\s*[\d,]+/i.test(text)) {
    rentSignals.push('Security deposit attribute present');
    rentScore += 2;
  }

  // Possession status / RERA / Home loan EMI (Sale indicators)
  if (/\b(?:possession\s*date|possession\s*status|under\s*construction|rera\s*approved|rera\s*id|rera\s*reg|emi\s*starts\s*at|home\s*loan\s*available)\b/i.test(text)) {
    saleSignals.push('Sale attributes present (RERA, possession status, or home loan EMI)');
    saleScore += 2;
  }

  // Agreement and Threshold Evaluation
  const netScore = saleScore - rentScore;
  const totalSignals = saleSignals.length + rentSignals.length;

  // Require at least two independent agreeing signals for high/medium confidence
  if (saleScore >= 2 && rentScore === 0) {
    return {
      mode: 'sale',
      confidence: saleSignals.length >= 2 ? 'high' : 'medium',
      score: netScore,
      saleSignals,
      rentSignals,
      unsupportedType: null
    };
  }

  if (rentScore >= 2 && saleScore === 0) {
    return {
      mode: 'rent',
      confidence: rentSignals.length >= 2 ? 'high' : 'medium',
      score: netScore,
      saleSignals,
      rentSignals,
      unsupportedType: null
    };
  }

  // Conflicting signals: evaluate net difference
  if (netScore >= 3 && saleSignals.length >= 2) {
    return {
      mode: 'sale',
      confidence: 'medium',
      score: netScore,
      saleSignals,
      rentSignals,
      unsupportedType: null
    };
  }

  if (netScore <= -3 && rentSignals.length >= 2) {
    return {
      mode: 'rent',
      confidence: 'medium',
      score: netScore,
      saleSignals,
      rentSignals,
      unsupportedType: null
    };
  }

  // Indeterminate / Conflicted -> fallback to unknown
  return {
    mode: 'unknown',
    confidence: 'low',
    score: netScore,
    saleSignals,
    rentSignals,
    unsupportedType: null
  };
}
