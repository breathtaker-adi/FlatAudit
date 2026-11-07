import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAreaType,
  filterLikeForLikeListings,
  evaluatePricePerSqftCheck
} from '../extension/lib/price_check.js';
import { analyzeListing } from '../extension/lib/signals.js';

describe('Piece 0: Safety Rule - Block Price Comparison When Mode is Unknown', () => {
  it('hides price comparison and shows "Pick rent or sale first" when listingType is unknown', () => {
    const unknownListing = {
      listingType: 'unknown',
      title: '3 BHK Flat in Indiranagar',
      bhk: 3,
      area_sqft: 1500,
      areaType: 'carpet',
      rawPrice: 45000,
      locality: 'Indiranagar, Bangalore'
    };

    // 1. Direct price check evaluator
    const check = evaluatePricePerSqftCheck(unknownListing, [
      { bhk: 3, area_sqft: 1500, areaType: 'carpet', rent: 44000, listingType: 'rent' },
      { bhk: 3, area_sqft: 1500, areaType: 'carpet', rent: 45000, listingType: 'rent' },
      { bhk: 3, area_sqft: 1500, areaType: 'carpet', rent: 46000, listingType: 'rent' }
    ]);

    assert.equal(check.blocked, true);
    assert.equal(check.point, 'Pick rent or sale first');
    assert.match(check.reason, /choose rent or sale/i);
    assert.equal(check.ratePerSqft, null);
    assert.equal(check.middleRate, null);
    assert.equal(check.percentDelta, null);

    // 2. Composite analyzeListing output
    const analysis = analyzeListing(unknownListing);
    assert.equal(analysis.listingType, 'unknown');
    assert.equal(analysis.badgeLabel, 'Select Mode');
    assert.equal(analysis.badgeTone, 'warn');

    // Verify observation row exists with exact required safety text
    const pricePoint = analysis.humanReadablePoints.find(p => p.category === 'Price per Sq.Ft');
    assert.ok(pricePoint, 'Price per Sq.Ft observation row must be present');
    assert.match(pricePoint.point, /Pick rent or sale first/i);
    assert.match(pricePoint.reason, /Pick rent or sale first/i);

    // Verify no price signals or outlier z-score flags fired
    assert.equal(analysis.firedCount, 0);
    assert.equal(Object.keys(analysis.signals).length, 0);
  });

  it('filterLikeForLikeListings returns empty list when target mode is unknown', () => {
    const target = {
      listingType: 'unknown',
      bhk: 2,
      area_sqft: 1000,
      areaType: 'carpet'
    };
    const peers = [
      { bhk: 2, area_sqft: 1000, areaType: 'carpet', rent: 30000, listingType: 'rent' },
      { bhk: 2, area_sqft: 1000, areaType: 'carpet', price: 10000000, listingType: 'sale' }
    ];
    const filtered = filterLikeForLikeListings(target, peers);
    assert.equal(filtered.length, 0);
  });
});

describe('Part A1: Price per Sq.Ft Like-for-Like Matching Rules', () => {
  const baseTarget = {
    listingType: 'sale',
    bhk: 2,
    area_sqft: 1000,
    areaType: 'carpet',
    price: 10000000, // ₹1.00 Cr -> ₹10,000/sqft
    locality: 'Whitefield, Bangalore'
  };

  describe('Rule 1: Same BHK Matching', () => {
    it('matches only listings with the exact same BHK', () => {
      const candidates = [
        { id: 1, bhk: 1, area_sqft: 1000, areaType: 'carpet', price: 9000000, listingType: 'sale' },
        { id: 2, bhk: 2, area_sqft: 1000, areaType: 'carpet', price: 9500000, listingType: 'sale' },
        { id: 3, bhk: 2, area_sqft: 1050, areaType: 'carpet', price: 9800000, listingType: 'sale' },
        { id: 4, bhk: 3, area_sqft: 1000, areaType: 'carpet', price: 11000000, listingType: 'sale' },
        { id: 5, bhk: 4, area_sqft: 1000, areaType: 'carpet', price: 13000000, listingType: 'sale' }
      ];

      const matched = filterLikeForLikeListings(baseTarget, candidates);
      assert.equal(matched.length, 2);
      assert.deepEqual(matched.map(m => m.id), [2, 3]);
    });
  });

  describe('Rule 2: Same Size Type (Carpet vs Super Built-up)', () => {
    it('matches carpet to carpet only, rejecting super built-up and built-up peers', () => {
      const candidates = [
        { id: 'c1', bhk: 2, area_sqft: 1000, areaType: 'carpet', price: 9600000, listingType: 'sale' },
        { id: 'sb1', bhk: 2, area_sqft: 1000, areaType: 'super_builtup', price: 7500000, listingType: 'sale' },
        { id: 'sb2', bhk: 2, area_sqft: 1000, areaType: 'SBUA', price: 7800000, listingType: 'sale' },
        { id: 'bu1', bhk: 2, area_sqft: 1000, areaType: 'builtup', price: 8500000, listingType: 'sale' },
        { id: 'u1', bhk: 2, area_sqft: 1000, areaType: 'unknown', price: 9000000, listingType: 'sale' }
      ];

      const matched = filterLikeForLikeListings(baseTarget, candidates);
      assert.equal(matched.length, 1);
      assert.equal(matched[0].id, 'c1');
    });

    it('matches super built-up to super built-up when target is super built-up', () => {
      const sbuaTarget = {
        ...baseTarget,
        areaType: 'super_builtup'
      };

      const candidates = [
        { id: 'c1', bhk: 2, area_sqft: 1000, areaType: 'carpet', price: 9600000, listingType: 'sale' },
        { id: 'sb1', bhk: 2, area_sqft: 1000, areaType: 'super_builtup', price: 7500000, listingType: 'sale' },
        { id: 'sb2', bhk: 2, area_sqft: 1000, areaType: 'super built-up', price: 7800000, listingType: 'sale' },
        { id: 'bu1', bhk: 2, area_sqft: 1000, areaType: 'builtup', price: 8500000, listingType: 'sale' }
      ];

      const matched = filterLikeForLikeListings(sbuaTarget, candidates);
      assert.equal(matched.length, 2);
      assert.deepEqual(matched.map(m => m.id), ['sb1', 'sb2']);
    });
  });

  describe('Rule 3: Similar Size Only (within ±20% of this flat)', () => {
    it('filters peers by ±20% area tolerance (e.g. 1000 sqft target accepts 800 - 1200 sqft)', () => {
      const candidates = [
        { id: 'too_small', bhk: 2, area_sqft: 790, areaType: 'carpet', price: 7500000, listingType: 'sale' }, // -21%
        { id: 'min_edge', bhk: 2, area_sqft: 800, areaType: 'carpet', price: 7800000, listingType: 'sale' },  // -20%
        { id: 'mid', bhk: 2, area_sqft: 1050, areaType: 'carpet', price: 10200000, listingType: 'sale' },     // +5%
        { id: 'max_edge', bhk: 2, area_sqft: 1200, areaType: 'carpet', price: 11500000, listingType: 'sale' }, // +20%
        { id: 'too_large', bhk: 2, area_sqft: 1210, areaType: 'carpet', price: 12000000, listingType: 'sale' } // +21%
      ];

      const matched = filterLikeForLikeListings(baseTarget, candidates);
      assert.equal(matched.length, 3);
      assert.deepEqual(matched.map(m => m.id), ['min_edge', 'mid', 'max_edge']);
    });
  });

  describe('Rule 4: Minimum Number of Listings Threshold', () => {
    it('shows "Not enough listings to compare" and nothing else when n < 3', () => {
      const thinCandidates = [
        { id: 1, bhk: 2, area_sqft: 1000, areaType: 'carpet', price: 9500000, listingType: 'sale' },
        { id: 2, bhk: 2, area_sqft: 1000, areaType: 'carpet', price: 9800000, listingType: 'sale' }
      ];

      const result = evaluatePricePerSqftCheck(baseTarget, thinCandidates);
      assert.equal(result.status, 'insufficient_sample');
      assert.equal(result.point, 'Not enough listings to compare');
      assert.equal(result.reason, 'Not enough listings to compare');
      assert.equal(result.usable, false);
      assert.equal(result.middleRate, null);
      assert.equal(result.percentDelta, null);
    });

    it('shows "Not enough listings to compare" when zero candidates are provided', () => {
      const result = evaluatePricePerSqftCheck(baseTarget, []);
      assert.equal(result.point, 'Not enough listings to compare');
      assert.equal(result.reason, 'Not enough listings to compare');
      assert.equal(result.usable, false);
    });
  });

  describe('Rule 5: Comparison Calculation & Objective Tone', () => {
    it('calculates "X% above the middle rate" accurately without subjective words like cheap or overpriced', () => {
      // Target: 1000 sqft at ₹1.15 Cr -> ₹11,500/sqft
      const target = {
        listingType: 'sale',
        bhk: 2,
        area_sqft: 1000,
        areaType: 'carpet',
        price: 11500000,
        locality: 'Indiranagar, Bangalore'
      };

      // 4 peers: rates ₹9,800, ₹10,000, ₹10,200, ₹10,400 -> Median = ₹10,100
      // (11500 - 10100) / 10100 = +13.86% -> +14%
      const candidates = [
        { bhk: 2, area_sqft: 1000, areaType: 'carpet', price: 9800000, listingType: 'sale' },
        { bhk: 2, area_sqft: 1000, areaType: 'carpet', price: 10000000, listingType: 'sale' },
        { bhk: 2, area_sqft: 1000, areaType: 'carpet', price: 10200000, listingType: 'sale' },
        { bhk: 2, area_sqft: 1000, areaType: 'carpet', price: 10400000, listingType: 'sale' }
      ];

      const result = evaluatePricePerSqftCheck(target, candidates);
      assert.equal(result.status, 'compared');
      assert.equal(result.usable, true);
      assert.equal(result.middleRate, 10100);
      assert.equal(result.ratePerSqft, 11500);
      assert.equal(result.percentDelta, 14);
      assert.equal(result.point, '14% above the middle rate');

      // Verify tone: no subjective/defamatory words
      assert.doesNotMatch(result.point, /overpriced|expensive|bad|scam/i);
      assert.doesNotMatch(result.reason, /overpriced|expensive|bad|scam/i);
      assert.match(result.reason, /This flat: ₹11,500/);
      assert.match(result.reason, /Middle rate: ₹10,100/);
    });

    it('calculates "X% below the middle rate" accurately with objective tone', () => {
      // Target: 1000 sqft at ₹88 Lakhs -> ₹8,800/sqft
      const target = {
        listingType: 'sale',
        bhk: 2,
        area_sqft: 1000,
        areaType: 'carpet',
        price: 8800000,
        locality: 'HSR Layout, Bangalore'
      };

      // 3 peers at ₹10,000/sqft -> Median = ₹10,000
      // (8800 - 10000) / 10000 = -12%
      const candidates = [
        { bhk: 2, area_sqft: 1000, areaType: 'carpet', price: 10000000, listingType: 'sale' },
        { bhk: 2, area_sqft: 1000, areaType: 'carpet', price: 10000000, listingType: 'sale' },
        { bhk: 2, area_sqft: 1000, areaType: 'carpet', price: 10000000, listingType: 'sale' }
      ];

      const result = evaluatePricePerSqftCheck(target, candidates);
      assert.equal(result.status, 'compared');
      assert.equal(result.percentDelta, -12);
      assert.equal(result.point, '12% below the middle rate');

      // Verify tone: no words like cheap, steal, bargain
      assert.doesNotMatch(result.point, /cheap|steal|bargain|undervalued/i);
      assert.doesNotMatch(result.reason, /cheap|steal|bargain|undervalued/i);
    });

    it('calculates "Matches the middle rate" for rental flat accurately', () => {
      // Target: 1000 sqft rent ₹30,000/mo -> ₹30.0/sqft
      const rentalTarget = {
        listingType: 'rent',
        bhk: 2,
        area_sqft: 1000,
        areaType: 'carpet',
        rent: 30000,
        locality: 'Indiranagar, Bangalore'
      };

      const candidates = [
        { bhk: 2, area_sqft: 1000, areaType: 'carpet', rent: 28000, listingType: 'rent' },
        { bhk: 2, area_sqft: 1000, areaType: 'carpet', rent: 30000, listingType: 'rent' },
        { bhk: 2, area_sqft: 1000, areaType: 'carpet', rent: 32000, listingType: 'rent' }
      ];

      const result = evaluatePricePerSqftCheck(rentalTarget, candidates);
      assert.equal(result.status, 'compared');
      assert.equal(result.percentDelta, 0);
      assert.equal(result.point, 'Matches the middle rate');
      assert.match(result.reason, /₹30/);
    });

    it('strictly separates rent peers from sale peers so cross-mode comparison never occurs', () => {
      // Rental target
      const rentalTarget = {
        listingType: 'rent',
        bhk: 2,
        area_sqft: 1000,
        areaType: 'carpet',
        rent: 35000
      };

      // 4 candidates, but 3 are sale listings and only 1 is rent
      const mixedCandidates = [
        { bhk: 2, area_sqft: 1000, areaType: 'carpet', price: 10000000, listingType: 'sale' },
        { bhk: 2, area_sqft: 1000, areaType: 'carpet', price: 11000000, listingType: 'sale' },
        { bhk: 2, area_sqft: 1000, areaType: 'carpet', price: 9500000, listingType: 'sale' },
        { bhk: 2, area_sqft: 1000, areaType: 'carpet', rent: 34000, listingType: 'rent' }
      ];

      // Since only 1 rental peer exists, sample is insufficient (< 3)
      const result = evaluatePricePerSqftCheck(rentalTarget, mixedCandidates);
      assert.equal(result.point, 'Not enough listings to compare');
      assert.equal(result.sampleSize, 1);
    });
  });
});
