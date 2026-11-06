import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { 
  parseIndianCurrency, 
  parseBHK,
  parsePricePerSqFt,
  parseAreaType,
  parsePossessionStatus,
  parseReraId,
  filterPropertyImages
} from '../extension/lib/parsers/currency.js';
import { extractListing, isListingValid } from '../extension/lib/parsers/index.js';

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

  it('parses Crore, Crores and Cr shorthand for property buying', () => {
    assert.equal(parseIndianCurrency('₹ 1.25 Cr'), 12500000);
    assert.equal(parseIndianCurrency('1.45 Crore'), 14500000);
    assert.equal(parseIndianCurrency('2 Crores'), 20000000);
    assert.equal(parseIndianCurrency('85 Lacs'), 8500000);
  });

  it('parses Price per Sq.Ft in diverse notation formats', () => {
    assert.equal(parsePricePerSqFt('₹ 10,162 / sq.ft'), 10162);
    assert.equal(parsePricePerSqFt('Rs. 7500 per sqft'), 7500);
    assert.equal(parsePricePerSqFt('9200 / sqft'), 9200);
  });

  it('identifies Area Types correctly (carpet, builtup, super_builtup)', () => {
    assert.equal(parseAreaType('1,230 sq.ft Carpet Area'), 'carpet');
    assert.equal(parseAreaType('Super Built-up Area: 1450 sqft'), 'super_builtup');
    assert.equal(parseAreaType('Built-up Area: 1300 sqft'), 'builtup');
    assert.equal(parseAreaType('Unspecified layout'), 'unknown');
  });

  it('identifies Possession and Construction Status', () => {
    assert.equal(parsePossessionStatus('Ready to Move (Resale, 4 Yrs Old)'), 'ready_to_move');
    assert.equal(parsePossessionStatus('Under Construction, Possession by Dec 2026'), 'under_construction');
    assert.equal(parsePossessionStatus('General property'), 'unknown');
  });

  it('extracts State RERA Registration Numbers and strips DOM button words', () => {
    assert.equal(parseReraId('RERA ID: PRM/KA/RERA/1251/310/PR/171015/000451'), 'PRM/KA/RERA/1251/310/PR/171015/000451');
    assert.equal(parseReraId('PRM/KA/RERA/1251/446/PR/200205/003243CopiedSource extracted.'), 'PRM/KA/RERA/1251/446/PR/200205/003243');
    assert.equal(parseReraId('MahaRERA: P51800001234'), 'P51800001234');
    assert.equal(parseReraId('HRERA Registered: HRERA-PKL-GGM-102'), 'HRERA-PKL-GGM-102');
    assert.equal(parseReraId('No registration mentioned'), null);
  });

  it('filters out YouTube thumbnails, ad trackers, SVGs, and data URLs from property images', () => {
    const rawList = [
      'https://img.youtube.com/vi_webp/UYR2n0Ne0fM/hqdefault.webp',
      'https://img.nobroker.in/images/8a9f908781/property.jpg',
      'https://googleads.g.doubleclick.net/pagead/ads?id=123',
      'https://cdn.mbimg.com/photos/apartment-exterior.png',
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA',
      'https://portal.com/icons/verified-badge.svg'
    ];
    const cleaned = filterPropertyImages(rawList);
    assert.deepEqual(cleaned, [
      'https://img.nobroker.in/images/8a9f908781/property.jpg',
      'https://cdn.mbimg.com/photos/apartment-exterior.png'
    ]);
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

  it('parses 99acres VPD Jodhpur Pal Balaji detail page with JSON-LD and DOM fallback', () => {
    const html = fs.readFileSync(path.join(fixturesDir, '99acres_vpd_jodhpur_2bhk.html'), 'utf-8');
    const dom = new JSDOM(html);
    const vpdUrl = 'https://www.99acres.com/2-bhk-bedroom-independent-builder-floor-for-rent-in-pal-balaji-jodhpur-165-sqft-r1-spid-Y49932640';
    const listing = extractListing(dom.window.document, vpdUrl);

    assert.equal(listing.portal, '99acres');
    assert.equal(listing.listingKey, '99acres:Y49932640');
    assert.equal(listing.listingType, 'rent');
    assert.equal(listing.rent, 10000);
    assert.equal(listing.deposit, 5000);
    assert.equal(listing.bhk, 2);
    assert.equal(listing.area_sqft, 165);
    assert.match(listing.locality, /Pal Balaji/i);
    assert.match(listing.locality, /Jodhpur/i);
    assert.equal(listing.isValid, true);
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

  it('parses NoBroker sale 2BHK resale fixture correctly', () => {
    const html = fs.readFileSync(path.join(fixturesDir, 'nobroker_sale_resale_2bhk.html'), 'utf-8');
    const dom = new JSDOM(html);
    const listing = extractListing(dom.window.document, 'https://www.nobroker.in/property/buy/2-bhk-apartment-for-sale-in-electronic-city-bangalore');

    assert.equal(listing.portal, 'nobroker');
    assert.equal(listing.listingType, 'sale');
    assert.equal(listing.listingKey, 'nobroker:nb-sale-blr-88102');
    assert.equal(listing.price, 12500000);
    assert.equal(listing.pricePerSqft, 10162);
    assert.equal(listing.bhk, 2);
    assert.equal(listing.area_sqft, 1230);
    assert.equal(listing.areaType, 'carpet');
    assert.equal(listing.possessionStatus, 'ready_to_move');
    assert.equal(listing.reraId, 'PRM/KA/RERA/1251/310/PR/171015/000451');
    assert.equal(listing.projectName, 'Prestige Casabella');
    assert.match(listing.locality, /Electronic City/);
    assert.equal(listing.isValid, true);
  });

  it('parses 99acres New Project Kiara Ville Jaipur fixture with price, area, and Raj-RERA ID', () => {
    const html = fs.readFileSync(path.join(fixturesDir, '99acres_project_jaipur_kiara.html'), 'utf-8');
    const dom = new JSDOM(html);
    const projectUrl = 'https://www.99acres.com/kiara-ville-jagatpura-jagatpura-jaipur-npxid-r380406';
    const listing = extractListing(dom.window.document, projectUrl);

    assert.equal(listing.portal, '99acres');
    assert.equal(listing.listingKey, '99acres:r380406');
    assert.equal(listing.listingType, 'sale');
    assert.equal(listing.isProject, true);
    assert.equal(listing.price, 12000000); // ₹1.2 Cr from configuration cards
    assert.equal(listing.area_sqft, 765);   // 765 sqft
    assert.equal(listing.pricePerSqft, 15686);
    assert.equal(listing.reraId, 'RAJ/P/2021/1639');
    assert.equal(listing.projectName, 'Kiara Ville Jagatpura');
    assert.equal(listing.builderName, 'Kiara Group');
    assert.match(listing.locality, /Krishna Vihar Colony|Jagatpura/i);
    assert.equal(listing.isValid, true);
  });
});

describe('Parser Health & Field Integrity Checks', () => {
  const fixtureConfigs = [
    { file: 'nobroker_normal_2bhk.html', url: 'https://www.nobroker.in/bangalore/indiranagar' },
    { file: 'nobroker_scam_army_token.html', url: 'https://www.nobroker.in/bangalore/hsr-layout' },
    { file: 'magicbricks_bait_price.html', url: 'https://www.magicbricks.com/property-details' },
    { file: '99acres_normal_1bhk.html', url: 'https://www.99acres.com/rent-in-powai' },
    { file: '99acres_vpd_jodhpur_2bhk.html', url: 'https://www.99acres.com/2-bhk-bedroom-independent-builder-floor-for-rent-in-pal-balaji-jodhpur-165-sqft-r1-spid-Y49932640' },
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

  it('health check: nobroker_sale_resale_2bhk.html produces non-empty sale price, area, bhk, and locality', () => {
    const html = fs.readFileSync(path.join(fixturesDir, 'nobroker_sale_resale_2bhk.html'), 'utf-8');
    const dom = new JSDOM(html);
    const listing = extractListing(dom.window.document, 'https://www.nobroker.in/property/buy/bangalore');

    assert.ok(listing);
    assert.equal(listing.listingType, 'sale');
    assert.ok(typeof listing.price === 'number' && listing.price > 0, 'Empty or invalid sale price');
    assert.ok(typeof listing.area_sqft === 'number' && listing.area_sqft > 0, 'Empty or invalid area');
    assert.ok(typeof listing.bhk === 'number' && listing.bhk >= 1, 'Empty or invalid BHK');
    assert.ok(typeof listing.locality === 'string' && listing.locality.trim().length > 0, 'Empty locality');
    assert.equal(listing.isValid, true);
  });

  it('health check: 99acres_project_jaipur_kiara.html produces non-empty sale price, area, bhk, and Raj-RERA ID', () => {
    const html = fs.readFileSync(path.join(fixturesDir, '99acres_project_jaipur_kiara.html'), 'utf-8');
    const dom = new JSDOM(html);
    const listing = extractListing(dom.window.document, 'https://www.99acres.com/kiara-ville-jagatpura-jagatpura-jaipur-npxid-r380406');

    assert.ok(listing);
    assert.equal(listing.listingType, 'sale');
    assert.equal(listing.isProject, true);
    assert.ok(typeof listing.price === 'number' && listing.price > 0, 'Empty or invalid project price');
    assert.ok(typeof listing.area_sqft === 'number' && listing.area_sqft > 0, 'Empty or invalid project area');
    assert.ok(typeof listing.bhk === 'number' && listing.bhk >= 1, 'Empty or invalid BHK');
    assert.ok(typeof listing.locality === 'string' && listing.locality.trim().length > 0, 'Empty locality');
    assert.equal(listing.reraId, 'RAJ/P/2021/1639');
    assert.equal(listing.isValid, true);
  });

  it('health check: sale listing fails validity when sale price or area is missing', () => {
    const invalidSale1 = { listingType: 'sale', price: null, area_sqft: 1200, bhk: 2, locality: 'Whitefield' };
    assert.equal(isListingValid(invalidSale1), false);

    const invalidSale2 = { listingType: 'sale', price: 15000000, area_sqft: null, bhk: 2, locality: 'Whitefield' };
    assert.equal(isListingValid(invalidSale2), false);

    const invalidSale3 = { listingType: 'sale', price: 15000000, area_sqft: 1200, bhk: null, locality: 'Whitefield' };
    assert.equal(isListingValid(invalidSale3), false);

    const invalidSale4 = { listingType: 'sale', price: 15000000, area_sqft: 1200, bhk: 2, locality: '' };
    assert.equal(isListingValid(invalidSale4), false);
  });

  it('fails safely and gracefully on empty or malformed DOM without throwing', () => {
    const emptyDom = new JSDOM('<html><body><p>Unrelated blog post</p></body></html>');
    const listing = extractListing(emptyDom.window.document, 'https://unknown-domain.com/article');

    assert.ok(listing);
    assert.equal(listing.isValid, false);
    assert.equal(listing.rent, null);
  });
});

