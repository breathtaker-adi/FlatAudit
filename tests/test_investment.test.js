import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateInvestmentForecast,
  formatIndianCurrencyAbbr,
  DEFAULT_ANNUAL_APPRECIATION_RATE
} from '../extension/lib/investment.js';

describe('Investment Appreciation & Capital Growth Forecast Engine', () => {
  it('formats Indian currency abbreviations cleanly', () => {
    assert.equal(formatIndianCurrencyAbbr(12500000), '₹ 1.25 Cr');
    assert.equal(formatIndianCurrencyAbbr(8500000), '₹ 85 L');
    assert.equal(formatIndianCurrencyAbbr(42000), '₹ 42,000');
    assert.equal(formatIndianCurrencyAbbr(0), '₹ --');
    assert.equal(formatIndianCurrencyAbbr(null), '₹ --');
  });

  it('calculates 3y, 5y, and 10y appreciation milestones for ₹1.25 Cr property', () => {
    const forecast = calculateInvestmentForecast(12500000, { annualRate: 0.075 });
    assert.equal(forecast.isValid, true);
    assert.equal(forecast.basePriceFormatted, '₹ 1.25 Cr');
    assert.equal(forecast.annualRatePct, '7.5');
    assert.equal(forecast.milestones.length, 3);

    // 3 Year: 1.25 * (1.075)^3 ≈ 1.5528 Cr (+24.2%)
    const m3 = forecast.milestones[0];
    assert.equal(m3.years, 3);
    assert.ok(m3.projectedValue > 15400000 && m3.projectedValue < 15600000);
    assert.ok(m3.percentGain.includes('+24.2%'));

    // 5 Year: 1.25 * (1.075)^5 ≈ 1.7945 Cr (+43.6%)
    const m5 = forecast.milestones[1];
    assert.equal(m5.years, 5);
    assert.ok(m5.projectedValue > 17800000 && m5.projectedValue < 18100000);
    assert.ok(m5.percentGain.includes('+43.6%'));

    // 10 Year: 1.25 * (1.075)^10 ≈ 2.576 Cr (+106.1%)
    const m10 = forecast.milestones[2];
    assert.equal(m10.years, 10);
    assert.ok(m10.projectedValue > 25500000 && m10.projectedValue < 26000000);
    assert.ok(m10.percentGain.includes('+106.1%'));
  });

  it('calculates rental yield cash flow accurately', () => {
    const forecast = calculateInvestmentForecast(10000000, { rentalYield: 0.036 }); // 1 Cr @ 3.6%
    assert.equal(forecast.monthlyRentalPotential, 30000); // 30,000 / month
    assert.equal(forecast.monthlyRentalFormatted, '₹ 30,000');
  });

  it('handles zero or negative price safely without throwing', () => {
    const forecast = calculateInvestmentForecast(0);
    assert.equal(forecast.isValid, false);
    assert.equal(forecast.milestones.length, 0);
  });
});

