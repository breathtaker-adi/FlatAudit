import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyListingType } from '../extension/lib/parsers/classifier.js';

describe('Multi-Signal Listing Intent Classifier (Rent vs Sale)', () => {
  it('classifies a clear rental page (URL and per-month price)', () => {
    const fakeDoc = {
      querySelector: () => ({ textContent: '2 BHK Flat for Rent in Indiranagar' }),
      body: { innerText: 'Rent ₹ 38,000 / month, Security Deposit: ₹ 1,50,000' }
    };
    const res = classifyListingType(fakeDoc, fakeDoc.body.innerText, 'https://nobroker.in/rent/2bhk-flat-indiranagar');
    assert.equal(res.mode, 'rent');
    assert.equal(res.confidence, 'high');
    assert.ok(res.rentSignals.length >= 2);
  });

  it('classifies a clear resale/sale page (URL, Crores price, possession)', () => {
    const fakeDoc = {
      querySelector: () => ({ textContent: '3 BHK Apartment for Sale in Whitefield' }),
      body: { innerText: 'Price: ₹ 1.85 Cr | Ready to Move | RERA Approved | EMI starts at 1.2L' }
    };
    const res = classifyListingType(fakeDoc, fakeDoc.body.innerText, 'https://nobroker.in/buy/3bhk-whitefield-resale');
    assert.equal(res.mode, 'sale');
    assert.equal(res.confidence, 'high');
    assert.ok(res.saleSignals.length >= 2);
  });

  it('classifies high-rent luxury apartment as rent even with large deposit', () => {
    const fakeDoc = {
      querySelector: () => ({ textContent: 'Luxury 4 BHK Penthouse for Rent in Koramangala' }),
      body: { innerText: 'Monthly rent ₹ 1.5 Lakh / month. Security deposit ₹ 6,00,000.' }
    };
    const res = classifyListingType(fakeDoc, fakeDoc.body.innerText, 'https://99acres.com/property-for-rent/penthouse-koramangala');
    assert.equal(res.mode, 'rent');
  });

  it('classifies sale listing when price is in Crores and mentions monthly maintenance', () => {
    const fakeDoc = {
      querySelector: () => ({ textContent: '2 BHK Resale Flat in Bellandur' }),
      body: { innerText: 'Price: 1.15 Crore. Maintenance: ₹3,500/month. Possession: Immediate.' }
    };
    const res = classifyListingType(fakeDoc, fakeDoc.body.innerText, 'https://magicbricks.com/buy-property/bellandur-flat');
    assert.equal(res.mode, 'sale');
  });

  it('identifies unsupported PG / coliving listing and returns unknown mode', () => {
    const fakeDoc = {
      querySelector: () => ({ textContent: 'Zolo Coliving PG for Men in HSR Layout' }),
      body: { innerText: 'Shared room PG hostel with food, rent ₹ 11,000/mo' }
    };
    const res = classifyListingType(fakeDoc, fakeDoc.body.innerText, 'https://housing.com/pg-hsr-layout');
    assert.equal(res.mode, 'unknown');
    assert.equal(res.unsupportedType, 'pg');
  });

  it('identifies commercial shop/office listing and returns unknown mode', () => {
    const fakeDoc = {
      querySelector: () => ({ textContent: 'Commercial Office Space for Rent' }),
      body: { innerText: 'Retail shop / warehouse space, 2500 sqft' }
    };
    const res = classifyListingType(fakeDoc, fakeDoc.body.innerText, 'https://nobroker.in/commercial-space-rent');
    assert.equal(res.mode, 'unknown');
    assert.equal(res.unsupportedType, 'commercial');
  });

  it('identifies plot / land listing and returns unknown mode', () => {
    const fakeDoc = {
      querySelector: () => ({ textContent: 'Residential Plot for Sale in Devanahalli' }),
      body: { innerText: 'Gated community plots, DC converted agricultural land' }
    };
    const res = classifyListingType(fakeDoc, fakeDoc.body.innerText, 'https://99acres.com/plot-for-sale');
    assert.equal(res.mode, 'unknown');
    assert.equal(res.unsupportedType, 'plot');
  });

  it('returns unknown when signals are absent or insufficient (< 2 agreeing signals)', () => {
    const fakeDoc = {
      querySelector: () => ({ textContent: 'Property in Indiranagar' }),
      body: { innerText: 'Nice 2 BHK flat near metro station, contact owner.' }
    };
    const res = classifyListingType(fakeDoc, fakeDoc.body.innerText, 'https://portal.com/property/view/12345');
    assert.equal(res.mode, 'unknown');
    assert.equal(res.confidence, 'low');
  });
});
