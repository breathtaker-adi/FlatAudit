import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { parseOverpassResponse } from '../extension/lib/area/osm_client.js';
import { evaluateEmergencyHealthcare } from '../extension/lib/area/categories.js';

describe('Slice S7a: Emergency & Healthcare Category Extractor', () => {
  const fixturesDir = path.resolve('fixtures/overpass');

  function loadParsedFixture(file, lat, lng) {
    const raw = fs.readFileSync(path.join(fixturesDir, file), 'utf8');
    return parseOverpassResponse(raw, lat, lng);
  }

  describe('1. Pilot City Fixture Evaluations', () => {
    it('evaluates Bengaluru Indiranagar with Good healthcare grade', () => {
      const parsed = loadParsedFixture('bengaluru_indiranagar.json', 12.978, 77.641);
      const res = evaluateEmergencyHealthcare(parsed.elements, 'metro');

      assert.strictEqual(res.status, 'ok');
      assert.strictEqual(res.grade, 'Good');
      assert.strictEqual(res.points, 10);
      assert.strictEqual(res.checks.length, 3);
      // Fact is nearest highest-scoring facility (MedPlus Pharmacy at ~0.1 km)
      assert.ok(res.fact.includes('MedPlus Pharmacy') || res.fact.includes('Hospital') || res.fact.includes('Clinic'));
    });

    it('evaluates Bengaluru Koramangala with Good healthcare grade', () => {
      const parsed = loadParsedFixture('bengaluru_koramangala.json', 12.935, 77.625);
      const res = evaluateEmergencyHealthcare(parsed.elements, 'metro');

      assert.strictEqual(res.status, 'ok');
      assert.strictEqual(res.grade, 'Good');
      assert.ok(res.points >= 8);
      assert.ok(res.fact.includes('Pharmacy') || res.fact.includes('Clinic') || res.fact.includes('Hospital'));
    });

    it('evaluates Jaipur C-Scheme under smaller city tier', () => {
      const parsed = loadParsedFixture('jaipur_cscheme.json', 26.912, 75.802);
      const res = evaluateEmergencyHealthcare(parsed.elements, 'smaller');

      assert.strictEqual(res.status, 'ok');
      assert.strictEqual(res.grade, 'Good');
      assert.ok(res.points >= 8);
      assert.ok(res.fact.includes('Pharmacy') || res.fact.includes('Clinic') || res.fact.includes('Hospital'));
    });

    it('evaluates Jodhpur Sardarpura under smaller city tier', () => {
      const parsed = loadParsedFixture('jodhpur_sardarpura.json', 26.279, 73.013);
      const res = evaluateEmergencyHealthcare(parsed.elements, 'smaller');

      assert.strictEqual(res.status, 'ok');
      assert.strictEqual(res.grade, 'Good');
      assert.ok(res.points >= 8);
      assert.ok(res.fact.includes('Chemist') || res.fact.includes('Hospital') || res.fact.includes('Pharmacy'));
    });

    it('evaluates empty_map.json and returns not_enough_data', () => {
      const parsed = loadParsedFixture('empty_map.json', 26.500, 73.500);
      const res = evaluateEmergencyHealthcare(parsed.elements, 'smaller');

      assert.strictEqual(res.status, 'not_enough_data');
      assert.strictEqual(res.grade, null);
      assert.strictEqual(res.points, null);
    });
  });

  describe('2. Missing Checks & Drawback Wording', () => {
    it('accurately reports missing hospital within radius when none exist', () => {
      const elements = [
        { id: 1, distKm: 0.3, tags: { amenity: 'pharmacy', name: 'Local Chemist' } },
        { id: 2, distKm: 0.8, tags: { amenity: 'clinic', name: 'Community Clinic' } }
      ];

      const res = evaluateEmergencyHealthcare(elements, 'metro');
      assert.strictEqual(res.status, 'ok');
      // Drawback should state missing hospital
      assert.ok(res.drawback.includes('No hospital found within 3 km on the map.'));
    });
  });
});
