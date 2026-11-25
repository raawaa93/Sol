import assert from 'node:assert/strict';
import test from 'node:test';
import { mapBinanceCryptoOptionEconomics } from './binance-crypto-options-economics.ts';
import { calculatePremiumCash } from './contract-economics-calculations.ts';
import { validateContractEconomics } from './contract-economics.ts';

const base = {
  symbol: 'XRP-261225-2-C',
  underlyingType: 'CRYPTO',
  contractType: 'CRYPTO_OPTIONS',
  unit: 100,
  quoteAsset: 'USDT',
  settleAsset: 'USDT',
  serverTime: Date.UTC(2026, 10, 24),
};

test('Binance crypto adapter keeps premium and underlying delivery scales independent', () => {
  const economics = mapBinanceCryptoOptionEconomics(base);
  assert.ok(economics);
  assert.equal(economics.premium.multiplier, 1);
  assert.equal(economics.premium.priceUnit, 'PER_CONTRACT');
  assert.equal(economics.exercise.cashSettlement?.multiplier, 100);
  assert.equal(economics.exercise.cashSettlement?.reference, 'INDEX');
  assert.equal(economics.exercise.settlementCurrency, 'USDT');
  assert.equal(economics.provenance.status, 'PROVIDER_VERIFIED');
  assert.equal(economics.provenance.legalTerms?.scope, 'BINANCE_RIE_RCH');
  assert.equal(economics.provenance.legalTerms?.effectiveDate, '2026-01-05');
  assert.equal(economics.provenance.legalTerms?.accountApplicability, 'UNVERIFIED');
  assert.ok((economics.provenance.legalTerms?.contractSpecificationRef ?? '').includes('bin.bnbstatic.com'));
  assert.ok((economics.provenance.legalTerms?.clearingProceduresRef ?? '').includes('bin.bnbstatic.com'));
  assert.equal(validateContractEconomics(economics).adapterReady, true);
  const missingLegalTerms = structuredClone(economics);
  delete missingLegalTerms.provenance.legalTerms;
  const missingLegalValidation = validateContractEconomics(missingLegalTerms);
  assert.equal(missingLegalValidation.valid, true, 'the provider quote/premium fields remain valid');
  assert.equal(missingLegalValidation.adapterReady, false);
  assert.ok(missingLegalValidation.unsupportedReasons.includes('MISSING_LEGAL_TERMS_PROVENANCE'));
  const premiumOnly = calculatePremiumCash({ economics: missingLegalTerms, premiumPrice: 12, contracts: 3 });
  assert.equal(premiumOnly.ok, true, 'premium scale is independently sourced from exchangeInfo');
  const missingProductFields = structuredClone(economics);
  delete missingProductFields.provenance.rawFields;
  assert.equal(validateContractEconomics(missingProductFields).adapterReady, false);
  const wrongProductFamily = structuredClone(economics);
  wrongProductFamily.provenance.rawFields!.contractType = 'TRADFI_OPTIONS';
  assert.equal(validateContractEconomics(wrongProductFamily).adapterReady, false);

  const premium = calculatePremiumCash({ economics, premiumPrice: 12, contracts: 3 });
  assert.deepEqual(premium, {
    ok: true,
    value: { amount: 36, currency: 'USDT', premiumAmount: 36, fees: 0, contracts: 3, multiplier: 1 },
  });
});

test('Binance crypto adapter preserves unit 1 and 1000 without treating them as premium multipliers', () => {
  for (const unit of [1, 100, 1_000]) {
    const economics = mapBinanceCryptoOptionEconomics({ ...base, unit });
    assert.ok(economics);
    assert.equal(economics.premium.multiplier, 1);
    assert.equal(economics.exercise.cashSettlement?.multiplier, unit);
  }
});

test('Binance crypto adapter rejects inferred product family and incomplete source terms', () => {
  assert.equal(mapBinanceCryptoOptionEconomics({ ...base, underlyingType: '' }), null);
  assert.equal(mapBinanceCryptoOptionEconomics({ ...base, contractType: 'TRADFI_OPTIONS' }), null);
  assert.equal(mapBinanceCryptoOptionEconomics({ ...base, unit: 0 }), null);
  assert.equal(mapBinanceCryptoOptionEconomics({ ...base, settleAsset: '' }), null);
  assert.equal(mapBinanceCryptoOptionEconomics({ ...base, quoteAsset: 'usdt' }), null);
  assert.equal(mapBinanceCryptoOptionEconomics({ ...base, quoteAsset: 'USDT', settleAsset: 'USDC' }), null);
});
