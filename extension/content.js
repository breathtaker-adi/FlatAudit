/**
 * FlatAudit - Content Script
 *
 * Runs on rental listing pages, safely extracts fields, evaluates signals,
 * queries dHash for photos, and renders an objective explanation badge.
 */

(async function initFlatAudit() {
  // Prevent duplicate execution
  if (window.__FLATAUDIT_LOADED__) return;
  window.__FLATAUDIT_LOADED__ = true;

  try {
    const parsersUrl = chrome.runtime.getURL('lib/parsers/index.js');
    const signalsUrl = chrome.runtime.getURL('lib/signals.js');

    const { extractListing } = await import(parsersUrl);
    const { analyzeListing } = await import(signalsUrl);

    let currentAnalysis = null;
    let badgeContainer = null;
    let isDrawerOpen = false;
    let lastEvaluatedFingerprint = '';

    async function evaluatePage() {
      const listing = extractListing(document, window.location.href);

      // Require at least a title or rent to consider this a listing page
      if (!listing.title && !listing.rent) {
        return;
      }

      const listingFingerprint = `${window.location.pathname}_${listing.rent}_${listing.deposit}_${listing.title}`;

      // Hash first 3 images via background service worker
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
          // Worker fetch failure or offline; continue with local rules
        }
      }

      // Analyze signals
      const analysis = analyzeListing(listing, { seenCount });
      currentAnalysis = {
        ...analysis,
        listing,
        topHash,
        url: window.location.href,
        timestamp: new Date().toISOString()
      };

      // Store in chrome.storage for extension popup
      try {
        chrome.storage.local.set({ lastAnalysis: currentAnalysis });
      } catch (e) {}

      // Inform backend asynchronously
      if (listing.rent && (topHash || listing.locality)) {
        try {
          chrome.runtime.sendMessage({
            type: 'OBSERVE_LISTING',
            payload: {
              url: window.location.href,
              locality: listing.locality,
              bhk: listing.bhk,
              rent: listing.rent,
              deposit: listing.deposit,
              image_hash: topHash
            }
          });
        } catch (e) {}
      }

      lastEvaluatedFingerprint = listingFingerprint;
      renderTrustBadge(currentAnalysis);
    }

    /**
     * Safely constructs badge and explanation drawer using ONLY textContent and DOM APIs.
     * ZERO innerHTML is used with untrusted DOM strings.
     */
    function renderTrustBadge(data) {
      if (!badgeContainer) {
        badgeContainer = document.createElement('div');
        badgeContainer.id = 'flataudit-root';
        document.body.appendChild(badgeContainer);
      }

      // Clear existing elements safely
      while (badgeContainer.firstChild) {
        badgeContainer.removeChild(badgeContainer.firstChild);
      }

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

      // 2. Expandable Facts Drawer
      const drawer = document.createElement('div');
      drawer.className = 'flataudit-drawer';
      if (isDrawerOpen) {
        drawer.classList.add('open');
      }

      // Header
      const header = document.createElement('div');
      header.className = 'flataudit-drawer-header';

      const headerTitle = document.createElement('div');
      headerTitle.className = 'flataudit-drawer-title-group';

      const shieldIcon = document.createElement('span');
      shieldIcon.className = 'flataudit-drawer-shield';
      shieldIcon.textContent = '🛡️';

      const titleText = document.createElement('span');
      titleText.className = 'flataudit-drawer-title';
      titleText.textContent = 'FlatAudit Trust Check';

      headerTitle.appendChild(shieldIcon);
      headerTitle.appendChild(titleText);

      const closeBtn = document.createElement('button');
      closeBtn.className = 'flataudit-close-btn';
      closeBtn.type = 'button';
      closeBtn.textContent = '×';
      closeBtn.setAttribute('aria-label', 'Close drawer');

      header.appendChild(headerTitle);
      header.appendChild(closeBtn);
      drawer.appendChild(header);

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

          // Header line with Icon + Category + Status
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

          // Point: Clear bullet / takeaway
          const pointText = document.createElement('div');
          pointText.className = 'flataudit-point-headline';
          pointText.textContent = item.point;
          pointCard.appendChild(pointText);

          // Reason: Human explanation
          const reasonText = document.createElement('div');
          reasonText.className = 'flataudit-point-reason';
          reasonText.textContent = item.reason;
          pointCard.appendChild(reasonText);

          pointsList.appendChild(pointCard);
        }
      }
      drawer.appendChild(pointsList);

      // Section: Actionable Safety Advice for Renters
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
      const metaRow = document.createElement('div');
      metaRow.className = 'flataudit-meta-row';

      const hashInfo = document.createElement('span');
      hashInfo.textContent = data.topHash ? `Photo fingerprint: ${data.topHash.slice(0, 8)}...` : 'Images: standard';

      const privacyNote = document.createElement('span');
      privacyNote.textContent = 'Privacy-preserving • Zero PII stored';

      metaRow.appendChild(hashInfo);
      metaRow.appendChild(privacyNote);
      drawer.appendChild(metaRow);

      // Event Listeners (Rock-solid, no auto-closing)
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

      // Stop clicks inside the drawer from bubbling to document
      drawer.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      wrapper.appendChild(btn);
      wrapper.appendChild(drawer);
      badgeContainer.appendChild(wrapper);
    }

    // Close only when clicking outside the entire FlatAudit root
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

    // Re-check if SPA dynamically alters DOM outside our own container
    let timeoutId;
    const observer = new MutationObserver((mutations) => {
      // Ignore mutations originating inside our own FlatAudit container
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
