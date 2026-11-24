import assert from 'node:assert/strict';
import test from 'node:test';
import * as fc from 'fast-check';
import { parseOptionsCsv } from './csv.ts';
import { blackScholes } from './options.ts';
import type { OptionSide } from './types';

const valuationTime = Date.parse('2026-01-01T00:00:00.000Z');
const finiteDouble = (min: number, max: number) => fc.double({ min, max, noNaN: true, noDefaultInfinity: true });

test('generated valid CSV rows preserve contract inputs through normalization', () => {
  fc.assert(fc.property(
    fc.constantFrom('BTC', 'ETH', 'XAU', 'CL'),
    fc.constantFrom<OptionSide>('CALL', 'PUT'),
    finiteDouble(100, 100_000),
    finiteDouble(0.98, 1.02),
    fc.integer({ min: 30, max: 365 }),
    finiteDouble(0.3, 2),
    finiteDouble(0.1, 10),
    (underlying, type, spot, strikeRatio, days, iv, unit) => {
      const strike = spot * strikeRatio;
      const expiry = new Date(valuationTime + days * 86_400_000).toISOString();
      const timestamp = new Date(valuationTime).toISOString();
      const markPrice = blackScholes(spot, strike, days, iv, type).price;
      const row = [
        `SIM-${underlying}-${days}-${type}`,
        underlying,
        expiry,
        String(strike),
        type,
        String(markPrice),
        String(iv),
        String(spot),
        String(unit),
        timestamp,
      ].join(',');
      const result = parseOptionsCsv(
        `symbol,underlying,expiry,strike,type,markPrice,iv,spot,unit,timestamp\n${row}`,
        valuationTime,
      );

      assert.equal(result.quotes.length, 1, result.warnings.join(' '));
      const [quote] = result.quotes;
      assert.equal(quote.underlying, underlying);
      assert.equal(quote.type, type);
      assert.equal(quote.strike, strike);
      assert.equal(quote.spot, spot);
      assert.equal(quote.unit, unit);
      assert.equal(quote.daysToExpiry, days);
      assert.equal(quote.iv, iv);
      assert.equal(quote.markPrice, markPrice);
      assert.equal(quote.sourceTimestamp, timestamp);
    },
  ), { numRuns: 200, seed: 20261123 });
});
