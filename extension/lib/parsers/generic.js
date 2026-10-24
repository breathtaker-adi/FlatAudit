import { parseIndianCurrency, parseBHK, parseArea, parseFloor } from './currency.js';
import { parseListingKey, canonicalizeUrl } from '../tracker.js';

export function parseGeneric(document, url = '') {
  // Try finding title
  const titleEl = document.querySelector('h1, meta[property="og:title"], title');
  const title = titleEl ? (titleEl.content || titleEl.textContent || '').trim() : '';

  // Extract text body
  const bodyText = document.body ? document.body.innerText || document.body.textContent : '';

  // Heuristic rent search
  let rent = null;
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
  const images = imgEls
    .map(i => i.src || i.getAttribute('src'))
    .filter(src => src && !src.includes('avatar') && !src.includes('icon') && !src.includes('logo'))
    .slice(0, 5);

  const listingKey = parseListingKey('generic', url, document);

  return {
    portal: 'generic',
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
