import type { ContractEconomics, ContractDeliverable } from './types.ts';
import { validateContractEconomics } from './contract-economics.ts';

export type EconomicsCalculationFailure =
  | 'INVALID_INPUT'
  | 'CONTRACT_NOT_ADAPTER_READY'
  | 'MISSING_EXERCISE_CASH'
  | 'MISSING_REFERENCE_PRICE'
  | 'REFERENCE_CURRENCY_MISMATCH'
  | 'FUTURE_DELIVERY_REQUIRES_ADAPTER';

export type EconomicsCalculationResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: EconomicsCalculationFailure; details?: string[] };

export interface PremiumCashInput {
  economics: ContractEconomics;
  premiumPrice: number;
  contracts: number;
  fees?: number;
}
export interface PremiumCashValue {
  amount: number;
  currency: string;
  premiumAmount: number;
  fees: number;
  contracts: number;
  multiplier: number;
}
export interface DeliverableReferencePrice { price: number; currency: string; }
export interface DeliverableComponentValue {
  type: ContractDeliverable['type'];
  description: string;
  amount: number;
  unitPrice?: number;
  value: number;
  currency: string;
}
export interface DeliverablePackageValue {
  components: DeliverableComponentValue[];
  totalsByCurrency: Record<string, number>;
}
function finiteNonNegative(value: number): boolean { return Number.isFinite(value) && value >= 0; }
function finitePositive(value: number): boolean { return Number.isFinite(value) && value > 0; }
type CalculationFailure = { ok: false; reason: EconomicsCalculationFailure; details?: string[] };
function readinessFailure(economics: ContractEconomics): CalculationFailure | undefined {
  const validation = validateContractEconomics(economics);
  if (!validation.valid || !validation.adapterReady) {
    return { ok: false, reason: 'CONTRACT_NOT_ADAPTER_READY', details: [...validation.issues, ...validation.unsupportedReasons] };
  }
  return undefined;
}

/** Premium cash uses only premium.multiplier; exercise/deliverable scales are never consulted. */
export function calculatePremiumCash(input: PremiumCashInput): EconomicsCalculationResult<PremiumCashValue> {
  const { economics, premiumPrice, contracts, fees = 0 } = input;
  const blocked = readinessFailure(economics);
  if (blocked) return blocked;
  if (!finiteNonNegative(premiumPrice) || !finitePositive(contracts) || !finiteNonNegative(fees)) return { ok: false, reason: 'INVALID_INPUT' };
  const multiplier = economics.premium.multiplier;
  const premiumAmount = premiumPrice * multiplier * contracts;
  const amount = premiumAmount + fees;
  if (!Number.isFinite(amount)) return { ok: false, reason: 'INVALID_INPUT' };
  return { ok: true, value: { amount, currency: economics.premium.quoteCurrency, premiumAmount, fees, contracts, multiplier } };
}

/** Values each component independently, keeps currencies separate, and blocks futures pending a dedicated adapter. */
export function valueDeliverablePackage(
  economics: ContractEconomics,
  referencePrices: Record<string, DeliverableReferencePrice>,
): EconomicsCalculationResult<DeliverablePackageValue> {
  const blocked = readinessFailure(economics);
  if (blocked) return blocked;
  if (economics.exercise.settlement !== 'PHYSICAL' && economics.exercise.settlement !== 'FUTURE_DELIVERY') return { ok: false, reason: 'INVALID_INPUT', details: ['PHYSICAL_OR_FUTURE_DELIVERY_REQUIRED'] };
  const components: DeliverableComponentValue[] = [];
  const totalsByCurrency: Record<string, number> = {};
  for (const deliverable of economics.exercise.deliverables) {
    if (deliverable.type === 'FUTURE') return { ok: false, reason: 'FUTURE_DELIVERY_REQUIRES_ADAPTER' };
    if (deliverable.type === 'CASH') {
      components.push({ type: 'CASH', description: 'Fixed cash deliverable', amount: deliverable.amount, value: deliverable.amount, currency: deliverable.currency });
      totalsByCurrency[deliverable.currency] = (totalsByCurrency[deliverable.currency] ?? 0) + deliverable.amount;
      continue;
    }
    const reference = referencePrices[deliverable.symbol];
    if (!reference || !finitePositive(reference.price)) return { ok: false, reason: 'MISSING_REFERENCE_PRICE', details: [deliverable.symbol] };
    if (!deliverable.currency || reference.currency !== deliverable.currency) {
      return { ok: false, reason: 'REFERENCE_CURRENCY_MISMATCH', details: [deliverable.symbol, deliverable.currency ?? 'UNKNOWN', reference.currency] };
    }
    const value = deliverable.amount * reference.price;
    if (!Number.isFinite(value)) return { ok: false, reason: 'INVALID_INPUT' };
    components.push({ type: deliverable.type, description: deliverable.symbol, amount: deliverable.amount, unitPrice: reference.price, value, currency: deliverable.currency });
    totalsByCurrency[deliverable.currency] = (totalsByCurrency[deliverable.currency] ?? 0) + value;
  }
  return { ok: true, value: { components, totalsByCurrency } };
}

/** Exercise cash is calculated from its own source-defined basis, never premium.multiplier. */
export function calculateAggregateExerciseCash(
  economics: ContractEconomics,
  strike: number,
  contracts = 1,
): EconomicsCalculationResult<{ amount: number; currency: string; contracts: number; basis: 'STRIKE_MULTIPLIER' | 'FIXED' }> {
  const blocked = readinessFailure(economics);
  if (blocked) return blocked;
  const terms = economics.exercise.aggregateExerciseCash;
  if (!terms) return { ok: false, reason: 'MISSING_EXERCISE_CASH' };
  if (!finitePositive(contracts)) return { ok: false, reason: 'INVALID_INPUT' };
  const perContract = terms.basis === 'STRIKE_MULTIPLIER'
    ? (finiteNonNegative(strike) ? strike * terms.multiplier : Number.NaN)
    : terms.amount;
  const amount = perContract * contracts;
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, reason: 'INVALID_INPUT' };
  return { ok: true, value: { amount, currency: terms.currency, contracts, basis: terms.basis } };
}
