import { parseIndianCurrency, parseBHK } from './currency.js';

export function parseMagicBricks(document) {
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

  const descEl = container.querySelector('.mb-srp__card--desc--text, [class*="desc"]');
  const description = descEl ? descEl.textContent.trim() : '';

  const imageEls = Array.from(container.querySelectorAll('.mb-srp__card__photo, img'));
  const images = imageEls.map(img => img.src || img.getAttribute('src')).filter(Boolean);

  return {
    portal: 'magicbricks',
    title,
    locality,
    rent,
    deposit,
    bhk,
    description,
    images
  };
}
