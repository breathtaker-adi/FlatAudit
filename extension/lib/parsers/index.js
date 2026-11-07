import { parseNoBroker } from './nobroker.js';
import { parseMagicBricks } from './magicbricks.js';
import { parse99acres } from './ninety_nine_acres.js';
import { parseHousing } from './housing.js';
import { parseGeneric } from './generic.js';
import { parseIndianCurrency, parseBHK, parseArea, filterPropertyImages } from './currency.js';
import { classifyListingType } from './classifier.js';
import { parseCoordinatesFromPage } from '../geohash.js';

/**
 * Identifies the portal and parses listing attributes from a Document object.
 * Also parses geographic coordinates and geohash if present.
 * Reconciles sale vs rent via multi-signal classification.
 * @param {Document} document
 * @param {string} [url]
 * @returns {object} Extracted listing details
 */
export function extractListing(document, url = '') {
  if (!document) {
    return {
      portal: 'generic',
      title: '',
      locality: '',
      bhk: 1,
      rent: null,
      deposit: null,
      images: [],
      isValid: false
    };
  }

  const currentUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
  let listing = null;

  try {
    // Detect via URL or explicit DOM marker
    if (currentUrl.includes('nobroker.in') || document.querySelector('[data-portal="nobroker"]')) {
      listing = parseNoBroker(document, currentUrl);
    } else if (currentUrl.includes('magicbricks.com') || document.querySelector('[data-portal="magicbricks"]')) {
      listing = parseMagicBricks(document, currentUrl);
    } else if (currentUrl.includes('99acres.com') || document.querySelector('[data-portal="99acres"]')) {
      listing = parse99acres(document, currentUrl);
    } else if (currentUrl.includes('housing.com') || document.querySelector('[data-portal="housing"]')) {
      listing = parseHousing(document, currentUrl);
    } else {
      listing = parseGeneric(document, currentUrl);
    }
  } catch (err) {
    // Specific parser failed on unexpected DOM structure; fallback gracefully to generic
    try {
      listing = parseGeneric(document, currentUrl);
    } catch (fallbackErr) {
      listing = {
        portal: 'generic',
        title: document.title || '',
        locality: '',
        bhk: 1,
        rent: null,
        deposit: null,
        images: [],
        isValid: false
      };
    }
  }

  // Enrich with coordinates and geohash if available in DOM
  try {
    const geo = parseCoordinatesFromPage(document);
    if (geo) {
      listing.lat = geo.lat;
      listing.lng = geo.lng;
      listing.geohash = geo.geohash;
    }
  } catch (geoErr) {
    // Coordinates extraction error: ignore non-fatal
  }

  // Multi-signal Intent Classifier evaluation
  let classification = { mode: 'rent', confidence: 'default' };
  try {
    const bodyText = document.body ? (document.body.innerText || document.body.textContent || '') : '';
    classification = classifyListingType(document, bodyText, currentUrl);
  } catch (classErr) {
    // Classifier error: default to rent
  }
  listing.classification = classification;

  // Reconcile listingType: favor explicit parser classification if confident, otherwise use classifier
  if (!listing.listingType || listing.listingType === 'unknown') {
    listing.listingType = classification.mode;
  }

  // Route monetary amount to appropriate fields based on verified mode
  const rawAmount = listing.price || listing.salePrice || listing.rent || null;
  listing.rawPrice = rawAmount;

  // Standardize naming: keep both camelCase and snake_case populated
  const normArea = listing.area_sqft || listing.areaSqft || listing.area || null;
  listing.area_sqft = normArea;
  listing.areaSqft = normArea;

  if (listing.listingType === 'sale') {
    listing.price = listing.price || rawAmount;
    listing.salePrice = listing.salePrice || rawAmount;
    listing.rent = null;
    if (listing.price && normArea && !listing.pricePerSqft) {
      listing.pricePerSqft = Math.round(listing.price / normArea);
    }
  } else if (listing.listingType === 'rent') {
    listing.rent = listing.rent || rawAmount;
    listing.price = null;
    listing.salePrice = null;
  } else {
    // Mode is 'unknown'
    listing.listingType = 'unknown';
  }

  // Sanitize and filter extracted property images
  if (listing && Array.isArray(listing.images)) {
    try {
      listing.images = filterPropertyImages(listing.images);
    } catch (imgErr) {
      listing.images = [];
    }
  }

  listing.isValid = isListingValid(listing);
  return listing;
}

/**
 * Validates that a parsed listing contains essential non-empty fields:
 * - For Rent: rent (>0), bhk (>=1), locality.
 * - For Sale: price (>0), bhk (>=1), locality, area (>0).
 * - For Unknown: bhk (>=1), locality, rawPrice (>0).
 * @param {object} listing 
 * @returns {boolean}
 */
export function isListingValid(listing) {
  if (!listing || typeof listing !== 'object') return false;

  const hasBhk = typeof listing.bhk === 'number' && listing.bhk >= 1;
  const hasLocality = typeof listing.locality === 'string' && listing.locality.trim().length > 0;
  if (!hasBhk || !hasLocality) return false;

  if (listing.listingType === 'sale') {
    const price = listing.price || listing.salePrice;
    const area = listing.area_sqft || listing.areaSqft;
    return Boolean(
      typeof price === 'number' && price > 0 &&
      typeof area === 'number' && area > 0
    );
  }

  if (listing.listingType === 'unknown') {
    const amount = listing.rawPrice || listing.price || listing.rent;
    return Boolean(typeof amount === 'number' && amount > 0);
  }

  // Default: rent listing
  return Boolean(
    typeof listing.rent === 'number' && listing.rent > 0
  );
}

/**
 * Parses peer listing cards from a search results page or recommended listings section.
 * Returns an array of comparable listings { rent, bhk, deposit, area_sqft, locality }.
 * 
 * @param {Document} document 
 * @param {string} [url] 
 * @returns {Array<object>} Array of parsed peer listings
 */
export function parsePeerListingsFromPage(document, url = '') {
  if (!document || typeof document.querySelectorAll !== 'function') return [];

  const peers = [];

  // 1. MagicBricks search cards
  try {
    const mbCards = document.querySelectorAll('.mb-srp__card');
    if (mbCards.length >= 3) {
      for (const card of mbCards) {
        try {
          const priceEl = card.querySelector('.mb-srp__card__price--amount, [class*="price--amount"]');
          const rent = priceEl ? parseIndianCurrency(priceEl.textContent) : null;
          if (rent && rent > 0) {
            const bhkEl = card.querySelector('[data-field="bhk"] .val, [class*="bhk"]');
            const areaEl = card.querySelector('[data-field="area"] .val, [class*="area"]');
            const depEl = card.querySelector('[data-field="deposit"] .val, [class*="deposit"]');
            const locEl = card.querySelector('.mb-srp__card--locality, [class*="locality"]');

            peers.push({
              rent,
              bhk: bhkEl ? parseBHK(bhkEl.textContent) : 2,
              area_sqft: areaEl ? parseArea(areaEl.textContent) : null,
              deposit: depEl ? parseIndianCurrency(depEl.textContent) : null,
              locality: locEl ? locEl.textContent.trim() : ''
            });
          }
        } catch (cardErr) {
          continue;
        }
      }
      if (peers.length >= 3) return peers;
    }
  } catch (mbErr) {}

  // 2. 99acres search tuples
  try {
    const acresCards = document.querySelectorAll('.srpTuple__tupleDetails, .srpTuple__priceWrap');
    if (acresCards.length >= 3) {
      for (const card of acresCards) {
        try {
          const parent = card.closest('.srpTuple__tupleDetails') || card;
          const priceEl = parent.querySelector('.srpTuple__price:not([class*="Wrap"]), [id*="priceDisplay"]');
          const rent = priceEl ? parseIndianCurrency(priceEl.textContent) : null;
          if (rent && rent > 0) {
            const bhkEl = parent.querySelector('.unit-type, [class*="configuration"]');
            const areaEl = parent.querySelector('.super-area, [class*="area"]');
            const depEl = parent.querySelector('.srpTuple__deposit, [class*="deposit"]');
            const locEl = parent.querySelector('.srpTuple__subLocation, [class*="subLocation"]');

            peers.push({
              rent,
              bhk: bhkEl ? parseBHK(bhkEl.textContent) : 2,
              area_sqft: areaEl ? parseArea(areaEl.textContent) : null,
              deposit: depEl ? parseIndianCurrency(depEl.textContent) : null,
              locality: locEl ? locEl.textContent.trim() : ''
            });
          }
        } catch (acresCardErr) {
          continue;
        }
      }
      if (peers.length >= 3) return peers;
    }
  } catch (acresErr) {}

  // 3. NoBroker cards
  try {
    const nbCards = document.querySelectorAll('[data-listing-id], .srp-tuple, [class*="card"]');
    const seenNbIds = new Set();
    for (const card of nbCards) {
      try {
        const id = card.getAttribute('data-listing-id') || card.id;
        if (id && seenNbIds.has(id)) continue;
        if (id) seenNbIds.add(id);

        const priceEl = card.querySelector('#price-display, .rent-item .value, [id*="rent"], [class*="price"]');
        const rent = priceEl ? parseIndianCurrency(priceEl.textContent) : null;
        if (rent && rent >= 4000 && rent <= 1000000) {
          const bhkEl = card.querySelector('#bhk-display, .bhk-item .value, [class*="bhk"]');
          const areaEl = card.querySelector('.area-item .value, [id*="area"], [class*="area"]');
          const depEl = card.querySelector('#deposit-display, .deposit-item .value, [id*="deposit"]');
          const locEl = card.querySelector('.locality-subtext, [class*="locality"]');

          peers.push({
            rent,
            bhk: bhkEl ? parseBHK(bhkEl.textContent) : 2,
            area_sqft: areaEl ? parseArea(areaEl.textContent) : null,
            deposit: depEl ? parseIndianCurrency(depEl.textContent) : null,
            locality: locEl ? locEl.textContent.trim() : ''
          });
        }
      } catch (nbCardErr) {
        continue;
      }
    }
  } catch (nbErr) {}

  return peers;
}

export {
  parseNoBroker,
  parseMagicBricks,
  parse99acres,
  parseHousing,
  parseGeneric
};
