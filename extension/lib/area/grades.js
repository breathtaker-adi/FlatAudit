/**
 * FlatAudit Area Grading & Fact Selection Engine (Slice S6)
 * 
 * Scores individual checks (0, 1, 2) against city tier thresholds,
 * computes category grade (Good, Okay, Weak) and points (0-10),
 * and selects the primary fact and drawback using deterministic rules.
 */

import defaultRules from '../data/area_rules.json' with { type: 'json' };

/**
 * Resolves city tier ('metro' or 'smaller') from city name.
 * @param {string} city
 * @param {object} [rules]
 * @returns {'metro'|'smaller'|null}
 */
export function getCityTier(city, rules = defaultRules) {
  if (!city || typeof city !== 'string') return null;
  const normalized = city.trim().toLowerCase();
  return rules.city_tiers?.[normalized] || null;
}

/**
 * Scores a single distance-based check (2 = Good, 1 = Okay, 0 = Weak).
 * @param {number|null} valueKm Distance in km
 * @param {object} checkRule Rule definition containing metro and smaller thresholds
 * @param {'metro'|'smaller'} cityTier
 * @returns {{score: number, hasData: boolean}}
 */
export function scoreCheck(valueKm, checkRule, cityTier = 'metro') {
  if (!checkRule) {
    return { score: 0, hasData: false };
  }

  const thresholds = checkRule[cityTier] || checkRule['metro'];
  if (!Array.isArray(thresholds) || thresholds.length < 2) {
    return { score: 0, hasData: false };
  }

  const [goodMax, okayMax] = thresholds;

  if (typeof valueKm !== 'number' || !Number.isFinite(valueKm)) {
    return { score: 0, hasData: false };
  }

  if (valueKm <= goodMax) {
    return { score: 2, hasData: true };
  }

  if (valueKm <= okayMax) {
    return { score: 1, hasData: true };
  }

  return { score: 0, hasData: true };
}

/**
 * Formats a fact string using template replacement.
 * @param {object} check
 * @param {string} [template]
 * @returns {string}
 */
export function formatFact(check, template = defaultRules.templates.fact) {
  if (!check) return '';
  const name = check.name || check.label || check.thing || 'Place';
  const km = typeof check.km === 'number' ? check.km.toFixed(1) : (check.value ?? '');
  return template
    .replace('{name}', name)
    .replace('{km}', km);
}

/**
 * Formats a drawback string using template replacement.
 * @param {object} check
 * @param {string} [templateMissing]
 * @param {string} [templateDistant]
 * @param {string} [noDrawbackStr]
 * @returns {string}
 */
export function formatDrawback(
  check,
  templateMissing = defaultRules.templates.drawback,
  templateDistant = defaultRules.templates.drawback_distant,
  noDrawbackStr = defaultRules.templates.no_drawback
) {
  if (!check || check.score === 2) {
    return noDrawbackStr;
  }

  const thing = check.thing || check.label || 'place';
  const name = check.name || check.label || thing;
  const km = typeof check.km === 'number' ? check.km.toFixed(1) : (check.searchRadiusKm || '2.0');

  if (!check.hasData || check.km === null || check.km === undefined) {
    return templateMissing
      .replace('{thing}', thing)
      .replace('{km}', String(km));
  }

  return templateDistant
    .replace('{name}', name)
    .replace('{km}', String(km));
}

/**
 * Evaluates a single category's checks and calculates grade, points, fact, and drawback.
 * @param {Array<object>} evaluatedChecks List of evaluated check objects
 * @param {string} categoryId Category key (e.g. 'emergency_healthcare')
 * @param {'metro'|'smaller'} cityTier
 * @param {object} [rules]
 * @returns {object} Graded category summary
 */
export function gradeCategory(evaluatedChecks, categoryId, cityTier = 'metro', rules = defaultRules) {
  const categoryDef = rules.categories?.[categoryId];
  const title = categoryDef?.title || categoryId;
  const subtitle = categoryDef?.subtitle || null;

  if (!Array.isArray(evaluatedChecks)) {
    return {
      categoryId,
      title,
      subtitle,
      grade: null,
      points: null,
      status: 'not_enough_data',
      message: rules.templates.thin_map,
      checks: []
    };
  }

  const checksWithData = evaluatedChecks.filter((c) => c && c.hasData === true);
  const minChecks = rules.min_checks_with_data ?? 2;

  if (checksWithData.length < minChecks) {
    return {
      categoryId,
      title,
      subtitle,
      grade: null,
      points: null,
      status: 'not_enough_data',
      message: rules.templates.thin_map,
      checks: evaluatedChecks
    };
  }

  // Calculate average score across checks that have data
  const totalScore = checksWithData.reduce((acc, c) => acc + (c.score || 0), 0);
  const average = totalScore / checksWithData.length;

  // Grade: average >= 1.5 Good, >= 0.75 Okay, else Weak
  const goodCutoff = rules.grade_cutoffs?.good ?? 1.5;
  const okayCutoff = rules.grade_cutoffs?.okay ?? 0.75;

  let grade = 'Weak';
  if (average >= goodCutoff) {
    grade = 'Good';
  } else if (average >= okayCutoff) {
    grade = 'Okay';
  }

  // Points: round(average * 5) out of 10
  const points = Math.min(10, Math.max(0, Math.round(average * 5)));

  // Fact Selection: highest-scoring check (ties broken by lowest distance km)
  const sortedForFact = [...checksWithData].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const distA = typeof a.km === 'number' ? a.km : 999;
    const distB = typeof b.km === 'number' ? b.km : 999;
    return distA - distB;
  });
  const bestCheck = sortedForFact[0];
  const fact = formatFact(bestCheck, rules.templates.fact);

  // Drawback Selection: lowest-scoring check
  // If all checks score 2, drawback is the positive no-drawback statement
  const allPerfect = evaluatedChecks.every((c) => c.score === 2);
  let drawback = rules.templates.no_drawback;

  if (!allPerfect) {
    // Sort ascending by score, then descending by distance
    const sortedForDrawback = [...evaluatedChecks].sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      const distA = typeof a.km === 'number' ? a.km : 999;
      const distB = typeof b.km === 'number' ? b.km : 999;
      return distB - distA;
    });
    const worstCheck = sortedForDrawback[0];
    drawback = formatDrawback(
      worstCheck,
      rules.templates.drawback,
      rules.templates.drawback_distant,
      rules.templates.no_drawback
    );
  }

  return {
    categoryId,
    title,
    subtitle,
    grade,
    points,
    averageScore: Math.round(average * 100) / 100,
    fact,
    drawback,
    checks: evaluatedChecks,
    status: 'ok'
  };
}
