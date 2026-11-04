/**
 * FlatAudit - JSON-LD & Schema.org Extraction Helper
 * 
 * Safely extracts structured real estate listing attributes from Schema.org JSON-LD scripts:
 * - Apartment, SingleFamilyResidence, House, Residence, Accommodation, RealEstateListing
 * - RentAction, BuyAction, SellAction
 * - BreadcrumbList
 */

/**
 * Parses all application/ld+json scripts in the given document and synthesizes
 * listing attributes.
 * 
 * @param {Document|object} document 
 * @returns {object|null}
 */
export function extractJsonLdData(document) {
  if (!document || typeof document.querySelectorAll !== 'function') return null;

  const data = {
    rent: null,
    price: null,
    rawPrice: null,
    listingType: null,
    title: '',
    projectName: '',
    builderName: '',
    description: '',
    bhk: null,
    floor: null,
    area_sqft: null,
    possessionStatus: null,
    locality: '',
    city: '',
    state: '',
    country: '',
    lat: null,
    lng: null,
    images: [],
    breadcrumbs: []
  };

  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  if (!scripts || scripts.length === 0) return null;

  let foundAny = false;
  for (const scriptEl of scripts) {
    try {
      const raw = scriptEl.textContent || '';
      if (!raw.trim()) continue;
      const parsed = JSON.parse(raw);
      processJsonLdItem(parsed, data);
      foundAny = true;
    } catch (e) {
      // Non-fatal if a portal has invalid JSON in one of its scripts
    }
  }

  return foundAny ? data : null;
}

function processJsonLdItem(item, data) {
  if (!item || typeof item !== 'object') return;

  // Handle arrays or @graph blocks
  if (Array.isArray(item)) {
    for (const sub of item) processJsonLdItem(sub, data);
    return;
  }
  if (item['@graph'] && Array.isArray(item['@graph'])) {
    for (const sub of item['@graph']) processJsonLdItem(sub, data);
    return;
  }

  const type = item['@type'];
  if (!type) return;

  // 1. RentAction
  if (type === 'RentAction') {
    data.listingType = data.listingType || 'rent';
    const spec = item.priceSpecification;
    if (spec && (spec.price || spec.minPrice)) {
      const p = parseFloat(spec.price || spec.minPrice);
      if (!isNaN(p) && p > 0) {
        data.rent = p;
        data.rawPrice = data.rawPrice || p;
      }
    } else if (item.price) {
      const p = parseFloat(item.price);
      if (!isNaN(p) && p > 0) {
        data.rent = p;
        data.rawPrice = data.rawPrice || p;
      }
    }
    if (item.object) processJsonLdItem(item.object, data);
  }

  // 2. BuyAction / SellAction
  if (type === 'BuyAction' || type === 'SellAction') {
    data.listingType = data.listingType || 'sale';
    const spec = item.priceSpecification;
    if (spec && (spec.price || spec.minPrice)) {
      const p = parseFloat(spec.price || spec.minPrice);
      if (!isNaN(p) && p > 0) {
        data.price = p;
        data.rawPrice = data.rawPrice || p;
      }
    } else if (item.price) {
      const p = parseFloat(item.price);
      if (!isNaN(p) && p > 0) {
        data.price = p;
        data.rawPrice = data.rawPrice || p;
      }
    }
    if (item.object) processJsonLdItem(item.object, data);
  }

  // 3. Real estate entities: Apartment, Residence, SingleFamilyResidence, House, Accommodation, Product
  if (['Apartment', 'Residence', 'SingleFamilyResidence', 'House', 'Accommodation', 'RealEstateListing', 'Place', 'Product'].includes(type)) {
    if (item.name && !data.title) data.title = item.name.trim();
    if (item.description && !data.description) data.description = item.description.trim();

    // BHK / Rooms
    if (item.numberOfRooms || item.numberOfBedrooms) {
      const r = parseInt(item.numberOfRooms || item.numberOfBedrooms, 10);
      if (!isNaN(r) && r > 0 && !data.bhk) data.bhk = r;
    }

    // Floor Level
    if (item.floorLevel !== undefined && data.floor === null) {
      const fl = parseInt(item.floorLevel, 10);
      if (!isNaN(fl)) data.floor = fl;
    }

    // Floor size / Area
    if (item.floorSize && !data.area_sqft) {
      const sizeStr = typeof item.floorSize === 'object' ? String(item.floorSize.value || '') : String(item.floorSize);
      const match = sizeStr.match(/([\d,]+(?:\.\d+)?)/);
      if (match) {
        const val = parseFloat(match[1].replace(/,/g, ''));
        if (!isNaN(val) && val > 0) data.area_sqft = Math.round(val);
      }
    }

    // Address
    if (item.address && typeof item.address === 'object') {
      if (item.address.streetAddress && !data.locality) data.locality = item.address.streetAddress.trim();
      if (item.address.addressLocality && !data.city) data.city = item.address.addressLocality.trim();
      if (item.address.addressRegion && !data.state) data.state = item.address.addressRegion.trim();
      if (item.address.addressCountry && !data.country) data.country = item.address.addressCountry.trim();
    }

    // Geo Coordinates
    if (item.geo && typeof item.geo === 'object') {
      if (item.geo.latitude && data.lat === null) {
        const lat = parseFloat(item.geo.latitude);
        if (!isNaN(lat)) data.lat = lat;
      }
      if (item.geo.longitude && data.lng === null) {
        const lng = parseFloat(item.geo.longitude);
        if (!isNaN(lng)) data.lng = lng;
      }
    }

    // Offers
    if (item.offers) {
      const offersArr = Array.isArray(item.offers) ? item.offers : [item.offers];
      for (const off of offersArr) {
        if (off.price) {
          const p = parseFloat(off.price);
          if (!isNaN(p) && p > 0) {
            data.rawPrice = data.rawPrice || p;
            if (data.listingType === 'sale' && !data.price) data.price = p;
            if (data.listingType === 'rent' && !data.rent) data.rent = p;
          }
        }
      }
    }

    // Brand / Builder
    if (item.brand) {
      const bName = typeof item.brand === 'object' ? item.brand.name : item.brand;
      if (bName && !data.builderName) data.builderName = String(bName).trim();
    }
    if (item.name && !data.projectName) {
      data.projectName = item.name.trim();
    }

    // Images
    if (item.image) {
      const imgs = Array.isArray(item.image) ? item.image : [item.image];
      for (const img of imgs) {
        const u = typeof img === 'object' ? (img.url || img.contentUrl) : img;
        if (typeof u === 'string' && u.startsWith('http')) {
          data.images.push(u);
        }
      }
    }
  }

  // 4. BreadcrumbList
  if (type === 'BreadcrumbList' && item.itemListElement && Array.isArray(item.itemListElement)) {
    for (const elem of item.itemListElement) {
      const name = elem.item?.name || elem.name;
      if (typeof name === 'string' && name.trim()) {
        data.breadcrumbs.push(name.trim());
      }
    }
  }

  // 5. FAQPage (common on new project and builder portals)
  if (type === 'FAQPage' && item.mainEntity && Array.isArray(item.mainEntity)) {
    for (const q of item.mainEntity) {
      const qText = (q.name || '').toLowerCase();
      const aText = (q.acceptedAnswer?.text || '').trim();
      if (!aText) continue;

      if (qText.includes('bhk') && !data.bhk) {
        const m = aText.match(/(\d+)\s*(?:bhk|bedroom)/i);
        if (m) data.bhk = parseInt(m[1], 10);
      }
      if (qText.includes('possession') && !data.possessionStatus) {
        if (/ready\s*to\s*move/i.test(aText)) data.possessionStatus = 'ready_to_move';
        else if (/under\s*construction/i.test(aText)) data.possessionStatus = 'under_construction';
      }
      if (qText.includes('location') && (!data.locality || !data.city)) {
        const m = aText.match(/in\s+([A-Za-z0-9\s]+?),\s*([A-Za-z0-9\s]+?)\.?$/i);
        if (m) {
          if (!data.locality) data.locality = m[1].trim();
          if (!data.city) data.city = m[2].trim();
        }
      }
    }
  }
}

