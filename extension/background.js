import { computeDHashFromImageData } from './lib/dhash.js';
import { getAreaReportSettings } from './lib/settings.js';

const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8000/api/v1';

async function getBackendUrl() {
  try {
    const data = await chrome.storage.local.get(['flataudit_api_url']);
    if (data.flataudit_api_url && typeof data.flataudit_api_url === 'string') {
      let url = data.flataudit_api_url.trim().replace(/\/+$/, '');
      if (!url.endsWith('/api/v1')) url += '/api/v1';
      return url;
    }
  } catch (e) {}
  return DEFAULT_BACKEND_URL;
}

// In-memory session cache of hashed URLs to prevent redundant network fetches
const imageHashCache = new Map();

/**
 * Downloads image via background worker host permissions, draws to 9x8 OffscreenCanvas,
 * and extracts 64-bit dHash.
 */
async function computeHashFromUrl(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return null;
  const cleanUrl = imageUrl.trim();
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) return null;

  // Skip video player thumbnails, ads, analytics, svg icons, or third-party widgets
  if (/youtube\.com|ytimg\.com|doubleclick|googlesyndication|google-analytics|facebook\.com|favicon|\.svg/i.test(cleanUrl)) {
    return null;
  }

  if (imageHashCache.has(cleanUrl)) {
    return imageHashCache.get(cleanUrl);
  }

  try {
    const response = await fetch(cleanUrl, { mode: 'cors' });
    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(9, 8);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, 9, 8);

    const imageData = ctx.getImageData(0, 0, 9, 8);
    const hash = computeDHashFromImageData(imageData);

    imageHashCache.set(cleanUrl, hash);
    return hash;
  } catch (err) {
    // Silent fallback: never pollutes DevTools console on unreachable CDN or CORS assets
    return null;
  }
}

/**
 * Communicates with FastAPI backend
 */
async function checkImageSeen(hash) {
  if (!hash) return { seenCount: 1 };
  try {
    const backendUrl = await getBackendUrl();
    const res = await fetch(`${backendUrl}/seen?hash=${encodeURIComponent(hash)}&threshold=10`);
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    // Backend offline; degrade gracefully
  }
  return { seenCount: 1 };
}

async function observeListing(payload) {
  try {
    const backendUrl = await getBackendUrl();
    const res = await fetch(`${backendUrl}/observe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    // Backend offline; log locally
  }
  return { status: 'offline' };
}

async function checkMatches(payload) {
  try {
    const backendUrl = await getBackendUrl();
    const params = new URLSearchParams({
      rent: payload.rent,
      portal: payload.portal || '',
      listing_key: payload.listing_key || '',
      locality: payload.locality || '',
      bhk: payload.bhk || 2
    });
    if (payload.area_sqft) params.append('area_sqft', payload.area_sqft);
    if (payload.floor !== null && payload.floor !== undefined) params.append('floor', payload.floor);
    if (payload.image_hash) params.append('image_hash', payload.image_hash);

    const res = await fetch(`${backendUrl}/matches?${params.toString()}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {}
  return { match_count: 0, matches: [] };
}

// Telemetry In-Memory Buffer & Queue Management (Weeks 3-5 Pilot)
let _telemetryQueue = [];
let _flushTimer = null;

async function queueTelemetryObservation(payload) {
  _telemetryQueue.push(payload);
  if (_telemetryQueue.length >= 10) {
    flushTelemetryQueue();
  } else if (!_flushTimer) {
    _flushTimer = setTimeout(flushTelemetryQueue, 15000);
  }
}

async function flushTelemetryQueue() {
  if (_flushTimer) {
    clearTimeout(_flushTimer);
    _flushTimer = null;
  }
  if (_telemetryQueue.length === 0) return;

  const batch = [..._telemetryQueue];
  _telemetryQueue = [];

  const backendUrl = await getBackendUrl();
  for (const item of batch) {
    try {
      const res = await fetch(`${backendUrl}/telemetry/observation`, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      if (!res.ok) {
        throw new Error(`Status ${res.status}`);
      }
    } catch (e) {
      // Offline fallback: save to FIFO in chrome.storage.local capped at 100 entries
      try {
        const stored = await chrome.storage.local.get(['flataudit_telemetry_fifo']);
        const fifo = stored.flataudit_telemetry_fifo || [];
        fifo.push(item);
        while (fifo.length > 100) fifo.shift();
        await chrome.storage.local.set({ flataudit_telemetry_fifo: fifo });
      } catch (err) {}
    }
  }
}

async function sendTelemetryFeedback(payload) {
  const backendUrl = await getBackendUrl();
  try {
    const res = await fetch(`${backendUrl}/telemetry/feedback`, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.ok ? await res.json() : { status: 'failed' };
  } catch (e) {
    return { status: 'network_error' };
  }
}

// Extension message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'COMPUTE_DHASH') {
    computeHashFromUrl(request.imageUrl).then(hash => sendResponse({ hash }));
    return true; // asynchronous reply
  }

  if (request.type === 'CHECK_SEEN') {
    checkImageSeen(request.hash).then(data => sendResponse(data));
    return true;
  }

  if (request.type === 'OBSERVE_LISTING') {
    observeListing(request.payload).then(data => sendResponse(data));
    return true;
  }

  if (request.type === 'CHECK_MATCHES') {
    checkMatches(request.payload).then(data => sendResponse(data));
    return true;
  }

  if (request.type === 'INGEST_TELEMETRY_OBSERVATION') {
    queueTelemetryObservation(request.payload).then(() => sendResponse({ status: 'queued' }));
    return true;
  }

  if (request.type === 'INGEST_TELEMETRY_FEEDBACK') {
    sendTelemetryFeedback(request.payload).then(data => sendResponse(data));
    return true;
  }

  if (request.type === 'GET_CACHED_ANALYSIS') {
    chrome.storage.local.get(['lastAnalysis'], (result) => {
      sendResponse(result.lastAnalysis || null);
    });
    return true;
  }

  if (request.type === 'AREA_QUERY') {
    getAreaReportSettings().then((settings) => {
      if (!settings.enabled) {
        sendResponse({ status: 'off', message: 'Area Report is off' });
        return;
      }
      // When enabled, S5 client executes Overpass query
      sendResponse({ status: 'ready' });
    }).catch(() => {
      sendResponse({ status: 'off' });
    });
    return true;
  }
});
