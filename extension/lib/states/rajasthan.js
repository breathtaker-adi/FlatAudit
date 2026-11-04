/**
 * FlatAudit Rajasthan State Valuation and Raj-RERA Adapter.
 *
 * Implements:
 * 1. Rajasthan Registration & Stamps Department DLC guidance valuation (epanjiyan.rajasthan.gov.in)
 *    - Interior vs Exterior (Main Road) baseline rates
 *    - Road width multipliers (0-40ft: 1.0, 40-60ft: 1.10, 60-100ft: 1.15, >100ft: 1.20)
 *    - Section 47-A circle rate floor: flags underreported tax risk when agreedPrice < dlcValuation
 *    - Statutory closing costs: 6% base stamp duty (5% for female buyers) + 33% surcharges + 1% registration
 * 2. Raj-RERA Statutory Disclosure Evaluator (rajrera.rajasthan.gov.in)
 *    - Form R-1 (Architect completion percentage)
 *    - Form R-2 (Engineer civil work cost incurred)
 *    - Form R-3 (CA 70% designated escrow withdrawal compliance)
 *    - QPR quarterly filing compliance & predicted completion velocity
 */

export class RajasthanValuationAdapter {
  constructor(costConfig) {
    this.config = costConfig;
  }

  calculateValuationAndCosts({
    city,
    locality,
    usageType = "residential",
    isMainRoad = false,
    roadWidthFt = 30,
    isCornerPlot = false,
    builtUpAreaSqM = 0,
    agreedPrice = 0,
    buyerType = "male_or_joint"
  }) {
    const normCity = (city || "jaipur").trim().toLowerCase();
    const normLocality = (locality || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    const cityZones = this.config.dlc_guidance.zones[normCity];

    let localityData = cityZones ? cityZones[normLocality]?.[usageType] : null;

    // Fallback: If colony is missing, resolve first available or median colony rate in the SRO zone
    if (!localityData) {
      if (cityZones) {
        const availableLocalities = Object.values(cityZones).map(z => z[usageType]).filter(Boolean);
        if (availableLocalities.length > 0) {
          // Median interior rate as safe lower bound
          const interiorRates = availableLocalities.map(l => l.interior).sort((a, b) => a - b);
          const medianInterior = interiorRates[Math.floor(interiorRates.length / 2)];
          localityData = { interior: medianInterior, exterior_main_road: Math.round(medianInterior * 1.25) };
        }
      }
      if (!localityData) {
        // Universal Rajasthan baseline fallback
        localityData = { interior: 20000, exterior_main_road: 25000 };
      }
    }

    // Step 1: Base rate selection (Interior vs Exterior Main Road)
    let ratePerSqM = isMainRoad 
      ? localityData.exterior_main_road 
      : localityData.interior;

    // Step 2: Road width multiplier (>= 40 ft)
    const roadRule = this.config.dlc_guidance.road_width_multipliers.find(
      (r) => roadWidthFt >= r.min_width_ft && (r.max_width_ft === null || roadWidthFt <= r.max_width_ft)
    );
    if (roadRule) {
      ratePerSqM = Math.round(ratePerSqM * roadRule.multiplier);
    }

    // Corner plot premium (+10%)
    if (isCornerPlot) {
      ratePerSqM = Math.round(ratePerSqM * (1 + this.config.dlc_guidance.corner_plot_premium_pct / 100));
    }

    // Step 3: Deemed Valuation
    const dlcValuation = Math.round(ratePerSqM * builtUpAreaSqM);
    const deemedValue = Math.max(agreedPrice, dlcValuation);

    // Section 47-A Circle Rate Floor Check
    const underreportedTaxRisk = agreedPrice > 0 && agreedPrice < dlcValuation;

    // Step 4: Closing costs calculation
    const dutyRate = this.config.closing_costs.base_stamp_duty_pct[buyerType] 
      || this.config.closing_costs.base_stamp_duty_pct["male_or_joint"];
    const baseStampDuty = Math.round(deemedValue * dutyRate);

    // Surcharges are calculated strictly on Stamp Duty, NOT on property valuation
    const totalSurcharges = Math.round(baseStampDuty * this.config.closing_costs.surcharges_on_duty.total_surcharge_multiplier);
    
    // Registration fee is 1% of deemed valuation
    const registrationFee = Math.round(deemedValue * this.config.closing_costs.registration_fee.rate_pct);

    const totalClosingCosts = baseStampDuty + totalSurcharges + registrationFee;
    const effectiveRatePct = deemedValue > 0 ? Number(((totalClosingCosts / deemedValue) * 100).toFixed(2)) : 0;

    return {
      ratePerSqM,
      dlcValuation,
      deemedValue,
      underreportedTaxRisk,
      costsBreakdown: {
        baseStampDuty,
        totalSurcharges,
        registrationFee,
        totalStatutoryCosts: totalClosingCosts,
        effectiveRatePct
      }
    };
  }
}

/**
 * Normalizes a Rajasthan RERA registration identifier.
 * Example: RAJ/P/2023/1234
 */
export function normalizeRajReraId(rawId) {
  if (!rawId || typeof rawId !== 'string') return null;
  const match = rawId.match(/RAJ\s*[\/-]?\s*([PA])\s*[\/-]?\s*(\d{4})\s*[\/-]?\s*(\d+)/i);
  if (match) {
    const type = match[1].toUpperCase();
    const year = match[2];
    const seq = match[3];
    return `RAJ/${type}/${year}/${seq}`;
  }
  return null;
}

/**
 * Evaluates Raj-RERA project disclosure dossier (Form R-1, R-2, R-3 and QPRs).
 * Emits strictly factual, observable risk cards without defamatory assertions.
 */
export function evaluateRajReraDossier(dossier) {
  if (!dossier) return [];
  const flags = [];

  // 1. Escrow Misalignment Check (Section 4(2)(l)(D))
  // In Rajasthan, withdrawals from the designated 70% account cannot exceed 
  // the proportion of work completed certified by R-1, R-2, and R-3.
  const fundsWithdrawn = dossier.financial_escrow?.funds_withdrawn_pct 
    ?? dossier.funds_withdrawn_pct ?? 0;
  const workIncurred = dossier.financial_escrow?.cost_incurred_pct 
    ?? dossier.cost_incurred_pct ?? dossier.physical_status?.architect_r1_pct ?? 0;
  const divergence = fundsWithdrawn - workIncurred;

  if (divergence > 10.0) {
    flags.push({
      code: "ESCROW_OVERDRAWN",
      severity: "CRITICAL",
      badge: "Escrow Withdrawal Gap",
      description: `Promoter has withdrawn ${fundsWithdrawn.toFixed(1)}% of funds but certified completion is only ${workIncurred.toFixed(1)}%. Divergence: +${divergence.toFixed(1)}% (exceeds Section 4(2)(l)(D) threshold).`
    });
  }

  // 2. Velocity Deficit (Predicted Delay)
  const architectR1 = dossier.physical_status?.architect_r1_pct 
    ?? dossier.physical_progress_pct ?? 0;
  const remainingWorkPct = Math.max(0, 100 - architectR1);
  const runwayMonths = dossier.velocity_metrics?.runway_months_remaining ?? 12;
  const quartersRemaining = Math.max(1, runwayMonths / 3);
  const neededQuarterlyVelocity = remainingWorkPct / quartersRemaining;
  const historicVelocity = dossier.velocity_metrics?.historic_velocity_pct_per_quarter ?? 3.5;

  if (neededQuarterlyVelocity > (historicVelocity * 1.75) && remainingWorkPct > 15) {
    flags.push({
      code: "IMPROBABLE_DEADLINE",
      severity: "HIGH",
      badge: "High Delay Risk",
      description: `Project must accelerate construction from ${historicVelocity.toFixed(1)}%/quarter to ${neededQuarterlyVelocity.toFixed(1)}%/quarter to hit declared completion date.`
    });
  }

  // 3. Stale Reporting Guard
  const qprLagDays = dossier.compliance_freshness?.qpr_filing_lag_days 
    ?? dossier.qpr_filing_lag_days ?? 0;
  if (qprLagDays > 90) {
    flags.push({
      code: "COMPLIANCE_NON_REPORTING",
      severity: "MODERATE",
      badge: "Outdated Disclosures",
      description: `Promoter is ${qprLagDays} days overdue on quarterly QPR filings.`
    });
  }

  return flags;
}
