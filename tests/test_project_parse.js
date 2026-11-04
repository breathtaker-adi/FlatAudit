import fs from 'fs';
import { JSDOM } from 'jsdom';
import { parse99acres } from '../extension/lib/parsers/ninety_nine_acres.js';
import { 
  parseIndianCurrency, 
  parseBHK, 
  parseArea, 
  parseFloor,
  parsePricePerSqFt,
  parseAreaType,
  parsePossessionStatus,
  parseReraId
} from '../extension/lib/parsers/currency.js';
import { extractJsonLdData } from '../extension/lib/parsers/jsonld.js';

const html = fs.readFileSync('C:/Users/adity/.gemini/antigravity-ide/brain/e052d273-30fa-4767-8e0a-f8e58a0cd974/.system_generated/steps/2096/content.md', 'utf8');
const dom = new JSDOM(html);
const document = dom.window.document;
const currentUrl = 'https://www.99acres.com/kiara-ville-jagatpura-jagatpura-jaipur-npxid-r380406?src=NPSRP';

const container = document.body;
const jsonLd = extractJsonLdData(document);

const isProject = Boolean(
  currentUrl.includes('npxid') || 
  currentUrl.includes('/project') || 
  container.querySelector('[class*="ProjectInfo"], [class*="configurationCards"]') ||
  jsonLd?.builderName
);

const priceEl = container.querySelector(
  '#pdPrice, .component__pdPropValueV2, .component__pdPropVal, [data-label="PRICE"], #pdPrice2, ' +
  '.configurationCards__configurationCardsHeading, .configurationCards__cardPriceHeading, ' +
  '[class*="configurationCardsHeading"], [class*="cardPriceHeading"], [class*="ProjectInfo__price"], ' +
  '.srpTuple__price:not([class*="Wrap"]), [id*="priceDisplay"]'
);
let rawPrice = priceEl ? parseIndianCurrency(priceEl.textContent) : null;
if (!rawPrice && jsonLd) {
  rawPrice = jsonLd.price || jsonLd.salePrice || jsonLd.rawPrice;
}

const areaEl = container.querySelector(
  '[data-label="SUPER_AREA"], [data-label="BUILTUP_AREA"], [data-label="CARPET_AREA"], ' +
  '.component__pdPropArea, .configurationCards__cardAreaSubHeadingOne, [class*="cardAreaHeading"], ' +
  '.super-area, [class*="area"], [class*="Area"]'
);
let area_sqft = areaEl ? parseArea(areaEl.textContent) : null;
if (!area_sqft && jsonLd?.area_sqft) area_sqft = jsonLd.area_sqft;

const bhkEl = container.querySelector(
  '#pdBedrooms, [data-label="BHK"], .configurationCards__configBandLabel, [class*="configBandLabel"], .unit-type, [class*="configuration"]'
);
let bhk = bhkEl ? parseBHK(bhkEl.textContent) : null;
if (!bhk && jsonLd?.bhk) bhk = jsonLd.bhk;

const reraId = parseReraId(container.textContent || '');

const projectEl = container.querySelector('h1.ProjectInfo__imgBox1, [class*="ProjectInfo"] h1');
let projectName = (projectEl ? projectEl.textContent.split('\n')[0].replace(/<!--[\s\S]*?-->/g, '').trim() : '') || jsonLd?.projectName || '';

const builderName = jsonLd?.builderName || '';

const locEl = container.querySelector('.ProjectInfo__hideTxt, #address, .component__localities');
let locality = (locEl ? locEl.textContent.trim() : '') || (jsonLd?.locality && jsonLd?.city ? `${jsonLd.locality}, ${jsonLd.city}` : '');

console.log('Project Extraction Result:');
console.log({
  isProject,
  projectName,
  builderName,
  rawPrice,
  area_sqft,
  bhk,
  reraId,
  locality
});
