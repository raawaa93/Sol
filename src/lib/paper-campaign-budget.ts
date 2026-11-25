import type { PaperTrade } from './types.ts';
import { isValidPaperTradeCloseRecord } from './paper-journal.ts';

export const PAPER_CAMPAIGN_CAPITAL = 200;
export const PAPER_CAMPAIGN_MAX_LOSS = 60;
export const PAPER_CAMPAIGN_PER_TRADE_CAP = 20;

export interface PaperCampaignBudgetSummary {
  currency: string;
  cap: number;
  used: number;
  remaining: number;
  unknownEntries: number;
  currencyMismatchEntries: number;
  supportedCurrency: boolean;
  canAllocate: boolean;
}

function getTradeCurrency(trade: PaperTrade): string {
  return (trade.premiumCurrencyAtEntry ?? trade.quoteAsset ?? '').trim().toUpperCase();
}

function getTradeDebit(trade: PaperTrade): number | undefined {
  const debit = trade.premiumDebitAtEntry;
  if (Number.isFinite(debit) && debit! > 0) return debit;

  const fees = Number.isFinite(trade.fees) && trade.fees >= 0 ? trade.fees : undefined;
  if (fees === undefined) return undefined;

  const amount = trade.premiumAmountAtEntry;
  const multiplier = trade.premiumMultiplierAtEntry;
  if (Number.isFinite(amount) && amount! > 0 && Number.isFinite(multiplier) && multiplier! > 0) {
    const reconciled = amount! * multiplier! + fees;
    return Number.isFinite(reconciled) && reconciled > 0 ? reconciled : undefined;
  }

  const unit = trade.contractUnitAtEntry;
  if (Number.isFinite(trade.entryPremium) && trade.entryPremium > 0
    && Number.isFinite(trade.quantity) && trade.quantity > 0
    && Number.isFinite(unit) && unit! > 0
    && Number.isFinite(multiplier) && multiplier! > 0) {
    const reconciled = trade.entryPremium * trade.quantity * unit! * multiplier! + fees;
    return Number.isFinite(reconciled) && reconciled > 0 ? reconciled : undefined;
  }

  return undefined;
}

/**
 * Risk usage is open premium debit plus realized losses on closed PAPER trades.
 * Realized gains do not offset losses or create extra risk budget.
 */
export function summarizePaperCampaignBudget(
  trades: PaperTrade[],
  currency: string,
  cap = PAPER_CAMPAIGN_MAX_LOSS,
): PaperCampaignBudgetSummary {
  const normalizedCurrency = currency.trim().toUpperCase();
  const supportedCurrency = normalizedCurrency === 'USD' || normalizedCurrency === 'USDT';
  const effectiveCap = Number.isFinite(cap) && cap > 0 ? Math.min(cap, PAPER_CAMPAIGN_MAX_LOSS) : 0;
  let used = 0;
  let unknownEntries = 0;
  let currencyMismatchEntries = 0;

  for (const trade of trades) {
    if (getTradeCurrency(trade) !== normalizedCurrency) {
      currencyMismatchEntries += 1;
      continue;
    }
    const debit = getTradeDebit(trade);
    if (debit === undefined || !Number.isFinite(debit) || debit <= 0) {
      unknownEntries += 1;
      continue;
    }
    if (trade.close) {
      if (!isValidPaperTradeCloseRecord(trade.close, trade)
        || trade.close.currency !== normalizedCurrency) {
        unknownEntries += 1;
        continue;
      }
      used += Math.max(0, -trade.close.realizedPnl);
      continue;
    }
    used += debit;
  }

  const remaining = Math.max(0, effectiveCap - used);
  return {
    currency: normalizedCurrency,
    cap: effectiveCap,
    used,
    remaining,
    unknownEntries,
    currencyMismatchEntries,
    supportedCurrency,
    canAllocate: supportedCurrency && effectiveCap > 0 && Number.isFinite(used)
      && unknownEntries === 0 && currencyMismatchEntries === 0 && remaining > 1e-9,
  };
}

export function canAllocatePaperCampaignTrade(
  summary: PaperCampaignBudgetSummary,
  debit: number,
  currency: string,
  perTradeCap = PAPER_CAMPAIGN_PER_TRADE_CAP,
): { ok: true } | { ok: false; reason: string } {
  const normalizedCurrency = currency.trim().toUpperCase();
  const expectedRemaining = Number.isFinite(summary.cap) && Number.isFinite(summary.used)
    ? Math.max(0, summary.cap - summary.used)
    : Number.NaN;

  if (!Number.isFinite(summary.cap) || summary.cap <= 0 || summary.cap > PAPER_CAMPAIGN_MAX_LOSS
    || !Number.isFinite(summary.used) || summary.used < 0
    || !Number.isFinite(summary.remaining) || summary.remaining < 0
    || !Number.isFinite(expectedRemaining) || Math.abs(summary.remaining - expectedRemaining) > 1e-9
    || !Number.isInteger(summary.unknownEntries) || summary.unknownEntries < 0
    || !Number.isInteger(summary.currencyMismatchEntries) || summary.currencyMismatchEntries < 0) {
    return { ok: false, reason: 'INVALID_CAMPAIGN_BUDGET' };
  }
  if (!Number.isFinite(perTradeCap) || perTradeCap <= 0) {
    return { ok: false, reason: 'INVALID_PER_TRADE_CAP' };
  }
  if (!summary.supportedCurrency) return { ok: false, reason: 'UNSUPPORTED_CAMPAIGN_CURRENCY' };
  if (normalizedCurrency !== summary.currency) return { ok: false, reason: 'CAMPAIGN_CURRENCY_MISMATCH' };
  if (summary.unknownEntries > 0) return { ok: false, reason: 'UNKNOWN_EXISTING_PAPER_RISK' };
  if (summary.currencyMismatchEntries > 0) return { ok: false, reason: 'MIXED_EXISTING_PAPER_CURRENCIES' };
  if (!Number.isFinite(debit) || debit <= 0) return { ok: false, reason: 'INVALID_PAPER_DEBIT' };

  const effectivePerTradeCap = Math.min(perTradeCap, PAPER_CAMPAIGN_PER_TRADE_CAP);
  if (debit > effectivePerTradeCap + 1e-9) return { ok: false, reason: 'PER_TRADE_RISK_CAP_EXCEEDED' };
  if (debit > summary.remaining + 1e-9) return { ok: false, reason: 'CAMPAIGN_RISK_CAP_EXCEEDED' };
  if (!summary.canAllocate) return { ok: false, reason: 'INVALID_CAMPAIGN_BUDGET' };
  return { ok: true };
}
