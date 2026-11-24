import type { ContractEconomics, ContractDeliverable } from './types.ts';

export type ContractEconomicsIssueCode =
  | 'INVALID_PREMIUM_MULTIPLIER'
  | 'INVALID_PREMIUM_CURRENCY'
  | 'INVALID_PREMIUM_PRICE_UNIT'
  | 'INVALID_EXERCISE_STYLE'
  | 'INVALID_SETTLEMENT_STYLE'
  | 'INVALID_SETTLEMENT_CURRENCY'
  | 'MISSING_SETTLEMENT_CURRENCY'
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
  | 'UNKNOWN_PROVENANCE'
  | 'CROSS_CURRENCY_TOTALS_REQUIRE_FX'
  | 'DELIVERABLE_CURRENCY_UNKNOWN';

export interface ContractEconomicsValidation {
  valid: boolean;
  supported: boolean;
  issues: ContractEconomicsIssueCode[];
  unsupportedReasons: ContractEconomicsUnsupportedReason[];
}

const currencyPattern = /^[A-Z][A-Z0-9]{1,11}$/;

function isCurrency(value: unknown): value is string {
  return typeof value === 'string' && currencyPattern.test(value);
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isValidDeliverable(item: ContractDeliverable): boolean {
  if (!item || typeof item !== 'object' || !isPositiveFinite(item.amount)) return false;
  if (item.type === 'CASH') return isCurrency(item.currency);
  if (item.type === 'EQUITY' || item.type === 'UNDERLYING') {
    return typeof item.symbol === 'string' && item.symbol.trim().length > 0
      && (item.currency === undefined || isCurrency(item.currency));
  }
  if (item.type === 'FUTURE') {
    return typeof item.symbol === 'string' && item.symbol.trim().length > 0
      && (item.currency === undefined || isCurrency(item.currency))
      && (item.pointValue === undefined || isPositiveFinite(item.pointValue));
  }
  return false;
}

function validAggregateExerciseCash(value: ContractEconomics['exercise']['aggregateExerciseCash']): boolean {
  if (!value || !isCurrency(value.currency)) return false;
  return value.basis === 'STRIKE_MULTIPLIER'
    ? isPositiveFinite(value.multiplier)
    : value.basis === 'FIXED' && typeof value.amount === 'number'
      && Number.isFinite(value.amount) && value.amount >= 0;
}

/**
 * Validates canonical contract terms without inferring missing values.
 * valid means the supplied structure is internally well-formed.
 * supported is stricter: unknown/user-asserted terms and unconverted
 * cross-currency totals are not eligible for derived contract analytics.
 */
export function validateContractEconomics(economics: ContractEconomics): ContractEconomicsValidation {
  const issues: ContractEconomicsIssueCode[] = [];
  const unsupportedReasons: ContractEconomicsUnsupportedReason[] = [];

  if (!isPositiveFinite(economics?.premium?.multiplier)) issues.push('INVALID_PREMIUM_MULTIPLIER');
  if (!isCurrency(economics?.premium?.quoteCurrency)) issues.push('INVALID_PREMIUM_CURRENCY');
  if (!['PER_UNDERLYING_UNIT', 'PER_CONTRACT'].includes(economics?.premium?.priceUnit)) {
    issues.push('INVALID_PREMIUM_PRICE_UNIT');
  }

  const exercise = economics?.exercise;
  if (!exercise || !['EUROPEAN', 'AMERICAN', 'BERMUDAN', 'UNKNOWN'].includes(exercise.style)) {
    issues.push('INVALID_EXERCISE_STYLE');
  } else if (exercise.style === 'UNKNOWN') {
    unsupportedReasons.push('UNKNOWN_EXERCISE_STYLE');
  }

  const settlements = ['CASH', 'PHYSICAL', 'FUTURE_DELIVERY', 'UNKNOWN'];
  if (!exercise || !settlements.includes(exercise.settlement)) {
    issues.push('INVALID_SETTLEMENT_STYLE');
  } else if (exercise.settlement === 'UNKNOWN') {
    unsupportedReasons.push('UNKNOWN_SETTLEMENT_STYLE');
  }

  if (exercise?.settlementCurrency !== undefined && !isCurrency(exercise.settlementCurrency)) {
    issues.push('INVALID_SETTLEMENT_CURRENCY');
  }
  if (exercise && exercise.settlement !== 'UNKNOWN' && !exercise.settlementCurrency) {
    issues.push('MISSING_SETTLEMENT_CURRENCY');
  }

  const deliverables = Array.isArray(exercise?.deliverables) ? exercise.deliverables : [];
  if (exercise && Array.isArray(exercise.deliverables)
    && deliverables.some((item) => !isValidDeliverable(item))) {
    issues.push('INVALID_DELIVERABLE');
  }

  if (exercise?.settlement === 'PHYSICAL' || exercise?.settlement === 'FUTURE_DELIVERY') {
    if (deliverables.length === 0) issues.push('MISSING_PHYSICAL_DELIVERABLES');
    if (!validAggregateExerciseCash(exercise.aggregateExerciseCash)) {
      issues.push('MISSING_AGGREGATE_EXERCISE_CASH');
    }
    if (exercise.settlement === 'FUTURE_DELIVERY'
      && !deliverables.some((item) => item.type === 'FUTURE' && isPositiveFinite(item.pointValue))) {
      issues.push('INVALID_DELIVERABLE');
    }
  }

  if (exercise?.settlement === 'CASH') {
    const formula = exercise.cashSettlement;
    if (!formula) {
      issues.push('MISSING_CASH_SETTLEMENT_FORMULA');
    } else {
      if (formula.formula !== 'INTRINSIC_VALUE'
        || !['SPOT', 'FORWARD', 'INDEX'].includes(formula.reference)
        || !isCurrency(formula.currency)
        || !isPositiveFinite(formula.multiplier)) {
        issues.push('INVALID_CASH_SETTLEMENT_FORMULA');
      }
      if (exercise.settlementCurrency && formula.currency !== exercise.settlementCurrency) {
        unsupportedReasons.push('CROSS_CURRENCY_TOTALS_REQUIRE_FX');
      }
    }
  }

  if (exercise?.aggregateExerciseCash && !validAggregateExerciseCash(exercise.aggregateExerciseCash)) {
    issues.push('INVALID_AGGREGATE_EXERCISE_CASH');
  }

  const provenance = economics?.provenance;
  if (!provenance || !['PROVIDER_VERIFIED', 'USER_ASSERTED', 'SYNTHETIC_DEMO', 'UNKNOWN'].includes(provenance.status)) {
    issues.push('MISSING_PROVIDER_PROVENANCE');
  } else if (provenance.status === 'PROVIDER_VERIFIED') {
    if (!provenance.provider?.trim() || !provenance.sourceRef?.trim()) {
      issues.push('MISSING_PROVIDER_PROVENANCE');
    }
    if (!provenance.retrievedAt || !Number.isFinite(Date.parse(provenance.retrievedAt))) {
      issues.push('INVALID_PROVIDER_TIMESTAMP');
    }
  } else if (provenance.status === 'USER_ASSERTED') {
    unsupportedReasons.push('USER_ASSERTED_PROVENANCE');
  } else if (provenance.status === 'UNKNOWN') {
    unsupportedReasons.push('UNKNOWN_PROVENANCE');
  }

  if (isCurrency(economics?.premium?.quoteCurrency)
    && isCurrency(exercise?.settlementCurrency)
    && economics.premium.quoteCurrency !== exercise.settlementCurrency) {
    unsupportedReasons.push('CROSS_CURRENCY_TOTALS_REQUIRE_FX');
  }
  if (exercise?.aggregateExerciseCash && isCurrency(exercise.settlementCurrency)
    && exercise.aggregateExerciseCash.currency !== exercise.settlementCurrency) {
    unsupportedReasons.push('CROSS_CURRENCY_TOTALS_REQUIRE_FX');
  }
  deliverables.forEach((item) => {
    if ((item.type === 'EQUITY' || item.type === 'UNDERLYING' || item.type === 'FUTURE') && !item.currency) {
      unsupportedReasons.push('DELIVERABLE_CURRENCY_UNKNOWN');
    } else if (item.type !== 'CASH' && item.currency && isCurrency(exercise?.settlementCurrency)
      && item.currency !== exercise.settlementCurrency) {
      unsupportedReasons.push('CROSS_CURRENCY_TOTALS_REQUIRE_FX');
    } else if (item.type === 'CASH' && isCurrency(exercise?.settlementCurrency)
      && item.currency !== exercise.settlementCurrency) {
      unsupportedReasons.push('CROSS_CURRENCY_TOTALS_REQUIRE_FX');
    }
  });

  const uniqueIssues = [...new Set(issues)];
  const uniqueUnsupported = [...new Set(unsupportedReasons)];
  return {
    valid: uniqueIssues.length === 0,
    supported: uniqueIssues.length === 0 && uniqueUnsupported.length === 0,
    issues: uniqueIssues,
    unsupportedReasons: uniqueUnsupported,
  };
}
