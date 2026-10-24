import { parseIndianCurrency, parseBHK } from './currency.js';

export function parseNoBroker(document) {
  const container = document.querySelector('[data-portal="nobroker"]') || document.body;

  const titleEl = container.querySelector('#listing-title, h1.heading-6, h1');
  const title = titleEl ? titleEl.textContent.trim() : '';

  const localityEl = container.querySelector('.locality-subtext, [class*="locality"]');
  const locality = localityEl ? localityEl.textContent.trim() : '';

  const rentEl = container.querySelector('#price-display, .rent-item .value, [id*="rent"]');
  const rent = rentEl ? parseIndianCurrency(rentEl.textContent) : null;

  const depositEl = container.querySelector('#deposit-display, .deposit-item .value, [id*="deposit"]');
  const deposit = depositEl ? parseIndianCurrency(depositEl.textContent) : null;

  const bhkEl = container.querySelector('#bhk-display, .bhk-item .value');
  const bhk = bhkEl ? parseBHK(bhkEl.textContent) : (parseBHK(title) || 2);

  const descEl = container.querySelector('#description-body, .description-text, [class*="description"]');
  const description = descEl ? descEl.textContent.trim() : '';

  const imageEls = Array.from(container.querySelectorAll('.listing-photo, .photo-grid img, img[data-photo-id]'));
  const images = imageEls.map(img => img.src || img.getAttribute('src')).filter(Boolean);

  return {
    portal: 'nobroker',
    title,
    locality,
    rent,
    deposit,
    bhk,
    description,
    images
  };
}
