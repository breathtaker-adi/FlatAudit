import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  encodeGeohash,
  decodeGeohash,
  parseCoordinatesFromPage
} from '../extension/lib/geohash.js';

import {
  computeMedian,
  computeMAD,
  robustZScore,
  computePeerAggregates,
  getBenchmark,
  isValidMarketPack
} from '../extension/lib/benchmarks.js';

import { evaluatePriceSignal } from '../extension/lib/signals.js';

describe('Geohash and Coordinate Extraction Engine', () => {
  it('encodes and decodes standard latitude/longitude coordinates to geohash', () => {
    // Indiranagar, Bengaluru ~ 12.9719, 77.6412 -> tdr1yc
    const hash = encodeGeohash(12.9719, 77.6412, 6);
    assert.equal(hash.length, 6);
    assert.match(hash, /^tdr1/);

    // Decode check
    const decoded = decodeGeohash(hash);
    assert.ok(Math.abs(decoded.lat - 12.9719) < 0.05);
    assert.ok(Math.abs(decoded.lng - 77.6412) < 0.05);
  });

  it('extracts coordinates from JSON-LD Schema.org GeoCoordinates in DOM', () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Apartment",
            "name": "Luxury 2BHK",
            "geo": {
              "@type": "GeoCoordinates",
              "latitude": 19.1176,
              "longitude": 72.9060
            }
          }
          </script>
        </head>
        <body></body>
      </html>
    `;
    const dom = new JSDOM(html);
    const geo = parseCoordinatesFromPage(dom.window.document);
    assert.ok(geo);
    assert.equal(geo.lat, 19.1176);
    assert.equal(geo.lng, 72.9060);
    assert.match(geo.geohash, /^te7u/);
  });

  it('extracts coordinates from map links and meta tags', () => {
    const html = `
      <html>
        <head>
          <meta property="place:location:latitude" content="28.4986">
          <meta property="place:location:longitude" content="77.0878">
        </head>
        <body></body>
      </html>
    `;
    const dom = new JSDOM(html);
    const geo = parseCoordinatesFromPage(dom.window.document);
    assert.ok(geo);
    assert.equal(geo.lat, 28.4986);
    assert.equal(geo.lng, 77.0878);
    assert.match(geo.geohash, /^ttn/);
  });
});

describe('Robust Statistics Math', () => {
  it('computes exact median for odd and even sets', () => {
    assert.equal(computeMedian([10, 20, 30]), 20);
    assert.equal(computeMedian([10, 20, 30, 40]), 25);
    assert.equal(computeMedian([42000]), 42000);
  });

  it('computes Median Absolute Deviation (MAD)', () => {
    // Array: [1, 2, 3, 4, 5, 6, 7] -> median = 4
    // Deviations from 4: [3, 2, 1, 0, 1, 2, 3] -> sorted: [0, 1, 1, 2, 2, 3, 3] -> median = 2
    const mad = computeMAD([1, 2, 3, 4, 5, 6, 7]);
    assert.equal(mad, 2);
  });

  it('calculates robust z-scores without inflating under outliers', () => {
    // median: 40000, mad: 4000
    // value 20000 -> (20000 - 40000) / (1.4826 * 4000) = -20000 / 5930.4 = -3.37
    const z = robustZScore(20000, 40000, 4000);
    assert.ok(z < -3.0);
  });
});

describe('Dynamic Benchmark Fallback Ladder', () => {
  it('Level 1: evaluates peer-page benchmark when search cards are provided', () => {
    const peerCards = [
      { rent: 40000, bhk: 2, area_sqft: 1200, deposit: 160000 },
      { rent: 42000, bhk: 2, area_sqft: 1250, deposit: 150000 },
      { rent: 39000, bhk: 2, area_sqft: 1100, deposit: 120000 },
      { rent: 41000, bhk: 2, area_sqft: 1200, deposit: 150000 },
      { rent: 43000, bhk: 2, area_sqft: 1300, deposit: 180000 },
      { rent: 40000, bhk: 2, area_sqft: 1150, deposit: 140000 },
      { rent: 42000, bhk: 2, area_sqft: 1250, deposit: 150000 }
    ];

    const bench = getBenchmark(
      { rent: 18000, bhk: 2, locality: 'Any City (Kochi / Jaipur / etc.)' },
      { peerListings: peerCards }
    );

    assert.equal(bench.level, 'peer_page');
    assert.equal(bench.n, 7);
    assert.equal(bench.median, 41000);
    assert.match(bench.sourceLabel, /vs 7 same-BHK listings on this page/);
    assert.equal(bench.confidence, 'medium');
  });

  it('Level 2: resolves area cell from geohash prefix or fine locality pack', () => {
    const bench = getBenchmark({
      rent: 40000,
      bhk: 2,
      geohash: 'tdr1vs9', // Indiranagar geohash
      locality: 'Indiranagar'
    });

    assert.equal(bench.level, 'area_cell');
    assert.equal(bench.n >= 10, true);
    assert.equal(bench.median, 40000);
    assert.equal(bench.confidence, 'high');
    assert.match(bench.sourceLabel, /vs \d+ listings nearby in Indiranagar/);
  });

  it('Level 3: resolves district cell from wider geohash prefix', () => {
    const bench = getBenchmark({
      rent: 32000,
      bhk: 2,
      geohash: 'tdr1' // 4-char parent cell for Bengaluru district
    });

    assert.equal(bench.level, 'district_cell');
    assert.equal(bench.confidence, 'medium');
    assert.match(bench.sourceLabel, /wider/i);
  });

  it('Level 4: falls back to city baseline when locality text matches city name', () => {
    const bench = getBenchmark({
      rent: 28000,
      bhk: 2,
      locality: 'Kothrud, Pune'
    });

    assert.ok(bench.level === 'city' || bench.level === 'area_cell');
    assert.ok(bench.n >= 5);
  });

  it('Level 5: stays silent and returns level none when local data is thin/absent', () => {
    const bench = getBenchmark({
      rent: 15000,
      bhk: 2,
      locality: 'Unknown Village, Remote District'
    });

    assert.equal(bench.level, 'none');
    assert.equal(bench.n, 0);
    assert.equal(bench.median, null);
    assert.equal(bench.confidence, 'none');
    assert.equal(bench.sourceLabel, 'Not enough local data');
  });

  it('does NOT fire price outlier false alarm when benchmark data is none', () => {
    const res = evaluatePriceSignal({
      rent: 5000,
      bhk: 2,
      locality: 'Nonexistent Unknown Town 123'
    });

    assert.equal(res.fired, false);
    assert.match(res.reason, /Not enough local price data/i);
    assert.equal(res.details.level, 'none');
  });

  it('validates authentic market packs and rejects malformed packs', () => {
    const validPack = {
      cell: 'tdr1y',
      level: 'area_cell',
      bhk: {
        '2': { n: 20, median: 40000, mad: 3000 }
      }
    };
    assert.equal(isValidMarketPack(validPack), true);

    // Reject missing cell or level
    assert.equal(isValidMarketPack({ bhk: { '2': { n: 10, median: 20000, mad: 2000 } } }), false);

    // Reject missing or empty BHK
    assert.equal(isValidMarketPack({ cell: 'tdr1y', level: 'area_cell', bhk: {} }), false);

    // Reject non-numeric median or mad
    assert.equal(isValidMarketPack({
      cell: 'tdr1y',
      level: 'area_cell',
      bhk: { '2': { n: 10, median: 'forty_thousand', mad: 2000 } }
    }), false);
  });
});

