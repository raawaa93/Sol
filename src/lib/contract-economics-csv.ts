import { validateContractEconomics } from './contract-economics.ts';
import type { ContractEconomics, ContractSettlementMechanic, DeliverableComponent, ExerciseStyle, PremiumPriceUnit } from './types.ts';

export const CONTRACT_ECONOMICS_CSV_V2_FIELDS = [
  'contractEconomicsVersion',
  'premiumMultiplier',
  'premiumQuoteCurrency',
  'premiumPriceUnit',
  'exerciseStyleCanonical',
  'settlementMechanic',
  'settlementCurrency',
  'aggregateExerciseCashBasis',
  'aggregateExerciseCashCurrency',
  'aggregateExerciseCashMultiplier',
  'aggregateExerciseCashAmount',
  'deliverablesJson',
  'cashSettlementFormula',
  'cashSettlementReference',
  'cashSettlementCurrency',
  'cashSettlementMultiplier',
  'economicsSourceStatus',
  'economicsSourceProvider',
  'economicsSourceRef',
  'economicsSourceRetrievedAt',
] as const;

export type ContractEconomicsCsvFields = Record<string, string>;

export type ContractEconomicsCsvParseResult =
  | { economics: ContractEconomics; warning?: undefined }
  | { economics?: undefined; warning: string };

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function positiveNumber(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function nonNegativeNumber(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/** Serializes canonical terms into explicit CSV v2 columns; JSON is escaped by the CSV writer. */
export function serializeContractEconomicsCsvV2(economics: ContractEconomics): ContractEconomicsCsvFields {
  const cash = economics.exercise.aggregateExerciseCash;
  const formula = economics.exercise.cashSettlement;
  return {
    contractEconomicsVersion: '2',
    premiumMultiplier: String(economics.premium.multiplier),
    premiumQuoteCurrency: economics.premium.quoteCurrency,
    premiumPriceUnit: economics.premium.priceUnit,
    exerciseStyleCanonical: economics.exercise.style,
    settlementMechanic: economics.exercise.settlement,
    settlementCurrency: economics.exercise.settlementCurrency ?? '',
    aggregateExerciseCashBasis: cash?.basis ?? '',
    aggregateExerciseCashCurrency: cash?.currency ?? '',
    aggregateExerciseCashMultiplier: cash?.basis === 'STRIKE_MULTIPLIER' ? String(cash.multiplier) : '',
    aggregateExerciseCashAmount: cash?.basis === 'FIXED' ? String(cash.amount) : '',
    deliverablesJson: JSON.stringify(economics.exercise.deliverables),
    cashSettlementFormula: formula?.formula ?? '',
    cashSettlementReference: formula?.reference ?? '',
    cashSettlementCurrency: formula?.currency ?? '',
    cashSettlementMultiplier: formula ? String(formula.multiplier) : '',
    economicsSourceStatus: economics.provenance.status,
    economicsSourceProvider: economics.provenance.provider ?? '',
    economicsSourceRef: economics.provenance.sourceRef ?? '',
    economicsSourceRetrievedAt: economics.provenance.retrievedAt ?? '',
  };
}

/**
 * Parses untrusted CSV v2 terms. Claimed source provenance is retained as raw
 * audit data, but imported economics are always USER_ASSERTED and never trusted.
 */
export function parseContractEconomicsCsvV2(fields: ContractEconomicsCsvFields): ContractEconomicsCsvParseResult {
  const version = nonEmpty(fields.contractEconomicsVersion);
  const supplied = CONTRACT_ECONOMICS_CSV_V2_FIELDS.some((field) => nonEmpty(fields[field]));
  if (!version && !supplied) return { warning: 'CSV v2 contract economics are absent.' };
  if (version !== '2') return { warning: 'Unsupported or incomplete contract economics CSV version; canonical terms were not imported.' };

  const multiplier = positiveNumber(fields.premiumMultiplier);
  const quoteCurrency = nonEmpty(fields.premiumQuoteCurrency)?.toUpperCase();
  const priceUnit = nonEmpty(fields.premiumPriceUnit)?.toUpperCase() as PremiumPriceUnit | undefined;
  const style = nonEmpty(fields.exerciseStyleCanonical)?.toUpperCase() as ExerciseStyle | undefined;
  const settlement = nonEmpty(fields.settlementMechanic)?.toUpperCase() as ContractSettlementMechanic | undefined;
  const settlementCurrency = nonEmpty(fields.settlementCurrency)?.toUpperCase();
  let deliverables: DeliverableComponent[] | undefined;
  try {
    const parsed: unknown = JSON.parse(fields.deliverablesJson ?? '');
    if (Array.isArray(parsed)) deliverables = parsed as DeliverableComponent[];
  } catch {
    return { warning: 'Invalid deliverablesJson in CSV v2; canonical terms were not imported.' };
  }

  let aggregateExerciseCash: ContractEconomics['exercise']['aggregateExerciseCash'];
  const cashBasis = nonEmpty(fields.aggregateExerciseCashBasis)?.toUpperCase();
  const cashCurrency = nonEmpty(fields.aggregateExerciseCashCurrency)?.toUpperCase();
  if (cashBasis === 'STRIKE_MULTIPLIER') {
    const cashMultiplier = positiveNumber(fields.aggregateExerciseCashMultiplier);
    if (cashMultiplier !== undefined && cashCurrency) aggregateExerciseCash = { basis: 'STRIKE_MULTIPLIER', currency: cashCurrency, multiplier: cashMultiplier };
  } else if (cashBasis === 'FIXED') {
    const amount = nonNegativeNumber(fields.aggregateExerciseCashAmount);
    if (amount !== undefined && cashCurrency) aggregateExerciseCash = { basis: 'FIXED', currency: cashCurrency, amount };
  } else if (cashBasis) {
    return { warning: 'Invalid aggregate exercise cash basis in CSV v2; canonical terms were not imported.' };
  }

  let cashSettlement: ContractEconomics['exercise']['cashSettlement'];
  const formula = nonEmpty(fields.cashSettlementFormula)?.toUpperCase();
  if (formula) {
    const reference = nonEmpty(fields.cashSettlementReference)?.toUpperCase();
    const currency = nonEmpty(fields.cashSettlementCurrency)?.toUpperCase();
    const cashMultiplier = positiveNumber(fields.cashSettlementMultiplier);
    if (formula !== 'INTRINSIC_VALUE' || !['SPOT', 'FORWARD', 'INDEX'].includes(String(reference)) || !currency || !cashMultiplier) {
      return { warning: 'Invalid cash settlement formula in CSV v2; canonical terms were not imported.' };
    }
    cashSettlement = { formula: 'INTRINSIC_VALUE', reference: reference as 'SPOT' | 'FORWARD' | 'INDEX', currency, multiplier: cashMultiplier };
  }

  if (!multiplier || !quoteCurrency || !priceUnit || !style || !settlement || !settlementCurrency || !deliverables) {
    return { warning: 'CSV v2 is missing required premium, exercise, currency or deliverable fields; canonical terms were not imported.' };
  }

  const rawFields: Record<string, string | number | boolean | null> = {};
  for (const field of CONTRACT_ECONOMICS_CSV_V2_FIELDS) {
    const value = nonEmpty(fields[field]);
    if (value !== undefined) rawFields[field] = value;
  }
  const claimedStatus = nonEmpty(fields.economicsSourceStatus);
  if (claimedStatus) rawFields.claimedEconomicsSourceStatus = claimedStatus;
  const claimedProvider = nonEmpty(fields.economicsSourceProvider);
  if (claimedProvider) rawFields.claimedEconomicsSourceProvider = claimedProvider;
  const claimedSourceRef = nonEmpty(fields.economicsSourceRef);
  if (claimedSourceRef) rawFields.claimedEconomicsSourceRef = claimedSourceRef;
  const claimedRetrievedAt = nonEmpty(fields.economicsSourceRetrievedAt);
  if (claimedRetrievedAt) rawFields.claimedEconomicsSourceRetrievedAt = claimedRetrievedAt;

  const economics: ContractEconomics = {
    premium: { multiplier, quoteCurrency, priceUnit },
    exercise: {
      style,
      settlement,
      settlementCurrency,
      deliverables,
      ...(aggregateExerciseCash ? { aggregateExerciseCash } : {}),
      ...(cashSettlement ? { cashSettlement } : {}),
    },
    provenance: { status: 'USER_ASSERTED', rawFields },
  };
  const validation = validateContractEconomics(economics);
  if (!validation.valid) return { warning: `Invalid canonical economics in CSV v2: ${validation.issues.join(', ')}.` };
  return { economics };
}
