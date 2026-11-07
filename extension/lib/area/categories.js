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
