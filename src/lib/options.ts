import type { OptionGreeks, OptionQuote, OptionSide } from './types';
import { getContractScaleIssue, type ContractScaleSourceMode } from './contract-scale';

export function getUnderlyingReferencePrice(quote: OptionQuote): number {
  return quote.underlyingKind === 'FUTURE' ? quote.forward ?? quote.spot : quote.spot;
}


const SQRT_2 = Math.sqrt(2);
const SQRT_2PI = Math.sqrt(2 * Math.PI);
// Cephes rational coefficients for erf/erfc; attribution and license are in THIRD-PARTY-NOTICES.md.
const ERF_NUMERATOR = [
  9.60497373987051638749e0,
  9.00260197203842689217e1,
  2.23200534594684319226e3,
  7.00332514112805075473e3,
  5.55923013010394962768e4,
];
const ERF_DENOMINATOR = [
  3.35617141647503099647e1,
  5.21357949780152679795e2,
  4.59432382970980127987e3,
  2.26290000613890934246e4,
  4.92673942608635921086e4,
];
const ERFC_NUMERATOR = [
  2.46196981473530512524e-10,
  5.64189564831068821977e-1,
  7.46321056442269912687e0,
  4.86371970985681366614e1,
  1.96520832956077098242e2,
  5.26445194995477358631e2,
  9.34528527171957607540e2,
  1.02755188689515710272e3,
  5.57535335369399327526e2,
];
const ERFC_DENOMINATOR = [
  1.32281951154744992508e1,
  8.67072140885989742329e1,
  3.54937778887819891062e2,
  9.75708501743205489753e2,
  1.82390916687909736289e3,
  2.24633760818710981792e3,
  1.65666309194161350182e3,
  5.57535340817727675546e2,
];
const ERFC_LARGE_NUMERATOR = [
  5.64189583547755073984e-1,
  1.27536670759978104416e0,
  5.01905042251180477414e0,
  6.16021097993053585195e0,
  7.40974269950448939160e0,
  2.97886665372100240670e0,
];
const ERFC_LARGE_DENOMINATOR = [
  2.26052863220117276590e0,
  9.39603524938001434673e0,
  1.20489539808096656605e1,
  1.70814450747565897222e1,
  9.60896809063285878198e0,
  3.36907645100081516050e0,
];

function evaluatePolynomial(value: number, coefficients: number[]): number {
  let result = coefficients[0];
  for (let index = 1; index < coefficients.length; index += 1) result = result * value + coefficients[index];
  return result;
}

function evaluatePolynomialWithLeadingOne(value: number, coefficients: number[]): number {
  let result = value + coefficients[0];
  for (let index = 1; index < coefficients.length; index += 1) result = result * value + coefficients[index];
  return result;
}

function erfcPositive(value: number): number {
  const exponential = Math.exp(-value * value);
  if (exponential === 0) return 0;
  const numerator = value < 8 ? evaluatePolynomial(value, ERFC_NUMERATOR) : evaluatePolynomial(value, ERFC_LARGE_NUMERATOR);
  const denominator = value < 8 ? evaluatePolynomialWithLeadingOne(value, ERFC_DENOMINATOR) : evaluatePolynomialWithLeadingOne(value, ERFC_LARGE_DENOMINATOR);
  return (exponential * numerator) / denominator;
}

export function normalCdf(value: number): number {
  if (Number.isNaN(value)) return Number.NaN;
  if (value === Number.POSITIVE_INFINITY) return 1;
  if (value === Number.NEGATIVE_INFINITY) return 0;

  const scaled = Math.abs(value) / SQRT_2;
  if (scaled < 1) {
    const squared = scaled * scaled;
    const erf = (scaled * evaluatePolynomial(squared, ERF_NUMERATOR))
      / evaluatePolynomialWithLeadingOne(squared, ERF_DENOMINATOR);
    return 0.5 * (1 + (value < 0 ? -erf : erf));
  }

  const tail = 0.5 * erfcPositive(scaled);
  return value >= 0 ? 1 - tail : tail;
}

function normalPdf(value: number): number {
  return Math.exp(-0.5 * value * value) / SQRT_2PI;
}

/** European Black–Scholes using an annual continuously compounded rate and an actual/365 day count. */
export function blackScholes(
  spot: number,
  strike: number,
  daysToExpiry: number,
  volatility: number,
  type: OptionSide,
  rate = 0,
): OptionGreeks {
  const s = Math.max(spot, 0.000001);
  const k = Math.max(strike, 0.000001);
  const t = Math.max(daysToExpiry, 0) / 365;
  const sigma = Math.max(volatility, 0.000001);

  if (t <= 0) {
    const intrinsic = type === 'CALL' ? Math.max(s - k, 0) : Math.max(k - s, 0);
    return {
      price: intrinsic,
      delta: type === 'CALL' ? (s > k ? 1 : 0) : (s < k ? -1 : 0),
      gamma: 0,
      thetaPerDay: 0,
      vegaPerVolPoint: 0,
      rhoPerRatePoint: 0,
    };
  }

  const sqrtT = Math.sqrt(t);
  const d1 = (Math.log(s / k) + (rate + (sigma * sigma) / 2) * t) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const discount = Math.exp(-rate * t);
  const pdf = normalPdf(d1);
  const gamma = pdf / (s * sigma * sqrtT);
  const vegaPerVolPoint = (s * pdf * sqrtT) / 100;
  const rhoPerRatePoint = (k * t * discount * normalCdf(type === 'CALL' ? d2 : -d2) / 100)
    * (type === 'CALL' ? 1 : -1);

  if (type === 'CALL') {
    const price = s * normalCdf(d1) - k * discount * normalCdf(d2);
    const thetaAnnual = -(s * pdf * sigma) / (2 * sqrtT) - rate * k * discount * normalCdf(d2);
    return {
      price: Math.max(price, 0),
      delta: normalCdf(d1),
      gamma,
      thetaPerDay: thetaAnnual / 365,
      vegaPerVolPoint,
      rhoPerRatePoint,
    };
  }

  const price = k * discount * normalCdf(-d2) - s * normalCdf(-d1);
  const thetaAnnual = -(s * pdf * sigma) / (2 * sqrtT) + rate * k * discount * normalCdf(-d2);
  return {
    price: Math.max(price, 0),
    delta: normalCdf(d1) - 1,
    gamma,
    thetaPerDay: thetaAnnual / 365,
    vegaPerVolPoint,
    rhoPerRatePoint,
  };
}

export function impliedVolatility(
  marketPrice: number,
  spot: number,
  strike: number,
  daysToExpiry: number,
  type: OptionSide,
  rate = 0,
): number | undefined {
  if (!Number.isFinite(marketPrice) || marketPrice <= 0
    || !Number.isFinite(spot) || spot <= 0
    || !Number.isFinite(strike) || strike <= 0
    || !Number.isFinite(daysToExpiry) || daysToExpiry <= 0
    || !Number.isFinite(rate)
    || (type !== 'CALL' && type !== 'PUT')) return undefined;

  const timeToExpiry = daysToExpiry / 365;
  const discountedStrike = strike * Math.exp(-rate * timeToExpiry);
  if (!Number.isFinite(discountedStrike)) return undefined;
  const lowerBound = type === 'CALL'
    ? Math.max(spot - discountedStrike, 0)
    : Math.max(discountedStrike - spot, 0);
  const upperBound = type === 'CALL' ? spot : discountedStrike;
  const priceTolerance = Math.max(1, spot, discountedStrike) * 1e-10;
  if (marketPrice <= lowerBound + priceTolerance || marketPrice >= upperBound) return undefined;

  let low = 0.000001;
  let high = 5;
  const highestModelPrice = blackScholes(spot, strike, daysToExpiry, high, type, rate).price;
  if (!Number.isFinite(highestModelPrice) || highestModelPrice < marketPrice) return undefined;

  for (let iteration = 0; iteration < 80; iteration += 1) {
    const middle = (low + high) / 2;
    const modelPrice = blackScholes(spot, strike, daysToExpiry, middle, type, rate).price;
    if (modelPrice > marketPrice) high = middle;
    else low = middle;
  }
  return (low + high) / 2;
}


export interface RiskNeutralExpiryMetrics {
  /** Risk-neutral probability of a strictly positive expiry P&L, before fees. */
  probabilityOfProfit: number;
  /** Risk-neutral probability that the option expires in the money. */
  probabilityInTheMoney: number;
  /** Undiscounted risk-neutral expected intrinsic value per underlying unit. */
  expectedIntrinsicPerUnit: number;
  /** Undiscounted risk-neutral expected expiry P&L per underlying unit, before fees. */
  expectedExpiryPnlPerUnit: number;
  /** Black–Scholes present value using the supplied IV and continuously compounded rate. */
  modelPrice: number;
  /** Model present value minus the entry premium per underlying unit. */
  modelValueGapPerUnit: number;
  /** Expiry underlying price at which the long option breaks even, before fees. */
  breakevenPrice: number;
  riskFreeRate: number;
}

/**
 * Model-implied expiry distribution for a long European option.
 *
 * This is a risk-neutral pricing measure, not a real-world forecast. It assumes
 * a lognormal underlying, constant volatility, continuous compounding, no
 * dividends/carry adjustment, and excludes fees, spread on exit and slippage.
 * Callers must gate synthetic or explicitly estimated market inputs themselves.
 */
export function getRiskNeutralExpiryMetrics(
  quote: OptionQuote,
  entryPremium: number,
  rate: number | undefined,
  sourceMode: ContractScaleSourceMode,
): RiskNeutralExpiryMetrics | null {
  if (getContractScaleIssue(quote, sourceMode) !== undefined) return null;
  const effectiveRate = rate ?? quote.riskFreeRate;
  const isFuture = quote.underlyingKind === 'FUTURE';
  const referencePrice = isFuture ? quote.forward : quote.spot;
  const carryYield = isFuture ? 0 : quote.carryYield;
  const { strike, daysToExpiry, iv, type } = quote;
  if (effectiveRate === undefined || !Number.isFinite(effectiveRate)) return null;

  if (quote.pricingStatus !== 'SUPPORTED' || quote.exerciseStyle !== 'EUROPEAN'
    || !quote.settlementStyle
    || !Number.isFinite(referencePrice) || referencePrice === undefined || referencePrice <= 0
    || !Number.isFinite(strike) || strike <= 0
    || !Number.isFinite(daysToExpiry) || daysToExpiry < 0
    || !Number.isFinite(iv) || iv <= 0 || iv > 5
    || !Number.isFinite(entryPremium) || entryPremium < 0
    || (type !== 'CALL' && type !== 'PUT')) return null;

  if (!isFuture && (!['SPOT', 'INDEX', 'FX_SPOT'].includes(quote.underlyingKind ?? '')
    || !Number.isFinite(carryYield))) return null;
  if (isFuture && quote.pricingModel !== 'BLACK_76') return null;
  if (!isFuture && quote.pricingModel !== 'BLACK_SCHOLES_CARRY') return null;

  const time = daysToExpiry / 365;
  const breakevenPrice = type === 'CALL' ? strike + entryPremium : strike - entryPremium;
  if (time === 0) {
    const intrinsic = type === 'CALL' ? Math.max(referencePrice - strike, 0) : Math.max(strike - referencePrice, 0);
    const profitable = intrinsic > entryPremium;
    const inTheMoney = intrinsic > 0;
    return {
      probabilityOfProfit: profitable ? 1 : 0,
      probabilityInTheMoney: inTheMoney ? 1 : 0,
      expectedIntrinsicPerUnit: intrinsic,
      expectedExpiryPnlPerUnit: intrinsic - entryPremium,
      modelPrice: intrinsic,
      modelValueGapPerUnit: intrinsic - entryPremium,
      breakevenPrice,
      riskFreeRate: effectiveRate,
    };
  }

  const sigmaRootTime = iv * Math.sqrt(time);
  if (!Number.isFinite(sigmaRootTime) || sigmaRootTime <= 0) return null;
  const drift = (isFuture ? 0 : effectiveRate - (carryYield ?? 0)) - 0.5 * iv * iv;
  const d2AtStrike = (Math.log(referencePrice / strike) + drift * time) / sigmaRootTime;
  const d1AtStrike = d2AtStrike + sigmaRootTime;
  const probabilityInTheMoney = type === 'CALL' ? normalCdf(d2AtStrike) : normalCdf(-d2AtStrike);

  let probabilityOfProfit = 0;
  if (breakevenPrice > 0) {
    const d2AtBreakeven = (Math.log(referencePrice / breakevenPrice) + drift * time) / sigmaRootTime;
    probabilityOfProfit = type === 'CALL' ? normalCdf(d2AtBreakeven) : normalCdf(-d2AtBreakeven);
  }

  const expectedUnderlying = isFuture ? referencePrice : referencePrice * Math.exp((effectiveRate - (carryYield ?? 0)) * time);
  const expectedIntrinsicPerUnit = Math.max(0, type === 'CALL'
    ? expectedUnderlying * normalCdf(d1AtStrike) - strike * normalCdf(d2AtStrike)
    : strike * normalCdf(-d2AtStrike) - expectedUnderlying * normalCdf(-d1AtStrike));

  const discount = Math.exp(-effectiveRate * time);
  const modelPrice = isFuture
    ? discount * (type === 'CALL'
      ? referencePrice * normalCdf(d1AtStrike) - strike * normalCdf(d2AtStrike)
      : strike * normalCdf(-d2AtStrike) - referencePrice * normalCdf(-d1AtStrike))
    : type === 'CALL'
      ? referencePrice * Math.exp(-(carryYield ?? 0) * time) * normalCdf(d1AtStrike) - strike * discount * normalCdf(d2AtStrike)
      : strike * discount * normalCdf(-d2AtStrike) - referencePrice * Math.exp(-(carryYield ?? 0) * time) * normalCdf(-d1AtStrike);

  const expectedExpiryPnlPerUnit = expectedIntrinsicPerUnit - entryPremium;
  const modelValueGapPerUnit = modelPrice - entryPremium;

  if (![probabilityOfProfit, probabilityInTheMoney, expectedIntrinsicPerUnit, modelPrice].every(Number.isFinite)) return null;
  return {
    probabilityOfProfit: Math.min(1, Math.max(0, probabilityOfProfit)),
    probabilityInTheMoney: Math.min(1, Math.max(0, probabilityInTheMoney)),
    expectedIntrinsicPerUnit,
    expectedExpiryPnlPerUnit,
    modelPrice,
    modelValueGapPerUnit,
    breakevenPrice,
    riskFreeRate: effectiveRate,
  };
}

export function getMidPrice(quote: OptionQuote): number {
  if (quote.bid > 0 && quote.ask >= quote.bid) return (quote.bid + quote.ask) / 2;
  if (quote.markPrice > 0) return quote.markPrice;
  return quote.bid > 0 ? quote.bid : Math.max(quote.ask, 0);
}

export function getSpreadPct(quote: OptionQuote): number {
  if (quote.bid <= 0 || quote.ask <= 0 || quote.ask < quote.bid) return Number.NaN;
  const mid = (quote.bid + quote.ask) / 2;
  return mid > 0 ? ((quote.ask - quote.bid) / mid) * 100 : Number.NaN;
}

export function getExpectedMove(spot: number, iv: number, days: number): number {
  return spot * iv * Math.sqrt(Math.max(days, 0) / 365);
}

export function getBreakeven(quote: OptionQuote, premiumPerUnit: number, fees: number, quantity: number): number {
  const totalCostPerUnit = premiumPerUnit + (quantity > 0 ? fees / (quantity * quote.unit) : 0);
  return quote.type === 'CALL' ? quote.strike + totalCostPerUnit : quote.strike - totalCostPerUnit;
}

export function getMaxLoss(premiumPerUnit: number, quantity: number, unit: number, fees: number): number {
  return Math.max(0, premiumPerUnit * quantity * unit + fees);
}

export function getExpiryPnl(quote: OptionQuote, expirySpot: number, premiumPerUnit: number, quantity: number, fees: number): number {
  const intrinsic = quote.type === 'CALL'
    ? Math.max(expirySpot - quote.strike, 0)
    : Math.max(quote.strike - expirySpot, 0);
  return (intrinsic - premiumPerUnit) * quantity * quote.unit - fees;
}

export function buildScenarioSeries(quote: OptionQuote, premium: number, quantity: number, fees: number) {
  const moves = [-0.2, -0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2];
  const referencePrice = getUnderlyingReferencePrice(quote);
  return moves.map((move) => {
    const expirySpot = referencePrice * (1 + move);
    return {
      move,
      label: `${move > 0 ? '+' : ''}${Math.round(move * 100)}%`,
      spot: expirySpot,
      pnl: getExpiryPnl(quote, expirySpot, premium, quantity, fees),
    };
  });
}

export interface GreekShock {
  /** Relative underlying price move in percent; 1 means +1%. */
  spotMovePercent?: number;
  /** Absolute implied-volatility move in vol points; 1 means +1 percentage point. */
  volatilityMovePoints?: number;
  /** Elapsed calendar days; time passage uses theta per day. */
  daysElapsed?: number;
  /** Absolute annual-rate move in percentage points; 1 means +1 percentage point. */
  riskFreeRateMovePoints?: number;
}

/** Local first/second-order Greek P&L approximation. It excludes cross-Greeks, fees and execution effects. */
export function estimateGreekPnl(quote: OptionQuote, quantity: number, shock: GreekShock): number {
  const referencePrice = getUnderlyingReferencePrice(quote);
  const spotChange = referencePrice * (shock.spotMovePercent ?? 0) / 100;
  const unitPnl = quote.delta * spotChange
    + 0.5 * quote.gamma * spotChange * spotChange
    + quote.vega * (shock.volatilityMovePoints ?? 0)
    + quote.theta * (shock.daysElapsed ?? 0)
    + quote.rho * (shock.riskFreeRateMovePoints ?? 0);
  return unitPnl * quantity * quote.unit;
}

export function formatExpiry(expiry: string): string {
  const date = new Date(expiry);
  if (Number.isNaN(date.getTime())) return expiry;
  return new Intl.DateTimeFormat('ar-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' }).format(date);
}
