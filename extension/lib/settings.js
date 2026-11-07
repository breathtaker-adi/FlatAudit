/**
 * FlatAudit Privacy & Settings Management Module (Slice S4)
 * 
 * Manages Area Report opt-in state, OpenStreetMap optional permissions,
 * strict ~100m coordinate rounding, and zero-transmission footer guarantees.
 */

import { StorageAdapter } from './tracker.js';

export const STORAGE_KEY_SETTINGS = 'flataudit_settings';
export const STORAGE_KEY_AREA_REPORT = 'flataudit_settings.areaReport';

export const OVERPASS_ORIGINS = [
  'https://overpass-api.de/*',
  'https://overpass.kumi.systems/*',
  'https://lz4.overpass-api.de/*'
];

/**
 * Exact consent copy locked by specification (Section 6.1)
 */
export const EXACT_CONSENT_COPY =
  "Area Report asks OpenStreetMap servers what is near this flat. This sends the flat's location, rounded to about 100 m, from your browser to the map servers. Nothing else is sent. Off by default; you can turn it off any time.";

/**
 * Exact user-facing strings locked by specification (Section 7)
 */
export const AREA_REPORT_OFF_STRING = "Area Report is off. Turn it on in settings to see what is nearby.";
export const FOOTER_REPORT_ON_STRING = "Area Report on: rounded location sent to OpenStreetMap";
export const FOOTER_REPORT_OFF_STRING = "🔒 Zero personal data transmitted";
export const SAFETY_LABEL_STRING = "Nearby map facts, not crime data.";

export const DEFAULT_AREA_REPORT_SETTINGS = Object.freeze({
  enabled: false,
  consentedAt: null
});

/**
 * Rounds a single coordinate value to N decimals (default 3 decimals ~100m).
 * @param {number|string} val
 * @param {number} decimals
 * @returns {number|null}
 */
export function roundCoordinate(val, decimals = 3) {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (typeof num !== 'number' || !Number.isFinite(num)) {
    return null;
  }
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

/**
 * Rounds latitude and longitude to 3 decimal places (~100m) for privacy preservation.
 * @param {number|string} lat
 * @param {number|string} lng
 * @returns {{lat: number|null, lng: number|null}}
 */
export function roundLocation(lat, lng) {
  return {
    lat: roundCoordinate(lat, 3),
    lng: roundCoordinate(lng, 3)
  };
}

/**
 * Generates canonical cache key from rounded coordinates.
 * @param {number|string} lat
 * @param {number|string} lng
 * @returns {string|null}
 */
export function roundLocationKey(lat, lng) {
  const rounded = roundLocation(lat, lng);
  if (rounded.lat === null || rounded.lng === null) return null;
  return `${rounded.lat},${rounded.lng}`;
}

/**
 * Returns exact footer privacy string based on Area Report enablement.
 * Guarantee: when enabled, will NEVER claim zero transmission.
 * @param {boolean} isAreaReportEnabled
 * @returns {string}
 */
export function getFooterPrivacyText(isAreaReportEnabled) {
  return isAreaReportEnabled ? FOOTER_REPORT_ON_STRING : FOOTER_REPORT_OFF_STRING;
}

/**
 * Retrieves Area Report settings from storage adapter.
 * @param {object} [storage] Custom or default storage adapter
 * @returns {Promise<{enabled: boolean, consentedAt: string|null}>}
 */
export async function getAreaReportSettings(storage = StorageAdapter) {
  try {
    // Check root flataudit_settings object first
    const root = await storage.get(STORAGE_KEY_SETTINGS);
    if (root && typeof root === 'object' && root.areaReport) {
      return {
        enabled: Boolean(root.areaReport.enabled),
        consentedAt: root.areaReport.consentedAt || null
      };
    }

    // Check direct key fallback
    const direct = await storage.get(STORAGE_KEY_AREA_REPORT);
    if (direct && typeof direct === 'object') {
      return {
        enabled: Boolean(direct.enabled),
        consentedAt: direct.consentedAt || null
      };
    }
  } catch (err) {
    // Storage read failure defaults securely to off
  }

  return { ...DEFAULT_AREA_REPORT_SETTINGS };
}

/**
 * Saves Area Report settings to storage adapter.
 * @param {{enabled: boolean, consentedAt?: string|null}} settings
 * @param {object} [storage] Custom or default storage adapter
 * @returns {Promise<{enabled: boolean, consentedAt: string|null}>}
 */
export async function setAreaReportSettings(settings, storage = StorageAdapter) {
  const isEnabled = Boolean(settings?.enabled);
  const consentedAt = settings?.consentedAt || (isEnabled ? new Date().toISOString() : null);

  const payload = {
    enabled: isEnabled,
    consentedAt: consentedAt
  };

  try {
    const root = (await storage.get(STORAGE_KEY_SETTINGS)) || {};
    const updatedRoot = {
      ...root,
      areaReport: payload
    };
    await storage.set(STORAGE_KEY_SETTINGS, updatedRoot);
    await storage.set(STORAGE_KEY_AREA_REPORT, payload);
  } catch (err) {
    // Ignore storage write context issues
  }

  return payload;
}

/**
 * Requests Chrome optional host permissions for OpenStreetMap Overpass servers.
 * @returns {Promise<boolean>}
 */
export async function requestAreaReportPermissions() {
  if (typeof chrome !== 'undefined' && chrome?.permissions?.request) {
    try {
      const granted = await new Promise((resolve) => {
        chrome.permissions.request({ origins: OVERPASS_ORIGINS }, (result) => {
          if (chrome?.runtime?.lastError) {
            return resolve(false);
          }
          resolve(Boolean(result));
        });
      });
      return granted;
    } catch (e) {
      return false;
    }
  }
  return true; // Headless / test fallback
}

/**
 * Checks whether Chrome optional host permissions for Overpass servers are currently granted.
 * @returns {Promise<boolean>}
 */
export async function hasAreaReportPermissions() {
  if (typeof chrome !== 'undefined' && chrome?.permissions?.contains) {
    try {
      const contains = await new Promise((resolve) => {
        chrome.permissions.contains({ origins: OVERPASS_ORIGINS }, (result) => {
          if (chrome?.runtime?.lastError) {
            return resolve(false);
          }
          resolve(Boolean(result));
        });
      });
      return contains;
    } catch (e) {
      return false;
    }
  }
  return true; // Headless / test fallback
}
