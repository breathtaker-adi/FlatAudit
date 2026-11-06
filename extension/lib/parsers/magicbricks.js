import { 
  parseIndianCurrency, 
  parseBHK, 
  parseArea, 
  parseFloor,
  parsePricePerSqFt,
  parseAreaType,
  parsePossessionStatus,
  parseReraId,
  classifyListingType,
  filterPropertyImages
} from './currency.js';
import { parseListingKey, canonicalizeUrl } from '../tracker.js';
import { extractJsonLdData } from './jsonld.js';

export function parseMagicBricks(document, url = '') {
  const container = document.querySelector('[data-portal="magicbricks"]') || document.body || document;
  const currentUrl = url || (typeof window !== 'undefined' ? window.location.href : '');

  // Layer 1: Schema.org JSON-LD
  const jsonLd = extractJsonLdData(document);

  // Layer 2: Meta tags
  const metaTitleEl = document.querySelector ? document.querySelector('meta[property="og:title"]') : null;
  const metaDescEl = document.querySelector ? document.querySelector('meta[name="description"], meta[property="og:description"]') : null;
  const metaImgEl = document.querySelector ? document.querySelector('meta[property="og:image"]') : null;

  // Title: DOM -> JSON-LD -> Meta -> Fallback
  const titleEl = container.querySelector('.mb-ldp__dtls__title, .mb-srp__card--title--heading, .pdp__title, h2, h1');
  let title = (titleEl ? titleEl.textContent.trim() : '') ||
              (jsonLd ? jsonLd.title : '') ||
              (metaTitleEl ? metaTitleEl.getAttribute('content') : '') || '';

  // Locality: DOM -> JSON-LD -> Title / URL Fallback
  const localityEl = container.querySelector('.mb-ldp__dtls__body--title, .mb-ldp__dtls__title, .mb-srp__card--locality, .pdp__locality, [class*="locality"], [class*="property-location"]');
  let locality = localityEl ? localityEl.textContent.trim() : '';
  if (!locality && jsonLd) {
    if (jsonLd.locality && jsonLd.city) {
      locality = `${jsonLd.locality}, ${jsonLd.city}`;
    } else {
      locality = jsonLd.locality || jsonLd.city || '';
    }
  }
  if (!locality && (title || currentUrl)) {
    const locMatch = (title || currentUrl).match(/(?:in|at)\s+([A-Za-z\s\-]+?)(?:,\s*([A-Za-z\s]+)|$|\&|\?)/i) ||
                     currentUrl.match(/(?:for-sale|for-rent)-([a-z0-9-]+?)-in-([a-z0-9-]+)/i);
    if (locMatch) {
      const p1 = locMatch[1].replace(/-/g, ' ').trim();
      const p2 = locMatch[2] ? locMatch[2].replace(/-/g, ' ').trim() : '';
      locality = p2 ? `${p1}, ${p2}` : p1;
    }
  }

  // Price / Rent: DOM (Search + Detail Page) -> JSON-LD -> Meta -> FullText
  const priceEl = container.querySelector(
    '.mb-ldp__dtls__price, .mb-ldp__more-dtl__list--price, .mb-ldp__price, .mb-srp__card__price--amount, .pdp__price, [class*="price--amount"], [class*="dtls__price"], [class*="pdp__price"], [class*="property-price"], [data-price], [itemprop="price"], [id*="price"]'
  );
  let rawPrice = priceEl ? parseIndianCurrency(priceEl.textContent) : null;
  if (!rawPrice && jsonLd) {
    rawPrice = jsonLd.rent || jsonLd.price || jsonLd.rawPrice;
  }
  if (!rawPrice && metaDescEl) {
    rawPrice = parseIndianCurrency(metaDescEl.getAttribute('content'));
  }
  if (!rawPrice && metaTitleEl) {
    rawPrice = parseIndianCurrency(metaTitleEl.getAttribute('content'));
  }
  if (!rawPrice) {
    const textPriceMatch = (container.textContent || '').match(/(?:₹|rs\.?|inr|price\s*:?)\s*([\d,]+(?:\.\d+)?\s*(?:crore|crores|cr|lakh|lakhs|lac|lacs|k)?)/i);
    if (textPriceMatch) {
      rawPrice = parseIndianCurrency(textPriceMatch[0]);
    }
  }

  // Deposit: DOM -> Text regex
  const depositEl = container.querySelector('[data-field="deposit"] .val, .pdp__deposit, [class*="deposit"]');
  let deposit = depositEl ? parseIndianCurrency(depositEl.textContent) : null;
  if (deposit === null) {
    const fullText = container.textContent || '';
    const depMatch = fullText.match(/(?:deposit|security\s*deposit)[^₹\d]*₹?\s*([\d,]+(?:\s*[klacm]+)?)/i);
    if (depMatch) {
      deposit = parseIndianCurrency(depMatch[0]);
    }
  }

  // BHK: DOM -> JSON-LD -> Title -> URL
  const bhkEl = container.querySelector('[data-field="bhk"] .val, [class*="bhk"]');
  let bhk = bhkEl ? parseBHK(bhkEl.textContent) : null;
  if (!bhk && jsonLd && jsonLd.bhk) bhk = jsonLd.bhk;
  if (!bhk && title) bhk = parseBHK(title);
  if (!bhk && currentUrl) bhk = parseBHK(currentUrl);
  if (!bhk) bhk = 2;

  // Area: DOM -> JSON-LD -> Title -> URL -> Description
  const areaEl = container.querySelector('[data-field="area"] .val, .mb-ldp__more-dtl__list--size, [class*="more-dtl__list--size"], [class*="area"], [class*="Area"]');
  let area_sqft = areaEl ? parseArea(areaEl.textContent) : null;
  if (!area_sqft && jsonLd && jsonLd.area_sqft) area_sqft = jsonLd.area_sqft;
  if (!area_sqft && title) area_sqft = parseArea(title);
  if (!area_sqft && currentUrl) area_sqft = parseArea(currentUrl);

  // Floor: DOM -> JSON-LD -> Title
  const floorEl = container.querySelector('[data-field="floor"] .val, [class*="floor"]');
  let floor = floorEl ? parseFloor(floorEl.textContent) : null;
  if (floor === null && jsonLd && jsonLd.floor !== null) floor = jsonLd.floor;
  if (floor === null && title) floor = parseFloor(title);

  // Description: DOM -> JSON-LD -> Meta
  const descEl = container.querySelector('.mb-srp__card--desc--text, .pdp__description, [class*="desc"]');
  let description = (descEl ? descEl.textContent.trim() : '') ||
                    (jsonLd ? jsonLd.description : '') ||
                    (metaDescEl ? metaDescEl.getAttribute('content') : '') || '';

  // Images: DOM -> JSON-LD -> Meta
  const imageEls = Array.from(container.querySelectorAll('.mb-srp__card__photo, .pdp__photo img, img'));
  let rawImages = imageEls.map(img => img.src || img.getAttribute('src')).filter(Boolean);
  if (jsonLd && jsonLd.images && jsonLd.images.length > 0) {
    rawImages = [...jsonLd.images, ...rawImages];
  }
  if (rawImages.length === 0 && metaImgEl) {
    const src = metaImgEl.getAttribute('content');
    if (src) rawImages.push(src);
  }
  const images = filterPropertyImages(Array.from(new Set(rawImages))).slice(0, 15);

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

  const listingKey = parseListingKey('magicbricks', currentUrl, container);

  return {
    portal: 'magicbricks',
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
