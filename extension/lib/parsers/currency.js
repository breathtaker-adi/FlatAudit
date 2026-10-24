/**
 * Indian Currency & Number Parsing Utilities for Rental Portals
 */

/**
 * Normalizes text to extract numeric monetary amount in INR.
 * Handles formats like:
 * - "₹ 42,000", "Rs. 12,000", "12000"
 * - "1.5 Lac", "1.5 Lakh", "1.5L"
 * - "45k", "45 K"
 * @param {string} raw
 * @returns {number|null}
 */
export function parseIndianCurrency(raw) {
  if (!raw || typeof raw !== 'string') return null;

  const cleaned = raw.replace(/[,\s]/g, '').toLowerCase();

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

