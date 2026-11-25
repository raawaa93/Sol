import { validateContractEconomics } from './contract-economics.ts';
import type { CanonicalPaperCloseEvent } from './paper-journal.ts';

export const PAPER_CLOSE_EVENTS_KEY = 'volterra-paper-close-events-v1';
export const PAPER_CLOSE_EVENTS_RECOVERY_KEY = 'volterra-paper-close-events-recovery-v1';

export interface PaperCloseEventsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PaperCloseEventsLoadResult {
  events: CanonicalPaperCloseEvent[];
  rejectedCount: number;
  backupAvailable: boolean;
  persistenceBlocked: boolean;
  parseError: boolean;
}

export type AppendPaperCloseEventResult =
  | { ok: true; events: CanonicalPaperCloseEvent[] }
  | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function isCanonicalPaperCloseEvent(value: unknown): value is CanonicalPaperCloseEvent {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.eventType !== 'CLOSE') return false;
  if (typeof value.id !== 'string' || !value.id.trim()
    || typeof value.tradeId !== 'string' || !value.tradeId.trim()
    || typeof value.closedAt !== 'string' || !Number.isFinite(Date.parse(value.closedAt))
    || typeof value.quantity !== 'number' || !Number.isFinite(value.quantity) || value.quantity <= 0
    || typeof value.exitPremium !== 'number' || !Number.isFinite(value.exitPremium) || value.exitPremium <= 0
    || typeof value.exitFees !== 'number' || !Number.isFinite(value.exitFees) || value.exitFees < 0
    || value.exitFeesSource !== 'USER_ENTERED'
    || typeof value.grossProceeds !== 'number' || !Number.isFinite(value.grossProceeds) || value.grossProceeds <= 0
    || typeof value.entryDebit !== 'number' || !Number.isFinite(value.entryDebit) || value.entryDebit <= 0
    || typeof value.netPnl !== 'number' || !Number.isFinite(value.netPnl)
    || typeof value.currency !== 'string' || !value.currency.trim()
    || typeof value.spotAtExit !== 'number' || !Number.isFinite(value.spotAtExit) || value.spotAtExit <= 0
    || typeof value.bidAtExit !== 'number' || !Number.isFinite(value.bidAtExit) || value.bidAtExit <= 0
    || typeof value.askAtExit !== 'number' || !Number.isFinite(value.askAtExit) || value.askAtExit < value.bidAtExit
    || typeof value.bidQuantityAtExit !== 'number' || !Number.isFinite(value.bidQuantityAtExit) || value.bidQuantityAtExit < value.quantity
    || value.bidAskSizeUnitAtExit !== 'CONTRACTS'
    || value.bidAskSourceAtExit !== 'BOOK_TICKER'
    || !isRecord(value.sourceTimestampsAtExit)
    || typeof value.sourceTimestampsAtExit.bookTicker !== 'string'
    || !Number.isFinite(Date.parse(value.sourceTimestampsAtExit.bookTicker))
    || typeof value.sourceTimestampsAtExit.index !== 'string'
    || !Number.isFinite(Date.parse(value.sourceTimestampsAtExit.index))
    || !isRecord(value.sourceReceivedAtAtExit)
    || typeof value.sourceReceivedAtAtExit.bidAsk !== 'string'
    || !Number.isFinite(Date.parse(value.sourceReceivedAtAtExit.bidAsk))) return false;
  const economics = validateContractEconomics(value.contractEconomicsAtExit);
  if (!economics.adapterReady || !isRecord(value.contractEconomicsAtExit)) return false;
  const provenance = isRecord(value.contractEconomicsAtExit.provenance) ? value.contractEconomicsAtExit.provenance : {};
  const premium = isRecord(value.contractEconomicsAtExit.premium) ? value.contractEconomicsAtExit.premium : {};
  const multiplier = premium.multiplier;
  const closedAt = Date.parse(value.closedAt as string);
  const bookAt = Date.parse((value.sourceTimestampsAtExit as Record<string, string>).bookTicker);
  const receivedAt = Date.parse((value.sourceReceivedAtAtExit as Record<string, string>).bidAsk);
  const indexAt = Date.parse((value.sourceTimestampsAtExit as Record<string, string>).index);
  const grossExpected = (value.exitPremium as number) * (value.quantity as number) * (multiplier as number);
  const netExpected = (value.grossProceeds as number) - (value.exitFees as number) - (value.entryDebit as number);
  const tolerance = Math.max(1e-8, Math.abs(grossExpected) * 1e-8);
  return provenance.status === 'PROVIDER_VERIFIED'
    && provenance.provider === 'BINANCE'
    && provenance.sourceRef === 'https://eapi.binance.com/eapi/v1/exchangeInfo'
    && Number.isFinite(multiplier) && (multiplier as number) > 0
    && Math.abs((value.grossProceeds as number) - grossExpected) <= tolerance
    && Math.abs((value.netPnl as number) - netExpected) <= Math.max(1e-8, Math.abs(netExpected) * 1e-8)
    && value.bidAtExit === value.exitPremium
    && bookAt <= receivedAt && receivedAt <= closedAt && indexAt <= closedAt
    && receivedAt - bookAt <= 5 * 60_000
    && closedAt - receivedAt <= 5 * 60_000
    && closedAt - bookAt <= 5 * 60_000
    && closedAt - indexAt <= 5 * 60_000;
}

export function loadPaperCloseEvents(storage: PaperCloseEventsStorage): PaperCloseEventsLoadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(PAPER_CLOSE_EVENTS_KEY);
  } catch {
    return { events: [], rejectedCount: 0, backupAvailable: false, persistenceBlocked: true, parseError: false };
  }
  if (raw === null) {
    let backupAvailable = false;
    try { backupAvailable = storage.getItem(PAPER_CLOSE_EVENTS_RECOVERY_KEY) !== null; } catch { /* read-only fallback */ }
    return { events: [], rejectedCount: 0, backupAvailable, persistenceBlocked: false, parseError: false };
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return preserveRaw(storage, raw, 0, true); }
  if (!Array.isArray(parsed)) return preserveRaw(storage, raw, 0, true);
  const events = parsed.filter(isCanonicalPaperCloseEvent);
  const rejectedCount = parsed.length - events.length;
  if (rejectedCount === 0) {
    let backupAvailable = false;
    try { backupAvailable = storage.getItem(PAPER_CLOSE_EVENTS_RECOVERY_KEY) !== null; } catch { /* read-only fallback */ }
    return { events, rejectedCount: 0, backupAvailable, persistenceBlocked: false, parseError: false };
  }
  return preserveRaw(storage, raw, rejectedCount, false, events);
}

function preserveRaw(
  storage: PaperCloseEventsStorage,
  raw: string,
  rejectedCount: number,
  parseError: boolean,
  events: CanonicalPaperCloseEvent[] = [],
): PaperCloseEventsLoadResult {
  try {
    const existing = storage.getItem(PAPER_CLOSE_EVENTS_RECOVERY_KEY);
    if (existing === null) {
      storage.setItem(PAPER_CLOSE_EVENTS_RECOVERY_KEY, raw);
      return { events, rejectedCount, backupAvailable: true, persistenceBlocked: false, parseError };
    }
    if (existing === raw) return { events, rejectedCount, backupAvailable: true, persistenceBlocked: false, parseError };
    return { events, rejectedCount, backupAvailable: true, persistenceBlocked: true, parseError };
  } catch {
    return { events, rejectedCount, backupAvailable: false, persistenceBlocked: true, parseError };
  }
}

export function appendPaperCloseEvent(
  storage: PaperCloseEventsStorage,
  event: CanonicalPaperCloseEvent,
): AppendPaperCloseEventResult {
  if (!isCanonicalPaperCloseEvent(event)) return { ok: false, reason: 'INVALID_PAPER_CLOSE_EVENT' };
  const loaded = loadPaperCloseEvents(storage);
  if (loaded.persistenceBlocked) return { ok: false, reason: 'PAPER_CLOSE_EVENT_STORAGE_RECOVERY_REQUIRED' };
  if (loaded.events.some((item) => item.tradeId === event.tradeId)) {
    return { ok: false, reason: 'PAPER_TRADE_ALREADY_CLOSED' };
  }
  if (loaded.events.some((item) => item.id === event.id)) {
    return { ok: false, reason: 'DUPLICATE_PAPER_CLOSE_EVENT_ID' };
  }
  let original: string | null;
  try { original = storage.getItem(PAPER_CLOSE_EVENTS_KEY); } catch {
    return { ok: false, reason: 'PAPER_CLOSE_EVENT_STORAGE_UNAVAILABLE' };
  }
  const next = [...loaded.events, event];
  const serialized = JSON.stringify(next);
  try {
    if (storage.getItem(PAPER_CLOSE_EVENTS_KEY) !== original) {
      return { ok: false, reason: 'PAPER_CLOSE_EVENT_CONCURRENT_MODIFICATION' };
    }
    storage.setItem(PAPER_CLOSE_EVENTS_KEY, serialized);
    if (storage.getItem(PAPER_CLOSE_EVENTS_KEY) !== serialized) {
      return { ok: false, reason: 'PAPER_CLOSE_EVENT_PERSISTENCE_UNVERIFIED' };
    }
  } catch {
    return { ok: false, reason: 'PAPER_CLOSE_EVENT_PERSISTENCE_FAILED' };
  }
  return { ok: true, events: next };
}

export function readPaperCloseEventsRecovery(storage: PaperCloseEventsStorage): string | null {
  try { return storage.getItem(PAPER_CLOSE_EVENTS_RECOVERY_KEY); } catch { return null; }
}

export function readPaperCloseEventsPrimary(storage: PaperCloseEventsStorage): string | null {
  try { return storage.getItem(PAPER_CLOSE_EVENTS_KEY); } catch { return null; }
}

export function clearPaperCloseEventsRecovery(storage: PaperCloseEventsStorage & { removeItem(key: string): void }): boolean {
  try {
    storage.removeItem(PAPER_CLOSE_EVENTS_RECOVERY_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Explicit campaign reset removes active close events but preserves recovery bytes. */
export function clearPaperCloseEvents(storage: PaperCloseEventsStorage): boolean {
  try {
    storage.removeItem(PAPER_CLOSE_EVENTS_KEY);
    return true;
  } catch {
    return false;
  }
}
