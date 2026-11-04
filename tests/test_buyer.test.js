import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeReraId,
  detectJurisdiction,
  lookupProjectFacts,
  evaluateFlatFacts,
  evaluateProjectFacts,
  evaluateBuilderFacts,
  evaluatePaperworkFacts,
  estimateTotalCost,
  getPaperworkChecklist,
  generateBuyerReport,
  renderPrintableHtml
} from '../extension/lib/buyer.js';

test('Buyer Mode Engine', async (t) => {
  await t.test('RERA ID normalization', () => {
    assert.strictEqual(
      normalizeReraId('  prm/ka/rera/1251/310/pr/170915/000234  '),
      'PRM/KA/RERA/1251/310/PR/170915/000234'
    );
    assert.strictEqual(normalizeReraId(''), '');
    assert.strictEqual(normalizeReraId(null), '');
  });

  await t.test('Project lookup by RERA ID and project name', () => {
    // 1. Exact RERA ID match
    const lookup1 = lookupProjectFacts('PRM/KA/RERA/1251/310/PR/170915/000234');
    assert.strictEqual(lookup1.found, true);
    assert.strictEqual(lookup1.matchMethod, 'rera_id');
    assert.strictEqual(lookup1.facts.project_name, 'Godrej Reflections');
    assert.strictEqual(lookup1.facts.promoter_entity, 'Godrej Properties Limited');

    // 2. Project name fallback match
    const lookup2 = lookupProjectFacts('', 'Prestige Falcon City');
    assert.strictEqual(lookup2.found, true);
    assert.strictEqual(lookup2.matchMethod, 'project_name');
    assert.strictEqual(lookup2.facts.project_name, 'Prestige Falcon City');
    assert.ok(lookup2.facts.entity_caveat);

    // 3. Unknown project
    const lookup3 = lookupProjectFacts('PRM/KA/RERA/9999/999/PR/999999/999999', 'Nonexistent Project XYZ');
    assert.strictEqual(lookup3.found, false);
    assert.strictEqual(lookup3.facts, null);
  });

  await t.test('Flat evaluation against government circle rate', () => {
    // Electronic City: guidance rate is 5200/sqft
    const normalFlat = {
      price: 12500000, // 1.25 Cr
      area: 1230,
      areaType: 'carpet',
      locality: 'electronic_city',
      city: 'Bengaluru'
    };
    const evalNormal = evaluateFlatFacts(normalFlat);
    assert.strictEqual(evalNormal.indicator, '✓');
    assert.ok(evalNormal.summary.includes('carpet basis'));
    assert.ok(evalNormal.summary.includes('government guidance floor'));

    // Severely under-priced flat: 2500/sqft in Electronic City (>35% below circle rate of 5200)
    const baitFlat = {
      price: 2500000,
      area: 1000,
      areaType: 'carpet',
      locality: 'electronic_city',
      city: 'Bengaluru'
    };
    const evalBait = evaluateFlatFacts(baitFlat);
    assert.strictEqual(evalBait.indicator, '⚠');
    assert.ok(evalBait.summary.includes('below government circle rate'));
    assert.ok(evalBait.details.includes('B-Khata / revenue land'));
  });

  await t.test('Project evaluation: unrevised completion date', () => {
    const lookup = lookupProjectFacts('PRM/KA/RERA/1251/310/PR/170915/000234'); // Godrej Reflections (unrevised)
    const projectEval = evaluateProjectFacts(lookup.facts, lookup.facts.rera_id, 'sarjapur');

    assert.strictEqual(projectEval.indicator, '✓');
    assert.ok(projectEval.summary.includes('Declared completion date met without revision'));
    assert.strictEqual(projectEval.dataAsOf, '2024-09-01');
    assert.ok(projectEval.details.includes('ICICI Bank'));
  });

  await t.test('Project evaluation: revised completion date', () => {
    const lookup = lookupProjectFacts('PRM/KA/RERA/1251/308/PR/200123/003211'); // Purva Atmosphere (+15 months)
    const projectEval = evaluateProjectFacts(lookup.facts, lookup.facts.rera_id, 'thanisandra');

    assert.strictEqual(projectEval.indicator, '⚠');
    assert.ok(projectEval.summary.includes('Completion date was revised 1 time(s)'));
    assert.ok(projectEval.summary.includes('+15 months'));
    assert.ok(projectEval.details.includes('Kotak Mahindra Bank'));
  });

  await t.test('Builder evaluation: past projects, revision denominator, and litigation field', () => {
    const lookup = lookupProjectFacts('PRM/KA/RERA/1251/310/PR/171015/000412'); // Prestige Falcon City
    const builderEval = evaluateBuilderFacts(lookup.facts);

    assert.ok(builderEval.summary.includes('Prestige Estates Projects Limited'));
    assert.ok(builderEval.summary.includes('Dates revised in 4 of 24 projects with both dates available'));
    assert.ok(builderEval.details.includes('Disclosed past projects: 28'));
    assert.ok(builderEval.details.includes('LLP/company entity registration'));

    // Check anti-defamation wording guardrails: NO subjective/banned labels
    const summaryLower = builderEval.summary.toLowerCase();
    const detailsLower = builderEval.details.toLowerCase();
    const banned = ['reliable', 'top builder', 'bad builder', 'risky promoter', 'scam', 'safe'];
    for (const b of banned) {
      assert.strictEqual(summaryLower.includes(b), false, `Found banned word: ${b}`);
      assert.strictEqual(detailsLower.includes(b), false, `Found banned word in details: ${b}`);
    }
  });

  await t.test('Paperwork facts non-coverage statement', () => {
    const paperworkEval = evaluatePaperworkFacts('resale');
    assert.strictEqual(paperworkEval.indicator, '?');
    assert.ok(paperworkEval.summary.includes('Not verified by this tool: title deed'));
    assert.ok(paperworkEval.checklistCount >= 5);
  });

  await t.test('Total Cost Estimation: ready-to-move vs under-construction', () => {
    // 1. Ready to move (0% GST)
    const costReady = estimateTotalCost({
      price: 10000000, // 1 Crore
      areaSqft: 1200,
      possessionStatus: 'ready_to_move',
      downPaymentPct: 20,
      loanRatePct: 8.5,
      loanTenureYears: 20
    });

    assert.strictEqual(costReady.basePrice, 10000000);
    assert.strictEqual(costReady.statutoryCharges.stampDutyAmount, 560000); // 5.6%
    assert.strictEqual(costReady.statutoryCharges.registrationAmount, 100000); // 1.0%
    assert.strictEqual(costReady.statutoryCharges.gstAmount, 0); // 0% on ready with OC
    assert.strictEqual(costReady.statutoryCharges.total, 660000);
    assert.ok(costReady.totalCost > 10000000);
    assert.strictEqual(costReady.financing.downPaymentAmount, 2000000);
    assert.strictEqual(costReady.financing.loanPrincipal, 8000000);
    assert.ok(costReady.financing.monthlyEmi > 0);

    // 2. Under construction (5% GST)
    const costUnderConst = estimateTotalCost({
      price: 10000000,
      areaSqft: 1200,
      possessionStatus: 'under_construction'
    });
    assert.strictEqual(costUnderConst.statutoryCharges.gstPct, 5.0);
    assert.strictEqual(costUnderConst.statutoryCharges.gstAmount, 500000);
    assert.strictEqual(costUnderConst.statutoryCharges.total, 560000 + 100000 + 500000); // 11.6L
  });

  await t.test('Scenario paperwork checklists', () => {
    const resaleDocs = getPaperworkChecklist('resale');
    assert.ok(resaleDocs.some(d => d.name.includes('Mother Deed')));
    assert.ok(resaleDocs.some(d => d.name.includes('Encumbrance Certificate')));
    assert.ok(resaleDocs.some(d => d.name.includes('A-Khata')));

    const underConstDocs = getPaperworkChecklist('under_construction');
    assert.ok(underConstDocs.some(d => d.name.includes('RERA Registration')));
    assert.ok(underConstDocs.some(d => d.name.includes('Sanctioned Building Plan')));
    assert.ok(underConstDocs.some(d => d.name.includes('Escrow Account')));

    const readyDocs = getPaperworkChecklist('ready_from_builder');
    assert.ok(readyDocs.some(d => d.name.includes('Full Occupancy Certificate')));
    assert.ok(readyDocs.some(d => d.name.includes('BESCOM')));
  });

  await t.test('Full Buyer Report and printable HTML generation', () => {
    const listing = {
      title: '2 BHK Luxury Apartment in Godrej Reflections',
      price: 13500000,
      area: 1250,
      areaType: 'carpet',
      locality: 'sarjapur',
      city: 'Bengaluru',
      possessionStatus: 'ready_to_move',
      reraId: 'PRM/KA/RERA/1251/310/PR/170915/000234',
      projectName: 'Godrej Reflections'
    };

    const report = generateBuyerReport(listing, { scenario: 'resale' });
    assert.ok(report.reportLines.flat);
    assert.ok(report.reportLines.project);
    assert.ok(report.reportLines.builder);
    assert.ok(report.reportLines.paperwork);
    assert.strictEqual(report.reportLines.project.indicator, '✓');

    const html = renderPrintableHtml(report, listing);
    assert.ok(html.includes('FlatAudit Buyer Due Diligence Report'));
    assert.ok(html.includes('Godrej Reflections'));
    assert.ok(html.includes('Statutory Government Levies'));
    assert.ok(html.includes('Mandatory Legal Disclaimer'));
    assert.ok(html.includes('window.print()'));
  });

  await t.test('detectJurisdiction: statutory detection across states', () => {
    // Rajasthan
    const raj1 = detectJurisdiction('Jagatpura', 'Jaipur', 'Rajasthan', 'RAJ/P/2021/1639');
    assert.strictEqual(raj1.state, 'Rajasthan');
    assert.strictEqual(raj1.authorityCode, 'Raj-RERA');
    assert.strictEqual(raj1.effectiveStampDutyPct, 7.98);
    assert.strictEqual(raj1.registrationFeePct, 1.0);

    // Karnataka
    const ka = detectJurisdiction('Indiranagar', 'Bengaluru', 'Karnataka', 'PRM/KA/RERA/1251/310/PR/170915/000234');
    assert.strictEqual(ka.state, 'Karnataka');
    assert.strictEqual(ka.authorityCode, 'K-RERA');
    assert.strictEqual(ka.effectiveStampDutyPct, 5.6);

    // Maharashtra
    const mh = detectJurisdiction('Bandra', 'Mumbai', 'Maharashtra', 'P51800001234');
    assert.strictEqual(mh.state, 'Maharashtra');
    assert.strictEqual(mh.authorityCode, 'MahaRERA');

    // Haryana
    const hr = detectJurisdiction('Golf Course Road', 'Gurgaon', 'Haryana', 'HRERA-PKL-GGM-102');
    assert.strictEqual(hr.state, 'Haryana');
    assert.strictEqual(hr.authorityCode, 'HRERA');
  });

  await t.test('Rajasthan Project Evaluation: Kiara Ville Jagatpura on Raj-RERA', () => {
    const kiaraListing = {
      title: 'Kiara Ville Jagatpura, Jaipur',
      price: 12000000,
      area: 765,
      areaType: 'carpet',
      locality: 'Jagatpura',
      city: 'Jaipur',
      reraId: 'RAJ/P/2021/1639',
      isProject: true
    };

    const report = generateBuyerReport(kiaraListing);
    assert.strictEqual(report.meta.state, 'Rajasthan');
    assert.strictEqual(report.meta.pilotAuthority, 'Rajasthan Real Estate Regulatory Authority (Raj-RERA)');
    assert.strictEqual(report.costEstimate.state, 'Rajasthan');
    assert.strictEqual(report.costEstimate.statutoryCharges.stampDutyPct, 7.98);
    assert.strictEqual(report.costEstimate.statutoryCharges.registrationFeePct, 1.0);
    assert.strictEqual(report.reportLines.project.indicator, '✓');
    assert.ok(report.reportLines.project.summary.includes('without revision'));
    assert.ok(report.reportLines.project.details.includes('ICICI Bank'));
    assert.strictEqual(report.reportLines.builder.indicator, '✓');
    assert.ok(report.reportLines.builder.summary.includes('Santusti Infrabuild'));
    assert.ok(report.reportLines.builder.summary.includes('Kiara Group'));
  });

  await t.test('Individual Resale due diligence vs Developer Project due diligence', () => {
    // Individual Resale (no project, no builder, no reraId)
    const resaleListing = {
      title: '2 BHK Apartment in Indiranagar',
      price: 8500000,
      area: 1100,
      locality: 'Indiranagar',
      city: 'Bengaluru',
      isProject: false
    };

    const report = generateBuyerReport(resaleListing);
    assert.strictEqual(report.meta.isProject, false);
    // Line 2 must be 30-year title search, NOT developer RERA filings
    assert.ok(report.reportLines.project.summary.includes('30-Year Title Search'));
    assert.ok(report.reportLines.project.summary.includes('Nil Encumbrance Certificate'));
    // Line 3 must be Society/RWA NOC, NOT promoter track record
    assert.ok(report.reportLines.builder.summary.includes('Society / RWA NOC'));
    assert.ok(report.reportLines.builder.summary.includes('Property Tax Clearance'));
  });
});
