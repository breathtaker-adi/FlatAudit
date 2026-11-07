import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeWeightedMedian,
  normalizeAreaType,
  isCitySupported,
  comparePricePerSqft,
  formatPriceCheckDisplay,
  EXACT_STRINGS
} from '../extension/lib/price_compare.js';

describe('Slice S1: Price per Sq.Ft Compare & Aggregation Engine', () => {
  describe('Mode and Eligibility Checks', () => {
    it('blocks comparison when mode is unknown and returns exact string', () => {
      const flat = {
        listingType: 'unknown',
        bhk: 2,
        area_sqft: 1000,
        areaType: 'carpet',
        price: 9000000,
        city: 'bengaluru'
      };
      const res = comparePricePerSqft(flat, []);
      assert.equal(res.status, 'mode_unknown');
      assert.equal(res.point, 'Pick rent or sale first to see a price comparison.');
      assert.equal(res.usable, false);
    });

    it('returns not_applicable for rental mode (sale listings only)', () => {
      const flat = {
        listingType: 'rent',
        bhk: 2,
        area_sqft: 1000,
        areaType: 'carpet',
        rent: 35000,
        city: 'bengaluru'
      };
      const res = comparePricePerSqft(flat, []);
      assert.equal(res.status, 'not_applicable');
      assert.equal(res.usable, false);
    });

    it('returns exact string when area type is unknown or unclear', () => {
      const flat = {
        listingType: 'sale',
        bhk: 2,
        area_sqft: 1000,
        areaType: 'unknown',
        price: 9000000,
        city: 'bengaluru'
      };
      const res = comparePricePerSqft(flat, []);
      assert.equal(res.status, 'area_type_unknown');
      assert.equal(res.point, 'Area type not clear on this page, so no price comparison.');
      assert.equal(res.usable, false);
    });

    it('returns exact string when city is not supported in the pilot', () => {
      const flat = {
        listingType: 'sale',
        bhk: 2,
        area_sqft: 1000,
        areaType: 'carpet',
        price: 9000000,
        city: 'chennai'
      };
      const res = comparePricePerSqft(flat, []);
      assert.equal(res.status, 'unsupported_city');
      assert.equal(res.point, 'Not available for this city yet.');
      assert.equal(res.usable, false);
    });
  });

  describe('Weighted Median Computation', () => {
    it('computes exact n-weighted median for balanced cells', () => {
      // Cell 1: 10 listings at ₹8,000; Cell 2: 10 listings at ₹9,000 -> Median = ₹8,500
      const items = [
        { value: 8000, weight: 10 },
        { value: 9000, weight: 10 }
      ];
      assert.equal(computeWeightedMedian(items), 8500);
    });

    it('shifts median towards cell with higher sample weight', () => {
      // Cell 1: 5 listings at ₹8,000; Cell 2: 20 listings at ₹9,000 -> Total 25, median item is in Cell 2
      const items = [
        { value: 8000, weight: 5 },
        { value: 9000, weight: 20 }
      ];
      assert.equal(computeWeightedMedian(items), 9000);
    });

    it('handles empty or malformed input safely', () => {
      assert.equal(computeWeightedMedian([]), null);
      assert.equal(computeWeightedMedian(null), null);
      assert.equal(computeWeightedMedian([{ value: 8000, weight: 0 }]), null);
    });
  });

  describe('Sample Gate Rules (Assumption 4)', () => {
    const targetFlat = {
      listingType: 'sale',
      bhk: 2,
      area_sqft: 1000,
      areaType: 'carpet',
      price: 9120000, // ₹9,120/sqft
      city: 'bengaluru'
    };

    it('fails gate when total n < 8 combined and shows exact string', () => {
      const thinCells = [
        { cell: 'cell1', bhk: 2, area_type: 'carpet', n: 4, psf_median: 8500 },
        { cell: 'cell2', bhk: 2, area_type: 'carpet', n: 3, psf_median: 8700 }
      ]; // total n = 7 < 8
      const res = comparePricePerSqft(targetFlat, thinCells);
      assert.equal(res.status, 'insufficient');
      assert.equal(res.point, 'Not enough listings to compare.');
      assert.equal(res.usable, false);
    });

    it('passes gate when total n >= 8 across at least 2 distinct cells', () => {
      const cells = [
        { cell: 'cell1', bhk: 2, area_type: 'carpet', n: 4, psf_median: 8500 },
        { cell: 'cell2', bhk: 2, area_type: 'carpet', n: 4, psf_median: 8700 }
      ]; // total n = 8 across 2 distinct cells
      const res = comparePricePerSqft(targetFlat, cells);
      assert.equal(res.status, 'ok');
      assert.equal(res.usable, true);
      assert.equal(res.n, 8);
      assert.equal(res.localities_used, 2);
    });

    it('passes gate when a single cell has n >= 8', () => {
      const singleCell = [
        { cell: 'cell1', bhk: 2, area_type: 'carpet', n: 12, psf_median: 8600 }
      ];
      const res = comparePricePerSqft(targetFlat, singleCell);
      assert.equal(res.status, 'ok');
      assert.equal(res.usable, true);
      assert.equal(res.n, 12);
      assert.equal(res.localities_used, 1);
    });
  });

  describe('Matching Rules: BHK and Area Type Filtering', () => {
    const carpetFlat = {
      listingType: 'sale',
      bhk: 2,
      area_sqft: 1000,
      areaType: 'carpet',
      price: 10000000, // ₹10,000/sqft
      city: 'bengaluru'
    };

    it('strictly isolates carpet from super built-up and 2 BHK from other BHKs', () => {
      const candidateCells = [
        // Matching: 2 BHK carpet
        { cell: 'c1', bhk: 2, area_type: 'carpet', n: 10, psf_median: 9500 },
        // Mismatched area type: 2 BHK super built-up
        { cell: 'c2', bhk: 2, area_type: 'super_builtup', n: 15, psf_median: 7200 },
        // Mismatched BHK: 3 BHK carpet
        { cell: 'c3', bhk: 3, area_type: 'carpet', n: 20, psf_median: 11000 }
      ];

      const res = comparePricePerSqft(carpetFlat, candidateCells);
      assert.equal(res.status, 'ok');
      // Only c1 should be used
      assert.equal(res.n, 10);
      assert.equal(res.localities_used, 1);
      assert.equal(res.area_psf_median, 9500);
    });
  });

  describe('Comparison Output & Display Formatting (Section 5.4 & 5.5)', () => {
    it('produces exact output format matching section 5.4 example', () => {
      const flat = {
        listingType: 'sale',
        bhk: 2,
        area_sqft: 1000,
        areaType: 'carpet',
        price: 9120000, // ₹9,120/sqft
        city: 'bengaluru',
        locality: 'Indiranagar'
      };

      const cells = [
        { cell: 'c1', name: 'Indiranagar', is_own_locality: true, bhk: 2, area_type: 'carpet', n: 12, psf_median: 8600 },
        { cell: 'c2', name: 'Domlur', is_own_locality: false, bhk: 2, area_type: 'carpet', n: 6, psf_median: 8600 },
        { cell: 'c3', name: 'Ulsoor', is_own_locality: false, bhk: 2, area_type: 'carpet', n: 5, psf_median: 8600 }
      ]; // total n = 23, 3 localities

      const res = comparePricePerSqft(flat, cells, { radiusKm: 3, dataAsOf: '2026-11' });
      assert.equal(res.status, 'ok');
      assert.equal(res.flat_psf, 9120);
      assert.equal(res.area_psf_median, 8600);
      assert.equal(res.diff_pct, 6.0);
      assert.equal(res.n, 23);
      assert.equal(res.localities_used, 3);
      assert.equal(res.radius_km, 3);
      assert.equal(res.own_locality_n, 12);
      assert.equal(res.data_as_of, '2026-11');

      // Headline check: ₹9,120/sq ft, 6% above the middle rate of ₹8,600/sq ft (23 listings, 3 localities within 3 km).
      assert.equal(res.headline, '₹9,120/sq ft, 6% above the middle rate of ₹8,600/sq ft (23 listings, 3 localities within 3 km).');
      assert.match(res.how_compared, /same 2 BHK and same carpet area within 3 km/);
      assert.match(res.fact, /Middle rate across 3 nearby localities is ₹8,600\/sq ft/);
    });

    it('formats below middle rate accurately', () => {
      const flat = {
        listingType: 'sale',
        bhk: 2,
        area_sqft: 1000,
        areaType: 'carpet',
        price: 8000000, // ₹8,000/sqft (-7.0% below 8,600)
        city: 'bengaluru'
      };
      const cells = [
        { cell: 'c1', bhk: 2, area_type: 'carpet', n: 10, psf_median: 8600 }
      ];
      const res = comparePricePerSqft(flat, cells);
      assert.equal(res.diff_pct, -7.0);
      assert.match(res.headline, /7% below the middle rate of ₹8,600\/sq ft/);
    });

    it('formats drawback when own locality has fewer than 5 listings', () => {
      const flat = {
        listingType: 'sale',
        bhk: 2,
        area_sqft: 1000,
        areaType: 'carpet',
        price: 9000000,
        city: 'bengaluru',
        locality: 'Koramangala'
      };
      const cells = [
        { cell: 'c1', name: 'Koramangala', is_own_locality: true, bhk: 2, area_type: 'carpet', n: 3, psf_median: 9000 },
        { cell: 'c2', name: 'Ejipura', is_own_locality: false, bhk: 2, area_type: 'carpet', n: 10, psf_median: 9000 }
      ];
      const res = comparePricePerSqft(flat, cells);
      assert.equal(res.drawback, 'Most listings come from neighbouring localities.');
    });
  });

  describe('Wording Policy Compliance (Section 0 Rule 4)', () => {
    it('verifies zero forbidden words in all text templates and outputs', () => {
      const forbidden = [
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

      // Test all exact string constants
      for (const [key, str] of Object.entries(EXACT_STRINGS)) {
        for (const pattern of forbidden) {
          assert.doesNotMatch(str, pattern, `EXACT_STRINGS.${key} contains forbidden term: ${pattern}`);
        }
      }

      // Test sample result texts
      const sampleRes = {
        status: 'ok',
        flat_psf: 9120,
        area_psf_median: 8600,
        diff_pct: 6.0,
        n: 23,
        localities_used: 3,
        radius_km: 3,
        own_locality_n: 2
      };
      const display = formatPriceCheckDisplay(sampleRes, { bhk: 2, areaType: 'carpet' });
      for (const text of [display.headline, display.how_compared, display.fact, display.drawback, display.reason]) {
        for (const pattern of forbidden) {
          assert.doesNotMatch(text, pattern, `Output contains forbidden term: ${pattern}`);
        }
      }
    });
  });
});
