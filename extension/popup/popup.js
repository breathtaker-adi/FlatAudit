/**
 * FlatAudit - Popup Controller & Buyhatke Companion
 * 
 * Features:
 * - Tab 1: Trust signals, verified benchmarks, and cross-portal matches
 * - Tab 2: Buyhatke Watchlist, inline SVG sparklines, status tagging, notes
 * - Side-by-side comparison matrix with automated best-value highlights
 * - Shortlist export as CSV
 */

import {
  getTrackedListings,
  trackListing,
  untrackListing,
  updateListingStatus,
  updateListingNote,
  computePriceHistoryStats,
  generateSparklineSVG,
  formatTimeOnMarket,
  buildComparisonMatrix,
  exportShortlistToCSV
} from '../lib/tracker.js';
import {
  calculateInvestmentForecast,
  formatIndianCurrencyAbbr
} from '../lib/investment.js';

let activeAnalysis = null;
const selectedForCompare = new Set();

async function getBackendApiUrl() {
  try {
    const data = await chrome.storage.local.get(['flataudit_api_url']);
    if (data.flataudit_api_url && typeof data.flataudit_api_url === 'string') {
      let url = data.flataudit_api_url.trim().replace(/\/+$/, '');
      if (!url.endsWith('/api/v1')) url += '/api/v1';
      return url;
    }
  } catch (e) {}
  return 'http://127.0.0.1:8000/api/v1';
}

async function checkBackendHealth() {
  const statusEl = document.getElementById('backend-status');
  statusEl.style.cursor = 'pointer';
  try {
    const apiUrl = await getBackendApiUrl();
    const res = await fetch(`${apiUrl}/health`, { method: 'GET' });
    if (res.ok) {
      statusEl.className = 'status-indicator online';
      statusEl.title = `Backend online (${apiUrl}) - Click to change URL`;
      return;
    }
  } catch (e) {}
  statusEl.className = 'status-indicator offline';
  statusEl.title = 'Backend offline (using local extension signals) - Click to configure API URL';
}

function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));

      btn.classList.add('active');
      const targetView = document.getElementById(btn.getAttribute('data-tab'));
      if (targetView) targetView.classList.add('active');

      if (btn.getAttribute('data-tab') === 'view-watchlist') {
        renderWatchlistView();
      }
    });
  });
}

function updateTrustUI(analysis) {
  if (!analysis) return;
  activeAnalysis = analysis;

  // Verdict Banner
  const banner = document.getElementById('verdict-banner');
  const icon = document.getElementById('verdict-icon');
  const title = document.getElementById('verdict-title');
  const sub = document.getElementById('verdict-sub');

  banner.className = `verdict-banner tone-${analysis.badgeTone || 'ok'}`;
  icon.textContent = analysis.badgeTone === 'bad' ? '⚠️' : analysis.badgeTone === 'warn' ? '🔍' : '✓';

  if (analysis.badgeTone === 'bad') {
    title.textContent = `High Risk: ${analysis.firedCount || 'Multiple'} Scam Signals Flagged`;
  } else if (analysis.badgeTone === 'warn') {
    title.textContent = `Caution: Unusual Listing Pattern`;
  } else {
    title.textContent = `Listing Verified Normal`;
  }
  sub.textContent = analysis.headlineSummary || 'All signals conform to local rental norms.';

  // Property Overview Strip
  const titleEl = document.getElementById('prop-title');
  titleEl.textContent = analysis.listing?.title || 'Active Rental Listing';

  const tagRent = document.getElementById('tag-rent');
  const tagDeposit = document.getElementById('tag-deposit');
  const tagBhk = document.getElementById('tag-bhk');
  const tagArea = document.getElementById('tag-area');

  const isSale = analysis.listing?.listingType === 'sale' || 
                 Boolean(analysis.listing?.price && !analysis.listing?.rent) || 
                 /\b(?:for\s*sale|resale|buy\s*flat|villa\s*for\s*sale|house\s*for\s*sale|independent\s*house)\b/i.test(analysis.listing?.title || '');

  const effectivePrice = analysis.listing?.price || analysis.listing?.salePrice || analysis.listing?.rawPrice || analysis.listing?.rent || 0;

  if (isSale) {
    if (effectivePrice > 0) {
      tagRent.textContent = formatIndianCurrencyAbbr(effectivePrice);
    } else {
      tagRent.textContent = 'Price on Request';
    }

    if (analysis.listing?.pricePerSqft) {
      tagDeposit.textContent = `₹ ${analysis.listing.pricePerSqft.toLocaleString('en-IN')}/sqft`;
    } else if (analysis.listing?.area_sqft && effectivePrice > 0) {
      const psf = Math.round(effectivePrice / analysis.listing.area_sqft);
      tagDeposit.textContent = `₹ ${psf.toLocaleString('en-IN')}/sqft`;
    } else {
      tagDeposit.textContent = 'For Sale';
    }
  } else {
    // Rental Listing
    if (analysis.listing?.rent) {
      tagRent.textContent = `₹ ${analysis.listing.rent.toLocaleString('en-IN')}/mo`;
    } else {
      tagRent.textContent = 'Rent on Request';
    }

    if (analysis.listing?.deposit !== null && analysis.listing?.deposit !== undefined && analysis.listing?.deposit > 0) {
      tagDeposit.textContent = `Deposit: ₹ ${analysis.listing.deposit.toLocaleString('en-IN')}`;
    } else {
      tagDeposit.textContent = 'Zero Deposit';
    }
  }

  if (analysis.listing?.bhk) {
    tagBhk.textContent = `${analysis.listing.bhk} BHK`;
  } else {
    tagBhk.textContent = '-- BHK';
  }

  if (analysis.listing?.area_sqft || analysis.listing?.areaSqft) {
    tagArea.textContent = `${analysis.listing.area_sqft || analysis.listing.areaSqft} sqft`;
  } else {
    tagArea.textContent = `-- sqft`;
  }

  // Populate Investment Appreciation Card
  const investCard = document.getElementById('investment-growth-card');
  if (investCard) {
    const forecastPrice = isSale ? effectivePrice : (analysis.listing?.rent ? Math.round((analysis.listing.rent * 12) / 0.035) : 0);
    if (forecastPrice > 0) {
      investCard.style.display = 'flex';
      const forecast = calculateInvestmentForecast(forecastPrice);
      if (forecast.isValid) {
        document.getElementById('invest-val-3y').textContent = forecast.milestones[0].projectedFormatted;
        document.getElementById('invest-gain-3y').textContent = forecast.milestones[0].percentGain;
        document.getElementById('invest-val-5y').textContent = forecast.milestones[1].projectedFormatted;
        document.getElementById('invest-gain-5y').textContent = forecast.milestones[1].percentGain;
        document.getElementById('invest-val-10y').textContent = forecast.milestones[2].projectedFormatted;
        document.getElementById('invest-gain-10y').textContent = forecast.milestones[2].percentGain;
        
        const yieldLabel = document.getElementById('invest-yield-label');
        if (yieldLabel) {
          yieldLabel.textContent = `Rental Yield: ~${forecast.monthlyRentalFormatted}/mo`;
        }
      }
    } else {
      investCard.style.display = 'none';
    }
  }

  // Dynamic Fallback Ladder Benchmark Pill
  const bmPill = document.getElementById('benchmark-ladder-pill');
  if (bmPill) {
    if (analysis.benchmark) {
      bmPill.style.display = 'flex';
      const levelLabels = {
        peer_page: '📊 Peer Page',
        area_cell: '📍 Nearby Cell',
        district_cell: '🗺️ Wider District',
        city: '🏙️ City Baseline',
        none: 'ℹ️ No Local Baseline'
      };
      const iconEl = document.getElementById('bm-level-icon');
      const labelEl = document.getElementById('bm-source-label');
      const confEl = document.getElementById('bm-conf-tag');

      if (iconEl) iconEl.textContent = levelLabels[analysis.benchmark.level] || '📊 Benchmark';
      if (labelEl) {
        labelEl.textContent = analysis.benchmark.level === 'none'
          ? 'Not enough local data (< 5 listings)'
          : (analysis.benchmark.sourceLabel || `Sample: n=${analysis.benchmark.n || 0}`);
      }
      if (confEl) {
        const conf = analysis.benchmark.confidence || 'none';
        confEl.className = `bm-conf-tag conf-${conf}`;
        confEl.textContent = `${conf.toUpperCase()} CONF`;
      }
    } else {
      bmPill.style.display = 'none';
    }
  }

  // Cross-portal match strip
  const cpStrip = document.getElementById('cross-portal-strip');
  const cpTitle = document.getElementById('cp-match-title');
  const cpDesc = document.getElementById('cp-match-desc');
  if (analysis.crossPortalMatches && analysis.crossPortalMatches.length > 0) {
    const bestMatch = analysis.crossPortalMatches[0];
    cpStrip.style.display = 'block';
    cpTitle.textContent = `🏷️ Also Seen on ${bestMatch.portal.toUpperCase()} at ₹${bestMatch.rent.toLocaleString('en-IN')}`;
    cpDesc.textContent = `${bestMatch.verdict} (${bestMatch.reasons.slice(0, 2).join(' • ')})`;
  } else {
    cpStrip.style.display = 'none';
  }

  // Quick Track Button Sync
  syncQuickTrackBtn();

  // Observations (Points & Reasons)
  const pointsList = document.getElementById('points-list');
  pointsList.innerHTML = '';

  const points = analysis.humanReadablePoints || [];
  for (const item of points) {
    const card = document.createElement('div');
    card.className = `point-card ${item.fired ? 'flagged' : 'normal'}`;

    const head = document.createElement('div');
    head.className = 'point-head';

    const cat = document.createElement('span');
    cat.className = 'point-cat';
    cat.textContent = item.category;

    const st = document.createElement('span');
    st.className = `point-status ${item.fired ? 'status-flagged' : 'status-normal'}`;
    st.textContent = item.fired ? 'Flagged' : 'Verified';

    head.appendChild(cat);
    head.appendChild(st);

    const body = document.createElement('div');
    body.className = 'point-body';
    body.textContent = `${item.point}. ${item.reason}`;

    card.appendChild(head);
    card.appendChild(body);
    pointsList.appendChild(card);
  }
}

async function syncQuickTrackBtn() {
  const btn = document.getElementById('btn-quick-track');
  if (!activeAnalysis || !activeAnalysis.listing) {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = 'inline-block';
  const trackedMap = await getTrackedListings();
  const listingKey = activeAnalysis.listing.listingKey;

  if (trackedMap[listingKey]) {
    btn.textContent = '✓ Tracked';
    btn.classList.add('is-tracked');
  } else {
    btn.textContent = '★ Track';
    btn.classList.remove('is-tracked');
  }
}

async function initQuickTrackBtn() {
  const btn = document.getElementById('btn-quick-track');
  btn.addEventListener('click', async () => {
    if (!activeAnalysis || !activeAnalysis.listing) return;
    const listingKey = activeAnalysis.listing.listingKey;
    const trackedMap = await getTrackedListings();

    if (trackedMap[listingKey]) {
      await untrackListing(listingKey);
    } else {
      await trackListing({
        ...activeAnalysis.listing,
        listingKey,
        signalsFiredCount: activeAnalysis.firedCount || 0,
        badgeLabel: activeAnalysis.badgeLabel,
        badgeTone: activeAnalysis.badgeTone
      });
    }
    await syncQuickTrackBtn();
    await updateTrackedBadgeCount();
  });
}

async function updateTrackedBadgeCount() {
  const tracked = await getTrackedListings();
  const count = Object.keys(tracked).length;
  document.getElementById('tracked-badge-count').textContent = count;
  document.getElementById('wl-total-count').textContent = count;
}

/**
 * Renders the Buyhatke Watchlist tab with inline SVG sparklines
 */
async function renderWatchlistView() {
  await updateTrackedBadgeCount();
  const trackedMap = await getTrackedListings();
  const listEl = document.getElementById('tracked-list');
  const items = Object.values(trackedMap);

  listEl.innerHTML = '';

  if (items.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.innerHTML = `
      <span class="empty-icon">📌</span>
      <b>No saved listings yet</b>
      <p>Click "★ Track Flat" on any rental page to track price drops and build your comparison shortlist.</p>
    `;
    listEl.appendChild(emptyState);
    document.getElementById('compare-tray').style.display = 'none';
    return;
  }

  for (const item of items) {
    const stats = computePriceHistoryStats(item.snapshots || []);
    const card = document.createElement('div');
    card.className = 'tracked-item-card';

    // Header row with compare checkbox, portal tag, title
    const headRow = document.createElement('div');
    headRow.className = 'tracked-item-head';

    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'compare-checkbox';
    chk.checked = selectedForCompare.has(item.listingKey);
    chk.title = 'Select to compare side-by-side';
    chk.addEventListener('change', () => {
      if (chk.checked) {
        selectedForCompare.add(item.listingKey);
      } else {
        selectedForCompare.delete(item.listingKey);
      }
      renderCompareTray();
    });

    const info = document.createElement('div');
    info.className = 'tracked-item-info';

    const titleEl = document.createElement('div');
    titleEl.className = 'tracked-item-title';

    const portalBadge = document.createElement('span');
    portalBadge.className = 'tracked-item-portal';
    portalBadge.textContent = item.portal;

    const titleText = document.createElement('span');
    titleText.textContent = item.title;

    titleEl.appendChild(portalBadge);
    titleEl.appendChild(titleText);

    const metaEl = document.createElement('div');
    metaEl.className = 'tracked-item-meta';
    metaEl.textContent = `${item.locality || 'Unknown'} • ${item.bhk || 2} BHK • ${formatTimeOnMarket(item.firstSeen)}`;

    info.appendChild(titleEl);
    info.appendChild(metaEl);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove-sm';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove from watchlist';
    removeBtn.addEventListener('click', async () => {
      await untrackListing(item.listingKey);
      selectedForCompare.delete(item.listingKey);
      renderWatchlistView();
      renderCompareTray();
    });

    headRow.appendChild(chk);
    headRow.appendChild(info);
    headRow.appendChild(removeBtn);
    card.appendChild(headRow);

    // Price and Delta row
    const priceRow = document.createElement('div');
    priceRow.className = 'tracked-item-price-row';

    const rentEl = document.createElement('span');
    rentEl.className = 'tracked-item-rent';
    rentEl.textContent = `₹ ${(stats.currentRent || item.rent || 0).toLocaleString('en-IN')}/mo`;

    const deltaPill = document.createElement('span');
    if (stats.delta < 0) {
      deltaPill.className = 'delta-pill drop';
      deltaPill.textContent = `↓ ₹${Math.abs(stats.delta).toLocaleString('en-IN')} (${stats.pctChange}%)`;
    } else if (stats.delta > 0) {
      deltaPill.className = 'delta-pill rise';
      deltaPill.textContent = `↑ ₹${stats.delta.toLocaleString('en-IN')} (+${stats.pctChange}%)`;
    } else {
      deltaPill.className = 'delta-pill stable';
      deltaPill.textContent = 'Price stable';
    }

    priceRow.appendChild(rentEl);
    priceRow.appendChild(deltaPill);
    card.appendChild(priceRow);

    // Sparkline
    const sparkWrap = document.createElement('div');
    sparkWrap.className = 'sparkline-box';
    const svgStr = generateSparklineSVG(item.snapshots || [{ rent: item.rent }], { width: 370, height: 38 });
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgStr, 'image/svg+xml');
    sparkWrap.appendChild(document.importNode(svgDoc.documentElement, true));
    card.appendChild(sparkWrap);

    // Footer with Status & Note
    const footerRow = document.createElement('div');
    footerRow.className = 'tracked-item-footer';

    const statusSel = document.createElement('select');
    statusSel.className = 'status-dropdown';
    ['Interested', 'Visited', 'Rejected'].forEach(st => {
      const opt = document.createElement('option');
      opt.value = st;
      opt.textContent = st;
      if (item.status === st) opt.selected = true;
      statusSel.appendChild(opt);
    });
    statusSel.addEventListener('change', async () => {
      await updateListingStatus(item.listingKey, statusSel.value);
    });

    const noteIn = document.createElement('input');
    noteIn.type = 'text';
    noteIn.className = 'note-input-sm';
    noteIn.placeholder = 'Add private note...';
    noteIn.value = item.note || '';
    noteIn.addEventListener('change', async () => {
      await updateListingNote(item.listingKey, noteIn.value);
    });

    footerRow.appendChild(statusSel);
    footerRow.appendChild(noteIn);
    card.appendChild(footerRow);

    listEl.appendChild(card);
  }

  renderCompareTray();
}

/**
 * Renders side-by-side comparison table when 2 or more listings are selected
 */
async function renderCompareTray() {
  const tray = document.getElementById('compare-tray');
  const countSpan = document.getElementById('compare-count');
  const wrapper = document.getElementById('compare-table-wrapper');

  const trackedMap = await getTrackedListings();
  const selectedItems = Array.from(selectedForCompare)
    .map(key => trackedMap[key])
    .filter(Boolean);

  countSpan.textContent = selectedItems.length;

  if (selectedItems.length < 2) {
    tray.style.display = 'none';
    wrapper.innerHTML = '';
    return;
  }

  tray.style.display = 'block';
  const matrix = buildComparisonMatrix(selectedItems);

  let html = '<table class="compare-table"><thead><tr><th>Feature</th>';
  for (const col of matrix.columns) {
    html += `<th>${col.title.slice(0, 18)}...</th>`;
  }
  html += '</tr></thead><tbody>';

  // Row: Rent
  html += '<tr><td><b>Rent (mo)</b></td>';
  for (const col of matrix.columns) {
    const isBest = col.rent === matrix.bests.minRent;
    html += `<td class="${isBest ? 'val-best' : ''}">₹${col.rent.toLocaleString('en-IN')}</td>`;
  }
  html += '</tr>';

  // Row: Deposit Multiple
  html += '<tr><td><b>Deposit</b></td>';
  for (const col of matrix.columns) {
    const isBest = col.depositMultiple !== null && col.depositMultiple === matrix.bests.minDepositMult;
    html += `<td class="${isBest ? 'val-best' : ''}">₹${col.deposit.toLocaleString('en-IN')} (${col.depositMultiple !== null ? col.depositMultiple + 'x' : '--'})</td>`;
  }
  html += '</tr>';

  // Row: Rent per sq.ft
  html += '<tr><td><b>Rent/sq.ft</b></td>';
  for (const col of matrix.columns) {
    const isBest = col.rentPerSqft !== null && col.rentPerSqft === matrix.bests.minRentSqft;
    html += `<td class="${isBest ? 'val-best' : ''}">${col.rentPerSqft ? '₹' + col.rentPerSqft : 'N/A'}</td>`;
  }
  html += '</tr>';

  // Row: Floor & Area
  html += '<tr><td><b>Floor & Area</b></td>';
  for (const col of matrix.columns) {
    html += `<td>${col.floor !== 'N/A' ? 'Fl ' + col.floor : 'Fl --'} • ${col.area ? col.area + ' sqft' : '--'}</td>`;
  }
  html += '</tr>';

  // Row: Risk Flags
  html += '<tr><td><b>Signals</b></td>';
  for (const col of matrix.columns) {
    const isBest = col.signalsFiredCount === matrix.bests.minSignals;
    html += `<td class="${isBest ? 'val-best' : ''}">${col.signalsFiredCount === 0 ? '✓ Clean' : col.signalsFiredCount + ' flagged'}</td>`;
  }
  html += '</tr>';

  html += '</tbody></table>';
  wrapper.innerHTML = html;
}

function initCompareEvents() {
  const clearBtn = document.getElementById('btn-clear-compare');
  clearBtn.addEventListener('click', () => {
    selectedForCompare.clear();
    renderWatchlistView();
  });

  const exportBtn = document.getElementById('btn-export-csv');
  exportBtn.addEventListener('click', async () => {
    const trackedMap = await getTrackedListings();
    if (Object.keys(trackedMap).length === 0) {
      alert('Your watchlist is empty. Track a rental listing first to export.');
      return;
    }
    const csvContent = exportShortlistToCSV(trackedMap);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `flataudit_shortlist_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });
}

// Initial boot
document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  initQuickTrackBtn();
  initCompareEvents();
  checkBackendHealth();
  updateTrackedBadgeCount();

  const feedbackBtn = document.getElementById('popup-feedback-btn');
  if (feedbackBtn) {
    feedbackBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const reason = prompt('What looks wrong with this analysis? (e.g. rent benchmark seems off, phrasing falsely flagged)\n\nNote: We collect only non-personal listing attributes (bhk, locality, rent). Zero contact or personal info is sent.');
      if (reason && reason.trim()) {
        try {
          const report = {
            timestamp: Date.now(),
            portal: activeAnalysis?.listing?.portal || 'unknown',
            bhk: activeAnalysis?.listing?.bhk || 2,
            locality: activeAnalysis?.listing?.locality || '',
            rent: activeAnalysis?.listing?.rent || 0,
            benchmarkLevel: activeAnalysis?.benchmark?.level || 'none',
            firedCount: activeAnalysis?.firedCount || 0,
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
  }

  // Query the current active tab directly so the popup immediately reflects the active page
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs && tabs[0];
    if (activeTab && activeTab.id) {
      chrome.tabs.sendMessage(activeTab.id, { type: 'GET_PAGE_ANALYSIS' }, (res) => {
        if (!chrome.runtime.lastError && res && res.analysis) {
          activeAnalysis = res.analysis;
          updateTrustUI(res.analysis);
          return;
        }
        // Fallback to storage if active tab has no response
        chrome.storage.local.get(['lastAnalysis'], (result) => {
          if (result && result.lastAnalysis) {
            activeAnalysis = result.lastAnalysis;
            updateTrustUI(result.lastAnalysis);
          }
        });
      });
    } else {
      chrome.storage.local.get(['lastAnalysis'], (result) => {
        if (result && result.lastAnalysis) {
          activeAnalysis = result.lastAnalysis;
          updateTrustUI(result.lastAnalysis);
        }
      });
    }
  });
});
