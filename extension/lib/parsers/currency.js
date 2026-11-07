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

  // 1. Check for Crore / Cr
  const croreMatch = raw.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:crore|crores|cr\b)/i);
  if (croreMatch) {
    const val = parseFloat(croreMatch[1]);
    return isNaN(val) ? null : Math.round(val * 10000000);
  }

  // 2. Check for Lakh / Lac
  const lakhMatch = raw.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:lakh|lakhs|lac|lacs|l\b)/i);
  if (lakhMatch) {
    const val = parseFloat(lakhMatch[1]);
    return isNaN(val) ? null : Math.round(val * 100000);
  }

  // 3. Check for K (thousands)
  const kMatch = raw.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*k\b/i);
  if (kMatch) {
    const val = parseFloat(kMatch[1]);
    return isNaN(val) ? null : Math.round(val * 1000);
  }

  // 4. Check for explicit currency symbol or price/rent prefix
  const explicitCurrencyMatch = raw.match(/(?:₹|rs\.?|inr|price\s*:?|rent\s*:?)\s*([\d,]+(?:\.\d+)?)/i);
  if (explicitCurrencyMatch) {
    const val = parseFloat(explicitCurrencyMatch[1].replace(/,/g, ''));
    return isNaN(val) ? null : Math.round(val);
  }

  // 5. If pure numeric string (e.g. from dedicated price element containing "42,000" or "42000/mo")
  const pureNumMatch = raw.trim().match(/^([\d,]+(?:\.\d+)?)\s*(?:\/\s*(?:mo|month|pm))?$/i);
  if (pureNumMatch && !/(?:bhk|bedroom|sqft|sq\.?ft|floor)/i.test(raw)) {
    const val = parseFloat(pureNumMatch[1].replace(/,/g, ''));
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
  const bhkMatch = raw.match(/(\d+)[\s\-_]*(?:bhk|bedroom|bed|rk)/i);
  if (bhkMatch) {
    return parseInt(bhkMatch[1], 10);
  }
  if (/rk/i.test(raw)) return 1;
  return null;
}

/**
 * Extracts area in square feet (e.g. "1,250 sq.ft", "900 sqft", "1450 sq ft", "3928-Sq-ft")
 * @param {string} raw
 * @returns {number|null}
 */
export function parseArea(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const match = raw.match(/([\d,]+(?:\.\d+)?)[\s\-_]*(?:sq\.?\s*ft|sqft|sq-ft|square\s*feet)/i);
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
  if (/super[-_\s]*built|sbua/i.test(lower)) return 'super_builtup';
  if (/built[-_\s]*up/i.test(lower)) return 'builtup';
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
  const stateMatch = raw.match(
    /\b(RAJ\s*[\/\-]\s*[PA]\s*[\/\-]\s*\d{4}\s*[\/\-]\s*\d+|RAJ-?RERA[-\w\/\-]+|PRM\/KA\/RERA\/[\w\/\-]+|ACK\/KA\/RERA\/[\w\/\-]+|P\d{11}|P\d{9}|HRERA[-\w\/\-]+|UPRERA[-\w\/\-]+|PR\/GJ\/[\w\/\-]+|DLRERA[\w\/\-]+)\b/i
  );
  if (stateMatch) {
    let id = stateMatch[1].trim().replace(/\s+/g, '');
    // Strip trailing UI words glued to the RERA ID from DOM concatenation (e.g. 003243CopiedSource)
    id = id.replace(/(?<=\d|\/)(?:copied|source|extracted|verified|details|view|click|more|share|copy).*$/i, '');
    return id.trim();
  }

  // 2. Generic RERA prefix: must contain at least 2 digits and not be common descriptive words
  const genericMatch = raw.match(/\bRERA\b(?:\s*(?:Registration|Registered|Regn?|Number|No|ID))?\.?[:\s#-]+([A-Z0-9][A-Z0-9\/\-]{4,})/i);
  if (genericMatch) {
    let candidate = genericMatch[1].trim();
    candidate = candidate.replace(/(?<=\d|\/)(?:copied|source|extracted|verified|details|view|click|more|share|copy).*$/i, '');
    const INVALID_WORDS = /^(?:website|registered|registration|approved|disclaimer|details|status|portal|number|license|got_it|project|projects|amenities|developer|builder|rera|apply)$/i;
    if (!INVALID_WORDS.test(candidate) && /\d{2,}/.test(candidate)) {
      return candidate.trim();
    }
  }

  return null;
}

import { classifyListingType } from './classifier.js';

export { classifyListingType };

/**
 * Filters out ad trackers, video player thumbnails, svgs, and icons,
 * leaving authentic property listing photos.
 * @param {string[]} images
 * @returns {string[]}
 */
export function filterPropertyImages(images) {
  if (!Array.isArray(images)) return [];
  const badPatterns = [
    /youtube/i,
    /ytimg/i,
    /doubleclick/i,
    /googlesyndication/i,
    /google-analytics/i,
    /facebook/i,
    /favicon/i,
    /\.(svg|gif|mp4|webm)($|\?)/i,
    /^data:image/i,
    /avatar/i,
    /badge/i,
    /icon/i,
    /logo/i,
    /tracker/i,
    /pixel/i,
    /advert/i,
    /play[-_]?button/i,
    /video[-_]?thumb/i
  ];
  return images.filter(url => {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;
    return !badPatterns.some(pat => pat.test(trimmed));
  });
}



