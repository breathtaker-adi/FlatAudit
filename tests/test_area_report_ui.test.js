import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  generateAreaReport,
  renderAreaReportDOM,
  EXACT_AREA_STRINGS
} from '../extension/lib/area/report.js';

describe('Slice S8: Area Report UI States & Key Observations Rendering', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="container"></div></body></html>');
  const doc = dom.window.document;

  describe('1. Exact User-Facing Strings for Non-OK States', () => {
    it('renders exact string when Area Report is OFF', async () => {
      const report = await generateAreaReport(
        { lat: 12.978, lng: 77.641, city: 'Bengaluru' },
        { settings: { enabled: false } }
      );
      assert.strictEqual(report.status, 'off');
      assert.strictEqual(report.message, 'Area Report is off. Turn it on in settings to see what is nearby.');

      const el = renderAreaReportDOM(report, doc);
      assert.ok(el.textContent.includes('Area Report is off. Turn it on in settings to see what is nearby.'));
    });

    it('renders exact string for loading state', () => {
      const el = renderAreaReportDOM({ status: 'loading' }, doc);
      assert.ok(el.textContent.includes('Checking the map…'));
    });

    it('renders exact string for unavailable / failure state', () => {
      const el = renderAreaReportDOM({ status: 'unavailable' }, doc);
      assert.ok(el.textContent.includes('Area data unavailable right now.'));
    });

    it('renders exact string for thin map state (< 5 elements within 1 km)', () => {
      const el = renderAreaReportDOM({ status: 'thin_map' }, doc);
      assert.ok(el.textContent.includes('Not enough map data here.'));
    });

    it('renders exact string for unsupported city', async () => {
      const report = await generateAreaReport(
        { lat: 19.076, lng: 72.877, city: 'Mumbai' },
        { settings: { enabled: true } }
      );
      assert.strictEqual(report.status, 'unsupported_city');
      assert.strictEqual(report.message, 'Not available for this city yet.');

      const el = renderAreaReportDOM(report, doc);
      assert.ok(el.textContent.includes('Not available for this city yet.'));
    });
  });

  describe('2. Successful 5-Category Rendering (OK State)', () => {
    const mockReportData = {
      status: 'ok',
      cityTier: 'metro',
      attribution: 'Map data © OpenStreetMap contributors',
      categories: {
        emergency_healthcare: {
          title: 'Emergency & Healthcare',
          grade: 'Good',
          points: 10,
          fact: 'Chinmaya Mission Hospital is 0.3 km away (straight line).',
          drawback: 'No major drawback found among the checks used.',
          checks: []
        },
        daily_supplies: {
          title: 'Daily Supplies & Services',
          grade: 'Good',
          points: 10,
          fact: "Nature's Basket is 0.2 km away (straight line).",
          drawback: 'No major drawback found among the checks used.',
          checks: []
        },
        commute_transit: {
          title: 'Commute & Transit',
          grade: 'Good',
          points: 10,
          fact: 'Indiranagar Metro Station is 0.1 km away (straight line).',
          drawback: 'No major drawback found among the checks used.',
          checks: []
        },
        safety_environment: {
          title: 'Safety & Environment',
          subtitle: 'Nearby map facts, not crime data.',
          grade: 'Good',
          points: 9,
          fact: 'Indiranagar Police Station is 0.4 km away (straight line).',
          drawback: 'No major drawback found among the checks used.',
          nightFacts: { note: 'Not enough night data on the map.' },
          checks: []
        },
        lifestyle_community: {
          title: 'Lifestyle & Community',
          grade: 'Good',
          points: 9,
          fact: 'Defence Colony Park is 0.4 km away (straight line).',
          drawback: 'No major drawback found among the checks used.',
          checks: []
        }
      }
    };

    it('renders all 5 category cards with grade chips and x/10 score tags', () => {
      const el = renderAreaReportDOM(mockReportData, doc);
      const cards = el.querySelectorAll('.flataudit-area-card');
      assert.strictEqual(cards.length, 5);

      const text = el.textContent;
      assert.ok(text.includes('Emergency & Healthcare'));
      assert.ok(text.includes('Daily Supplies & Services'));
      assert.ok(text.includes('Commute & Transit'));
      assert.ok(text.includes('Safety & Environment'));
      assert.ok(text.includes('Lifestyle & Community'));

      assert.ok(text.includes('10/10'));
      assert.ok(text.includes('9/10'));
    });

    it('includes mandatory "Nearby map facts, not crime data." subtitle on safety row', () => {
      const el = renderAreaReportDOM(mockReportData, doc);
      const subEl = el.querySelector('.flataudit-area-subtitle');
      assert.ok(subEl);
      assert.strictEqual(subEl.textContent, 'Nearby map facts, not crime data.');
    });

    it('includes ODbL attribution in details: "Map data © OpenStreetMap contributors"', () => {
      const el = renderAreaReportDOM(mockReportData, doc);
      assert.ok(el.innerHTML.includes('Map data © OpenStreetMap contributors'));
      assert.ok(el.innerHTML.includes('Straight-line distances.'));
    });
  });

  describe('3. Expand / Collapse & Keyboard Accessibility', () => {
    it('initializes with aria-expanded="false" and tabindex="0"', () => {
      const report = {
        status: 'ok',
        cityTier: 'metro',
        categories: {
          emergency_healthcare: {
            title: 'Emergency & Healthcare',
            grade: 'Good',
            points: 10,
            fact: 'Hospital is nearby',
            drawback: 'None'
          }
        }
      };

      const el = renderAreaReportDOM(report, doc);
      const card = el.querySelector('.flataudit-area-card');
      assert.ok(card);
      assert.strictEqual(card.getAttribute('tabindex'), '0');
      assert.strictEqual(card.getAttribute('role'), 'button');
      assert.strictEqual(card.getAttribute('aria-expanded'), 'false');

      const details = card.querySelector('.flataudit-point-details');
      assert.strictEqual(details.style.display, 'none');

      // Click to expand
      card.dispatchEvent(new dom.window.MouseEvent('click'));
      assert.strictEqual(card.getAttribute('aria-expanded'), 'true');
      assert.strictEqual(details.style.display, 'block');

      // Click to collapse
      card.dispatchEvent(new dom.window.MouseEvent('click'));
      assert.strictEqual(card.getAttribute('aria-expanded'), 'false');
      assert.strictEqual(details.style.display, 'none');

      // Press Enter to expand
      card.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter' }));
      assert.strictEqual(card.getAttribute('aria-expanded'), 'true');
      assert.strictEqual(details.style.display, 'block');
    });
  });

  describe('4. Buyer Mode Wording Compliance Audit', () => {
    const FORBIDDEN_WORDS = [
      'safe',
      'unsafe',
      'dangerous',
      'scam',
      'overpriced',
      'cheap',
      'good deal',
      'bad area',
      'worth it'
    ];

    it('contains ZERO forbidden words in exact string constants', () => {
      const serialized = JSON.stringify(EXACT_AREA_STRINGS).toLowerCase();
      for (const word of FORBIDDEN_WORDS) {
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        assert.strictEqual(
          regex.test(serialized),
          false,
          `Forbidden word "${word}" found in EXACT_AREA_STRINGS`
        );
      }
    });
  });
});
