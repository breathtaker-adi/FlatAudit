import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildOverpassQuery,
  parseOverpassResponse,
  queryOverpass,
  canExecuteQuery,
  resetRateLimiter,
  OSM_ATTRIBUTION
} from '../extension/lib/area/osm_client.js';

describe('Slice S5: OpenStreetMap Overpass Client & Density Engine', () => {
  beforeEach(() => {
    resetRateLimiter();
  });

  describe('1. Overpass Query Builder', () => {
    it('builds combined query with rounded 3-decimal coordinates and 25s timeout', () => {
      const query = buildOverpassQuery(12.97841, 77.64082);
      assert.ok(query.includes('[out:json][timeout:25];'));
      assert.ok(query.includes('12.978,77.641'));
      assert.ok(query.includes('out center tags;'));
      assert.ok(query.includes('amenity'));
      assert.ok(query.includes('hospital'));
      assert.ok(query.includes('police'));
      assert.ok(query.includes('bus_stop'));
      assert.ok(query.includes('railway'));
      assert.ok(query.includes('supermarket'));
    });

    it('rejects invalid or non-numeric coordinates gracefully', () => {
      assert.strictEqual(buildOverpassQuery(null, 77.64), null);
      assert.strictEqual(buildOverpassQuery('invalid', 'xyz'), null);
    });
  });

  describe('2. Fixture Parsing & Real Locality Validation', () => {
    const fixturesDir = path.resolve('fixtures/overpass');

    const realFixtures = [
      { file: 'bengaluru_indiranagar.json', lat: 12.978, lng: 77.641, city: 'Bengaluru' },
      { file: 'bengaluru_koramangala.json', lat: 12.935, lng: 77.625, city: 'Bengaluru' },
      { file: 'jaipur_cscheme.json', lat: 26.912, lng: 75.802, city: 'Jaipur' },
      { file: 'jaipur_mansarovar.json', lat: 26.853, lng: 75.765, city: 'Jaipur' },
      { file: 'jodhpur_sardarpura.json', lat: 26.279, lng: 73.013, city: 'Jodhpur' },
      { file: 'jodhpur_ratanada.json', lat: 26.271, lng: 73.036, city: 'Jodhpur' }
    ];

    for (const item of realFixtures) {
      it(`parses ${item.file} (${item.city}) with high confidence & valid attribution`, () => {
        const raw = fs.readFileSync(path.join(fixturesDir, item.file), 'utf8');
        const parsed = parseOverpassResponse(raw, item.lat, item.lng);

        assert.strictEqual(parsed.status, 'ok');
        assert.strictEqual(parsed.confidence, 'high');
        assert.ok(parsed.density1km >= 15);
        assert.ok(parsed.elements.length >= 15);
        assert.strictEqual(parsed.attribution, OSM_ATTRIBUTION);

        // Verify distance calculation on elements
        const first = parsed.elements[0];
        assert.ok(typeof first.distKm === 'number');
        assert.ok(first.distKm >= 0);
        assert.ok(first.tags);
      });
    }

    it('parses empty_map.json and returns thin_map status', () => {
      const raw = fs.readFileSync(path.join(fixturesDir, 'empty_map.json'), 'utf8');
      const parsed = parseOverpassResponse(raw, 26.500, 73.500);

      assert.strictEqual(parsed.status, 'thin_map');
      assert.strictEqual(parsed.confidence, 'low');
      assert.strictEqual(parsed.density1km, 0);
      assert.strictEqual(parsed.elementsCount, 0);
      assert.strictEqual(parsed.elements.length, 0);
    });

    it('parses half_tagged_map.json and returns low confidence (< 15 items)', () => {
      const raw = fs.readFileSync(path.join(fixturesDir, 'half_tagged_map.json'), 'utf8');
      const parsed = parseOverpassResponse(raw, 26.600, 73.600);

      assert.strictEqual(parsed.status, 'ok');
      assert.strictEqual(parsed.confidence, 'low');
      assert.strictEqual(parsed.density1km, 5);
      assert.strictEqual(parsed.elementsCount, 7);
    });
  });

  describe('3. Failure States & Malformed Inputs (Never Guessing)', () => {
    it('returns unavailable on invalid JSON string', () => {
      const res = parseOverpassResponse('<html>502 Bad Gateway</html>', 12.97, 77.59);
      assert.strictEqual(res.status, 'unavailable');
      assert.strictEqual(res.elements.length, 0);
    });

    it('returns unavailable on null or missing elements array', () => {
      assert.strictEqual(parseOverpassResponse(null, 12.97, 77.59).status, 'unavailable');
      assert.strictEqual(parseOverpassResponse({}, 12.97, 77.59).status, 'unavailable');
      assert.strictEqual(parseOverpassResponse({ elements: 'not-array' }, 12.97, 77.59).status, 'unavailable');
    });

    it('returns unavailable when center coordinates are invalid', () => {
      const res = parseOverpassResponse({ elements: [] }, null, undefined);
      assert.strictEqual(res.status, 'unavailable');
    });
  });

  describe('4. Rate Limiter (1 query per 5 seconds & 1 in-flight)', () => {
    it('allows first query, blocks within 5 seconds, allows after cooldown', async () => {
      const t0 = 100000;
      assert.strictEqual(canExecuteQuery(t0), true);

      // Execute query at t0
      await queryOverpass(
        12.978,
        77.641,
        async () => ({
          ok: true,
          json: async () => ({ elements: [] })
        }),
        t0
      );

      // Immediate attempt at t0 + 2000 ms should be blocked
      assert.strictEqual(canExecuteQuery(t0 + 2000), false);

      // Attempt at t0 + 4999 ms should be blocked
      assert.strictEqual(canExecuteQuery(t0 + 4999), false);

      // Attempt at t0 + 5001 ms should be allowed
      assert.strictEqual(canExecuteQuery(t0 + 5001), true);
    });
  });

  describe('5. Primary & Mirror Fallback Flow', () => {
    it('switches to fallback mirror when primary returns 502', async () => {
      let callCount = 0;
      const calledUrls = [];

      const mockFetch = async (url) => {
        callCount++;
        calledUrls.push(url);
        if (url.includes('overpass-api.de')) {
          // Primary failure
          return { ok: false, status: 502 };
        }
        // Fallback mirror succeeds
        return {
          ok: true,
          status: 200,
          json: async () => ({
            elements: [
              {
                id: 999,
                lat: 12.9781,
                lon: 77.6409,
                tags: { amenity: 'hospital', name: 'Fallback Hospital' }
              }
            ]
          })
        };
      };

      const result = await queryOverpass(12.978, 77.641, mockFetch);
      assert.strictEqual(callCount, 2);
      assert.ok(calledUrls[0].includes('overpass-api.de'));
      assert.ok(calledUrls[1].includes('overpass.kumi.systems'));
      assert.strictEqual(result.elements.length, 1);
      assert.strictEqual(result.elements[0].tags.name, 'Fallback Hospital');
    });

    it('returns unavailable when all endpoints fail or time out', async () => {
      const mockFetchFail = async () => {
        throw new Error('Network timeout');
      };

      const result = await queryOverpass(12.978, 77.641, mockFetchFail);
      assert.strictEqual(result.status, 'unavailable');
    });
  });
});
