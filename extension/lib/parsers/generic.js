import { parseIndianCurrency, parseBHK, parseArea, parseFloor, filterPropertyImages } from './currency.js';
import { parseListingKey, canonicalizeUrl } from '../tracker.js';

export function parseGeneric(document, url = '') {
  // Try finding title
  const titleEl = document.querySelector('h1, meta[property="og:title"], title');
  const title = titleEl ? (titleEl.content || titleEl.textContent || '').trim() : '';

  // Extract text body
  const bodyText = document.body ? document.body.innerText || document.body.textContent : '';

  // Heuristic price / rent search
  let rent = null;
  let price = null;
  const isSaleContext = /\b(?:for\s*sale|resale|buy\s*flat|house\s*for\s*sale|villa\s*for\s*sale|independent\s*house)\b/i.test(title) ||
                        /(?:\/buy\/|\/sale\/|\/resale\/|\/property-for-sale\/)/i.test(url);

  // 1. Check explicit price elements in DOM
  const explicitPriceEl = document.querySelector('[class*="price--amount"], [class*="pdp__price"], [class*="cardPrice"], [class*="priceValue"], [itemprop="price"], meta[property="og:price:amount"]');
  if (explicitPriceEl) {
    const rawVal = explicitPriceEl.content || explicitPriceEl.textContent || '';
    const parsedVal = parseIndianCurrency(rawVal);
    if (parsedVal) {
      if (isSaleContext || parsedVal >= 500000) {
        price = parsedVal;
      } else {
        rent = parsedVal;
      }
    }
  }

  // 2. Fallback heuristic regex in body text
  if (!price && !rent) {
    const saleMatches = bodyText.match(/(?:price|total\s*price|cost|₹|rs\.?)\s*:?\s*(?:₹|rs\.?)?\s*([\d,]+(?:\.\d+)?\s*(?:cr\b|crore|crores|lac|lacs|lakh|lakhs))/gi);
    if (saleMatches && saleMatches.length > 0) {
      for (const match of saleMatches) {
        const parsed = parseIndianCurrency(match);
        if (parsed && parsed >= 500000) {
          price = parsed;
          break;
        }
      }
    }
  }

  if (!price && !rent) {
    const priceMatches = bodyText.match(/(?:rent|monthly|price|₹|rs\.?)\s*:?\s*(?:₹|rs\.?)?\s*([\d,]+(?:\.\d+)?\s*(?:k|lac|lakh)?)/gi);
    if (priceMatches && priceMatches.length > 0) {
      for (const match of priceMatches) {
        const parsed = parseIndianCurrency(match);
        if (parsed && parsed >= 3000 && parsed <= 500000) {
          rent = parsed;
          break;
        }
      }
    }
  }

  // If sale context and we found a price, ensure it's recorded
  const rawPrice = price || rent;
  const listingType = isSaleContext ? 'sale' : (rent ? 'rent' : 'unknown');

  // Heuristic deposit search
  let deposit = null;
  const depositMatches = bodyText.match(/(?:deposit|security|advance)\s*:?\s*(?:₹|rs\.?)?\s*([\d,]+(?:\.\d+)?\s*(?:k|lac|lakh)?)/gi);
  if (depositMatches && depositMatches.length > 0) {
    for (const match of depositMatches) {
      const parsed = parseIndianCurrency(match);
      if (parsed && parsed >= 0 && parsed <= 2000000) {
        deposit = parsed;
        break;
      }
    }
  }

  // BHK heuristic
  const bhk = parseBHK(title) || parseBHK(bodyText) || 2;

  // Area & floor heuristics
  const area_sqft = parseArea(bodyText);
  const floor = parseFloor(bodyText);

  // Description heuristic
  const descEl = document.querySelector('[class*="description"], [id*="description"], article, p');
  const description = descEl ? descEl.textContent.trim() : bodyText.slice(0, 1000);

  // Locality heuristic
  const localityMatch = title.match(/in\s+([A-Za-z0-9\s,-]+?)(?:,|\s-|\sfor|\s*$)/i);
  const locality = localityMatch ? localityMatch[1].trim() : '';

  // Images
  const imgEls = Array.from(document.querySelectorAll('img[src*="photo"], img[src*="property"], img[src*="listing"], img'));
  const rawImages = imgEls
    .map(i => i.src || i.getAttribute('src'))
    .filter(Boolean);
  const images = filterPropertyImages(Array.from(new Set(rawImages))).slice(0, 5);

  const listingKey = parseListingKey('generic', url, document);

  const pricePerSqft = area_sqft && price ? Math.round(price / area_sqft) : null;

  return {
    portal: 'generic',
    listingKey,
    url: canonicalizeUrl(url),
    title,
    locality,
    listingType,
    rawPrice,
    rent: listingType === 'sale' ? null : rent,
    price: listingType === 'sale' ? (price || rawPrice) : null,
    salePrice: listingType === 'sale' ? (price || rawPrice) : null,
    pricePerSqft,
    deposit: listingType === 'sale' ? null : deposit,
    bhk,
    area_sqft,
    areaSqft: area_sqft,
    floor,
    description,
    images
  };
}
