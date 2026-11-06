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

export function parse99acres(document, url = '') {
  const container = document.querySelector('[data-portal="99acres"]') || document.body || document;
  const currentUrl = url || (typeof window !== 'undefined' ? window.location.href : '');

  // Layer 1: Schema.org JSON-LD Structured Data
  const jsonLd = extractJsonLdData(document);

  // Layer 2: Meta Tags
  const metaTitleEl = document.querySelector ? document.querySelector('meta[property="og:title"]') : null;
  const metaDescEl = document.querySelector ? document.querySelector('meta[name="description"], meta[property="og:description"]') : null;
  const metaImgEl = document.querySelector ? document.querySelector('meta[property="og:image"]') : null;

  // Title: DOM -> JSON-LD -> Meta -> Fallback
  const titleEl = container.querySelector('h1, .srpTuple__title, [class*="pdpTitle"], title');
  let title = (titleEl ? titleEl.textContent.trim() : '') ||
              (jsonLd ? jsonLd.title : '') ||
              (metaTitleEl ? metaTitleEl.getAttribute('content') : '') || '';

  // Price / Rent: DOM (VPD + SRP + Project Pages) -> JSON-LD -> Meta -> Text
  const priceEl = container.querySelector(
    '.configurationCards__configurationCardsHeading, .configurationCards__cardPriceHeading, [class*="configurationCardsHeading"], [class*="cardPriceHeading"], #pdPrice, .component__pdPropValueV2, .component__pdPropVal, [data-label="PRICE"], #pdPrice2, .srpTuple__price:not([class*="Wrap"]), [id*="priceDisplay"], [class*="priceHeading"]'
  );
  let rawPrice = priceEl ? parseIndianCurrency(priceEl.textContent) : null;
  if (!rawPrice && jsonLd) {
    rawPrice = jsonLd.rent || jsonLd.price || jsonLd.rawPrice;
  }
  if (!rawPrice && metaTitleEl) {
    const metaTitle = metaTitleEl.getAttribute('content') || '';
    rawPrice = parseIndianCurrency(metaTitle);
  }
  if (!rawPrice) {
    // Check project config cards or table cells
    const cellPrice = container.querySelector('.configurationCards, [class*="configuration"], table');
    if (cellPrice) {
      const pMatch = cellPrice.textContent.match(/(?:₹|Rs\.?)\s*([\d\.]+\s*(?:Cr|Crore|L|Lakh|Lacs?))/i);
      if (pMatch) {
        rawPrice = parseIndianCurrency(pMatch[0]);
      }
    }
  }

  // Security Deposit: DOM (VPD + SRP) -> Regex scan
  const depositEl = container.querySelector(
    '#Deposit_Value, .component__subHeading, .srpTuple__deposit, [class*="deposit"]'
  );
  let deposit = depositEl ? parseIndianCurrency(depositEl.textContent) : null;
  if (deposit === null) {
    const fullText = container.textContent || '';
    const depMatch = fullText.match(/(?:deposit|security\s*deposit)[^₹\d]*₹?\s*([\d,]+(?:\s*[klacm]+)?)/i);
    if (depMatch) {
      deposit = parseIndianCurrency(depMatch[0]);
    }
  }

  // Locality & City: DOM -> JSON-LD -> URL Slug
  const localityEl = container.querySelector(
    '#address, .component__pdDescAdd i, .component__localities, .srpTuple__subLocation, [class*="subLocation"], [class*="locality"]'
  );
  let locality = localityEl ? localityEl.textContent.trim().replace(/^Address\s*:\s*/i, '') : '';
  if (!locality && jsonLd) {
    if (jsonLd.locality && jsonLd.city) {
      locality = `${jsonLd.locality}, ${jsonLd.city}`;
    } else {
      locality = jsonLd.locality || jsonLd.city || '';
    }
  }
  if (!locality && jsonLd && jsonLd.breadcrumbs && jsonLd.breadcrumbs.length > 0) {
    for (let i = jsonLd.breadcrumbs.length - 1; i >= 0; i--) {
      const bc = jsonLd.breadcrumbs[i];
      if (/in\s+(.+)$/i.test(bc)) {
        locality = bc.match(/in\s+(.+)$/i)[1].trim();
        break;
      }
    }
  }
  if (!locality && currentUrl) {
    const locMatch = currentUrl.match(/in-([a-z0-9-]+?)-(jodhpur|jaipur|bangalore|bengaluru|mumbai|delhi|gurgaon|gurugram|noida|pune|hyderabad|chennai|kolkata|ahmedabad|kota|udaipur)/i);
    if (locMatch) {
      const locName = locMatch[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const cityName = locMatch[2].replace(/\b\w/g, c => c.toUpperCase());
      locality = `${locName}, ${cityName}`;
    }
  }

  // BHK: DOM -> JSON-LD -> Title -> URL Slug
  const bhkEl = container.querySelector(
    '#pdBedrooms, [data-label="BHK"], .unit-type, [class*="configuration"]'
  );
  let bhk = bhkEl ? parseBHK(bhkEl.textContent) : null;
  if (!bhk && jsonLd && jsonLd.bhk) bhk = jsonLd.bhk;
  if (!bhk && title) bhk = parseBHK(title);
  if (!bhk && currentUrl) bhk = parseBHK(currentUrl);
  if (!bhk) bhk = 1;

  // Area (Sq.Ft): DOM -> JSON-LD -> URL Slug
  const areaEl = container.querySelector(
    '.configurationCards__cardAreaSubHeadingOne, [class*="cardAreaSubHeading"], [class*="cardAreaHeading"], [data-label="SUPER_AREA"], [data-label="BUILTUP_AREA"], [data-label="CARPET_AREA"], .component__pdPropArea, .super-area, [class*="area"], [class*="Area"]'
  );
  let area_sqft = areaEl ? parseArea(areaEl.textContent) : null;
  if (!area_sqft && jsonLd && jsonLd.area_sqft) area_sqft = jsonLd.area_sqft;
  if (!area_sqft) {
    const cellArea = container.querySelector('.configurationCards, [class*="configuration"], table');
    if (cellArea) {
      const aMatch = cellArea.textContent.match(/(\d{2,5})\s*(?:sq\.?\s*ft|sqft)/i);
      if (aMatch) {
        area_sqft = parseInt(aMatch[1], 10);
      }
    }
  }
  if (!area_sqft && currentUrl) {
    const areaMatch = currentUrl.match(/(\d+)\s*-?\s*sqft/i);
    if (areaMatch) area_sqft = parseInt(areaMatch[1], 10);
  }

  // Floor: DOM -> JSON-LD -> Title / Text
  const floorEl = container.querySelector('#Floor_Label, [class*="floor"], [class*="Floor"]');
  let floor = floorEl ? parseFloor(floorEl.textContent) : null;
  if (floor === null && jsonLd && jsonLd.floor !== null) floor = jsonLd.floor;
  if (floor === null && title) floor = parseFloor(title);

  // Description: DOM -> JSON-LD -> Meta
  const descEl = container.querySelector(
    '#description, .component__hiddenText, .description__content, [class*="description"]'
  );
  let description = (descEl ? descEl.textContent.trim() : '') ||
                    (jsonLd ? jsonLd.description : '') ||
                    (metaDescEl ? metaDescEl.getAttribute('content') : '') || '';

  // Images: DOM -> JSON-LD -> Meta
  const imageEls = Array.from(container.querySelectorAll('.component__overviewCarousel img, .srpTuple__image, img'));
  let rawImages = imageEls.map(img => img.src || img.getAttribute('src')).filter(Boolean);
  if (jsonLd && jsonLd.images && jsonLd.images.length > 0) {
    rawImages = [...jsonLd.images, ...rawImages];
  }
  if (rawImages.length === 0 && metaImgEl) {
    const src = metaImgEl.getAttribute('content');
    if (src) rawImages.push(src);
  }
  const images = filterPropertyImages(Array.from(new Set(rawImages))).slice(0, 15);

  const isProjectPage = /(?:npxid-|npid-|\/projects?\/|\/new-projects?\/)/i.test(currentUrl) || Boolean(container.querySelector('[class*="configurationCards"], .ProjectInfo__imgBox1'));

  let projectName = (jsonLd ? jsonLd.projectName : '') || '';
  if (!projectName) {
    const pNameEl = container.querySelector('.ProjectInfo__imgBox1, [class*="ProjectInfo__projectName"], [class*="projectTitle"]');
    if (pNameEl) projectName = pNameEl.textContent.trim();
  }
  if (!projectName && isProjectPage && title) {
    projectName = title.split(/[,\-–|]/)[0].trim();
  }

  let builderName = (jsonLd ? jsonLd.builderName : '') || '';
  if (!builderName) {
    const bNameEl = container.querySelector('[class*="builderName"], [class*="developerName"], .ProjectInfo__subHeading');
    if (bNameEl) builderName = bNameEl.textContent.trim().replace(/^By\s+/i, '');
  }

  let city = (jsonLd ? jsonLd.city : '') || '';
  let state = (jsonLd ? jsonLd.state : '') || '';
  if (!city && locality) {
    const parts = locality.split(',').map(s => s.trim());
    if (parts.length > 1) {
      city = parts[parts.length - 1];
    }
  }
  if (!city && currentUrl) {
    const cityMatch = currentUrl.match(/(?:-|\/)(jaipur|jodhpur|kota|udaipur|bangalore|bengaluru|mumbai|pune|gurgaon|gurugram|delhi|noida|hyderabad|chennai|kolkata)(?:-|\/|\?|$)/i);
    if (cityMatch) {
      city = cityMatch[1].replace(/\b\w/g, c => c.toUpperCase());
    }
  }

  const fullText = container.textContent || '';
  const classification = classifyListingType(container, fullText, currentUrl);
  let listingType = classification.mode;
  if (jsonLd && jsonLd.listingType && listingType === 'unknown') {
    listingType = jsonLd.listingType;
  }
  if (isProjectPage && listingType === 'unknown') {
    listingType = 'sale';
  }
  const isSale = listingType === 'sale';
  const isRent = listingType === 'rent';

  const pricePerSqft = parsePricePerSqFt(fullText) || (isSale && rawPrice && area_sqft ? Math.round(rawPrice / area_sqft) : null);
  const areaType = parseAreaType(fullText);
  const possessionStatus = parsePossessionStatus(fullText);
  const reraId = parseReraId(fullText);

  const listingKey = parseListingKey('99acres', currentUrl, container);

  return {
    portal: '99acres',
    listingKey,
    listingType,
    url: canonicalizeUrl(currentUrl),
    title,
    locality,
    city,
    state,
    isProject: isProjectPage,
    projectName,
    builderName,
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
