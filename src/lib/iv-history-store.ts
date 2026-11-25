import {
  IV_HISTORY_SCHEMA_VERSION,
  isValidIVHistoryObservation,
  type IVHistoryObservation,
} from './iv-history.ts';

export const IV_HISTORY_STORAGE_KEY = 'sol-iv-history-v1';
export const IV_HISTORY_MAX_AGE_DAYS = 400;
export const IV_HISTORY_MAX_OBSERVATIONS = 2_000;

export interface IVHistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface IVHistoryEnvelope {
  schemaVersion: typeof IV_HISTORY_SCHEMA_VERSION;
  observations: IVHistoryObservation[];
}

export type IVHistoryLoadResult =
  | { ok: true; observations: IVHistoryObservation[] }
  | { ok: false; reason: 'CORRUPT_STORAGE' | 'STORAGE_UNAVAILABLE' };

export type IVHistoryAppendResult =
  | { ok: true; added: boolean; count: number; pruned: number }
  | { ok: false; reason: 'INVALID_OBSERVATION' | 'INVALID_AS_OF' | 'OUTSIDE_RETENTION' | 'ID_CONFLICT' | 'CORRUPT_STORAGE' | 'STORAGE_UNAVAILABLE' };

export type IVHistoryExportResult =
  | { ok: true; json: string; count: number }
  | { ok: false; reason: 'CORRUPT_STORAGE' | 'STORAGE_UNAVAILABLE' };

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return '{' + Object.keys(object).sort().map((key) => JSON.stringify(key) + ':' + stableJson(object[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function parseEnvelope(raw: string | null): IVHistoryLoadResult {
  if (raw === null) return { ok: true, observations: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'CORRUPT_STORAGE' };
    const envelope = parsed as Partial<IVHistoryEnvelope>;
    if (envelope.schemaVersion !== IV_HISTORY_SCHEMA_VERSION || !Array.isArray(envelope.observations)
      || !envelope.observations.every(isValidIVHistoryObservation)) {
      return { ok: false, reason: 'CORRUPT_STORAGE' };
    }
    return { ok: true, observations: envelope.observations };
  } catch {
    return { ok: false, reason: 'CORRUPT_STORAGE' };
  }
}

export function loadIVHistory(storage: IVHistoryStorage): IVHistoryLoadResult {
  try {
    return parseEnvelope(storage.getItem(IV_HISTORY_STORAGE_KEY));
  } catch {
    return { ok: false, reason: 'STORAGE_UNAVAILABLE' };
  }
}

export function appendIVHistoryObservation(
  storage: IVHistoryStorage,
  observation: IVHistoryObservation,
  asOf: string,
  options: { maxAgeDays?: number; maxObservations?: number } = {},
): IVHistoryAppendResult {
  const asOfMs = Date.parse(asOf);
  const maxAgeDays = options.maxAgeDays ?? IV_HISTORY_MAX_AGE_DAYS;
  const maxObservations = options.maxObservations ?? IV_HISTORY_MAX_OBSERVATIONS;
  if (!Number.isFinite(asOfMs)) return { ok: false, reason: 'INVALID_AS_OF' };
  if (!Number.isSafeInteger(maxAgeDays) || maxAgeDays < 1 || maxAgeDays > 3_650
    || !Number.isSafeInteger(maxObservations) || maxObservations < 1 || maxObservations > 100_000) {
    return { ok: false, reason: 'INVALID_OBSERVATION' };
  }
  if (!isValidIVHistoryObservation(observation)) return { ok: false, reason: 'INVALID_OBSERVATION' };
  const capturedAt = Date.parse(observation.capturedAt);
  const receivedAt = Date.parse(observation.receivedAt);
  if (capturedAt > asOfMs || receivedAt > asOfMs || capturedAt > receivedAt) return { ok: false, reason: 'INVALID_OBSERVATION' };
  if (capturedAt < asOfMs - maxAgeDays * 86_400_000) return { ok: false, reason: 'OUTSIDE_RETENTION' };

  const loaded = loadIVHistory(storage);
  if (!loaded.ok) return loaded;
  const existing = loaded.observations.find((item) => item.id === observation.id);
  if (existing) {
    return stableJson(existing) === stableJson(observation)
      ? { ok: true, added: false, count: loaded.observations.length, pruned: 0 }
      : { ok: false, reason: 'ID_CONFLICT' };
  }

  const cutoff = asOfMs - maxAgeDays * 86_400_000;
  const retained = [...loaded.observations, observation]
    .filter((item) => Date.parse(item.capturedAt) >= cutoff && Date.parse(item.capturedAt) <= asOfMs)
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id));
  const bounded = retained.slice(-maxObservations);
  const pruned = loaded.observations.length + 1 - bounded.length;
  const envelope: IVHistoryEnvelope = { schemaVersion: IV_HISTORY_SCHEMA_VERSION, observations: bounded };
  try {
    storage.setItem(IV_HISTORY_STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    return { ok: false, reason: 'STORAGE_UNAVAILABLE' };
  }
  return { ok: true, added: true, count: bounded.length, pruned };
}

export function exportIVHistory(storage: IVHistoryStorage): IVHistoryExportResult {
  const loaded = loadIVHistory(storage);
  if (!loaded.ok) return loaded;
  return {
    ok: true,
    count: loaded.observations.length,
    json: JSON.stringify({ schemaVersion: IV_HISTORY_SCHEMA_VERSION, observations: loaded.observations }, null, 2),
  };
}
