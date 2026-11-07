import fs from 'node:fs';
import path from 'node:path';
import { encodeGeohash } from '../extension/lib/geohash.js';

const bengaluru = [
  { name: 'Indiranagar', aliases: ['indiranagar', 'indira nagar', '100 feet road', 'cmh road', 'defence colony'], lat: 12.9784, lng: 77.6408 },
  { name: 'Domlur', aliases: ['domlur', 'domlur layout', 'amarjyoti layout'], lat: 12.9609, lng: 77.6387 },
  { name: 'Ulsoor', aliases: ['ulsoor', 'halasuru', 'someshwarpura'], lat: 12.9817, lng: 77.6286 },
  { name: 'Koramangala', aliases: ['koramangala', 'kora', 'st bed', 'ejipura', 'sony world signal'], lat: 12.9352, lng: 77.6245 },
  { name: 'HSR Layout', aliases: ['hsr layout', 'hsr', 'sector 1 hsr', 'sector 2 hsr', 'sector 7 hsr'], lat: 12.9121, lng: 77.6446 },
  { name: 'Bellandur', aliases: ['bellandur', 'bellandur gate', 'green glen layout'], lat: 12.9304, lng: 77.6784 },
  { name: 'Whitefield', aliases: ['whitefield', 'itpl', 'hope farm', 'kadugodi'], lat: 12.9698, lng: 77.7500 },
  { name: 'Marathahalli', aliases: ['marathahalli', 'spice garden', 'munnekollal'], lat: 12.9591, lng: 77.6974 },
  { name: 'Electronic City', aliases: ['electronic city', 'electronic city phase 1', 'electronic city phase 2', 'neotown'], lat: 12.8452, lng: 77.6602 },
  { name: 'Jayanagar', aliases: ['jayanagar', 'jayanagar 4th block', 'jayanagar 3rd block', 'south end circle'], lat: 12.9308, lng: 77.5838 },
  { name: 'BTM Layout', aliases: ['btm layout', 'btm', 'btm 1st stage', 'btm 2nd stage', 'madiwala'], lat: 12.9166, lng: 77.6101 },
  { name: 'JP Nagar', aliases: ['jp nagar', 'jp nagar 1st phase', 'jp nagar 2nd phase', 'sarakki'], lat: 12.9063, lng: 77.5857 },
  { name: 'Malleshwaram', aliases: ['malleshwaram', 'malleswaram', 'margosa road', 'sampige road'], lat: 13.0031, lng: 77.5643 },
  { name: 'Rajajinagar', aliases: ['rajajinagar', 'rajaji nagar', 'navrang'], lat: 12.9982, lng: 77.5530 },
  { name: 'Hebbal', aliases: ['hebbal', 'hebbal flyover', 'kempapura hebbal'], lat: 13.0358, lng: 77.5970 }
];

const jaipur = [
  { name: 'Vaishali Nagar', aliases: ['vaishali nagar', 'vaishali', 'amrapali circle', 'gandhi path'], lat: 26.9080, lng: 75.7423 },
  { name: 'Chitrakoot', aliases: ['chitrakoot', 'chitrakoot stadium', 'vaishali west'], lat: 26.8992, lng: 75.7408 },
  { name: 'Khatipura', aliases: ['khatipura', 'khatipura road', 'sirsi road'], lat: 26.9230, lng: 75.7445 },
  { name: 'Mansarovar', aliases: ['mansarovar', 'mansarovar metro', 'varun path', 'madhyam marg'], lat: 26.8532, lng: 75.7675 },
  { name: 'Shyam Nagar', aliases: ['shyam nagar', 'shyam nagar metro', 'janpath'], lat: 26.8872, lng: 75.7681 },
  { name: 'Gopalpura Bypass', aliases: ['gopalpura bypass', 'gopalpura', 'triveni nagar'], lat: 26.8625, lng: 75.7820 },
  { name: 'Malviya Nagar', aliases: ['malviya nagar', 'gt central', 'wto', 'calgiri road'], lat: 26.8549, lng: 75.8243 },
  { name: 'Jagatpura', aliases: ['jagatpura', 'mahal road', 'ramnagariya', 'kiara ville'], lat: 26.8242, lng: 75.8398 },
  { name: 'C-Scheme', aliases: ['c-scheme', 'c scheme', 'ashok nagar', 'civil lines'], lat: 26.9112, lng: 75.7975 },
  { name: 'Raja Park', aliases: ['raja park', 'tilak nagar', 'adarsh nagar'], lat: 26.8950, lng: 75.8270 },
  { name: 'Bapu Nagar', aliases: ['bapu nagar', 'jl n marg', 'rajasthan university'], lat: 26.8880, lng: 75.8080 },
  { name: 'Tonk Road', aliases: ['tonk road', 'durgapura', 'mahavir nagar'], lat: 26.8680, lng: 75.8050 },
  { name: 'Vidhyadhar Nagar', aliases: ['vidhyadhar nagar', 'sector 1 vidhyadhar', 'central spine'], lat: 26.9620, lng: 75.7790 },
  { name: 'Ajmer Road', aliases: ['ajmer road', 'dcm', 'heerapura'], lat: 26.8850, lng: 75.7280 },
  { name: 'Sanganer', aliases: ['sanganer', 'pratap nagar jaipur', 'cheelgadi'], lat: 26.8200, lng: 75.7700 }
];

const jodhpur = [
  { name: 'Shastri Nagar', aliases: ['shastri nagar', 'shastri nagar jodhpur', 'sector c shastri'], lat: 26.2730, lng: 73.0080 },
  { name: 'Sardarpura', aliases: ['sardarpura', 'c road sardarpura', 'jaljog circle'], lat: 26.2805, lng: 73.0160 },
  { name: 'Pal Road', aliases: ['pal road', 'pal balaji', 'mertiya garden', 'pal'], lat: 26.2480, lng: 72.9850 },
  { name: 'Khema Ka Kuwa', aliases: ['khema ka kuwa', 'khema kuwa', 'shastri nagar ext'], lat: 26.2550, lng: 72.9950 },
  { name: 'Ratanada', aliases: ['ratanada', 'circuit house', 'bhati circle', 'air force area'], lat: 26.2690, lng: 73.0360 },
  { name: 'Paota', aliases: ['paota', 'paota b road', 'paota c road', 'mandore road'], lat: 26.3020, lng: 73.0450 },
  { name: 'Mandore', aliases: ['mandore', 'mandore garden', 'nagaur road'], lat: 26.3550, lng: 73.0480 },
  { name: 'Basni Industrial Area', aliases: ['basni', 'basni phase 1', 'basni phase 2', 'aiims jodhpur'], lat: 26.2250, lng: 73.0050 },
  { name: 'Kudi Bhagtasni', aliases: ['kudi bhagtasni', 'kudi', 'kudirera', 'kudi housing board'], lat: 26.1950, lng: 73.0180 },
  { name: 'Chopasni Housing Board', aliases: ['chopasni housing board', 'chopasni', 'chb'], lat: 26.2680, lng: 72.9650 },
  { name: 'BJS Colony', aliases: ['bjs colony', 'bjs', 'bhadwasiya'], lat: 26.3150, lng: 73.0550 },
  { name: 'Pratap Nagar', aliases: ['pratap nagar jodhpur', 'pratap nagar', 'suratpura'], lat: 26.2850, lng: 72.9980 }
];

function enrich(list) {
  return list.map(item => ({
    name: item.name,
    aliases: item.aliases,
    lat: item.lat,
    lng: item.lng,
    geohash5: encodeGeohash(item.lat, item.lng, 5)
  }));
}

const outDir = path.resolve('extension/lib/data');
fs.writeFileSync(path.join(outDir, 'localities_bengaluru.json'), JSON.stringify(enrich(bengaluru), null, 2));
fs.writeFileSync(path.join(outDir, 'localities_jaipur.json'), JSON.stringify(enrich(jaipur), null, 2));
fs.writeFileSync(path.join(outDir, 'localities_jodhpur.json'), JSON.stringify(enrich(jodhpur), null, 2));
console.log('Localities JSON generated successfully.');
