import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { parseOverpassResponse } from '../extension/lib/area/osm_client.js';
import {
  evaluateLifestyleCommunity,
  evaluateAllCategories
} from '../extension/lib/area/categories.js';

describe('Slice S7e: Lifestyle & Community Category Extractor', () => {
  const fixturesDir = path.resolve('fixtures/overpass');

  function loadParsedFixture(file, lat, lng) {
    const raw = fs.readFileSync(path.join(fixturesDir, file), 'utf8');
    return parseOverpassResponse(raw, lat, lng);
  }

  describe('1. Pilot City Fixture Evaluations', () => {
    it('evaluates Bengaluru Indiranagar with Good lifestyle grade (Park + Cafes + Gyms)', () => {
      const parsed = loadParsedFixture('bengaluru_indiranagar.json', 12.978, 77.641);
      const res = evaluateLifestyleCommunity(parsed.elements, 'metro');

      assert.strictEqual(res.status, 'ok');
      assert.strictEqual(res.grade, 'Good');
      assert.strictEqual(res.points, 9);
      assert.strictEqual(res.checks.length, 4);
      assert.ok(res.fact.length > 0);
    });

    it('evaluates Jaipur C-Scheme under smaller city tier with Central Park & Cafes', () => {
      const parsed = loadParsedFixture('jaipur_cscheme.json', 26.912, 75.802);
      const res = evaluateLifestyleCommunity(parsed.elements, 'smaller');

      assert.strictEqual(res.status, 'ok');
      assert.strictEqual(res.grade, 'Good');
      assert.ok(res.points >= 8);
    });

    it('evaluates Jodhpur Sardarpura with Nehru Park, Cafe & Gym', () => {
      const parsed = loadParsedFixture('jodhpur_sardarpura.json', 26.279, 73.013);
      const res = evaluateLifestyleCommunity(parsed.elements, 'smaller');

      assert.strictEqual(res.status, 'ok');
      assert.strictEqual(res.grade, 'Good');
      assert.ok(res.points >= 8);
    });

    it('evaluates empty_map.json and returns not_enough_data', () => {
      const parsed = loadParsedFixture('empty_map.json', 26.500, 73.500);
      const res = evaluateLifestyleCommunity(parsed.elements, 'smaller');

      assert.strictEqual(res.status, 'not_enough_data');
      assert.strictEqual(res.grade, null);
    });
  });

  describe('2. evaluateAllCategories Full Pipeline Integration', () => {
    it('produces all 5 complete categories with grades and facts across all pilot cities', () => {
      const parsed = loadParsedFixture('bengaluru_koramangala.json', 12.935, 77.625);
      const all = evaluateAllCategories(parsed.elements, 'metro');

      const expectedCategories = [
        'emergency_healthcare',
        'daily_supplies',
        'commute_transit',
        'safety_environment',
        'lifestyle_community'
      ];

      for (const cat of expectedCategories) {
        assert.ok(all[cat], `Missing category: ${cat}`);
        assert.strictEqual(all[cat].status, 'ok');
        assert.ok(['Good', 'Okay', 'Weak'].includes(all[cat].grade));
        assert.ok(typeof all[cat].points === 'number');
        assert.ok(all[cat].points >= 0 && all[cat].points <= 10);
        assert.ok(all[cat].fact.length > 0);
        assert.ok(all[cat].drawback.length > 0);
      }
    });
  });
});
