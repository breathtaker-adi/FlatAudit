import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { parseOverpassResponse } from '../extension/lib/area/osm_client.js';
import { evaluateCommuteTransit } from '../extension/lib/area/categories.js';

describe('Slice S7c: Commute & Transit Category Extractor', () => {
  const fixturesDir = path.resolve('fixtures/overpass');

  function loadParsedFixture(file, lat, lng) {
    const raw = fs.readFileSync(path.join(fixturesDir, file), 'utf8');
    return parseOverpassResponse(raw, lat, lng);
  }

  describe('1. Pilot City Fixture Evaluations', () => {
    it('evaluates Bengaluru Indiranagar with Good commute grade (Metro + Bus + 100ft Rd)', () => {
      const parsed = loadParsedFixture('bengaluru_indiranagar.json', 12.978, 77.641);
      const res = evaluateCommuteTransit(parsed.elements, 'metro');

      assert.strictEqual(res.status, 'ok');
      assert.strictEqual(res.grade, 'Good');
      assert.strictEqual(res.points, 10);
      assert.strictEqual(res.checks.length, 3);
      assert.ok(res.fact.includes('Indiranagar Metro Station') || res.fact.includes('Road') || res.fact.includes('Bus Stop'));
    });

    it('evaluates Jaipur C-Scheme under smaller city tier', () => {
      const parsed = loadParsedFixture('jaipur_cscheme.json', 26.912, 75.802);
      const res = evaluateCommuteTransit(parsed.elements, 'smaller');

      assert.strictEqual(res.status, 'ok');
      assert.strictEqual(res.grade, 'Good');
      assert.ok(res.points >= 8);
    });

    it('evaluates Jodhpur Sardarpura with Jodhpur Junction & Main Road', () => {
      const parsed = loadParsedFixture('jodhpur_sardarpura.json', 26.279, 73.013);
      const res = evaluateCommuteTransit(parsed.elements, 'smaller');

      assert.strictEqual(res.status, 'ok');
      assert.strictEqual(res.grade, 'Good');
      assert.ok(res.points >= 8);
    });

    it('evaluates empty_map.json and returns not_enough_data', () => {
      const parsed = loadParsedFixture('empty_map.json', 26.500, 73.500);
      const res = evaluateCommuteTransit(parsed.elements, 'smaller');

      assert.strictEqual(res.status, 'not_enough_data');
      assert.strictEqual(res.grade, null);
    });
  });

  describe('2. Missing Checks & Wording Compliance', () => {
    it('accurately identifies missing metro/rail within radius in rural/outer area', () => {
      const elements = [
        { id: 1, distKm: 0.3, tags: { highway: 'bus_stop', name: 'Village Bus Stop' } },
        { id: 2, distKm: 0.2, tags: { highway: 'secondary', name: 'State Highway' } }
      ];

      const res = evaluateCommuteTransit(elements, 'metro');
      assert.strictEqual(res.status, 'ok');
      assert.ok(res.drawback.includes('No metro or rail station found within 3 km on the map.'));
    });
  });
});
