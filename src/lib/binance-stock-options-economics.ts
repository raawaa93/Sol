import type { ContractEconomics, DeliverableComponent } from './types.ts';
import { validateContractEconomics } from './contract-economics.ts';

export interface BinanceStockOptionDeliverable {
  type: string;
  symbol: string;
  amount: string | number;
}

export interface BinanceStockOptionContractTerms {
  symbol: string;
  underlyingSymbol: string;
  rootSymbol: string;
  contractType: string;
  strikePrice: string | number;
  multiplier: string | number;
  contractSize: number;
  deliverables: BinanceStockOptionDeliverable[];
  retrievedAt: string;
}

function positiveNumber(value: string | number): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Maps Binance Stock Options reference metadata only.
 *
 * Binance defines multiplier as the premium-cost multiplier and contractSize
 * as the shares delivered per contract. These values must remain independent.
 * Prices are quoted in USD; the venue's USDC order-payment convention is not
 * represented as an FX conversion or substituted for the quote currency.
 *
 * The endpoint supplies contract reference data, not option quotes, IV or Greeks.
 */
export function mapBinanceStockOptionEconomics(
  terms: BinanceStockOptionContractTerms,
): ContractEconomics | null {
  const premiumMultiplier = positiveNumber(terms.multiplier);
  const contractSize = positiveNumber(terms.contractSize);
  const strike = positiveNumber(terms.strikePrice);
  const retrievedAt = Date.parse(terms.retrievedAt);

  if (!terms.symbol.trim() || !terms.underlyingSymbol.trim() || !terms.rootSymbol.trim()
    || !['CALL', 'PUT'].includes(terms.contractType)
    || premiumMultiplier === undefined || contractSize === undefined || strike === undefined
    || !Number.isFinite(retrievedAt) || retrievedAt <= 0
    || !Array.isArray(terms.deliverables) || terms.deliverables.length === 0) return null;

  const deliverables: DeliverableComponent[] = [];
  for (const item of terms.deliverables) {
    const amount = positiveNumber(item.amount);
    if (amount === undefined || !item.symbol.trim()) return null;
    if (item.type === 'EQUITY') {
      deliverables.push({ type: 'EQUITY', symbol: item.symbol, amount, currency: 'USD' });
    } else if (item.type === 'CASH') {
      deliverables.push({ type: 'CASH', currency: item.symbol, amount });
    } else {
      return null;
    }
  }

  const economics: ContractEconomics = {
    premium: {
      multiplier: premiumMultiplier,
      quoteCurrency: 'USD',
      priceUnit: 'PER_UNDERLYING_UNIT',
    },
    exercise: {
      style: 'UNKNOWN',
      settlement: 'PHYSICAL',
      settlementCurrency: 'USD',
      aggregateExerciseCash: {
        basis: 'STRIKE_MULTIPLIER',
        currency: 'USD',
        multiplier: contractSize,
      },
      deliverables,
    },
    provenance: {
      status: 'PROVIDER_VERIFIED',
      provider: 'BINANCE',
      sourceRef: 'https://api.binance.com/sapi/v1/equity/option/market/exchangeInfo',
      retrievedAt: new Date(retrievedAt).toISOString(),
      rawFields: {
        symbol: terms.symbol,
        underlyingSymbol: terms.underlyingSymbol,
        rootSymbol: terms.rootSymbol,
        contractType: terms.contractType,
        strikePrice: strike,
        multiplier: premiumMultiplier,
        contractSize,
        deliverables: JSON.stringify(terms.deliverables),
      },
    },
  };
  const validation = validateContractEconomics(economics);
  return validation.valid && validation.adapterReady ? economics : null;
}
