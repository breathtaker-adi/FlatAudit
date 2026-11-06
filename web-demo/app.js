import { hammingDistance } from '../extension/lib/dhash.js';
import { analyzeListing } from '../extension/lib/signals.js';
import { calculateInvestmentForecast, formatIndianCurrencyAbbr } from '../extension/lib/investment.js';
import {
  trackListing,
  getTrackedListings,
  untrackListing,
  updateListingStatus,
  updateListingNote,
  computePriceHistoryStats,
  generateSparklineSVG,
  formatTimeOnMarket,
  buildComparisonMatrix,
  exportShortlistToCSV
} from '../extension/lib/tracker.js';
import {
  generateBuyerReport,
  renderPrintableHtml,
  estimateTotalCost,
  getPaperworkChecklist
} from '../extension/lib/buyer.js';

const PRESETS = {
  normal: {
    title: "2 BHK Semi Furnished Apartment for Rent in Indiranagar",
    locality: "Indiranagar, Bangalore",
    bhk: 2,
    rent: 42000,
    deposit: 150000,
    desc: "Spacious and well ventilated 2 BHK flat near Indiranagar Metro Station. Modular kitchen, covered car parking, 24x7 security guard, and power backup. Physical visits can be scheduled during weekends between 10 AM to 6 PM with prior appointment.",
    hash: "a4c28f1107be924d",
    seenCount: 1
  },
  resale_buy: {
    listingType: "sale",
    title: "2 BHK Resale in Prestige Casabella, Electronic City Phase 1",
    locality: "Electronic City, Bangalore",
    bhk: 2,
    rent: 12500000,
    price: 12500000,
    pricePerSqft: 10162,
    area_sqft: 1230,
    deposit: 0,
    desc: "Well maintained East-facing 2 BHK flat for immediate resale in Electronic City Phase 1. 1,230 sq.ft carpet area. Clear title, freehold, A-Khata, Occupancy Certificate (OC) and Commencement Certificate (CC) available. RERA Reg: PRM/KA/RERA/1251/310/PR/171015/000451. Bank loans approved.",
    hash: "e3a890f12c4b7710",
    seenCount: 1
  },
  godrej_reflections: {
    listingType: "sale",
    title: "3 BHK Highrise in Godrej Reflections, Sarjapur Main Road",
    locality: "Indiranagar, Bangalore",
    bhk: 3,
    rent: 21500000,
    price: 21500000,
    pricePerSqft: 12285,
    area_sqft: 1750,
    deposit: 0,
    desc: "Luxury 3 BHK Lake-facing apartment in Godrej Reflections on Sarjapur Road. 1,750 sq.ft carpet area. Registered K-RERA Project: PRM/KA/RERA/1251/310/PR/170915/000234. All approvals in place with designated ICICI Bank escrow account. Possession completed.",
    hash: "d4e28f1107be994d",
    seenCount: 1
  },
  army_token: {
    title: "Urgent Luxury 3 BHK Fully Furnished in HSR Layout",
    locality: "HSR Layout, Bangalore",
    bhk: 3,
    rent: 12000,
    deposit: 25000,
    desc: "I am an Indian Army defense officer recently transferred to Srinagar border on urgent duty posting. Rent is kept very low at 12000 because money is not my motive. Keys are deposited at military camp courier. Before physical flat visit, society gate pass and military visiting token registration fee of Rs 2500 must be sent via UPI scanner. 100% refundable upon gate arrival.",
    hash: "f1e2d3c4b5a69788",
    seenCount: 4
  },
  bait_price: {
    title: "Luxury 3 BHK Penthouse for Rent in DLF Phase 2 Cyber City",
    locality: "Cyber City, Gurgaon",
    bhk: 3,
    rent: 14000,
    deposit: 14000,
    desc: "Exclusive luxury 3 BHK penthouse in DLF Cyber City. Owner relocated abroad permanently to London UK. Rent heavily reduced for immediate tenant. Keys with building security but security requires courier clearance pass of 3000 rupees before physical inspection.",
    hash: "a4c28f1107be924d",
    seenCount: 3
  },
  zero_deposit: {
    title: "Fully Furnished 2 BHK Flat in Megapolis Mystic, Hinjawadi",
    locality: "Hinjawadi, Pune",
    bhk: 2,
    rent: 9500,
    deposit: 0,
    desc: "Urgent rent! Owner traveling out of country tonight. Premium furnished 2 BHK at nominal rent 9500 with zero deposit scheme. Multiple tenants queued. To lock slot and hold property, deposit booking token of Rs 2000 on PhonePe. 100% refundable upon arrival.",
    hash: "c8a14e927f05b3d6",
    seenCount: 2
  }
};

let currentAnalysisResult = null;
let isDrawerOpen = false;
const demoSelectedForCompare = new Set();

function loadPreset(key) {
  const p = PRESETS[key];
  if (!p) return;

  document.getElementById('input-title').value = p.title;
  document.getElementById('input-locality').value = p.locality;
  document.getElementById('input-bhk').value = p.bhk;
  document.getElementById('input-rent').value = p.rent;
  document.getElementById('input-deposit').value = p.deposit;
  document.getElementById('input-desc').value = p.desc;
  document.getElementById('input-image-hash').value = p.hash;
  document.getElementById('input-seen-count').value = p.seenCount;

  evaluateCurrentForm();
}

function evaluateCurrentForm() {
  const rawRent = parseInt(document.getElementById('input-rent').value, 10);
  const isSale = rawRent >= 1000000 || /sale|resale|buy/i.test(document.getElementById('input-title').value);
  const desc = document.getElementById('input-desc').value;
  const reraMatch = desc.match(/(PRM\/KA\/RERA\/[\w\/\-]+|P\d{9,11}|HRERA[-\w\/\-]+)/i);

  const listing = {
    listingType: isSale ? 'sale' : 'rent',
    title: document.getElementById('input-title').value,
    locality: document.getElementById('input-locality').value,
    bhk: parseInt(document.getElementById('input-bhk').value, 10),
    rent: isSale ? null : rawRent,
    price: isSale ? rawRent : null,
    salePrice: isSale ? rawRent : null,
    area_sqft: 1230,
    areaSqft: 1230,
    pricePerSqft: isSale ? Math.round(rawRent / 1230) : null,
    possessionStatus: isSale ? 'ready_to_move' : 'unknown',
    reraId: reraMatch ? reraMatch[1] : null,
    deposit: parseInt(document.getElementById('input-deposit').value, 10),
    description: desc,
    images: []
  };

  const hash = document.getElementById('input-image-hash').value;
  const seenCount = parseInt(document.getElementById('input-seen-count').value, 10) || 1;
  const ladderMode = document.getElementById('input-benchmark-ladder')?.value || 'auto';

  let context = { seenCount };

  if (ladderMode === 'level1_peer') {
    // Inject 12 realistic peer search results for this locality & BHK
    const baseRent = listing.bhk === 1 ? 22000 : listing.bhk === 3 ? 65000 : 40000;
    context.peerListings = [
      { rent: baseRent - 2000, bhk: listing.bhk, area_sqft: 1100, deposit: baseRent * 3 },
      { rent: baseRent + 1000, bhk: listing.bhk, area_sqft: 1250, deposit: baseRent * 4 },
      { rent: baseRent, bhk: listing.bhk, area_sqft: 1150, deposit: baseRent * 3.5 },
      { rent: baseRent + 2000, bhk: listing.bhk, area_sqft: 1300, deposit: baseRent * 4 },
      { rent: baseRent - 1000, bhk: listing.bhk, area_sqft: 1120, deposit: baseRent * 3 },
      { rent: baseRent + 3000, bhk: listing.bhk, area_sqft: 1280, deposit: baseRent * 4.5 },
      { rent: baseRent, bhk: listing.bhk, area_sqft: 1180, deposit: baseRent * 3 },
      { rent: baseRent - 1500, bhk: listing.bhk, area_sqft: 1080, deposit: baseRent * 3 },
      { rent: baseRent + 1500, bhk: listing.bhk, area_sqft: 1220, deposit: baseRent * 4 },
      { rent: baseRent + 500, bhk: listing.bhk, area_sqft: 1190, deposit: baseRent * 3.5 },
      { rent: baseRent - 500, bhk: listing.bhk, area_sqft: 1140, deposit: baseRent * 3 },
      { rent: baseRent + 2500, bhk: listing.bhk, area_sqft: 1270, deposit: baseRent * 4 }
    ];
  } else if (ladderMode === 'level3_district') {
    listing.geohash = 'tdr1';
    listing.locality = '';
  } else if (ladderMode === 'level4_city') {
    listing.geohash = '';
    listing.locality = 'Bengaluru';
  } else if (ladderMode === 'level5_none') {
    listing.geohash = '';
    listing.locality = 'Unknown Village, Remote District (Zero Local Baseline)';
  }

  const analysis = analyzeListing(listing, context);
  currentAnalysisResult = { ...analysis, listing, hash };
  renderResults(currentAnalysisResult);
}

function renderResults(res) {
  // Update Dossier Hero Details
  const eyebrowEl = document.getElementById('dossier-locality-eyebrow');
  if (eyebrowEl) eyebrowEl.textContent = res.listing?.locality || 'Property Audit Dossier';

  const titleEl = document.getElementById('dossier-property-title');
  if (titleEl) titleEl.textContent = res.listing?.title || 'Listing Due Diligence Summary';

  const isSale = res.listing?.listingType === 'sale' || Boolean(res.listing?.price && !res.listing?.rent) || (res.listing?.price >= 1000000);

  const priceValEl = document.getElementById('dossier-price-val');
  if (priceValEl) {
    if (isSale) {
      priceValEl.textContent = `₹ ${formatIndianCurrencyAbbr(res.listing.price || res.listing.salePrice || 0)}`;
    } else {
      priceValEl.textContent = `₹ ${(res.listing.rent || 0).toLocaleString('en-IN')}/mo`;
    }
  }

  const secLblEl = document.getElementById('dossier-sec-lbl');
  const secValEl = document.getElementById('dossier-sec-val');
  if (secLblEl && secValEl) {
    if (isSale) {
      secLblEl.textContent = 'Rate / Sq.Ft';
      const pps = res.listing.pricePerSqft || Math.round((res.listing.price || 0) / (res.listing.area_sqft || 1230));
      secValEl.textContent = pps ? `₹ ${pps.toLocaleString('en-IN')}` : '₹ --';
    } else {
      secLblEl.textContent = 'Security Deposit';
      secValEl.textContent = res.listing.deposit ? `₹ ${res.listing.deposit.toLocaleString('en-IN')}` : '₹ --';
    }
  }

  const bhkValEl = document.getElementById('dossier-bhk-val');
  if (bhkValEl) {
    bhkValEl.textContent = `${res.listing.bhk || 2} BHK • ${(res.listing.area_sqft || 1230).toLocaleString('en-IN')} sqft`;
  }

  // Update Investment Forecast
  const forecast = calculateInvestmentForecast(res.listing);
  if (forecast && forecast.horizons) {
    const h3 = forecast.horizons['3y'];
    const h5 = forecast.horizons['5y'];
    const h10 = forecast.horizons['10y'];
    const setVal = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    setVal('web-invest-val-3y', `₹ ${h3.projectedValueFormatted}`);
    setVal('web-invest-gain-3y', `+₹ ${h3.absoluteGainFormatted} (+${h3.percentageGainFormatted})`);
    setVal('web-invest-val-5y', `₹ ${h5.projectedValueFormatted}`);
    setVal('web-invest-gain-5y', `+₹ ${h5.absoluteGainFormatted} (+${h5.percentageGainFormatted})`);
    setVal('web-invest-val-10y', `₹ ${h10.projectedValueFormatted}`);
    setVal('web-invest-gain-10y', `+₹ ${h10.absoluteGainFormatted} (+${h10.percentageGainFormatted})`);

    if (forecast.rentalYield) {
      setVal('web-invest-monthly-rent', `₹ ${forecast.rentalYield.estimatedMonthlyRentFormatted}/mo`);
      setVal('web-invest-5y-rent', `₹ ${forecast.rentalYield.fiveYearCumulativeRentFormatted}`);
      setVal('web-invest-total-wealth', `+₹ ${forecast.rentalYield.fiveYearTotalWealthGainFormatted}`);
    }
  }

  // Update Benchmark Ladder Card
  const bmCard = document.getElementById('benchmark-level-card');
  const bmTag = document.getElementById('demo-bm-tag');
  const bmConf = document.getElementById('demo-bm-conf');
  const bmDesc = document.getElementById('demo-bm-desc');

  if (bmCard && res.benchmark) {
    const levelLabels = {
      peer_page: '📊 Level 1: Peer Page',
      area_cell: '📍 Level 2: Area Cell',
      district_cell: '🗺️ Level 3: District Cell',
      city: '🏙️ Level 4: City Baseline',
      none: 'ℹ️ Level 5: No Baseline (Silence Mode)'
    };
    const sampleText = res.benchmark.n ? `n=${res.benchmark.n}` : 'n=0';
    if (bmTag) bmTag.textContent = `${levelLabels[res.benchmark.level] || '📊 Benchmark'} (${sampleText})`;

    const conf = res.benchmark.confidence || 'none';
    if (bmConf) {
      bmConf.className = `bm-conf-pill conf-${conf}`;
      bmConf.textContent = `${conf.toUpperCase()} CONFIDENCE`;
    }

    if (bmDesc) {
      if (res.benchmark.level === 'none') {
        bmDesc.textContent = 'Not enough local data in this city (sample < 5). FlatAudit stays silent and suppresses price red flags to protect truth and avoid false alarms.';
      } else {
        const medText = res.benchmark.median ? `₹${res.benchmark.median.toLocaleString('en-IN')}/mo` : 'N/A';
        bmDesc.textContent = `${res.benchmark.sourceLabel} • Trimmed Median: ${medText} (MAD: ±₹${(res.benchmark.mad || 0).toLocaleString('en-IN')})`;
      }
    }
  }

  const verdictBanner = document.getElementById('verdict-banner');
  const verdictIcon = document.getElementById('verdict-icon');
  const verdictTitle = document.getElementById('verdict-title');
  const verdictSub = document.getElementById('verdict-subtitle');

  verdictBanner.className = `verdict-banner tone-${res.badgeTone}`;
  verdictIcon.textContent = res.badgeTone === 'bad' ? '⚠️' : res.badgeTone === 'warn' ? '🔍' : '✓';
  verdictTitle.textContent = res.badgeTone === 'bad'
    ? `High Risk Signals (${res.firedCount} Flagged)`
    : res.badgeTone === 'warn'
    ? 'Unusual Listing Pattern'
    : 'Listing Verified Normal';
  verdictSub.textContent = res.headlineSummary || 'Detailed safety evaluation based on local market norms.';

  const mockBadgeBtn = document.getElementById('mock-badge-btn');
  const badgeIcon = document.getElementById('badge-icon-el');
  const badgePill = document.getElementById('badge-pill-el');
  badgePill.className = `badge-pill tone-${res.badgeTone}`;
  badgePill.textContent = res.badgeLabel;
  badgeIcon.textContent = res.badgeTone === 'bad' ? '⚠️' : res.badgeTone === 'warn' ? '🔍' : '🛡️';

  const mockDrawerBody = document.getElementById('mock-drawer-body');
  mockDrawerBody.innerHTML = '';

  const mockBanner = document.createElement('div');
  mockBanner.className = `mock-drawer-banner tone-${res.badgeTone}`;
  mockBanner.innerHTML = `
    <b>${verdictTitle.textContent}</b>
    <p>${verdictSub.textContent}</p>
  `;
  mockDrawerBody.appendChild(mockBanner);

  const mockPointsTitle = document.createElement('div');
  mockPointsTitle.className = 'mock-points-title';
  mockPointsTitle.textContent = 'Key Observations (Observable Facts):';
  mockDrawerBody.appendChild(mockPointsTitle);

  const pointsGrid = document.getElementById('points-grid');
  pointsGrid.innerHTML = '';

  const points = res.humanReadablePoints || [];
  for (const p of points) {
    const card = document.createElement('div');
    card.className = `point-card ${p.fired ? 'flagged' : 'normal'}`;
    card.innerHTML = `
      <div class="point-header">
        <span class="point-cat">${p.category}</span>
        <span class="point-status ${p.fired ? 'status-flagged' : 'status-normal'}">${p.fired ? 'Flagged' : 'Verified'}</span>
      </div>
      <div class="point-headline">${p.point}</div>
      <div class="point-reason">${p.reason}</div>
    `;
    pointsGrid.appendChild(card);

    const drawerCard = card.cloneNode(true);
    mockDrawerBody.appendChild(drawerCard);
  }

  // Update Kill Chain Bar
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`kc-${i}`);
    if (el) el.classList.remove('active');
  }

  if (res.signals?.phrase?.fired) {
    document.getElementById('kc-3')?.classList.add('active');
  } else if (res.signals?.price?.fired || res.signals?.duplicateImage?.fired) {
    document.getElementById('kc-1')?.classList.add('active');
  }

  // Handle Buyer Mode vs Renter Safety Advice
  const buyerPanel = document.getElementById('buyer-mode-panel');
  const renterSafetyCard = document.getElementById('renter-safety-card');

  if (isSale && buyerPanel) {
    buyerPanel.style.display = 'block';
    if (renterSafetyCard) renterSafetyCard.style.display = 'none';

    const buyerReport = generateBuyerReport(res.listing, {
      reraId: res.listing.reraId,
      projectName: res.listing.projectName
    });

    // 1. Scenario Tag
    const scenarioTag = document.getElementById('demo-scenario-tag');
    if (scenarioTag) {
      scenarioTag.textContent = (buyerReport.meta.scenario || 'resale').toUpperCase().replace('_', ' ');
    }

    // 2. 4-Line Evaluation List
    const repList = document.getElementById('demo-buyer-rep-list');
    if (repList) {
      repList.innerHTML = '';
      const repLines = [
        { key: 'Flat', item: buyerReport.reportLines.flat },
        { key: 'Project', item: buyerReport.reportLines.project },
        { key: 'Builder', item: buyerReport.reportLines.builder },
        { key: 'Paperwork', item: buyerReport.reportLines.paperwork }
      ];

      for (const line of repLines) {
        const itemEl = document.createElement('div');
        itemEl.className = 'buyer-rep-item';
        const indClass = line.item.indicator === '✓' ? 'ind-ok' : (line.item.indicator === '⚠' ? 'ind-warn' : 'ind-unknown');
        itemEl.innerHTML = `
          <b class="buyer-rep-label">${line.key}</b>
          <div class="buyer-rep-content">
            <span class="buyer-rep-ind ${indClass}">${line.item.indicator}</span>
            <span class="buyer-rep-summary">${line.item.summary}</span>
            ${line.item.details ? `<div class="buyer-rep-details">${line.item.details}</div>` : ''}
          </div>
        `;
        repList.appendChild(itemEl);
      }
    }

    // 3. All-In Cost Summary
    const costSummary = document.getElementById('demo-buyer-cost-summary');
    if (costSummary) {
      const c = buyerReport.costEstimate;
      costSummary.innerHTML = `
        <div class="cost-summary-header">Estimated All-In Acquisition Cost (Karnataka)</div>
        <div class="cost-summary-grid">
          <div><span>Base Price:</span> <strong>₹${(c.basePrice / 10000000).toFixed(2)} Cr</strong></div>
          <div><span>Stamp Duty (5.6%):</span> <strong>₹${c.statutoryCharges.stampDutyAmount.toLocaleString('en-IN')}</strong></div>
          <div><span>Registration (1.0%):</span> <strong>₹${c.statutoryCharges.registrationAmount.toLocaleString('en-IN')}</strong></div>
          <div><span>GST (${c.statutoryCharges.gstPct}%):</span> <strong>₹${c.statutoryCharges.gstAmount.toLocaleString('en-IN')}</strong></div>
          <div><span>Maintenance & Connection:</span> <strong>₹${c.otherCharges.total.toLocaleString('en-IN')}</strong></div>
          <div><span>Estimated All-In:</span> <strong style="color:var(--tint);">₹${(c.totalCost / 10000000).toFixed(2)} Cr</strong></div>
        </div>
        <div class="cost-emi-note">Estimated Monthly EMI (20 years @ 8.5% on 80% loan): <strong>₹${c.financing.monthlyEmi.toLocaleString('en-IN')}/mo</strong></div>
      `;
    }

    // 4. Paperwork Checklist Grid
    const checklistGrid = document.getElementById('demo-paperwork-checklist');
    if (checklistGrid) {
      checklistGrid.innerHTML = '';
      for (const doc of buyerReport.paperworkChecklist) {
        const docCard = document.createElement('div');
        docCard.className = 'paperwork-doc-card';
        const tagClass = doc.importance === 'MANDATORY' ? 'tag-mandatory' : (doc.importance === 'CRITICAL' ? 'tag-critical' : 'tag-recommended');
        docCard.innerHTML = `
          <div class="doc-header">
            <span class="doc-name">${doc.name}</span>
            <span class="doc-tag ${tagClass}">${doc.importance}</span>
          </div>
          <div class="doc-desc">${doc.description}</div>
          <div class="doc-verify">Verify: ${doc.whereToVerify}</div>
        `;
        checklistGrid.appendChild(docCard);
      }
    }

    // 5. Printable Report Button
    const printBtn = document.getElementById('demo-print-report-btn');
    if (printBtn) {
      printBtn.onclick = (e) => {
        e.preventDefault();
        const printWin = window.open('', '_blank');
        if (printWin) {
          const html = renderPrintableHtml(buyerReport, res.listing);
          printWin.document.open();
          printWin.document.write(html);
          printWin.document.close();
        }
      };
    }
  } else {
    if (buyerPanel) buyerPanel.style.display = 'none';
    if (renterSafetyCard) renterSafetyCard.style.display = 'block';
  }
}

function updateHammingCalc() {
  const ha = document.getElementById('hash-a').value.trim();
  const hb = document.getElementById('hash-b').value.trim();
  const dist = hammingDistance(ha, hb);

  const distValEl = document.getElementById('hamming-dist-val');
  const verdictEl = document.getElementById('hamming-verdict');

  distValEl.textContent = `${dist} bits`;

  if (dist <= 10) {
    verdictEl.className = 'metric-badge match';
    verdictEl.textContent = `Duplicate Match (≤ 10 bits difference)`;
  } else {
    verdictEl.className = 'metric-badge diff';
    verdictEl.textContent = `Distinct Image (> 10 bits difference)`;
  }
}

async function checkApiHealth() {
  const badge = document.getElementById('api-status-badge');
  try {
    const res = await fetch('http://127.0.0.1:8000/api/v1/health');
    if (res.ok) {
      badge.className = 'badge-status online';
      badge.innerHTML = '<span class="pulse"></span> API Ready';
      return;
    }
  } catch (e) {}
  badge.className = 'badge-status offline';
  badge.innerHTML = '<span class="pulse offline"></span> API Offline (In-Browser Mode)';
}

/* ==========================================================================
   Buyhatke Companion: Watchlist, Price Drop Simulation, Sparklines & Compare
   ========================================================================== */

async function renderDemoWatchlist() {
  const trackedMap = await getTrackedListings();
  const items = Object.values(trackedMap);
  const container = document.getElementById('demo-watchlist-cards');
  document.getElementById('demo-wl-count').textContent = items.length;

  container.innerHTML = '';

  if (items.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" style="color:var(--text-tertiary); display:flex; justify-content:center;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <b>No properties tracked in simulation yet</b>
        <p>Use the simulation actions on the left to track a listing, simulate price revisions, and view dynamic price history sparklines.</p>
      </div>
    `;
    document.getElementById('demo-compare-section').style.display = 'none';
    return;
  }

  for (const item of items) {
    const stats = computePriceHistoryStats(item.snapshots || []);
    const card = document.createElement('div');
    card.className = 'demo-wl-card';

    // Header
    const head = document.createElement('div');
    head.className = 'demo-wl-card-head';

    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'compare-checkbox';
    chk.checked = demoSelectedForCompare.has(item.listingKey);
    chk.title = 'Select to compare';
    chk.addEventListener('change', () => {
      if (chk.checked) {
        demoSelectedForCompare.add(item.listingKey);
      } else {
        demoSelectedForCompare.delete(item.listingKey);
      }
      renderDemoCompare();
    });

    const info = document.createElement('div');
    info.className = 'demo-wl-card-info';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'demo-wl-card-title';
    titleDiv.innerHTML = `<span class="demo-wl-portal-tag">${item.portal}</span> ${item.title}`;

    const metaDiv = document.createElement('div');
    metaDiv.className = 'demo-wl-meta';
    metaDiv.textContent = `${item.locality || 'Locality'} • ${item.bhk || 2} BHK • Area: ${item.areaSqft ? item.areaSqft + ' sqft' : 'N/A'} • ${formatTimeOnMarket(item.firstSeen)}`;

    info.appendChild(titleDiv);
    info.appendChild(metaDiv);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove-sm';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove from watchlist';
    removeBtn.addEventListener('click', async () => {
      await untrackListing(item.listingKey);
      demoSelectedForCompare.delete(item.listingKey);
      renderDemoWatchlist();
      renderDemoCompare();
    });

    head.appendChild(chk);
    head.appendChild(info);
    head.appendChild(removeBtn);
    card.appendChild(head);

    // Price Row with Delta Pill
    const priceRow = document.createElement('div');
    priceRow.className = 'demo-wl-price-row';

    const rentText = document.createElement('span');
    rentText.className = 'demo-wl-rent';
    const isItemSale = item.listingType === 'sale' || Boolean(item.price && !item.rent);
    if (isItemSale) {
      const p = stats.currentPrice || item.price || 0;
      const pStr = p >= 10000000 ? `₹ ${(p / 10000000).toFixed(2)} Cr` : `₹ ${(p / 100000).toFixed(2)} L`;
      rentText.textContent = pStr;
    } else {
      rentText.textContent = `₹ ${(stats.currentRent || item.rent).toLocaleString('en-IN')}/month`;
    }

    const deltaPill = document.createElement('span');
    if (stats.delta < 0) {
      deltaPill.className = 'delta-pill drop';
      deltaPill.textContent = `🎉 Price dropped ₹${Math.abs(stats.delta).toLocaleString('en-IN')} (${stats.pctChange}%)`;
    } else if (stats.delta > 0) {
      deltaPill.className = 'delta-pill rise';
      deltaPill.textContent = `↑ Price increased ₹${stats.delta.toLocaleString('en-IN')} (+${stats.pctChange}%)`;
    } else {
      deltaPill.className = 'delta-pill stable';
      deltaPill.textContent = 'Price unchanged';
    }

    priceRow.appendChild(rentText);
    priceRow.appendChild(deltaPill);
    card.appendChild(priceRow);

    // Sparkline Graph
    const sparkBox = document.createElement('div');
    sparkBox.className = 'demo-wl-spark-box';
    const svgStr = generateSparklineSVG(item.snapshots || [{ rent: item.rent }], { width: 500, height: 48 });
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgStr, 'image/svg+xml');
    sparkBox.appendChild(document.importNode(svgDoc.documentElement, true));
    card.appendChild(sparkBox);

    // Footer with Status & Note
    const footer = document.createElement('div');
    footer.className = 'demo-wl-footer';

    const statusSel = document.createElement('select');
    statusSel.className = 'demo-wl-status-sel';
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
    noteIn.className = 'demo-wl-note-in';
    noteIn.placeholder = 'Add private note...';
    noteIn.value = item.note || '';
    noteIn.addEventListener('change', async () => {
      await updateListingNote(item.listingKey, noteIn.value);
    });

    footer.appendChild(statusSel);
    footer.appendChild(noteIn);
    card.appendChild(footer);

    container.appendChild(card);
  }

  renderDemoCompare();
}

async function renderDemoCompare() {
  const section = document.getElementById('demo-compare-section');
  const countEl = document.getElementById('demo-compare-count');
  const matrixContainer = document.getElementById('demo-compare-matrix');

  const trackedMap = await getTrackedListings();
  const selectedItems = Array.from(demoSelectedForCompare)
    .map(key => trackedMap[key])
    .filter(Boolean);

  countEl.textContent = selectedItems.length;

  if (selectedItems.length < 2) {
    section.style.display = 'none';
    matrixContainer.innerHTML = '';
    return;
  }

  section.style.display = 'block';
  const matrix = buildComparisonMatrix(selectedItems);

  let html = '<table><thead><tr><th>Metric</th>';
  for (const col of matrix.columns) {
    html += `<th>${col.title.slice(0, 22)}...</th>`;
  }
  html += '</tr></thead><tbody>';

  // Monthly Rent
  html += '<tr><td><b>Monthly Rent</b></td>';
  for (const col of matrix.columns) {
    const isBest = col.rent === matrix.bests.minRent;
    html += `<td class="${isBest ? 'val-best' : ''}">₹${col.rent.toLocaleString('en-IN')}</td>`;
  }
  html += '</tr>';

  // Rent / sqft
  html += '<tr><td><b>Rent per sq.ft</b></td>';
  for (const col of matrix.columns) {
    const isBest = col.rentPerSqft !== null && col.rentPerSqft === matrix.bests.minRentSqft;
    html += `<td class="${isBest ? 'val-best' : ''}">${col.rentPerSqft ? '₹' + col.rentPerSqft + '/sqft' : 'N/A'}</td>`;
  }
  html += '</tr>';

  // Deposit Multiple
  html += '<tr><td><b>Deposit Multiple</b></td>';
  for (const col of matrix.columns) {
    const isBest = col.depositMultiple !== null && col.depositMultiple === matrix.bests.minDepositMult;
    html += `<td class="${isBest ? 'val-best' : ''}">₹${col.deposit.toLocaleString('en-IN')} (${col.depositMultiple !== null ? col.depositMultiple + 'x' : '--'})</td>`;
  }
  html += '</tr>';

  // Floor & Built-up Area
  html += '<tr><td><b>Floor & Area</b></td>';
  for (const col of matrix.columns) {
    html += `<td>${col.floor !== 'N/A' ? 'Floor ' + col.floor : 'Floor N/A'} • ${col.area ? col.area + ' sqft' : 'N/A'}</td>`;
  }
  html += '</tr>';

  // Fraud / Scam Flags
  html += '<tr><td><b>Trust Signals</b></td>';
  for (const col of matrix.columns) {
    const isBest = col.signalsFiredCount === matrix.bests.minSignals;
    html += `<td class="${isBest ? 'val-best' : ''}">${col.signalsFiredCount === 0 ? '✓ Clean Listing' : col.signalsFiredCount + ' Flagged'}</td>`;
  }
  html += '</tr>';

  html += '</tbody></table>';
  matrixContainer.innerHTML = html;
}

function initDemoSimulatorControls() {
  // Track Primary
  document.getElementById('btn-sim-track-primary').addEventListener('click', async () => {
    await trackListing({
      portal: 'nobroker',
      listingKey: 'nobroker:nb-blr-49821',
      title: '2 BHK Semi Furnished Apartment in Indiranagar',
      locality: 'Indiranagar, Bangalore',
      bhk: 2,
      rent: 42000,
      deposit: 150000,
      areaSqft: 1250,
      floor: 3,
      signalsFiredCount: 0,
      badgeLabel: 'Looks normal',
      badgeTone: 'ok'
    });
    demoSelectedForCompare.add('nobroker:nb-blr-49821');
    await renderDemoWatchlist();
  });

  // Revisit with ₹2,000 Drop
  document.getElementById('btn-sim-drop-1').addEventListener('click', async () => {
    const res = await trackListing({
      portal: 'nobroker',
      listingKey: 'nobroker:nb-blr-49821',
      title: '2 BHK Semi Furnished Apartment in Indiranagar',
      locality: 'Indiranagar, Bangalore',
      bhk: 2,
      rent: 40000,
      deposit: 150000,
      areaSqft: 1250,
      floor: 3
    });
    demoSelectedForCompare.add('nobroker:nb-blr-49821');
    await renderDemoWatchlist();
  });

  // Revisit with Further Drop
  document.getElementById('btn-sim-drop-2').addEventListener('click', async () => {
    await trackListing({
      portal: 'nobroker',
      listingKey: 'nobroker:nb-blr-49821',
      title: '2 BHK Semi Furnished Apartment in Indiranagar',
      locality: 'Indiranagar, Bangalore',
      bhk: 2,
      rent: 38500,
      deposit: 150000,
      areaSqft: 1250,
      floor: 3
    });
    demoSelectedForCompare.add('nobroker:nb-blr-49821');
    await renderDemoWatchlist();
  });

  // Add more listings for compare
  document.getElementById('btn-sim-add-more').addEventListener('click', async () => {
    await trackListing({
      portal: 'magicbricks',
      listingKey: 'magicbricks:mb-ggn-77123',
      title: '3 BHK Penthouse in DLF Cyber City',
      locality: 'Cyber City, Gurgaon',
      bhk: 3,
      rent: 38000,
      deposit: 76000,
      areaSqft: 2200,
      floor: 8,
      signalsFiredCount: 1,
      badgeTone: 'warn'
    });
    await trackListing({
      portal: '99acres',
      listingKey: '99acres:prop-mumbai-9901',
      title: '1 BHK Apartment in Powai Hiranandani',
      locality: 'Powai, Mumbai',
      bhk: 1,
      rent: 35000,
      deposit: 100000,
      areaSqft: 580,
      floor: 4,
      signalsFiredCount: 0,
      badgeTone: 'ok'
    });
    demoSelectedForCompare.add('nobroker:nb-blr-49821');
    demoSelectedForCompare.add('magicbricks:mb-ggn-77123');
    demoSelectedForCompare.add('99acres:prop-mumbai-9901');
    await renderDemoWatchlist();
  });

  // Clear compare
  document.getElementById('btn-demo-clear-compare').addEventListener('click', () => {
    demoSelectedForCompare.clear();
    renderDemoWatchlist();
  });

  // Export CSV
  document.getElementById('btn-demo-export-csv').addEventListener('click', async () => {
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

  // Cross Match Demo
  document.getElementById('btn-run-cross-match').addEventListener('click', async () => {
    const outputEl = document.getElementById('cross-match-output');
    outputEl.textContent = 'Searching for cross-portal duplicates on FastAPI backend...';

    try {
      const res = await fetch('http://127.0.0.1:8000/api/v1/matches?rent=42000&portal=nobroker&listing_key=nobroker:nb-blr-49821&locality=Indiranagar&bhk=2&area_sqft=1250&floor=3&image_hash=a4c28f1107be924d');
      if (res.ok) {
        const data = await res.json();
        if (data.matches && data.matches.length > 0) {
          const m = data.matches[0];
          outputEl.innerHTML = `
            <b style="color: var(--ok);">✓ Cross-Portal Duplicate Found!</b><br>
            <b>Portal:</b> ${m.portal.toUpperCase()}<br>
            <b>Rent:</b> ₹${m.rent.toLocaleString('en-IN')}/mo (₹${Math.abs(m.rent_delta).toLocaleString('en-IN')} cheaper)<br>
            <b>Reasons:</b> ${m.reasons.join(' • ')}<br>
            <span style="font-size: 11.5px; color: var(--text-muted);">${m.verdict}</span>
          `;
          return;
        }
      }
    } catch (e) {}

    // In-browser mock demonstration fallback
    outputEl.innerHTML = `
      <b style="color: var(--ok);">✓ Cross-Portal Duplicate Detected:</b><br>
      <b>Also Seen on:</b> MAGICBRICKS at ₹40,000/month (Save ₹2,000/mo)<br>
      <b>Matching Reasons:</b> Same 2 BHK in Indiranagar • Built-up area 1,250 sq.ft matches within 0% • Matching photo dHash (Hamming distance 2/64)<br>
      <span style="font-size: 11.5px; color: var(--text-muted);">Likely the same property listed across multiple portals with a price discrepancy.</span>
    `;
  });
}

// Wire up events
document.addEventListener('DOMContentLoaded', () => {
  checkApiHealth();
  initDemoSimulatorControls();

  // Top Primary Navigation (Property Audit | Price History & Compare | Research & Lab)
  document.querySelectorAll('.demo-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.demo-tab-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.demo-tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const targetId = btn.getAttribute('data-tab');
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add('active');
      if (targetId === 'tab-content-buyhatke') {
        renderDemoWatchlist();
      }
    });
  });

  // Dossier Subview Tabs (Audit Findings | Capital Appreciation & ROI | Statutory Due Diligence)
  document.querySelectorAll('.dossier-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.dossier-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.dossier-subview').forEach(v => v.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-dossier');
      const targetView = document.getElementById(targetId);
      if (targetView) targetView.classList.add('active');
    });
  });

  // Mock badge click handler: toggles drawer and keeps it open
  const mockBadgeBtn = document.getElementById('mock-badge-btn');
  const mockDrawerContainer = document.getElementById('mock-drawer-container');
  const mockDrawerCloseBtn = document.getElementById('mock-drawer-close-btn');

  mockBadgeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isDrawerOpen = !isDrawerOpen;
    if (isDrawerOpen) {
      mockDrawerContainer.classList.add('open');
    } else {
      mockDrawerContainer.classList.remove('open');
    }
  });

  mockDrawerCloseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isDrawerOpen = false;
    mockDrawerContainer.classList.remove('open');
  });

  // Preset buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      loadPreset(e.target.dataset.preset);
    });
  });

  // Form submit
  document.getElementById('listing-form').addEventListener('submit', (e) => {
    e.preventDefault();
    evaluateCurrentForm();
  });

  document.getElementById('btn-reset').addEventListener('click', () => {
    loadPreset('normal');
  });

  const ladderSelect = document.getElementById('input-benchmark-ladder');
  if (ladderSelect) {
    ladderSelect.addEventListener('change', () => {
      evaluateCurrentForm();
    });
  }

  // Hamming inputs
  document.getElementById('hash-a').addEventListener('input', updateHammingCalc);
  document.getElementById('hash-b').addEventListener('input', updateHammingCalc);

  // Initial load
  loadPreset('normal');
  updateHammingCalc();
});
