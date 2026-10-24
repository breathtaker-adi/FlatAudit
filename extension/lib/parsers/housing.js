import { parseIndianCurrency, parseBHK, parseArea, parseFloor } from './currency.js';
import { parseListingKey, canonicalizeUrl } from '../tracker.js';

export function parseHousing(document, url = '') {
  const container = document.querySelector('[data-portal="housing"]') || document.body;

  const titleEl = container.querySelector('.css-title, h1');
  const title = titleEl ? titleEl.textContent.trim() : '';

  const localityEl = container.querySelector('.css-locality, [class*="locality"]');
  const locality = localityEl ? localityEl.textContent.trim() : '';

  const rentEl = container.querySelector('.css-spec-row.rent .val, [class*="rent"] .val');
  const rent = rentEl ? parseIndianCurrency(rentEl.textContent) : null;

  const depositEl = container.querySelector('.css-spec-row.deposit .val, [class*="deposit"] .val');
  const deposit = depositEl ? parseIndianCurrency(depositEl.textContent) : null;

  const bhkEl = container.querySelector('.css-spec-row.bhk .val, [class*="bhk"] .val');
  const bhk = bhkEl ? parseBHK(bhkEl.textContent) : (parseBHK(title) || 2);

  const areaEl = container.querySelector('.css-spec-row.area .val, [class*="area"] .val, [class*="area"]');
  const area_sqft = areaEl ? parseArea(areaEl.textContent) : null;

  const floorEl = container.querySelector('.css-spec-row.floor .val, [class*="floor"] .val, [class*="floor"]');
  const floor = floorEl ? parseFloor(floorEl.textContent) : null;

  const descEl = container.querySelector('.css-desc-text, [class*="desc"]');
  const description = descEl ? descEl.textContent.trim() : '';

  const imageEls = Array.from(container.querySelectorAll('.css-slide-img, img'));
  const images = imageEls.map(img => img.src || img.getAttribute('src')).filter(Boolean);

  const listingKey = parseListingKey('housing', url, container);

  return {
    portal: 'housing',
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
