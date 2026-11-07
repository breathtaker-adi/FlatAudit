/**
 * FlatAudit - Investment Appreciation & Capital Growth Forecast Engine
 *
 * Models standard-condition capital appreciation benchmarks for Indian property:
 * - Baseline CAGR derived from historical RBI Housing Price Index (HPI): 7.5% p.a.
 * - Multi-year valuation trajectories (3-Year, 5-Year, 10-Year horizons)
 * - Gross and net rental yield cash flow projection (~3.5% p.a.)
 * - Cumulative capital gain & asset equity projection
 */

import { formatCurrencyINR, formatIndianCurrencyAbbr } from './utils/format.js';

export { formatCurrencyINR, formatIndianCurrencyAbbr };

export const DEFAULT_ANNUAL_APPRECIATION_RATE = 0.075; // 7.5% p.a. normal condition baseline
export const DEFAULT_RENTAL_YIELD_RATE = 0.035; // 3.5% gross annual rental yield

/**
 * Standard reducing-balance EMI calculation for home loans.
 * @param {number} principal - Loan principal in INR
 * @param {number} [annualRate=8.5] - Annual interest percentage
 * @param {number} [tenureYears=20] - Loan duration in years
 * @returns {{ monthlyEmi: number, totalPayment: number, totalInterest: number }}
 */
export function calculateEMI(principal, annualRate = 8.5, tenureYears = 20) {
  if (!principal || principal <= 0) return { monthlyEmi: 0, totalPayment: 0, totalInterest: 0 };
  const monthlyRate = (annualRate / 12) / 100;
  const totalMonths = tenureYears * 12;
  const factor = Math.pow(1 + monthlyRate, totalMonths);
  const monthlyEmi = Math.round((principal * monthlyRate * factor) / (factor - 1));
  const totalPayment = monthlyEmi * totalMonths;
  const totalInterest = totalPayment - principal;
  return { monthlyEmi, totalPayment, totalInterest };
}

/**
 * Calculates investment appreciation forecast under normal conditions.
 * Accepts numeric basePrice or a listing object.
 * @param {number|object} priceOrListing - Current purchase price in INR or listing object
 * @param {object} [options={}]
 * @param {number} [options.annualRate=0.075] - Annual appreciation rate (default 7.5% RBI HPI baseline)
 * @param {number} [options.rentalYield=0.035] - Annual gross rental yield (~3.5%)
 * @returns {object}
 */
export function calculateInvestmentForecast(priceOrListing, options = {}) {
  let price = 0;
  if (typeof priceOrListing === 'number') {
    price = priceOrListing > 0 ? priceOrListing : 0;
  } else if (priceOrListing && typeof priceOrListing === 'object') {
    if (priceOrListing.listingType === 'rent' || (priceOrListing.rent && !priceOrListing.price && !priceOrListing.salePrice)) {
      price = priceOrListing.rent ? Math.round(priceOrListing.rent * 280) : 0;
    } else {
      price = priceOrListing.price || priceOrListing.salePrice || (priceOrListing.rawPrice && priceOrListing.rawPrice >= 1000000 ? priceOrListing.rawPrice : 0);
    }
  }

  const rate = typeof options.annualRate === 'number' ? options.annualRate : DEFAULT_ANNUAL_APPRECIATION_RATE;
  const yieldRate = typeof options.rentalYield === 'number' ? options.rentalYield : DEFAULT_RENTAL_YIELD_RATE;

  if (price <= 0) {
    const emptyHorizon = {
      years: 0,
      projectedValue: 0,
      projectedValueFormatted: '₹ --',
      absoluteGain: 0,
      absoluteGainFormatted: '₹ --',
      percentageGain: '+0.0%',
      percentageGainFormatted: '0.0%'
    };
    return {
      isValid: false,
      basePrice: 0,
      basePriceFormatted: '₹ --',
      annualRatePct: (rate * 100).toFixed(1),
      rentalYieldPct: (yieldRate * 100).toFixed(1),
      horizons: {
        '3y': { ...emptyHorizon, years: 3 },
        '5y': { ...emptyHorizon, years: 5 },
        '10y': { ...emptyHorizon, years: 10 }
      },
      milestones: [],
      rentalYield: {
        estimatedMonthlyRent: 0,
        estimatedMonthlyRentFormatted: '₹ --',
        fiveYearCumulativeRent: 0,
        fiveYearCumulativeRentFormatted: '₹ --',
        fiveYearTotalWealthGain: 0,
        fiveYearTotalWealthGainFormatted: '₹ --'
      },
      fiveYearSummary: {
        projectedValue: 0,
        projectedFormatted: '₹ --',
        capitalGain: 0,
        gainFormatted: '₹ --',
        total5yRentalIncome: 0,
        total5yRentalFormatted: '₹ --',
        totalWealthGain: 0,
        totalWealthFormatted: '₹ --'
      }
    };
  }

  // Multi-year compound appreciation
  const val3y = Math.round(price * Math.pow(1 + rate, 3));
  const gain3y = val3y - price;
  const pct3y = ((gain3y / price) * 100).toFixed(1);

  const val5y = Math.round(price * Math.pow(1 + rate, 5));
  const gain5y = val5y - price;
  const pct5y = ((gain5y / price) * 100).toFixed(1);

  const val10y = Math.round(price * Math.pow(1 + rate, 10));
  const gain10y = val10y - price;
  const pct10y = ((gain10y / price) * 100).toFixed(1);

  // Rental yield projection
  const annualRentalIncome = Math.round(price * yieldRate);
  const monthlyRentalIncome = Math.round(annualRentalIncome / 12);
  const total5yRental = Math.round(annualRentalIncome * 5 * 0.85); // 15% maintenance allowance

  const total5yWealthGain = gain5y + total5yRental;

  const h3 = {
    years: 3,
    horizonLabel: '3 Years',
    projectedValue: val3y,
    projectedValueFormatted: formatIndianCurrencyAbbr(val3y),
    projectedFormatted: formatIndianCurrencyAbbr(val3y),
    absoluteGain: gain3y,
    absoluteGainFormatted: formatIndianCurrencyAbbr(gain3y),
    capitalGain: gain3y,
    gainFormatted: `+${formatIndianCurrencyAbbr(gain3y)}`,
    percentageGain: `+${pct3y}%`,
    percentageGainFormatted: `${pct3y}%`,
    percentGain: `+${pct3y}%`
  };

  const h5 = {
    years: 5,
    horizonLabel: '5 Years',
    projectedValue: val5y,
    projectedValueFormatted: formatIndianCurrencyAbbr(val5y),
    projectedFormatted: formatIndianCurrencyAbbr(val5y),
    absoluteGain: gain5y,
    absoluteGainFormatted: formatIndianCurrencyAbbr(gain5y),
    capitalGain: gain5y,
    gainFormatted: `+${formatIndianCurrencyAbbr(gain5y)}`,
    percentageGain: `+${pct5y}%`,
    percentageGainFormatted: `${pct5y}%`,
    percentGain: `+${pct5y}%`
  };

  const h10 = {
    years: 10,
    horizonLabel: '10 Years',
    projectedValue: val10y,
    projectedValueFormatted: formatIndianCurrencyAbbr(val10y),
    projectedFormatted: formatIndianCurrencyAbbr(val10y),
    absoluteGain: gain10y,
    absoluteGainFormatted: formatIndianCurrencyAbbr(gain10y),
    capitalGain: gain10y,
    gainFormatted: `+${formatIndianCurrencyAbbr(gain10y)}`,
    percentageGain: `+${pct10y}%`,
    percentageGainFormatted: `${pct10y}%`,
    percentGain: `+${pct10y}%`
  };

  return {
    isValid: true,
    basePrice: price,
    basePriceFormatted: formatIndianCurrencyAbbr(price),
    annualRatePct: (rate * 100).toFixed(1),
    rentalYieldPct: (yieldRate * 100).toFixed(1),
    monthlyRentalPotential: monthlyRentalIncome,
    monthlyRentalFormatted: formatIndianCurrencyAbbr(monthlyRentalIncome),
    horizons: {
      '3y': h3,
      '5y': h5,
      '10y': h10
    },
    milestones: [h3, h5, h10],
    rentalYield: {
      estimatedMonthlyRent: monthlyRentalIncome,
      estimatedMonthlyRentFormatted: formatIndianCurrencyAbbr(monthlyRentalIncome),
      fiveYearCumulativeRent: total5yRental,
      fiveYearCumulativeRentFormatted: formatIndianCurrencyAbbr(total5yRental),
      fiveYearTotalWealthGain: total5yWealthGain,
      fiveYearTotalWealthGainFormatted: formatIndianCurrencyAbbr(total5yWealthGain)
    },
    fiveYearSummary: {
      projectedValue: val5y,
      projectedFormatted: formatIndianCurrencyAbbr(val5y),
      capitalGain: gain5y,
      gainFormatted: `+${formatIndianCurrencyAbbr(gain5y)}`,
      total5yRentalIncome: total5yRental,
      total5yRentalFormatted: formatIndianCurrencyAbbr(total5yRental),
      totalWealthGain: total5yWealthGain,
      totalWealthFormatted: formatIndianCurrencyAbbr(total5yWealthGain)
    }
  };
}

