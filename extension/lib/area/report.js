/**
 * FlatAudit Area Report Orchestrator (Slice S8)
 * 
 * Coordinates: Settings check -> Cache lookup -> Overpass query -> 
 * 5 Category Evaluations -> Standardized UI response payload.
 */

import { getAreaReportSettings } from '../settings.js';
import { getAreaFromCache, saveAreaToCache } from './area_cache.js';
import { queryOverpass } from './osm_client.js';
import { getCityTier } from './grades.js';
import { evaluateAllCategories } from './categories.js';
import defaultRules from '../data/area_rules.json' with { type: 'json' };

export const EXACT_AREA_STRINGS = Object.freeze({
  OFF: 'Area Report is off. Turn it on in settings to see what is nearby.',
  LOADING: 'Checking the map…',
  UNAVAILABLE: 'Area data unavailable right now.',
  THIN_MAP: 'Not enough map data here.',
  THIN_NIGHT_DATA: 'Not enough night data on the map.',
  SAFETY_LABEL: 'Nearby map facts, not crime data.',
  UNSUPPORTED_CITY: 'Not available for this city yet.',
  ATTRIBUTION: 'Map data © OpenStreetMap contributors',
  STRAIGHT_LINE_NOTE: 'Straight-line distances. Map data © OpenStreetMap contributors.'
});

/**
 * Generates the full 5-category Area Report for a property location.
 * @param {object} params
 * @param {number|string} params.lat
 * @param {number|string} params.lng
 * @param {string} [params.city]
 * @param {object} [options]
 * @param {object} [options.storage] StorageAdapter
 * @param {Function} [options.fetchFn] Custom fetch
 * @param {object} [options.settings] Explicit settings override
 * @param {number} [options.now]
 * @returns {Promise<object>} Standardized report payload for UI rendering
 */
export async function generateAreaReport({ lat, lng, city }, options = {}) {
  // 1. City Support Check
  const cityTier = getCityTier(city, defaultRules);
  if (!cityTier) {
    return {
      status: 'unsupported_city',
      message: EXACT_AREA_STRINGS.UNSUPPORTED_CITY,
      categories: null,
      attribution: EXACT_AREA_STRINGS.ATTRIBUTION
    };
  }

  // 2. Settings Opt-In Check (Area Report is OFF by default)
  const settings = options.settings || (await getAreaReportSettings(options.storage));
  if (!settings || !settings.enabled) {
    return {
      status: 'off',
      message: EXACT_AREA_STRINGS.OFF,
      categories: null,
      attribution: EXACT_AREA_STRINGS.ATTRIBUTION
    };
  }

  // 3. Valid Coordinates Check
  if (!lat || !lng || isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) {
    return {
      status: 'unavailable',
      message: EXACT_AREA_STRINGS.UNAVAILABLE,
      categories: null,
      attribution: EXACT_AREA_STRINGS.ATTRIBUTION
    };
  }

  const numLat = parseFloat(lat);
  const numLng = parseFloat(lng);
  const now = options.now || Date.now();

  // 4. Cache Lookup
  try {
    const cached = await getAreaFromCache(numLat, numLng, options.storage, now);
    if (cached && cached.elements && cached.elements.length > 0) {
      if (cached.status === 'thin_map') {
        return {
          status: 'thin_map',
          message: EXACT_AREA_STRINGS.THIN_MAP,
          cityTier,
          categories: null,
          attribution: EXACT_AREA_STRINGS.ATTRIBUTION
        };
      }

      const categories = evaluateAllCategories(cached.elements, cityTier, defaultRules);
      return {
        status: 'ok',
        cityTier,
        fromCache: true,
        categories,
        attribution: EXACT_AREA_STRINGS.ATTRIBUTION
      };
    }
  } catch (err) {}

  // 5. Query Overpass (via Background worker or direct fetchFn in test/standalone)
  let queryResult;
  try {
    queryResult = await queryOverpass(numLat, numLng, options.fetchFn || globalThis.fetch, now);
  } catch (err) {
    return {
      status: 'unavailable',
      message: EXACT_AREA_STRINGS.UNAVAILABLE,
      categories: null,
      attribution: EXACT_AREA_STRINGS.ATTRIBUTION
    };
  }

  if (!queryResult || queryResult.status === 'unavailable') {
    return {
      status: 'unavailable',
      message: EXACT_AREA_STRINGS.UNAVAILABLE,
      categories: null,
      attribution: EXACT_AREA_STRINGS.ATTRIBUTION
    };
  }

  // Cache the result (reduced representation)
  try {
    await saveAreaToCache(numLat, numLng, queryResult, options.storage, now);
  } catch (err) {}

  // 6. Thin Map Check (< 5 elements within 1 km)
  if (queryResult.status === 'thin_map' || queryResult.density1km < 5) {
    return {
      status: 'thin_map',
      message: EXACT_AREA_STRINGS.THIN_MAP,
      cityTier,
      categories: null,
      attribution: EXACT_AREA_STRINGS.ATTRIBUTION
    };
  }

  // 7. Evaluate All 5 Graded Categories
  const categories = evaluateAllCategories(queryResult.elements, cityTier, defaultRules);

  return {
    status: 'ok',
    cityTier,
    fromCache: false,
    confidence: queryResult.confidence,
    density1km: queryResult.density1km,
    categories,
    attribution: EXACT_AREA_STRINGS.ATTRIBUTION
  };
}

/**
 * Renders criteria thresholds string for a category.
 * @param {string} categoryId
 * @param {'metro'|'smaller'} cityTier
 * @returns {string}
 */
export function formatCriteriaThresholds(categoryId, cityTier = 'metro') {
  const cat = defaultRules.categories?.[categoryId];
  if (!cat || !cat.checks) return '';

  const parts = [];
  for (const [key, checkDef] of Object.entries(cat.checks)) {
    const limits = checkDef[cityTier] || checkDef.metro;
    if (limits && limits.length >= 2) {
      parts.push(`${checkDef.label} (≤ ${limits[0]}km Good, ≤ ${limits[1]}km Okay)`);
    }
  }

  return parts.join(' • ');
}

/**
 * Creates accessible DOM element cards for the Area Report section.
 * Supports all states: 'off', 'loading', 'ok', 'unavailable', 'thin_map', 'unsupported_city'.
 * @param {object} reportData Result of generateAreaReport
 * @param {Document} [doc] Document implementation (supports jsdom in tests)
 * @returns {HTMLElement} Container element ready to append to Key Observations
 */
export function renderAreaReportDOM(reportData, doc = globalThis.document) {
  const container = doc.createElement('div');
  container.className = 'flataudit-area-report-section';

  // Section Header
  const header = doc.createElement('div');
  header.className = 'flataudit-area-section-header';
  header.innerHTML = `
    <span class="flataudit-area-section-title">📍 Area Report</span>
    <span class="flataudit-area-section-tag">OpenStreetMap Facts</span>
  `;
  container.appendChild(header);

  if (!reportData) {
    const card = doc.createElement('div');
    card.className = 'flataudit-point-card normal';
    card.textContent = EXACT_AREA_STRINGS.UNAVAILABLE;
    container.appendChild(card);
    return container;
  }

  // Handle Non-OK States with exact strings
  if (reportData.status !== 'ok') {
    const card = doc.createElement('div');
    card.className = 'flataudit-point-card normal flataudit-area-state-card';

    let message = EXACT_AREA_STRINGS.UNAVAILABLE;
    let icon = 'ℹ️';
    let subnote = '';

    if (reportData.status === 'off') {
      message = EXACT_AREA_STRINGS.OFF;
      icon = '🗺️';
      subnote = 'Turn on Area Report in extension settings to see emergency, transit, grocery, and night environment facts nearby.';
    } else if (reportData.status === 'loading') {
      message = EXACT_AREA_STRINGS.LOADING;
      icon = '⏳';
      subnote = 'Querying OpenStreetMap Overpass facts within 1 km...';
    } else if (reportData.status === 'thin_map') {
      message = EXACT_AREA_STRINGS.THIN_MAP;
      icon = '📍';
      subnote = 'Fewer than 5 local landmarks recorded in this ~100m grid cell on OpenStreetMap.';
    } else if (reportData.status === 'unsupported_city') {
      message = EXACT_AREA_STRINGS.UNSUPPORTED_CITY;
      icon = '🏙️';
      subnote = 'Pilot dataset currently supports Bengaluru, Jaipur, and Jodhpur.';
    } else if (reportData.message) {
      message = reportData.message;
    }

    card.innerHTML = `
      <div class="flataudit-area-state-row">
        <span class="flataudit-area-state-icon">${icon}</span>
        <div class="flataudit-area-state-content">
          <div class="flataudit-point-headline">${message}</div>
          ${subnote ? `<div class="flataudit-area-state-desc">${subnote}</div>` : ''}
        </div>
      </div>
    `;
    container.appendChild(card);
    return container;
  }

  // Render 5 Category Cards
  const categories = reportData.categories || {};
  const categoryIds = [
    'emergency_healthcare',
    'daily_supplies',
    'commute_transit',
    'safety_environment',
    'lifestyle_community'
  ];

  for (const catId of categoryIds) {
    const catData = categories[catId];
    if (!catData) continue;

    const card = doc.createElement('div');
    card.className = 'flataudit-point-card normal flataudit-area-card';
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-expanded', 'false');
    card.style.cursor = 'pointer';

    // Status pill class
    let statusClass = 'status-normal';
    if (catData.grade === 'Good') statusClass = 'status-good';
    else if (catData.grade === 'Okay') statusClass = 'status-okay';
    else if (catData.grade === 'Weak') statusClass = 'status-weak';

    // Card Header: Category Name + Grade & Points Chips
    const cardHeader = doc.createElement('div');
    cardHeader.className = 'flataudit-point-header';

    const titleGroup = doc.createElement('div');
    titleGroup.className = 'flataudit-point-cat-group';

    const titleEl = doc.createElement('span');
    titleEl.className = 'flataudit-point-cat';
    titleEl.textContent = catData.title || catId;
    titleGroup.appendChild(titleEl);

    if (catData.subtitle) {
      const subEl = doc.createElement('div');
      subEl.className = 'flataudit-area-subtitle';
      subEl.textContent = catData.subtitle;
      titleGroup.appendChild(subEl);
    }

    const badgeGroup = doc.createElement('div');
    badgeGroup.className = 'flataudit-badge-group';

    if (catData.grade && typeof catData.points === 'number') {
      const gradePill = doc.createElement('span');
      gradePill.className = `flataudit-point-status ${statusClass}`;
      gradePill.textContent = catData.grade;

      const scorePill = doc.createElement('span');
      scorePill.className = 'flataudit-point-score';
      scorePill.textContent = `${catData.points}/10`;

      badgeGroup.appendChild(gradePill);
      badgeGroup.appendChild(scorePill);
    } else {
      const statusPill = doc.createElement('span');
      statusPill.className = 'flataudit-point-status status-info';
      statusPill.textContent = 'Not graded';
      badgeGroup.appendChild(statusPill);
    }

    const chevron = doc.createElement('span');
    chevron.className = 'flataudit-card-chevron';
    chevron.textContent = '▾';
    chevron.style.marginLeft = '8px';
    chevron.style.fontSize = '12px';
    chevron.style.color = '#94a3b8';
    chevron.style.transition = 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)';
    badgeGroup.appendChild(chevron);

    cardHeader.appendChild(titleGroup);
    cardHeader.appendChild(badgeGroup);
    card.appendChild(cardHeader);

    // Headline: One-line fact
    const headline = doc.createElement('div');
    headline.className = 'flataudit-point-headline';
    headline.textContent = catData.fact || catData.message || EXACT_AREA_STRINGS.THIN_MAP;
    card.appendChild(headline);

    // Expandable Details (Criteria, Fact, Drawback, Attribution)
    const details = doc.createElement('div');
    details.className = 'flataudit-point-details';
    details.style.display = 'none';
    details.style.marginTop = '8px';
    details.style.paddingTop = '6px';
    details.style.borderTop = '1px solid rgba(255, 255, 255, 0.08)';
    details.style.fontSize = '11px';
    details.style.lineHeight = '1.45';
    details.style.color = '#cbd5e1';

    const criteriaStr = formatCriteriaThresholds(catId, reportData.cityTier || 'metro');

    let extraContextHtml = '';
    if (catData.nightFacts?.note) {
      extraContextHtml += `<div style="margin-bottom:3px"><b>Night context:</b> ${catData.nightFacts.note}</div>`;
    }
    if (catData.environmentNotes?.industrialLand) {
      extraContextHtml += `<div style="margin-bottom:3px"><b>Environment:</b> Industrial area located within ${catData.environmentNotes.industrialLand.km} km.</div>`;
    }
    if (catData.environmentNotes?.noiseSource) {
      extraContextHtml += `<div style="margin-bottom:3px"><b>Noise note:</b> ${catData.environmentNotes.noiseSource.name} is within 150 m (potential noise).</div>`;
    }

    details.innerHTML = `
      ${criteriaStr ? `<div style="margin-bottom:4px"><b>Criteria:</b> ${criteriaStr}</div>` : ''}
      <div style="margin-bottom:3px"><b>Fact:</b> ${catData.fact || 'None recorded'}</div>
      <div style="margin-bottom:4px"><b>Drawback:</b> ${catData.drawback || 'None recorded'}</div>
      ${extraContextHtml}
      <div style="margin-top:6px;font-size:10px;color:#94a3b8">${EXACT_AREA_STRINGS.STRAIGHT_LINE_NOTE}</div>
    `;

    card.appendChild(details);

    // Click & Keyboard Expand/Collapse Handlers
    const toggle = (e) => {
      e?.preventDefault();
      const isExpanded = details.style.display === 'block';
      details.style.display = isExpanded ? 'none' : 'block';
      chevron.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
      card.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
    };

    card.addEventListener('click', toggle);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        toggle(e);
      }
    });

    container.appendChild(card);
  }

  return container;
}
