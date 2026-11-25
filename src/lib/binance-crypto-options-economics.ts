import type { ContractEconomics } from './types.ts';
import { BINANCE_CRYPTO_OPTIONS_LEGAL_TERMS, validateContractEconomics } from './contract-economics.ts';

export interface BinanceCryptoOptionContractTerms {
  symbol: string;
  underlyingType: string;
  contractType: string;
  unit: number;
  quoteAsset: string;
  settleAsset: string;
  serverTime: number;
}

/**
 * Maps only explicitly identified Binance Crypto Options exchangeInfo terms.
 * Binance unit is underlying quantity per contract; it is deliberately not
 * used as the premium multiplier. Option premium orders are contract-denominated,
 * so the premium multiplier is 1.
 *
 * Exercise/settlement assumptions are cross-referenced to the Binance RIE/RCH
 * contract and clearing documents. Account-specific applicability is explicitly
 * unverified; consumers must surface that limitation. This adapter does not
 * declare pricing/Greeks model capability by itself.
 */
export function mapBinanceCryptoOptionEconomics(
  terms: BinanceCryptoOptionContractTerms,
): ContractEconomics | null {
  if (terms.underlyingType.trim().toUpperCase() !== 'CRYPTO'
    || terms.contractType.trim().toUpperCase() !== 'CRYPTO_OPTIONS'
    || !terms.symbol.trim()
    || !Number.isFinite(terms.unit) || terms.unit <= 0
    || !/^[A-Z][A-Z0-9]{1,11}$/.test(terms.quoteAsset)
    || !/^[A-Z][A-Z0-9]{1,11}$/.test(terms.settleAsset)
    || !Number.isFinite(terms.serverTime) || terms.serverTime <= 0) return null;

  const economics: ContractEconomics = {
    premium: {
      multiplier: 1,
      quoteCurrency: terms.quoteAsset,
      priceUnit: 'PER_CONTRACT',
    },
    exercise: {
      style: 'EUROPEAN',
      settlement: 'CASH',
      settlementCurrency: terms.settleAsset,
      deliverables: [],
      cashSettlement: {
        formula: 'INTRINSIC_VALUE',
        reference: 'INDEX',
        currency: terms.settleAsset,
        multiplier: terms.unit,
      },
    },
    provenance: {
      status: 'PROVIDER_VERIFIED',
      provider: 'BINANCE',
      sourceRef: 'https://eapi.binance.com/eapi/v1/exchangeInfo',
      retrievedAt: new Date(terms.serverTime).toISOString(),
      rawFields: {
        symbol: terms.symbol,
        underlyingType: terms.underlyingType,
        contractType: terms.contractType,
        unit: terms.unit,
        quoteAsset: terms.quoteAsset,
        settleAsset: terms.settleAsset,
      },
      legalTerms: { ...BINANCE_CRYPTO_OPTIONS_LEGAL_TERMS },
    },
  };
  const validation = validateContractEconomics(economics);
  return validation.valid && validation.adapterReady ? economics : null;
}
