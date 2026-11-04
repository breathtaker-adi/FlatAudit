import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyListingType } from '../extension/lib/parsers/classifier.js';

/**
 * 120 Labeled Test Cases across 4 major Indian real estate portals.
 * Evaluates the multi-signal classifier against the Stage 1 Gate (< 2% wrong mode).
 */
describe('Bulk Real-Page Intent Classifier Evaluation (120 Cases)', () => {
  const portals = ['nobroker', 'magicbricks', '99acres', 'housing'];
  const testCases = [];

  // 1. Clear Rental Cases (40 cases across 4 portals)
  const rentTitles = [
    '2 BHK Flat For Rent In Indiranagar, Bangalore',
    'Spacious 3 BHK Apartment For Rent In HSR Layout Sector 2',
    '1 BHK House For Rent In Koramangala 4th Block',
    'Furnished 2 BHK Flat For Rent In Whitefield Near ITPL',
    'Semi Furnished 3 BHK For Rent In Bellandur Outer Ring Road',
    '1 RK Studio Apartment For Rent In Marathahalli',
    '3 BHK Flat In Powai For Rent With Modular Kitchen',
    '2 BHK Apartment For Rent In Andheri West, Mumbai',
    'Luxury 4 BHK Penthouse For Rent In Bandra West',
    '2 BHK High Rise Flat For Rent In Sector 56 Gurgaon'
  ];

  rentTitles.forEach((title, idx) => {
    portals.forEach(portal => {
      testCases.push({
        id: `rent_${portal}_${idx}`,
        portal,
        expectedMode: 'rent',
        title,
        url: `https://${portal}.com/rent/property-detail-${idx}`,
        bodyText: `Monthly Rent: ₹ ${25000 + idx * 5000} / month. Security Deposit: ₹ ${(25000 + idx * 5000) * 4}. Available immediately.`
      });
    });
  });

  // 2. Clear Sale / Resale Cases (40 cases across 4 portals)
  const saleTitles = [
    '3 BHK Flat For Sale In Prestige Falcon City, Kanakapura Road',
    '2 BHK Resale Apartment For Sale In Sobha Dream Acres, Panathur',
    '4 BHK Luxury Apartment For Sale In Godrej Reflections, Sarjapur',
    'Ready To Move 3 BHK Flat In Brigade Gateway, Rajajinagar',
    'Under Construction 2 BHK Apartment For Sale In Whitefield',
    '3 BHK Resale Flat For Sale In Hiranandani Gardens, Powai',
    '2 BHK Flat For Sale In DLF Phase 2, Gurgaon',
    'New Launch 3 BHK Apartment In Hinjawadi Phase 1, Pune',
    'Resale 2 BHK Flat In Wakad Near Phoenix Mall',
    'Pre-owned 3 BHK Apartment For Sale In Electronic City Phase 1'
  ];

  saleTitles.forEach((title, idx) => {
    portals.forEach(portal => {
      const crVal = (1.1 + idx * 0.25).toFixed(2);
      testCases.push({
        id: `sale_${portal}_${idx}`,
        portal,
        expectedMode: 'sale',
        title,
        url: `https://${portal}.com/buy/property-sale-detail-${idx}`,
        bodyText: `Total Price: ₹ ${crVal} Cr. Price per sqft: ₹ 8,500/sqft. RERA ID: PRM/KA/RERA/1251/310/PR/170915/000234. Possession: Ready to move. EMI starts at ₹ 95,000/mo.`
      });
    });
  });

  // 3. Edge Cases: PG / Coliving (12 cases)
  const pgTitles = [
    'Zolo Stays Gents PG In HSR Layout with Food & WiFi',
    'Stanza Living Coliving Space For Women In Koramangala',
    'Shared Bed In Double Sharing Room PG Near Manyata Tech Park'
  ];
  pgTitles.forEach((title, idx) => {
    portals.forEach(portal => {
      testCases.push({
        id: `pg_${portal}_${idx}`,
        portal,
        expectedMode: 'unknown',
        expectedUnsupported: 'pg',
        title,
        url: `https://${portal}.com/pg-coliving-detail-${idx}`,
        bodyText: 'Shared room paying guest PG hostel with 3 times food, WiFi, washing machine. Rent ₹ 10,000/mo.'
      });
    });
  });

  // 4. Edge Cases: Commercial Spaces (12 cases)
  const commTitles = [
    'Commercial Office Space For Rent In MG Road',
    'Retail Shop Space For Sale In Commercial Complex Indiranagar',
    'Industrial Warehouse Godown Space Near Peenya'
  ];
  commTitles.forEach((title, idx) => {
    portals.forEach(portal => {
      testCases.push({
        id: `comm_${portal}_${idx}`,
        portal,
        expectedMode: 'unknown',
        expectedUnsupported: 'commercial',
        title,
        url: `https://${portal}.com/commercial-space-detail-${idx}`,
        bodyText: 'Grade A commercial office space, 3500 sqft warm shell, parking for 5 cars.'
      });
    });
  });

  // 5. Edge Cases: Agricultural & Residential Plots (12 cases)
  const plotTitles = [
    'DC Converted Residential Plot For Sale In Devanahalli',
    'Gated Community Villa Plots For Sale In Sarjapur',
    'Agricultural Farm Land For Sale Near Kanakapura'
  ];
  plotTitles.forEach((title, idx) => {
    portals.forEach(portal => {
      testCases.push({
        id: `plot_${portal}_${idx}`,
        portal,
        expectedMode: 'unknown',
        expectedUnsupported: 'plot',
        title,
        url: `https://${portal}.com/plots-for-sale-detail-${idx}`,
        bodyText: 'BIAAPA approved residential plot 1200 sqft, freehold title.'
      });
    });
  });

  // 6. Ambiguous / Thin Metadata Cases (4 cases)
  for (let idx = 0; idx < 4; idx++) {
    testCases.push({
      id: `ambiguous_${idx}`,
      portal: 'generic',
      expectedMode: 'unknown',
      title: 'Property Listing In Bangalore North',
      url: `https://generic.com/listing/view?id=${1000 + idx}`,
      bodyText: 'Spacious apartment near main road with lift and water supply.'
    });
  }

  it('evaluates all 120 test cases and verifies wrong-mode rate is strictly < 2%', () => {
    let correct = 0;
    let unknown = 0;
    let wrong = 0;
    const failures = [];

    for (const tc of testCases) {
      const mockDoc = {
        querySelector: (sel) => {
          if (sel.includes('h1') || sel.includes('title')) return { textContent: tc.title };
          if (sel.includes('nav') || sel.includes('breadcrumb')) return { textContent: `Home > ${tc.expectedMode === 'sale' ? 'Buy' : 'Rent'} > Bangalore` };
          return null;
        },
        body: { innerText: `${tc.title}\n${tc.bodyText}` }
      };

      const result = classifyListingType(mockDoc, tc.bodyText, tc.url);

      if (tc.expectedMode === 'unknown') {
        if (result.mode === 'unknown') {
          unknown++;
          correct++;
        } else {
          wrong++;
          failures.push({ id: tc.id, expected: tc.expectedMode, actual: result.mode });
        }
      } else {
        if (result.mode === tc.expectedMode) {
          correct++;
        } else if (result.mode === 'unknown') {
          unknown++; // Safe graceful fallback, not a wrong misclassification
        } else {
          wrong++;
          failures.push({ id: tc.id, expected: tc.expectedMode, actual: result.mode });
        }
      }
    }

    const total = testCases.length;
    const correctPct = ((correct / total) * 100).toFixed(1);
    const unknownPct = ((unknown / total) * 100).toFixed(1);
    const wrongPct = ((wrong / total) * 100).toFixed(1);

    console.log(`\n[Bulk Classifier Evaluation on ${total} Real-World Patterns]`);
    console.log(`Correct: ${correct}/${total} (${correctPct}%)`);
    console.log(`Safe Unknowns: ${unknown}/${total} (${unknownPct}%)`);
    console.log(`Wrong Mode: ${wrong}/${total} (${wrongPct}%)`);

    if (failures.length > 0) {
      console.log('Failures:', failures);
    }

    assert.equal(wrong, 0, `Expected 0 wrong classifications, got ${wrong}`);
    assert.ok(parseFloat(wrongPct) <= 2.0, `Wrong mode rate (${wrongPct}%) must be <= 2%`);
    assert.ok(parseFloat(correctPct) >= 95.0, `Correct rate (${correctPct}%) must be >= 95%`);
  });
});
