import { hammingDistance, isDuplicateImage } from '../extension/lib/dhash.js';
import { analyzeListing } from '../extension/lib/signals.js';

const PRESETS = {
  normal: {
    title: "2 BHK Semi Furnished Apartment for Rent in Indiranagar",
    locality: "Indiranagar, Bangalore",
    bhk: 2,
    rent: 42000,
    deposit: 150000,
    desc: "Spacious and well ventilated 2 BHK flat near Indiranagar Metro Station. Modular kitchen, covered car parking, 24x7 security guard, and power backup. Physical visits can be scheduled during weekends between 10 AM to 6 PM.",
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
  const result = analyzeListing(listing, { seenCount });

  // Update UI Elements
  updateBadgeUI(result);
  updateSignalCards(result);
  updateFactsList(result);
  updateKillChainUI(result);
}

function updateBadgeUI(res) {
  const iconEl = document.getElementById('badge-icon-el');
  const pillEl = document.getElementById('badge-pill-el');

  iconEl.textContent = res.badgeTone === 'bad' ? '⚠️' : res.badgeTone === 'warn' ? '🔍' : '🛡️';
  pillEl.textContent = res.badgeLabel;
  pillEl.className = `badge-pill tone-${res.badgeTone}`;
}

function updateSignalCards(res) {
  // Price
  const cardPrice = document.getElementById('card-price');
  const stPrice = document.getElementById('status-price');
  const rPrice = document.getElementById('reason-price');
  if (res.signals.price.fired) {
    cardPrice.className = 'signal-card fired';
    stPrice.textContent = 'Anomaly Detected';
    rPrice.textContent = res.signals.price.reason;
  } else {
    cardPrice.className = 'signal-card';
    stPrice.textContent = 'Normal';
    rPrice.textContent = res.signals.price.reason;
  }

  // Deposit
  const cardDep = document.getElementById('card-deposit');
  const stDep = document.getElementById('status-deposit');
  const rDep = document.getElementById('reason-deposit');
  if (res.signals.deposit.fired) {
    cardDep.className = 'signal-card fired';
    stDep.textContent = 'Anomaly Detected';
    rDep.textContent = res.signals.deposit.reason;
  } else {
    cardDep.className = 'signal-card';
    stDep.textContent = 'Normal';
    rDep.textContent = res.signals.deposit.reason;
  }

  // Phrase
  const cardPhr = document.getElementById('card-phrase');
  const stPhr = document.getElementById('status-phrase');
  const rPhr = document.getElementById('reason-phrase');
  if (res.signals.phrase.fired) {
    cardPhr.className = 'signal-card fired';
    stPhr.textContent = `Flagged (${res.signals.phrase.matchedCount} patterns)`;
    rPhr.textContent = res.signals.phrase.reason;
  } else {
    cardPhr.className = 'signal-card';
    stPhr.textContent = 'Clean';
    rPhr.textContent = res.signals.phrase.reason;
  }

  // Image
  const cardImg = document.getElementById('card-image');
  const stImg = document.getElementById('status-image');
  const rImg = document.getElementById('reason-image');
  if (res.signals.duplicateImage.fired) {
    cardImg.className = 'signal-card fired';
    stImg.textContent = `Seen across ${res.signals.duplicateImage.count} listings`;
    rImg.textContent = res.signals.duplicateImage.reason;
  } else {
    cardImg.className = 'signal-card';
    stImg.textContent = 'Single Listing';
    rImg.textContent = res.signals.duplicateImage.reason;
  }
}

function updateFactsList(res) {
  const container = document.getElementById('facts-list');
  container.innerHTML = '';

  if (res.observableFacts && res.observableFacts.length > 0) {
    for (const fact of res.observableFacts) {
      const li = document.createElement('li');
      li.className = 'fact-item';
      li.textContent = `• ${fact}`;
      container.appendChild(li);
    }
  } else {
    const li = document.createElement('li');
    li.className = 'clean-item';
    li.textContent = '✓ No anomaly signals detected. Listing conforms to regional price and deposit distributions.';
    container.appendChild(li);
  }
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
