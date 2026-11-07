/**
 * FlatAudit - Buyer Mode Evaluation Engine
 * 
 * Implements "Evaluate the Flat, the Project, and the Builder":
 * - Facts with sources, never an evaluative verdict or subjective score
 * - Strict anti-defamation wording guardrails
 * - 4-Line Summary: Flat, Project, Builder, Paperwork (with ✓ / ⚠ / ?)
 * - Curated Pilot Project & Builder fact sheet (Karnataka K-RERA)
 * - All-In Closing Cost Estimator (Stamp Duty 5.6%, Registration 1%, GST, Maintenance)
 * - Scenario-based Paperwork Checklist (Resale, Under Construction, Ready from Builder)
 * - Printable 1-Page Buyer Due Diligence Report for legal consultation
 */

import pilotProjectsData from './data/pilot_projects.json' with { type: 'json' };
import closingCostsData from './data/closing_costs.json' with { type: 'json' };
import guidanceValuesData from './data/guidance_values.json' with { type: 'json' };
import rajasthanCostsData from './data/rajasthan_costs.json' with { type: 'json' };
import rajasthanPilotProjectsData from './data/rajasthan_pilot_projects.json' with { type: 'json' };
import { getGuidanceValue, getReraPortalUrl } from './benchmarks.js';
import { calculateEMI } from './investment.js';

/**
 * Normalizes RERA registration IDs for consistent dictionary lookup.
 * @param {string} raw 
 * @returns {string}
 */
export function normalizeReraId(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw.trim().replace(/\s+/g, '').toUpperCase();
}

/**
 * Detects statutory real estate jurisdiction based on listing geography and RERA format.
 * 
 * @param {string} [locality=''] 
 * @param {string} [city=''] 
 * @param {string} [state=''] 
 * @param {string} [reraId=''] 
 * @returns {object}
 */
export function detectJurisdiction(locality = '', city = '', state = '', reraId = '') {
  const text = `${locality} ${city} ${state} ${reraId}`.toLowerCase();
  const cleanRera = normalizeReraId(reraId);

  // 1. Rajasthan
  if (cleanRera.startsWith('RAJ') || /\b(?:rajasthan|jaipur|jodhpur|kota|udaipur|ajmer|bikaner|alwar|jagatpura|mansarovar|vaishali_nagar)\b/i.test(text)) {
    return {
      state: 'Rajasthan',
      authorityName: 'Rajasthan Real Estate Regulatory Authority (Raj-RERA)',
      authorityCode: 'Raj-RERA',
      portalUrl: 'https://rajrera.rajasthan.gov.in',
      searchUrl: 'https://rajrera.rajasthan.gov.in/Project_Summary.aspx',
      costsDataset: 'rajasthan_costs',
      pilotDataset: 'rajasthan_pilot_projects',
      stampDutyRate: 0.06,
      surchargeMultiplier: 0.33,
      effectiveStampDutyPct: 7.98, // 6% * 1.33 = 7.98%
      registrationFeePct: 1.0,
      totalStatutoryPct: 8.98,
      typicalConnectionCharges: 50000,
      typicalLegalAndKhata: 20000,
      currencyUnit: 'INR'
    };
  }

  // 2. Maharashtra
  if (/^P51\d|^P\d{11}/i.test(cleanRera) || /\b(?:maharashtra|mumbai|pune|nagpur|thane|navi\s*mumbai|nashik)\b/i.test(text)) {
    return {
      state: 'Maharashtra',
      authorityName: 'Maharashtra Real Estate Regulatory Authority (MahaRERA)',
      authorityCode: 'MahaRERA',
      portalUrl: 'https://maharera.mahaonline.gov.in',
      searchUrl: 'https://maharera.mahaonline.gov.in',
      costsDataset: 'maharashtra_costs',
      pilotDataset: 'maharashtra_pilot_projects',
      stampDutyRate: 0.06,
      surchargeMultiplier: 0,
      effectiveStampDutyPct: 6.0,
      registrationFeePct: 1.0,
      totalStatutoryPct: 7.0,
      typicalConnectionCharges: 150000,
      typicalLegalAndKhata: 30000,
      currencyUnit: 'INR'
    };
  }

  // 3. Haryana
  if (/^HRERA/i.test(cleanRera) || /\b(?:haryana|gurgaon|gurugram|faridabad|panipat|sonipat)\b/i.test(text)) {
    return {
      state: 'Haryana',
      authorityName: 'Haryana Real Estate Regulatory Authority (HRERA)',
      authorityCode: 'HRERA',
      portalUrl: 'https://haryanarera.gov.in',
      searchUrl: 'https://haryanarera.gov.in',
      costsDataset: 'haryana_costs',
      pilotDataset: 'haryana_pilot_projects',
      stampDutyRate: 0.07,
      surchargeMultiplier: 0,
      effectiveStampDutyPct: 7.0,
      registrationFeePct: 1.0,
      totalStatutoryPct: 8.0,
      typicalConnectionCharges: 120000,
      typicalLegalAndKhata: 25000,
      currencyUnit: 'INR'
    };
  }

  // Default: Karnataka (Bengaluru)
  return {
    state: 'Karnataka',
    authorityName: 'Karnataka Real Estate Regulatory Authority (K-RERA)',
    authorityCode: 'K-RERA',
    portalUrl: 'https://rera.karnataka.gov.in',
    searchUrl: 'https://rera.karnataka.gov.in/projectViewDetails',
    costsDataset: 'closing_costs',
    pilotDataset: 'pilot_projects',
    stampDutyRate: 0.056,
    surchargeMultiplier: 0,
    effectiveStampDutyPct: 5.6,
    registrationFeePct: 1.0,
    totalStatutoryPct: 6.6,
    typicalConnectionCharges: 233000,
    typicalLegalAndKhata: 35000,
    currencyUnit: 'INR'
  };
}

/**
 * Looks up official promoter and project facts from curated pilot registries (Karnataka + Rajasthan).
 * Keyed strictly by RERA number first, with secondary fallback to normalized project name.
 * 
 * @param {string} reraId 
 * @param {string} [projectName] 
 * @param {object} [jurisdiction=null]
 * @returns {{ found: boolean, matchMethod: 'rera_id'|'project_name'|null, facts: object|null }}
 */
export function lookupProjectFacts(reraId, projectName = '', jurisdiction = null) {
  const normId = normalizeReraId(reraId);
  const projects = {
    ...(pilotProjectsData.projects || {}),
    ...(rajasthanPilotProjectsData.projects || {})
  };

  // 1. Primary Lookup: Exact RERA Registration ID
  if (normId && projects[normId]) {
    return {
      found: true,
      matchMethod: 'rera_id',
      facts: { ...projects[normId] }
    };
  }

  // 2. Secondary Lookup: Normalized Project Name Match (with explicit entity caveat)
  if (projectName && typeof projectName === 'string') {
    const cleanSearchName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [keyId, proj] of Object.entries(projects)) {
      const cleanProjName = (proj.project_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanProjName && (cleanSearchName.includes(cleanProjName) || cleanProjName.includes(cleanSearchName))) {
        return {
          found: true,
          matchMethod: 'project_name',
          facts: {
            ...proj,
            entity_caveat: 'Matched by project name. Verify exact RERA registration certificate with seller.'
          }
        };
      }
    }
  }

  return {
    found: false,
    matchMethod: null,
    facts: null
  };
}

/**
 * Evaluates Line 1: The Flat
 * Compares price per sq ft strictly on the same area type against peers and guidance values.
 * 
 * @param {object} listing 
 * @param {object} [context] 
 * @returns {{ indicator: string, summary: string, details: string, source: string, dataAsOf: string }}
 */
export function evaluateFlatFacts(listing, context = {}) {
  const price = listing.price || listing.salePrice || 0;
  const area = listing.area || listing.area_sqft || 0;
  const areaType = listing.areaType || 'carpet';
  const pricePerSqft = listing.pricePerSqft || (area > 0 && price > 0 ? Math.round(price / area) : 0);
  const locality = listing.locality || 'Unknown';
  const guidance = getGuidanceValue(locality, listing.city || 'Bengaluru');

  const now = new Date().toISOString().split('T')[0];

  if (!price || !area) {
    return {
      indicator: '?',
      summary: 'Flat pricing or area missing from listing details; unable to evaluate rate per sq ft.',
      details: 'Price or area was not published in standard readable format on this portal page.',
      source: listing.url || 'Active Portal Listing',
      dataAsOf: now
    };
  }

  if (guidance) {
    const deltaPct = Math.round(((pricePerSqft - guidance.guidancePerSqft) / guidance.guidancePerSqft) * 100);

    if (deltaPct < -35) {
      return {
        indicator: '⚠',
        summary: `Asking rate (₹${pricePerSqft.toLocaleString('en-IN')}/sqft on ${areaType} basis) is ${Math.abs(deltaPct)}% below government circle rate (₹${guidance.guidancePerSqft.toLocaleString('en-IN')}/sqft).`,
        details: `Discrepancy warrants title and legal review: check whether layout is B-Khata / revenue land or subject to undervaluation risks.`,
        source: guidance.source,
        dataAsOf: guidance.effectiveDate
      };
    }

    const deptName = guidance.state === 'Rajasthan'
      ? 'Registration & Stamps Department (epanjiyan DLC rate)'
      : 'Department of Stamps and Registration (Kaveri 2.0)';

    return {
      indicator: '✓',
      summary: `Price per sq ft (₹${pricePerSqft.toLocaleString('en-IN')}/sqft on ${areaType} basis) is +${deltaPct}% relative to government guidance floor (₹${guidance.guidancePerSqft.toLocaleString('en-IN')}/sqft).`,
      details: `Evaluated against ${deptName} reference floor for ${locality}.`,
      source: guidance.source,
      dataAsOf: guidance.effectiveDate
    };
  }

  // Fallback if guidance value zone absent
  return {
    indicator: '✓',
    summary: `Asking price: ₹${(price / 10000000).toFixed(2)} Cr (₹${pricePerSqft.toLocaleString('en-IN')} / sq ft on ${areaType} basis).`,
    details: `Area type specified as ${areaType}. Check with peers in ${locality} on equivalent area basis.`,
    source: listing.url || 'Active Portal Listing',
    dataAsOf: now
  };
}

/**
 * Evaluates Line 2: The Project
 * Checks RERA registration, declared completion dates, extensions, and escrow bank.
 * 
 * @param {object|null} projectFacts 
 * @param {string} [reraId] 
 * @param {string} [locality]
 * @returns {{ indicator: string, summary: string, details: string, sourceUrl: string, dataAsOf: string }}
 */
export function evaluateProjectFacts(projectFacts, reraId = '', locality = '', jurisdiction = null) {
  const portalUrl = jurisdiction ? jurisdiction.portalUrl : getReraPortalUrl(reraId, locality).url;
  const auth = jurisdiction ? jurisdiction.authorityCode : 'K-RERA';

  if (!projectFacts) {
    if (reraId) {
      return {
        indicator: '?',
        summary: `RERA ID ${reraId} extracted. Check official ${auth} portal to inspect Form B completion filings.`,
        details: `Project filings are not in the local pilot dataset. Inspect original declaration documents on the official ${auth} portal.`,
        sourceUrl: portalUrl,
        dataAsOf: new Date().toISOString().split('T')[0]
      };
    }
    return {
      indicator: '?',
      summary: 'No RERA registration ID displayed on listing. Mandatory for projects >500 sqm or >8 units under RERA Act 2016.',
      details: `Ask seller/builder for the official ${auth} registration certificate before paying any token amount.`,
      sourceUrl: portalUrl,
      dataAsOf: new Date().toISOString().split('T')[0]
    };
  }

  const {
    dates_revised_count,
    original_completion_date,
    revised_completion_date,
    revision_length_months,
    status,
    escrow_bank,
    data_as_of,
    official_source_url
  } = projectFacts;

  if (dates_revised_count === 0) {
    return {
      indicator: '✓',
      summary: `Declared completion date met without revision as per official records (${original_completion_date}).`,
      details: `Project Status: ${status}. Designated Escrow Bank: ${escrow_bank}.`,
      sourceUrl: official_source_url || portalUrl,
      dataAsOf: data_as_of || '2024-09-01'
    };
  }

  return {
    indicator: '⚠',
    summary: `Completion date was revised ${dates_revised_count} time(s), from ${original_completion_date} to ${revised_completion_date} (+${revision_length_months} months); see official page.`,
    details: `Project Status: ${status}. Designated Escrow Bank: ${escrow_bank}. Review latest quarterly progress report (QPR) on ${auth}.`,
    sourceUrl: official_source_url || portalUrl,
    dataAsOf: data_as_of || '2024-09-01'
  };
}

/**
 * Evaluates Line 3: The Builder
 * Discloses promoter past projects track record, completion revisions denominator, and litigation fields.
 * 
 * @param {object|null} projectFacts 
 * @param {object} [jurisdiction=null]
 * @returns {{ indicator: string, summary: string, details: string, sourceUrl: string, dataAsOf: string }}
 */
export function evaluateBuilderFacts(projectFacts, jurisdiction = null) {
  const auth = jurisdiction ? jurisdiction.authorityCode : 'K-RERA';
  const searchUrl = jurisdiction ? jurisdiction.searchUrl : pilotProjectsData.official_search_url;

  if (!projectFacts) {
    return {
      indicator: '?',
      summary: `Promoter disclosed track record: not available in local pilot dataset. Inspect promoter past filings on ${auth}.`,
      details: `Builders often register projects via separate LLPs or subsidiary SPVs. Search the registered promoter entity name on ${auth}.`,
      sourceUrl: searchUrl,
      dataAsOf: new Date().toISOString().split('T')[0]
    };
  }

  const {
    promoter_entity,
    promoter_group,
    disclosed_past_projects_count,
    promoter_projects_revised_count,
    promoter_projects_total_evaluated,
    litigation_declared,
    data_completeness,
    data_as_of,
    official_source_url
  } = projectFacts;

  const hasLitigation = litigation_declared && !litigation_declared.toLowerCase().includes('none declared');
  const indicator = hasLitigation ? '⚠' : (promoter_projects_revised_count > 0 ? '⚠' : '✓');

  let revisionStr = '';
  if (typeof promoter_projects_revised_count === 'number' && typeof promoter_projects_total_evaluated === 'number') {
    revisionStr = `Dates revised in ${promoter_projects_revised_count} of ${promoter_projects_total_evaluated} projects with both dates available.`;
  } else if (typeof projectFacts.dates_revised_count === 'number') {
    revisionStr = projectFacts.dates_revised_count === 0 ? 'Project completion on schedule (0 revisions).' : `Completion revised ${projectFacts.dates_revised_count} time(s).`;
  } else {
    revisionStr = 'Promoter disclosures filed under RERA statutory framework.';
  }

  const pastStr = typeof disclosed_past_projects_count === 'number' ? `Disclosed past projects: ${disclosed_past_projects_count}. ` : '';
  const compStr = data_completeness ? `Data completeness: ${data_completeness}. ` : '';

  return {
    indicator,
    summary: `Promoter: ${promoter_entity || 'Entity on record'} (${promoter_group || 'Registered Group'}). ${revisionStr}`,
    details: `${pastStr}Litigation field: "${litigation_declared || 'None declared in filing'}". ${compStr}Note: LLP/company entity registration — not legally confirmed to represent parent brand in all liabilities.`,
    sourceUrl: official_source_url || searchUrl,
    dataAsOf: data_as_of || '2024-09-01'
  };
}

/**
 * Evaluates Line 2 for Individual Resale Properties: 30-Year Title Search & Nil Encumbrance Certificate
 * @param {object} listing 
 * @returns {{ indicator: string, summary: string, details: string, source: string, dataAsOf: string }}
 */
export function evaluateResaleTitleFacts(listing) {
  return {
    indicator: '?',
    summary: '30-Year Title Search & Nil Encumbrance Certificate (Form 15) required from Sub-Registrar.',
    details: 'For individual resale, inspect continuous chain of title deeds back 30 years and verify that prior bank mortgages/charges are fully released via registered discharge deeds.',
    source: 'Independent Legal Due Diligence',
    dataAsOf: new Date().toISOString().split('T')[0]
  };
}

/**
 * Evaluates Line 3 for Individual Resale Properties: Society / RWA Clearances & Property Tax
 * @param {object} listing 
 * @returns {{ indicator: string, summary: string, details: string, source: string, dataAsOf: string }}
 */
export function evaluateResaleSocietyFacts(listing) {
  return {
    indicator: '?',
    summary: 'Society / RWA NOC & Municipal Property Tax Clearance: verify zero outstanding arrears.',
    details: 'Obtain formal NOC and Share Certificate from Apartment Owners Association (AOA/RWA) confirming no unpaid maintenance dues or transfer liabilities, plus latest municipal tax assessment receipts.',
    source: 'Society Management & Municipal Records',
    dataAsOf: new Date().toISOString().split('T')[0]
  };
}

/**
 * Evaluates Line 2 for Builder Floor Properties: Sanctioned Floor Drawings & FAR Limits
 * @param {object} listing 
 * @returns {{ indicator: string, summary: string, details: string, source: string, dataAsOf: string }}
 */
export function evaluateBuilderFloorApprovals(listing) {
  return {
    indicator: '?',
    summary: 'Sanctioned architectural floor drawings & FAR (Floor Area Ratio) verification required.',
    details: 'Verify that this specific floor is legally sanctioned in the approved layout and not built over maximum stilt/FAR limits or unauthorized rooftop additions.',
    source: 'Municipal Town Planning Authority',
    dataAsOf: new Date().toISOString().split('T')[0]
  };
}

/**
 * Evaluates Line 3 for Builder Floor Properties: Joint Development Agreement & Undivided Share of Land (UDS)
 * @param {object} listing 
 * @returns {{ indicator: string, summary: string, details: string, source: string, dataAsOf: string }}
 */
export function evaluateBuilderJdaFacts(listing) {
  return {
    indicator: '?',
    summary: 'Registered Joint Development Agreement (JDA) & Undivided Share of Land (UDS) deed verification.',
    details: 'Confirm developer has registered allocation rights from original landowner to sell this exact floor, with corresponding proportionate UDS title transferred upon registration.',
    source: 'Sub-Registrar Registered Deeds',
    dataAsOf: new Date().toISOString().split('T')[0]
  };
}

/**
 * Evaluates Line 4: Paperwork & Legal Hand-off
 * Confirms non-coverage of physical title and references the scenario-specific checklist.
 * 
 * @param {string} scenario 
 * @returns {{ indicator: string, summary: string, details: string, checklistCount: number }}
 */
export function evaluatePaperworkFacts(scenario = 'resale') {
  const checklist = getPaperworkChecklist(scenario);
  return {
    indicator: '?',
    summary: `Not verified by this tool: title deed, 30-year encumbrances, sanctioned plans, occupancy certificate.`,
    details: `${checklist.length} essential verification documents identified for ${scenario.replace('_', ' ')}. Hand this checklist to an independent advocate.`,
    checklistCount: checklist.length
  };
}

/**
 * Estimates All-In Total Cost of Ownership including state-specific stamp duty, registration, GST, and maintenance.
 * 
 * @param {object} options 
 * @param {object} [jurisdiction=null]
 * @returns {object}
 */
export function estimateTotalCost(options = {}, jurisdiction = null) {
  const price = options.price || 0;
  const areaSqft = options.areaSqft || options.area || 1000;
  const possessionStatus = (options.possessionStatus || 'ready_to_move').toLowerCase();
  const isAffordable = !!options.isAffordable;
  const downPaymentPct = typeof options.downPaymentPct === 'number' ? options.downPaymentPct : 20;
  const loanRatePct = typeof options.loanRatePct === 'number' ? options.loanRatePct : 8.5;
  const loanTenureYears = typeof options.loanTenureYears === 'number' ? options.loanTenureYears : 20;

  const defaultRates = closingCostsData.rates;
  const state = jurisdiction ? jurisdiction.state : 'Karnataka';

  // 1. Stamp Duty & Registration by State
  let stampDutyPct = defaultRates.effective_stamp_duty_pct; // 5.6%
  let registrationFeePct = defaultRates.registration_fee_pct; // 1.0%
  let maintenanceAdvance = Math.round(areaSqft * defaultRates.fixed_estimates.maintenance_advance_per_sqft_month * defaultRates.fixed_estimates.maintenance_advance_months);
  let connectionCharges = defaultRates.fixed_estimates.bescom_bwssb_connection_charge;
  let legalAndKhata = defaultRates.fixed_estimates.legal_vetting_and_khata_transfer;

  if (jurisdiction) {
    stampDutyPct = jurisdiction.effectiveStampDutyPct;
    registrationFeePct = jurisdiction.registrationFeePct;
    connectionCharges = jurisdiction.typicalConnectionCharges || 50000;
    legalAndKhata = jurisdiction.typicalLegalAndKhata || 25000;
    if (jurisdiction.state === 'Rajasthan') {
      // 12 months at ₹2.5/sqft indicative maintenance
      maintenanceAdvance = Math.round(areaSqft * 2.5 * 12);
    }
  }

  const stampDutyAmount = Math.round(price * (stampDutyPct / 100));
  const registrationAmount = Math.round(price * (registrationFeePct / 100));

  // 2. GST
  let gstPct = 0;
  if (possessionStatus.includes('under_construction')) {
    gstPct = isAffordable ? defaultRates.gst_rates.under_construction_affordable : defaultRates.gst_rates.under_construction_standard;
  } else {
    gstPct = defaultRates.gst_rates.ready_to_move_with_oc; // 0.0%
  }
  const gstAmount = Math.round(price * (gstPct / 100));

  // 3. Totals
  const statutoryTotal = stampDutyAmount + registrationAmount + gstAmount;
  const otherChargesTotal = maintenanceAdvance + connectionCharges + legalAndKhata;
  const totalCost = price + statutoryTotal + otherChargesTotal;

  // 4. Loan & Down Payment
  const loanPrincipal = Math.round(price * (1 - downPaymentPct / 100));
  const downPaymentAmount = price - loanPrincipal;
  const upfrontCashNeeded = downPaymentAmount + statutoryTotal + otherChargesTotal;
  const emiStats = calculateEMI(loanPrincipal, loanRatePct, loanTenureYears);

  return {
    state,
    basePrice: price,
    areaSqft,
    possessionStatus,
    statutoryCharges: {
      stampDutyPct,
      stampDutyAmount,
      registrationFeePct,
      registrationAmount,
      gstPct,
      gstAmount,
      total: statutoryTotal
    },
    otherCharges: {
      maintenanceAdvance,
      connectionCharges,
      legalAndKhata,
      total: otherChargesTotal
    },
    totalCost,
    financing: {
      downPaymentPct,
      downPaymentAmount,
      loanPrincipal,
      upfrontCashNeeded,
      loanRatePct,
      loanTenureYears,
      monthlyEmi: emiStats.monthlyEmi,
      totalInterest: emiStats.totalInterest,
      totalRepayment: emiStats.totalPayment
    },
    disclaimer: `Statutory charges calculated based on ${state} rates (Stamp duty ${stampDutyPct}%, Registration ${registrationFeePct}%). Actual registration depends on deemed circle rate valuation.`
  };
}

/**
 * Returns structured document due diligence checklist based on property purchase scenario.
 * 
 * @param {'resale'|'under_construction'|'ready_from_builder'} scenario 
 * @returns {Array<{ name: string, importance: 'MANDATORY'|'CRITICAL'|'RECOMMENDED', description: string, whereToVerify: string }>}
 */
export function getPaperworkChecklist(scenario = 'resale') {
  const norm = (scenario || 'resale').toLowerCase();

  if (norm.includes('under_construction')) {
    return [
      {
        name: 'RERA Registration Certificate',
        importance: 'MANDATORY',
        description: 'Verify project registration on state RERA portal with proposed completion date.',
        whereToVerify: 'State RERA portal (Form B filing)'
      },
      {
        name: 'Sanctioned Building Plan & CC',
        importance: 'MANDATORY',
        description: 'Approved plan showing building footprint, floor count, and Commencement Certificate (CC) for current wing.',
        whereToVerify: 'BBMP / BDA Town Planning Directorate'
      },
      {
        name: 'Title Search Report (30 Years)',
        importance: 'MANDATORY',
        description: 'Independent legal search establishing uninterrupted parent deed ownership history.',
        whereToVerify: 'Bank Panel Advocate or Independent Real Estate Lawyer'
      },
      {
        name: 'Model RERA Agreement for Sale',
        importance: 'CRITICAL',
        description: 'Ensure agreement strictly conforms to RERA Section 13 without one-sided developer indemnity clauses.',
        whereToVerify: 'Advocate review before signing'
      },
      {
        name: 'Milestone-Linked Demand Schedule',
        importance: 'CRITICAL',
        description: 'Payment milestones must be verified by registered architect / structural engineer certificates.',
        whereToVerify: 'Construction site engineer certification'
      },
      {
        name: 'Designated RERA Escrow Account',
        importance: 'CRITICAL',
        description: 'All payments must be remitted strictly to the registered 70% project escrow bank account.',
        whereToVerify: 'State RERA project disclosure page'
      },
      {
        name: 'Environmental Clearance & Fire NOC',
        importance: 'RECOMMENDED',
        description: 'State Pollution Control Board (KSPCB) and Karnataka Fire Force approval certificates.',
        whereToVerify: 'Builder disclosure dossier'
      }
    ];
  }

  if (norm.includes('ready_from_builder')) {
    return [
      {
        name: 'Full Occupancy Certificate (OC)',
        importance: 'MANDATORY',
        description: 'Crucial: Never take possession on a "Partial OC" or without OC. B-Khata or demolition risk if missing.',
        whereToVerify: 'BBMP / BDA Municipal Planning Office'
      },
      {
        name: 'Completion Certificate (CC)',
        importance: 'MANDATORY',
        description: 'Confirms building adheres to approved sanctioned setbacks, height limits, and floor plans.',
        whereToVerify: 'Local Planning Authority'
      },
      {
        name: 'Fire Force Final NOC',
        importance: 'CRITICAL',
        description: 'Fire safety compliance clearance mandatory for multi-storey residential occupancy.',
        whereToVerify: 'Director General of Fire and Emergency Services'
      },
      {
        name: 'Khata Bifurcation / A-Khata Extract',
        importance: 'CRITICAL',
        description: 'Individual flat A-Khata assessment registered in BBMP e-Aasthi / Kaveri 2.0 system.',
        whereToVerify: 'BBMP Assistant Revenue Officer (ARO) Office'
      },
      {
        name: 'Permanent BESCOM & BWSSB Connections',
        importance: 'CRITICAL',
        description: 'Permanent electricity and Cauvery water / sewerage connection sanction receipts (not temporary builder lines).',
        whereToVerify: 'BESCOM / BWSSB utility meters'
      },
      {
        name: 'Possession & Car Parking Allotment Letter',
        importance: 'RECOMMENDED',
        description: 'Demarcated covered car parking space allotment schedule executed with builder.',
        whereToVerify: 'Builder legal documentation'
      }
    ];
  }

  // Default: Resale Apartment
  return [
    {
      name: 'Registered Sale Deed & Mother Deed Chain',
      importance: 'MANDATORY',
      description: 'Original registered sale deed of current seller, plus complete 30-year chain of prior title transfers.',
      whereToVerify: 'Sub-Registrar Office (Kaveri 2.0 registered search)'
    },
    {
      name: 'Encumbrance Certificate (Form 15, 30 Years)',
      importance: 'MANDATORY',
      description: 'EC Form 15 certifying property is free from registered mortgages, court attachments, or bank liens.',
      whereToVerify: 'Kaveri 2.0 portal / Sub-Registrar'
    },
    {
      name: 'Occupancy Certificate (OC) & Completion Certificate',
      importance: 'MANDATORY',
      description: 'Proves the building was legally constructed. Absence of OC prevents individual A-Khata transfer.',
      whereToVerify: 'BBMP / BDA Archives'
    },
    {
      name: 'A-Khata Certificate & Latest Khata Extract',
      importance: 'MANDATORY',
      description: 'Clean A-Khata in seller name; check that property is not under B-Khata or revenue land classification.',
      whereToVerify: 'BBMP e-Aasthi portal'
    },
    {
      name: 'Latest 3 Years Property Tax Receipts',
      importance: 'CRITICAL',
      description: 'Self-Assessment Scheme (SAS) tax receipts verifying zero municipal property tax arrears.',
      whereToVerify: 'BBMP Property Tax portal (SAS challans)'
    },
    {
      name: 'Society NOC & Zero Dues Certificate',
      importance: 'CRITICAL',
      description: 'Signed certificate from Apartment Owners Association (AOA) confirming zero pending maintenance dues.',
      whereToVerify: 'Apartment Management Committee / Association'
    },
    {
      name: 'Physical Carpet Area Verification',
      importance: 'RECOMMENDED',
      description: 'Measure usable internal floor area with laser/tape to verify RERA carpet area matches sale deed.',
      whereToVerify: 'On-site physical inspection'
    }
  ];
}

/**
 * Detects the property listing category for buyer due diligence:
 * - 'builder': Independent builder floor or boutique developer floor
 * - 'project': Gated society, high-rise project, new launch, or under construction
 * - 'individual': Standalone resale flat, independent house, or villa
 * 
 * @param {object} listing 
 * @param {object} [options] 
 * @returns {'builder'|'project'|'individual'}
 */
export function detectListingCategory(listing = {}, options = {}) {
  if (options.listingCategory) return options.listingCategory;
  if (listing.listingCategory) return listing.listingCategory;

  const title = (listing.title || '').toLowerCase();
  const desc = (listing.description || '').toLowerCase();
  const propType = (listing.propertyType || '').toLowerCase();
  const combined = `${title} ${desc} ${propType}`;

  // 1. Builder Floor / Developer Unit
  if (
    listing.isBuilderFloor || 
    options.isBuilderFloor ||
    /(?:builder\s*floor|independent\s*floor|builder\s*flat|new\s*builder\s*floor)/i.test(combined)
  ) {
    return 'builder';
  }

  // 2. Explicit Individual Resale / Independent House / Villa
  if (
    listing.isProject === false ||
    /(?:independent\s*house|independent\s*villa|bungalow|standalone\s*house|resale\s*house|individual\s*house|row\s*house)/i.test(combined)
  ) {
    return 'individual';
  }

  // 3. Developer Project / Township / High-Rise Society / New Launch
  if (
    listing.isProject === true ||
    options.isProject === true ||
    (listing.projectName && listing.projectName.trim().length > 0) ||
    (options.projectName && options.projectName.trim().length > 0) ||
    listing.possessionStatus === 'under_construction' ||
    options.scenario === 'under_construction' ||
    /(?:new\s*project|pre[\s-]launch|residential\s*project|phase\s*\d|towers?|high[\s-]rise\s*society|gated\s*community\s*project)/i.test(combined)
  ) {
    return 'project';
  }

  // If RERA ID is explicitly present and it's not marked resale/independent
  if (listing.reraId || options.reraId) {
    return 'project';
  }

  // Default to individual for completed resale properties
  return 'individual';
}

/**
 * Generates the full 4-Line Buyer Due Diligence Report and cost estimation.
 * 
 * @param {object} listing 
 * @param {object} [options] 
 * @returns {object}
 */
export function generateBuyerReport(listing, options = {}) {
  const reraId = listing.reraId || options.reraId || '';
  const projectName = listing.projectName || options.projectName || '';
  const scenario = options.scenario || (listing.possessionStatus === 'under_construction' ? 'under_construction' : 'resale');

  // Detect statutory jurisdiction (Rajasthan, Karnataka, Maharashtra, Haryana)
  const jurisdiction = detectJurisdiction(listing.locality, listing.city, listing.state, reraId);

  // Lookup project facts from multi-state pilot registry
  const lookup = lookupProjectFacts(reraId, projectName, jurisdiction);
  const projectFacts = lookup.facts;

  // Distinguish between individual resale, developer project, and builder floor
  const listingCategory = detectListingCategory(listing, options);
  const isProject = listingCategory === 'project';
  const isBuilder = listingCategory === 'builder';
  const isIndividual = listingCategory === 'individual';

  let categoryLabel = 'INDIVIDUAL RESALE';
  if (isBuilder) categoryLabel = 'BUILDER FLOOR';
  else if (isProject) categoryLabel = 'DEVELOPER PROJECT';

  // Evaluate the 4 lines tailored to category
  const flatLine = evaluateFlatFacts(listing, options);
  flatLine.label = isBuilder ? 'Loading & Area' : (isProject ? 'Pricing & Floor' : 'Valuation & DLC');

  let projectLine;
  let builderLine;

  if (isIndividual) {
    // Individual Resale Property: Evaluate Title and Society Clearances directly
    projectLine = evaluateResaleTitleFacts(listing);
    projectLine.label = '30-Year Title & EC';
    builderLine = evaluateResaleSocietyFacts(listing);
    builderLine.label = 'Society NOC & Taxes';
  } else if (isBuilder) {
    // Builder Floor / Developer Unit: Sanctioned drawings & JDA rights
    projectLine = evaluateBuilderFloorApprovals(listing);
    projectLine.label = 'Floor Approvals & FAR';
    builderLine = evaluateBuilderJdaFacts(listing);
    builderLine.label = 'Builder JDA & UDS';
  } else {
    // Developer Project / New Launch: Evaluate Project Completion and Builder Track Record
    projectLine = evaluateProjectFacts(projectFacts, reraId, listing.locality, jurisdiction);
    projectLine.label = 'RERA Project Filings';
    builderLine = evaluateBuilderFacts(projectFacts, jurisdiction);
    builderLine.label = 'Promoter Track Record';
  }

  const paperworkLine = evaluatePaperworkFacts(isBuilder ? 'builder_floor' : (isIndividual ? 'resale' : scenario));
  paperworkLine.label = 'Essential Paperwork';

  // Closing cost and loan estimation based on detected state
  const costEstimate = estimateTotalCost({
    price: listing.price || listing.salePrice || 0,
    areaSqft: listing.area || listing.area_sqft || 1000,
    possessionStatus: listing.possessionStatus || 'ready_to_move',
    isAffordable: options.isAffordable || false,
    downPaymentPct: options.downPaymentPct || 20,
    loanRatePct: options.loanRatePct || 8.5,
    loanTenureYears: options.loanTenureYears || 20
  }, jurisdiction);

  const paperworkChecklist = getPaperworkChecklist(scenario);

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      state: jurisdiction.state,
      jurisdiction: `${jurisdiction.state} (${jurisdiction.authorityCode})`,
      pilotAuthority: jurisdiction.authorityName,
      listingCategory,
      categoryLabel,
      isProject,
      isBuilder,
      isIndividual,
      scenario,
      matchMethod: lookup.matchMethod,
      disclaimer: 'This report summarizes visible listing data and official public filings as of the indicated dates. It does not constitute legal or financial advice and does not verify property title. Consult an independent advocate before paying any deposit.'
    },
    reportLines: {
      flat: flatLine,
      project: projectLine,
      builder: builderLine,
      paperwork: paperworkLine
    },
    costEstimate,
    paperworkChecklist
  };
}

/**
 * Renders printer-friendly, clean HTML string of the Buyer Due Diligence Report.
 * Designed to be printed or saved to PDF and handed to an independent advocate.
 * 
 * @param {object} buyerReport 
 * @param {object} listing 
 * @returns {string}
 */
export function renderPrintableHtml(buyerReport, listing) {
  const { meta, reportLines, costEstimate, paperworkChecklist } = buyerReport;
  const title = listing.title || `${listing.bhk || 2} BHK Flat in ${listing.locality || 'Bengaluru'}`;
  const priceFormatted = costEstimate.basePrice ? `₹${(costEstimate.basePrice / 10000000).toFixed(2)} Cr` : 'Price On Request';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>FlatAudit Buyer Due Diligence Report - ${title}</title>
  <style>
    @media print { body { font-size: 11pt; } .no-print { display: none; } }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1a202c; line-height: 1.5; margin: 24px auto; max-width: 800px; padding: 0 16px; }
    h1 { font-size: 1.4rem; margin: 0 0 4px; color: #0f172a; }
    .subtitle { color: #64748b; font-size: 0.9rem; margin-bottom: 20px; }
    .header-box { border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end; }
    .section-title { font-size: 1.1rem; font-weight: 700; margin: 20px 0 8px; color: #0f172a; border-left: 4px solid #2563eb; padding-left: 8px; }
    .rep-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 0.92rem; }
    .rep-table th, .rep-table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    .rep-table th { background: #f8fafc; font-weight: 600; width: 110px; }
    .badge-ok { color: #15803d; font-weight: 700; }
    .badge-warn { color: #b45309; font-weight: 700; }
    .badge-unknown { color: #475569; font-weight: 700; }
    .cost-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; font-size: 0.9rem; }
    .cost-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; }
    .cost-row { display: flex; justify-content: space-between; padding: 3px 0; }
    .cost-total { font-weight: 700; border-top: 1px solid #cbd5e1; margin-top: 6px; padding-top: 6px; }
    .checklist-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
    .checklist-table th, .checklist-table td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
    .checklist-table th { background: #f1f5f9; font-weight: 600; text-align: left; }
    .tag-mandatory { background: #fee2e2; color: #991b1b; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 0.75rem; }
    .tag-critical { background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 0.75rem; }
    .tag-recommended { background: #f1f5f9; color: #475569; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; }
    .disclaimer-box { background: #fffbeb; border: 1px solid #fef3c7; border-left: 4px solid #f59e0b; padding: 10px 12px; font-size: 0.82rem; color: #92400e; margin-top: 24px; border-radius: 4px; }
    .print-btn { background: #2563eb; color: #fff; border: 0; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; }
  </style>
</head>
<body>
  <div class="header-box">
    <div>
      <h1>FlatAudit Buyer Due Diligence Report</h1>
      <div class="subtitle">${title} | Base Asking Price: ${priceFormatted} <span style="display:inline-block;padding:2px 8px;background:#e0f2fe;color:#0369a1;border-radius:9999px;font-size:11px;font-weight:700;margin-left:6px;">${meta.categoryLabel || 'RESALE'}</span></div>
    </div>
    <div class="no-print">
      <button class="print-btn" onclick="window.print()">🖨️ Print / Save PDF</button>
    </div>
  </div>

  <div class="section-title">1. Objective 4-Line Evaluation (${meta.categoryLabel || 'Observable Facts Only'})</div>
  <table class="rep-table">
    <tr>
      <th>${reportLines.flat.label || 'Valuation'}</th>
      <td>
        <span class="${reportLines.flat.indicator === '✓' ? 'badge-ok' : (reportLines.flat.indicator === '⚠' ? 'badge-warn' : 'badge-unknown')}">${reportLines.flat.indicator}</span>
        ${reportLines.flat.summary}<br>
        <small style="color:#64748b;">Source: ${reportLines.flat.source} (As of ${reportLines.flat.dataAsOf})</small>
      </td>
    </tr>
    <tr>
      <th>${reportLines.project.label || 'Project / Title'}</th>
      <td>
        <span class="${reportLines.project.indicator === '✓' ? 'badge-ok' : (reportLines.project.indicator === '⚠' ? 'badge-warn' : 'badge-unknown')}">${reportLines.project.indicator}</span>
        ${reportLines.project.summary}<br>
        <small style="color:#64748b;">${reportLines.project.details}</small>
      </td>
    </tr>
    <tr>
      <th>${reportLines.builder.label || 'Promoter / Clearances'}</th>
      <td>
        <span class="${reportLines.builder.indicator === '✓' ? 'badge-ok' : (reportLines.builder.indicator === '⚠' ? 'badge-warn' : 'badge-unknown')}">${reportLines.builder.indicator}</span>
        ${reportLines.builder.summary}<br>
        <small style="color:#64748b;">${reportLines.builder.details}</small>
      </td>
    </tr>
    <tr>
      <th>${reportLines.paperwork.label || 'Paperwork'}</th>
      <td>
        <span class="badge-unknown">?</span>
        ${reportLines.paperwork.summary}<br>
        <small style="color:#64748b;">${reportLines.paperwork.details}</small>
      </td>
    </tr>
  </table>

  <div class="section-title">2. Estimated All-In Acquisition Cost (${meta.state || 'Statutory Norms'})</div>
  <div class="cost-grid">
    <div class="cost-box">
      <strong>Statutory Government Levies</strong>
      <div class="cost-row"><span>Base Property Price:</span> <span>₹${costEstimate.basePrice.toLocaleString('en-IN')}</span></div>
      <div class="cost-row"><span>Stamp Duty (5.6%):</span> <span>₹${costEstimate.statutoryCharges.stampDutyAmount.toLocaleString('en-IN')}</span></div>
      <div class="cost-row"><span>Registration Fee (1.0%):</span> <span>₹${costEstimate.statutoryCharges.registrationAmount.toLocaleString('en-IN')}</span></div>
      <div class="cost-row"><span>GST (${costEstimate.statutoryCharges.gstPct}%):</span> <span>₹${costEstimate.statutoryCharges.gstAmount.toLocaleString('en-IN')}</span></div>
      <div class="cost-row cost-total"><span>Statutory Total:</span> <span>₹${costEstimate.statutoryCharges.total.toLocaleString('en-IN')}</span></div>
    </div>
    <div class="cost-box">
      <strong>Acquisition & Financing Summary</strong>
      <div class="cost-row"><span>Maintenance Advance (12 mo):</span> <span>₹${costEstimate.otherCharges.maintenanceAdvance.toLocaleString('en-IN')}</span></div>
      <div class="cost-row"><span>BESCOM / BWSSB Connection:</span> <span>₹${costEstimate.otherCharges.connectionCharges.toLocaleString('en-IN')}</span></div>
      <div class="cost-row"><span>Legal Vetting & Khata Transfer:</span> <span>₹${costEstimate.otherCharges.legalAndKhata.toLocaleString('en-IN')}</span></div>
      <div class="cost-row cost-total"><span>All-In Acquisition Cost:</span> <span>₹${costEstimate.totalCost.toLocaleString('en-IN')}</span></div>
      <div class="cost-row" style="margin-top:6px; color:#2563eb;"><span>Estimated Monthly EMI (20y @ 8.5%):</span> <span>₹${costEstimate.financing.monthlyEmi.toLocaleString('en-IN')}</span></div>
    </div>
  </div>

  <div class="section-title">3. Document Due Diligence Checklist (${meta.scenario.toUpperCase()})</div>
  <table class="checklist-table">
    <thead>
      <tr>
        <th style="width: 25%;">Document Name</th>
        <th style="width: 15%;">Importance</th>
        <th style="width: 35%;">What to Check</th>
        <th style="width: 25%;">Verification Authority</th>
      </tr>
    </thead>
    <tbody>
      ${paperworkChecklist.map(doc => `
        <tr>
          <td><strong>${doc.name}</strong></td>
          <td><span class="${doc.importance === 'MANDATORY' ? 'tag-mandatory' : (doc.importance === 'CRITICAL' ? 'tag-critical' : 'tag-recommended')}">${doc.importance}</span></td>
          <td>${doc.description}</td>
          <td>${doc.whereToVerify}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="disclaimer-box">
    <strong>⚖️ Mandatory Legal Disclaimer</strong><br>
    ${meta.disclaimer}
  </div>
</body>
</html>`;
}
