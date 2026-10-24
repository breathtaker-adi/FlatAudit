import { parseIndianCurrency, parseBHK, parseArea, parseFloor } from './currency.js';
import { parseListingKey, canonicalizeUrl } from '../tracker.js';

export function parse99acres(document, url = '') {
  const container = document.querySelector('[data-portal="99acres"]') || document.body;

  const titleEl = container.querySelector('.srpTuple__title, h1');
  const title = titleEl ? titleEl.textContent.trim() : '';

  const localityEl = container.querySelector('.srpTuple__subLocation, [class*="subLocation"]');
  const locality = localityEl ? localityEl.textContent.trim() : '';

  const rentEl = container.querySelector('.srpTuple__price:not([class*="Wrap"]), [id*="priceDisplay"]');
  const rent = rentEl ? parseIndianCurrency(rentEl.textContent) : null;

  const depositEl = container.querySelector('.srpTuple__deposit, [class*="deposit"]');
  const deposit = depositEl ? parseIndianCurrency(depositEl.textContent) : null;

  const bhkEl = container.querySelector('.unit-type, [class*="configuration"]');
  const bhk = bhkEl ? parseBHK(bhkEl.textContent) : (parseBHK(title) || 1);

  const areaEl = container.querySelector('.super-area, [class*="area"], [class*="Area"]');
  const area_sqft = areaEl ? parseArea(areaEl.textContent) : null;

  const floorEl = container.querySelector('[class*="floor"], [class*="Floor"]');
  const floor = floorEl ? parseFloor(floorEl.textContent) : null;

  const descEl = container.querySelector('.description__content, [class*="description"]');
  const description = descEl ? descEl.textContent.trim() : '';

  const imageEls = Array.from(container.querySelectorAll('.srpTuple__image, img'));
  const images = imageEls.map(img => img.src || img.getAttribute('src')).filter(Boolean);

  const listingKey = parseListingKey('99acres', url, container);

  return {
    portal: '99acres',
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
