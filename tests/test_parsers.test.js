import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { parseIndianCurrency, parseBHK } from '../extension/lib/parsers/currency.js';
import { extractListing } from '../extension/lib/parsers/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, '..', 'fixtures');

describe('Currency and BHK Parsers', () => {
  it('parses standard Indian currency strings', () => {
    assert.equal(parseIndianCurrency('₹ 42,000'), 42000);
    assert.equal(parseIndianCurrency('Rs. 12,000 / month'), 12000);
    assert.equal(parseIndianCurrency('₹ 1,50,000'), 150000);
  });

  it('parses Lakh and K shorthand', () => {
    assert.equal(parseIndianCurrency('1.5 Lakh'), 150000);
    assert.equal(parseIndianCurrency('2.25 Lac'), 225000);
    assert.equal(parseIndianCurrency('45k'), 45000);
  });

  it('parses BHK and Bedroom counts', () => {
    assert.equal(parseBHK('2 BHK Semi Furnished'), 2);
    assert.equal(parseBHK('Luxury 3 BHK Penthouse'), 3);
    assert.equal(parseBHK('1 Bedroom (1 BHK)'), 1);
    assert.equal(parseBHK('1RK Studio'), 1);
  });
});

describe('HTML Listing Fixture Parsers', () => {
  it('parses NoBroker normal 2BHK fixture correctly', () => {
    const html = fs.readFileSync(path.join(fixturesDir, 'nobroker_normal_2bhk.html'), 'utf-8');
    const dom = new JSDOM(html);
    const listing = extractListing(dom.window.document, 'https://www.nobroker.in/bangalore/indiranagar');

    assert.equal(listing.portal, 'nobroker');
    assert.equal(listing.listingKey, 'nobroker:nb-blr-49821');
    assert.match(listing.title, /2 BHK Semi Furnished/);
    assert.equal(listing.rent, 42000);
    assert.equal(listing.deposit, 150000);
    assert.equal(listing.bhk, 2);
    assert.equal(listing.area_sqft, 1250);
    assert.match(listing.locality, /Indiranagar/);
    assert.equal(listing.images.length, 3);
  });

  it('parses NoBroker scam Army token fixture correctly', () => {
    const html = fs.readFileSync(path.join(fixturesDir, 'nobroker_scam_army_token.html'), 'utf-8');
    const dom = new JSDOM(html);
    const listing = extractListing(dom.window.document, 'https://www.nobroker.in/bangalore/hsr-layout');

    assert.equal(listing.portal, 'nobroker');
    assert.equal(listing.rent, 12000);
    assert.equal(listing.deposit, 25000);
    assert.equal(listing.bhk, 3);
    assert.match(listing.description, /Army defense officer/i);
    assert.match(listing.description, /gate pass/i);
    assert.match(listing.description, /visiting token/i);
  });

  it('parses MagicBricks bait price fixture correctly', () => {
    const html = fs.readFileSync(path.join(fixturesDir, 'magicbricks_bait_price.html'), 'utf-8');
    const dom = new JSDOM(html);
    const listing = extractListing(dom.window.document, 'https://www.magicbricks.com/property-details');

    assert.equal(listing.portal, 'magicbricks');
    assert.equal(listing.listingKey, 'magicbricks:mb-ggn-77123');
    assert.equal(listing.rent, 14000);
    assert.equal(listing.deposit, 14000);
    assert.equal(listing.bhk, 3);
    assert.equal(listing.area_sqft, 2200);
    assert.match(listing.locality, /DLF Phase 2/);
  });

  it('parses 99acres normal 1BHK fixture correctly', () => {
    const html = fs.readFileSync(path.join(fixturesDir, '99acres_normal_1bhk.html'), 'utf-8');
    const dom = new JSDOM(html);
    const listing = extractListing(dom.window.document, 'https://www.99acres.com/rent-in-powai');

    assert.equal(listing.portal, '99acres');
    assert.equal(listing.listingKey, '99acres:prop-mumbai-9901');
    assert.equal(listing.rent, 36000);
    assert.equal(listing.deposit, 100000);
    assert.equal(listing.bhk, 1);
    assert.equal(listing.area_sqft, 580);
    assert.match(listing.locality, /Powai/);
  });

  it('parses Housing.com duplicate photo zero-deposit fixture correctly', () => {
    const html = fs.readFileSync(path.join(fixturesDir, 'housing_duplicate_photos.html'), 'utf-8');
    const dom = new JSDOM(html);
    const listing = extractListing(dom.window.document, 'https://housing.com/rent/hinjawadi');

    assert.equal(listing.portal, 'housing');
    assert.equal(listing.listingKey, 'housing:housing-pune-4412');
    assert.equal(listing.rent, 9500);
    assert.equal(listing.deposit, 0);
    assert.equal(listing.bhk, 2);
    assert.match(listing.description, /booking token/i);
  });
});

describe('Parser Health & Field Integrity Checks', () => {
  const fixtureConfigs = [
    { file: 'nobroker_normal_2bhk.html', url: 'https://www.nobroker.in/bangalore/indiranagar' },
    { file: 'nobroker_scam_army_token.html', url: 'https://www.nobroker.in/bangalore/hsr-layout' },
    { file: 'magicbricks_bait_price.html', url: 'https://www.magicbricks.com/property-details' },
    { file: '99acres_normal_1bhk.html', url: 'https://www.99acres.com/rent-in-powai' },
    { file: 'housing_duplicate_photos.html', url: 'https://housing.com/rent/hinjawadi' }
  ];

  for (const item of fixtureConfigs) {
    it(`health check: ${item.file} produces non-empty rent, bhk, and locality`, () => {
      const html = fs.readFileSync(path.join(fixturesDir, item.file), 'utf-8');
      const dom = new JSDOM(html);
      const listing = extractListing(dom.window.document, item.url);

      assert.ok(listing, `Extraction failed for ${item.file}`);
      assert.ok(typeof listing.rent === 'number' && listing.rent > 0, `Empty or invalid rent in ${item.file}`);
      assert.ok(typeof listing.bhk === 'number' && listing.bhk >= 1, `Empty or invalid BHK in ${item.file}`);
      assert.ok(typeof listing.locality === 'string' && listing.locality.trim().length > 0, `Empty locality in ${item.file}`);
      assert.equal(listing.isValid, true);
    });
  }

  it('fails safely and gracefully on empty or malformed DOM without throwing', () => {
    const emptyDom = new JSDOM('<html><body><p>Unrelated blog post</p></body></html>');
    const listing = extractListing(emptyDom.window.document, 'https://unknown-domain.com/article');

    assert.ok(listing);
    assert.equal(listing.isValid, false);
    assert.equal(listing.rent, null);
  });
});

