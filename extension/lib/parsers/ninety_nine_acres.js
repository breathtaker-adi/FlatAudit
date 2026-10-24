import { parseIndianCurrency, parseBHK } from './currency.js';

export function parse99acres(document) {
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

  const descEl = container.querySelector('.description__content, [class*="description"]');
  const description = descEl ? descEl.textContent.trim() : '';

  const imageEls = Array.from(container.querySelectorAll('.srpTuple__image, img'));
  const images = imageEls.map(img => img.src || img.getAttribute('src')).filter(Boolean);

  return {
    portal: '99acres',
    title,
    locality,
    rent,
    deposit,
    bhk,
    description,
    images
  };
}
