import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluatePriceSignal,
  evaluateDepositSignal,
  evaluatePhraseSignal,
  evaluateDuplicateImageSignal,
  evaluateSalePriceSignal,
  evaluateReraSignal,
  analyzeListing
} from '../extension/lib/signals.js';

describe('Signal Evaluation Rules', () => {
  describe('Price Signal', () => {
    it('fires on extreme below-market bait rent (e.g. 12k for 3BHK in HSR Layout)', () => {
      const result = evaluatePriceSignal(12000, 'HSR Layout, Bangalore', 3);
      assert.equal(result.fired, true);
      assert.match(result.reason, /below the HSR LAYOUT 3BHK median/i);
    });

    it('does not fire on normal market rent (e.g. 42k for 2BHK in Indiranagar)', () => {
      const result = evaluatePriceSignal(42000, 'Indiranagar, Bangalore', 2);
      assert.equal(result.fired, false);
      assert.match(result.reason, /within normal range/i);
    });
  });

  describe('Deposit Signal', () => {
    it('fires when zero security deposit is advertised', () => {
      const result = evaluateDepositSignal(20000, 0, 'Hinjawadi, Pune');
      assert.equal(result.fired, true);
      assert.match(result.reason, /zero security deposit/i);
    });

    it('fires on abnormal low deposit ratio in high-deposit city', () => {
      // 25k deposit on 12k rent is 2x, but for Bangalore 3BHK normal is 3-6 months
      const result = evaluateDepositSignal(60000, 30000, 'Indiranagar, Bangalore');
      assert.equal(result.fired, true);
      assert.match(result.reason, /only 0\.5x monthly rent/i);
    });

    it('does not fire on standard 3-5 month deposit', () => {
      const result = evaluateDepositSignal(40000, 160000, 'Indiranagar, Bangalore');
      assert.equal(result.fired, false);
      assert.match(result.reason, /within normal bounds/i);
    });
  });

  describe('Phrase Signal', () => {
    it('fires and extracts advance-fee / military patterns', () => {
      const scamText = 'I am army officer transferred on urgent duty posting. Gate pass fee of 2500 refundable upon gate entry.';
      const result = evaluatePhraseSignal(scamText);
      assert.equal(result.fired, true);
      assert.equal(result.matchedCount >= 2, true);
      assert.match(result.reason, /Found \d+ suspicious/);
    });

    it('does not fire on clean professional listing descriptions', () => {
      const cleanText = 'Semi-furnished 2BHK near metro with 24hr backup, modular kitchen, and covered car park.';
      const result = evaluatePhraseSignal(cleanText);
      assert.equal(result.fired, false);
      assert.equal(result.matchedCount, 0);
    });
  });

  describe('Duplicate Image Signal', () => {
    it('fires when photo fingerprint has been observed across multiple listings', () => {
      const result = evaluateDuplicateImageSignal(4);
      assert.equal(result.fired, true);
      assert.match(result.reason, /appeared across 4 distinct listings/);
    });

    it('does not fire when photo has only been observed once', () => {
      const result = evaluateDuplicateImageSignal(1);
      assert.equal(result.fired, false);
    });
  });

  describe('Composite analyzeListing output', () => {
    it('labels a clean normal listing as "Looks normal" with zero defamatory words', () => {
      const cleanListing = {
        title: '2 BHK Flat for rent in Indiranagar',
        rent: 42000,
        deposit: 150000,
        bhk: 2,
        locality: 'Indiranagar, Bangalore',
        description: 'Standard flat near metro. Available from next month.'
      };

      const analysis = analyzeListing(cleanListing, { seenCount: 1 });
      assert.equal(analysis.badgeLabel, 'Looks normal');
      assert.equal(analysis.badgeTone, 'ok');
      assert.equal(analysis.firedCount, 0);
      assert.equal(analysis.observableFacts.length, 0);
    });

    it('labels an advance-token scam as "Many signals" with factual observable reasons', () => {
      const scamListing = {
        title: 'Urgent 3 BHK in HSR Layout',
        rent: 12000,
        deposit: 25000,
        bhk: 3,
        locality: 'HSR Layout, Bangalore',
        description: 'Army officer transferred urgently. Keys with courier. Society gate pass token required before viewing.'
      };

      const analysis = analyzeListing(scamListing, { seenCount: 4 });
      assert.equal(analysis.badgeLabel, 'Many signals');
      assert.equal(analysis.badgeTone, 'bad');
      assert.equal(analysis.firedCount >= 3, true);

      // Verify no defamatory language in reasons
      for (const fact of analysis.observableFacts) {
        assert.doesNotMatch(fact, /scammer|criminal|fraud/i);
      }
      assert.match(analysis.scamKillChainStage, /Stage/);
    });

    it('evaluates resale apartment for sale with guidance value comparison and due diligence checklist', () => {
      const saleListing = {
        listingType: 'sale',
        title: '2 BHK Resale in Electronic City Phase 1',
        price: 12500000, // ₹1.25 Cr
        pricePerSqft: 10162,
        area_sqft: 1230,
        bhk: 2,
        locality: 'Electronic City, Bangalore',
        reraId: 'PRM/KA/RERA/1251/310/PR/171015/000451',
        possessionStatus: 'ready_to_move',
        description: 'East-facing resale flat. OC, CC, and A-Khata available. Bank loans approved.'
      };

      const analysis = analyzeListing(saleListing, { seenCount: 1 });
      assert.equal(analysis.listingType, 'sale');
      assert.equal(analysis.badgeLabel, 'Looks normal');
      assert.equal(analysis.badgeTone, 'ok');
      assert.equal(analysis.firedCount, 0);

      // Verify human readable points structure for sale
      assert.equal(analysis.humanReadablePoints.length, 4);
      assert.equal(analysis.humanReadablePoints[0].category, 'Sale Valuation');
      assert.equal(analysis.humanReadablePoints[1].category, 'RERA Registration');
      assert.equal(analysis.humanReadablePoints[2].category, 'Terms & Token Hold');
      assert.equal(analysis.humanReadablePoints[3].category, 'Photo Authenticity');

      // Verify Buyer Due Diligence Checklist (5 actionable verification steps)
      assert.equal(analysis.buyerDueDiligenceChecklist.length, 5);
      assert.match(analysis.buyerDueDiligenceChecklist[0], /Title Search/i);
      assert.match(analysis.buyerDueDiligenceChecklist[1], /Encumbrance Certificate/i);

      // Verify legal disclaimer presence
      assert.match(analysis.disclaimer, /Observable facts only/i);
      assert.match(analysis.disclaimer, /does not verify property title/i);
    });

    it('fires warning when asking price per sqft is suspiciously below government circle rate', () => {
      const suspiciousSaleListing = {
        listingType: 'sale',
        title: 'Luxury 3 BHK in HSR Layout at throwaway price',
        price: 3500000, // ₹35 Lakhs for 1500 sqft in HSR Layout (~₹2,333/sqft vs guidance ₹8,800/sqft)
        pricePerSqft: 2333,
        area_sqft: 1500,
        bhk: 3,
        locality: 'HSR Layout, Bangalore',
        description: 'Urgent distress sale. Pay token to reserve the flat.'
      };

      const analysis = analyzeListing(suspiciousSaleListing, { seenCount: 1 });
      assert.equal(analysis.listingType, 'sale');
      assert.equal(analysis.signals.price.fired, true);
      assert.match(analysis.signals.price.reason, /below government guidance rate/i);
      assert.match(analysis.signals.phrase.reason, /Demands booking token/i);
      assert.equal(analysis.badgeTone, 'bad');
    });

    it('Piece 0 Safety Rule: blocks price per sq ft comparison and shows "Pick rent or sale first" when listingType is unknown', () => {
      const unclearListing = {
        listingType: 'unknown',
        title: 'Spacious Multi-Storey Flat in Bangalore',
        rawPrice: 5500000,
        area_sqft: 1400,
        bhk: 3,
        locality: 'Koramangala, Bangalore'
      };

      const analysis = analyzeListing(unclearListing, {
        peerListings: [
          { bhk: 3, area_sqft: 1400, areaType: 'carpet', price: 5400000, listingType: 'sale' },
          { bhk: 3, area_sqft: 1400, areaType: 'carpet', price: 5600000, listingType: 'sale' }
        ]
      });

      assert.equal(analysis.listingType, 'unknown');
      assert.equal(analysis.badgeLabel, 'Select Mode');
      assert.equal(analysis.badgeTone, 'warn');

      // Observation points must include blocked Price per Sq.Ft
      const pricePoint = analysis.humanReadablePoints.find(p => p.category === 'Price per Sq.Ft');
      assert.ok(pricePoint, 'Price per Sq.Ft observation must be present');
      assert.match(pricePoint.point, /Pick rent or sale first/i);
      assert.match(pricePoint.reason, /Pick rent or sale first/i);

      // Verify no price signals or outlier alerts fired on unknown mode
      assert.equal(analysis.firedCount, 0);
      assert.equal(analysis.priceCheck.status, 'mode_unknown');
    });
  });

  describe('Buying Checks & Official RERA Links', () => {
    it('evaluates RERA registration number and generates official portal link', () => {
      const karnatakaListing = {
        locality: 'Electronic City, Bangalore',
        reraId: 'PRM/KA/RERA/1251/310/PR/171015/000451'
      };
      const reraSignal = evaluateReraSignal(karnatakaListing);
      assert.equal(reraSignal.fired, false);
      assert.match(reraSignal.portalUrl, /rera\.karnataka\.gov\.in/i);
      assert.match(reraSignal.reason, /PRM\/KA\/RERA/i);
    });

    it('advises checking physical OC & CC for resale apartments when RERA is absent', () => {
      const resaleListing = {
        locality: 'Indiranagar, Bangalore',
        possessionStatus: 'ready_to_move',
        title: 'Ready to Move Resale Flat'
      };
      const reraSignal = evaluateReraSignal(resaleListing);
      assert.match(reraSignal.point, /Verify physical OC & CC/i);
      assert.match(reraSignal.humanReason, /Occupancy Certificate/i);
    });
  });
});
