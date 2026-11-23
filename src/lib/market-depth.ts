import type { BinanceDepthLevel } from './binance.ts';

export interface BookFillEstimate {
  requestedQuantity: number;
  /** Quantity visible in the supplied snapshot, capped at the requested size. */
  visibleQuantity: number;
  complete: boolean;
  /** Only supplied when the entire requested size is visible; never extrapolated. */
  averagePrice?: number;
  worstPrice?: number;
  slippageFromBestPct?: number;
}

/**
 * Estimate a marketable fill against one point-in-time order-book snapshot.
 * This is not an execution promise: the book may change before an order arrives.
 */
export function estimateBookFill(levels: BinanceDepthLevel[], requestedQuantity: number): BookFillEstimate | null {
  if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) return null;
  const usableLevels = levels.filter((level) => Number.isFinite(level.price) && level.price > 0
    && Number.isFinite(level.quantity) && level.quantity > 0);
  if (!usableLevels.length) return null;

  let remaining = requestedQuantity;
  let visibleQuantity = 0;
  let notional = 0;
  let worstPrice: number | undefined;
  const bestPrice = usableLevels[0].price;

  for (const level of usableLevels) {
    if (remaining <= 0) break;
    const filledAtLevel = Math.min(remaining, level.quantity);
    visibleQuantity += filledAtLevel;
    notional += filledAtLevel * level.price;
    remaining -= filledAtLevel;
    worstPrice = level.price;
  }

  // Do not classify even a tiny liquidity shortfall as fillable: this UI must never extrapolate.
  const complete = remaining <= 0;
  return {
    requestedQuantity,
    visibleQuantity,
    complete,
    averagePrice: complete ? notional / requestedQuantity : undefined,
    worstPrice: complete ? worstPrice : undefined,
    slippageFromBestPct: complete && bestPrice > 0
      ? ((notional / requestedQuantity) / bestPrice - 1) * 100
      : undefined,
  };
}
