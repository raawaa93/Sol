import { normalCdf } from './options.ts';
import type { ExerciseStyle, OptionGreeks, OptionSide, SettlementStyle, UnderlyingKind } from './types';

export interface PricingRequest {
  underlyingKind?: UnderlyingKind;
  exerciseStyle?: ExerciseStyle;
  settlementStyle?: SettlementStyle;
  spot?: number;
  forward?: number;
  strike: number;
  daysToExpiry: number;
  volatility: number;
  type: OptionSide;
  /** Annual continuously compounded domestic risk-free rate. Must be explicit. */
  rate: number;
  /** Annual continuous carry/dividend yield; required for spot, index and FX options. */
  carryYield?: number;
}

export type PricingResult =
  | { status: 'SUPPORTED'; model: 'BLACK_SCHOLES_CARRY' | 'BLACK_76'; greeks: OptionGreeks; assumptions: { rate: number; carryYield?: number } }
  | { status: 'UNSUPPORTED'; reason: string };

const SQRT_2PI = Math.sqrt(2 * Math.PI);

function normalPdf(value: number): number {
  return Math.exp(-0.5 * value * value) / SQRT_2PI;
}

function isPositiveFinite(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

/**
 * Black-76 for European options on futures/forwards.
 * Delta and gamma are with respect to the forward price, not spot.
 */
function black76(
  forward: number,
  strike: number,
  daysToExpiry: number,
  volatility: number,
  type: OptionSide,
  rate = 0,
): OptionGreeks {
  const time = Math.max(daysToExpiry, 0) / 365;
  const discount = Math.exp(-rate * time);

  if (time === 0) {
    const intrinsic = type === 'CALL' ? Math.max(forward - strike, 0) : Math.max(strike - forward, 0);
    return {
      price: intrinsic,
      delta: (type === 'CALL' ? forward > strike : forward < strike) ? (type === 'CALL' ? 1 : -1) : forward === strike ? (type === 'CALL' ? 0.5 : -0.5) : 0,
      gamma: 0,
      thetaPerDay: 0,
      vegaPerVolPoint: 0,
      rhoPerRatePoint: 0,
    };
  }

  const rootTime = Math.sqrt(time);
  const sigmaRootTime = volatility * rootTime;
  const d1 = (Math.log(forward / strike) + 0.5 * volatility * volatility * time) / sigmaRootTime;
  const d2 = d1 - sigmaRootTime;
  const pdf = normalPdf(d1);
  const price = type === 'CALL'
    ? discount * (forward * normalCdf(d1) - strike * normalCdf(d2))
    : discount * (strike * normalCdf(-d2) - forward * normalCdf(-d1));

  return {
    price: Math.max(price, 0),
    delta: discount * (type === 'CALL' ? normalCdf(d1) : normalCdf(d1) - 1),
    gamma: (discount * pdf) / (forward * sigmaRootTime),
    thetaPerDay: (rate * price - (discount * forward * pdf * volatility) / (2 * rootTime)) / 365,
    vegaPerVolPoint: (discount * forward * pdf * rootTime) / 100,
    // Black-76 holds the forward fixed; rate sensitivity comes from discounting.
    rhoPerRatePoint: (-time * price) / 100,
  };
}

function blackScholesCarry(
  spot: number,
  strike: number,
  daysToExpiry: number,
  volatility: number,
  type: OptionSide,
  rate: number,
  carryYield: number,
): OptionGreeks {
  const time = daysToExpiry / 365;
  const discount = Math.exp(-rate * time);
  const carryDiscount = Math.exp(-carryYield * time);
  if (time === 0) {
    const intrinsic = type === 'CALL' ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
    const itm = type === 'CALL' ? spot > strike : spot < strike;
    const atm = spot === strike;
    return {
      price: intrinsic,
      delta: itm ? (type === 'CALL' ? 1 : -1) : atm ? (type === 'CALL' ? 0.5 : -0.5) : 0,
      gamma: 0,
      thetaPerDay: 0,
      vegaPerVolPoint: 0,
      rhoPerRatePoint: 0,
    };
  }
  const rootTime = Math.sqrt(time);
  const sigmaRootTime = volatility * rootTime;
  const d1 = (Math.log(spot / strike) + (rate - carryYield + 0.5 * volatility * volatility) * time) / sigmaRootTime;
  const d2 = d1 - sigmaRootTime;
  const pdf = normalPdf(d1);
  const discountedSpot = spot * carryDiscount;
  const discountedStrike = strike * discount;
  const price = type === 'CALL'
    ? discountedSpot * normalCdf(d1) - discountedStrike * normalCdf(d2)
    : discountedStrike * normalCdf(-d2) - discountedSpot * normalCdf(-d1);
  const delta = carryDiscount * (type === 'CALL' ? normalCdf(d1) : normalCdf(d1) - 1);
  const gamma = (carryDiscount * pdf) / (spot * sigmaRootTime);
  const vegaPerVolPoint = (discountedSpot * pdf * rootTime) / 100;
  const theta = type === 'CALL'
    ? (-discountedSpot * pdf * volatility / (2 * rootTime) + carryYield * discountedSpot * normalCdf(d1) - rate * discountedStrike * normalCdf(d2))
    : (-discountedSpot * pdf * volatility / (2 * rootTime) - carryYield * discountedSpot * normalCdf(-d1) + rate * discountedStrike * normalCdf(-d2));
  const rho = type === 'CALL'
    ? (strike * time * discount * normalCdf(d2)) / 100
    : (-strike * time * discount * normalCdf(-d2)) / 100;
  return { price: Math.max(price, 0), delta, gamma, thetaPerDay: theta / 365, vegaPerVolPoint, rhoPerRatePoint: rho };
}

function invalidCommonInputs(request: PricingRequest): string | undefined {
  if (!Number.isFinite(request.strike) || request.strike <= 0) return 'Strike must be a positive finite number.';
  if (!Number.isFinite(request.daysToExpiry) || request.daysToExpiry < 0) return 'Days to expiry must be a non-negative finite number.';
  if (!Number.isFinite(request.volatility) || request.volatility <= 0 || request.volatility > 5) return 'Volatility must be greater than zero and no more than 500%.';
  if (request.type !== 'CALL' && request.type !== 'PUT') return 'Option side is unsupported.';
  if (!Number.isFinite(request.rate)) return 'An explicit finite risk-free rate is required.';
  if (request.exerciseStyle !== 'EUROPEAN') return 'Only explicitly European exercise is supported by the current analytical models.';
  if (request.settlementStyle !== 'CASH' && request.settlementStyle !== 'PHYSICAL') return 'Explicit cash or physical settlement metadata is required.';
  return undefined;
}

/**
 * Select a pricing model only when contract mechanics are explicit.
 * Unknown, index-specific, perpetual and other unsupported mechanics never
 * silently fall back to Black-Scholes.
 */
export function priceOption(request: PricingRequest): PricingResult {
  const invalid = invalidCommonInputs(request);
  if (invalid) return { status: 'UNSUPPORTED', reason: invalid };

  const rate = request.rate;
  if (request.underlyingKind === 'FUTURE') {
    if (!isPositiveFinite(request.forward)) {
      return { status: 'UNSUPPORTED', reason: 'A positive forward price is required for futures options.' };
    }
    return {
      status: 'SUPPORTED',
      model: 'BLACK_76',
      greeks: black76(request.forward, request.strike, request.daysToExpiry, request.volatility, request.type, rate),
      assumptions: { rate },
    };
  }

  if (request.underlyingKind === 'SPOT' || request.underlyingKind === 'INDEX' || request.underlyingKind === 'FX_SPOT') {
    if (!isPositiveFinite(request.spot)) {
      return { status: 'UNSUPPORTED', reason: 'A positive spot/index price is required.' };
    }
    if (request.carryYield === undefined || !Number.isFinite(request.carryYield)) {
      return { status: 'UNSUPPORTED', reason: 'An explicit finite carry/dividend yield is required for spot, index and FX options.' };
    }
    return {
      status: 'SUPPORTED',
      model: 'BLACK_SCHOLES_CARRY',
      greeks: blackScholesCarry(request.spot, request.strike, request.daysToExpiry, request.volatility, request.type, rate, request.carryYield),
      assumptions: { rate, carryYield: request.carryYield },
    };
  }

  return {
    status: 'UNSUPPORTED',
    reason: 'The underlying mechanics are not supported by a validated pricing model.',
  };
}
