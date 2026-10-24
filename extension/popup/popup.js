/**
 * FlatAudit - Popup Controller
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

  const pill = document.getElementById('trust-pill');
  pill.textContent = analysis.badgeLabel;
  pill.className = `pill tone-${analysis.badgeTone}`;

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

  // Populate individual signal reasons
  const sigPrice = document.getElementById('sig-price');
  const sigDeposit = document.getElementById('sig-deposit');
  const sigPhrase = document.getElementById('sig-phrase');
  const sigDhash = document.getElementById('sig-dhash');

  if (analysis.signals?.price) {
    sigPrice.textContent = analysis.signals.price.reason;
  }
  if (analysis.signals?.deposit) {
    sigDeposit.textContent = analysis.signals.deposit.reason;
  }
  if (analysis.signals?.phrase) {
    sigPhrase.textContent = analysis.signals.phrase.reason;
  }
  if (analysis.signals?.duplicateImage) {
    sigDhash.textContent = analysis.signals.duplicateImage.reason;
  } else if (analysis.topHash) {
    sigDhash.textContent = `Photo hash: ${analysis.topHash.slice(0, 10)}... (Single occurrence)`;
  }

  // Kill Chain
  const killChainEl = document.getElementById('kill-chain-stage');
  if (analysis.scamKillChainStage) {
    killChainEl.textContent = analysis.scamKillChainStage;
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
