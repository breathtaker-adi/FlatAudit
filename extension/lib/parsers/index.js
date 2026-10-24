import { parseNoBroker } from './nobroker.js';
import { parseMagicBricks } from './magicbricks.js';
import { parse99acres } from './ninety_nine_acres.js';
import { parseHousing } from './housing.js';
import { parseGeneric } from './generic.js';

/**
 * Identifies the portal and parses listing attributes from a Document object.
 * @param {Document} document
 * @param {string} [url]
 * @returns {object} Extracted listing details
 */
export function extractListing(document, url = '') {
  const currentUrl = url || (typeof window !== 'undefined' ? window.location.href : '');

  // Detect via URL or explicit DOM marker
  if (currentUrl.includes('nobroker.in') || document.querySelector('[data-portal="nobroker"]')) {
    return parseNoBroker(document);
  }
  if (currentUrl.includes('magicbricks.com') || document.querySelector('[data-portal="magicbricks"]')) {
    return parseMagicBricks(document);
  }
  if (currentUrl.includes('99acres.com') || document.querySelector('[data-portal="99acres"]')) {
    return parse99acres(document);
  }
  if (currentUrl.includes('housing.com') || document.querySelector('[data-portal="housing"]')) {
    return parseHousing(document);
  }

  // Fallback to generic heuristic
  return parseGeneric(document);
}

export {
  parseNoBroker,
  parseMagicBricks,
  parse99acres,
  parseHousing,
  parseGeneric
};
