import { 
  parseIndianCurrency, 
  parseBHK, 
  parseArea, 
  parseFloor,
  parsePricePerSqFt,
  parseAreaType,
  parsePossessionStatus,
  parseReraId,
  parseListingType
} from './currency.js';
import { parseListingKey, canonicalizeUrl } from '../tracker.js';

export function parseNoBroker(document, url = '') {
  const container = document.querySelector('[data-portal="nobroker"]') || document.body;

  const titleEl = container.querySelector('#listing-title, h1.heading-6, h1');
  const title = titleEl ? titleEl.textContent.trim() : '';

  const localityEl = container.querySelector('.locality-subtext, [class*="locality"]');
  const locality = localityEl ? localityEl.textContent.trim() : '';

  const fullText = container.textContent || '';
  const listingType = parseListingType(fullText, url);

  const priceEl = container.querySelector('#price-display, .price-item .value, .rent-item .value, [id*="rent"], [id*="price"]');
  const rawPrice = priceEl ? parseIndianCurrency(priceEl.textContent) : null;

  const depositEl = container.querySelector('#deposit-display, .deposit-item .value, [id*="deposit"]');
  const deposit = depositEl ? parseIndianCurrency(depositEl.textContent) : null;

  const bhkEl = container.querySelector('#bhk-display, .bhk-item .value');
  const bhk = bhkEl ? parseBHK(bhkEl.textContent) : (parseBHK(title) || 2);

  const areaEl = container.querySelector('.area-item .value, [id*="area"], [class*="area"]');
  const area_sqft = areaEl ? parseArea(areaEl.textContent) : null;

  const floorEl = container.querySelector('[id*="floor"], [class*="floor"]');
  const floor = floorEl ? parseFloor(floorEl.textContent) : null;

  const descEl = container.querySelector('#description-body, .description-text, [class*="description"]');
  const description = descEl ? descEl.textContent.trim() : '';

  const imageEls = Array.from(container.querySelectorAll('.listing-photo, .photo-grid img, img[data-photo-id]'));
  const images = imageEls.map(img => img.src || img.getAttribute('src')).filter(Boolean);

  const listingKey = parseListingKey('nobroker', url, container);

  const isSale = listingType === 'sale';
  const pricePerSqft = parsePricePerSqFt(fullText) || (isSale && rawPrice && area_sqft ? Math.round(rawPrice / area_sqft) : null);
  const areaType = parseAreaType(fullText);
  const possessionStatus = parsePossessionStatus(fullText);
  const reraId = parseReraId(fullText);

  const projectEl = container.querySelector('.project-name, [data-project-name], .builder-name');
  const projectName = projectEl ? projectEl.textContent.trim() : '';

  return {
    portal: 'nobroker',
    listingKey,
    listingType,
    url: canonicalizeUrl(url),
    title,
    locality,
    rent: isSale ? null : rawPrice,
    price: isSale ? rawPrice : null,
    salePrice: isSale ? rawPrice : null,
    pricePerSqft,
    areaType,
    possessionStatus,
    reraId,
    projectName,
    deposit: isSale ? null : deposit,
    bhk,
    area_sqft,
    areaSqft: area_sqft,
    floor,
    description,
    images
  };
}
