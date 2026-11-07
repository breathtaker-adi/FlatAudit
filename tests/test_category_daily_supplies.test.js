import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { parseOverpassResponse } from '../extension/lib/area/osm_client.js';
import { evaluateDailySupplies } from '../extension/lib/area/categories.js';

describe('Slice S7b: Daily Supplies & Services Category Extractor', () => {
  const fixturesDir = path.resolve('fixtures/overpass');

  function loadParsedFixture(file, lat, lng) {
    const raw = fs.readFileSync(path.join(fixturesDir, file), 'utf8');
    return parseOverpassResponse(raw, lat, lng);
  }

  describe('1. Pilot City Fixture Evaluations', () => {
    it('evaluates Bengaluru Indiranagar with Good daily supplies grade', () => {
      const parsed = loadParsedFixture('bengaluru_indiranagar.json', 12.978, 77.641);
      const res = evaluateDailySupplies(parsed.elements, 'metro');

      assert.strictEqual(res.status, 'ok');
      assert.strictEqual(res.grade, 'Good');
      assert.strictEqual(res.points, 10);
      assert.strictEqual(res.checks.length, 4);
      assert.ok(res.fact.length > 0);
    });

    it('evaluates Bengaluru Koramangala with Good daily supplies grade', () => {
      const parsed = loadParsedFixture('bengaluru_koramangala.json', 12.935, 77.625);
      const res = evaluateDailySupplies(parsed.elements, 'metro');

      assert.strictEqual(res.status, 'ok');
      assert.strictEqual(res.grade, 'Good');
      assert.ok(res.points >= 8);
    });

    it('evaluates Jaipur C-Scheme under smaller city tier', () => {
      const parsed = loadParsedFixture('jaipur_cscheme.json', 26.912, 75.802);
      const res = evaluateDailySupplies(parsed.elements, 'smaller');

      assert.strictEqual(res.status, 'ok');
      assert.strictEqual(res.grade, 'Good');
      assert.ok(res.points >= 8);
    });

    it('evaluates Jodhpur Sardarpura under smaller city tier', () => {
      const parsed = loadParsedFixture('jodhpur_sardarpura.json', 26.279, 73.013);
      const res = evaluateDailySupplies(parsed.elements, 'smaller');

      assert.strictEqual(res.status, 'ok');
      assert.strictEqual(res.grade, 'Good');
      assert.ok(res.points >= 8);
    });

    it('evaluates empty_map.json and returns not_enough_data', () => {
      const parsed = loadParsedFixture('empty_map.json', 26.500, 73.500);
      const res = evaluateDailySupplies(parsed.elements, 'smaller');

      assert.strictEqual(res.status, 'not_enough_data');
      assert.strictEqual(res.grade, null);
    });
  });

  describe('2. Missing Checks & Wording Compliance', () => {
    it('accurately identifies missing greengrocer when not in tags', () => {
      const elements = [
        { id: 1, distKm: 0.2, tags: { shop: 'supermarket', name: 'Supermarket Store' } },
        { id: 2, distKm: 0.4, tags: { amenity: 'atm', name: 'Bank ATM' } },
        { id: 3, distKm: 0.3, tags: { amenity: 'pharmacy', name: 'Chemist' } }
      ];

      const res = evaluateDailySupplies(elements, 'metro');
      assert.strictEqual(res.status, 'ok');
      // Drawback should identify missing greengrocer
      assert.ok(res.drawback.includes('No greengrocer found within 2 km on the map.'));
    });
  });
});
