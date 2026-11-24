import assert from 'node:assert/strict';
import test from 'node:test';
import { blackScholes, getSpreadPct } from './options.ts';
import { escapeCsvCell, MAX_CSV_FILE_BYTES, parseOptionsCsv } from './csv.ts';

const header = 'symbol,underlying,expiry,strike,type,bid,ask,markPrice,iv,delta,gamma,theta,vega,openInterest,volume,spot,unit,timestamp';

test('CSV export escapes cells and neutralizes spreadsheet formula prefixes', () => {
  assert.equal(escapeCsvCell('=1+1'), "\"'=1+1\"");
  assert.equal(escapeCsvCell('  @SUM(A1)'), "\"'  @SUM(A1)\"");
  assert.equal(escapeCsvCell('a,\"b\"'), '\"a,\"\"b\"\"\"');
  assert.equal(escapeCsvCell(-1), '\"-1\"');
});

test('CSV parser rejects oversized text before splitting it into rows', () => {
  const result = parseOptionsCsv('x'.repeat(MAX_CSV_FILE_BYTES + 1));
  assert.equal(result.quotes.length, 0);
  assert.ok(result.warnings.some((warning) => warning.includes('5 MiB')));
});

test('CSV import reads a quote, percent-formatted IV and source timestamp', () => {
  const csv = [
    header,
    'BTC-261230-95000-C,BTC,2026-12-30T08:00:00Z,95000,CALL,2250,2320,2285,58%,0.52,0.00002,-22,48,1250,84,93420,1,2026-11-23T14:00:00Z',
  ].join('\n');
  const result = parseOptionsCsv(csv);

  assert.equal(result.quotes.length, 1);
  assert.equal(result.quotes[0].underlying, 'BTC');
  assert.equal(result.quotes[0].pricingStatus, 'OBSERVED_ONLY');
  assert.equal(result.quotes[0].pricingModel, undefined);
  assert.equal(result.quotes[0].type, 'CALL');
  assert.equal(result.quotes[0].strike, 95_000);
  assert.ok(Math.abs(result.quotes[0].iv - 0.58) < 1e-8);
  assert.equal(result.quotes[0].bid, 2_250);
  assert.ok(result.quotes[0].estimatedFields?.includes('rho'));
  assert.equal(result.sourceTimeRange?.timestampedRows, 1);
  assert.equal(result.sourceTimeRange?.totalRows, 1);
});

test('CSV accepts an explicit Rho per one rate percentage-point and preserves its source status', () => {
  const csv = [
    'symbol,underlying,expiry,strike,type,bid,ask,markPrice,iv,delta,gamma,theta,vega,rho,openInterest,volume,spot,unit,timestamp',
    'BTC-261230-95000-C,BTC,2026-12-30T08:00:00Z,95000,CALL,2250,2320,2285,58%,0.52,0.00002,-22,48,1.25,1250,84,93420,1,2026-11-23T14:00:00Z',
  ].join('\n');
  const result = parseOptionsCsv(csv);

  assert.equal(result.quotes.length, 1);
  assert.equal(result.quotes[0].rho, 1.25);
  assert.ok(!result.quotes[0].estimatedFields?.includes('rho'));
});

test('CSV keeps explicit USD open interest and quote-asset turnover separate from contract counts', () => {
  const csv = [
    'symbol,underlying,expiry,strike,type,bid,ask,markPrice,iv,openInterest,openInterestUsd,volume,volumeQuote,spot,unit,timestamp',
    'BTC-261230-95000-C,BTC,2026-12-30T08:00:00Z,95000,CALL,2250,2320,2285,58%,4,372000,3,6750,93000,1,2026-11-23T14:00:00Z',
  ].join('\n');
  const result = parseOptionsCsv(csv, Date.parse('2026-11-23T15:00:00Z'));

  assert.equal(result.quotes.length, 1);
  assert.equal(result.quotes[0].openInterest, 4);
  assert.equal(result.quotes[0].openInterestUsd, 372_000);
  assert.equal(result.quotes[0].volume, 3);
  assert.equal(result.quotes[0].volumeQuote, 6_750);
});

test('malformed rows are ignored and missing spot does not fall back to demo data', () => {
  const csv = [
    header,
    'not-an-option,UNKNOWN,,,,,,,,,,,,,,,,',
    'BTC-261230-95000-C,BTC,2026-12-30T08:00:00Z,95000,CALL,2250,2320,2285,58%,,,,,,,,1,2026-11-23T14:00:00Z',
  ].join('\n');
  const result = parseOptionsCsv(csv);
  assert.equal(result.quotes.length, 0);
  assert.ok(result.warnings.some((warning) => warning.includes('السعر المرجعي')));
});

test('missing bid or ask remains unknown; no artificial tight spread is created', () => {
  const csv = [
    header,
    'BTC-261230-95000-C,BTC,2026-12-30T08:00:00Z,95000,CALL,2250,,2285,58%,,,,,1250,84,93420,1,2026-11-23T14:00:00Z',
  ].join('\n');
  const result = parseOptionsCsv(csv);
  assert.equal(result.quotes.length, 1);
  assert.equal(result.quotes[0].ask, 0);
  assert.ok(Number.isNaN(getSpreadPct(result.quotes[0])));
  assert.ok(result.warnings.some((warning) => warning.includes('الفارق غير متاح')));
});

test('semicolon-delimited files support decimal commas', () => {
  const csv = [
    'symbol;underlying;expiry;strike;type;bid;ask;markPrice;iv;delta;gamma;theta;vega;openInterest;volume;spot;unit;timestamp',
    'sample;BTC;2026-12-30T08:00:00Z;95000;CALL;2250,5;2320,5;2285,5;58%;0,52;0,00002;-22;48;1250;84;93420,5;1;2026-11-23T14:00:00Z',
  ].join('\n');
  const result = parseOptionsCsv(csv);
  assert.equal(result.quotes.length, 1);
  assert.equal(result.quotes[0].spot, 93_420.5);
  assert.equal(result.quotes[0].bid, 2_250.5);
  assert.ok(Math.abs(result.quotes[0].delta - 0.52) < 1e-8);
});

test('duplicate contract symbols get stable unique row ids and a quality warning', () => {
  const row = 'BTC-261230-95000-C,BTC,2026-12-30T08:00:00Z,95000,CALL,2250,2320,2285,58%,0.52,0.00002,-22,48,1250,84,93420,1,2026-11-23T14:00:00Z';
  const result = parseOptionsCsv([header, row, row].join('\n'));
  assert.equal(result.quotes.length, 2);
  assert.equal(result.quotes[0].id, 'BTC-261230-95000-C');
  assert.equal(result.quotes[1].id, 'BTC-261230-95000-C#2');
  assert.equal(result.quotes[1].symbol, result.quotes[0].symbol);
  assert.ok(result.warnings.some((warning) => warning.includes('تكرر رمز العقد')));
});

test('missing IV is solved only when explicit European spot contract mechanics are supplied', () => {
  const expiry = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const marketPrice = blackScholes(100, 100, 30, 0.4, 'CALL').price;
  const csv = [
    'symbol,underlying,expiry,strike,type,bid,ask,markPrice,iv,delta,gamma,theta,vega,openInterest,volume,spot,unit,timestamp,assetClass,venue,underlyingKind,exerciseStyle,settlementStyle,carryYield,riskFreeRate',
    'sample,BTC,' + expiry + ',100,CALL,' + (marketPrice * 0.99) + ',' + (marketPrice * 1.01) + ',,,,,,,1,1,100,1,2026-11-23T14:00:00Z,CRYPTO,BINANCE,SPOT,EUROPEAN,CASH,0%,0%',
  ].join('\n');
  const result = parseOptionsCsv(csv);
  assert.equal(result.quotes.length, 1);
  assert.ok(Math.abs(result.quotes[0].iv - 0.4) < 0.01);
  assert.ok(result.quotes[0].estimatedFields?.includes('iv'));
  assert.equal(result.quotes[0].pricingStatus, 'SUPPORTED');
  assert.equal(result.quotes[0].pricingModel, 'BLACK_SCHOLES_CARRY');
  assert.ok(result.warnings.some((warning) => warning.includes('استُنتج IV')));
});

test('CSV without explicit contract mechanics does not infer IV or Greeks from a generic Black-Scholes fallback', () => {
  const expiry = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const marketPrice = blackScholes(100, 100, 30, 0.4, 'CALL').price;
  const csv = [
    header,
    'sample,BTC,' + expiry + ',100,CALL,' + (marketPrice * 0.99) + ',' + (marketPrice * 1.01) + ',, ,,,,,1,1,100,1,2026-11-23T14:00:00Z',
  ].join('\n');
  const result = parseOptionsCsv(csv);
  assert.equal(result.quotes.length, 0);
  assert.ok(result.warnings.some((warning) => warning.includes('لا يوجد IV مرصود')));
});

test('CSV preserves explicit asset class and venue for traditional listed options', () => {
  const csv = [
    'symbol,underlying,expiry,strike,type,bid,ask,markPrice,iv,spot,unit,timestamp,assetClass,venue,quoteAsset,settlementAsset,contractMultiplier,exerciseStyle,settlementStyle',
    'SPY-261230-700-C,SPY,2026-12-30T08:00:00Z,700,CALL,5.1,5.3,5.2,22%,690,100,2026-11-24T02:00:00Z,EQUITY,CBOE,USD,USD,100,AMERICAN,PHYSICAL',
  ].join('\n');
  const result = parseOptionsCsv(csv);

  assert.equal(result.quotes.length, 1);
  assert.equal(result.quotes[0].assetClass, 'EQUITY');
  assert.equal(result.quotes[0].venue, 'CBOE');
  assert.equal(result.quotes[0].quoteAsset, 'USD');
  assert.equal(result.quotes[0].settlementAsset, 'USD');
  assert.equal(result.quotes[0].contractMultiplier, 100);
  assert.equal(result.quotes[0].exerciseStyle, 'AMERICAN');
  assert.equal(result.quotes[0].settlementStyle, 'PHYSICAL');
});

test('CSV never substitutes contractMultiplier for the underlying unit and rejects mismatched scalar mechanics', () => {
  const expiry = new Date(Date.now() + 45 * 86_400_000).toISOString();
  const header = 'symbol,underlying,expiry,strike,type,bid,ask,markPrice,iv,spot,unit,timestamp,assetClass,venue,contractMultiplier';
  const missingUnit = 'SPY-MISSING-UNIT,SPY,' + expiry + ',100,CALL,2,2.2,2.1,25%,100,,2026-11-24T02:00:00Z,EQUITY,CBOE,100';
  const mismatched = 'SPY-MISMATCH,SPY,' + expiry + ',100,CALL,2,2.2,2.1,25%,100,100,2026-11-24T02:00:00Z,EQUITY,CBOE,50';
  const result = parseOptionsCsv([header, missingUnit, mismatched].join('\n'));

  assert.equal(result.quotes.length, 2);
  assert.equal(result.quotes[0].unit, 1);
  assert.equal(result.quotes[0].contractMultiplier, 100);
  assert.ok(result.quotes[0].estimatedFields?.includes('unit'));
  assert.equal(result.quotes[1].unit, 100);
  assert.equal(result.quotes[1].contractMultiplier, 50);
  assert.ok(result.warnings.some((warning) => warning.includes('contractMultiplier ليس بديلاً عن unit')));
  assert.ok(result.warnings.some((warning) => warning.includes('contractMultiplier يختلف عن unit')));
});

test('CSV generic multiplier field is not interpreted as underlying contract unit', () => {
  const expiry = new Date(Date.now() + 45 * 86_400_000).toISOString();
  const csv = [
    'symbol,underlying,expiry,strike,type,bid,ask,markPrice,iv,spot,multiplier,timestamp,assetClass',
    'SPY-MULTIPLIER,SPY,' + expiry + ',100,CALL,2,2.2,2.1,25%,100,100,2026-11-24T02:00:00Z,EQUITY',
  ].join('\n');
  const result = parseOptionsCsv(csv);

  assert.equal(result.quotes.length, 1);
  assert.equal(result.quotes[0].unit, 1);
  assert.equal(result.quotes[0].contractMultiplier, 100);
  assert.ok(result.quotes[0].estimatedFields?.includes('unit'));
  assert.ok(result.warnings.some((warning) => warning.includes('contractMultiplier ليس بديلاً عن unit')));
});

test('CSV preserves perpetual underlying mechanics without converting them to spot or futures', () => {
  const csv = [
    'symbol,underlying,expiry,strike,type,bid,ask,markPrice,iv,spot,unit,timestamp,assetClass,underlyingKind',
    'XAU-261230-4000-C,XAU,2026-12-30T08:00:00Z,4000,CALL,12,13,12.5,18%,3980,1,2026-11-24T02:00:00Z,METALS,PERPETUAL',
  ].join('\n');
  const result = parseOptionsCsv(csv);
  assert.equal(result.quotes.length, 1, JSON.stringify(result.warnings));
  assert.equal(result.quotes[0].underlyingKind, 'PERPETUAL');
  assert.equal(result.quotes[0].pricingStatus, 'OBSERVED_ONLY');
  assert.equal(result.quotes[0].pricingModel, undefined);
  assert.ok(result.quotes[0].pricingReason?.toLowerCase().includes('perpetual'));
});

test('CSV symbols and underlying codes support commodities and other multi-asset contracts', () => {
  const csv = [
    header,
    'XAU-261230-4000-P,XAU,2026-12-30T08:00:00Z,4000,PUT,50,52,51,45%,,,,,,,4100,1,2026-12-01T08:00:00Z',
  ].join('\n');
  const result = parseOptionsCsv(csv, Date.parse('2027-02-01T00:00:00Z'));

  assert.equal(result.quotes.length, 1);
  assert.equal(result.quotes[0].underlying, 'XAU');
  assert.equal(result.quotes[0].type, 'PUT');
  assert.equal(result.quotes[0].strike, 4000);
  assert.equal(result.quotes[0].daysToExpiry, 29);
  assert.ok(!result.quotes[0].estimatedFields?.includes('daysToExpiry'));
});

test('CSV time to expiry is valued at the row source timestamp for historical data', () => {
  const csv = [
    header,
    'BTC-261230-100-C,BTC,2026-12-30T08:00:00Z,100,CALL,4.9,5.1,5,40%,,,,,1,1,100,1,2026-12-01T08:00:00Z',
  ].join('\n');
  const result = parseOptionsCsv(csv, Date.parse('2027-02-01T00:00:00Z'));

  assert.equal(result.quotes.length, 1);
  assert.equal(result.quotes[0].daysToExpiry, 29);
  assert.ok(!result.quotes[0].estimatedFields?.includes('daysToExpiry'));
});

test('CSV without a source timestamp flags time to expiry as approximate', () => {
  const csv = [
    header,
    'BTC-261230-100-C,BTC,2026-12-30T08:00:00Z,100,CALL,4.9,5.1,5,40%,,,,,1,1,100,1,',
  ].join('\n');
  const referenceTime = Date.parse('2026-12-01T08:00:00Z');
  const result = parseOptionsCsv(csv, referenceTime);

  assert.equal(result.quotes.length, 1);
  assert.equal(result.quotes[0].daysToExpiry, 29);
  assert.ok(result.quotes[0].estimatedFields?.includes('daysToExpiry'));
  assert.ok(result.warnings.some((warning) => warning.includes('وقت الاستيراد')));
});

test('CSV routes explicit European futures options to Black-76 using the forward price', () => {
  const csv = [
    'symbol,underlying,expiry,strike,type,bid,ask,markPrice,iv,spot,unit,timestamp,assetClass,venue,underlyingKind,forward,riskFreeRate,exerciseStyle,settlementStyle,quoteAsset,settlementAsset,contractMultiplier',
    'CL-261230-70-C,CL,2026-12-30T08:00:00Z,70,CALL,2.0,2.2,2.1,20%,68.5,1,2026-11-24T02:00:00Z,ENERGY,CME,FUTURE,69,3%,EUROPEAN,PHYSICAL,USD,USD,1000',
  ].join('\n');
  const result = parseOptionsCsv(csv);
  assert.equal(result.quotes.length, 1, JSON.stringify(result.warnings));
  assert.equal(result.quotes[0].pricingStatus, 'SUPPORTED');
  assert.equal(result.quotes[0].pricingModel, 'BLACK_76');
  assert.equal(result.quotes[0].forward, 69);
  assert.ok(result.quotes[0].delta > 0 && result.quotes[0].delta < 1);
});

test('CSV does not apply a spot model to American equity options without a validated model', () => {
  const csv = [
    'symbol,underlying,expiry,strike,type,bid,ask,markPrice,iv,spot,unit,timestamp,assetClass,venue,underlyingKind,exerciseStyle,settlementStyle',
    'SPY-261230-700-C,SPY,2026-12-30T08:00:00Z,700,CALL,5.1,5.3,5.2,22%,690,100,2026-11-24T02:00:00Z,EQUITY,CBOE,SPOT,AMERICAN,PHYSICAL',
  ].join('\n');
  const result = parseOptionsCsv(csv);
  assert.equal(result.quotes.length, 1, JSON.stringify(result.warnings));
  assert.equal(result.quotes[0].pricingStatus, 'OBSERVED_ONLY');
  assert.equal(result.quotes[0].pricingModel, undefined);
  assert.ok(result.quotes[0].pricingReason?.includes('European'));
});
