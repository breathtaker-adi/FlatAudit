/**
 * Indian Currency & Number Parsing Utilities for Rental Portals
 */

/**
 * Normalizes text to extract numeric monetary amount in INR.
 * Handles formats like:
 * - "₹ 42,000", "Rs. 12,000", "12000"
 * - "1.45 Cr", "1.45 Crore", "2 Crores"
 * - "1.5 Lac", "1.5 Lakh", "1.5L", "85 L"
 * - "45k", "45 K"
 * @param {string} raw
 * @returns {number|null}
 */
export function parseIndianCurrency(raw) {
  if (!raw || typeof raw !== 'string') return null;

  const cleaned = raw.replace(/[,\s]/g, '').toLowerCase();

  // Check for Crore / Cr
  const croreMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:crore|crores|cr)/);
  if (croreMatch) {
    const val = parseFloat(croreMatch[1]);
    return Math.round(val * 10000000);
  }

  // Check for Lakh / Lac
  const lakhMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:lakh|lac|l)/);
  if (lakhMatch) {
    const val = parseFloat(lakhMatch[1]);
    return Math.round(val * 100000);
  }

  // Check for K (thousands)
  const kMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*k/);
  if (kMatch) {
    const val = parseFloat(kMatch[1]);
    return Math.round(val * 1000);
  }

  // Strip common currency prefixes and abbreviations like "rs.", "rs", "₹", "inr"
  let sanitized = raw.replace(/(?:rs\.?|inr|₹)/gi, ' ');
  // Match the first valid number group (e.g. "12,000" or "42000.50")
  const numMatch = sanitized.match(/(\d[\d,]*(?:\.\d+)?)/);
  if (numMatch) {
    const cleanedNum = numMatch[1].replace(/,/g, '');
    const val = parseFloat(cleanedNum);
    return isNaN(val) ? null : Math.round(val);
  }

  return null;
}

/**
 * Extracts BHK count from text (e.g. "2 BHK", "3 Bedroom", "1RK" -> 1)
 * @param {string} raw
 * @returns {number|null}
 */
export function parseBHK(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const bhkMatch = raw.match(/(\d+)\s*(?:bhk|bedroom|bed|rk)/i);
  if (bhkMatch) {
    return parseInt(bhkMatch[1], 10);
  }
  if (/rk/i.test(raw)) return 1;
  return null;
}

/**
 * Extracts area in square feet (e.g. "1,250 sq.ft", "900 sqft", "1450 sq ft")
 * @param {string} raw
 * @returns {number|null}
 */
export function parseArea(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const match = raw.match(/([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s*ft|sqft|sq-ft|square\s*feet)/i);
  if (match) {
    const num = parseFloat(match[1].replace(/,/g, ''));
    return isNaN(num) ? null : Math.round(num);
  }
  return null;
}

/**
 * Extracts floor level from strings like "4th of 12 floors", "3rd floor", "Ground"
 * @param {string} raw
 * @returns {number|null}
 */
export function parseFloor(raw) {
  if (!raw || typeof raw !== 'string') return null;
  if (/ground/i.test(raw)) return 0;
  if (/basement|lower\s*ground/i.test(raw)) return -1;
  const match = raw.match(/(\d+)(?:st|nd|rd|th)?\s*(?:floor|\s*of\s*\d+\s*floors)/i);
  if (match) {
    const fl = parseInt(match[1], 10);
    return isNaN(fl) ? null : fl;
  }
  return null;
}

/**
 * Extracts Price per Sq.Ft (e.g. "₹ 7,500 / sq.ft", "Rs. 8,200/sqft", "9500 per sqft")
 * @param {string} raw
 * @returns {number|null}
 */
export function parsePricePerSqFt(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const match = raw.match(/(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(?:\/|\s*per\s*)\s*(?:sq\.?\s*ft|sqft|sq-ft|square\s*feet)/i);
  if (match) {
    const num = parseFloat(match[1].replace(/,/g, ''));
    return isNaN(num) ? null : Math.round(num);
  }
  return null;
}

/**
 * Extracts Area Type ("carpet", "builtup", "super_builtup")
 * @param {string} raw
 * @returns {'carpet'|'builtup'|'super_builtup'|'unknown'}
 */
export function parseAreaType(raw) {
  if (!raw || typeof raw !== 'string') return 'unknown';
  const lower = raw.toLowerCase();
  if (/carpet/i.test(lower)) return 'carpet';
  if (/super[-\s]*built|sbua/i.test(lower)) return 'super_builtup';
  if (/built[-\s]*up/i.test(lower)) return 'builtup';
  return 'unknown';
}

/**
 * Extracts Possession / Construction Status
 * @param {string} raw
 * @returns {'ready_to_move'|'under_construction'|'unknown'}
 */
export function parsePossessionStatus(raw) {
  if (!raw || typeof raw !== 'string') return 'unknown';
  const lower = raw.toLowerCase();
  if (/ready\s*to\s*move|immediate|resale|ready\s*possession/i.test(lower)) return 'ready_to_move';
  if (/under\s*construction|possession\s*by|launch|upcoming/i.test(lower)) return 'under_construction';
  return 'unknown';
}

/**
 * Extracts RERA Registration ID from text (e.g. PRM/KA/RERA/..., P518..., HRERA...)
 * @param {string} raw
 * @returns {string|null}
 */
export function parseReraId(raw) {
  if (!raw || typeof raw !== 'string') return null;

  // 1. Look for specific state RERA formats first
  const stateMatch = raw.match(/\b(PRM\/KA\/RERA\/[\w\/\-]+|ACK\/KA\/RERA\/[\w\/\-]+|P\d{11}|P\d{9}|HRERA[-\w\/\-]+)\b/i);
  if (stateMatch) {
    return stateMatch[1].trim();
  }

  // 2. Generic RERA prefix: match "RERA" followed by optional descriptors and delimiter
  const genericMatch = raw.match(/\bRERA\b(?:\s*(?:Registration|Registered|Regn?|Number|No|ID))?\.?[:\s#-]+([A-Z0-9][A-Z0-9\/\-]{4,})/i);
  if (genericMatch) {
    return genericMatch[1].trim();
  }

  return null;
}

/**
 * Determines whether a listing represents a property for sale or rent
 * @param {string} rawText
 * @param {string} [url='']
 * @returns {'sale'|'rent'}
 */
export function parseListingType(rawText, url = '') {
  const combined = (rawText + ' ' + url).toLowerCase();
  if (/\/(?:buy|sale|property-for-sale|buy-property)\b/.test(combined)) return 'sale';
  if (/\b(?:total\s*price|resale|emi\s*starts|price\s*per\s*sqft|crore|cr\b|possession\s*status)\b/.test(combined)) {
    if (/\b(?:for\s*rent|monthly\s*rent|security\s*deposit)\b/.test(combined) && !/\b(?:crore|cr\b)/.test(combined)) {
      return 'rent';
    }
    return 'sale';
  }
  return 'rent';
}


