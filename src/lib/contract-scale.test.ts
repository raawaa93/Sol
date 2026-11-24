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

test('synthetic demo uses its explicit scalar contract scale', () => {
  assert.equal(getContractScaleIssue(demo), undefined);
});

test('documented Binance European cash-settled crypto uses exchange unit as contract scale', () => {
  assert.equal(getContractScaleIssue(binanceCrypto), undefined);
});

test('estimated or missing contract unit blocks per-contract calculations', () => {
  assert.equal(getContractScaleIssue({ ...binanceCrypto, estimatedFields: ['unit'] }), 'UNIT_UNVERIFIED');
  assert.equal(getContractScaleIssue({ ...binanceCrypto, unit: 0 }), 'UNIT_UNVERIFIED');
});

test('distinct contract multiplier blocks the scalar per-contract model', () => {
  assert.equal(getContractScaleIssue({ ...binanceCrypto, contractMultiplier: 1000 }), 'MULTIPLIER_MISMATCH');
  assert.match(getContractScaleIssueMessage('MULTIPLIER_MISMATCH'), /مقياس التسعير والتسليم غير ممثل/);
});

test('futures and commodity perpetual scale models remain blocked even with a unit', () => {
  assert.equal(getContractScaleIssue({
    venue: 'CME',
    assetClass: 'ENERGY',
    underlyingKind: 'FUTURE',
    exerciseStyle: 'EUROPEAN',
    settlementStyle: 'PHYSICAL',
    unit: 1,
    contractMultiplier: 1,
  }), 'UNSUPPORTED_CONTRACT_SCALE');
  assert.equal(getContractScaleIssue({
    venue: 'BINANCE',
    assetClass: 'METALS',
    underlyingKind: 'PERPETUAL',
    exerciseStyle: 'EUROPEAN',
    settlementStyle: 'CASH',
    unit: 1,
  }), 'UNSUPPORTED_CONTRACT_SCALE');
  assert.match(getContractScaleIssueMessage('UNSUPPORTED_CONTRACT_SCALE'), /نموذج مقياس هذا السوق/);
});

test('CSV scale values alone do not establish a supported market-specific deliverable model', () => {
  assert.equal(getContractScaleIssue({
    venue: 'CBOE',
    assetClass: 'EQUITY',
    underlyingKind: 'SPOT',
    exerciseStyle: 'AMERICAN',
    settlementStyle: 'PHYSICAL',
    unit: 100,
    contractMultiplier: 100,
  }), 'UNSUPPORTED_CONTRACT_SCALE');
});
