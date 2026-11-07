import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineKm,
  findLocality,
  findNeighbourLocalities,
  getLocalitiesForCity,
  normalizeCityName,
  CITY_LOCALITIES
} from '../extension/lib/localities.js';

describe('Slice S2: Localities Lookup, Haversine Distance & Neighbour Resolution', () => {
  describe('Haversine Distance Computation', () => {
    it('computes 0 km for identical coordinates', () => {
      assert.equal(haversineKm(12.9784, 77.6408, 12.9784, 77.6408), 0);
    });

    it('computes accurate straight-line distance between Indiranagar and Domlur (~1.95 km)', () => {
      // Indiranagar (12.9784, 77.6408) to Domlur (12.9609, 77.6387)
      const dist = haversineKm(12.9784, 77.6408, 12.9609, 77.6387);
      assert.ok(dist >= 1.8 && dist <= 2.1, `Expected ~1.95 km, got ${dist}`);
    });

    it('handles invalid or non-numeric inputs gracefully without throwing', () => {
      assert.equal(haversineKm(null, undefined, 'abc', 77), 0);
      assert.equal(haversineKm(NaN, 77.5, 12.9, 77.6), 0);
    });
  });

  describe('Locality Schema Validation (Bengaluru, Jaipur, Jodhpur)', () => {
    for (const city of ['bengaluru', 'jaipur', 'jodhpur']) {
      it(`validates schema integrity and unique names for ${city}`, () => {
        const list = getLocalitiesForCity(city);
        assert.ok(list.length >= 10, `${city} must contain at least 10 localities`);

        const names = new Set();
        for (const loc of list) {
          assert.ok(loc.name && typeof loc.name === 'string', 'name must be non-empty string');
          assert.ok(!names.has(loc.name), `Duplicate locality name: ${loc.name}`);
          names.add(loc.name);

          assert.ok(Array.isArray(loc.aliases) && loc.aliases.length >= 1, `${loc.name} must have aliases`);
          assert.ok(typeof loc.lat === 'number' && loc.lat > 0, `${loc.name} must have valid lat`);
          assert.ok(typeof loc.lng === 'number' && loc.lng > 0, `${loc.name} must have valid lng`);
          assert.ok(typeof loc.geohash5 === 'string' && loc.geohash5.length === 5, `${loc.name} must have 5-char geohash5`);
        }
      });
    }
  });

  describe('Locality Resolution (Name, Alias, and Nearest Centroid)', () => {
    it('resolves locality by exact name and alias', () => {
      const matchName = findLocality('Indiranagar', 'bengaluru');
      assert.equal(matchName?.name, 'Indiranagar');

      const matchAlias = findLocality('halasuru', 'bengaluru');
      assert.equal(matchAlias?.name, 'Ulsoor');

      const matchPal = findLocality('pal balaji', 'jodhpur');
      assert.equal(matchPal?.name, 'Pal Road');
    });

    it('resolves locality by text substring in property title', () => {
      const match = findLocality('Spacious 3 BHK Flat in Koramangala 4th Block, Bangalore', 'bengaluru');
      assert.equal(match?.name, 'Koramangala');
    });

    it('resolves locality by nearest coordinate centroid within 1.5 km', () => {
      // 500m away from Indiranagar centroid (12.9784, 77.6408)
      const nearbyPoint = { lat: 12.9800, lng: 77.6420 };
      const resolved = findLocality(nearbyPoint, 'bengaluru');
      assert.equal(resolved?.name, 'Indiranagar');
      assert.equal(resolved?.matchType, 'nearest_centroid');
      assert.ok(resolved?.distanceKm < 0.5);
    });

    it('returns null when coordinate centroid is farther than 1.5 km', () => {
      // Point in deep rural outskirts far from all registered centroids
      const farPoint = { lat: 12.5000, lng: 77.1000 };
      const resolved = findLocality(farPoint, 'bengaluru');
      assert.equal(resolved, null);
    });
  });

  describe('Sensible 3 km Neighbour Lists for 5 Real Flats per City (15 Cases)', () => {
    describe('Bengaluru (5 Flats)', () => {
      it('Flat 1 (Indiranagar): includes Domlur (~1.95 km) and Ulsoor (~1.37 km)', () => {
        const res = findNeighbourLocalities('Indiranagar', 'bengaluru', 3.0);
        assert.equal(res.targetLocality?.name, 'Indiranagar');
        const names = res.includedLocalities.map(l => l.name);
        assert.ok(names.includes('Indiranagar'), 'must include itself');
        assert.ok(names.includes('Domlur'), 'must include Domlur');
        assert.ok(names.includes('Ulsoor'), 'must include Ulsoor');
        // Excludes far localities (> 3 km)
        assert.ok(!names.includes('Electronic City'));
        assert.ok(!names.includes('Whitefield'));
      });

      it('Flat 2 (Koramangala): includes BTM Layout (~2.55 km)', () => {
        const res = findNeighbourLocalities('Koramangala', 'bengaluru', 3.0);
        const names = res.includedLocalities.map(l => l.name);
        assert.ok(names.includes('Koramangala'));
        assert.ok(names.includes('BTM Layout'));
      });

      it('Flat 3 (Jayanagar): includes JP Nagar (~2.73 km) and excludes BTM Layout (>3.2 km)', () => {
        const res = findNeighbourLocalities('Jayanagar', 'bengaluru', 3.0);
        const names = res.includedLocalities.map(l => l.name);
        assert.ok(names.includes('Jayanagar'));
        assert.ok(names.includes('JP Nagar'));
        assert.ok(!names.includes('BTM Layout'), 'BTM is 3.26 km away, should be excluded');
      });

      it('Flat 4 (Malleshwaram): includes Rajajinagar (~1.33 km)', () => {
        const res = findNeighbourLocalities('Malleshwaram', 'bengaluru', 3.0);
        const names = res.includedLocalities.map(l => l.name);
        assert.ok(names.includes('Malleshwaram'));
        assert.ok(names.includes('Rajajinagar'));
      });

      it('Flat 5 (Domlur): includes Indiranagar and Ulsoor', () => {
        const res = findNeighbourLocalities('Domlur', 'bengaluru', 3.0);
        const names = res.includedLocalities.map(l => l.name);
        assert.ok(names.includes('Domlur'));
        assert.ok(names.includes('Indiranagar'));
        assert.ok(names.includes('Ulsoor'));
      });
    });

    describe('Jaipur (5 Flats)', () => {
      it('Flat 1 (Vaishali Nagar): includes Chitrakoot (~0.99 km) and Khatipura (~1.68 km)', () => {
        const res = findNeighbourLocalities('Vaishali Nagar', 'jaipur', 3.0);
        const names = res.includedLocalities.map(l => l.name);
        assert.ok(names.includes('Vaishali Nagar'));
        assert.ok(names.includes('Chitrakoot'));
        assert.ok(names.includes('Khatipura'));
        assert.ok(!names.includes('Jagatpura'));
      });

      it('Flat 2 (Chitrakoot): includes Vaishali Nagar (~0.99 km)', () => {
        const res = findNeighbourLocalities('Chitrakoot', 'jaipur', 3.0);
        const names = res.includedLocalities.map(l => l.name);
        assert.ok(names.includes('Chitrakoot'));
        assert.ok(names.includes('Vaishali Nagar'));
      });

      it('Flat 3 (Mansarovar): includes Gopalpura Bypass (~1.78 km)', () => {
        const res = findNeighbourLocalities('Mansarovar', 'jaipur', 3.0);
        const names = res.includedLocalities.map(l => l.name);
        assert.ok(names.includes('Mansarovar'));
        assert.ok(names.includes('Gopalpura Bypass'));
      });

      it('Flat 4 (C-Scheme): includes Bapu Nagar (~2.78 km) and excludes Raja Park (>3.4 km)', () => {
        const res = findNeighbourLocalities('C-Scheme', 'jaipur', 3.0);
        const names = res.includedLocalities.map(l => l.name);
        assert.ok(names.includes('C-Scheme'));
        assert.ok(names.includes('Bapu Nagar'));
        assert.ok(!names.includes('Raja Park'), 'Raja Park is 3.44 km away, should be excluded');
      });

      it('Flat 5 (Malviya Nagar): includes Tonk Road (~2.41 km)', () => {
        const res = findNeighbourLocalities('Malviya Nagar', 'jaipur', 3.0);
        const names = res.includedLocalities.map(l => l.name);
        assert.ok(names.includes('Malviya Nagar'));
        assert.ok(names.includes('Tonk Road'));
      });
    });

    describe('Jodhpur (5 Flats)', () => {
      it('Flat 1 (Shastri Nagar): includes Sardarpura (~1.15 km) and Pratap Nagar (~1.67 km)', () => {
        const res = findNeighbourLocalities('Shastri Nagar', 'jodhpur', 3.0);
        const names = res.includedLocalities.map(l => l.name);
        assert.ok(names.includes('Shastri Nagar'));
        assert.ok(names.includes('Sardarpura'));
        assert.ok(names.includes('Pratap Nagar'));
        assert.ok(!names.includes('Kudi Bhagtasni'));
      });

      it('Flat 2 (Sardarpura): includes Shastri Nagar (~1.15 km) and Ratanada (~2.36 km)', () => {
        const res = findNeighbourLocalities('Sardarpura', 'jodhpur', 3.0);
        const names = res.includedLocalities.map(l => l.name);
        assert.ok(names.includes('Sardarpura'));
        assert.ok(names.includes('Shastri Nagar'));
        assert.ok(names.includes('Ratanada'));
      });

      it('Flat 3 (Pal Road): includes Khema Ka Kuwa (~1.25 km) and Chopasni Housing Board (~2.99 km)', () => {
        const res = findNeighbourLocalities('Pal Road', 'jodhpur', 3.0);
        const names = res.includedLocalities.map(l => l.name);
        assert.ok(names.includes('Pal Road'));
        assert.ok(names.includes('Khema Ka Kuwa'));
        assert.ok(names.includes('Chopasni Housing Board'));
      });

      it('Flat 4 (Paota): includes BJS Colony (~1.76 km) and excludes Sardarpura (>3.7 km)', () => {
        const res = findNeighbourLocalities('Paota', 'jodhpur', 3.0);
        const names = res.includedLocalities.map(l => l.name);
        assert.ok(names.includes('Paota'));
        assert.ok(names.includes('BJS Colony'));
        assert.ok(!names.includes('Sardarpura'), 'Sardarpura is 3.75 km away, should be excluded');
      });

      it('Flat 5 (Khema Ka Kuwa): includes Pal Road (~1.25 km)', () => {
        const res = findNeighbourLocalities('Khema Ka Kuwa', 'jodhpur', 3.0);
        const names = res.includedLocalities.map(l => l.name);
        assert.ok(names.includes('Khema Ka Kuwa'));
        assert.ok(names.includes('Pal Road'));
      });
    });
  });
});
