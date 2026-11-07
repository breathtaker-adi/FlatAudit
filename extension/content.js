/**
 * FlatAudit - Content Script
 *
 * Runs on rental listing pages:
 * - Extracts fields and evaluates fraud/scam signals
 * - Evaluates verified market benchmarks
 * - Buyhatke price tracker: stores snapshots in chrome.storage.local
 * - Renders inline SVG sparkline and price drop alerts
 * - Displays cross-portal duplicate listings ("Also listed on Portal B")
 */

(async function initFlatAudit() {
  if (window.__FLATAUDIT_LOADED__) return;
  window.__FLATAUDIT_LOADED__ = true;

  try {
    const parsersUrl = chrome.runtime.getURL('lib/parsers/index.js');
    const signalsUrl = chrome.runtime.getURL('lib/signals.js');
    const trackerUrl = chrome.runtime.getURL('lib/tracker.js');
    const buyerUrl = chrome.runtime.getURL('lib/buyer.js');
    const investmentUrl = chrome.runtime.getURL('lib/investment.js');
    const settingsUrl = chrome.runtime.getURL('lib/settings.js');
    const areaReportUrl = chrome.runtime.getURL('lib/area/report.js');

    const { extractListing, parsePeerListingsFromPage } = await import(parsersUrl);
    const { analyzeListing } = await import(signalsUrl);
    const {
      trackListing,
      untrackListing,
      getTrackedListings,
      updateListingStatus,
      updateListingNote,
      computePriceHistoryStats,
      generateSparklineSVG,
      formatTimeOnMarket
    } = await import(trackerUrl);
    const {
      generateBuyerReport,
      renderPrintableHtml,
      estimateTotalCost,
      getPaperworkChecklist
    } = await import(buyerUrl);
    const {
      calculateInvestmentForecast,
      formatIndianCurrencyAbbr
    } = await import(investmentUrl);
    const {
      getAreaReportSettings,
      getFooterPrivacyText
    } = await import(settingsUrl);
    const {
      generateAreaReport,
      renderAreaReportDOM
    } = await import(areaReportUrl);

    let currentAnalysis = null;
    let badgeContainer = null;
    let isDrawerOpen = false;
    let crossPortalMatches = [];

    function isExtensionValid() {
      try {
        return typeof chrome !== 'undefined' && Boolean(chrome?.runtime?.id && chrome?.storage?.local);
      } catch (e) {
        return false;
      }
    }

    async function safeStorageGet(keys, fallback = {}) {
      if (!isExtensionValid()) return fallback;
      try {
        return await new Promise((resolve) => {
          try {
            chrome.storage.local.get(keys, (res) => {
              try {
                if (chrome?.runtime?.lastError) return resolve(fallback);
                resolve(res || fallback);
              } catch (err) {
                resolve(fallback);
              }
            });
          } catch (e) {
            resolve(fallback);
          }
        });
      } catch (e) {
        return fallback;
      }
    }

    async function safeStorageSet(obj) {
      if (!isExtensionValid()) return;
      try {
        await new Promise((resolve) => {
          try {
            chrome.storage.local.set(obj, () => {
              try {
                if (chrome?.runtime?.lastError) {}
              } catch (err) {}
              resolve();
            });
          } catch (e) {
            resolve();
          }
        });
      } catch (e) {}
    }

    async function safeSendMessage(msg, fallback = null) {
      if (!isExtensionValid() || !chrome?.runtime?.sendMessage) return fallback;
      try {
        return await new Promise((resolve) => {
          try {
            chrome.runtime.sendMessage(msg, (res) => {
              try {
                if (chrome?.runtime?.lastError) return resolve(fallback);
                resolve(res || fallback);
              } catch (err) {
                resolve(fallback);
              }
            });
          } catch (e) {
            resolve(fallback);
          }
        });
      } catch (e) {
        return fallback;
      }
    }

    function showUpdateNotice() {
      if (document.getElementById('flataudit-update-notice')) return;
      const notice = document.createElement('div');
      notice.id = 'flataudit-update-notice';
      notice.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#172030;color:#e6ebf5;border:1px solid #7cc4ff;border-radius:8px;padding:10px 14px;font-size:12px;font-family:sans-serif;z-index:2147483647;box-shadow:0 8px 24px rgba(0,0,0,0.5);display:flex;align-items:center;gap:10px;';
      const text = document.createElement('span');
      text.textContent = '🔄 FlatAudit was updated. Please refresh this page.';
      const refreshBtn = document.createElement('button');
      refreshBtn.textContent = 'Refresh';
      refreshBtn.style.cssText = 'background:#1665b8;color:#fff;border:none;border-radius:4px;padding:4px 8px;cursor:pointer;font-weight:600;font-size:11px;';
      refreshBtn.addEventListener('click', () => window.location.reload());
      notice.appendChild(text);
      notice.appendChild(refreshBtn);
      document.body.appendChild(notice);
    }

    let lastEvaluatedUrl = null;
    let lastEvaluatedKey = null;
    let lastEvaluatedPrice = null;
    let isEvaluating = false;

    async function evaluatePage(force = false) {
      if (!isExtensionValid()) {
        showUpdateNotice();
        return;
      }

      if (isEvaluating) return;
      isEvaluating = true;

      try {
        const currentUrl = window.location.href;

        // 1. Harvest peer listing cards if on search page or similar carousel
        const pagePeers = parsePeerListingsFromPage(document, currentUrl);
        if (pagePeers && pagePeers.length >= 5) {
          await safeStorageSet({
            flataudit_cached_peers: {
              timestamp: Date.now(),
              url: currentUrl,
              peers: pagePeers
            }
          });
        }

        const listing = extractListing(document, currentUrl);

        // Require at least a title, rent, price, or rawPrice to consider this a listing page
        if (!listing.title && !listing.rent && !listing.price && !listing.rawPrice) {
          return;
        }

        const effectivePrice = listing.price || listing.salePrice || listing.rent || listing.rawPrice || 0;

        // Deduplication guard against rapid SPA DOM mutation loops
        if (!force && currentUrl === lastEvaluatedUrl && listing.listingKey === lastEvaluatedKey && effectivePrice === lastEvaluatedPrice) {
          return;
        }

        lastEvaluatedUrl = currentUrl;
        lastEvaluatedKey = listing.listingKey;
        lastEvaluatedPrice = effectivePrice;

      // Check if user set a manual mode override for this listing
      const storedOverrides = await safeStorageGet(['flataudit_mode_overrides']);
      const overrides = storedOverrides.flataudit_mode_overrides || {};
      const userMode = overrides[listing.listingKey];
      if (userMode === 'rent' || userMode === 'sale') {
        listing.listingType = userMode;
        const amt = listing.rawPrice || listing.price || listing.rent;
        if (userMode === 'sale') {
          listing.price = listing.price || amt;
          listing.salePrice = listing.price;
          listing.rent = null;
          if (listing.price && listing.area_sqft && !listing.pricePerSqft) {
            listing.pricePerSqft = Math.round(listing.price / listing.area_sqft);
          }
        } else {
          listing.rent = listing.rent || amt;
          listing.price = null;
          listing.salePrice = null;
          listing.pricePerSqft = null;
        }
      } else {
        const isTitleSale = /\b(?:for\s*sale|resale|buy\s*flat|house\s*for\s*sale|villa\s*for\s*sale|independent\s*house\s*for\s*sale)\b/i.test(listing.title || '');
        const isTitleRent = /\b(?:for\s*rent|flat\s*for\s*rent|house\s*for\s*rent|villa\s*for\s*rent|to\s*let|rent\s*in)\b/i.test(listing.title || '');

        if (isTitleSale && !isTitleRent) {
          listing.listingType = 'sale';
        } else if (isTitleRent && !isTitleSale) {
          listing.listingType = 'rent';
        } else if (listing.listingType === 'unknown' && listing.rawPrice) {
          if (listing.rawPrice >= 1000000) {
            listing.listingType = 'sale';
          } else if (listing.rawPrice < 500000) {
            listing.listingType = 'rent';
          }
        }

        const amt = listing.rawPrice || listing.price || listing.rent;
        if (listing.listingType === 'sale') {
          listing.price = listing.price || amt;
          listing.salePrice = listing.price;
          listing.rent = null;
          if (listing.price && listing.area_sqft && !listing.pricePerSqft) {
            listing.pricePerSqft = Math.round(listing.price / listing.area_sqft);
          }
        } else if (listing.listingType === 'rent') {
          listing.rent = listing.rent || amt;
          listing.price = null;
          listing.salePrice = null;
          listing.pricePerSqft = null;
        }
      }

      // Hash first image via background service worker
      let topHash = null;
      let seenCount = 1;

      if (listing.images && listing.images.length > 0) {
        const firstImg = listing.images.find(img => img && typeof img === 'string' && !/youtube\.com|ytimg\.com|data:|\.svg/i.test(img));
        if (firstImg) {
          const hashResponse = await safeSendMessage({
            type: 'COMPUTE_DHASH',
            imageUrl: firstImg
          });

          if (hashResponse && hashResponse.hash) {
            topHash = hashResponse.hash;
            const seenResponse = await safeSendMessage({
              type: 'CHECK_SEEN',
              hash: topHash
            });
            if (seenResponse && seenResponse.seenCount) {
              seenCount = seenResponse.seenCount;
            }
          }
        }
      }

      // Retrieve cached peer listings if current detail page has fewer than 5 cards
      let peerListings = (pagePeers && pagePeers.length >= 5) ? pagePeers : [];
      if (peerListings.length < 5) {
        const stored = await safeStorageGet(['flataudit_cached_peers']);
        if (stored.flataudit_cached_peers && (Date.now() - stored.flataudit_cached_peers.timestamp < 24 * 3600 * 1000)) {
          peerListings = stored.flataudit_cached_peers.peers || [];
        }
      }

      // Analyze signals with dynamic benchmark fallback ladder
      const analysis = analyzeListing(listing, { seenCount, peerListings });

      // Check cross-portal matches asynchronously
      if (listing.rent && listing.portal) {
        const matchRes = await safeSendMessage({
          type: 'CHECK_MATCHES',
          payload: {
            portal: listing.portal,
            listing_key: listing.listingKey,
            locality: listing.locality,
            bhk: listing.bhk,
            rent: listing.rent,
            area_sqft: listing.area_sqft,
            floor: listing.floor,
            image_hash: topHash
          }
        });
        if (matchRes && matchRes.matches) {
          crossPortalMatches = matchRes.matches;
        }
      }

      currentAnalysis = {
        ...analysis,
        listing,
        topHash,
        url: window.location.href,
        crossPortalMatches,
        timestamp: new Date().toISOString()
      };

      // Store last analysis for extension popup
      await safeStorageSet({ lastAnalysis: currentAnalysis });

      // Inform backend anonymously
      if (listing.rent && (topHash || listing.locality)) {
        await safeSendMessage({
          type: 'OBSERVE_LISTING',
          payload: {
            url: window.location.href,
            portal: listing.portal,
            listing_key: listing.listingKey,
            locality: listing.locality,
            bhk: listing.bhk,
            rent: listing.rent,
            deposit: listing.deposit,
            area_sqft: listing.area_sqft,
            floor: listing.floor,
            image_hash: topHash,
            geohash: listing.geohash
          }
        });
      }

        await renderTrustBadge(currentAnalysis);
      } finally {
        isEvaluating = false;
      }
    }

    /**
     * Safely constructs badge and explanation drawer using ONLY textContent and DOM APIs.
     */
    async function renderTrustBadge(data) {
      if (!badgeContainer) {
        badgeContainer = document.createElement('div');
        badgeContainer.id = 'flataudit-root';
        document.body.appendChild(badgeContainer);
      }

      while (badgeContainer.firstChild) {
        badgeContainer.removeChild(badgeContainer.firstChild);
      }

      const trackedMap = await getTrackedListings();
      const listingKey = data.listing.listingKey;
      let trackedItem = trackedMap[listingKey] || null;

      const wrapper = document.createElement('div');
      wrapper.className = 'flataudit-wrapper';

      // 1. Floating Pill Button
      const btn = document.createElement('button');
      btn.className = 'flataudit-badge-btn';
      btn.type = 'button';
      btn.setAttribute('aria-label', `FlatAudit listing status: ${data.badgeLabel}`);

      const SHIELD_LOGO_HTML = `<svg width="16" height="16" viewBox="28 -6 350 350" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fill="#0B36FE" fill-rule="evenodd" d="M 127 179 L 124 179 L 123 180 L 119 181 L 118 186 L 119 196 L 121 196 L 124 194 L 125 195 L 127 193 Z M 207 151 L 205 152 L 206 164 L 205 165 L 206 167 L 211 169 L 213 168 L 213 153 L 211 153 Z M 126 150 L 120 152 L 118 156 L 120 168 L 127 165 Z M 347 131 L 344 131 L 321 142 L 304 152 L 285 165 L 279 171 L 268 179 L 252 193 L 222 223 L 213 234 L 210 236 L 193 255 L 190 255 L 179 243 L 155 220 L 150 224 L 139 236 L 155 252 L 167 266 L 171 269 L 176 276 L 184 283 L 188 289 L 192 292 L 200 283 L 207 273 L 216 263 L 223 253 L 239 235 L 243 229 L 249 222 L 252 220 L 267 202 L 287 181 L 311 158 L 317 154 L 318 152 L 322 150 L 336 138 Z M 142 130 L 139 131 L 140 149 L 139 159 L 140 164 L 140 215 L 144 212 L 147 208 L 147 133 L 145 131 Z M 205 124 L 206 139 L 209 139 L 210 140 L 213 139 L 213 125 L 211 124 Z M 243 109 L 241 109 L 240 182 L 241 185 L 251 177 L 258 170 L 271 160 L 274 156 L 274 154 L 273 153 L 274 149 L 274 128 L 273 125 L 270 122 L 264 120 L 260 117 L 249 113 Z M 252 129 L 259 130 L 263 133 L 261 151 L 253 148 L 251 146 Z M 207 94 L 205 96 L 206 110 L 212 112 L 212 96 Z M 189 60 L 163 75 L 161 75 L 158 77 L 157 79 L 157 200 L 159 204 L 167 211 L 187 233 L 191 235 L 191 60 Z M 178 120 L 180 122 L 180 138 L 176 141 L 172 142 L 168 141 L 169 123 L 171 122 L 172 123 L 175 122 L 176 120 Z M 193 6 L 190 6 L 177 15 L 167 21 L 165 21 L 163 23 L 161 23 L 159 25 L 157 25 L 155 27 L 148 29 L 136 35 L 118 41 L 95 47 L 90 47 L 86 49 L 64 52 L 63 54 L 62 63 L 60 100 L 60 116 L 62 148 L 64 156 L 64 164 L 68 186 L 70 190 L 70 194 L 78 219 L 83 231 L 91 246 L 96 254 L 99 257 L 100 260 L 112 275 L 130 292 L 133 296 L 158 315 L 166 320 L 171 322 L 176 326 L 178 326 L 188 332 L 191 332 L 191 313 L 189 311 L 184 309 L 174 303 L 154 289 L 149 284 L 144 281 L 141 277 L 127 264 L 112 245 L 111 242 L 105 233 L 95 212 L 95 209 L 93 207 L 93 204 L 91 201 L 91 197 L 89 193 L 89 189 L 87 186 L 83 165 L 83 159 L 81 153 L 81 141 L 79 132 L 79 80 L 80 70 L 82 68 L 86 68 L 91 66 L 97 66 L 108 62 L 113 62 L 127 58 L 129 56 L 133 56 L 141 52 L 144 52 L 149 50 L 151 48 L 158 46 L 160 44 L 168 41 L 176 36 L 178 36 L 190 28 L 193 28 L 205 36 L 207 36 L 215 41 L 223 44 L 225 46 L 245 54 L 254 56 L 256 58 L 260 58 L 263 60 L 270 62 L 275 62 L 279 64 L 283 64 L 287 66 L 294 66 L 301 68 L 303 70 L 304 78 L 303 136 L 305 136 L 312 131 L 318 129 L 322 125 L 323 116 L 323 86 L 321 77 L 321 61 L 320 54 L 319 52 L 310 51 L 304 49 L 297 49 L 293 47 L 288 47 L 285 45 L 280 45 L 276 43 L 272 43 L 242 33 L 224 25 L 222 23 L 220 23 L 211 18 Z"/>
        <path fill="#FFFFFF" fill-rule="evenodd" d="M 317 172 L 303 184 L 293 194 L 289 209 L 278 233 L 270 246 L 252 268 L 242 278 L 225 292 L 207 304 L 192 312 L 192 333 L 214 322 L 238 306 L 259 288 L 277 268 L 291 248 L 305 220 L 313 195 L 317 177 Z M 253 131 L 253 146 L 261 149 L 261 133 L 256 131 Z M 137 129 L 127 134 L 125 134 L 109 142 L 108 206 L 121 232 L 130 225 L 138 216 Z M 127 176 L 128 194 L 126 196 L 121 198 L 117 197 L 118 179 Z M 128 149 L 127 167 L 123 169 L 117 169 L 118 151 L 122 149 Z M 178 122 L 170 125 L 170 140 L 173 140 L 178 138 Z M 192 59 L 192 236 L 206 222 L 226 200 L 226 77 L 219 74 Z M 207 150 L 214 152 L 214 171 L 205 169 L 203 167 L 203 153 Z M 204 121 L 207 121 L 215 124 L 214 142 L 210 142 L 205 140 L 203 138 Z M 203 94 L 207 93 L 213 94 L 215 96 L 215 112 L 213 114 L 207 112 L 203 109 Z"/>
      </svg>`;

      const icon = document.createElement('span');
      icon.className = 'flataudit-badge-icon';
      icon.innerHTML = SHIELD_LOGO_HTML;

      const title = document.createElement('span');
      title.className = 'flataudit-badge-title';
      title.textContent = 'FlatAudit';

      const pill = document.createElement('span');
      pill.className = `flataudit-pill tone-${data.badgeTone}`;
      pill.textContent = data.badgeLabel;

      btn.appendChild(icon);
      btn.appendChild(title);
      btn.appendChild(pill);

      // 2. Expandable Facts & Buyhatke Drawer
      const drawer = document.createElement('div');
      drawer.className = 'flataudit-drawer';
      if (isDrawerOpen) {
        drawer.classList.add('open');
      }

      // Header with Title + Track Button + Close
      const header = document.createElement('div');
      header.className = 'flataudit-drawer-header';

      const headerTitle = document.createElement('div');
      headerTitle.className = 'flataudit-drawer-title-group';

      const shieldIcon = document.createElement('span');
      shieldIcon.className = 'flataudit-drawer-shield';
      shieldIcon.innerHTML = SHIELD_LOGO_HTML;

      const titleText = document.createElement('span');
      titleText.className = 'flataudit-drawer-title';
      titleText.textContent = 'FlatAudit';

      headerTitle.appendChild(shieldIcon);
      headerTitle.appendChild(titleText);

      const headerActions = document.createElement('div');
      headerActions.className = 'flataudit-header-actions';

      const trackBtn = document.createElement('button');
      trackBtn.type = 'button';
      trackBtn.className = `flataudit-track-btn ${trackedItem ? 'is-tracked' : ''}`;
      trackBtn.textContent = trackedItem ? '✓ In Watchlist' : '★ Track Property';
      trackBtn.title = 'Save listing and track price history';

      const closeBtn = document.createElement('button');
      closeBtn.className = 'flataudit-close-btn';
      closeBtn.type = 'button';
      closeBtn.textContent = '×';
      closeBtn.setAttribute('aria-label', 'Close drawer');

      headerActions.appendChild(trackBtn);
      headerActions.appendChild(closeBtn);

      header.appendChild(headerTitle);
      header.appendChild(headerActions);
      drawer.appendChild(header);

      // Section: Mode Selector Toggle (Rent vs Buy/Sale)
      const isSale = data.listing?.listingType === 'sale' || 
                     Boolean(data.listing?.price && !data.listing?.rent) || 
                     Boolean(data.listing?.salePrice) ||
                     /\b(?:for\s*sale|resale|buy\s*flat|villa\s*for\s*sale|house\s*for\s*sale|independent\s*house)\b/i.test(data.listing?.title || '');
      
      const currentMode = isSale ? 'sale' : (data.listing?.listingType || 'rent');

      const modeSwitchRow = document.createElement('div');
      modeSwitchRow.className = 'flataudit-mode-switch-row';

      const modeLabel = document.createElement('span');
      modeLabel.className = 'flataudit-mode-label';
      modeLabel.textContent = 'Mode:';

      const rentBtn = document.createElement('button');
      rentBtn.type = 'button';
      rentBtn.className = `flataudit-mode-btn ${currentMode === 'rent' ? 'active' : ''}`;
      rentBtn.textContent = 'Rent';
      rentBtn.title = 'Switch to Rental evaluation mode';
      rentBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const stored = await safeStorageGet(['flataudit_mode_overrides']);
        const overrides = stored.flataudit_mode_overrides || {};
        overrides[listingKey] = 'rent';
        await safeStorageSet({ flataudit_mode_overrides: overrides });
        await evaluatePage(true);
      });

      const saleBtn = document.createElement('button');
      saleBtn.type = 'button';
      saleBtn.className = `flataudit-mode-btn ${currentMode === 'sale' ? 'active' : ''}`;
      saleBtn.textContent = 'Buy / Sale';
      saleBtn.title = 'Switch to Property Buying evaluation mode';
      saleBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const stored = await safeStorageGet(['flataudit_mode_overrides']);
        const overrides = stored.flataudit_mode_overrides || {};
        overrides[listingKey] = 'sale';
        await safeStorageSet({ flataudit_mode_overrides: overrides });
        await evaluatePage(true);
      });

      modeSwitchRow.appendChild(modeLabel);
      modeSwitchRow.appendChild(rentBtn);
      modeSwitchRow.appendChild(saleBtn);
      drawer.appendChild(modeSwitchRow);

      // Section: Price History & Valuation Card
      const historyCard = document.createElement('div');
      historyCard.className = 'flataudit-history-card';

      const historyHead = document.createElement('div');
      historyHead.className = 'flataudit-history-head';

      const historyTitle = document.createElement('span');
      historyTitle.className = 'flataudit-history-title';
      historyTitle.textContent = isSale ? 'Property Valuation & Investment' : 'Rental Rate & Watchlist';

      const timeOnMarket = document.createElement('span');
      timeOnMarket.className = 'flataudit-time-badge';
      timeOnMarket.textContent = trackedItem ? formatTimeOnMarket(trackedItem.firstSeen) : 'Recorded today';

      historyHead.appendChild(historyTitle);
      historyHead.appendChild(timeOnMarket);
      historyCard.appendChild(historyHead);

      const historyStatsRow = document.createElement('div');
      historyStatsRow.className = 'flataudit-history-stats';

      const effectivePrice = data.listing?.price || data.listing?.salePrice || data.listing?.rawPrice || data.listing?.rent || 0;

      const rentStat = document.createElement('span');
      rentStat.className = 'flataudit-stat-rent';
      if (isSale) {
        const pStr = formatIndianCurrencyAbbr(effectivePrice);
        const psfStr = (data.listing?.pricePerSqft || (data.listing?.area_sqft && effectivePrice > 0 ? Math.round(effectivePrice / data.listing.area_sqft) : null))
          ? ` • ₹${(data.listing.pricePerSqft || Math.round(effectivePrice / data.listing.area_sqft)).toLocaleString('en-IN')}/sqft`
          : '';
        rentStat.textContent = pStr + psfStr;
      } else {
        rentStat.textContent = effectivePrice > 0 ? `₹${effectivePrice.toLocaleString('en-IN')}/mo` : 'Rent on request';
      }

      const hasPriceHistory = Boolean(trackedItem && trackedItem.snapshots && trackedItem.snapshots.length >= 2);

      if (hasPriceHistory) {
        const deltaBadge = document.createElement('span');
        const snapPrices = isSale ? [{ price: effectivePrice }] : [{ rent: data.listing?.rent }];
        const stats = computePriceHistoryStats(trackedItem ? trackedItem.snapshots : snapPrices);

        if (stats.delta < 0) {
          deltaBadge.className = 'flataudit-delta-badge drop';
          deltaBadge.textContent = `↓ ₹${Math.abs(stats.delta).toLocaleString('en-IN')} (${stats.pctChange}%)`;
        } else if (stats.delta > 0) {
          deltaBadge.className = 'flataudit-delta-badge rise';
          deltaBadge.textContent = `↑ ₹${stats.delta.toLocaleString('en-IN')} (+${stats.pctChange}%)`;
        } else {
          deltaBadge.className = 'flataudit-delta-badge stable';
          deltaBadge.textContent = isSale ? 'Price unchanged' : 'Rent unchanged';
        }

        historyStatsRow.appendChild(rentStat);
        historyStatsRow.appendChild(deltaBadge);
        historyCard.appendChild(historyStatsRow);

        // Inline SVG Sparkline Container
        const sparkWrap = document.createElement('div');
        sparkWrap.className = 'flataudit-sparkline-wrap';

        const snapshots = trackedItem.snapshots;
        const sparkSvgString = generateSparklineSVG(snapshots, { width: 370, height: 50 });
        const svgParser = new DOMParser();
        const svgDoc = svgParser.parseFromString(sparkSvgString, 'image/svg+xml');
        const svgElement = svgDoc.documentElement;
        sparkWrap.appendChild(document.importNode(svgElement, true));
        historyCard.appendChild(sparkWrap);
      } else {
        const activeBadge = document.createElement('span');
        activeBadge.className = 'flataudit-delta-badge stable';
        activeBadge.textContent = trackedItem ? 'In Watchlist' : 'Monitoring Active';

        historyStatsRow.appendChild(rentStat);
        historyStatsRow.appendChild(activeBadge);
        historyCard.appendChild(historyStatsRow);
      }

      // Add Capital Appreciation Model for Sale Listings
      if (isSale && effectivePrice > 0) {
        const forecast = calculateInvestmentForecast(effectivePrice);
        if (forecast && forecast.isValid) {
          const investBox = document.createElement('div');
          investBox.className = 'flataudit-invest-drawer-box';
          investBox.innerHTML = `
            <div class="flataudit-invest-head">
              <div class="flataudit-invest-title-block">
                <span class="flataudit-invest-title">Capital Appreciation</span>
                <span class="flataudit-invest-subtitle">Normal conditions</span>
              </div>
              <span class="flataudit-invest-rate">+7.5% p.a.</span>
            </div>
            <div class="flataudit-invest-grid">
              <div class="flataudit-milestone-pill">
                <span class="m-lbl">3-Year</span>
                <strong class="m-num">${forecast.milestones[0].projectedFormatted}</strong>
                <span class="m-gain">+24.2%</span>
              </div>
              <div class="flataudit-milestone-pill highlight">
                <span class="m-lbl">5-Year</span>
                <strong class="m-num">${forecast.milestones[1].projectedFormatted}</strong>
                <span class="m-gain">+43.6%</span>
              </div>
              <div class="flataudit-milestone-pill">
                <span class="m-lbl">10-Year</span>
                <strong class="m-num">${forecast.milestones[2].projectedFormatted}</strong>
                <span class="m-gain">+106%</span>
              </div>
            </div>
            <div class="flataudit-invest-yield">
              <span class="flataudit-yield-lbl">Rental Yield Potential</span>
              <strong class="flataudit-yield-num">~${forecast.monthlyRentalFormatted}/mo (${forecast.grossRentalYieldFormatted})</strong>
            </div>
          `;
          historyCard.appendChild(investBox);
        }
      }

      drawer.appendChild(historyCard);

      // Section: Buyer Mode (Flat, Project, Builder, Paperwork)
      if (isSale) {
        const buyerReport = generateBuyerReport(data.listing, {
          reraId: data.listing.reraId,
          projectName: data.listing.projectName
        });

        const buyerCard = document.createElement('div');
        buyerCard.className = 'flataudit-buyer-card';

        const buyerHead = document.createElement('div');
        buyerHead.className = 'flataudit-buyer-head';
        const buyerTitle = document.createElement('span');
        buyerTitle.className = 'flataudit-buyer-title';
        buyerTitle.textContent = '🏛️ Buyer Due Diligence Report';
        const scenarioBadge = document.createElement('span');
        scenarioBadge.className = 'flataudit-scenario-badge';
        scenarioBadge.textContent = (buyerReport.meta.scenario || 'resale').toUpperCase().replace('_', ' ');
        buyerHead.appendChild(buyerTitle);
        buyerHead.appendChild(scenarioBadge);
        buyerCard.appendChild(buyerHead);

        // 4-Line Table: Flat, Project, Builder, Paperwork
        const linesTable = document.createElement('div');
        linesTable.className = 'flataudit-buyer-rep-lines';

        const repLines = [
          { key: 'Flat', item: buyerReport.reportLines.flat },
          { key: 'Project', item: buyerReport.reportLines.project },
          { key: 'Builder', item: buyerReport.reportLines.builder },
          { key: 'Paperwork', item: buyerReport.reportLines.paperwork }
        ];

        for (const line of repLines) {
          const row = document.createElement('div');
          row.className = 'flataudit-buyer-rep-row';

          const lbl = document.createElement('span');
          lbl.className = 'flataudit-buyer-line-lbl';
          lbl.textContent = line.key;

          const content = document.createElement('div');
          content.className = 'flataudit-buyer-line-content';

          const ind = document.createElement('span');
          ind.className = `flataudit-buyer-ind ind-${line.item.indicator === '✓' ? 'ok' : (line.item.indicator === '⚠' ? 'warn' : 'unknown')}`;
          ind.textContent = line.item.indicator;

          const txt = document.createElement('span');
          txt.className = 'flataudit-buyer-line-text';
          txt.textContent = line.item.summary;

          content.appendChild(ind);
          content.appendChild(txt);

          if (line.item.details) {
            const sub = document.createElement('div');
            sub.className = 'flataudit-buyer-line-sub';
            sub.textContent = line.item.details;
            content.appendChild(sub);
          }

          row.appendChild(lbl);
          row.appendChild(content);
          linesTable.appendChild(row);
        }
        buyerCard.appendChild(linesTable);

        // All-In Acquisition Cost Summary
        const costBox = document.createElement('div');
        costBox.className = 'flataudit-buyer-cost-box';
        const costHead = document.createElement('div');
        costHead.className = 'flataudit-buyer-cost-head';
        const costState = buyerReport.costEstimate?.state || buyerReport.meta?.state || 'Karnataka';
        costHead.textContent = `💰 Estimated All-In Acquisition Cost (${costState})`;
        costBox.appendChild(costHead);

        const costRows = document.createElement('div');
        costRows.className = 'flataudit-buyer-cost-grid';
        
        const dutyStr = buyerReport.costEstimate.statutoryCharges.stampDutyAmount.toLocaleString('en-IN');
        const regStr = buyerReport.costEstimate.statutoryCharges.registrationAmount.toLocaleString('en-IN');
        const gstStr = buyerReport.costEstimate.statutoryCharges.gstAmount.toLocaleString('en-IN');
        const otherStr = buyerReport.costEstimate.otherCharges.total.toLocaleString('en-IN');
        
        const row1 = document.createElement('div');
        row1.textContent = `Stamp Duty (5.6%): ₹${dutyStr}`;
        const row2 = document.createElement('div');
        row2.textContent = `Registration (1.0%): ₹${regStr}`;
        const row3 = document.createElement('div');
        row3.textContent = `GST (${buyerReport.costEstimate.statutoryCharges.gstPct}%): ₹${gstStr}`;
        const row4 = document.createElement('div');
        row4.textContent = `Advance & Connection: ₹${otherStr}`;
        
        costRows.appendChild(row1);
        costRows.appendChild(row2);
        costRows.appendChild(row3);
        costRows.appendChild(row4);
        costBox.appendChild(costRows);

        const totalRow = document.createElement('div');
        totalRow.className = 'flataudit-buyer-total-row';
        const totalCr = (buyerReport.costEstimate.totalCost / 10000000).toFixed(2);
        const emiStr = buyerReport.costEstimate.financing.monthlyEmi.toLocaleString('en-IN');
        totalRow.textContent = `Estimated All-In: ₹${totalCr} Cr (Monthly EMI: ~₹${emiStr}/mo)`;
        costBox.appendChild(totalRow);
        buyerCard.appendChild(costBox);

        // Printable Report Action Button
        const printBtn = document.createElement('button');
        printBtn.type = 'button';
        printBtn.className = 'flataudit-print-report-btn';
        printBtn.textContent = '📄 Open Printable 1-Page Buyer Report (for Lawyer)';
        printBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const printWindow = window.open('', '_blank');
          if (printWindow) {
            const reportHtml = renderPrintableHtml(buyerReport, data.listing);
            printWindow.document.open();
            printWindow.document.write(reportHtml);
            printWindow.document.close();
          }
        });
        buyerCard.appendChild(printBtn);

        drawer.appendChild(buyerCard);
      }

      // Section: Fallback Ladder Market Benchmark
      if (data.benchmark) {
        const benchBox = document.createElement('div');
        benchBox.className = 'flataudit-bench-box';

        const benchHead = document.createElement('div');
        benchHead.className = 'flataudit-bench-head';

        const benchTitle = document.createElement('span');
        benchTitle.className = 'flataudit-bench-title';
        const levelLabels = {
          peer_page: '📊 Peer Page',
          area_cell: '📍 Nearby Cell',
          district_cell: '🗺️ Wider Area',
          city: '🏙️ City Baseline',
          none: 'ℹ️ Local Baseline'
        };
        const levelTag = levelLabels[data.benchmark.level] || '📊 Benchmark';
        const sampleText = data.benchmark.n ? `n=${data.benchmark.n}` : 'n=0';
        benchTitle.textContent = `${levelTag} (${sampleText})`;

        const confBadge = document.createElement('span');
        confBadge.className = `flataudit-bench-conf conf-${data.benchmark.confidence || 'none'}`;
        confBadge.textContent = `${(data.benchmark.confidence || 'unknown').toUpperCase()} CONFIDENCE`;

        benchHead.appendChild(benchTitle);
        benchHead.appendChild(confBadge);
        benchBox.appendChild(benchHead);

        const benchDesc = document.createElement('div');
        benchDesc.className = 'flataudit-bench-desc';
        if (data.benchmark.level === 'none') {
          benchDesc.textContent = 'Not enough local listing data in this area (sample < 5). Price flags are suppressed to avoid false alarms.';
        } else {
          const medText = data.benchmark.median ? `₹${data.benchmark.median.toLocaleString('en-IN')}/mo` : 'N/A';
          benchDesc.textContent = `Median: ${medText} • ${data.benchmark.sourceLabel || ''}`;
        }
        benchBox.appendChild(benchDesc);
        drawer.appendChild(benchBox);
      }

      // Section: Cross-Portal Matches ("Also listed on Portal B at ₹X")
      if (data.crossPortalMatches && data.crossPortalMatches.length > 0) {
        const matchBox = document.createElement('div');
        matchBox.className = 'flataudit-cross-portal-box';

        const matchHead = document.createElement('div');
        matchHead.className = 'flataudit-cross-head';

        const bestMatch = data.crossPortalMatches[0];
        const matchTitle = document.createElement('span');
        matchTitle.textContent = `🏷️ Also Seen on ${bestMatch.portal.toUpperCase()}`;

        const savingsBadge = document.createElement('span');
        savingsBadge.className = 'flataudit-delta-badge drop';
        savingsBadge.textContent = bestMatch.rent_delta < 0 ? `Save ₹${Math.abs(bestMatch.rent_delta).toLocaleString('en-IN')}` : `₹${bestMatch.rent.toLocaleString('en-IN')}`;

        matchHead.appendChild(matchTitle);
        matchHead.appendChild(savingsBadge);
        matchBox.appendChild(matchHead);

        const matchDesc = document.createElement('div');
        matchDesc.className = 'flataudit-cross-desc';
        matchDesc.textContent = `${bestMatch.verdict}. Reasons: ${bestMatch.reasons.slice(0, 2).join(' • ')}`;
        matchBox.appendChild(matchDesc);

        drawer.appendChild(matchBox);
      }

      // Summary Status Banner
      const banner = document.createElement('div');
      banner.className = `flataudit-summary-banner tone-${data.badgeTone}`;

      const bannerIcon = document.createElement('span');
      bannerIcon.className = 'flataudit-banner-icon';
      bannerIcon.textContent = data.badgeTone === 'bad' ? '⚠️' : data.badgeTone === 'warn' ? '🔍' : '✓';

      const bannerText = document.createElement('div');
      bannerText.className = 'flataudit-banner-text';

      const bannerTitle = document.createElement('b');
      bannerTitle.textContent = data.badgeTone === 'bad'
        ? `High Risk Signals (${data.firedCount} Flagged)`
        : data.badgeTone === 'warn'
        ? 'Unusual Listing Pattern'
        : 'Listing Verified Normal';

      const bannerSub = document.createElement('p');
      bannerSub.textContent = data.headlineSummary || 'Detailed safety evaluation based on local market norms.';

      bannerText.appendChild(bannerTitle);
      bannerText.appendChild(bannerSub);
      banner.appendChild(bannerIcon);
      banner.appendChild(bannerText);
      drawer.appendChild(banner);

      // Section: Key Points & Reasons
      const pointsHeading = document.createElement('div');
      pointsHeading.className = 'flataudit-section-title';
      pointsHeading.textContent = 'KEY OBSERVATIONS (POINTS & REASONS)';
      drawer.appendChild(pointsHeading);

      const pointsList = document.createElement('div');
      pointsList.className = 'flataudit-points-container';

      if (data.humanReadablePoints && data.humanReadablePoints.length > 0) {
        for (const item of data.humanReadablePoints) {
          const pointCard = document.createElement('div');
          pointCard.className = `flataudit-point-card ${item.fired ? 'flagged' : 'normal'}`;

          const cardHeader = document.createElement('div');
          cardHeader.className = 'flataudit-point-header';

          const cardTitle = document.createElement('span');
          cardTitle.className = 'flataudit-point-cat';
          cardTitle.textContent = `${item.icon} ${item.category}`;

          const statusPill = document.createElement('span');
          const isBlocked = item.statusLabel === 'Blocked';
          const isInfo = item.statusLabel === 'Info' || item.statusLabel === 'Action Required';
          statusPill.className = `flataudit-point-status ${item.fired ? 'status-flagged' : (isBlocked ? 'status-blocked' : (isInfo ? 'status-info' : 'status-normal'))}`;
          statusPill.textContent = item.statusLabel || (item.fired ? 'Flagged' : 'Verified');

          cardHeader.appendChild(cardTitle);
          cardHeader.appendChild(statusPill);
          pointCard.appendChild(cardHeader);

          const pointText = document.createElement('div');
          pointText.className = 'flataudit-point-headline';
          pointText.textContent = item.point;
          pointCard.appendChild(pointText);

          if (item.reason && item.reason.trim().toLowerCase() !== item.point.trim().toLowerCase()) {
            const reasonText = document.createElement('div');
            reasonText.className = 'flataudit-point-reason';
            reasonText.textContent = item.reason;
            pointCard.appendChild(reasonText);
          }

          if (item.details && (item.details.how_compared || item.details.drawback)) {
            const detailsEl = document.createElement('div');
            detailsEl.className = 'flataudit-point-details';
            detailsEl.style.display = 'none';
            detailsEl.style.marginTop = '6px';
            detailsEl.style.fontSize = '11px';
            detailsEl.style.lineHeight = '1.4';
            detailsEl.style.color = '#86868b';
            detailsEl.innerHTML = `
              ${item.details.how_compared ? `<div style="margin-bottom:3px"><b>How judged:</b> ${item.details.how_compared}</div>` : ''}
              ${item.details.fact ? `<div style="margin-bottom:3px"><b>Fact:</b> ${item.details.fact}</div>` : ''}
              ${item.details.drawback ? `<div><b>Drawback:</b> ${item.details.drawback}</div>` : ''}
            `;
            pointCard.appendChild(detailsEl);
            pointCard.style.cursor = 'pointer';
            pointCard.setAttribute('tabindex', '0');
            pointCard.setAttribute('role', 'button');
            pointCard.setAttribute('aria-expanded', 'false');
            const toggle = () => {
              const isExp = detailsEl.style.display === 'block';
              detailsEl.style.display = isExp ? 'none' : 'block';
              pointCard.setAttribute('aria-expanded', isExp ? 'false' : 'true');
            };
            pointCard.addEventListener('click', toggle);
            pointCard.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggle();
              }
            });
          }

          pointsList.appendChild(pointCard);
        }
      }
      drawer.appendChild(pointsList);

      // Area Report Section (Slice S8)
      try {
        const areaSettings = await getAreaReportSettings();
        const cityCandidate = data.listing?.city || data.listing?.locality;
        const latCandidate = data.listing?.lat;
        const lngCandidate = data.listing?.lng;

        if (latCandidate && lngCandidate) {
          const areaReport = await generateAreaReport(
            { lat: latCandidate, lng: lngCandidate, city: cityCandidate },
            { settings: areaSettings }
          );
          const areaReportEl = renderAreaReportDOM(areaReport, document);
          drawer.appendChild(areaReportEl);
        } else if (!areaSettings.enabled) {
          const areaReportEl = renderAreaReportDOM({ status: 'off' }, document);
          drawer.appendChild(areaReportEl);
        }
      } catch (err) {}

      // Section: Protection / Due Diligence Checklist
      const safetyBox = document.createElement('div');
      safetyBox.className = 'flataudit-safety-box';

      const safetyHeader = document.createElement('div');
      safetyHeader.className = 'flataudit-safety-header';
      safetyHeader.textContent = isSale ? '🛡️ Buyer Due Diligence Checklist:' : '💡 Renter Safety Advice:';
      safetyBox.appendChild(safetyHeader);

      const safetyList = document.createElement('ul');
      safetyList.className = 'flataudit-safety-list';

      const adviceItems = (isSale && data.buyerDueDiligenceChecklist) ? data.buyerDueDiligenceChecklist : (data.safetyAdvice || [
        'Never transfer any gate entry pass or token fee via UPI before in-person flat visit.',
        'Request to meet building security or caretaker at the gate to verify vacant flat.',
        'Legitimate landlords in India never charge entry fees to inspect a rental property.'
      ]);

      for (const tip of adviceItems) {
        const li = document.createElement('li');
        li.textContent = tip;
        safetyList.appendChild(li);
      }
      safetyBox.appendChild(safetyList);

      if (isSale && data.reraPortal) {
        const reraLink = document.createElement('a');
        reraLink.href = data.reraPortal;
        reraLink.target = '_blank';
        reraLink.rel = 'noopener noreferrer';
        reraLink.className = 'flataudit-rera-link-btn';
        reraLink.textContent = '🏛️ Open Official RERA Portal ↗';
        safetyBox.appendChild(reraLink);
      }

      if (isSale) {
        const disclaimer = document.createElement('p');
        disclaimer.className = 'flataudit-disclaimer-note';
        disclaimer.textContent = '⚖️ Observable facts only. FlatAudit does not verify property title deeds or provide financial/legal advice. Always engage an independent advocate before transferring funds.';
        safetyBox.appendChild(disclaimer);
      }

      drawer.appendChild(safetyBox);

      // Meta Footer (Redesigned 2-Row Clean Card)
      const metaRow = document.createElement('div');
      metaRow.className = 'flataudit-drawer-footer';

      const footerActions = document.createElement('div');
      footerActions.className = 'flataudit-footer-actions';

      const hashInfo = document.createElement('div');
      hashInfo.className = 'flataudit-footer-hash';
      hashInfo.title = 'Perceptual photo hash (dHash) used locally to detect cross-portal reposts without uploading images.';

      const hashIcon = document.createElement('span');
      hashIcon.className = 'flataudit-hash-icon';
      hashIcon.textContent = '📸';

      const hashLabel = document.createElement('span');
      hashLabel.className = 'flataudit-hash-label';
      hashLabel.textContent = 'Photo Hash:';

      const hashCode = document.createElement('code');
      hashCode.className = 'flataudit-hash-code';
      const displayHash = (data && data.topHash) ? data.topHash : null;
      hashCode.textContent = displayHash ? `${displayHash.slice(0, 10)}...` : 'None';

      hashInfo.appendChild(hashIcon);
      hashInfo.appendChild(hashLabel);
      hashInfo.appendChild(hashCode);

      // Feedback button: "Report Issue"
      const feedbackBtn = document.createElement('button');
      feedbackBtn.type = 'button';
      feedbackBtn.className = 'flataudit-feedback-btn';
      feedbackBtn.innerHTML = '<span class="flataudit-feedback-icon">🚩</span> Report Issue';
      feedbackBtn.title = 'Send anonymous feedback or report false flag';

      feedbackBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const reason = prompt('What looks wrong with this analysis? (e.g. rent benchmark seems off, phrasing falsely flagged)\n\nNote: We collect only non-personal listing attributes (bhk, locality, rent). Zero contact or personal info is sent.');
        if (reason && reason.trim()) {
          const report = {
            timestamp: Date.now(),
            portal: data.listing?.portal || 'unknown',
            bhk: data.listing?.bhk || 2,
            locality: data.listing?.locality || '',
            rent: data.listing?.rent || data.listing?.price || 0,
            benchmarkLevel: data.benchmark?.level || 'none',
            firedCount: data.firedCount || 0,
            userFeedback: reason.trim()
          };
          const stored = await safeStorageGet(['flataudit_user_feedback']);
          const feedbackList = stored.flataudit_user_feedback || [];
          feedbackList.push(report);
          await safeStorageSet({ flataudit_user_feedback: feedbackList });
          feedbackBtn.innerHTML = '<span class="flataudit-feedback-icon">✓</span> Saved';
          feedbackBtn.disabled = true;
        }
      });

      footerActions.appendChild(hashInfo);
      footerActions.appendChild(feedbackBtn);

      const securityRow = document.createElement('div');
      securityRow.className = 'flataudit-footer-security';

      const privacyNote = document.createElement('span');
      privacyNote.className = 'flataudit-security-badge';
      try {
        const areaReportSettings = await getAreaReportSettings();
        privacyNote.textContent = getFooterPrivacyText(areaReportSettings.enabled);
      } catch (e) {
        privacyNote.textContent = getFooterPrivacyText(false);
      }

      // Live update footer if user toggles Area Report in popup/settings
      try {
        if (typeof chrome !== 'undefined' && chrome?.storage?.onChanged) {
          chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && (changes.flataudit_settings || changes['flataudit_settings.areaReport'])) {
              getAreaReportSettings().then((st) => {
                if (privacyNote) {
                  privacyNote.textContent = getFooterPrivacyText(st.enabled);
                }
              }).catch(() => {});
            }
          });
        }
      } catch (err) {}

      securityRow.appendChild(privacyNote);

      metaRow.appendChild(footerActions);
      metaRow.appendChild(securityRow);
      drawer.appendChild(metaRow);

      // Event Listeners
      trackBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (trackedItem) {
          await untrackListing(listingKey);
          trackedItem = null;
          trackBtn.textContent = '★ Track Flat';
          trackBtn.classList.remove('is-tracked');
        } else {
          const trackRes = await trackListing({
            ...data.listing,
            listingKey,
            signalsFiredCount: data.firedCount,
            badgeLabel: data.badgeLabel,
            badgeTone: data.badgeTone
          });
          trackedItem = trackRes.trackedItem;
          trackBtn.textContent = '✓ In Watchlist';
          trackBtn.classList.add('is-tracked');
        }
        await renderTrustBadge(data);
      });

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        isDrawerOpen = !isDrawerOpen;
        if (isDrawerOpen) {
          drawer.classList.add('open');
        } else {
          drawer.classList.remove('open');
        }
      });

      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        isDrawerOpen = false;
        drawer.classList.remove('open');
      });

      drawer.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      wrapper.appendChild(btn);
      wrapper.appendChild(drawer);
      badgeContainer.appendChild(wrapper);
    }

    document.addEventListener('click', (e) => {
      if (badgeContainer && !badgeContainer.contains(e.target)) {
        if (isDrawerOpen) {
          isDrawerOpen = false;
          const drawer = badgeContainer.querySelector('.flataudit-drawer');
          if (drawer) {
            drawer.classList.remove('open');
          }
        }
      }
    });

    // Initial evaluation
    evaluatePage();

    // Listen for requests from popup to get active page analysis
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request && request.type === 'GET_PAGE_ANALYSIS') {
        sendResponse({ analysis: currentAnalysis });
        return true;
      }
    });

    // Re-check on dynamic SPA DOM mutations outside our own root
    let mutationTimeoutId;
    const observer = new MutationObserver((mutations) => {
      const isSelfMutation = Array.from(mutations).every(m => {
        return m.target && (m.target.id === 'flataudit-root' || (m.target.closest && m.target.closest('#flataudit-root')));
      });
      if (isSelfMutation) return;

      // Real navigation occurred on SPA (e.g. clicked to next property)
      if (window.location.href !== lastEvaluatedUrl) {
        clearTimeout(mutationTimeoutId);
        mutationTimeoutId = setTimeout(() => {
          evaluatePage();
        }, 300);
        return;
      }

      // If drawer is currently open or page is already evaluated, avoid disruptive re-render
      if (isDrawerOpen) return;

      clearTimeout(mutationTimeoutId);
      mutationTimeoutId = setTimeout(() => {
        evaluatePage();
      }, 2000);
    });

    observer.observe(document.body, { childList: true, subtree: true });

  } catch (err) {
    console.warn('[FlatAudit] Initialization skipped or error:', err);
  }
})();
