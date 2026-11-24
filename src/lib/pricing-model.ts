import { blackScholes, normalCdf } from './options.ts';
import type { OptionGreeks, OptionSide, UnderlyingKind } from './types';

export interface PricingRequest {
  underlyingKind?: UnderlyingKind;
  spot?: number;
  forward?: number;
  strike: number;
  daysToExpiry: number;
  volatility: number;
  type: OptionSide;
  /** Annual continuously compounded risk-free rate. */
  rate?: number;
}

export type PricingResult =
  | { status: 'SUPPORTED'; model: 'BLACK_SCHOLES' | 'BLACK_76'; greeks: OptionGreeks }
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
export function black76(
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
      delta: type === 'CALL' ? (forward > strike ? 1 : 0) : (forward < strike ? -1 : 0),
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

function invalidCommonInputs(request: PricingRequest): string | undefined {
  if (!Number.isFinite(request.strike) || request.strike <= 0) return 'Strike must be a positive finite number.';
  if (!Number.isFinite(request.daysToExpiry) || request.daysToExpiry < 0) return 'Days to expiry must be a non-negative finite number.';
  if (!Number.isFinite(request.volatility) || request.volatility <= 0 || request.volatility > 5) return 'Volatility must be greater than zero and no more than 500%.';
  if (request.type !== 'CALL' && request.type !== 'PUT') return 'Option side is unsupported.';
  if (request.rate !== undefined && !Number.isFinite(request.rate)) return 'Risk-free rate must be finite.';
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

  const rate = request.rate ?? 0;
  if (request.underlyingKind === 'FUTURE') {
    if (!isPositiveFinite(request.forward)) {
      return { status: 'UNSUPPORTED', reason: 'A positive forward price is required for futures options.' };
    }
    return {
      status: 'SUPPORTED',
      model: 'BLACK_76',
      greeks: black76(request.forward, request.strike, request.daysToExpiry, request.volatility, request.type, rate),
    };
  }

  if (request.underlyingKind === 'SPOT') {
    if (!isPositiveFinite(request.spot)) {
      return { status: 'UNSUPPORTED', reason: 'A positive spot price is required for spot options.' };
    }
    return {
      status: 'SUPPORTED',
      model: 'BLACK_SCHOLES',
      greeks: blackScholes(request.spot, request.strike, request.daysToExpiry, request.volatility, request.type, rate),
    };
  }

  return {
    status: 'UNSUPPORTED',
    reason: 'The underlying mechanics are not supported by a validated pricing model.',
  };
}
