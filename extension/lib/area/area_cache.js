/**
 * FlatAudit Area Report Cache (Slice S5)
 * 
 * Provides TTL-based (14 days) and LRU-capped (50 entries) on-device caching
 * for reduced OpenStreetMap query results via StorageAdapter.
 */

import { StorageAdapter } from '../tracker.js';
import { roundLocationKey, roundCoordinate } from '../settings.js';

export const CACHE_STORAGE_KEY = 'flataudit_area_cache';
export const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
export const CACHE_MAX_ENTRIES = 50;

/**
 * Retrieves cached area data for rounded coordinates.
 * @param {number|string} lat
 * @param {number|string} lng
 * @param {object} [storage] StorageAdapter
 * @param {number} [now] Current timestamp in ms
 * @returns {Promise<object|null>}
 */
export async function getAreaFromCache(lat, lng, storage = StorageAdapter, now = Date.now()) {
  const key = roundLocationKey(lat, lng);
  if (!key) return null;

  try {
    const rawCache = (await storage.get(CACHE_STORAGE_KEY)) || {};
    const entry = rawCache[key];
    if (!entry) return null;

    // Check TTL expiration
    const age = now - (entry.timestamp || 0);
    if (age > CACHE_TTL_MS || age < 0) {
      // Expired entry — remove from cache
      delete rawCache[key];
      await storage.set(CACHE_STORAGE_KEY, rawCache);
      return null;
    }

    // Touch LRU timestamp
    entry.lastAccessedAt = now;
    rawCache[key] = entry;
    await storage.set(CACHE_STORAGE_KEY, rawCache);

    return entry;
  } catch (err) {
    return null;
  }
}

/**
 * Saves area report data to cache with LRU eviction and reduced payload.
 * @param {number|string} lat
 * @param {number|string} lng
 * @param {object} data
 * @param {object} [storage] StorageAdapter
 * @param {number} [now] Current timestamp in ms
 * @returns {Promise<object|null>}
 */
export async function saveAreaToCache(lat, lng, data, storage = StorageAdapter, now = Date.now()) {
  const key = roundLocationKey(lat, lng);
  if (!key || !data) return null;

  try {
    const rawCache = (await storage.get(CACHE_STORAGE_KEY)) || {};

    const entry = {
      key,
      lat: roundCoordinate(lat, 3),
      lng: roundCoordinate(lng, 3),
      timestamp: now,
      lastAccessedAt: now,
      status: data.status || 'ok',
      confidence: data.confidence || 'high',
      density1km: typeof data.density1km === 'number' ? data.density1km : 0,
      elementsCount: Array.isArray(data.elements) ? data.elements.length : 0,
      elements: Array.isArray(data.elements) ? data.elements : [],
      attribution: 'Map data © OpenStreetMap contributors'
    };

    rawCache[key] = entry;

    // Enforce LRU cap (50 entries)
    const keys = Object.keys(rawCache);
    if (keys.length > CACHE_MAX_ENTRIES) {
      // Sort ascending by lastAccessedAt
      const sortedKeys = keys.sort((a, b) => {
        const timeA = rawCache[a].lastAccessedAt || rawCache[a].timestamp || 0;
        const timeB = rawCache[b].lastAccessedAt || rawCache[b].timestamp || 0;
        return timeA - timeB;
      });

      // Remove oldest until length <= 50
      const removeCount = keys.length - CACHE_MAX_ENTRIES;
      for (let i = 0; i < removeCount; i++) {
        delete rawCache[sortedKeys[i]];
      }
    }

    await storage.set(CACHE_STORAGE_KEY, rawCache);
    return entry;
  } catch (err) {
    return null;
  }
}

/**
 * Clears the area report cache.
 * @param {object} [storage] StorageAdapter
 */
export async function clearAreaCache(storage = StorageAdapter) {
  try {
    await storage.set(CACHE_STORAGE_KEY, {});
  } catch (err) {}
}
