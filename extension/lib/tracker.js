/**
 * FlatAudit - Watchlist, Price History & Sparkline Tracker
 * 
 * Provides local-first tracking for rental listings:
 * - Canonical listing key parsing per portal (NoBroker, MagicBricks, 99acres, Housing)
 * - Snapshot recording in chrome.storage.local (with localStorage fallback)
 * - Price-drop and price-change delta calculations
 * - Pure inline SVG sparklines (zero external chart dependencies)
 * - Side-by-side property comparison with best-value calculation
 * - CSV export for user shortlist
 */

/**
 * Strips tracking parameters, hashes, and referral tags from rental URLs.
 * @param {string} rawUrl 
 * @returns {string}
 */
export function canonicalizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  try {
    const parsed = new URL(rawUrl);
    // Retain only clean origin + pathname
    const cleanParams = new URLSearchParams();
    // Keep only essential listing identifiers if present in search params
    for (const [k, v] of parsed.searchParams.entries()) {
      if (/^(id|listing_id|pId|prop_id|property_id)$/i.test(k)) {
        cleanParams.set(k, v);
      }
    }
    const search = cleanParams.toString() ? `?${cleanParams.toString()}` : '';
    return `${parsed.origin}${parsed.pathname}${search}`.replace(/\/+$/, '');
  } catch (e) {
    // If not a valid absolute URL, clean basic query strings
    return rawUrl.split('?')[0].split('#')[0].replace(/\/+$/, '');
  }
}

/**
 * Extracts a stable listing key in format 'portal:id'
 * @param {string} portal 
 * @param {string} url 
 * @param {Document|object} [doc]
 * @returns {string}
 */
export function parseListingKey(portal, url, doc = null) {
  const p = (portal || 'generic').toLowerCase();
  const cleanUrl = canonicalizeUrl(url);

  // 1. Check if container element or document has an explicit ID attribute
  if (doc) {
    // If doc is an Element itself (not Document), check its own attributes first
    if (typeof doc.getAttribute === 'function') {
      const selfId = doc.getAttribute('data-listing-id') ||
                     doc.getAttribute('data-id') ||
                     doc.getAttribute('data-property-id') ||
                     doc.getAttribute('data-pid') ||
                     (doc.id && !/root|body|app/i.test(doc.id) ? doc.id : null);
      if (selfId) {
        return `${p}:${selfId.trim()}`;
      }
    }

    if (typeof doc.querySelector === 'function') {
      const explicitIdEl = doc.querySelector('[data-listing-id], [data-id], [data-property-id], [data-pid], [id^="prop-"], [id^="housing-"], [id^="mb-"], [id^="nb-"]');
      if (explicitIdEl) {
        const explicitId = explicitIdEl.getAttribute('data-listing-id') ||
                           explicitIdEl.getAttribute('data-id') ||
                           explicitIdEl.getAttribute('data-property-id') ||
                           explicitIdEl.getAttribute('data-pid') ||
                           explicitIdEl.id;
        if (explicitId) {
          return `${p}:${explicitId.trim()}`;
        }
      }
    }
  }

  // 2. Portal-specific URL parsing
  if (p === 'nobroker') {
    // Examples: .../property/rent/bangalore/indiranagar/ff808181...
    // or .../property/ff808181...
    const match = cleanUrl.match(/([a-f0-9]{16,36}|nb-[a-z0-9-]+)/i);
    if (match) return `nobroker:${match[1]}`;
  } else if (p === 'magicbricks') {
    // Examples: ...-pdpid-4d4233363032333939 or &id=4d423835353934393739
    const match = cleanUrl.match(/(?:pdpid-|[?&]id=|id-)([a-z0-9]+)/i) || cleanUrl.match(/\/([0-9]{8,14})(?:\.html)?$/);
    if (match) return `magicbricks:${match[1]}`;
  } else if (p === '99acres') {
    // Examples: ...-rpid-R12345678 or ...-npid-N12345678 or ...-npxid-r380406 or ...-spid-Y49932640 or ...-id-12345
    const match = cleanUrl.match(/(?:rpid-|npid-|npxid-|spid-|id-)([a-z0-9]+)/i);
    if (match) return `99acres:${match[1]}`;
  } else if (p === 'housing') {
    // Examples: housing.com/rent/1234567-2-bhk-...
    const match = cleanUrl.match(/\/rent\/(\d+)/i) || cleanUrl.match(/\/(\d{5,10})-/);
    if (match) return `housing:${match[1]}`;
  }

  // 3. Fallback: simple hash of the canonical pathname
  let hash = 0;
  for (let i = 0; i < cleanUrl.length; i++) {
    hash = ((hash << 5) - hash) + cleanUrl.charCodeAt(i);
    hash |= 0;
  }
  const fallbackId = Math.abs(hash).toString(16);
  return `${p}:${fallbackId}`;
}

const _memStore = new Map();

/**
 * Storage adapter for isolated extension storage.
 * 
 * PRIVACY INVARIANT:
 * NEVER uses window.localStorage as a fallback in content scripts.
 * window.localStorage belongs to the host portal origin (e.g. nobroker.in, 99acres.com),
 * so writing user notes, watchlists, or tracking data to localStorage exposes private user
 * browsing data to portal scripts.
 * 
 * When running in the browser extension: Uses strictly isolated chrome.storage.local.
 * When running in Node.js unit tests: Uses an isolated ephemeral in-memory Map (_memStore).
 */
function isRuntimeAvailable() {
  try {
    return typeof chrome !== 'undefined' && Boolean(chrome?.runtime?.id && chrome?.storage?.local);
  } catch (e) {
    return false;
  }
}

export const StorageAdapter = {
  async get(key) {
    if (isRuntimeAvailable()) {
      try {
        const res = await new Promise((resolve) => {
          try {
            chrome.storage.local.get([key], (data) => {
              try {
                if (chrome?.runtime?.lastError) {
                  return resolve(null);
                }
                resolve(data ? data[key] || null : null);
              } catch (innerErr) {
                resolve(null);
              }
            });
          } catch (e) {
            resolve(null);
          }
        });
        if (res !== null && res !== undefined) return res;
      } catch (e) {
        return null;
      }
    }
    // Headless test environment fallback
    return _memStore.has(key) ? _memStore.get(key) : null;
  },

  async set(key, value) {
    _memStore.set(key, value);
    if (isRuntimeAvailable()) {
      try {
        await new Promise((resolve) => {
          try {
            chrome.storage.local.set({ [key]: value }, () => {
              try {
                if (chrome?.runtime?.lastError) {}
              } catch (innerErr) {}
              resolve();
            });
          } catch (e) {
            resolve();
          }
        });
      } catch (e) {
        // Context invalidated — ignore
      }
    }
  },

  clear() {
    _memStore.clear();
  }
};

const STORAGE_KEY_TRACKED = 'tracked_listings';

/**
 * Retrieves all tracked listings map from storage.
 * @returns {Promise<Record<string, object>>}
 */
export async function getTrackedListings() {
  const data = await StorageAdapter.get(STORAGE_KEY_TRACKED);
  return data && typeof data === 'object' ? data : {};
}

/**
 * Adds or updates a listing in the local watchlist.
 * Only appends a new snapshot if rent/deposit changed or > 24 hours elapsed.
 * 
 * @param {object} listing - Parsed listing object
 * @returns {Promise<{ isNew: boolean, priceDropped: boolean, delta: number, trackedItem: object }>}
 */
export async function trackListing(listing) {
  const tracked = await getTrackedListings();
  const listingKey = listing.listingKey || parseListingKey(listing.portal, listing.url);
  const now = Date.now();
  const isSale = listing.listingType === 'sale' || Boolean(listing.price && !listing.rent);
  const currentRent = listing.rent || 0;
  const currentPrice = listing.price || listing.salePrice || (isSale ? currentRent : 0);
  const currentDeposit = listing.deposit || 0;

  let isNew = false;
  let priceDropped = false;
  let delta = 0;

  let item = tracked[listingKey];

  if (!item) {
    isNew = true;
    item = {
      listingKey,
      listingType: isSale ? 'sale' : 'rent',
      portal: listing.portal || 'generic',
      url: canonicalizeUrl(listing.url || ''),
      title: listing.title || (isSale ? 'Untitled Sale Property' : 'Untitled Rental'),
      locality: listing.locality || 'Unknown',
      bhk: listing.bhk || 2,
      price: isSale ? currentPrice : null,
      pricePerSqft: listing.pricePerSqft || null,
      areaType: listing.areaType || 'unknown',
      possessionStatus: listing.possessionStatus || 'unknown',
      reraId: listing.reraId || null,
      projectName: listing.projectName || '',
      areaSqft: listing.areaSqft || listing.area_sqft || null,
      floor: listing.floor !== undefined ? listing.floor : null,
      firstSeen: now,
      lastSeen: now,
      status: 'Interested', // 'Interested' | 'Visited' | 'Rejected'
      note: '',
      signalsFiredCount: listing.signalsFiredCount || 0,
      badgeLabel: listing.badgeLabel || 'Looks normal',
      badgeTone: listing.badgeTone || 'ok',
      snapshots: [
        {
          t: now,
          rent: isSale ? null : currentRent,
          price: isSale ? currentPrice : null,
          deposit: isSale ? null : currentDeposit,
          pricePerSqft: listing.pricePerSqft || null,
          listed: true
        }
      ]
    };
  } else {
    // Existing listing revisit
    item.lastSeen = now;
    item.title = listing.title || item.title;
    item.locality = listing.locality || item.locality;
    if (listing.bhk) item.bhk = listing.bhk;
    if (listing.areaSqft) item.areaSqft = listing.areaSqft;
    if (isSale) {
      item.price = currentPrice || item.price;
      if (listing.pricePerSqft) item.pricePerSqft = listing.pricePerSqft;
      if (listing.reraId) item.reraId = listing.reraId;
      if (listing.possessionStatus) item.possessionStatus = listing.possessionStatus;
    }
    if (listing.signalsFiredCount !== undefined) item.signalsFiredCount = listing.signalsFiredCount;
    if (listing.badgeLabel) item.badgeLabel = listing.badgeLabel;
    if (listing.badgeTone) item.badgeTone = listing.badgeTone;

    const lastSnap = item.snapshots[item.snapshots.length - 1];
    const prevVal = lastSnap ? (isSale ? (lastSnap.price || lastSnap.rent || 0) : (lastSnap.rent || 0)) : (isSale ? currentPrice : currentRent);
    const currVal = isSale ? currentPrice : currentRent;
    delta = currVal - prevVal;

    if (delta < 0) {
      priceDropped = true;
    }

    const timeSinceLastSnap = lastSnap ? now - lastSnap.t : Infinity;
    const priceChanged = isSale 
      ? (lastSnap && lastSnap.price !== currentPrice)
      : (lastSnap && (lastSnap.rent !== currentRent || lastSnap.deposit !== currentDeposit));
    const dayPassed = timeSinceLastSnap >= 24 * 60 * 60 * 1000;

    if (priceChanged || dayPassed || item.snapshots.length === 0) {
      item.snapshots.push({
        t: now,
        rent: isSale ? null : currentRent,
        price: isSale ? currentPrice : null,
        deposit: isSale ? null : currentDeposit,
        pricePerSqft: listing.pricePerSqft || null,
        listed: true
      });
    }
  }

  tracked[listingKey] = item;
  await StorageAdapter.set(STORAGE_KEY_TRACKED, tracked);

  return {
    isNew,
    priceDropped,
    delta,
    trackedItem: item
  };
}

/**
 * Removes a listing from the watchlist.
 * @param {string} listingKey 
 * @returns {Promise<boolean>}
 */
export async function untrackListing(listingKey) {
  const tracked = await getTrackedListings();
  if (tracked[listingKey]) {
    delete tracked[listingKey];
    await StorageAdapter.set(STORAGE_KEY_TRACKED, tracked);
    return true;
  }
  return false;
}

/**
 * Updates status ('Interested', 'Visited', 'Rejected') of a tracked listing.
 * @param {string} listingKey 
 * @param {string} status 
 */
export async function updateListingStatus(listingKey, status) {
  const tracked = await getTrackedListings();
  if (tracked[listingKey]) {
    tracked[listingKey].status = status;
    await StorageAdapter.set(STORAGE_KEY_TRACKED, tracked);
    return true;
  }
  return false;
}

/**
 * Updates the user's private note on a tracked listing.
 * @param {string} listingKey 
 * @param {string} note 
 */
export async function updateListingNote(listingKey, note) {
  const tracked = await getTrackedListings();
  if (tracked[listingKey]) {
    tracked[listingKey].note = note;
    await StorageAdapter.set(STORAGE_KEY_TRACKED, tracked);
    return true;
  }
  return false;
}

/**
 * Computes price history statistics and change since first seen.
 * @param {Array<{ t: number, rent: number, deposit: number }>} snapshots 
 */
export function computePriceHistoryStats(snapshots = []) {
  if (!snapshots || snapshots.length === 0) {
    return {
      currentPrice: 0,
      currentRent: 0,
      firstPrice: 0,
      firstRent: 0,
      lowestPrice: 0,
      lowestRent: 0,
      highestPrice: 0,
      highestRent: 0,
      delta: 0,
      pctChange: 0,
      isDrop: false,
      count: 0,
      source: 'Your Local Browser Tracker',
      trackingSince: 'First seen today'
    };
  }

  const validPrices = snapshots
    .map(s => (typeof s.price === 'number' && s.price > 0 ? s.price : s.rent))
    .filter(r => typeof r === 'number' && r > 0);

  const firstPrice = validPrices[0] || 0;
  const currentPrice = validPrices[validPrices.length - 1] || 0;
  const lowestPrice = validPrices.length ? Math.min(...validPrices) : 0;
  const highestPrice = validPrices.length ? Math.max(...validPrices) : 0;
  const delta = currentPrice - firstPrice;
  const pctChange = firstPrice > 0 ? Math.round((delta / firstPrice) * 100) : 0;

  const firstTime = snapshots[0] ? snapshots[0].t : Date.now();
  const trackingSince = formatTimeOnMarket(firstTime);

  return {
    currentPrice,
    currentRent: currentPrice, // backwards compatibility
    firstPrice,
    firstRent: firstPrice,
    lowestPrice,
    lowestRent: lowestPrice,
    highestPrice,
    highestRent: highestPrice,
    delta,
    pctChange,
    isDrop: delta < 0,
    count: snapshots.length,
    source: 'Your Local Browser Tracker',
    trackingSince
  };
}

/**
 * Calculates monthly Equated Monthly Installment (EMI) for property purchase.
 * Uses exact standard banking amortization formula.
 * @param {number} principal - Loan principal in INR
 * @param {number} [annualRate=8.5] - Annual interest percentage
 * @param {number} [tenureYears=20] - Loan duration in years
 * @returns {{ monthlyEmi: number, totalPayment: number, totalInterest: number }}
 */
export function calculateEMI(principal, annualRate = 8.5, tenureYears = 20) {
  if (!principal || principal <= 0) return { monthlyEmi: 0, totalPayment: 0, totalInterest: 0 };
  const monthlyRate = (annualRate / 12) / 100;
  const totalMonths = tenureYears * 12;
  const factor = Math.pow(1 + monthlyRate, totalMonths);
  const monthlyEmi = Math.round((principal * monthlyRate * factor) / (factor - 1));
  const totalPayment = monthlyEmi * totalMonths;
  const totalInterest = totalPayment - principal;
  return { monthlyEmi, totalPayment, totalInterest };
}

/**
 * Formats time on market in plain English (e.g., "First seen by you 3 days ago")
 * @param {number} timestamp 
 * @returns {string}
 */
export function formatTimeOnMarket(timestamp) {
  if (!timestamp) return 'First seen today';
  const diffMs = Date.now() - timestamp;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'First seen today';
  if (diffDays === 1) return 'First seen 1 day ago';
  return `First seen ${diffDays} days ago`;
}

/**
 * Generates a clean, modern inline SVG sparkline string without external libraries.
 * 
 * @param {Array<{ t: number, rent: number }>} snapshots
 * @param {object} [options]
 * @param {number} [options.width=240]
 * @param {number} [options.height=54]
 * @param {string} [options.color='#6fd6a0']
 * @returns {string} Safe SVG XML string
 */
export function generateSparklineSVG(snapshots = [], options = {}) {
  const width = options.width || 240;
  const height = options.height || 54;
  const padX = 12;
  const padY = 10;
  const drawW = width - padX * 2;
  const drawH = height - padY * 2;

  const rents = snapshots.map(s => s.rent).filter(r => typeof r === 'number' && r > 0);

  // If no data or single data point: render elegant flat baseline
  if (rents.length <= 1) {
    const rentVal = rents[0] || 0;
    const yMid = Math.round(height / 2);
    return `
      <svg class="flataudit-sparkline" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Price history sparkline">
        <line x1="${padX}" y1="${yMid}" x2="${width - padX}" y2="${yMid}" stroke="#4f5e78" stroke-width="2" stroke-dasharray="4 3" />
        <circle cx="${width - padX - 4}" cy="${yMid}" r="3.5" fill="#6fd6a0" />
        <text x="${padX}" y="${height - 4}" fill="#9aa8c2" font-size="10" font-family="sans-serif">₹${rentVal ? rentVal.toLocaleString('en-IN') : '--'} (Current)</text>
      </svg>
    `.trim();
  }

  const minR = Math.min(...rents);
  const maxR = Math.max(...rents);
  const range = maxR - minR || 1;

  // Compute (x, y) coordinates
  const pts = rents.map((r, i) => {
    const x = padX + (i / (rents.length - 1)) * drawW;
    // In SVG, y=0 is top, so higher rent -> lower y
    const y = padY + (1 - (r - minR) / range) * drawH;
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, r };
  });

  const polyPoints = pts.map(p => `${p.x},${p.y}`).join(' ');

  // SVG Area path for smooth gradient fill under the curve
  const firstPt = pts[0];
  const lastPt = pts[pts.length - 1];
  const areaPath = `M ${firstPt.x},${firstPt.y} ` +
                   pts.map(p => `L ${p.x},${p.y}`).join(' ') +
                   ` L ${lastPt.x},${height - 4} L ${firstPt.x},${height - 4} Z`;

  // Determine line color: green if price dropped, red if increased, blue if stable
  const delta = lastPt.r - firstPt.r;
  const strokeColor = delta < 0 ? '#6fd6a0' : delta > 0 ? '#ff8a80' : '#7cc4ff';
  const gradId = `spark-grad-${Math.floor(Math.random() * 100000)}`;

  return `
    <svg class="flataudit-sparkline" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Price history sparkline">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#${gradId})" />
      <polyline points="${polyPoints}" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      ${pts.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="${strokeColor}" stroke="#172030" stroke-width="1.5" />`).join('\n      ')}
    </svg>
  `.trim();
}

/**
 * Computes side-by-side comparison metrics across 2-4 listings
 * and flags the best value for each metric row.
 * 
 * @param {Array<object>} listingsList 
 * @returns {object} Comparison table structure
 */
export function buildComparisonMatrix(listingsList = []) {
  if (!listingsList || listingsList.length === 0) return { columns: [], rows: [] };

  const columns = listingsList.map(item => {
    const stats = computePriceHistoryStats(item.snapshots || []);
    const area = item.areaSqft || null;
    const rent = stats.currentRent || item.rent || 0;
    const deposit = item.deposit || (item.snapshots && item.snapshots[0] ? item.snapshots[0].deposit : 0);
    const rentPerSqft = area && area > 0 && rent > 0 ? Math.round((rent / area) * 10) / 10 : null;
    const depositMultiple = rent > 0 && deposit >= 0 ? Math.round((deposit / rent) * 10) / 10 : null;

    return {
      key: item.listingKey,
      portal: item.portal,
      title: item.title,
      url: item.url,
      locality: item.locality,
      bhk: item.bhk,
      rent,
      deposit,
      area,
      rentPerSqft,
      depositMultiple,
      floor: item.floor !== null && item.floor !== undefined ? item.floor : 'N/A',
      status: item.status || 'Interested',
      note: item.note || '',
      signalsFiredCount: item.signalsFiredCount || 0,
      badgeTone: item.badgeTone || 'ok',
      firstSeenText: formatTimeOnMarket(item.firstSeen)
    };
  });

  // Calculate best values
  const validRents = columns.map(c => c.rent).filter(r => r > 0);
  const minRent = validRents.length ? Math.min(...validRents) : null;

  const validRentSqft = columns.map(c => c.rentPerSqft).filter(r => r !== null && r > 0);
  const minRentSqft = validRentSqft.length ? Math.min(...validRentSqft) : null;

  const validDepositMult = columns.map(c => c.depositMultiple).filter(d => d !== null);
  const minDepositMult = validDepositMult.length ? Math.min(...validDepositMult) : null;

  const minSignals = Math.min(...columns.map(c => c.signalsFiredCount));

  return {
    columns,
    bests: {
      minRent,
      minRentSqft,
      minDepositMult,
      minSignals
    }
  };
}

/**
 * Exports user shortlist to CSV format
 * @param {Record<string, object>} trackedMap 
 * @returns {string} CSV string
 */
export function exportShortlistToCSV(trackedMap = {}) {
  const items = Object.values(trackedMap);
  const headers = [
    'Portal',
    'Listing Key',
    'Title',
    'Locality',
    'BHK',
    'Rent (INR)',
    'Deposit (INR)',
    'Area (sqft)',
    'Floor',
    'Status',
    'User Note',
    'Signals Flagged',
    'First Seen Date',
    'URL'
  ];

  const rows = items.map(it => {
    const stats = computePriceHistoryStats(it.snapshots || []);
    const deposit = it.snapshots && it.snapshots[0] ? it.snapshots[0].deposit : (it.deposit || 0);
    const dateStr = it.firstSeen ? new Date(it.firstSeen).toISOString().slice(0, 10) : '';

    return [
      `"${(it.portal || '').replace(/"/g, '""')}"`,
      `"${(it.listingKey || '').replace(/"/g, '""')}"`,
      `"${(it.title || '').replace(/"/g, '""')}"`,
      `"${(it.locality || '').replace(/"/g, '""')}"`,
      it.bhk || 2,
      stats.currentRent || it.rent || 0,
      deposit,
      it.areaSqft || '',
      it.floor !== null && it.floor !== undefined ? it.floor : '',
      `"${(it.status || 'Interested').replace(/"/g, '""')}"`,
      `"${(it.note || '').replace(/"/g, '""')}"`,
      it.signalsFiredCount || 0,
      `"${dateStr}"`,
      `"${(it.url || '').replace(/"/g, '""')}"`
    ].join(',');
  });

  return [headers.map(h => `"${h}"`).join(','), ...rows].join('\r\n');
}
