import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalizeUrl,
  parseListingKey,
  trackListing,
  getTrackedListings,
  untrackListing,
  updateListingStatus,
  updateListingNote,
  computePriceHistoryStats,
  formatTimeOnMarket,
  generateSparklineSVG,
  buildComparisonMatrix,
  exportShortlistToCSV,
  calculateEMI,
  StorageAdapter
} from '../extension/lib/tracker.js';
import { parseArea, parseFloor } from '../extension/lib/parsers/currency.js';

describe('Tracker & Buyhatke Features', () => {
  beforeEach(async () => {
    StorageAdapter.clear();
  });

  describe('URL Canonicalization and Listing Key Parsing', () => {
    it('canonicalizes URLs by stripping tracking queries and trailing slashes', () => {
      const url = 'https://www.nobroker.in/property/rent/bangalore/indiranagar/ff8081814b7e8d62014b8a?utm_source=google&spm=123#gallery';
      assert.equal(
        canonicalizeUrl(url),
        'https://www.nobroker.in/property/rent/bangalore/indiranagar/ff8081814b7e8d62014b8a'
      );
    });

    it('extracts stable listing keys per portal', () => {
      const nbKey = parseListingKey('nobroker', 'https://www.nobroker.in/property/rent/bangalore/indiranagar/ff8081814b7e8d62014b8a');
      assert.equal(nbKey, 'nobroker:ff8081814b7e8d62014b8a');

      const mbKey = parseListingKey('magicbricks', 'https://www.magicbricks.com/propertyDetails/2-BHK-pdpid-4d4233363032333939');
      assert.equal(mbKey, 'magicbricks:4d4233363032333939');

      const acresKey = parseListingKey('99acres', 'https://www.99acres.com/rent-in-powai-rpid-R6829104');
      assert.equal(acresKey, '99acres:R6829104');

      const housingKey = parseListingKey('housing', 'https://housing.com/rent/5920142-2-bhk-apartment-in-whitefield');
      assert.equal(housingKey, 'housing:5920142');
    });

    it('parses area in sqft and floor levels accurately', () => {
      assert.equal(parseArea('1,250 sq.ft'), 1250);
      assert.equal(parseArea('Super Area 2200 sqft'), 2200);
      assert.equal(parseArea('580 sq.ft. carpet'), 580);
      assert.equal(parseArea('No area given'), null);

      assert.equal(parseFloor('4th of 12 floors'), 4);
      assert.equal(parseFloor('3rd floor'), 3);
      assert.equal(parseFloor('Ground floor'), 0);
      assert.equal(parseFloor('Basement parking'), -1);
      assert.equal(parseFloor('Unknown floor'), null);
    });
  });

  describe('Watchlist Tracking and Snapshots', () => {
    it('tracks a new listing with initial snapshot', async () => {
      const res = await trackListing({
        portal: 'nobroker',
        listingKey: 'nobroker:test-101',
        title: '2 BHK Indiranagar',
        rent: 42000,
        deposit: 150000,
        locality: 'Indiranagar',
        bhk: 2,
        areaSqft: 1250,
        floor: 3
      });

      assert.equal(res.isNew, true);
      assert.equal(res.priceDropped, false);
      assert.equal(res.trackedItem.snapshots.length, 1);
      assert.equal(res.trackedItem.snapshots[0].rent, 42000);
    });

    it('records a new snapshot on price drop upon revisit', async () => {
      // First observation
      await trackListing({
        listingKey: 'nobroker:drop-test',
        portal: 'nobroker',
        title: '3 BHK HSR',
        rent: 50000,
        deposit: 200000
      });

      // Revisit with rent drop of 3,000
      const revisit = await trackListing({
        listingKey: 'nobroker:drop-test',
        portal: 'nobroker',
        title: '3 BHK HSR',
        rent: 47000,
        deposit: 200000
      });

      assert.equal(revisit.isNew, false);
      assert.equal(revisit.priceDropped, true);
      assert.equal(revisit.delta, -3000);
      assert.equal(revisit.trackedItem.snapshots.length, 2);
    });

    it('updates status and user note', async () => {
      await trackListing({
        listingKey: 'nobroker:note-test',
        title: 'Flat with note',
        rent: 30000
      });

      await updateListingStatus('nobroker:note-test', 'Visited');
      await updateListingNote('nobroker:note-test', 'Spoke to owner Mr. Sharma, willing to negotiate ₹1,000');

      const all = await getTrackedListings();
      assert.equal(all['nobroker:note-test'].status, 'Visited');
      assert.match(all['nobroker:note-test'].note, /Sharma/);
    });
  });

  describe('Price History Stats and Sparkline Generation', () => {
    it('calculates price history statistics accurately', () => {
      const snaps = [
        { t: 1000, rent: 45000 },
        { t: 2000, rent: 44000 },
        { t: 3000, rent: 42000 }
      ];
      const stats = computePriceHistoryStats(snaps);
      assert.equal(stats.firstRent, 45000);
      assert.equal(stats.currentRent, 42000);
      assert.equal(stats.lowestRent, 42000);
      assert.equal(stats.highestRent, 45000);
      assert.equal(stats.delta, -3000);
      assert.equal(stats.pctChange, -7);
      assert.equal(stats.isDrop, true);
    });

    it('generates valid inline SVG sparkline string without external dependencies', () => {
      const snaps = [
        { t: 1000, rent: 45000 },
        { t: 2000, rent: 42000 }
      ];
      const svg = generateSparklineSVG(snaps, { width: 200, height: 50 });
      assert.match(svg, /<svg class="flataudit-sparkline"/);
      assert.match(svg, /<polyline/);
      assert.match(svg, /<path/);
      assert.match(svg, /viewBox="0 0 200 50"/);
    });

    it('formats time on market gracefully', () => {
      assert.equal(formatTimeOnMarket(Date.now()), 'First seen today');
      const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000 + 1000);
      assert.equal(formatTimeOnMarket(threeDaysAgo), 'First seen 3 days ago');
    });
  });

  describe('Comparison Matrix and CSV Export', () => {
    it('builds side-by-side comparison matrix and flags best values', () => {
      const listingA = {
        listingKey: 'nb:1',
        portal: 'nobroker',
        title: 'Indiranagar 2BHK',
        rent: 40000,
        deposit: 120000,
        areaSqft: 1000,
        floor: 2,
        signalsFiredCount: 0,
        snapshots: [{ t: 1, rent: 40000 }]
      };
      const listingB = {
        listingKey: 'mb:2',
        portal: 'magicbricks',
        title: 'Koramangala 2BHK',
        rent: 45000,
        deposit: 180000,
        areaSqft: 1200,
        floor: 5,
        signalsFiredCount: 1,
        snapshots: [{ t: 1, rent: 45000 }]
      };

      const matrix = buildComparisonMatrix([listingA, listingB]);
      assert.equal(matrix.columns.length, 2);
      // Best rent: 40,000 (listingA)
      assert.equal(matrix.bests.minRent, 40000);
      // Rent per sqft: listingA is 40000/1000 = 40; listingB is 45000/1200 = 37.5 (listingB is cheaper per sqft!)
      assert.equal(matrix.bests.minRentSqft, 37.5);
      // Deposit multiple: listingA is 120000/40000 = 3; listingB is 180000/45000 = 4 (listingA is lower multiple!)
      assert.equal(matrix.bests.minDepositMult, 3);
      assert.equal(matrix.bests.minSignals, 0);
    });

    it('exports shortlist to valid CSV text', () => {
      const tracked = {
        'nb:1': {
          listingKey: 'nb:1',
          portal: 'nobroker',
          title: 'Indiranagar 2BHK',
          locality: 'Indiranagar',
          bhk: 2,
          rent: 40000,
          areaSqft: 1000,
          floor: 2,
          status: 'Interested',
          note: 'Spoke with guard',
          signalsFiredCount: 0,
          url: 'https://nobroker.in/1',
          firstSeen: Date.now(),
          snapshots: [{ t: Date.now(), rent: 40000, deposit: 120000 }]
        }
      };

      const csv = exportShortlistToCSV(tracked);
      assert.match(csv, /"Portal","Listing Key","Title"/);
      assert.match(csv, /"nobroker","nb:1","Indiranagar 2BHK","Indiranagar",2,40000,120000,1000,2,"Interested","Spoke with guard"/);
    });
  });

  describe('Property Buying Tracking & EMI Calculator', () => {
    it('tracks a property sale listing with price, pricePerSqft, and RERA ID', async () => {
      const saleListing = {
        listingKey: 'nobroker:sale-101',
        listingType: 'sale',
        portal: 'nobroker',
        url: 'https://nobroker.in/buy/electronic-city',
        title: '2 BHK Resale in Electronic City',
        price: 12500000,
        pricePerSqft: 10162,
        areaSqft: 1230,
        areaType: 'carpet',
        possessionStatus: 'ready_to_move',
        reraId: 'PRM/KA/RERA/1251/310/PR/171015/000451'
      };

      const result = await trackListing(saleListing);
      assert.equal(result.isNew, true);
      assert.equal(result.trackedItem.listingType, 'sale');
      assert.equal(result.trackedItem.price, 12500000);
      assert.equal(result.trackedItem.pricePerSqft, 10162);
      assert.equal(result.trackedItem.reraId, 'PRM/KA/RERA/1251/310/PR/171015/000451');
      assert.equal(result.trackedItem.snapshots[0].price, 12500000);
    });

    it('calculates monthly EMI and loan amortization accurately', () => {
      // 50 Lakhs loan, 8.5% p.a., 20 years
      const emi = calculateEMI(5000000, 8.5, 20);
      assert.ok(emi.monthlyEmi > 43000 && emi.monthlyEmi < 44000, `Expected ~43,391, got ${emi.monthlyEmi}`);
      assert.ok(emi.totalPayment > 5000000);
      assert.ok(emi.totalInterest > 5000000);
    });

    it('returns zero EMI on zero or negative principal', () => {
      const emi = calculateEMI(0);
      assert.equal(emi.monthlyEmi, 0);
      assert.equal(emi.totalPayment, 0);
    });
  });
});
