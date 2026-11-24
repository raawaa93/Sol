import assert from 'node:assert/strict';
import test from 'node:test';
import { getContractScaleIssue, getContractScaleIssueMessage } from './contract-scale.ts';

test('explicit unit and matching multiplier are internally consistent', () => {
  assert.equal(getContractScaleIssue({ unit: 100, contractMultiplier: 100 }), undefined);
});

test('contract scale falls back to explicit unit when no separate multiplier is published', () => {
  assert.equal(getContractScaleIssue({ unit: 1 }), undefined);
});

test('estimated or missing contract unit blocks per-contract calculations', () => {
  assert.equal(getContractScaleIssue({ unit: 1, estimatedFields: ['unit'] }), 'UNIT_UNVERIFIED');
  assert.equal(getContractScaleIssue({ unit: 0 }), 'UNIT_UNVERIFIED');
});

test('distinct contract multiplier blocks the scalar per-contract model', () => {
  assert.equal(getContractScaleIssue({ unit: 1, contractMultiplier: 1000 }), 'MULTIPLIER_MISMATCH');
  assert.match(getContractScaleIssueMessage('MULTIPLIER_MISMATCH'), /مقياس التسعير والتسليم غير ممثل/);
});
