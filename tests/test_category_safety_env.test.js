import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { parseOverpassResponse } from '../extension/lib/area/osm_client.js';
import { evaluateSafetyEnvironment, isLateNightOpen } from '../extension/lib/area/categories.js';

describe('Slice S7d: Safety & Environment Category Extractor', () => {
  const fixturesDir = path.resolve('fixtures/overpass');

  function loadParsedFixture(file, lat, lng) {
    const raw = fs.readFileSync(path.join(fixturesDir, file), 'utf8');
    return parseOverpassResponse(raw, lat, lng);
  }

  describe('1. Mandatory Label & Safety Disclaimer', () => {
    it('always attaches mandatory "Nearby map facts, not crime data." label', () => {
      const parsed = loadParsedFixture('bengaluru_indiranagar.json', 12.978, 77.641);
      const res = evaluateSafetyEnvironment(parsed.elements, 'metro');

      assert.strictEqual(res.subtitle, 'Nearby map facts, not crime data.');
    });
  });

  describe('2. Pilot City Fixture Evaluations', () => {
    it('evaluates Bengaluru Indiranagar with Police, Main Road & Park', () => {
      const parsed = loadParsedFixture('bengaluru_indiranagar.json', 12.978, 77.641);
      const res = evaluateSafetyEnvironment(parsed.elements, 'metro');

      assert.strictEqual(res.status, 'ok');
      assert.strictEqual(res.grade, 'Good');
      assert.ok(res.points >= 8);
      assert.ok(res.fact.includes('Indiranagar Police Station') || res.fact.includes('Road') || res.fact.includes('Park'));
    });

    it('evaluates Jaipur C-Scheme under smaller city tier with Ashok Nagar Police', () => {
      const parsed = loadParsedFixture('jaipur_cscheme.json', 26.912, 75.802);
      const res = evaluateSafetyEnvironment(parsed.elements, 'smaller');

      assert.strictEqual(res.status, 'ok');
      assert.strictEqual(res.grade, 'Good');
      assert.ok(res.points >= 8);
    });

    it('evaluates Jodhpur Sardarpura with Sardarpura Police & Nehru Park', () => {
      const parsed = loadParsedFixture('jodhpur_sardarpura.json', 26.279, 73.013);
      const res = evaluateSafetyEnvironment(parsed.elements, 'smaller');

      assert.strictEqual(res.status, 'ok');
      assert.strictEqual(res.grade, 'Good');
      assert.ok(res.points >= 8);
    });
  });

  describe('3. Night Data Honesty & Late-Night Helper', () => {
    it('identifies late closing hours and 24/7 patterns', () => {
      assert.strictEqual(isLateNightOpen('24/7'), true);
      assert.strictEqual(isLateNightOpen('Mo-Su 08:00-23:30'), true);
      assert.strictEqual(isLateNightOpen('10:00-01:00'), true);
      assert.strictEqual(isLateNightOpen('10:00-21:00'), false);
      assert.strictEqual(isLateNightOpen(''), false);
      assert.strictEqual(isLateNightOpen(null), false);
    });

    it('displays exact "Not enough night data on the map." when lit tags < 10 and no late venues', () => {
      const elements = [
        { id: 1, distKm: 0.5, tags: { amenity: 'police', name: 'Rural Police' } },
        { id: 2, distKm: 0.2, tags: { highway: 'primary', name: 'Main Road' } }
      ];

      const res = evaluateSafetyEnvironment(elements, 'metro');
      assert.strictEqual(res.nightFacts.note, 'Not enough night data on the map.');
    });
  });

  describe('4. Environmental Notes & Noise Proximity', () => {
    it('detects railway track within 150m as a noise proximity note', () => {
      const elements = [
        { id: 1, distKm: 0.8, tags: { amenity: 'police', name: 'Central Police' } },
        { id: 2, distKm: 0.4, tags: { highway: 'primary', name: 'Trunk Road' } },
        { id: 3, distKm: 0.1, tags: { railway: 'rail', name: 'Main Railway Line' } } // 100m away
      ];

      const res = evaluateSafetyEnvironment(elements, 'metro');
      assert.ok(res.environmentNotes.noiseSource);
      assert.strictEqual(res.environmentNotes.noiseSource.name, 'Main Railway Line');
    });

    it('detects industrial land within 1 km', () => {
      const elements = [
        { id: 1, distKm: 0.8, tags: { amenity: 'police', name: 'Station' } },
        { id: 2, distKm: 0.4, tags: { highway: 'primary', name: 'Road' } },
        { id: 3, distKm: 0.7, tags: { landuse: 'industrial', name: 'Industrial Estate' } }
      ];

      const res = evaluateSafetyEnvironment(elements, 'metro');
      assert.ok(res.environmentNotes.industrialLand);
      assert.strictEqual(res.environmentNotes.industrialLand.name, 'Industrial Estate');
    });
  });

  describe('5. Buyer Mode Forbidden Words Scan', () => {
    it('contains ZERO forbidden words in evaluated safety result', () => {
      const parsed = loadParsedFixture('bengaluru_indiranagar.json', 12.978, 77.641);
      const res = evaluateSafetyEnvironment(parsed.elements, 'metro');

      const serialized = JSON.stringify(res).toLowerCase();
      const forbidden = ['safe', 'unsafe', 'dangerous', 'scam', 'overpriced', 'cheap', 'good deal', 'bad area', 'worth it'];

      for (const word of forbidden) {
        // "safe" could appear inside substring of other words, test with word boundaries
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        assert.strictEqual(
          regex.test(serialized),
          false,
          `Forbidden word "${word}" found in safety result: ${serialized}`
        );
      }
    });
  });
});
