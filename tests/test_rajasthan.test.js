import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RajasthanValuationAdapter,
  normalizeRajReraId,
  evaluateRajReraDossier
} from '../extension/lib/states/rajasthan.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rajasthanCostsPath = path.resolve(__dirname, '../extension/lib/data/rajasthan_costs.json');
const rajasthanCosts = JSON.parse(fs.readFileSync(rajasthanCostsPath, 'utf8'));

describe('Rajasthan State Valuation Adapter & Raj-RERA Module', () => {
  const adapter = new RajasthanValuationAdapter(rajasthanCosts);

  describe('DLC Guidance Valuation & Surcharges', () => {
    test('calculates base residential interior DLC valuation in Mansarovar, Jaipur', () => {
      // Mansarovar residential interior: ₹19,800 / sq.m
      const res = adapter.calculateValuationAndCosts({
        city: 'jaipur',
        locality: 'mansarovar',
        usageType: 'residential',
        isMainRoad: false,
        roadWidthFt: 30,
        isCornerPlot: false,
        builtUpAreaSqM: 100.0,
        agreedPrice: 3500000,
        buyerType: 'male_or_joint'
      });

      assert.strictEqual(res.ratePerSqM, 19800);
      assert.strictEqual(res.dlcValuation, 1980000);
      assert.strictEqual(res.deemedValue, 3500000); // agreedPrice > dlcValuation
      assert.strictEqual(res.underreportedTaxRisk, false);

      // Male buyer: 6% base stamp duty, 33% surcharges on duty, 1% registration fee
      // Base duty = 3,500,000 * 0.06 = 210,000
      // Surcharges = 210,000 * 0.33 = 69,300
      // Registration = 3,500,000 * 0.01 = 35,000
      // Total = 314,300 (~8.98%)
      assert.strictEqual(res.costsBreakdown.baseStampDuty, 210000);
      assert.strictEqual(res.costsBreakdown.totalSurcharges, 69300);
      assert.strictEqual(res.costsBreakdown.registrationFee, 35000);
      assert.strictEqual(res.costsBreakdown.totalStatutoryCosts, 314300);
      assert.strictEqual(res.costsBreakdown.effectiveRatePct, 8.98);
    });

    test('calculates female buyer concession (5% base duty + statutory surcharges)', () => {
      const res = adapter.calculateValuationAndCosts({
        city: 'jaipur',
        locality: 'mansarovar',
        builtUpAreaSqM: 100.0,
        agreedPrice: 3500000,
        buyerType: 'sole_female'
      });

      // Female buyer: 5% base duty = 175,000
      // Surcharges = 175,000 * 0.33 = 57,750
      // Registration = 35,000
      // Total = 267,750 (~7.65%)
      assert.strictEqual(res.costsBreakdown.baseStampDuty, 175000);
      assert.strictEqual(res.costsBreakdown.totalSurcharges, 57750);
      assert.strictEqual(res.costsBreakdown.registrationFee, 35000);
      assert.strictEqual(res.costsBreakdown.totalStatutoryCosts, 267750);
      assert.strictEqual(res.costsBreakdown.effectiveRatePct, 7.65);
    });

    test('applies road width multipliers and corner plot premiums', () => {
      // Mansarovar exterior main road: ₹24,200 / sq.m
      // Road width 50ft: +10% multiplier -> 24,200 * 1.10 = 26,620
      // Corner plot: +10% -> 26,620 * 1.10 = 29,282
      const res = adapter.calculateValuationAndCosts({
        city: 'jaipur',
        locality: 'mansarovar',
        isMainRoad: true,
        roadWidthFt: 50,
        isCornerPlot: true,
        builtUpAreaSqM: 100.0,
        agreedPrice: 5000000
      });

      assert.strictEqual(res.ratePerSqM, 29282);
      assert.strictEqual(res.dlcValuation, 2928200);
    });

    test('flags Section 47-A tax underreporting risk when agreed price is below DLC floor', () => {
      // Jodhpur Shastri Nagar interior: ₹22,000 / sq.m. 100 sq.m = ₹22,00,000
      // Agreed price: ₹18,00,000 (below DLC)
      const res = adapter.calculateValuationAndCosts({
        city: 'jodhpur',
        locality: 'shastri_nagar',
        builtUpAreaSqM: 100.0,
        agreedPrice: 1800000
      });

      assert.strictEqual(res.dlcValuation, 2200000);
      assert.strictEqual(res.deemedValue, 2200000); // Taxes calculated on deemed DLC value
      assert.strictEqual(res.underreportedTaxRisk, true);
    });

    test('falls back gracefully to zone median rate when colony is not in table', () => {
      const res = adapter.calculateValuationAndCosts({
        city: 'jaipur',
        locality: 'unlisted_rural_colony_sector_9',
        builtUpAreaSqM: 80.0,
        agreedPrice: 2000000
      });

      assert.ok(res.ratePerSqM > 0);
      assert.ok(res.dlcValuation > 0);
      assert.strictEqual(typeof res.costsBreakdown.totalStatutoryCosts, 'number');
    });
  });

  describe('Raj-RERA Registration ID Normalization', () => {
    test('normalizes standard project and agent registration formats', () => {
      assert.strictEqual(normalizeRajReraId('RAJ/P/2023/1234'), 'RAJ/P/2023/1234');
      assert.strictEqual(normalizeRajReraId('raj-p-2021-1489'), 'RAJ/P/2021/1489');
      assert.strictEqual(normalizeRajReraId('RAJ / A / 2018 / 042'), 'RAJ/A/2018/042');
      assert.strictEqual(normalizeRajReraId('invalid_id_format'), null);
      assert.strictEqual(normalizeRajReraId(''), null);
    });
  });

  describe('Raj-RERA Statutory Disclosure Evaluation (Form R-1, R-2, R-3 & QPR)', () => {
    test('flags ESCROW_OVERDRAWN when withdrawals exceed certified civil work by > 10%', () => {
      const dossier = {
        physical_status: { architect_r1_pct: 50.0 },
        financial_escrow: {
          cost_incurred_pct: 50.0,
          funds_withdrawn_pct: 75.0 // +25% divergence
        },
        velocity_metrics: {
          runway_months_remaining: 18,
          historic_velocity_pct_per_quarter: 5.0
        },
        compliance_freshness: { qpr_filing_lag_days: 30 }
      };

      const flags = evaluateRajReraDossier(dossier);
      const flagCodes = flags.map(f => f.code);

      assert.ok(flagCodes.includes('ESCROW_OVERDRAWN'));
      const escrowFlag = flags.find(f => f.code === 'ESCROW_OVERDRAWN');
      assert.strictEqual(escrowFlag.severity, 'CRITICAL');
      assert.ok(escrowFlag.description.includes('+25.0%'));
    });

    test('flags IMPROBABLE_DEADLINE when required velocity exceeds 1.75x historic pace', () => {
      const dossier = {
        physical_status: { architect_r1_pct: 40.0 }, // 60% remaining
        financial_escrow: { cost_incurred_pct: 40.0, funds_withdrawn_pct: 42.0 },
        velocity_metrics: {
          runway_months_remaining: 6, // 2 quarters -> needs 30% per quarter
          historic_velocity_pct_per_quarter: 4.0 // 4 * 1.75 = 7.0 << 30
        },
        compliance_freshness: { qpr_filing_lag_days: 15 }
      };

      const flags = evaluateRajReraDossier(dossier);
      const flagCodes = flags.map(f => f.code);

      assert.ok(flagCodes.includes('IMPROBABLE_DEADLINE'));
      const deadlineFlag = flags.find(f => f.code === 'IMPROBABLE_DEADLINE');
      assert.strictEqual(deadlineFlag.severity, 'HIGH');
    });

    test('flags COMPLIANCE_NON_REPORTING when QPR filing lag exceeds 90 days', () => {
      const dossier = {
        physical_status: { architect_r1_pct: 80.0 },
        financial_escrow: { cost_incurred_pct: 80.0, funds_withdrawn_pct: 80.0 },
        velocity_metrics: { runway_months_remaining: 12, historic_velocity_pct_per_quarter: 5.0 },
        compliance_freshness: { qpr_filing_lag_days: 120 }
      };

      const flags = evaluateRajReraDossier(dossier);
      const flagCodes = flags.map(f => f.code);

      assert.ok(flagCodes.includes('COMPLIANCE_NON_REPORTING'));
    });

    test('emits zero flags for fully compliant project', () => {
      const cleanDossier = {
        physical_status: { architect_r1_pct: 75.0 },
        financial_escrow: { cost_incurred_pct: 74.0, funds_withdrawn_pct: 75.0 },
        velocity_metrics: {
          runway_months_remaining: 12, // 4 quarters -> needs 6.25% per quarter
          historic_velocity_pct_per_quarter: 7.0
        },
        compliance_freshness: { qpr_filing_lag_days: 20 }
      };

      const flags = evaluateRajReraDossier(cleanDossier);
      assert.strictEqual(flags.length, 0);
    });
  });
});
