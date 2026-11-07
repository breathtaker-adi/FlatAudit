/**
 * FlatAudit Five Category Area Extractors (Slice S7a-e)
 * 
 * Extracts facts, nearest facilities, and evaluates category grades
 * from normalized OpenStreetMap element sets using deterministic rules.
 */

import defaultRules from '../data/area_rules.json' with { type: 'json' };
import { scoreCheck, gradeCategory } from './grades.js';

/**
 * Finds the nearest element matching a predicate.
 * @param {Array<object>} elements
 * @param {Function} predicate
 * @returns {object|null}
 */
export function findNearestElement(elements, predicate) {
  if (!Array.isArray(elements) || elements.length === 0) return null;
  let nearest = null;

  for (const el of elements) {
    if (!el || typeof el.distKm !== 'number') continue;
    if (predicate(el)) {
      if (!nearest || el.distKm < nearest.distKm) {
        nearest = el;
      }
    }
  }

  return nearest;
}

/**
 * Finds all elements matching a predicate, optionally within a max distance.
 * @param {Array<object>} elements
 * @param {Function} predicate
 * @param {number} [maxDistKm]
 * @returns {Array<object>}
 */
export function filterElements(elements, predicate, maxDistKm = Infinity) {
  if (!Array.isArray(elements)) return [];
  return elements.filter((el) => {
    if (!el || typeof el.distKm !== 'number') return false;
    if (el.distKm > maxDistKm) return false;
    return predicate(el);
  });
}

// ============================================================================
// Slice S7a: Emergency & Healthcare Extractor
// ============================================================================

/**
 * Extracts and grades Emergency & Healthcare facilities.
 * Checks: Hospital, Clinic/Doctor, Pharmacy, Ambulance Station (bonus).
 * @param {Array<object>} elements
 * @param {'metro'|'smaller'} cityTier
 * @param {object} [rules]
 * @returns {object} Graded category result
 */
export function evaluateEmergencyHealthcare(elements, cityTier = 'metro', rules = defaultRules) {
  const catDef = rules.categories.emergency_healthcare;
  const checksDef = catDef.checks;

  // 1. Hospital: amenity=hospital or healthcare=hospital
  const nearestHospital = findNearestElement(elements, (el) => {
    const amenity = el.tags?.amenity;
    const healthcare = el.tags?.healthcare;
    return amenity === 'hospital' || healthcare === 'hospital';
  });

  const hospitalScore = scoreCheck(
    nearestHospital?.distKm ?? null,
    checksDef.hospital_km,
    cityTier
  );

  const hospitalCheck = {
    key: 'hospital_km',
    label: checksDef.hospital_km.label,
    thing: checksDef.hospital_km.thing,
    searchRadiusKm: checksDef.hospital_km.search_radius_km,
    name: nearestHospital?.tags?.name || (nearestHospital ? 'Hospital' : null),
    km: nearestHospital?.distKm ?? null,
    score: hospitalScore.score,
    hasData: hospitalScore.hasData
  };

  // 2. Clinic: amenity=clinic or amenity=doctors
  const nearestClinic = findNearestElement(elements, (el) => {
    const amenity = el.tags?.amenity;
    return amenity === 'clinic' || amenity === 'doctors';
  });

  const clinicScore = scoreCheck(
    nearestClinic?.distKm ?? null,
    checksDef.clinic_km,
    cityTier
  );

  const clinicCheck = {
    key: 'clinic_km',
    label: checksDef.clinic_km.label,
    thing: checksDef.clinic_km.thing,
    searchRadiusKm: checksDef.clinic_km.search_radius_km,
    name: nearestClinic?.tags?.name || (nearestClinic ? 'Clinic' : null),
    km: nearestClinic?.distKm ?? null,
    score: clinicScore.score,
    hasData: clinicScore.hasData
  };

  // 3. Pharmacy: amenity=pharmacy
  const nearestPharmacy = findNearestElement(elements, (el) => {
    return el.tags?.amenity === 'pharmacy';
  });

  const pharmacyScore = scoreCheck(
    nearestPharmacy?.distKm ?? null,
    checksDef.pharmacy_km,
    cityTier
  );

  const pharmacyCheck = {
    key: 'pharmacy_km',
    label: checksDef.pharmacy_km.label,
    thing: checksDef.pharmacy_km.thing,
    searchRadiusKm: checksDef.pharmacy_km.search_radius_km,
    name: nearestPharmacy?.tags?.name || (nearestPharmacy ? 'Pharmacy' : null),
    km: nearestPharmacy?.distKm ?? null,
    score: pharmacyScore.score,
    hasData: pharmacyScore.hasData
  };

  // 4. Bonus fact only: emergency=ambulance_station (Section 6.3)
  const nearestAmbulance = findNearestElement(elements, (el) => {
    return el.tags?.emergency === 'ambulance_station';
  });

  const checks = [hospitalCheck, clinicCheck, pharmacyCheck];
  const graded = gradeCategory(checks, 'emergency_healthcare', cityTier, rules);

  if (nearestAmbulance && nearestAmbulance.distKm <= 3.0) {
    graded.ambulanceBonus = {
      name: nearestAmbulance.tags?.name || 'Ambulance station',
      km: nearestAmbulance.distKm
    };
  }

  return graded;
}

// ============================================================================
// Slice S7b: Daily Supplies & Services Extractor
// ============================================================================

/**
 * Extracts and grades Daily Supplies & Services.
 * Checks: Supermarket/Grocery, Greengrocer, Bank/ATM, Pharmacy.
 * @param {Array<object>} elements
 * @param {'metro'|'smaller'} cityTier
 * @param {object} [rules]
 * @returns {object} Graded category result
 */
export function evaluateDailySupplies(elements, cityTier = 'metro', rules = defaultRules) {
  const catDef = rules.categories.daily_supplies;
  const checksDef = catDef.checks;

  // 1. Supermarket / Convenience / Grocery
  const nearestGrocery = findNearestElement(elements, (el) => {
    const shop = el.tags?.shop;
    return shop && ['supermarket', 'convenience', 'grocery', 'general'].includes(shop);
  });

  const groceryScore = scoreCheck(
    nearestGrocery?.distKm ?? null,
    checksDef.grocery_km,
    cityTier
  );

  const groceryCheck = {
    key: 'grocery_km',
    label: checksDef.grocery_km.label,
    thing: checksDef.grocery_km.thing,
    searchRadiusKm: checksDef.grocery_km.search_radius_km,
    name: nearestGrocery?.tags?.name || (nearestGrocery ? 'Grocery store' : null),
    km: nearestGrocery?.distKm ?? null,
    score: groceryScore.score,
    hasData: groceryScore.hasData
  };

  // 2. Greengrocer / Vegetable market
  const nearestGreengrocer = findNearestElement(elements, (el) => {
    return el.tags?.shop === 'greengrocer';
  });

  const greengrocerScore = scoreCheck(
    nearestGreengrocer?.distKm ?? null,
    checksDef.greengrocer_km,
    cityTier
  );

  const greengrocerCheck = {
    key: 'greengrocer_km',
    label: checksDef.greengrocer_km.label,
    thing: checksDef.greengrocer_km.thing,
    searchRadiusKm: checksDef.greengrocer_km.search_radius_km,
    name: nearestGreengrocer?.tags?.name || (nearestGreengrocer ? 'Greengrocer' : null),
    km: nearestGreengrocer?.distKm ?? null,
    score: greengrocerScore.score,
    hasData: greengrocerScore.hasData
  };

  // 3. Bank or ATM
  const nearestBankAtm = findNearestElement(elements, (el) => {
    const amenity = el.tags?.amenity;
    return amenity === 'atm' || amenity === 'bank';
  });

  const bankAtmScore = scoreCheck(
    nearestBankAtm?.distKm ?? null,
    checksDef.bank_atm_km,
    cityTier
  );

  const bankAtmCheck = {
    key: 'bank_atm_km',
    label: checksDef.bank_atm_km.label,
    thing: checksDef.bank_atm_km.thing,
    searchRadiusKm: checksDef.bank_atm_km.search_radius_km,
    name: nearestBankAtm?.tags?.name || (nearestBankAtm ? 'Bank or ATM' : null),
    km: nearestBankAtm?.distKm ?? null,
    score: bankAtmScore.score,
    hasData: bankAtmScore.hasData
  };

  // 4. Pharmacy (daily necessity)
  const nearestPharmacy = findNearestElement(elements, (el) => {
    return el.tags?.amenity === 'pharmacy';
  });

  const pharmacyScore = scoreCheck(
    nearestPharmacy?.distKm ?? null,
    checksDef.pharmacy_km,
    cityTier
  );

  const pharmacyCheck = {
    key: 'pharmacy_km',
    label: checksDef.pharmacy_km.label,
    thing: checksDef.pharmacy_km.thing,
    searchRadiusKm: checksDef.pharmacy_km.search_radius_km,
    name: nearestPharmacy?.tags?.name || (nearestPharmacy ? 'Pharmacy' : null),
    km: nearestPharmacy?.distKm ?? null,
    score: pharmacyScore.score,
    hasData: pharmacyScore.hasData
  };

  const checks = [groceryCheck, greengrocerCheck, bankAtmCheck, pharmacyCheck];
  return gradeCategory(checks, 'daily_supplies', cityTier, rules);
}

// ============================================================================
// Slice S7c: Commute & Transit Extractor
// ============================================================================

/**
 * Extracts and grades Commute & Transit facilities.
 * Checks: Bus stop/station, Metro/Rail station, Main Road access.
 * @param {Array<object>} elements
 * @param {'metro'|'smaller'} cityTier
 * @param {object} [rules]
 * @returns {object} Graded category result
 */
export function evaluateCommuteTransit(elements, cityTier = 'metro', rules = defaultRules) {
  const catDef = rules.categories.commute_transit;
  const checksDef = catDef.checks;

  // 1. Bus Stop / Station / Platform
  const nearestBusStop = findNearestElement(elements, (el) => {
    const highway = el.tags?.highway;
    const amenity = el.tags?.amenity;
    const pt = el.tags?.public_transport;
    return highway === 'bus_stop' || amenity === 'bus_station' || pt === 'platform';
  });

  const busScore = scoreCheck(
    nearestBusStop?.distKm ?? null,
    checksDef.bus_stop_km,
    cityTier
  );

  const busCheck = {
    key: 'bus_stop_km',
    label: checksDef.bus_stop_km.label,
    thing: checksDef.bus_stop_km.thing,
    searchRadiusKm: checksDef.bus_stop_km.search_radius_km,
    name: nearestBusStop?.tags?.name || (nearestBusStop ? 'Bus stop' : null),
    km: nearestBusStop?.distKm ?? null,
    score: busScore.score,
    hasData: busScore.hasData
  };

  // 2. Metro / Rail Station
  const nearestMetroRail = findNearestElement(elements, (el) => {
    const railway = el.tags?.railway;
    const station = el.tags?.station;
    return (
      station === 'subway' ||
      (railway && ['station', 'subway', 'subway_entrance', 'halt'].includes(railway))
    );
  });

  const metroScore = scoreCheck(
    nearestMetroRail?.distKm ?? null,
    checksDef.metro_rail_km,
    cityTier
  );

  const metroCheck = {
    key: 'metro_rail_km',
    label: checksDef.metro_rail_km.label,
    thing: checksDef.metro_rail_km.thing,
    searchRadiusKm: checksDef.metro_rail_km.search_radius_km,
    name: nearestMetroRail?.tags?.name || (nearestMetroRail ? 'Metro/Rail station' : null),
    km: nearestMetroRail?.distKm ?? null,
    score: metroScore.score,
    hasData: metroScore.hasData
  };

  // 3. Main Road (Trunk / Primary / Secondary)
  const nearestMainRoad = findNearestElement(elements, (el) => {
    const highway = el.tags?.highway;
    return highway && ['trunk', 'primary', 'secondary'].includes(highway);
  });

  const roadScore = scoreCheck(
    nearestMainRoad?.distKm ?? null,
    checksDef.main_road_km,
    cityTier
  );

  const roadCheck = {
    key: 'main_road_km',
    label: checksDef.main_road_km.label,
    thing: checksDef.main_road_km.thing,
    searchRadiusKm: checksDef.main_road_km.search_radius_km,
    name: nearestMainRoad?.tags?.name || (nearestMainRoad ? 'Main road' : null),
    km: nearestMainRoad?.distKm ?? null,
    score: roadScore.score,
    hasData: roadScore.hasData
  };

  const checks = [busCheck, metroCheck, roadCheck];
  return gradeCategory(checks, 'commute_transit', cityTier, rules);
}
