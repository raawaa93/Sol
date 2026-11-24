import type { AssetSnapshot, OptionQuote, Underlying } from './types';
import { priceOption } from './pricing-model.ts';
import { inferAssetClass } from './asset-class.ts';

/** Synthetic teaching values only; none of these spot prices or market statistics are live. */
export const DEMO_MARKETS: Record<Underlying, AssetSnapshot> = {
  BTC: {
    underlying: 'BTC',
    spot: 93420,
    dayChangePct: 1.84,
    iv30: 0.572,
    rv30: 0.486,
    openInterestValue: 2_840_000_000,
    openInterestCurrency: 'USD',
    volume24hValue: 684_000_000,
    volume24hCurrency: 'USD',
    fundingRate: 0.00012,
  },
  ETH: {
    underlying: 'ETH',
    spot: 3248,
    dayChangePct: -0.63,
    iv30: 0.638,
    rv30: 0.591,
    openInterestValue: 1_190_000_000,
    openInterestCurrency: 'USD',
    volume24hValue: 292_000_000,
    volume24hCurrency: 'USD',
    fundingRate: -0.00004,
  },
  SOL: {
    underlying: 'SOL',
    spot: 142,
    dayChangePct: 1.2,
    iv30: 0.82,
    rv30: 0.69,
    openInterestValue: 490_000_000,
    openInterestCurrency: 'USD',
    volume24hValue: 110_000_000,
    volume24hCurrency: 'USD',
    fundingRate: 0.00008,
  },
  XRP: {
    underlying: 'XRP',
    spot: 1.12,
    dayChangePct: -2.1,
    iv30: 0.94,
    rv30: 0.77,
    openInterestValue: 140_000_000,
    openInterestCurrency: 'USD',
    volume24hValue: 44_000_000,
    volume24hCurrency: 'USD',
    fundingRate: -0.00003,
  },
  DOGE: {
    underlying: 'DOGE',
    spot: 0.168,
    dayChangePct: 3.6,
    iv30: 1.06,
    rv30: 0.91,
    openInterestValue: 97_000_000,
    openInterestCurrency: 'USD',
    volume24hValue: 33_000_000,
    volume24hCurrency: 'USD',
    fundingRate: 0.00015,
  },
  BNB: {
    underlying: 'BNB',
    spot: 620.4,
    dayChangePct: 0.8,
    iv30: 0.69,
    rv30: 0.58,
    openInterestValue: 220_000_000,
    openInterestCurrency: 'USD',
    volume24hValue: 73_000_000,
    volume24hCurrency: 'USD',
    fundingRate: 0.00005,
  },
  XAU: {
    underlying: 'XAU',
    spot: 2668,
    dayChangePct: 0.35,
    iv30: 0.215,
    rv30: 0.18,
    openInterestValue: 85_000_000,
    openInterestCurrency: 'USD',
    volume24hValue: 20_000_000,
    volume24hCurrency: 'USD',
    fundingRate: 0,
  },
  XAG: {
    underlying: 'XAG',
    spot: 31.4,
    dayChangePct: -0.21,
    iv30: 0.32,
    rv30: 0.29,
    openInterestValue: 34_000_000,
    openInterestCurrency: 'USD',
    volume24hValue: 7_000_000,
    volume24hCurrency: 'USD',
    fundingRate: 0,
  },
  CL: {
    underlying: 'CL',
    spot: 69.5,
    dayChangePct: 0.42,
    iv30: 0.38,
    rv30: 0.31,
    openInterestValue: 48_000_000,
    openInterestCurrency: 'USD',
    volume24hValue: 11_000_000,
    volume24hCurrency: 'USD',
    fundingRate: 0,
  },
  BZ: {
    underlying: 'BZ',
    spot: 73.2,
    dayChangePct: 0.18,
    iv30: 0.36,
    rv30: 0.3,
    openInterestValue: 51_000_000,
    openInterestCurrency: 'USD',
    volume24hValue: 13_000_000,
    volume24hCurrency: 'USD',
    fundingRate: 0,
  },
};

const EXPIRIES = [7, 14, 30, 60];
const EXPIRY_CODE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC', year: '2-digit', month: '2-digit', day: '2-digit',
});
const STRIKE_OFFSETS = [-0.12, -0.08, -0.05, -0.025, 0, 0.025, 0.05, 0.08, 0.12];
const STRIKE_STEPS: Record<string, number> = {
  BTC: 1000,
  ETH: 50,
  SOL: 2.5,
  XRP: 0.025,
  DOGE: 0.002,
  BNB: 10,
  XAU: 50,
  XAG: 0.5,
  CL: 1,
  BZ: 1,
};

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function makeExpiry(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(8, 0, 0, 0);
  return date.toISOString();
}

function getStrikeStep(underlying: string, spot: number): number {
  const configured = STRIKE_STEPS[underlying];
  if (configured) return configured;
  const fallbackExponent = Math.floor(Math.log10(Math.max(spot, 0.000001))) - 1;
  return 10 ** fallbackExponent;
}

export function createDemoQuotes(markets = DEMO_MARKETS): OptionQuote[] {
  const quotes: OptionQuote[] = [];
  const expiries = EXPIRIES.map((days) => {
    const expiry = makeExpiry(days);
    const expiryCode = EXPIRY_CODE_FORMATTER.format(new Date(expiry)).split('/').reverse().join('');
    return { days, expiry, expiryCode };
  });

  (Object.keys(markets) as Underlying[]).forEach((underlying) => {
    const market = markets[underlying];
    const strikeStep = getStrikeStep(underlying, market.spot);
    const strikeDecimals = Math.max(1, strikeStep.toString().split('.')[1]?.length ?? 1);

    expiries.forEach(({ days, expiry, expiryCode }) => {
      const baseTermShift = days < 14 ? 0.045 : days > 30 ? -0.025 : 0;

      STRIKE_OFFSETS.forEach((offset) => {
        const strike = Math.max(strikeStep, roundTo(market.spot * (1 + offset), strikeStep));
        const actualMoneyness = strike / market.spot - 1;
        const smile = Math.abs(actualMoneyness) * 0.46 + Math.max(-actualMoneyness, 0) * 0.28;
        const iv = Math.min(1.25, Math.max(0.2, (market.iv30 ?? 0.55) + baseTermShift + smile));
        const distance = Math.abs(actualMoneyness);
        const compactStrike = Number.isInteger(strike) ? String(strike) : strike.toFixed(strikeDecimals);

        (['CALL', 'PUT'] as const).forEach((type) => {
          const isFuture = underlying === 'CL' || underlying === 'BZ';
          const underlyingKind = isFuture ? 'FUTURE' as const : 'SPOT' as const;
          const exerciseStyle = 'EUROPEAN' as const;
          const settlementStyle = isFuture ? 'PHYSICAL' as const : 'CASH' as const;
          const forward = isFuture ? market.spot : undefined;
          const pricing = priceOption({
            underlyingKind,
            exerciseStyle,
            settlementStyle,
            spot: isFuture ? undefined : market.spot,
            forward,
            strike,
            daysToExpiry: days,
            volatility: iv,
            type,
            rate: 0,
            carryYield: isFuture ? undefined : 0,
          });
          if (pricing.status !== 'SUPPORTED') return;
          const greeks = pricing.greeks;
          const spreadFraction = 0.015 + Math.min(distance * 0.45, 0.12) + (days < 14 ? 0.008 : 0);
          const halfSpread = Math.max(greeks.price * spreadFraction / 2, market.spot * 0.000025);
          const bid = Math.max(greeks.price - halfSpread, 0.000001);
          const ask = Math.max(greeks.price + halfSpread, bid + market.spot * 0.000025);
          const directionalInterest = Math.max(0.15, 1 - distance * 5);
          const sideBias = type === 'PUT' ? 1.08 : 0.94;
          const expiryBias = days === 30 ? 1.15 : days === 60 ? 0.78 : 0.58;
          const openInterest = Math.round((180 + directionalInterest * 950) * sideBias * expiryBias);
          const volume = Math.max(0, Math.round(openInterest * (0.025 + (1 - distance) * 0.035)));
          const symbol = `${underlying}-${expiryCode}-${compactStrike}-${type === 'CALL' ? 'C' : 'P'}`;

          quotes.push({
            id: symbol,
            symbol,
            underlying,
            assetClass: inferAssetClass(underlying),
            venue: 'DEMO',
            underlyingKind,
            forward,
            carryYield: isFuture ? undefined : 0,
            riskFreeRate: 0,
            pricingStatus: 'ASSUMED',
            pricingModel: pricing.model,
            pricingReason: 'Synthetic teaching data; rates and carry are assumed to be zero.',
            exerciseStyle,
            settlementStyle,
            quoteAsset: 'USD',
            settlementAsset: 'USD',
            contractMultiplier: 1,
            expiry,
            daysToExpiry: days,
            strike,
            type,
            bid,
            ask,
            markPrice: greeks.price,
            priceSource: 'MODEL',
            iv,
            delta: greeks.delta,
            gamma: greeks.gamma,
            theta: greeks.thetaPerDay,
            vega: greeks.vegaPerVolPoint,
            rho: greeks.rhoPerRatePoint,
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
