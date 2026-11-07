import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getCityTier } from '../extension/lib/area/grades.js';
import { generateAreaReport } from '../extension/lib/area/report.js';
import { detectListingCategory, generateBuyerReport } from '../extension/lib/buyer.js';

describe('UI & Apple Design Improvements', () => {
  describe('1. City Normalization (Bengaluru & Bangalore support)', () => {
    it('resolves both "Bengaluru" and "Bangalore" to metro tier', () => {
      assert.strictEqual(getCityTier('Bengaluru'), 'metro');
      assert.strictEqual(getCityTier('bangalore'), 'metro');
      assert.strictEqual(getCityTier('Bangalore Urban'), 'metro');
      assert.strictEqual(getCityTier('Jaipur'), 'smaller');
      assert.strictEqual(getCityTier('Jodhpur'), 'smaller');
    });

    it('generates area report without "unsupported_city" error for Bangalore', async () => {
      const rep = await generateAreaReport(
        { lat: 12.978, lng: 77.641, city: 'Bangalore' },
        { settings: { enabled: true }, fetchFn: async () => ({ ok: true, json: async () => ({ elements: [] }) }) }
      );
      assert.notStrictEqual(rep.status, 'unsupported_city');
    });
  });

  describe('2. Differentiating Individual vs Project vs Builder Listings', () => {
    it('detects individual resale property correctly', () => {
      const listing = {
        title: '4 BHK Independent House/Villa for sale in Kudi',
        locality: 'Kudi',
        city: 'Jodhpur',
        isProject: false
      };
      const cat = detectListingCategory(listing);
      assert.strictEqual(cat, 'individual');

      const rep = generateBuyerReport(listing);
      assert.strictEqual(rep.meta.listingCategory, 'individual');
      assert.strictEqual(rep.meta.categoryLabel, 'INDIVIDUAL RESALE');
      assert.strictEqual(rep.reportLines.project.label, '30-Year Title & EC');
      assert.strictEqual(rep.reportLines.builder.label, 'Society NOC & Taxes');
      assert.ok(rep.reportLines.project.summary.includes('30-Year Title Search'));
      assert.ok(rep.reportLines.builder.summary.includes('Society / RWA NOC'));
    });

    it('detects builder floor correctly', () => {
      const listing = {
        title: '3 BHK Builder Floor for sale in Indiranagar',
        locality: 'Indiranagar',
        city: 'Bengaluru',
        isBuilderFloor: true
      };
      const cat = detectListingCategory(listing);
      assert.strictEqual(cat, 'builder');

      const rep = generateBuyerReport(listing);
      assert.strictEqual(rep.meta.listingCategory, 'builder');
      assert.strictEqual(rep.meta.categoryLabel, 'BUILDER FLOOR');
      assert.strictEqual(rep.reportLines.project.label, 'Floor Approvals & FAR');
      assert.strictEqual(rep.reportLines.builder.label, 'Builder JDA & UDS');
      assert.ok(rep.reportLines.project.summary.includes('FAR'));
      assert.ok(rep.reportLines.builder.summary.includes('Joint Development Agreement'));
    });

    it('detects developer project / new launch correctly', () => {
      const listing = {
        title: 'Godrej Reflections, 3 BHK High-Rise Apartment',
        projectName: 'Godrej Reflections',
        locality: 'Harlur',
        city: 'Bengaluru',
        isProject: true,
        reraId: 'PRM/KA/RERA/1251/310/PR/170915/000234'
      };
      const cat = detectListingCategory(listing);
      assert.strictEqual(cat, 'project');

      const rep = generateBuyerReport(listing);
      assert.strictEqual(rep.meta.listingCategory, 'project');
      assert.strictEqual(rep.meta.categoryLabel, 'DEVELOPER PROJECT');
      assert.strictEqual(rep.reportLines.project.label, 'RERA Project Filings');
      assert.strictEqual(rep.reportLines.builder.label, 'Promoter Track Record');
    });
  });
});
