/**
 * FlatAudit - Dynamic Benchmark & Fallback Ladder Engine
 * 
 * Implements "Every-City Benchmarks Without Hardcoding":
 * - Discards fixed rupee limits in code
 * - Evaluates listings strictly relative to peers using robust statistics (Median & MAD)
 * - Walk the Fallback Ladder:
 *     Level 1: Peer Page (same-BHK cards seen on current search or similar carousel, n >= 6)
 *     Level 2: Area Cell (fine geohash ~1-5km or fine locality pack, n >= 10)
 *     Level 3: District Cell (parent geohash ~20-40km, n >= 8)
 *     Level 4: City Baseline (metro aggregate, n >= 5)
 *     Level 5: None ("Not enough local data" - stays silent, suppresses price flags)
 */

import marketPacksData from './data/market_packs.json' with { type: 'json' };
import guidanceValuesData from './data/guidance_values.json' with { type: 'json' };
import rajasthanCostsData from './data/rajasthan_costs.json' with { type: 'json' };

/**
 * Computes median of numeric array.
 * @param {number[]} arr 
 * @returns {number|null}
 */
export function computeMedian(arr) {
  if (!arr || arr.length === 0) return null;
  const sorted = [...arr].filter(x => typeof x === 'number' && !isNaN(x)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Computes Median Absolute Deviation (MAD).
 * MAD = median(|x_i - median(X)|)
 * @param {number[]} arr 
 * @param {number} [medianVal] 
 * @returns {number}
 */
export function computeMAD(arr, medianVal = null) {
  if (!arr || arr.length === 0) return 0;
  const med = medianVal !== null ? medianVal : computeMedian(arr);
  if (med === null) return 0;
  const deviations = arr.map(x => Math.abs(x - med));
  return computeMedian(deviations) || 0;
}

/**
 * Robust z-score using MAD:
 * z = (x - median) / (1.4826 * MAD)
 * When MAD is 0 (or undefined), returns 0.
 * @param {number} val 
 * @param {number} median 
 * @param {number} mad 
 * @returns {number}
 */
export function robustZScore(val, median, mad) {
  if (typeof val !== 'number' || typeof median !== 'number' || !mad || mad <= 0) {
    return 0;
  }
  return (val - median) / (1.4826 * mad);
}

/**
 * Computes aggregate statistics from an array of peer listings.
 * @param {Array<{ rent: number, bhk?: number, area_sqft?: number, deposit?: number }>} peers 
 * @param {number} [targetBhk=2] 
 * @returns {object|null}
 */
export function computePeerAggregates(peers = [], targetBhk = 2) {
  if (!peers || peers.length === 0) return null;

  const filtered = peers.filter(p => {
    if (!p || typeof p.rent !== 'number' || p.rent <= 0) return false;
    if (targetBhk && p.bhk && p.bhk !== targetBhk) return false;
    return true;
  });

  if (filtered.length < 5) return null;

  const rents = filtered.map(p => p.rent);
  const median = computeMedian(rents);
  const mad = computeMAD(rents, median);

  // Per sq ft
  const psfVals = filtered
    .filter(p => p.area_sqft && p.area_sqft > 0)
    .map(p => Math.round((p.rent / p.area_sqft) * 10) / 10);
  const psfMedian = psfVals.length >= 3 ? computeMedian(psfVals) : null;

  // Deposit multiple
  const depMultiples = filtered
    .filter(p => p.deposit !== null && p.deposit !== undefined && p.deposit >= 0 && p.rent > 0)
    .map(p => Math.round((p.deposit / p.rent) * 10) / 10);
  const depMedian = depMultiples.length >= 3 ? computeMedian(depMultiples) : 3.0;

  return {
    n: filtered.length,
    median,
    mad,
    psfMedian,
    depositMultiple: {
      median: depMedian,
      min: Math.max(1.0, depMedian - 1.5),
      max: depMedian + 2.5
    }
  };
}

/**
 * Validates the schema and values of a market pack object.
 * Rejects malformed JSON, missing BHK objects, or non-numeric statistics.
 * @param {object} pack
 * @returns {boolean}
 */
export function isValidMarketPack(pack) {
  if (!pack || typeof pack !== 'object') return false;
  if (!pack.cell || typeof pack.cell !== 'string') return false;
  if (!pack.level || typeof pack.level !== 'string') return false;
  if (!pack.bhk || typeof pack.bhk !== 'object') return false;

  const bhkKeys = Object.keys(pack.bhk);
  if (bhkKeys.length === 0) return false;

  for (const k of bhkKeys) {
    const entry = pack.bhk[k];
    if (!entry || typeof entry !== 'object') return false;
    if (typeof entry.n !== 'number' || entry.n < 0) return false;
    if (typeof entry.median !== 'number' || entry.median <= 0) return false;
    if (typeof entry.mad !== 'number' || entry.mad < 0) return false;
  }

  return true;
}

/**
 * Resolves benchmark data for a listing walking the 5-step fallback ladder:
 * 1. Peer Page -> 2. Area Cell -> 3. District Cell -> 4. City -> 5. None
 * 
 * @param {object} listing - Listing object { rent, bhk, area_sqft, locality, geohash, lat, lng }
 * @param {object} [context] - Optional execution context { peerListings: [], customPacks: [] }
 * @returns {object} Standard benchmark descriptor
 */
export function getBenchmark(listing = {}, context = {}) {
  const bhkKey = String(Math.min(Math.max(listing.bhk || 2, 1), 3));
  const rawLocality = (listing.locality || '').toLowerCase().trim();
  const geohash = (listing.geohash || '').toLowerCase().trim();

  // ==========================================
  // LEVEL 1: Peer-Page Benchmark
  // ==========================================
  const peerListings = context.peerListings || context.peerResults || null;
  if (peerListings && Array.isArray(peerListings) && peerListings.length >= 6) {
    const peerStats = computePeerAggregates(peerListings, listing.bhk || 2);
    if (peerStats && peerStats.n >= 6) {
      return {
        level: 'peer_page',
        sourceLabel: `vs ${peerStats.n} same-BHK listings on this page`,
        n: peerStats.n,
        median: peerStats.median,
        mad: peerStats.mad,
        psfMedian: peerStats.psfMedian,
        depositMultiple: peerStats.depositMultiple,
        confidence: peerStats.n >= 12 ? 'high' : 'medium'
      };
    }
  }

  // Retrieve available packs and validate schema
  const candidatePacks = (context.customPacks && Array.isArray(context.customPacks))
    ? context.customPacks
    : (marketPacksData?.packs || []);
  const packs = candidatePacks.filter(isValidMarketPack);

  // ==========================================
  // LEVEL 2: Area Cell (Fine geohash >= 5 or fine locality alias)
  // ==========================================
  let areaPack = null;
  if (geohash.length >= 5) {
    areaPack = packs.find(p => p.level === 'area_cell' && geohash.startsWith(p.cell));
  }
  if (!areaPack && rawLocality) {
    areaPack = packs.find(p => {
      if (p.level !== 'area_cell') return false;
      return p.aliases && p.aliases.some(alias => rawLocality.includes(alias.toLowerCase()));
    });
  }

  if (areaPack && areaPack.bhk && areaPack.bhk[bhkKey]) {
    const data = areaPack.bhk[bhkKey];
    if (data.n >= 10) {
      return {
        level: 'area_cell',
        sourceLabel: `vs ${data.n} listings nearby in ${areaPack.name}`,
        n: data.n,
        median: data.median,
        mad: data.mad,
        psfMedian: data.psf_median || null,
        depositMultiple: areaPack.deposit_multiple || { median: 3.5, min: 2.0, max: 5.5 },
        confidence: 'high'
      };
    }
  }

  // ==========================================
  // LEVEL 3: District Cell (Parent geohash length 4)
  // ==========================================
  let districtPack = null;
  if (geohash.length >= 4) {
    districtPack = packs.find(p => geohash.startsWith(p.cell.slice(0, 4)));
  }

  if (districtPack && districtPack.bhk && districtPack.bhk[bhkKey]) {
    const data = districtPack.bhk[bhkKey];
    if (data.n >= 8) {
      return {
        level: 'district_cell',
        sourceLabel: `vs ${data.n} listings in wider ${districtPack.name || districtPack.city}`,
        n: data.n,
        median: data.median,
        mad: data.mad,
        psfMedian: data.psf_median || null,
        depositMultiple: districtPack.deposit_multiple || { median: 3.0, min: 1.5, max: 5.0 },
        confidence: 'medium'
      };
    }
  }

  // ==========================================
  // LEVEL 4: City Baseline
  // ==========================================
  let cityPack = null;
  if (rawLocality) {
    cityPack = packs.find(p => {
      if (p.level !== 'city') return false;
      return p.aliases && p.aliases.some(alias => rawLocality.includes(alias.toLowerCase()));
    });
  }

  if (cityPack && cityPack.bhk && cityPack.bhk[bhkKey]) {
    const data = cityPack.bhk[bhkKey];
    if (data.n >= 5) {
      return {
        level: 'city',
        sourceLabel: `vs ${cityPack.city} city-wide median (sample size: ${data.n})`,
        n: data.n,
        median: data.median,
        mad: data.mad,
        psfMedian: data.psf_median || null,
        depositMultiple: cityPack.deposit_multiple || { median: 3.0, min: 1.5, max: 5.0 },
        confidence: 'low'
      };
    }
  }

  // ==========================================
  // LEVEL 5: None (Insufficient Data)
  // ==========================================
  return {
    level: 'none',
    sourceLabel: 'Not enough local data',
    n: 0,
    median: null,
    mad: null,
    psfMedian: null,
    depositMultiple: null,
    confidence: 'none'
  };
}

/**
 * Retrieves official government guidance value (circle rate) for a locality.
 * @param {string} locality 
 * @param {string} [city='bengaluru'] 
 * @returns {object|null}
 */
export function getGuidanceValue(locality, city = 'bengaluru') {
  if (!locality || typeof locality !== 'string') return null;
  const cleanLoc = locality.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const cleanCity = (city || '').toLowerCase();
  
  // 1. Karnataka (Bengaluru)
  if (cleanCity.includes('bengaluru') || cleanCity.includes('bangalore') || cleanLoc.includes('bangalore') || cleanLoc.includes('bengaluru')) {
    const localities = guidanceValuesData.localities || {};
    for (const [key, val] of Object.entries(localities)) {
      if (cleanLoc.includes(key) || key.includes(cleanLoc)) {
        return {
          state: guidanceValuesData.state,
          city: guidanceValuesData.city,
          localityKey: key,
          guidancePerSqft: val.guidancePerSqft,
          zone: val.zone,
          effectiveDate: guidanceValuesData.effectiveDate,
          source: guidanceValuesData.source,
          disclaimer: guidanceValuesData.disclaimer
        };
      }
    }
  }

  // 2. Rajasthan (Jaipur, Jodhpur, Kota, Udaipur)
  if (cleanCity.includes('jaipur') || cleanCity.includes('jodhpur') || cleanCity.includes('kota') || cleanCity.includes('udaipur') ||
      cleanLoc.includes('jaipur') || cleanLoc.includes('jodhpur') || cleanLoc.includes('kota') || cleanLoc.includes('udaipur') ||
      cleanLoc.includes('jagatpura') || cleanLoc.includes('mansarovar') || cleanLoc.includes('vaishali_nagar')) {
    const zones = rajasthanCostsData.dlc_guidance?.zones || {};
    for (const [zoneCity, cityLocs] of Object.entries(zones)) {
      for (const [locKey, rates] of Object.entries(cityLocs)) {
        if (cleanLoc.includes(locKey) || locKey.includes(cleanLoc)) {
          // DLC rates are in INR per sq meter. Standard conversion: 1 sq meter = 10.764 sq ft
          const sqmRate = rates.residential?.interior || rates.residential?.exterior_main_road || 25000;
          const sqftRate = Math.round(sqmRate / 10.764);
          return {
            state: 'Rajasthan',
            city: zoneCity.charAt(0).toUpperCase() + zoneCity.slice(1),
            localityKey: locKey,
            guidancePerSqft: sqftRate,
            zone: 'DLC Zone',
            effectiveDate: rajasthanCostsData.metadata?.effective_year ? `${rajasthanCostsData.metadata.effective_year}-01-01` : '2026-01-01',
            source: `${rajasthanCostsData.metadata?.portal_source || 'epanjiyan.rajasthan.gov.in'} (DLC Rates)`,
            disclaimer: 'DLC rate converted from ₹/sqm to ₹/sqft (1 sqm = 10.764 sqft).'
          };
        }
      }
    }
  }

  return null;
}

/**
 * Returns official state RERA verification portal link and instructions.
 * Links directly to the official government search page rather than scraping it.
 * @param {string} [reraId=''] 
 * @param {string} [locality=''] 
 * @returns {{ state: string, url: string, label: string, reraId: string|null, searchAdvice: string }}
 */
export function getReraPortalUrl(reraId = '', locality = '') {
  const cleanRera = (reraId || '').trim();
  const cleanLoc = (locality || '').toLowerCase();

  if (/RAJ/i.test(cleanRera) || /jaipur|jodhpur|kota|udaipur|rajasthan/i.test(cleanLoc)) {
    return {
      state: 'Rajasthan',
      url: 'https://rajrera.rajasthan.gov.in/Project_Summary.aspx',
      label: 'Rajasthan RERA (Raj-RERA) Portal',
      reraId: cleanRera || null,
      searchAdvice: 'Verify project completion Form B filings and escrow bank disclosures directly on Raj-RERA.'
    };
  }

  if (/KA\/RERA/i.test(cleanRera) || /bangalore|bengaluru|mysore|karnataka/i.test(cleanLoc)) {
    return {
      state: 'Karnataka',
      url: 'https://rera.karnataka.gov.in/viewAllProjects',
      label: 'Karnataka RERA Project Verification Portal',
      reraId: cleanRera || null,
      searchAdvice: 'Verify project registration, promoter details, approved plans, and completion date directly on K-RERA.'
    };
  }

  if (/P51\d/i.test(cleanRera) || /mumbai|pune|thane|navi mumbai|maharashtra/i.test(cleanLoc)) {
    return {
      state: 'Maharashtra',
      url: 'https://maharera.mahaonline.gov.in/',
      label: 'MahaRERA Project Search',
      reraId: cleanRera || null,
      searchAdvice: 'Search by registration number to verify litigation disclosures and building plan approvals on MahaRERA.'
    };
  }

  if (/HRERA/i.test(cleanRera) || /gurgaon|gurugram|faridabad|haryana/i.test(cleanLoc)) {
    return {
      state: 'Haryana',
      url: 'https://haryanarera.gov.in/',
      label: 'Haryana RERA (HRERA) Portal',
      reraId: cleanRera || null,
      searchAdvice: 'Verify promoter status and project escrow accounts on HRERA.'
    };
  }

  if (/TS\s*RERA/i.test(cleanRera) || /hyderabad|telangana/i.test(cleanLoc)) {
    return {
      state: 'Telangana',
      url: 'https://rera.telangana.gov.in/',
      label: 'Telangana RERA Portal',
      reraId: cleanRera || null,
      searchAdvice: 'Check registration certificate and developer disclosures on TS-RERA.'
    };
  }

  return {
    state: 'National',
    url: 'https://mohua.gov.in/cms/rera.php',
    label: 'Ministry of Housing and Urban Affairs (RERA Registry)',
    reraId: cleanRera || null,
    searchAdvice: 'Locate your respective state RERA authority portal to verify promoter details.'
  };
}

