import assert from 'node:assert/strict';
import test from 'node:test';
import { validateContractEconomics } from './contract-economics.ts';
import { parseContractEconomicsCsvV2, serializeContractEconomicsCsvV2 } from './contract-economics-csv.ts';
import type { ContractEconomics } from './types.ts';

const providerEconomics: ContractEconomics = {
  premium: { multiplier: 100, quoteCurrency: 'USD', priceUnit: 'PER_UNDERLYING_UNIT' },
  exercise: {
    style: 'AMERICAN',
    settlement: 'PHYSICAL',
    settlementCurrency: 'USD',
    aggregateExerciseCash: { basis: 'STRIKE_MULTIPLIER', currency: 'USD', multiplier: 100 },
    deliverables: [
      { type: 'EQUITY', symbol: 'NVDA', amount: 10, currency: 'USD' },
      { type: 'CASH', currency: 'USD', amount: 25 },
    ],
  },
  provenance: {
    status: 'PROVIDER_VERIFIED',
    provider: 'REFERENCE_FIXTURE',
    sourceRef: 'fixture://adjusted-equity-contract',
    retrievedAt: '2026-11-24T09:00:00.000Z',
  },
};

test('CSV v2 round-trips premium, exercise cash and adjusted multi-component deliverables', () => {
  const fields = serializeContractEconomicsCsvV2(providerEconomics);
  const parsed = parseContractEconomicsCsvV2(fields);
  assert.ok(parsed.economics, parsed.warning);
  assert.deepEqual(parsed.economics?.premium, providerEconomics.premium);
  assert.deepEqual(parsed.economics?.exercise, providerEconomics.exercise);
  assert.equal(parsed.economics?.provenance.status, 'USER_ASSERTED');
  assert.equal(parsed.economics?.provenance.provider, undefined);
  assert.equal(parsed.economics?.provenance.rawFields?.claimedEconomicsSourceStatus, 'PROVIDER_VERIFIED');
  const validation = validateContractEconomics(parsed.economics);
  assert.equal(validation.valid, true);
  assert.equal(validation.adapterReady, false);
  assert.ok(validation.unsupportedReasons.includes('USER_ASSERTED_PROVENANCE'));
});

test('CSV v2 preserves fixed aggregate exercise cash independently of premium multiplier', () => {
  const economics: ContractEconomics = {
    ...providerEconomics,
    exercise: {
      ...providerEconomics.exercise,
      aggregateExerciseCash: { basis: 'FIXED', currency: 'USD', amount: 125 },
    },
  };
  const parsed = parseContractEconomicsCsvV2(serializeContractEconomicsCsvV2(economics));
  assert.ok(parsed.economics, parsed.warning);
  assert.deepEqual(parsed.economics?.exercise.aggregateExerciseCash, { basis: 'FIXED', currency: 'USD', amount: 125 });
  assert.equal(parsed.economics?.premium.multiplier, 100);
});

test('CSV v2 rejects malformed JSON and incomplete canonical records', () => {
  const fields = serializeContractEconomicsCsvV2(providerEconomics);
  assert.match(parseContractEconomicsCsvV2({ ...fields, deliverablesJson: '{broken' }).warning ?? '', /Invalid deliverablesJson/);
  assert.match(parseContractEconomicsCsvV2({ contractEconomicsVersion: '2', premiumMultiplier: '100' }).warning ?? '', /missing required/);
});

test('CSV v2 does not accept a claimed provider provenance as verified provenance', () => {
  const fields = serializeContractEconomicsCsvV2(providerEconomics);
  fields.economicsSourceStatus = 'PROVIDER_VERIFIED';
  fields.economicsSourceProvider = 'BINANCE';
  fields.economicsSourceRef = '/some/endpoint';
  const parsed = parseContractEconomicsCsvV2(fields);
  assert.ok(parsed.economics, parsed.warning);
  assert.equal(parsed.economics?.provenance.status, 'USER_ASSERTED');
  assert.equal(parsed.economics?.provenance.provider, undefined);
});
