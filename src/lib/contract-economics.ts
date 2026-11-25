import type { ContractDeliverable } from './types.ts';

export type ContractEconomicsIssueCode =
  | 'INVALID_CONTRACT_ECONOMICS'
  | 'INVALID_PREMIUM_MULTIPLIER'
  | 'INVALID_PREMIUM_CURRENCY'
  | 'INVALID_PREMIUM_PRICE_UNIT'
  | 'INVALID_PREMIUM_SCALE_COMBINATION'
  | 'INVALID_EXERCISE_STYLE'
  | 'INVALID_SETTLEMENT_STYLE'
  | 'INVALID_SETTLEMENT_CURRENCY'
  | 'MISSING_SETTLEMENT_CURRENCY'
  | 'INVALID_DELIVERABLES_COLLECTION'
  | 'INVALID_DELIVERABLE'
  | 'MISSING_PHYSICAL_DELIVERABLES'
  | 'MISSING_AGGREGATE_EXERCISE_CASH'
  | 'INVALID_AGGREGATE_EXERCISE_CASH'
  | 'MISSING_CASH_SETTLEMENT_FORMULA'
  | 'INVALID_CASH_SETTLEMENT_FORMULA'
  | 'MISSING_PROVIDER_PROVENANCE'
  | 'INVALID_PROVIDER_TIMESTAMP';

export type ContractEconomicsUnsupportedReason =
  | 'UNKNOWN_EXERCISE_STYLE'
  | 'UNKNOWN_SETTLEMENT_STYLE'
  | 'USER_ASSERTED_PROVENANCE'
  | 'SYNTHETIC_DEMO_ONLY'
  | 'UNKNOWN_PROVENANCE'
  | 'CROSS_CURRENCY_TOTALS_REQUIRE_FX'
  | 'DELIVERABLE_CURRENCY_UNKNOWN';

export const BINANCE_CRYPTO_OPTIONS_LEGAL_TERMS = {
  contractSpecificationRef: 'https://bin.bnbstatic.com/static/cms/cg08ou2ak0tn7mcplvfg/file/443bcc67fde7274898ff8e3f7af23c7d89e654c5e609d250772e0ddaa96409be.pdf',
  clearingProceduresRef: 'https://bin.bnbstatic.com/static/cms/cg08ou2ak0tn7mcplvfg/file/a86691f40d8155992c622715ce727d608d7f972ebb93ce90fa0106830e8a0a36.pdf',
  scope: 'BINANCE_RIE_RCH',
  effectiveDate: '2026-01-05',
  accountApplicability: 'UNVERIFIED',
} as const;

export interface ContractEconomicsValidation {
  valid: boolean;
  adapterReady: boolean;
  issues: ContractEconomicsIssueCode[];
  unsupportedReasons: ContractEconomicsUnsupportedReason[];
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// These are denomination/settlement-asset identifiers, not ISO-4217-only
// codes (for example, USDC is valid). Matching identifiers do not imply FX
// equivalence with any different identifier.
const currencyPattern = /^[A-Z][A-Z0-9]{1,11}$/;

function isCurrency(value: unknown): value is string {
  return typeof value === 'string' && currencyPattern.test(value);
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isValidDeliverable(value: unknown): value is ContractDeliverable {
  if (!isRecord(value) || !isPositiveFinite(value.amount)) return false;
  if (value.type === 'CASH') return isCurrency(value.currency);
  if (value.type === 'EQUITY' || value.type === 'UNDERLYING') {
    return typeof value.symbol === 'string' && value.symbol.trim().length > 0
      && (value.currency === undefined || isCurrency(value.currency));
  }
  if (value.type === 'FUTURE') {
    return typeof value.symbol === 'string' && value.symbol.trim().length > 0
      && (value.currency === undefined || isCurrency(value.currency))
      && (value.pointValue === undefined || isPositiveFinite(value.pointValue));
  }
  return false;
}

function validAggregateExerciseCash(value: unknown): boolean {
  if (!isRecord(value) || !isCurrency(value.currency)) return false;
  return value.basis === 'STRIKE_MULTIPLIER'
    ? isPositiveFinite(value.multiplier)
    : value.basis === 'FIXED' && typeof value.amount === 'number'
      && Number.isFinite(value.amount) && value.amount >= 0;
}

function isRfc3339Timestamp(value: unknown): value is string {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return false;
  }
  return Number.isFinite(Date.parse(value));
}

/**
 * Validates untrusted canonical contract terms without inferring missing values.
 * valid means the supplied structure is internally well-formed.
 * adapterReady means terms and provenance are complete enough to be handed
 * to a market-specific adapter. It does NOT mean any pricing/Greek adapter
 * supports this contract; that capability must be checked separately.
 */
export function validateContractEconomics(economics: unknown): ContractEconomicsValidation {
  const issues: ContractEconomicsIssueCode[] = [];
  const unsupportedReasons: ContractEconomicsUnsupportedReason[] = [];

  if (!isRecord(economics)) {
    issues.push('INVALID_CONTRACT_ECONOMICS');
    return { valid: false, adapterReady: false, issues, unsupportedReasons };
  }

  const premium = isRecord(economics.premium) ? economics.premium : {};
  const exercise = isRecord(economics.exercise) ? economics.exercise : undefined;
  const provenance = isRecord(economics.provenance) ? economics.provenance : undefined;

  if (!isPositiveFinite(premium.multiplier)) issues.push('INVALID_PREMIUM_MULTIPLIER');
  if (!isCurrency(premium.quoteCurrency)) issues.push('INVALID_PREMIUM_CURRENCY');
  if (!['PER_UNDERLYING_UNIT', 'PER_CONTRACT'].includes(String(premium.priceUnit))) {
    issues.push('INVALID_PREMIUM_PRICE_UNIT');
  }
  if (premium.priceUnit === 'PER_CONTRACT' && premium.multiplier !== 1) {
    issues.push('INVALID_PREMIUM_SCALE_COMBINATION');
  }

  const exerciseStyle = exercise?.style;
  if (!['EUROPEAN', 'AMERICAN', 'BERMUDAN', 'UNKNOWN'].includes(String(exerciseStyle))) {
    issues.push('INVALID_EXERCISE_STYLE');
  } else if (exerciseStyle === 'UNKNOWN') {
    unsupportedReasons.push('UNKNOWN_EXERCISE_STYLE');
  }

  const settlement = exercise?.settlement;
  if (!['CASH', 'PHYSICAL', 'FUTURE_DELIVERY', 'UNKNOWN'].includes(String(settlement))) {
    issues.push('INVALID_SETTLEMENT_STYLE');
  } else if (settlement === 'UNKNOWN') {
    unsupportedReasons.push('UNKNOWN_SETTLEMENT_STYLE');
  }

  const settlementCurrency = exercise?.settlementCurrency;
  if (settlementCurrency !== undefined && !isCurrency(settlementCurrency)) {
    issues.push('INVALID_SETTLEMENT_CURRENCY');
  }
  if (exercise && settlement !== 'UNKNOWN' && !settlementCurrency) {
    issues.push('MISSING_SETTLEMENT_CURRENCY');
  }

  const hasDeliverablesArray = Array.isArray(exercise?.deliverables);
  if (!hasDeliverablesArray) issues.push('INVALID_DELIVERABLES_COLLECTION');
  const deliverables: unknown[] = hasDeliverablesArray ? exercise!.deliverables as unknown[] : [];
  if (deliverables.some((item) => !isValidDeliverable(item))) {
    issues.push('INVALID_DELIVERABLE');
  }

  if (settlement === 'PHYSICAL' || settlement === 'FUTURE_DELIVERY') {
    if (deliverables.length === 0) issues.push('MISSING_PHYSICAL_DELIVERABLES');
    if (!validAggregateExerciseCash(exercise?.aggregateExerciseCash)) {
      issues.push('MISSING_AGGREGATE_EXERCISE_CASH');
    }
    if (settlement === 'FUTURE_DELIVERY'
      && !deliverables.some((item) => isRecord(item) && item.type === 'FUTURE' && isPositiveFinite(item.pointValue))) {
      issues.push('INVALID_DELIVERABLE');
    }
  }

  if (settlement === 'CASH') {
    const formula = exercise?.cashSettlement;
    if (!isRecord(formula)) {
      issues.push('MISSING_CASH_SETTLEMENT_FORMULA');
    } else if (formula.formula !== 'INTRINSIC_VALUE'
      || !['SPOT', 'FORWARD', 'INDEX'].includes(String(formula.reference))
      || !isCurrency(formula.currency)
      || !isPositiveFinite(formula.multiplier)) {
      issues.push('INVALID_CASH_SETTLEMENT_FORMULA');
    } else if (isCurrency(settlementCurrency) && formula.currency !== settlementCurrency) {
      unsupportedReasons.push('CROSS_CURRENCY_TOTALS_REQUIRE_FX');
    }
  }

  if (exercise?.aggregateExerciseCash !== undefined
    && !validAggregateExerciseCash(exercise.aggregateExerciseCash)) {
    issues.push('INVALID_AGGREGATE_EXERCISE_CASH');
  }

  if (!provenance || !['PROVIDER_VERIFIED', 'USER_ASSERTED', 'SYNTHETIC_DEMO', 'UNKNOWN'].includes(String(provenance.status))) {
    issues.push('MISSING_PROVIDER_PROVENANCE');
  } else if (provenance.status === 'PROVIDER_VERIFIED') {
    if (typeof provenance.provider !== 'string' || !provenance.provider.trim()
      || typeof provenance.sourceRef !== 'string' || !provenance.sourceRef.trim()) {
      issues.push('MISSING_PROVIDER_PROVENANCE');
    }
    if (!isRfc3339Timestamp(provenance.retrievedAt)) {
      issues.push('INVALID_PROVIDER_TIMESTAMP');
    }
  } else if (provenance.status === 'USER_ASSERTED') {
    unsupportedReasons.push('USER_ASSERTED_PROVENANCE');
  } else if (provenance.status === 'SYNTHETIC_DEMO') {
    unsupportedReasons.push('SYNTHETIC_DEMO_ONLY');
  } else if (provenance.status === 'UNKNOWN') {
    unsupportedReasons.push('UNKNOWN_PROVENANCE');
  }

  if (provenance?.provider === 'BINANCE'
    && provenance.rawFields?.contractType === 'CRYPTO_OPTIONS') {
    const legal = provenance.legalTerms;
    if (!legal
      || legal.contractSpecificationRef !== BINANCE_CRYPTO_OPTIONS_LEGAL_TERMS.contractSpecificationRef
      || legal.clearingProceduresRef !== BINANCE_CRYPTO_OPTIONS_LEGAL_TERMS.clearingProceduresRef
      || legal.scope !== BINANCE_CRYPTO_OPTIONS_LEGAL_TERMS.scope
      || legal.effectiveDate !== BINANCE_CRYPTO_OPTIONS_LEGAL_TERMS.effectiveDate
      || legal.accountApplicability !== BINANCE_CRYPTO_OPTIONS_LEGAL_TERMS.accountApplicability) {
      unsupportedReasons.push('MISSING_LEGAL_TERMS_PROVENANCE');
    }
  }

  if (isCurrency(premium.quoteCurrency)
    && isCurrency(settlementCurrency)
    && premium.quoteCurrency !== settlementCurrency) {
    unsupportedReasons.push('CROSS_CURRENCY_TOTALS_REQUIRE_FX');
  }
  const exerciseCash = exercise?.aggregateExerciseCash;
  if (isRecord(exerciseCash) && isCurrency(settlementCurrency)
    && exerciseCash.currency !== settlementCurrency) {
    unsupportedReasons.push('CROSS_CURRENCY_TOTALS_REQUIRE_FX');
  }
  deliverables.forEach((item) => {
    if (!isRecord(item)) return;
    if ((item.type === 'EQUITY' || item.type === 'UNDERLYING' || item.type === 'FUTURE') && !item.currency) {
      unsupportedReasons.push('DELIVERABLE_CURRENCY_UNKNOWN');
    } else if (item.type !== 'CASH' && item.currency && isCurrency(settlementCurrency)
      && item.currency !== settlementCurrency) {
      unsupportedReasons.push('CROSS_CURRENCY_TOTALS_REQUIRE_FX');
    } else if (item.type === 'CASH' && isCurrency(settlementCurrency)
      && item.currency !== settlementCurrency) {
      unsupportedReasons.push('CROSS_CURRENCY_TOTALS_REQUIRE_FX');
    }
  });

  const uniqueIssues = [...new Set(issues)];
  const uniqueUnsupported = [...new Set(unsupportedReasons)];
  return {
    valid: uniqueIssues.length === 0,
    adapterReady: uniqueIssues.length === 0 && uniqueUnsupported.length === 0,
    issues: uniqueIssues,
    unsupportedReasons: uniqueUnsupported,
  };
}
