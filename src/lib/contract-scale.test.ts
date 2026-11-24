import assert from 'node:assert/strict';
import test from 'node:test';
import { getContractScaleIssue, getContractScaleIssueMessage } from './contract-scale.ts';

const demo = { venue: 'DEMO', unit: 1, contractMultiplier: 1 };
const binanceCrypto = {
  venue: 'BINANCE',
  assetClass: 'CRYPTO',
  underlyingKind: 'SPOT',
  exerciseStyle: 'EUROPEAN',
  settlementStyle: 'CASH',
  unit: 1,
} as const;

test('synthetic Demo scale is trusted only in Demo mode', () => {
  assert.equal(getContractScaleIssue(demo, 'DEMO'), undefined);
  assert.equal(getContractScaleIssue(demo, 'CSV'), 'UNSUPPORTED_CONTRACT_SCALE');
});

test('documented Binance European cash-settled crypto uses exchange unit in Binance mode', () => {
  assert.equal(getContractScaleIssue(binanceCrypto, 'BINANCE'), undefined);
  assert.equal(getContractScaleIssue({ ...binanceCrypto, venue: 'OTHER' }, 'BINANCE'), 'UNSUPPORTED_CONTRACT_SCALE');
});

test('CSV crypto requires a named non-Demo venue and explicit matching multiplier', () => {
  assert.equal(getContractScaleIssue({ ...binanceCrypto, contractMultiplier: 1 }, 'CSV'), undefined);
  assert.equal(getContractScaleIssue({ ...binanceCrypto, contractMultiplier: 1, venue: 'DEMO' }, 'CSV'), 'UNSUPPORTED_CONTRACT_SCALE');
  assert.equal(getContractScaleIssue(binanceCrypto, 'CSV'), 'UNSUPPORTED_CONTRACT_SCALE');
});

test('estimated or missing contract unit blocks per-contract calculations', () => {
  assert.equal(getContractScaleIssue({ ...binanceCrypto, estimatedFields: ['unit'] }, 'BINANCE'), 'UNIT_UNVERIFIED');
  assert.equal(getContractScaleIssue({ ...binanceCrypto, unit: 0 }, 'BINANCE'), 'UNIT_UNVERIFIED');
});

test('distinct contract multiplier blocks the scalar per-contract model', () => {
  assert.equal(getContractScaleIssue({ ...binanceCrypto, contractMultiplier: 1000 }, 'BINANCE'), 'MULTIPLIER_MISMATCH');
  assert.match(getContractScaleIssueMessage('MULTIPLIER_MISMATCH'), /مقياس التسعير والتسليم غير ممثل/);
});

test('futures and commodity perpetual scale models remain blocked even with matching units', () => {
  assert.equal(getContractScaleIssue({
    venue: 'CME',
    assetClass: 'ENERGY',
    underlyingKind: 'FUTURE',
    exerciseStyle: 'EUROPEAN',
    settlementStyle: 'PHYSICAL',
    unit: 1,
    contractMultiplier: 1,
  }, 'CSV'), 'UNSUPPORTED_CONTRACT_SCALE');
  assert.equal(getContractScaleIssue({
    venue: 'BINANCE',
    assetClass: 'METALS',
    underlyingKind: 'PERPETUAL',
    exerciseStyle: 'EUROPEAN',
    settlementStyle: 'CASH',
    unit: 1,
  }, 'BINANCE'), 'UNSUPPORTED_CONTRACT_SCALE');
  assert.match(getContractScaleIssueMessage('UNSUPPORTED_CONTRACT_SCALE'), /نموذج مقياس هذا السوق/);
});

test('CSV scale values alone do not establish a supported American equity deliverable model', () => {
  assert.equal(getContractScaleIssue({
    venue: 'CBOE',
    assetClass: 'EQUITY',
    underlyingKind: 'SPOT',
    exerciseStyle: 'AMERICAN',
    settlementStyle: 'PHYSICAL',
    unit: 100,
    contractMultiplier: 100,
  }, 'CSV'), 'UNSUPPORTED_CONTRACT_SCALE');
});
