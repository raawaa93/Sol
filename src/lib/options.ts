import type { OptionGreeks, OptionQuote, OptionSide } from './types';

const SQRT_2 = Math.sqrt(2);
const SQRT_2PI = Math.sqrt(2 * Math.PI);

function erf(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * x);
  const polynomial = (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return sign * (1 - polynomial * Math.exp(-x * x));
}

export function normalCdf(value: number): number {
  return 0.5 * (1 + erf(value / SQRT_2));
}

function normalPdf(value: number): number {
  return Math.exp(-0.5 * value * value) / SQRT_2PI;
}

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
    };
  }

  const sqrtT = Math.sqrt(t);
  const d1 = (Math.log(s / k) + (rate + (sigma * sigma) / 2) * t) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const discount = Math.exp(-rate * t);
  const pdf = normalPdf(d1);
  const gamma = pdf / (s * sigma * sqrtT);
  const vegaPerVolPoint = (s * pdf * sqrtT) / 100;

  if (type === 'CALL') {
    const price = s * normalCdf(d1) - k * discount * normalCdf(d2);
    const thetaAnnual = -(s * pdf * sigma) / (2 * sqrtT) - rate * k * discount * normalCdf(d2);
    return {
      price: Math.max(price, 0),
      delta: normalCdf(d1),
      gamma,
      thetaPerDay: thetaAnnual / 365,
      vegaPerVolPoint,
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
  if (!Number.isFinite(marketPrice) || marketPrice <= 0 || daysToExpiry <= 0 || spot <= 0 || strike <= 0) return undefined;

  const intrinsic = type === 'CALL' ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
  const upperBound = type === 'CALL' ? spot : strike * Math.exp(-rate * daysToExpiry / 365);
  if (marketPrice <= intrinsic + 1e-8 || marketPrice >= upperBound) return undefined;

  let low = 0.000001;
  let high = 5;
  if (blackScholes(spot, strike, daysToExpiry, high, type, rate).price < marketPrice) return undefined;

  for (let iteration = 0; iteration < 80; iteration += 1) {
    const middle = (low + high) / 2;
    const modelPrice = blackScholes(spot, strike, daysToExpiry, middle, type, rate).price;
    if (modelPrice > marketPrice) high = middle;
    else low = middle;
  }
  return (low + high) / 2;
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
  return moves.map((move) => {
    const expirySpot = quote.spot * (1 + move);
    return {
      move,
      label: `${move > 0 ? '+' : ''}${Math.round(move * 100)}%`,
      spot: expirySpot,
      pnl: getExpiryPnl(quote, expirySpot, premium, quantity, fees),
    };
  });
}

export function formatExpiry(expiry: string): string {
  const date = new Date(expiry);
  if (Number.isNaN(date.getTime())) return expiry;
  return new Intl.DateTimeFormat('ar-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' }).format(date);
}
