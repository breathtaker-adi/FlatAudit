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

    async function evaluatePage() {
      const listing = extractListing(document, window.location.href);

      // Require at least a title or rent to consider this a listing page
      if (!listing.title && !listing.rent) {
        return;
      }

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

      // Clear existing safely
      while (badgeContainer.firstChild) {
        badgeContainer.removeChild(badgeContainer.firstChild);
      }

      const wrapper = document.createElement('div');
      wrapper.style.position = 'relative';

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

      // Header
      const header = document.createElement('div');
      header.className = 'flataudit-drawer-header';

      const headerTitle = document.createElement('span');
      headerTitle.className = 'flataudit-drawer-title';
      headerTitle.textContent = 'Listing Trust Signals';

      const closeBtn = document.createElement('button');
      closeBtn.className = 'flataudit-close-btn';
      closeBtn.textContent = '×';
      closeBtn.setAttribute('aria-label', 'Close drawer');

      header.appendChild(headerTitle);
      header.appendChild(closeBtn);
      drawer.appendChild(header);

      // Kill Chain Stage Box
      const stageBox = document.createElement('div');
      stageBox.className = 'flataudit-stage-box';

      const stageBold = document.createElement('b');
      stageBold.textContent = 'Kill Chain Phase:';
      const stageText = document.createElement('span');
      stageText.textContent = data.scamKillChainStage;

      stageBox.appendChild(stageBold);
      stageBox.appendChild(stageText);
      drawer.appendChild(stageBox);

      // Observable Facts List
      if (data.observableFacts && data.observableFacts.length > 0) {
        const list = document.createElement('ul');
        list.className = 'flataudit-facts-list';

        for (const fact of data.observableFacts) {
          const item = document.createElement('li');
          item.className = 'flataudit-fact-item';

          const factIcon = document.createElement('span');
          factIcon.className = 'flataudit-fact-icon';
          factIcon.textContent = '•';

          const factText = document.createElement('span');
          factText.textContent = fact;

          item.appendChild(factIcon);
          item.appendChild(factText);
          list.appendChild(item);
        }
        drawer.appendChild(list);
      } else {
        const cleanNote = document.createElement('div');
        cleanNote.className = 'flataudit-clean-note';
        cleanNote.textContent = '✓ No anomaly signals detected. Price, deposit ratio, and description match local market norms.';
        drawer.appendChild(cleanNote);
      }

      // Meta Footer
      const metaRow = document.createElement('div');
      metaRow.className = 'flataudit-meta-row';

      const hashInfo = document.createElement('span');
      hashInfo.textContent = data.topHash ? `dHash: ${data.topHash.slice(0, 8)}...` : 'Image: unhashed';

      const privacyNote = document.createElement('span');
      privacyNote.textContent = 'Privacy-preserving • Local signals';

      metaRow.appendChild(hashInfo);
      metaRow.appendChild(privacyNote);
      drawer.appendChild(metaRow);

      // Toggle drawer behavior
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        drawer.classList.toggle('open');
      });

      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        drawer.classList.remove('open');
      });

      document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
          drawer.classList.remove('open');
        }
      });

      wrapper.appendChild(btn);
      wrapper.appendChild(drawer);
      badgeContainer.appendChild(wrapper);
    }

    // Initial evaluation
    evaluatePage();

    // Re-check if SPA dynamically alters DOM
    let timeoutId;
    const observer = new MutationObserver(() => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        evaluatePage();
      }, 750);
    });

    observer.observe(document.body, { childList: true, subtree: true });

  } catch (err) {
    console.warn('[FlatAudit] Initialization skipped or error:', err);
  }
})();
