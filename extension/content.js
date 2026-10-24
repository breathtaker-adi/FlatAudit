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

    let currentAnalysis = null;
    let badgeContainer = null;
    let isDrawerOpen = false;
    let crossPortalMatches = [];

    async function evaluatePage() {
      // 1. Harvest peer listing cards if on search page or similar carousel
      const pagePeers = parsePeerListingsFromPage(document, window.location.href);
      if (pagePeers && pagePeers.length >= 5) {
        try {
          await chrome.storage.local.set({
            flataudit_cached_peers: {
              timestamp: Date.now(),
              url: window.location.href,
              peers: pagePeers
            }
          });
        } catch (e) {}
      }

      const listing = extractListing(document, window.location.href);

      // Require at least a title or rent to consider this a listing page
      if (!listing.title && !listing.rent) {
        return;
      }

      // Hash first image via background service worker
      let topHash = null;
      let seenCount = 1;

      if (listing.images && listing.images.length > 0) {
        try {
          const firstImg = listing.images[0];
          const hashResponse = await chrome.runtime.sendMessage({
            type: 'COMPUTE_DHASH',
            imageUrl: firstImg
          });

          if (hashResponse && hashResponse.hash) {
            topHash = hashResponse.hash;
            const seenResponse = await chrome.runtime.sendMessage({
              type: 'CHECK_SEEN',
              hash: topHash
            });
            if (seenResponse && seenResponse.seenCount) {
              seenCount = seenResponse.seenCount;
            }
          }
        } catch (e) {
          // Offline fallback
        }
      }

      // Retrieve cached peer listings if current detail page has fewer than 5 cards
      let peerListings = (pagePeers && pagePeers.length >= 5) ? pagePeers : [];
      if (peerListings.length < 5) {
        try {
          const stored = await chrome.storage.local.get(['flataudit_cached_peers']);
          if (stored.flataudit_cached_peers && (Date.now() - stored.flataudit_cached_peers.timestamp < 24 * 3600 * 1000)) {
            peerListings = stored.flataudit_cached_peers.peers || [];
          }
        } catch (e) {}
      }

      // Analyze signals with dynamic benchmark fallback ladder
      const analysis = analyzeListing(listing, { seenCount, peerListings });

      // Check cross-portal matches asynchronously
      if (listing.rent && listing.portal) {
        try {
          const matchRes = await chrome.runtime.sendMessage({
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
        } catch (e) {}
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
      try {
        chrome.storage.local.set({ lastAnalysis: currentAnalysis });
      } catch (e) {}

      // Inform backend anonymously
      if (listing.rent && (topHash || listing.locality)) {
        try {
          chrome.runtime.sendMessage({
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
        } catch (e) {}
      }

      await renderTrustBadge(currentAnalysis);
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

      const icon = document.createElement('span');
      icon.className = 'flataudit-badge-icon';
      icon.textContent = data.badgeTone === 'bad' ? '⚠️' : data.badgeTone === 'warn' ? '🔍' : '🛡️';

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
      shieldIcon.textContent = '🛡️';

      const titleText = document.createElement('span');
      titleText.className = 'flataudit-drawer-title';
      titleText.textContent = 'FlatAudit Companion';

      headerTitle.appendChild(shieldIcon);
      headerTitle.appendChild(titleText);

      const headerActions = document.createElement('div');
      headerActions.className = 'flataudit-header-actions';

      const trackBtn = document.createElement('button');
      trackBtn.type = 'button';
      trackBtn.className = `flataudit-track-btn ${trackedItem ? 'is-tracked' : ''}`;
      trackBtn.textContent = trackedItem ? '✓ In Watchlist' : '★ Track Flat';
      trackBtn.title = 'Save listing and track rent history';

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

      // Section: Buyhatke Price History & Watchlist Card
      const historyCard = document.createElement('div');
      historyCard.className = 'flataudit-history-card';

      const historyHead = document.createElement('div');
      historyHead.className = 'flataudit-history-head';

      const historyTitle = document.createElement('span');
      historyTitle.className = 'flataudit-history-title';
      historyTitle.textContent = '📈 Price History & Watchlist';

      const timeOnMarket = document.createElement('span');
      timeOnMarket.className = 'flataudit-time-badge';
      timeOnMarket.textContent = trackedItem ? formatTimeOnMarket(trackedItem.firstSeen) : 'First seen today';

      historyHead.appendChild(historyTitle);
      historyHead.appendChild(timeOnMarket);
      historyCard.appendChild(historyHead);

      const historyStatsRow = document.createElement('div');
      historyStatsRow.className = 'flataudit-history-stats';

      const rentStat = document.createElement('span');
      rentStat.className = 'flataudit-stat-rent';
      rentStat.textContent = `₹${(data.listing.rent || 0).toLocaleString('en-IN')}/mo`;

      const deltaBadge = document.createElement('span');
      const stats = computePriceHistoryStats(trackedItem ? trackedItem.snapshots : [{ rent: data.listing.rent }]);

      if (stats.delta < 0) {
        deltaBadge.className = 'flataudit-delta-badge drop';
        deltaBadge.textContent = `↓ ₹${Math.abs(stats.delta).toLocaleString('en-IN')} (${stats.pctChange}%)`;
      } else if (stats.delta > 0) {
        deltaBadge.className = 'flataudit-delta-badge rise';
        deltaBadge.textContent = `↑ ₹${stats.delta.toLocaleString('en-IN')} (+${stats.pctChange}%)`;
      } else {
        deltaBadge.className = 'flataudit-delta-badge stable';
        deltaBadge.textContent = 'Rent unchanged';
      }

      historyStatsRow.appendChild(rentStat);
      historyStatsRow.appendChild(deltaBadge);
      historyCard.appendChild(historyStatsRow);

      // Inline SVG Sparkline Container
      const sparkWrap = document.createElement('div');
      sparkWrap.className = 'flataudit-sparkline-wrap';

      const snapshots = trackedItem ? trackedItem.snapshots : [{ t: Date.now(), rent: data.listing.rent }];
      const sparkSvgString = generateSparklineSVG(snapshots, { width: 370, height: 50 });
      // Safely parse SVG string into DOM element
      const svgParser = new DOMParser();
      const svgDoc = svgParser.parseFromString(sparkSvgString, 'image/svg+xml');
      const svgElement = svgDoc.documentElement;
      sparkWrap.appendChild(document.importNode(svgElement, true));
      historyCard.appendChild(sparkWrap);

      // Status selector and private note (when tracked)
      const controlsRow = document.createElement('div');
      controlsRow.className = 'flataudit-watchlist-controls';

      const statusSelect = document.createElement('select');
      statusSelect.className = 'flataudit-status-select';
      ['Interested', 'Visited', 'Rejected'].forEach(st => {
        const opt = document.createElement('option');
        opt.value = st;
        opt.textContent = st;
        if (trackedItem && trackedItem.status === st) opt.selected = true;
        statusSelect.appendChild(opt);
      });

      const noteInput = document.createElement('input');
      noteInput.type = 'text';
      noteInput.className = 'flataudit-note-input';
      noteInput.placeholder = 'Add private note (e.g. talked to guard Rahul)';
      noteInput.value = trackedItem && trackedItem.note ? trackedItem.note : '';

      controlsRow.appendChild(statusSelect);
      controlsRow.appendChild(noteInput);
      historyCard.appendChild(controlsRow);
      drawer.appendChild(historyCard);

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

      // Section: Renter Protection Checklist
      const safetyBox = document.createElement('div');
      safetyBox.className = 'flataudit-safety-box';

      const safetyHeader = document.createElement('div');
      safetyHeader.className = 'flataudit-safety-header';
      safetyHeader.textContent = '💡 Renter Safety Advice:';
      safetyBox.appendChild(safetyHeader);

      const safetyList = document.createElement('ul');
      safetyList.className = 'flataudit-safety-list';

      const adviceItems = data.safetyAdvice || [
        'Never transfer any gate entry pass or token fee via UPI before in-person flat visit.',
        'Request to meet building security or caretaker at the gate to verify vacant flat.',
        'Legitimate landlords in India never charge entry fees to inspect a rental property.'
      ];

      for (const tip of adviceItems) {
        const li = document.createElement('li');
        li.textContent = tip;
        safetyList.appendChild(li);
      }
      safetyBox.appendChild(safetyList);
      drawer.appendChild(safetyBox);

      // Meta Footer
      // Feedback button: "This looks wrong"
      const feedbackBtn = document.createElement('button');
      feedbackBtn.type = 'button';
      feedbackBtn.className = 'flataudit-feedback-link';
      feedbackBtn.textContent = '🚩 This looks wrong?';
      feedbackBtn.title = 'Send anonymous feedback on this analysis';

      feedbackBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const reason = prompt('What looks wrong with this analysis? (e.g. rent benchmark seems off, phrasing falsely flagged)\n\nNote: We collect only non-personal listing attributes (bhk, locality, rent). Zero contact or personal info is sent.');
        if (reason && reason.trim()) {
          try {
            const report = {
              timestamp: Date.now(),
              portal: data.listing?.portal || 'unknown',
              bhk: data.listing?.bhk || 2,
              locality: data.listing?.locality || '',
              rent: data.listing?.rent || 0,
              benchmarkLevel: data.benchmark?.level || 'none',
              firedCount: data.firedCount || 0,
              userFeedback: reason.trim()
            };
            const stored = await chrome.storage.local.get(['flataudit_user_feedback']);
            const feedbackList = stored.flataudit_user_feedback || [];
            feedbackList.push(report);
            await chrome.storage.local.set({ flataudit_user_feedback: feedbackList });
            feedbackBtn.textContent = '✓ Feedback saved';
            feedbackBtn.disabled = true;
          } catch (err) {}
        }
      });

      metaRow.appendChild(hashInfo);
      metaRow.appendChild(feedbackBtn);
      metaRow.appendChild(privacyNote);
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

      statusSelect.addEventListener('change', async (e) => {
        e.stopPropagation();
        if (trackedItem) {
          await updateListingStatus(listingKey, statusSelect.value);
        }
      });

      noteInput.addEventListener('change', async (e) => {
        e.stopPropagation();
        if (trackedItem) {
          await updateListingNote(listingKey, noteInput.value);
        }
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

    // Re-check on dynamic SPA DOM mutations outside our own root
    let timeoutId;
    const observer = new MutationObserver((mutations) => {
      const isSelfMutation = Array.from(mutations).every(m => {
        return m.target && (m.target.id === 'flataudit-root' || (m.target.closest && m.target.closest('#flataudit-root')));
      });
      if (isSelfMutation) return;

      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        evaluatePage();
      }, 1000);
    });

    observer.observe(document.body, { childList: true, subtree: true });

  } catch (err) {
    console.warn('[FlatAudit] Initialization skipped or error:', err);
  }
})();
