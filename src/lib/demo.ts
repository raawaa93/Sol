import type { AssetSnapshot, OptionQuote, Underlying } from './types';
import { blackScholes } from './options.ts';

export const DEMO_MARKETS: Record<Underlying, AssetSnapshot> = {
  BTC: {
    underlying: 'BTC',
    spot: 93420,
    dayChangePct: 1.84,
    iv30: 0.572,
    rv30: 0.486,
    openInterestUsd: 2_840_000_000,
    volume24hUsd: 684_000_000,
    fundingRate: 0.00012,
  },
  ETH: {
    underlying: 'ETH',
    spot: 3248,
    dayChangePct: -0.63,
    iv30: 0.638,
    rv30: 0.591,
    openInterestUsd: 1_190_000_000,
    volume24hUsd: 292_000_000,
    fundingRate: -0.00004,
  },
};

const EXPIRIES = [7, 14, 30, 60];
const STRIKE_OFFSETS = [-0.12, -0.08, -0.05, -0.025, 0, 0.025, 0.05, 0.08, 0.12];

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function makeExpiry(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(8, 0, 0, 0);
  return date.toISOString();
}

export function createDemoQuotes(markets = DEMO_MARKETS): OptionQuote[] {
  const quotes: OptionQuote[] = [];

  (Object.keys(markets) as Underlying[]).forEach((underlying) => {
    const market = markets[underlying];
    const strikeStep = underlying === 'BTC' ? 1000 : 50;

    EXPIRIES.forEach((days) => {
      const expiry = makeExpiry(days);
      const baseTermShift = days < 14 ? 0.045 : days > 30 ? -0.025 : 0;

      STRIKE_OFFSETS.forEach((offset) => {
        const strike = Math.max(strikeStep, roundTo(market.spot * (1 + offset), strikeStep));
        const actualMoneyness = strike / market.spot - 1;
        const smile = Math.abs(actualMoneyness) * 0.46 + Math.max(-actualMoneyness, 0) * 0.28;
        const iv = Math.min(1.25, Math.max(0.2, (market.iv30 ?? 0.55) + baseTermShift + smile));

        (['CALL', 'PUT'] as const).forEach((type) => {
          const greeks = blackScholes(market.spot, strike, days, iv, type);
          const distance = Math.abs(actualMoneyness);
          const spreadFraction = 0.015 + Math.min(distance * 0.45, 0.12) + (days < 14 ? 0.008 : 0);
          const halfSpread = Math.max(greeks.price * spreadFraction / 2, market.spot * 0.000025);
          const bid = Math.max(greeks.price - halfSpread, 0.05);
          const ask = Math.max(greeks.price + halfSpread, bid + 0.05);
          const directionalInterest = Math.max(0.15, 1 - distance * 5);
          const sideBias = type === 'PUT' ? 1.08 : 0.94;
          const expiryBias = days === 30 ? 1.15 : days === 60 ? 0.78 : 0.58;
          const openInterest = Math.round((180 + directionalInterest * 950) * sideBias * expiryBias);
          const volume = Math.max(0, Math.round(openInterest * (0.025 + (1 - distance) * 0.035)));
          const compactStrike = Number.isInteger(strike) ? String(strike) : strike.toFixed(1);
          const expiryCode = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'UTC', year: '2-digit', month: '2-digit', day: '2-digit',
          }).format(new Date(expiry)).split('/').reverse().join('');
          const symbol = `${underlying}-${expiryCode}-${compactStrike}-${type === 'CALL' ? 'C' : 'P'}`;

          quotes.push({
            id: symbol,
            symbol,
            underlying,
            expiry,
            daysToExpiry: days,
            strike,
            type,
            bid,
            ask,
            markPrice: greeks.price,
            iv,
            delta: greeks.delta,
            gamma: greeks.gamma,
            theta: greeks.thetaPerDay,
            vega: greeks.vegaPerVolPoint,
            openInterest,
            volume,
            spot: market.spot,
            unit: 1,
          });
        });
      });
    });
  });

  return quotes;
}

export const DEMO_QUOTES = createDemoQuotes();

export function getExpiryChoices(quotes: OptionQuote[], underlying: Underlying): Array<{ value: string; label: string; days: number }> {
  const byExpiry = new Map<string, number>();
  quotes.filter((quote) => quote.underlying === underlying).forEach((quote) => {
    byExpiry.set(quote.expiry, quote.daysToExpiry);
  });
  return [...byExpiry.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([value, days]) => ({ value, days, label: `${Math.max(0, Math.round(days))} يوم` }));
}
