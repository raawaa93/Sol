import assert from 'node:assert/strict';
import test from 'node:test';
import { blackScholes, getSpreadPct } from './options.ts';
import { parseOptionsCsv } from './csv.ts';

const header = 'symbol,underlying,expiry,strike,type,bid,ask,markPrice,iv,delta,gamma,theta,vega,openInterest,volume,spot,unit,timestamp';

test('CSV import reads a quote, percent-formatted IV and source timestamp', () => {
  const csv = [
    header,
    'BTC-261230-95000-C,BTC,2026-12-30T08:00:00Z,95000,CALL,2250,2320,2285,58%,0.52,0.00002,-22,48,1250,84,93420,1,2026-11-23T14:00:00Z',
  ].join('\n');
  const result = parseOptionsCsv(csv);

  assert.equal(result.quotes.length, 1);
  assert.equal(result.quotes[0].underlying, 'BTC');
  assert.equal(result.quotes[0].type, 'CALL');
  assert.equal(result.quotes[0].strike, 95_000);
  assert.ok(Math.abs(result.quotes[0].iv - 0.58) < 1e-8);
  assert.equal(result.quotes[0].bid, 2_250);
  assert.equal(result.sourceTimeRange?.timestampedRows, 1);
  assert.equal(result.sourceTimeRange?.totalRows, 1);
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

test('missing IV is solved from the observed market price and flagged as estimated', () => {
  const expiry = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const marketPrice = blackScholes(100, 100, 30, 0.4, 'CALL').price;
  const csv = [
    header,
    `sample,BTC,${expiry},100,CALL,${marketPrice * 0.99},${marketPrice * 1.01},, ,,,,,1,1,100,1,2026-11-23T14:00:00Z`,
  ].join('\n');
  const result = parseOptionsCsv(csv);
  assert.equal(result.quotes.length, 1);
  assert.ok(Math.abs(result.quotes[0].iv - 0.4) < 0.01);
  assert.ok(result.quotes[0].estimatedFields?.includes('iv'));
  assert.ok(result.warnings.some((warning) => warning.includes('استُنتج IV')));
});
