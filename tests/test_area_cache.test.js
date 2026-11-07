import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  getAreaFromCache,
  saveAreaToCache,
  clearAreaCache,
  CACHE_STORAGE_KEY,
  CACHE_TTL_MS,
  CACHE_MAX_ENTRIES
} from '../extension/lib/area/area_cache.js';

describe('Slice S5: Area Report Cache (TTL & LRU via StorageAdapter)', () => {
  let memStorage;
  let mockStorageAdapter;

  beforeEach(() => {
    memStorage = new Map();
    mockStorageAdapter = {
      async get(key) {
        return memStorage.has(key) ? JSON.parse(JSON.stringify(memStorage.get(key))) : null;
      },
      async set(key, val) {
        memStorage.set(key, JSON.parse(JSON.stringify(val)));
      },
      clear() {
        memStorage.clear();
      }
    };
  });

  describe('1. Coordinate Rounding & Cache Hit', () => {
    it('hits the same cache entry for points within ~100m rounding boundary', async () => {
      const t0 = 10000000;
      const sampleData = {
        status: 'ok',
        confidence: 'high',
        density1km: 22,
        elements: [
          { id: 1, type: 'node', tags: { amenity: 'hospital', name: 'City Hospital' } }
        ]
      };

      // Save using precise coordinates
      await saveAreaToCache(12.97841, 77.64082, sampleData, mockStorageAdapter, t0);

      // Query with slightly different coordinates rounding to same 3 decimals (12.978, 77.641)
      const cached = await getAreaFromCache(12.97811, 77.64099, mockStorageAdapter, t0 + 1000);
      assert.ok(cached);
      assert.strictEqual(cached.key, '12.978,77.641');
      assert.strictEqual(cached.status, 'ok');
      assert.strictEqual(cached.elements.length, 1);
      assert.strictEqual(cached.elements[0].tags.name, 'City Hospital');
    });

    it('returns null on cache miss', async () => {
      const res = await getAreaFromCache(26.912, 75.787, mockStorageAdapter);
      assert.strictEqual(res, null);
    });
  });

  describe('2. TTL Expiration (14 Days)', () => {
    it('returns data before 14 days and purges expired entry after 14 days', async () => {
      const t0 = 100000000;
      const data = { status: 'ok', elements: [{ id: 10 }] };

      await saveAreaToCache(26.279, 73.013, data, mockStorageAdapter, t0);

      // Within TTL: 13 days later
      const day13 = t0 + 13 * 24 * 60 * 60 * 1000;
      const hit = await getAreaFromCache(26.279, 73.013, mockStorageAdapter, day13);
      assert.ok(hit);

      // Beyond TTL: 14 days + 1 second later
      const day14Plus = t0 + CACHE_TTL_MS + 1000;
      const expired = await getAreaFromCache(26.279, 73.013, mockStorageAdapter, day14Plus);
      assert.strictEqual(expired, null);

      // Verify expired entry was purged from underlying storage
      const rawStore = await mockStorageAdapter.get(CACHE_STORAGE_KEY);
      assert.strictEqual(rawStore['26.279,73.013'], undefined);
    });
  });

  describe('3. LRU Eviction Cap (50 Entries)', () => {
    it('caps cache at 50 entries and evicts least recently accessed', async () => {
      const t0 = 100000;

      // Insert 50 entries
      for (let i = 1; i <= 50; i++) {
        const lat = 10.0 + i * 0.01;
        const lng = 70.0 + i * 0.01;
        await saveAreaToCache(
          lat,
          lng,
          { status: 'ok', elements: [] },
          mockStorageAdapter,
          t0 + i * 10
        );
      }

      let store = await mockStorageAdapter.get(CACHE_STORAGE_KEY);
      assert.strictEqual(Object.keys(store).length, 50);

      // Access entry 1 to refresh its LRU timestamp
      const lat1 = 10.0 + 1 * 0.01;
      const lng1 = 70.0 + 1 * 0.01;
      await getAreaFromCache(lat1, lng1, mockStorageAdapter, t0 + 5000);

      // Insert 51st entry
      await saveAreaToCache(20.0, 80.0, { status: 'ok', elements: [] }, mockStorageAdapter, t0 + 6000);

      store = await mockStorageAdapter.get(CACHE_STORAGE_KEY);
      const keys = Object.keys(store);
      assert.strictEqual(keys.length, CACHE_MAX_ENTRIES);

      // Entry 1 should still exist because it was accessed recently
      assert.ok(keys.includes('10.01,70.01'));

      // Entry 2 (which was not accessed) should have been evicted
      assert.strictEqual(keys.includes('10.02,70.02'), false);

      // Entry 51 must exist
      assert.ok(keys.includes('20,80'));
    });
  });

  describe('4. Cache Clearance', () => {
    it('clears all entries cleanly', async () => {
      await saveAreaToCache(12.9, 77.6, { status: 'ok' }, mockStorageAdapter);
      await clearAreaCache(mockStorageAdapter);

      const store = await mockStorageAdapter.get(CACHE_STORAGE_KEY);
      assert.deepStrictEqual(store, {});
    });
  });
});
