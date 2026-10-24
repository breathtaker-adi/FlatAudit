/**
 * FlatAudit - Popup Controller
 * Renders human-readable points, reasons, and renter safety guidance.
 */

async function checkBackendHealth() {
  const statusEl = document.getElementById('backend-status');
  try {
    const res = await fetch('http://127.0.0.1:8000/api/v1/health', { method: 'GET' });
    if (res.ok) {
      statusEl.className = 'status-indicator online';
      statusEl.title = 'Backend online (FastAPI + SQLite)';
      return;
    }
  } catch (e) {}
  statusEl.className = 'status-indicator offline';
  statusEl.title = 'Backend offline (using local extension signals)';
}

function updateUI(analysis) {
  if (!analysis) return;

  // 1. Verdict Banner
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

  // 2. Property Overview Strip
  const titleEl = document.getElementById('prop-title');
  titleEl.textContent = analysis.listing?.title || 'Active Listing';

  const tagRent = document.getElementById('tag-rent');
  const tagDeposit = document.getElementById('tag-deposit');
  const tagBhk = document.getElementById('tag-bhk');

  if (analysis.listing?.rent) {
    tagRent.textContent = `₹ ${analysis.listing.rent.toLocaleString('en-IN')}`;
  }
  if (analysis.listing?.deposit !== null && analysis.listing?.deposit !== undefined) {
    tagDeposit.textContent = `Dep: ₹ ${analysis.listing.deposit.toLocaleString('en-IN')}`;
  }
  if (analysis.listing?.bhk) {
    tagBhk.textContent = `${analysis.listing.bhk} BHK`;
  }

  // 3. Observations (Points & Reasons)
  const pointsList = document.getElementById('points-list');
  pointsList.innerHTML = '';

  const points = analysis.humanReadablePoints || [
    {
      category: 'Rent Pricing',
      icon: '💰',
      fired: analysis.signals?.price?.fired,
      point: analysis.signals?.price?.reason || 'Rent within normal range',
      reason: 'Pricing matches local market standards.'
    },
    {
      category: 'Security Deposit',
      icon: '📑',
      fired: analysis.signals?.deposit?.fired,
      point: analysis.signals?.deposit?.reason || 'Standard deposit ratio',
      reason: 'Deposit adheres to city customs.'
    },
    {
      category: 'Advance Fee Terms',
      icon: '💬',
      fired: analysis.signals?.phrase?.fired,
      point: analysis.signals?.phrase?.reason || 'No suspicious terms',
      reason: 'Standard lease terms described.'
    },
    {
      category: 'Photo Authenticity',
      icon: '🖼️',
      fired: analysis.signals?.duplicateImage?.fired,
      point: analysis.signals?.duplicateImage?.reason || 'Photo appears unique',
      reason: 'Photo fingerprint has not been seen across conflicting listings.'
    }
  ];

  for (const item of points) {
    const card = document.createElement('div');
    card.className = `point-card ${item.fired ? 'flagged' : 'normal'}`;

    const head = document.createElement('div');
    head.className = 'point-head';

    const catTitle = document.createElement('span');
    catTitle.textContent = `${item.icon} ${item.category}`;

    const badge = document.createElement('span');
    badge.className = `status-badge ${item.fired ? 'flagged' : 'normal'}`;
    badge.textContent = item.fired ? 'Flagged' : 'Normal';

    head.appendChild(catTitle);
    head.appendChild(badge);

    const body = document.createElement('div');
    body.className = 'point-body';
    body.textContent = item.point;

    const reason = document.createElement('div');
    reason.className = 'point-reason';
    reason.textContent = item.reason;

    card.appendChild(head);
    card.appendChild(body);
    card.appendChild(reason);

    pointsList.appendChild(card);
  }

  // 4. Renter Safety Advice Checklist
  const checklist = document.getElementById('safety-checklist');
  if (checklist && analysis.safetyAdvice) {
    checklist.innerHTML = '';
    for (const tip of analysis.safetyAdvice) {
      const li = document.createElement('li');
      li.textContent = tip;
      checklist.appendChild(li);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  checkBackendHealth();

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['lastAnalysis'], (result) => {
      if (result.lastAnalysis) {
        updateUI(result.lastAnalysis);
      }
    });
  }
});
