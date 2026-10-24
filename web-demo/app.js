import { hammingDistance } from '../extension/lib/dhash.js';
import { analyzeListing } from '../extension/lib/signals.js';

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

async function checkApiHealth() {
  const badge = document.getElementById('api-status-badge');
  try {
    const res = await fetch('http://127.0.0.1:8000/api/v1/health');
    if (res.ok) {
      badge.innerHTML = '<span class="pulse"></span> FastAPI Online';
      badge.className = 'badge-status online';
      return true;
    }
  } catch (e) {}
  badge.innerHTML = '<span class="pulse" style="background:#f2b84b;box-shadow:none"></span> Client-Side Engine';
  badge.className = 'badge-status';
  return false;
}

function evaluateCurrentForm() {
  const listing = {
    title: document.getElementById('input-title').value.trim(),
    locality: document.getElementById('input-locality').value.trim(),
    bhk: parseInt(document.getElementById('input-bhk').value, 10),
    rent: parseInt(document.getElementById('input-rent').value, 10),
    deposit: parseInt(document.getElementById('input-deposit').value, 10),
    description: document.getElementById('input-desc').value.trim()
  };

  const seenCount = parseInt(document.getElementById('input-seen-count').value, 10) || 1;

  // Run pure signals engine
  currentAnalysisResult = analyzeListing(listing, { seenCount });

  // Update UI Elements with human-readable points & reasons
  updateBadgeUI(currentAnalysisResult);
  updateVerdictBanner(currentAnalysisResult);
  updatePointsGrid(currentAnalysisResult);
  updateSafetyChecklist(currentAnalysisResult);
  updateKillChainUI(currentAnalysisResult);
  updateMockDrawer(currentAnalysisResult);
}

function updateBadgeUI(res) {
  const iconEl = document.getElementById('badge-icon-el');
  const pillEl = document.getElementById('badge-pill-el');

  iconEl.textContent = res.badgeTone === 'bad' ? '⚠️' : res.badgeTone === 'warn' ? '🔍' : '🛡️';
  pillEl.textContent = res.badgeLabel;
  pillEl.className = `badge-pill tone-${res.badgeTone}`;
}

function updateVerdictBanner(res) {
  const banner = document.getElementById('verdict-banner');
  const icon = document.getElementById('verdict-icon');
  const title = document.getElementById('verdict-title');
  const sub = document.getElementById('verdict-subtitle');

  banner.className = `verdict-banner tone-${res.badgeTone}`;
  icon.textContent = res.badgeTone === 'bad' ? '⚠️' : res.badgeTone === 'warn' ? '🔍' : '✓';

  if (res.badgeTone === 'bad') {
    title.textContent = `High Risk: ${res.firedCount} Scam Signals Flagged`;
  } else if (res.badgeTone === 'warn') {
    title.textContent = `Caution: Unusual Listing Pattern`;
  } else {
    title.textContent = `Listing Verified Normal`;
  }

  sub.textContent = res.headlineSummary || 'Detailed safety evaluation based on local market norms.';
}

function updatePointsGrid(res) {
  const grid = document.getElementById('points-grid');
  grid.innerHTML = '';

  if (res.humanReadablePoints && res.humanReadablePoints.length > 0) {
    for (const item of res.humanReadablePoints) {
      const card = document.createElement('div');
      card.className = `demo-point-card ${item.fired ? 'flagged' : 'normal'}`;

      const top = document.createElement('div');
      top.className = 'card-top';

      const cat = document.createElement('div');
      cat.className = 'card-cat';
      cat.textContent = `${item.icon} ${item.category}`;

      const tag = document.createElement('span');
      tag.className = `card-tag ${item.fired ? 'flagged' : 'normal'}`;
      tag.textContent = item.fired ? 'Flagged' : 'Verified';

      top.appendChild(cat);
      top.appendChild(tag);

      const point = document.createElement('div');
      point.className = 'point-text';
      point.textContent = item.point;

      const reason = document.createElement('div');
      reason.className = 'reason-text';
      reason.textContent = item.reason;

      card.appendChild(top);
      card.appendChild(point);
      card.appendChild(reason);

      grid.appendChild(card);
    }
  }
}

function updateSafetyChecklist(res) {
  const list = document.getElementById('safety-checklist');
  list.innerHTML = '';

  const tips = res.safetyAdvice || [
    'Never transfer any gate entry pass or token fee via UPI before an in-person flat walkthrough.',
    'Always meet the building security guard or caretaker at the society gate first.',
    'Legitimate landlords in India never ask for visiting charges to view a flat.'
  ];

  for (const tip of tips) {
    const li = document.createElement('li');
    li.textContent = tip;
    list.appendChild(li);
  }
}

function updateMockDrawer(res) {
  const body = document.getElementById('mock-drawer-body');
  body.innerHTML = '';

  // Banner inside drawer
  const drawerBanner = document.createElement('div');
  drawerBanner.className = `verdict-banner tone-${res.badgeTone}`;
  drawerBanner.style.padding = '8px 12px';
  drawerBanner.style.marginBottom = '12px';

  const icon = document.createElement('span');
  icon.className = 'verdict-icon';
  icon.style.fontSize = '18px';
  icon.textContent = res.badgeTone === 'bad' ? '⚠️' : res.badgeTone === 'warn' ? '🔍' : '✓';

  const textGroup = document.createElement('div');
  const bTitle = document.createElement('b');
  bTitle.style.fontSize = '12.5px';
  bTitle.style.display = 'block';
  bTitle.textContent = res.badgeTone === 'bad'
    ? `Caution: ${res.firedCount} Scam Signals Flagged`
    : res.badgeTone === 'warn' ? 'Unusual Listing Pattern' : 'Verified Normal';

  const pSub = document.createElement('span');
  pSub.style.fontSize = '11.5px';
  pSub.style.color = '#95a5c0';
  pSub.textContent = res.headlineSummary;

  textGroup.appendChild(bTitle);
  textGroup.appendChild(pSub);
  drawerBanner.appendChild(icon);
  drawerBanner.appendChild(textGroup);
  body.appendChild(drawerBanner);

  // Points list
  const pointsWrap = document.createElement('div');
  pointsWrap.style.display = 'flex';
  pointsWrap.style.flexDirection = 'column';
  pointsWrap.style.gap = '8px';

  for (const item of res.humanReadablePoints) {
    const card = document.createElement('div');
    card.className = `demo-point-card ${item.fired ? 'flagged' : 'normal'}`;
    card.style.padding = '8px 10px';

    const pTitle = document.createElement('div');
    pTitle.style.fontSize = '12px';
    pTitle.style.fontWeight = '700';
    pTitle.style.color = item.fired ? '#f2b84b' : '#6fd6a0';
    pTitle.textContent = `${item.icon} ${item.category}: ${item.point}`;

    const pReason = document.createElement('div');
    pReason.style.fontSize = '11px';
    pReason.style.color = '#95a5c0';
    pReason.style.marginTop = '2px';
    pReason.textContent = item.reason;

    card.appendChild(pTitle);
    card.appendChild(pReason);
    pointsWrap.appendChild(card);
  }
  body.appendChild(pointsWrap);
}

function updateKillChainUI(res) {
  const step1 = document.getElementById('kc-1');
  const step2 = document.getElementById('kc-2');
  const step3 = document.getElementById('kc-3');
  const step4 = document.getElementById('kc-4');

  [step1, step2, step3, step4].forEach(s => s.classList.remove('active'));

  if (res.scamKillChainStage.includes('Stage 3')) {
    step3.classList.add('active');
  } else if (res.scamKillChainStage.includes('Stage 1')) {
    step1.classList.add('active');
  }
}

// Hamming Distance Live Calculator
function updateHammingCalc() {
  const hashA = document.getElementById('hash-a').value.trim();
  const hashB = document.getElementById('hash-b').value.trim();
  const distEl = document.getElementById('hamming-dist-val');
  const verdictEl = document.getElementById('hamming-verdict');

  if (hashA.length !== 16 || hashB.length !== 16) {
    distEl.textContent = '--';
    verdictEl.textContent = 'Enter two 16-hex char hashes';
    verdictEl.className = 'metric-badge diff';
    return;
  }

  try {
    const dist = hammingDistance(hashA, hashB);
    distEl.textContent = `${dist} bits`;

    if (dist <= 10) {
      verdictEl.textContent = `Duplicate Match (≤ 10 bits difference)`;
      verdictEl.className = 'metric-badge';
    } else {
      verdictEl.textContent = `Distinct Photos (> 10 bits difference)`;
      verdictEl.className = 'metric-badge diff';
    }
  } catch (e) {
    distEl.textContent = 'Error';
  }
}

// Wire up events
document.addEventListener('DOMContentLoaded', () => {
  checkApiHealth();

  // Mock badge click handler: toggles drawer and keeps it open!
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

  // Hamming inputs
  document.getElementById('hash-a').addEventListener('input', updateHammingCalc);
  document.getElementById('hash-b').addEventListener('input', updateHammingCalc);

  // Initial load
  loadPreset('normal');
  updateHammingCalc();
});
