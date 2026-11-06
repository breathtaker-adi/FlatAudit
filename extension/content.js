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

      const KEYSTONE_ICON_HTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2.5L20.5 7.4V16.6L12 21.5L3.5 16.6V7.4L12 2.5Z" stroke="#0A84FF" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M12 2.5V12L20.5 7.4" stroke="#0A84FF" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M12 12L3.5 7.4" stroke="#0A84FF" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M12 12V21.5" stroke="#0A84FF" stroke-width="1.8" stroke-linecap="round"/>
        <circle cx="12" cy="12" r="2" fill="#0A84FF"/>
      </svg>`;

      const icon = document.createElement('span');
      icon.className = 'flataudit-badge-icon';
      icon.innerHTML = KEYSTONE_ICON_HTML;

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
      shieldIcon.innerHTML = KEYSTONE_ICON_HTML;

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
              <span class="flataudit-invest-title">Capital Appreciation (Normal Conditions)</span>
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
            <div class="flataudit-invest-yield">Rental Yield Potential: ~${forecast.monthlyRentalFormatted}/mo</div>
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
          statusPill.className = `flataudit-point-status ${item.fired ? 'status-flagged' : 'status-normal'}`;
          statusPill.textContent = item.fired ? 'Flagged' : 'Verified';

          cardHeader.appendChild(cardTitle);
          cardHeader.appendChild(statusPill);
          pointCard.appendChild(cardHeader);

          const pointText = document.createElement('div');
          pointText.className = 'flataudit-point-headline';
          pointText.textContent = item.point;
          pointCard.appendChild(pointText);

          const reasonText = document.createElement('div');
          reasonText.className = 'flataudit-point-reason';
          reasonText.textContent = item.reason;
          pointCard.appendChild(reasonText);

          pointsList.appendChild(pointCard);
        }
      }
      drawer.appendChild(pointsList);

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
      privacyNote.textContent = '🔒 Zero personal data transmitted • Local-first evaluation';

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
