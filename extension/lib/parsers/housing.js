import { 
  parseIndianCurrency, 
  parseBHK, 
  parseArea, 
  parseFloor,
  parsePricePerSqFt,
  parseAreaType,
  parsePossessionStatus,
  parseReraId,
  classifyListingType
} from './currency.js';
import { parseListingKey, canonicalizeUrl } from '../tracker.js';
import { extractJsonLdData } from './jsonld.js';

export function parseHousing(document, url = '') {
  const container = document.querySelector('[data-portal="housing"]') || document.body || document;
  const currentUrl = url || (typeof window !== 'undefined' ? window.location.href : '');

  // Layer 1: Schema.org JSON-LD
  const jsonLd = extractJsonLdData(document);

  // Layer 2: Meta tags
  const metaTitleEl = document.querySelector ? document.querySelector('meta[property="og:title"]') : null;
  const metaDescEl = document.querySelector ? document.querySelector('meta[name="description"], meta[property="og:description"]') : null;
  const metaImgEl = document.querySelector ? document.querySelector('meta[property="og:image"]') : null;

  // Title: DOM -> JSON-LD -> Meta -> Fallback
  const titleEl = container.querySelector('.css-title, h1');
  let title = (titleEl ? titleEl.textContent.trim() : '') ||
              (jsonLd ? jsonLd.title : '') ||
              (metaTitleEl ? metaTitleEl.getAttribute('content') : '') || '';

  // Locality: DOM -> JSON-LD -> URL
  const localityEl = container.querySelector('.css-locality, [class*="locality"], [data-q="locality"]');
  let locality = localityEl ? localityEl.textContent.trim() : '';
  if (!locality && jsonLd) {
    if (jsonLd.locality && jsonLd.city) {
      locality = `${jsonLd.locality}, ${jsonLd.city}`;
    } else {
      locality = jsonLd.locality || jsonLd.city || '';
    }
  }

  // Price / Rent: DOM -> JSON-LD -> Meta
  const priceEl = container.querySelector('.css-spec-row.rent .val, [class*="rent"] .val, .css-spec-row.price .val, [class*="price"] .val, [data-q="price"]');
  let rawPrice = priceEl ? parseIndianCurrency(priceEl.textContent) : null;
  if (!rawPrice && jsonLd) {
    rawPrice = jsonLd.rent || jsonLd.price || jsonLd.rawPrice;
  }
  if (!rawPrice && metaTitleEl) {
    rawPrice = parseIndianCurrency(metaTitleEl.getAttribute('content'));
  }

  // Deposit: DOM -> Text regex
  const depositEl = container.querySelector('.css-spec-row.deposit .val, [class*="deposit"] .val, [data-q="deposit"]');
  let deposit = depositEl ? parseIndianCurrency(depositEl.textContent) : null;
  if (deposit === null) {
    const fullText = container.textContent || '';
    const depMatch = fullText.match(/(?:deposit|security\s*deposit)[^₹\d]*₹?\s*([\d,]+(?:\s*[klacm]+)?)/i);
    if (depMatch) {
      deposit = parseIndianCurrency(depMatch[0]);
    }
  }

  // BHK: DOM -> JSON-LD -> Title -> URL
  const bhkEl = container.querySelector('.css-spec-row.bhk .val, [class*="bhk"] .val, [data-q="bhk"]');
  let bhk = bhkEl ? parseBHK(bhkEl.textContent) : null;
  if (!bhk && jsonLd && jsonLd.bhk) bhk = jsonLd.bhk;
  if (!bhk && title) bhk = parseBHK(title);
  if (!bhk && currentUrl) bhk = parseBHK(currentUrl);
  if (!bhk) bhk = 2;

  // Area: DOM -> JSON-LD
  const areaEl = container.querySelector('.css-spec-row.area .val, [class*="area"] .val, [class*="area"], [data-q="area"]');
  let area_sqft = areaEl ? parseArea(areaEl.textContent) : null;
  if (!area_sqft && jsonLd && jsonLd.area_sqft) area_sqft = jsonLd.area_sqft;

  // Floor: DOM -> JSON-LD -> Title
  const floorEl = container.querySelector('.css-spec-row.floor .val, [class*="floor"] .val, [class*="floor"]');
  let floor = floorEl ? parseFloor(floorEl.textContent) : null;
  if (floor === null && jsonLd && jsonLd.floor !== null) floor = jsonLd.floor;
  if (floor === null && title) floor = parseFloor(title);

  // Description: DOM -> JSON-LD -> Meta
  const descEl = container.querySelector('.css-desc-text, [class*="desc"], [data-q="desc"]');
  let description = (descEl ? descEl.textContent.trim() : '') ||
                    (jsonLd ? jsonLd.description : '') ||
                    (metaDescEl ? metaDescEl.getAttribute('content') : '') || '';

  // Images: DOM -> JSON-LD -> Meta
  const imageEls = Array.from(container.querySelectorAll('.css-slide-img, img'));
  let images = imageEls.map(img => img.src || img.getAttribute('src')).filter(Boolean);
  if (jsonLd && jsonLd.images && jsonLd.images.length > 0) {
    images = [...jsonLd.images, ...images];
  }
  if (images.length === 0 && metaImgEl) {
    const src = metaImgEl.getAttribute('content');
    if (src) images.push(src);
  }
  images = Array.from(new Set(images)).slice(0, 15);

  const fullText = container.textContent || '';
  const classification = classifyListingType(container, fullText, currentUrl);
  let listingType = classification.mode;
  if (jsonLd && jsonLd.listingType && listingType === 'unknown') {
    listingType = jsonLd.listingType;
  }
  const isSale = listingType === 'sale';
  const isRent = listingType === 'rent';

  const pricePerSqft = parsePricePerSqFt(fullText) || (isSale && rawPrice && area_sqft ? Math.round(rawPrice / area_sqft) : null);
  const areaType = parseAreaType(fullText);
  const possessionStatus = parsePossessionStatus(fullText);
  const reraId = parseReraId(fullText);

  const listingKey = parseListingKey('housing', currentUrl, container);

  return {
    portal: 'housing',
    listingKey,
    listingType,
    url: canonicalizeUrl(currentUrl),
    title,
    locality,
    rawPrice,
    rent: isRent ? rawPrice : (isSale ? null : (rawPrice && rawPrice < 500000 ? rawPrice : null)),
    price: isSale ? rawPrice : null,
    salePrice: isSale ? rawPrice : null,
    pricePerSqft,
    areaType,
    possessionStatus,
    reraId,
    deposit: isSale ? null : deposit,
    bhk,
    area_sqft,
    areaSqft: area_sqft,
    floor,
    description,
    images,
    lat: jsonLd ? jsonLd.lat : null,
    lng: jsonLd ? jsonLd.lng : null
  };
}
