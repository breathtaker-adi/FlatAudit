import { computeDHashFromImageData } from './lib/dhash.js';

const BACKEND_URL = 'http://127.0.0.1:8000/api/v1';

// In-memory session cache of hashed URLs to prevent redundant network fetches
const imageHashCache = new Map();

/**
 * Downloads image via background worker host permissions, draws to 9x8 OffscreenCanvas,
 * and extracts 64-bit dHash.
 */
async function computeHashFromUrl(imageUrl) {
  if (imageHashCache.has(imageUrl)) {
    return imageHashCache.get(imageUrl);
  }

  try {
    const response = await fetch(imageUrl, { mode: 'cors' });
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(9, 8);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, 9, 8);

    const imageData = ctx.getImageData(0, 0, 9, 8);
    const hash = computeDHashFromImageData(imageData);

    imageHashCache.set(imageUrl, hash);
    return hash;
  } catch (err) {
    console.warn('[FlatAudit ServiceWorker] Could not compute dHash for image:', imageUrl, err.message);
    return null;
  }
}

/**
 * Communicates with local FastAPI backend
 */
async function checkImageSeen(hash) {
  if (!hash) return { seenCount: 1 };
  try {
    const res = await fetch(`${BACKEND_URL}/seen?hash=${encodeURIComponent(hash)}&threshold=10`);
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
    const res = await fetch(`${BACKEND_URL}/observe`, {
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

  if (request.type === 'GET_CACHED_ANALYSIS') {
    chrome.storage.local.get(['lastAnalysis'], (result) => {
      sendResponse(result.lastAnalysis || null);
    });
    return true;
  }
});
