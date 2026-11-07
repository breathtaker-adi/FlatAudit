import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeListing } from '../extension/lib/signals.js';
import { EXACT_STRINGS } from '../extension/lib/price_compare.js';

describe('Slice S3: Price Check UI Line, Details & Wording Verification', () => {
  const forbiddenPatterns = [
    /\bsafe\b/i,
    /\bunsafe\b/i,
    /\bdangerous\b/i,
    /\bscam\b/i,
    /\boverpriced\b/i,
    /\bcheap\b/i,
    /\bgood\s*deal\b/i,
    /\bbad\s*area\b/i,
    /\bworth\s*it\b/i
  ];

  it('renders exact string when mode is unknown: "Pick rent or sale first to see a price comparison."', () => {
    const unknownListing = {
      listingType: 'unknown',
      title: '3 BHK in Indiranagar',
      rawPrice: 5000000,
      area_sqft: 1400,
      bhk: 3,
      locality: 'Indiranagar, Bangalore'
    };

    const analysis = analyzeListing(unknownListing);
    const pt = analysis.humanReadablePoints.find(p => p.category === 'Price per Sq.Ft');
    assert.ok(pt, 'Must render Price per Sq.Ft row');
    assert.equal(pt.point, 'Pick rent or sale first to see a price comparison.');
    assert.equal(pt.reason, 'Pick rent or sale first to see a price comparison.');
    assert.equal(pt.statusLabel, 'Blocked');
  });

  it('renders exact string when area type is unknown: "Area type not clear on this page, so no price comparison."', () => {
    const saleListing = {
      listingType: 'sale',
      title: '2 BHK in Whitefield',
      price: 9000000,
      area_sqft: 1000,
      areaType: 'unknown',
      bhk: 2,
      locality: 'Whitefield, Bangalore'
    };

    const analysis = analyzeListing(saleListing, { includePriceCheck: true });
    const pt = analysis.humanReadablePoints.find(p => p.category === 'Price per Sq.Ft');
    assert.ok(pt);
    assert.equal(pt.point, 'Area type not clear on this page, so no price comparison.');
    assert.equal(pt.statusLabel, 'Info');
  });

  it('renders exact string when sample is insufficient: "Not enough listings to compare."', () => {
    const saleListing = {
      listingType: 'sale',
      title: '2 BHK in Indiranagar',
      price: 9000000,
      area_sqft: 1000,
      areaType: 'carpet',
      bhk: 2,
      locality: 'Indiranagar, Bangalore'
    };

    // Only 2 peer listings provided -> total n = 2 < 8
    const analysis = analyzeListing(saleListing, {
      peerListings: [
        { bhk: 2, area_sqft: 1000, areaType: 'carpet', price: 8500000 },
        { bhk: 2, area_sqft: 1000, areaType: 'carpet', price: 8700000 }
      ]
    });

    const pt = analysis.humanReadablePoints.find(p => p.category === 'Price per Sq.Ft');
    assert.ok(pt);
    assert.equal(pt.point, 'Not enough listings to compare.');
    assert.equal(pt.statusLabel, 'Info');
  });

  it('renders exact string when city is unsupported: "Not available for this city yet."', () => {
    const saleListing = {
      listingType: 'sale',
      title: '2 BHK in T Nagar',
      price: 9000000,
      area_sqft: 1000,
      areaType: 'carpet',
      bhk: 2,
      city: 'chennai',
      locality: 'T Nagar, Chennai'
    };

    const analysis = analyzeListing(saleListing, { includePriceCheck: true });
    const pt = analysis.humanReadablePoints.find(p => p.category === 'Price per Sq.Ft');
    assert.ok(pt);
    assert.equal(pt.point, 'Not available for this city yet.');
  });

  it('renders exact headline, how judged, fact, and drawback when comparison passes', () => {
    const saleListing = {
      listingType: 'sale',
      title: '2 BHK in Indiranagar',
      price: 9120000, // ₹9,120/sqft
      area_sqft: 1000,
      areaType: 'carpet',
      bhk: 2,
      city: 'bengaluru',
      locality: 'Indiranagar'
    };

    const cellEntries = [
      { cell: 'c1', name: 'Indiranagar', is_own_locality: true, bhk: 2, area_type: 'carpet', n: 12, psf_median: 8600 },
      { cell: 'c2', name: 'Domlur', is_own_locality: false, bhk: 2, area_type: 'carpet', n: 6, psf_median: 8600 },
      { cell: 'c3', name: 'Ulsoor', is_own_locality: false, bhk: 2, area_type: 'carpet', n: 5, psf_median: 8600 }
    ];

    const analysis = analyzeListing(saleListing, { cellEntries, radiusKm: 3, dataAsOf: '2026-11' });
    const pt = analysis.humanReadablePoints.find(p => p.category === 'Price per Sq.Ft');
    assert.ok(pt);
    assert.equal(pt.statusLabel, 'Verified');

    // Section 5.5 Headline:
    // ₹9,120/sq ft, 6% above the middle rate of ₹8,600/sq ft (23 listings, 3 localities within 3 km).
    assert.equal(pt.point, '₹9,120/sq ft, 6% above the middle rate of ₹8,600/sq ft (23 listings, 3 localities within 3 km).');

    // Check details structure
    assert.ok(pt.details);
    assert.match(pt.details.how_compared, /same 2 BHK and same carpet area within 3 km \(straight line\)/);
    assert.match(pt.details.fact, /Middle rate across 3 nearby localities is ₹8,600\/sq ft \(23 listings combined\)/);
    assert.match(pt.details.drawback, /Listing asking prices, not registered sale deeds/);
  });

  it('wording check: verifies zero forbidden words in all output fields', () => {
    const saleListing = {
      listingType: 'sale',
      title: '2 BHK in Indiranagar',
      price: 9120000,
      area_sqft: 1000,
      areaType: 'carpet',
      bhk: 2,
      city: 'bengaluru',
      locality: 'Indiranagar'
    };

    const cellEntries = [
      { cell: 'c1', name: 'Indiranagar', is_own_locality: true, bhk: 2, area_type: 'carpet', n: 12, psf_median: 8600 },
      { cell: 'c2', name: 'Domlur', is_own_locality: false, bhk: 2, area_type: 'carpet', n: 6, psf_median: 8600 }
    ];

    const analysis = analyzeListing(saleListing, { cellEntries });
    for (const p of analysis.humanReadablePoints) {
      for (const pattern of forbiddenPatterns) {
        assert.doesNotMatch(p.point, pattern, `Point contains forbidden word: ${pattern}`);
        assert.doesNotMatch(p.reason, pattern, `Reason contains forbidden word: ${pattern}`);
      }
    }
  });
});
