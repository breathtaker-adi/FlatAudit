import { computeDHashFromImageData } from './lib/dhash.js';
import { getAreaReportSettings } from './lib/settings.js';
import { DEFAULT_BACKEND_URL } from './lib/config.js';

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
 * Validates whether an image URL originates from an approved property portal or standard CDN.
 * Prevents CORS console errors and avoids fetching video embeds, ad trackers, or third-party pixels.
 */
function isSupportedImageOrigin(url) {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim();
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) return false;

  try {
    const parsed = new URL(clean);
    const host = parsed.hostname.toLowerCase();
    
    // Explicit blacklist: video players, analytics, ads, trackers, social widgets
    if (/youtube|ytimg|google|doubleclick|googlesyndication|google-analytics|facebook|vimeo|dailymotion|tracker|pixel|advert/i.test(host)) {
      return false;
    }

    // Explicit path blacklist
    if (/\.(svg|gif|mp4|webm|avi|mkv)($|\?)/i.test(parsed.pathname) || /avatar|badge|favicon|logo|button|thumb_video/i.test(parsed.pathname)) {
      return false;
    }

    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Downloads image via background worker host permissions, draws to 9x8 OffscreenCanvas,
 * and extracts 64-bit dHash. Uses 5-second AbortController timeout and handles CORS/aborts gracefully.
 */
async function computeHashFromUrl(imageUrl) {
  if (!isSupportedImageOrigin(imageUrl)) return null;

  const cleanUrl = imageUrl.trim();
  if (imageHashCache.has(cleanUrl)) {
    return imageHashCache.get(cleanUrl);
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 5000) : null;

  try {
    const response = await fetch(cleanUrl, {
      signal: controller?.signal,
      credentials: 'omit',
      cache: 'force-cache'
    });

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    if (contentType && !contentType.startsWith('image/')) {
      return null;
    }

    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(9, 8);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, 9, 8);

    const imageData = ctx.getImageData(0, 0, 9, 8);
    const hash = computeDHashFromImageData(imageData);

    if (hash) {
      imageHashCache.set(cleanUrl, hash);
    }
    return hash;
  } catch (err) {
    // Network aborted, CORS blocked, or decoding error: handle cleanly without polluting console
    return null;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Communicates with FastAPI backend with timeout protection
 */
async function checkImageSeen(hash) {
  if (!hash) return { seenCount: 1 };
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 3500) : null;
  try {
    const backendUrl = await getBackendUrl();
    const res = await fetch(`${backendUrl}/seen?hash=${encodeURIComponent(hash)}&threshold=10`, {
      signal: controller?.signal
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    // Backend offline or timeout; degrade gracefully
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
  return { seenCount: 1 };
}

async function observeListing(payload) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 3500) : null;
  try {
    const backendUrl = await getBackendUrl();
    const res = await fetch(`${backendUrl}/observe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller?.signal
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    // Backend offline; degrade gracefully
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
  return { status: 'offline' };
}

async function checkMatches(payload) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 3500) : null;
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

    const res = await fetch(`${backendUrl}/matches?${params.toString()}`, {
      signal: controller?.signal
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    // Backend offline; degrade gracefully
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
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

// Extension message listener with strict error boundaries
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || typeof request !== 'object' || !request.type) {
    sendResponse({ error: 'Invalid or missing message type' });
    return false;
  }

  if (request.type === 'COMPUTE_DHASH') {
    computeHashFromUrl(request.imageUrl)
      .then(hash => sendResponse({ hash }))
      .catch(err => sendResponse({ hash: null, error: err?.message || 'Hash failure' }));
    return true; // asynchronous reply
  }

  if (request.type === 'CHECK_SEEN') {
    checkImageSeen(request.hash)
      .then(data => sendResponse(data))
      .catch(err => sendResponse({ seenCount: 1, error: err?.message }));
    return true;
  }

  if (request.type === 'OBSERVE_LISTING') {
    observeListing(request.payload)
      .then(data => sendResponse(data))
      .catch(err => sendResponse({ status: 'offline', error: err?.message }));
    return true;
  }

  if (request.type === 'CHECK_MATCHES') {
    checkMatches(request.payload)
      .then(data => sendResponse(data))
      .catch(err => sendResponse({ match_count: 0, matches: [], error: err?.message }));
    return true;
  }

  if (request.type === 'INGEST_TELEMETRY_OBSERVATION') {
    queueTelemetryObservation(request.payload)
      .then(() => sendResponse({ status: 'queued' }))
      .catch(err => sendResponse({ status: 'failed', error: err?.message }));
    return true;
  }

  if (request.type === 'INGEST_TELEMETRY_FEEDBACK') {
    sendTelemetryFeedback(request.payload)
      .then(data => sendResponse(data))
      .catch(err => sendResponse({ status: 'network_error', error: err?.message }));
    return true;
  }

  if (request.type === 'GET_CACHED_ANALYSIS') {
    try {
      chrome.storage.local.get(['lastAnalysis'], (result) => {
        if (chrome.runtime.lastError) {
          sendResponse(null);
          return;
        }
        sendResponse(result ? result.lastAnalysis || null : null);
      });
    } catch (err) {
      sendResponse(null);
    }
    return true;
  }

  if (request.type === 'AREA_QUERY') {
    getAreaReportSettings()
      .then((settings) => {
        if (!settings || !settings.enabled) {
          sendResponse({ status: 'off', message: 'Area Report is off' });
          return;
        }
        // When enabled, S5 client executes Overpass query
        sendResponse({ status: 'ready' });
      })
      .catch((err) => {
        sendResponse({ status: 'off', error: err?.message });
      });
    return true;
  }

  sendResponse({ error: `Unknown message type: ${request.type}` });
  return false;
});
