import assert from 'node:assert/strict';
import test from 'node:test';
import * as fc from 'fast-check';
import { blackScholes, getExpiryPnl, impliedVolatility } from './options.ts';
import type { OptionQuote, OptionSide } from './types';

const finiteDouble = (min: number, max: number) => fc.double({ min, max, noNaN: true, noDefaultInfinity: true });
const propertyConfig = { numRuns: 250, seed: 20261123 };

const sideArbitrary = fc.constantFrom<OptionSide>('CALL', 'PUT');

test('generated Black–Scholes prices and Greeks stay within European no-arbitrage bounds', () => {
  fc.assert(fc.property(
    finiteDouble(20, 100_000),
    finiteDouble(0.75, 1.25),
    fc.integer({ min: 1, max: 1_825 }),
    finiteDouble(0.05, 2.5),
    finiteDouble(-0.05, 0.15),
    (spot, strikeRatio, days, volatility, rate) => {
      const strike = spot * strikeRatio;
      const years = days / 365;
      const discountedStrike = strike * Math.exp(-rate * years);
      const scale = Math.max(1, spot, discountedStrike);
      const tolerance = scale * 1e-10;
      const call = blackScholes(spot, strike, days, volatility, 'CALL', rate);
      const put = blackScholes(spot, strike, days, volatility, 'PUT', rate);

      for (const value of [call, put]) {
        assert.ok(Number.isFinite(value.price));
        assert.ok(Number.isFinite(value.delta));
        assert.ok(Number.isFinite(value.gamma));
        assert.ok(Number.isFinite(value.thetaPerDay));
        assert.ok(Number.isFinite(value.vegaPerVolPoint));
        assert.ok(Number.isFinite(value.rhoPerRatePoint));
        assert.ok(value.price >= -tolerance);
        assert.ok(value.gamma >= 0);
        assert.ok(value.vegaPerVolPoint >= 0);
      }
      assert.ok(call.price + tolerance >= Math.max(spot - discountedStrike, 0));
      assert.ok(call.price <= spot + tolerance);
      assert.ok(put.price + tolerance >= Math.max(discountedStrike - spot, 0));
      assert.ok(put.price <= discountedStrike + tolerance);
      assert.ok(call.delta >= -1e-7 && call.delta <= 1 + 1e-7);
      assert.ok(put.delta >= -1 - 1e-7 && put.delta <= 1e-7);
      assert.ok(call.rhoPerRatePoint >= -1e-10);
      assert.ok(put.rhoPerRatePoint <= 1e-10);
      assert.ok(Math.abs(call.price - put.price - (spot - discountedStrike)) <= tolerance);
    },
  ), propertyConfig);
});

test('generated market prices round-trip through the implied-volatility solver', () => {
  fc.assert(fc.property(
    finiteDouble(100, 50_000),
    finiteDouble(0.98, 1.02),
    fc.integer({ min: 30, max: 730 }),
    finiteDouble(0.3, 2.5),
    finiteDouble(-0.05, 0.12),
    sideArbitrary,
    (spot, strikeRatio, days, volatility, rate, type) => {
      const strike = spot * strikeRatio;
      const marketPrice = blackScholes(spot, strike, days, volatility, type, rate).price;
      const solved = impliedVolatility(marketPrice, spot, strike, days, type, rate);

      assert.ok(solved !== undefined && Number.isFinite(solved));
      assert.ok(Math.abs((solved ?? 0) - volatility) < 2e-5);
    },
  ), propertyConfig);
});

test('generated long-option expiry P&L respects capped loss and directional payoff', () => {
  fc.assert(fc.property(
    sideArbitrary,
    finiteDouble(1, 100_000),
    finiteDouble(0.5, 2),
    finiteDouble(0.01, 500),
    finiteDouble(0.01, 25),
    finiteDouble(0.01, 10),
    finiteDouble(0, 100),
    (type, strike, spotRatio, premium, quantity, unit, fees) => {
      const quote: OptionQuote = {
        id: `property-${type}`,
        symbol: `PROPERTY-${type}`,
        underlying: 'BTC',
        expiry: '2026-12-30T08:00:00.000Z',
        daysToExpiry: 30,
        strike,
        type,
        bid: premium,
        ask: premium,
        markPrice: premium,
        iv: 0.5,
        delta: type === 'CALL' ? 0.5 : -0.5,
        gamma: 0,
        theta: 0,
        vega: 0,
        rho: 0,
        openInterest: null,
        volume: null,
        spot: strike,
        unit,
      };
      const lowerSpot = strike * spotRatio;
      const upperSpot = lowerSpot + strike * 0.25;
      const lowerPnl = getExpiryPnl(quote, lowerSpot, premium, quantity, fees);
      const upperPnl = getExpiryPnl(quote, upperSpot, premium, quantity, fees);
      const maximumPremiumLoss = premium * quantity * unit + fees;

      assert.ok(lowerPnl >= -maximumPremiumLoss - 1e-8);
      assert.ok(upperPnl >= -maximumPremiumLoss - 1e-8);
      if (type === 'CALL') assert.ok(upperPnl >= lowerPnl);
      else assert.ok(upperPnl <= lowerPnl);
    },
  ), propertyConfig);
});
