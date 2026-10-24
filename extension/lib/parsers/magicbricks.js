import { parseIndianCurrency, parseBHK, parseArea, parseFloor } from './currency.js';
import { parseListingKey, canonicalizeUrl } from '../tracker.js';

export function parseMagicBricks(document, url = '') {
  const container = document.querySelector('[data-portal="magicbricks"]') || document.body;

  const titleEl = container.querySelector('.mb-srp__card--title--heading, h2, h1');
  const title = titleEl ? titleEl.textContent.trim() : '';

  const localityEl = container.querySelector('.mb-srp__card--locality, [class*="locality"]');
  const locality = localityEl ? localityEl.textContent.trim() : '';

  const rentEl = container.querySelector('.mb-srp__card__price--amount, [class*="price--amount"]');
  const rent = rentEl ? parseIndianCurrency(rentEl.textContent) : null;

  const depositEl = container.querySelector('[data-field="deposit"] .val, [class*="deposit"]');
  const deposit = depositEl ? parseIndianCurrency(depositEl.textContent) : null;

  const bhkEl = container.querySelector('[data-field="bhk"] .val, [class*="bhk"]');
  const bhk = bhkEl ? parseBHK(bhkEl.textContent) : (parseBHK(title) || 2);

  const areaEl = container.querySelector('[data-field="area"] .val, [class*="area"]');
  const area_sqft = areaEl ? parseArea(areaEl.textContent) : null;

  const floorEl = container.querySelector('[data-field="floor"] .val, [class*="floor"]');
  const floor = floorEl ? parseFloor(floorEl.textContent) : null;

  const descEl = container.querySelector('.mb-srp__card--desc--text, [class*="desc"]');
  const description = descEl ? descEl.textContent.trim() : '';

  const imageEls = Array.from(container.querySelectorAll('.mb-srp__card__photo, img'));
  const images = imageEls.map(img => img.src || img.getAttribute('src')).filter(Boolean);

  const listingKey = parseListingKey('magicbricks', url, container);

  return {
    portal: 'magicbricks',
    listingKey,
    url: canonicalizeUrl(url),
    title,
    locality,
    rent,
    deposit,
    bhk,
    area_sqft,
    areaSqft: area_sqft,
    floor,
    description,
    images
  };
}
