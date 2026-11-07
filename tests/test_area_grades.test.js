import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  getCityTier,
  scoreCheck,
  gradeCategory,
  formatFact,
  formatDrawback
} from '../extension/lib/area/grades.js';

describe('Slice S6: Area Rules Schema, Grading Logic & Fact Selection', () => {
  const rulesPath = path.resolve('extension/lib/data/area_rules.json');
  const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));

  describe('1. area_rules.json Schema Integrity', () => {
    it('has all 3 pilot city tiers defined properly', () => {
      assert.strictEqual(rules.city_tiers.bengaluru, 'metro');
      assert.strictEqual(rules.city_tiers.jaipur, 'smaller');
      assert.strictEqual(rules.city_tiers.jodhpur, 'smaller');
    });

    it('defines all five graded categories', () => {
      const requiredCategories = [
        'emergency_healthcare',
        'daily_supplies',
        'commute_transit',
        'safety_environment',
        'lifestyle_community'
      ];

      for (const cat of requiredCategories) {
        assert.ok(rules.categories[cat], `Missing category: ${cat}`);
        assert.ok(rules.categories[cat].title, `Missing title for category: ${cat}`);
        assert.ok(
          rules.categories[cat].checks && typeof rules.categories[cat].checks === 'object',
          `Missing checks in category: ${cat}`
        );
      }
    });

    it('enforces ascending threshold pairs [goodMax < okayMax] for both tiers', () => {
      for (const [catId, cat] of Object.entries(rules.categories)) {
        for (const [checkKey, checkDef] of Object.entries(cat.checks)) {
          assert.ok(Array.isArray(checkDef.metro), `${catId}.${checkKey} metro must be array`);
          assert.ok(Array.isArray(checkDef.smaller), `${catId}.${checkKey} smaller must be array`);

          assert.ok(
            checkDef.metro[0] < checkDef.metro[1],
            `${catId}.${checkKey} metro threshold must be ascending: ${checkDef.metro}`
          );
          assert.ok(
            checkDef.smaller[0] < checkDef.smaller[1],
            `${catId}.${checkKey} smaller threshold must be ascending: ${checkDef.smaller}`
          );
        }
      }
    });

    it('carries mandatory safety subtitle: "Nearby map facts, not crime data."', () => {
      const safetyCat = rules.categories.safety_environment;
      assert.strictEqual(safetyCat.subtitle, 'Nearby map facts, not crime data.');
    });
  });

  describe('2. City Tier Resolution', () => {
    it('resolves Bengaluru to metro', () => {
      assert.strictEqual(getCityTier('Bengaluru', rules), 'metro');
      assert.strictEqual(getCityTier('bengaluru', rules), 'metro');
    });

    it('resolves Jaipur and Jodhpur to smaller city tier', () => {
      assert.strictEqual(getCityTier('Jaipur', rules), 'smaller');
      assert.strictEqual(getCityTier('jodhpur', rules), 'smaller');
    });

    it('returns null for unlisted or unsupported cities', () => {
      assert.strictEqual(getCityTier('Mumbai', rules), null);
      assert.strictEqual(getCityTier('Delhi', rules), null);
      assert.strictEqual(getCityTier('', rules), null);
      assert.strictEqual(getCityTier(null, rules), null);
    });
  });

  describe('3. scoreCheck Boundaries & City Tier Sensitivity', () => {
    const hospitalRule = rules.categories.emergency_healthcare.checks.hospital_km;
    // metro: [2.0, 5.0], smaller: [3.0, 7.0]

    it('scores boundaries accurately in metro tier', () => {
      // Exactly at good cutoff
      assert.strictEqual(scoreCheck(2.0, hospitalRule, 'metro').score, 2);
      // Slightly above good cutoff
      assert.strictEqual(scoreCheck(2.1, hospitalRule, 'metro').score, 1);
      // Exactly at okay cutoff
      assert.strictEqual(scoreCheck(5.0, hospitalRule, 'metro').score, 1);
      // Above okay cutoff
      assert.strictEqual(scoreCheck(5.1, hospitalRule, 'metro').score, 0);
    });

    it('differentiates metro vs smaller city expectations', () => {
      // A hospital 2.5 km away is Okay in a metro, but Good in a smaller city
      const metroRes = scoreCheck(2.5, hospitalRule, 'metro');
      const smallerRes = scoreCheck(2.5, hospitalRule, 'smaller');

      assert.strictEqual(metroRes.score, 1);
      assert.strictEqual(smallerRes.score, 2);
    });

    it('handles null, undefined, and non-numeric values without throwing', () => {
      const missing = scoreCheck(null, hospitalRule, 'metro');
      assert.strictEqual(missing.score, 0);
      assert.strictEqual(missing.hasData, false);

      const nanRes = scoreCheck(NaN, hospitalRule, 'smaller');
      assert.strictEqual(nanRes.score, 0);
      assert.strictEqual(nanRes.hasData, false);
    });
  });

  describe('4. gradeCategory Aggregation & Threshold Cuts', () => {
    it('returns not_enough_data when fewer than 2 checks have data', () => {
      const checks = [
        { key: 'hospital_km', score: 2, hasData: true, km: 1.2, name: 'Apex Hospital' },
        { key: 'clinic_km', score: 0, hasData: false, km: null }
      ];

      const res = gradeCategory(checks, 'emergency_healthcare', 'metro', rules);
      assert.strictEqual(res.status, 'not_enough_data');
      assert.strictEqual(res.grade, null);
      assert.strictEqual(res.points, null);
    });

    it('computes Good grade (average >= 1.5) and 10 points when all checks score 2', () => {
      const checks = [
        { key: 'hospital_km', score: 2, hasData: true, km: 0.8, name: 'City Hospital' },
        { key: 'clinic_km', score: 2, hasData: true, km: 0.5, name: 'Apollo Clinic' },
        { key: 'pharmacy_km', score: 2, hasData: true, km: 0.2, name: 'MedPlus' }
      ];

      const res = gradeCategory(checks, 'emergency_healthcare', 'metro', rules);
      assert.strictEqual(res.status, 'ok');
      assert.strictEqual(res.grade, 'Good');
      assert.strictEqual(res.points, 10);
      assert.strictEqual(res.drawback, 'No major drawback found among the checks used.');
    });

    it('computes Okay grade (average >= 0.75 and < 1.5) and proper points', () => {
      const checks = [
        { key: 'hospital_km', score: 2, hasData: true, km: 1.5, name: 'Metro Hospital' },
        { key: 'clinic_km', score: 1, hasData: true, km: 2.2, name: 'Care Clinic' },
        { key: 'pharmacy_km', score: 0, hasData: true, km: 4.8, name: 'Far Chemist' }
      ];
      // average = (2 + 1 + 0) / 3 = 1.0 -> Okay, points = round(1.0 * 5) = 5

      const res = gradeCategory(checks, 'emergency_healthcare', 'metro', rules);
      assert.strictEqual(res.grade, 'Okay');
      assert.strictEqual(res.points, 5);
      // Fact is Metro Hospital (highest score = 2)
      assert.strictEqual(res.fact, 'Metro Hospital is 1.5 km away (straight line).');
      // Drawback is Far Chemist (lowest score = 0)
      assert.strictEqual(res.drawback, 'Far Chemist is 4.8 km away on the map (straight line).');
    });

    it('computes Weak grade (average < 0.75)', () => {
      const checks = [
        { key: 'hospital_km', score: 1, hasData: true, km: 4.5, name: 'Distant Hospital' },
        { key: 'clinic_km', score: 0, hasData: true, km: 3.2, name: 'Small Clinic' },
        { key: 'pharmacy_km', score: 0, hasData: true, km: 2.8, name: 'Outer Pharmacy' }
      ];
      // average = (1 + 0 + 0) / 3 = 0.333 -> Weak, points = round(0.333 * 5) = 2

      const res = gradeCategory(checks, 'emergency_healthcare', 'metro', rules);
      assert.strictEqual(res.grade, 'Weak');
      assert.strictEqual(res.points, 2);
    });

    it('breaks fact ties using smallest distance', () => {
      const checks = [
        { key: 'clinic_km', score: 2, hasData: true, km: 1.2, name: 'Clinic A' },
        { key: 'hospital_km', score: 2, hasData: true, km: 0.7, name: 'Hospital B' }
      ];

      const res = gradeCategory(checks, 'emergency_healthcare', 'metro', rules);
      assert.strictEqual(res.fact, 'Hospital B is 0.7 km away (straight line).');
    });

    it('reports missing drawback cleanly using "on the map" wording', () => {
      const checks = [
        { key: 'hospital_km', score: 2, hasData: true, km: 1.0, name: 'Apex Hospital' },
        { key: 'clinic_km', score: 1, hasData: true, km: 1.8, name: 'Health Clinic' },
        { key: 'pharmacy_km', score: 0, hasData: false, km: null, thing: 'pharmacy', searchRadiusKm: '1.5' }
      ];

      const res = gradeCategory(checks, 'emergency_healthcare', 'metro', rules);
      assert.strictEqual(res.drawback, 'No pharmacy found within 1.5 km on the map.');
    });
  });

  describe('5. Buyer Mode Wording Compliance Audit', () => {
    const FORBIDDEN_WORDS = [
      'safe',
      'unsafe',
      'dangerous',
      'scam',
      'overpriced',
      'cheap',
      'good deal',
      'bad area',
      'worth it'
    ];

    it('contains ZERO forbidden words in area_rules.json templates and titles', () => {
      const serialized = JSON.stringify(rules).toLowerCase();

      for (const word of FORBIDDEN_WORDS) {
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        assert.strictEqual(
          regex.test(serialized),
          false,
          `Forbidden word "${word}" found in area_rules.json`
        );
      }
    });
  });
});
