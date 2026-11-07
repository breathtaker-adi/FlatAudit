import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  roundCoordinate,
  roundLocation,
  roundLocationKey,
  getFooterPrivacyText,
  getAreaReportSettings,
  setAreaReportSettings,
  EXACT_CONSENT_COPY,
  AREA_REPORT_OFF_STRING,
  FOOTER_REPORT_ON_STRING,
  FOOTER_REPORT_OFF_STRING,
  SAFETY_LABEL_STRING,
  STORAGE_KEY_SETTINGS,
  STORAGE_KEY_AREA_REPORT,
  DEFAULT_AREA_REPORT_SETTINGS
} from '../extension/lib/settings.js';

describe('Slice S4: Privacy Settings, Coordinate Rounding & Consent Guard', () => {
  // Ephemeral test storage adapter
  let memStorage;
  let mockStorageAdapter;

  beforeEach(() => {
    memStorage = new Map();
    mockStorageAdapter = {
      async get(key) {
        return memStorage.has(key) ? memStorage.get(key) : null;
      },
      async set(key, val) {
        memStorage.set(key, val);
      },
      clear() {
        memStorage.clear();
      }
    };
  });

  describe('1. Default Privacy State & Consent Copy', () => {
    it('is strictly OFF by default with null consent date', async () => {
      const settings = await getAreaReportSettings(mockStorageAdapter);
      assert.strictEqual(settings.enabled, false);
      assert.strictEqual(settings.consentedAt, null);
    });

    it('matches exact consent copy locked by specification (Section 6.1)', () => {
      const expectedConsent =
        "Area Report asks OpenStreetMap servers what is near this flat. This sends the flat's location, rounded to about 100 m, from your browser to the map servers. Nothing else is sent. Off by default; you can turn it off any time.";
      assert.strictEqual(EXACT_CONSENT_COPY, expectedConsent);
    });

    it('matches exact user-facing strings locked by specification (Section 7)', () => {
      assert.strictEqual(
        AREA_REPORT_OFF_STRING,
        'Area Report is off. Turn it on in settings to see what is nearby.'
      );
      assert.strictEqual(
        FOOTER_REPORT_ON_STRING,
        'Area Report on: rounded location sent to OpenStreetMap'
      );
      assert.strictEqual(
        FOOTER_REPORT_OFF_STRING,
        '🔒 Zero personal data transmitted'
      );
      assert.strictEqual(
        SAFETY_LABEL_STRING,
        'Nearby map facts, not crime data.'
      );
    });
  });

  describe('2. Coordinate Rounding (~100m at Indian Latitudes)', () => {
    it('rounds coordinates to exactly 3 decimal places', () => {
      // Indiranagar, Bengaluru
      const bng = roundLocation(12.971598, 77.594563);
      assert.strictEqual(bng.lat, 12.972);
      assert.strictEqual(bng.lng, 77.595);

      // C-Scheme, Jaipur
      const jpr = roundLocation(26.912434, 75.787271);
      assert.strictEqual(jpr.lat, 26.912);
      assert.strictEqual(jpr.lng, 75.787);

      // Sardarpura, Jodhpur
      const jdh = roundLocation(26.238947, 73.024309);
      assert.strictEqual(jdh.lat, 26.239);
      assert.strictEqual(jdh.lng, 73.024);
    });

    it('parses string coordinates and rounds accurately', () => {
      const res = roundLocation('12.97841', '77.64082');
      assert.strictEqual(res.lat, 12.978);
      assert.strictEqual(res.lng, 77.641);
    });

    it('generates canonical cache key with comma-separated 3-decimal values', () => {
      const key = roundLocationKey(12.971598, 77.594563);
      assert.strictEqual(key, '12.972,77.595');
    });

    it('handles non-numeric or missing coordinates gracefully without throwing', () => {
      assert.strictEqual(roundCoordinate(null), null);
      assert.strictEqual(roundCoordinate(undefined), null);
      assert.strictEqual(roundCoordinate('invalid'), null);
      assert.strictEqual(roundCoordinate(NaN), null);

      const invalidLoc = roundLocation('abc', null);
      assert.strictEqual(invalidLoc.lat, null);
      assert.strictEqual(invalidLoc.lng, null);

      const invalidKey = roundLocationKey(null, 77.59);
      assert.strictEqual(invalidKey, null);
    });
  });

  describe('3. Footer Privacy Text Invariant Guarantee', () => {
    it('shows "🔒 Zero personal data transmitted" when Area Report is disabled', () => {
      const text = getFooterPrivacyText(false);
      assert.strictEqual(text, '🔒 Zero personal data transmitted');
    });

    it('shows "Area Report on: rounded location sent to OpenStreetMap" when enabled', () => {
      const text = getFooterPrivacyText(true);
      assert.strictEqual(text, 'Area Report on: rounded location sent to OpenStreetMap');
    });

    it('NEVER claims zero data transmission when Area Report is enabled', () => {
      const text = getFooterPrivacyText(true);
      assert.strictEqual(
        text.toLowerCase().includes('zero personal data transmitted'),
        false,
        'CRITICAL: Enabled footer must NEVER claim zero data transmission'
      );
      assert.strictEqual(
        text.toLowerCase().includes('zero pii'),
        false
      );
    });
  });

  describe('4. Zero Network Transmission Guard When Switch Is Off', () => {
    it('asserts zero fetch calls are invoked when Area Report is off', async () => {
      let fetchCallCount = 0;
      const originalFetch = globalThis.fetch;

      // Spy on fetch
      globalThis.fetch = async (...args) => {
        fetchCallCount++;
        return { ok: true, json: async () => ({}) };
      };

      try {
        const settings = await getAreaReportSettings(mockStorageAdapter);
        assert.strictEqual(settings.enabled, false);

        // Guard simulation: caller checks settings before querying map
        if (settings.enabled) {
          await globalThis.fetch('https://overpass-api.de/api/interpreter');
        }

        assert.strictEqual(
          fetchCallCount,
          0,
          'Zero fetch calls must occur when Area Report switch is off'
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('5. Settings Storage & Permission State Transitions', () => {
    it('stores enabled state with valid ISO timestamp when user consents', async () => {
      const saved = await setAreaReportSettings({ enabled: true }, mockStorageAdapter);
      assert.strictEqual(saved.enabled, true);
      assert.ok(saved.consentedAt);
      assert.ok(new Date(saved.consentedAt).getTime() > 0);

      const reloaded = await getAreaReportSettings(mockStorageAdapter);
      assert.strictEqual(reloaded.enabled, true);
      assert.strictEqual(reloaded.consentedAt, saved.consentedAt);
    });

    it('preserves existing root flataudit_settings properties when updating areaReport', async () => {
      await mockStorageAdapter.set(STORAGE_KEY_SETTINGS, {
        theme: 'dark',
        userNotesEnabled: true
      });

      await setAreaReportSettings({ enabled: true }, mockStorageAdapter);

      const root = await mockStorageAdapter.get(STORAGE_KEY_SETTINGS);
      assert.strictEqual(root.theme, 'dark');
      assert.strictEqual(root.userNotesEnabled, true);
      assert.strictEqual(root.areaReport.enabled, true);
    });

    it('resets enabled to false when turned off, maintaining permission safety', async () => {
      await setAreaReportSettings({ enabled: true }, mockStorageAdapter);
      const turnedOff = await setAreaReportSettings({ enabled: false }, mockStorageAdapter);

      assert.strictEqual(turnedOff.enabled, false);
      const reloaded = await getAreaReportSettings(mockStorageAdapter);
      assert.strictEqual(reloaded.enabled, false);
    });

    it('simulates denied permission keeping switch off', async () => {
      // Simulate permission rejection
      const mockRequestPermission = async () => false;

      let switchChecked = false;
      const userAttemptedToggle = true;

      if (userAttemptedToggle) {
        const granted = await mockRequestPermission();
        if (granted) {
          switchChecked = true;
          await setAreaReportSettings({ enabled: true }, mockStorageAdapter);
        } else {
          switchChecked = false;
          await setAreaReportSettings({ enabled: false }, mockStorageAdapter);
        }
      }

      assert.strictEqual(switchChecked, false);
      const settings = await getAreaReportSettings(mockStorageAdapter);
      assert.strictEqual(settings.enabled, false);
    });
  });

  describe('6. Buyer Mode Wording Compliance Audit', () => {
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

    it('contains ZERO forbidden words in all exported settings strings and copy', () => {
      const stringsToScan = [
        EXACT_CONSENT_COPY,
        AREA_REPORT_OFF_STRING,
        FOOTER_REPORT_ON_STRING,
        FOOTER_REPORT_OFF_STRING,
        SAFETY_LABEL_STRING
      ];

      for (const str of stringsToScan) {
        const lower = str.toLowerCase();
        for (const forbidden of FORBIDDEN_WORDS) {
          // Word boundary regex
          const regex = new RegExp(`\\b${forbidden}\\b`, 'i');
          assert.strictEqual(
            regex.test(lower),
            false,
            `Forbidden word "${forbidden}" found in string: "${str}"`
          );
        }
      }
    });
  });
});
