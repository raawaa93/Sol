import type { PaperTrade } from './types.ts';

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
  if (Number.isFinite(debit) && debit! >= 0) return debit;
  const fees = Number.isFinite(trade.fees) && trade.fees >= 0 ? trade.fees : undefined;
  if (fees === undefined) return undefined;
  const amount = trade.premiumAmountAtEntry;
  const multiplier = trade.premiumMultiplierAtEntry;
  if (Number.isFinite(amount) && amount! >= 0 && Number.isFinite(multiplier) && multiplier! > 0) {
    return amount! * multiplier! + fees;
  }
  const unit = trade.contractUnitAtEntry;
  if (Number.isFinite(trade.entryPremium) && trade.entryPremium > 0
    && Number.isFinite(trade.quantity) && trade.quantity > 0
    && Number.isFinite(unit) && unit! > 0
    && Number.isFinite(multiplier) && multiplier! > 0) {
    return trade.entryPremium * trade.quantity * unit! * multiplier! + fees;
  }
  return undefined;
}

/**
 * A campaign reserves the full premium debit of every append-only PAPER entry.
 * The journal has no close/realized-P&L workflow yet, so entries remain allocated
 * until the user exports and explicitly resets the local campaign.
 */
export function summarizePaperCampaignBudget(
  trades: PaperTrade[],
  currency: string,
  cap = PAPER_CAMPAIGN_MAX_LOSS,
): PaperCampaignBudgetSummary {
  const normalizedCurrency = currency.trim().toUpperCase();
  const supportedCurrency = normalizedCurrency === 'USD' || normalizedCurrency === 'USDT';
  let used = 0;
  let unknownEntries = 0;
  let currencyMismatchEntries = 0;

  for (const trade of trades) {
    if (getTradeCurrency(trade) !== normalizedCurrency) {
      currencyMismatchEntries += 1;
      continue;
    }
    const debit = getTradeDebit(trade);
    if (debit === undefined || !Number.isFinite(debit) || debit < 0) {
      unknownEntries += 1;
      continue;
    }
    used += debit;
  }

  const remaining = Math.max(0, cap - used);
  return {
    currency: normalizedCurrency,
    cap,
    used,
    remaining,
    unknownEntries,
    currencyMismatchEntries,
    supportedCurrency,
    canAllocate: supportedCurrency && unknownEntries === 0
      && currencyMismatchEntries === 0 && remaining > 1e-9,
  };
}

export function canAllocatePaperCampaignTrade(
  summary: PaperCampaignBudgetSummary,
  debit: number,
  currency: string,
  perTradeCap = PAPER_CAMPAIGN_PER_TRADE_CAP,
): { ok: true } | { ok: false; reason: string } {
  const normalizedCurrency = currency.trim().toUpperCase();
  if (!summary.supportedCurrency) return { ok: false, reason: 'UNSUPPORTED_CAMPAIGN_CURRENCY' };
  if (normalizedCurrency !== summary.currency) return { ok: false, reason: 'CAMPAIGN_CURRENCY_MISMATCH' };
  if (summary.unknownEntries > 0) return { ok: false, reason: 'UNKNOWN_EXISTING_PAPER_RISK' };
  if (summary.currencyMismatchEntries > 0) return { ok: false, reason: 'MIXED_EXISTING_PAPER_CURRENCIES' };
  if (!Number.isFinite(debit) || debit <= 0) return { ok: false, reason: 'INVALID_PAPER_DEBIT' };
  if (debit > perTradeCap + 1e-9) return { ok: false, reason: 'PER_TRADE_RISK_CAP_EXCEEDED' };
  if (debit > summary.remaining + 1e-9) return { ok: false, reason: 'CAMPAIGN_RISK_CAP_EXCEEDED' };
  return { ok: true };
}
