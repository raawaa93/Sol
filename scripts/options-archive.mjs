import { createHash, randomUUID } from 'node:crypto';
import { cp, link, mkdir, open, readFile, readdir, rename, stat, unlink } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

export const OPTIONS_ARCHIVE_SCHEMA_VERSION = 1;
const ALLOWED_ENDPOINTS = new Set([
  'REST_EXCHANGE_INFO', 'REST_KLINES', 'REST_RECENT_TRADES', 'REST_DEPTH',
  'REST_TICKER', 'REST_MARK', 'REST_INDEX', 'REST_OPEN_INTEREST',
  'WS_CONNECTION', 'WS_BOOK_TICKER', 'WS_OPTION_TRADE', 'WS_MARK_PRICE', 'WS_INDEX_PRICE',
  'WS_KLINE', 'WS_OPTION_TICKER', 'WS_DEPTH',
]);
const RECORD_KINDS = new Set([
  'EXCHANGE_INFO', 'KLINE_CLOSED', 'TRADE_MARKET', 'TRADE_BLOCK',
  'BOOK_TICKER', 'DEPTH_SNAPSHOT', 'DEPTH_DIFF', 'MARK_PRICE',
  'INDEX_PRICE', 'OPEN_INTEREST', 'OPTION_TICKER', 'GAP',
]);
const KIND_ENDPOINTS = {
  EXCHANGE_INFO: ['REST_EXCHANGE_INFO'],
  KLINE_CLOSED: ['REST_KLINES', 'WS_KLINE'],
  TRADE_MARKET: ['REST_RECENT_TRADES', 'WS_OPTION_TRADE'],
  TRADE_BLOCK: ['REST_RECENT_TRADES', 'WS_OPTION_TRADE'],
  BOOK_TICKER: ['WS_BOOK_TICKER'],
  DEPTH_SNAPSHOT: ['REST_DEPTH'],
  DEPTH_DIFF: ['WS_DEPTH'],
  MARK_PRICE: ['REST_MARK', 'WS_MARK_PRICE'],
  INDEX_PRICE: ['REST_INDEX', 'WS_INDEX_PRICE'],
  OPEN_INTEREST: ['REST_OPEN_INTEREST'],
  OPTION_TICKER: ['REST_TICKER', 'WS_OPTION_TICKER'],
  GAP: ['WS_CONNECTION', 'WS_DEPTH', 'WS_OPTION_TRADE'],
};
const PROVENANCE = new Set(['OBSERVED', 'MODELLED', 'UNAVAILABLE']);
const QUALITY = new Set(['VALID', 'DEGRADED', 'INVALID']);

export class OptionsArchiveError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OptionsArchiveError';
    this.code = code;
  }
}

export function canonicalJson(value) {
  const seen = new Set();
  const normalize = (item) => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new OptionsArchiveError('NON_FINITE_VALUE', 'Archive JSON cannot contain non-finite numbers.');
      return item;
    }
    if (Array.isArray(item)) {
      if (seen.has(item)) throw new OptionsArchiveError('CYCLIC_VALUE', 'Archive JSON cannot contain cycles.');
      seen.add(item);
      const result = item.map(normalize);
      seen.delete(item);
      return result;
    }
    if (typeof item === 'object' && item) {
      if (seen.has(item)) throw new OptionsArchiveError('CYCLIC_VALUE', 'Archive JSON cannot contain cycles.');
      seen.add(item);
      const result = Object.fromEntries(Object.keys(item).sort().map((key) => {
        if (item[key] === undefined) throw new OptionsArchiveError('UNDEFINED_VALUE', 'Archive JSON cannot contain undefined values.');
        return [key, normalize(item[key])];
      }));
      seen.delete(item);
      return result;
    }
    throw new OptionsArchiveError('UNSUPPORTED_VALUE', 'Archive JSON contains an unsupported value.');
  };
  return JSON.stringify(normalize(value));
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function timestamp(value, label, allowNull = false) {
  if (allowNull && value === null) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new OptionsArchiveError('INVALID_TIMESTAMP', `${label} must be a valid timestamp or an explicitly allowed null.`);
  }
  return new Date(value).toISOString();
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new OptionsArchiveError('INVALID_RECORD', `${label} must be an object.`);
  }
}

export function validateOptionsArchiveRecord(record) {
  assertObject(record, 'record');
  if (record.schemaVersion !== OPTIONS_ARCHIVE_SCHEMA_VERSION) throw new OptionsArchiveError('SCHEMA_VERSION', 'Unsupported archive schema version.');
  if (record.provider !== 'BINANCE') throw new OptionsArchiveError('PROVIDER_NOT_ALLOWED', 'Only the approved public Binance provider is accepted.');
  if (!RECORD_KINDS.has(record.kind)) throw new OptionsArchiveError('KIND_NOT_ALLOWED', 'Unsupported archive event kind.');
  if (!KIND_ENDPOINTS[record.kind]?.includes(record.endpoint)) throw new OptionsArchiveError('KIND_ENDPOINT_MISMATCH', 'Event kind does not match its approved public source endpoint.');
  if (!ALLOWED_ENDPOINTS.has(record.endpoint)) throw new OptionsArchiveError('ENDPOINT_NOT_ALLOWED', 'Only explicitly approved public Binance endpoints and streams may be archived.');
  if (typeof record.symbol !== 'string' || record.symbol !== record.symbol.toUpperCase() || !/^[A-Z0-9-]{2,64}$/.test(record.symbol)) throw new OptionsArchiveError('INVALID_SYMBOL', 'A normalized uppercase option or underlying symbol is required.');
  if (typeof record.idempotencyKey !== 'string' || !record.idempotencyKey.trim() || record.idempotencyKey.length > 256) {
    throw new OptionsArchiveError('INVALID_IDEMPOTENCY_KEY', 'A stable idempotency key is required.');
  }
  if (!record.rawPayload || typeof record.rawPayload !== 'object' && typeof record.rawPayload !== 'string') {
    throw new OptionsArchiveError('RAW_PAYLOAD_REQUIRED', 'The unmodified source payload is required.');
  }
  const rawHash = sha256(typeof record.rawPayload === 'string' ? record.rawPayload : canonicalJson(record.rawPayload));
  if (record.rawPayloadSha256 !== rawHash) throw new OptionsArchiveError('RAW_HASH_MISMATCH', 'Raw payload SHA-256 does not match the stored payload.');

  assertObject(record.clocks, 'clocks');
  const eventAt = timestamp(record.clocks.exchangeEventAt, 'exchangeEventAt', true);
  const receivedAt = timestamp(record.clocks.receivedAt, 'receivedAt');
  const availableAt = timestamp(record.clocks.availableAt, 'availableAt');
  if (Date.parse(availableAt) < Date.parse(receivedAt)) throw new OptionsArchiveError('CLOCK_ORDER', 'Availability cannot precede local receive time.');
  if (eventAt && Date.parse(eventAt) > Date.parse(receivedAt)) throw new OptionsArchiveError('FUTURE_EVENT', 'Exchange event time cannot be later than local receive time.');

  if (record.contractSpec !== null && record.contractSpec !== undefined) {
    assertObject(record.contractSpec, 'contractSpec');
    const spec = record.contractSpec;
    const requiredText = ['symbol', 'underlying', 'optionType', 'quoteAsset', 'settlementAsset', 'premiumUnit', 'exerciseStyle', 'settlementStyle', 'sourceEndpoint', 'version'];
    if (requiredText.some((key) => typeof spec[key] !== 'string' || !spec[key].trim())
      || spec.symbol !== record.symbol
      || !['CALL', 'PUT'].includes(spec.optionType)
      || spec.premiumUnit !== 'PER_CONTRACT'
      || !['EUROPEAN', 'AMERICAN'].includes(spec.exerciseStyle)
      || !['CASH', 'PHYSICAL'].includes(spec.settlementStyle)
      || spec.sourceEndpoint !== 'REST_EXCHANGE_INFO'
      || !Number.isFinite(spec.strike) || spec.strike <= 0
      || !Number.isFinite(spec.unit) || spec.unit <= 0
      || !Number.isFinite(Date.parse(spec.expiryAt))) {
      throw new OptionsArchiveError('CONTRACT_SPEC_INCOMPLETE', 'Contract specification is missing verified symbol, unit, premium, currency, exercise, settlement, strike or expiry terms.');
    }
    if (spec.settlementStyle === 'CASH' && (!Number.isFinite(spec.cashSettlementMultiplier) || spec.cashSettlementMultiplier <= 0)) {
      throw new OptionsArchiveError('CONTRACT_SPEC_INCOMPLETE', 'Cash-settled contracts require an explicit positive settlement multiplier.');
    }
    if (spec.settlementStyle === 'PHYSICAL' && (!Array.isArray(spec.deliverables) || spec.deliverables.length === 0)) {
      throw new OptionsArchiveError('CONTRACT_SPEC_INCOMPLETE', 'Physically settled contracts require explicit deliverables.');
    }
    const fingerprint = sha256(canonicalJson(record.contractSpec));
    if (record.contractSpecFingerprint !== fingerprint) throw new OptionsArchiveError('CONTRACT_FINGERPRINT_MISMATCH', 'Contract specification fingerprint is invalid.');
    timestamp(record.contractSpecObservedAt, 'contractSpecObservedAt');
    timestamp(record.contractSpecAvailableAt, 'contractSpecAvailableAt');
    if (Date.parse(record.contractSpecAvailableAt) < Date.parse(record.contractSpecObservedAt)) {
      throw new OptionsArchiveError('CLOCK_ORDER', 'Contract specification availability cannot precede its observation.');
    }
  } else if (record.contractSpecFingerprint !== null && record.contractSpecFingerprint !== undefined) {
    throw new OptionsArchiveError('CONTRACT_FINGERPRINT_MISMATCH', 'A contract fingerprint cannot exist without its specification.');
  }

  if (!Array.isArray(record.fields)) throw new OptionsArchiveError('FIELDS_REQUIRED', 'Per-field observations must be an array.');
  for (const field of record.fields) {
    assertObject(field, 'field');
    if (typeof field.name !== 'string' || !field.name.trim()) throw new OptionsArchiveError('FIELD_NAME_REQUIRED', 'Every field needs a name.');
    if (!Object.hasOwn(field, 'value') || field.value === undefined || (field.provenance === 'OBSERVED' && field.value === null)) throw new OptionsArchiveError('FIELD_VALUE_REQUIRED', 'Observed fields must carry an explicit non-null source value.');
    if (!PROVENANCE.has(field.provenance)) throw new OptionsArchiveError('FIELD_PROVENANCE', 'Every field needs explicit provenance.');
    if (typeof field.unit !== 'string' || !field.unit.trim()) throw new OptionsArchiveError('FIELD_UNIT_REQUIRED', 'Every field needs an explicit unit.');
    if (typeof field.sourcePath !== 'string' || !field.sourcePath.trim()) throw new OptionsArchiveError('FIELD_SOURCE_REQUIRED', 'Every field needs a source path.');
    const fieldEventAt = timestamp(field.exchangeEventAt, `${field.name}.exchangeEventAt`, true);
    const fieldReceivedAt = timestamp(field.receivedAt, `${field.name}.receivedAt`);
    const fieldAvailableAt = timestamp(field.availableAt, `${field.name}.availableAt`);
    if (Date.parse(fieldAvailableAt) < Date.parse(fieldReceivedAt)) throw new OptionsArchiveError('CLOCK_ORDER', `${field.name} availability precedes receipt.`);
    if (fieldEventAt && Date.parse(fieldEventAt) > Date.parse(fieldReceivedAt)) throw new OptionsArchiveError('FUTURE_EVENT', `${field.name} event time is after receipt.`);
    if (field.staleAfterMs !== null && (!Number.isSafeInteger(field.staleAfterMs) || field.staleAfterMs <= 0)) {
      throw new OptionsArchiveError('INVALID_STALENESS', `${field.name} staleAfterMs must be a positive integer or null.`);
    }
  }
  assertObject(record.quality, 'quality');
  if (!QUALITY.has(record.quality.status) || !Array.isArray(record.quality.flags)) {
    throw new OptionsArchiveError('INVALID_QUALITY', 'Record quality must include a supported status and flags array.');
  }
  if (record.quality.status === 'VALID' && !eventAt) throw new OptionsArchiveError('EVENT_TIME_REQUIRED_FOR_VALID_RECORD', 'A valid record must have an exchange event timestamp.');
  if (typeof record.historicalBackfill !== 'boolean') throw new OptionsArchiveError('BACKFILL_FLAG_REQUIRED', 'historicalBackfill must be explicit.');
  return record;
}

export function createOptionsArchiveRecord(input) {
  const rawPayload = input.rawPayload;
  const rawPayloadSha256 = sha256(typeof rawPayload === 'string' ? rawPayload : canonicalJson(rawPayload));
  const record = {
    ...input,
    schemaVersion: OPTIONS_ARCHIVE_SCHEMA_VERSION,
    provider: 'BINANCE',
    rawPayloadSha256,
    ...(input.contractSpec ? {
      contractSpecFingerprint: sha256(canonicalJson(input.contractSpec)),
    } : {}),
  };
  validateOptionsArchiveRecord(record);
  return record;
}

export function evaluateOptionsPointInTime(record, decisionAt, requiredFields) {
  const reasons = [];
  try { validateOptionsArchiveRecord(record); } catch (error) {
    return { eligible: false, reasons: [error.code ?? 'INVALID_RECORD'] };
  }
  const decision = Date.parse(decisionAt);
  if (!Number.isFinite(decision)) return { eligible: false, reasons: ['INVALID_DECISION_TIME'] };
  if (!Array.isArray(requiredFields) || requiredFields.length === 0) return { eligible: false, reasons: ['REQUIRED_FIELDS_EMPTY'] };
  if (record.historicalBackfill) reasons.push('HISTORICAL_BACKFILL');
  if (record.quality.status !== 'VALID') reasons.push('RECORD_QUALITY_NOT_VALID');
  if (!record.contractSpec || !record.contractSpecAvailableAt) reasons.push('CONTRACT_SPEC_UNAVAILABLE');
  else if (Date.parse(record.contractSpecAvailableAt) > decision) reasons.push('CONTRACT_SPEC_LOOKAHEAD');
  if (Date.parse(record.clocks.receivedAt) > decision || Date.parse(record.clocks.availableAt) > decision) reasons.push('RECORD_NOT_AVAILABLE');
  for (const name of requiredFields) {
    const field = record.fields.find((item) => item.name === name);
    if (!field) { reasons.push(`FIELD_MISSING:${name}`); continue; }
    if (field.provenance !== 'OBSERVED') reasons.push(`FIELD_NOT_OBSERVED:${name}`);
    if (!field.exchangeEventAt) reasons.push(`EVENT_TIME_MISSING:${name}`);
    if (Date.parse(field.receivedAt) > decision || Date.parse(field.availableAt) > decision) reasons.push(`FIELD_NOT_AVAILABLE:${name}`);
    if (field.staleAfterMs === null || !field.exchangeEventAt
      || decision - Date.parse(field.exchangeEventAt) > field.staleAfterMs) reasons.push(`FIELD_STALE_OR_UNBOUNDED:${name}`);
  }
  return { eligible: reasons.length === 0, reasons };
}

async function fsyncDirectory(path) {
  const handle = await open(path, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function writeDurable(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  const handle = await open(temp, 'wx', 0o600);
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally { await handle.close(); }
  await rename(temp, path);
  await fsyncDirectory(dirname(path));
}

async function walkFiles(root) {
  const found = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...await walkFiles(path));
    else found.push(path);
  }
  return found;
}

function recordIdentity(record) {
  return `${record.provider}|${record.endpoint}|${record.symbol}|${record.idempotencyKey}`;
}

function symbolPartition(symbol) { return sha256(symbol).slice(0, 16); }

function recordDate(record) {
  return new Date(record.clocks.exchangeEventAt ?? record.clocks.receivedAt).toISOString().slice(0, 10);
}

function cursorEnvelope(value, updatedAt) {
  const body = { schemaVersion: 1, value: value ?? null, updatedAt };
  return { ...body, checksum: sha256(canonicalJson(body)) };
}

function verifyCursor(cursor) {
  if (!cursor || cursor.schemaVersion !== 1 || typeof cursor.checksum !== 'string') {
    throw new OptionsArchiveError('CURSOR_INVALID', 'Archive cursor is malformed.');
  }
  const { checksum, ...body } = cursor;
  if (sha256(canonicalJson(body)) !== checksum) throw new OptionsArchiveError('CURSOR_CORRUPT', 'Archive cursor checksum does not match.');
  return cursor.value;
}

export class ResumableOptionsArchive {
  constructor(root, options = {}) {
    this.root = resolve(root);
    this.maxBytes = options.maxBytes ?? 512 * 1024 * 1024;
    this.leaseTtlMs = options.leaseTtlMs ?? 30_000;
    if (!Number.isSafeInteger(this.maxBytes) || this.maxBytes <= 0
      || !Number.isSafeInteger(this.leaseTtlMs) || this.leaseTtlMs < 1_000) {
      throw new OptionsArchiveError('INVALID_ARCHIVE_LIMIT', 'Archive quota and lease TTL must be positive safe integers.');
    }
    this.index = new Map();
    this.initialized = false;
  }

  async initialize() {
    await mkdir(join(this.root, 'segments'), { recursive: true });
    await mkdir(join(this.root, '.tmp'), { recursive: true });
    const report = await this.verify();
    const fatalErrors = report.errors.filter((error) => !error.startsWith('ORPHAN_TEMP_FILE:'));
    if (fatalErrors.length) throw new OptionsArchiveError('ARCHIVE_CORRUPT', fatalErrors.join('; '));
    this.index = new Map(report.index);
    this.initialized = true;
    // Orphan temp segments are recoverable only after the exclusive writer
    // lease is acquired; initialize must not delete files owned by a live writer.
    return { ...report, ok: true };
  }

  async acquireWriterLease() {
    if (!this.initialized) await this.initialize();
    const path = join(this.root, '.writer.lock');
    const token = randomUUID();
    const expiresAt = Date.now() + this.leaseTtlMs;
    const lock = { token, pid: process.pid, host: process.env.HOSTNAME ?? 'local', expiresAt };
    try {
      const handle = await open(path, 'wx', 0o600);
      try { await handle.writeFile(canonicalJson(lock), 'utf8'); await handle.sync(); } finally { await handle.close(); }
      await fsyncDirectory(this.root);
      const lease = { path, token, expiresAt };
      try {
        await this.cleanTemporaryFiles(lease);
        const report = await this.verify();
        if (!report.ok) throw new OptionsArchiveError('ARCHIVE_CORRUPT', report.errors.join('; '));
        this.index = new Map(report.index);
        return lease;
      } catch (cleanupError) {
        await this.releaseWriterLease(lease);
        throw cleanupError;
      }
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let current;
      try { current = JSON.parse(await readFile(path, 'utf8')); } catch {
        throw new OptionsArchiveError('WRITER_LEASE_CORRUPT', 'Existing writer lease cannot be safely inspected.');
      }
      const recoveryPath = join(this.root, '.writer.recovery.lock');
      const recoveryToken = randomUUID();
      let recoveryHandle;
      try {
        recoveryHandle = await open(recoveryPath, 'wx', 0o600);
        await recoveryHandle.writeFile(canonicalJson({ token: recoveryToken, pid: process.pid }), 'utf8');
        await recoveryHandle.sync();
      } catch (recoveryError) {
        if (recoveryError.code === 'EEXIST') {
          throw new OptionsArchiveError('WRITER_LEASE_RECOVERY_BUSY', 'Another process is checking the expired writer lease.');
        }
        throw recoveryError;
      } finally {
        await recoveryHandle?.close();
      }
      try {
        // Serialize stale-lock reclamation. Re-read under the recovery lock so
        // competing contenders cannot unlink a lease created by another one.
        let latest;
        try { latest = JSON.parse(await readFile(path, 'utf8')); } catch {
          throw new OptionsArchiveError('WRITER_LEASE_CORRUPT', 'Writer lease changed or cannot be safely inspected during recovery.');
        }
        const expired = Number.isFinite(latest.expiresAt) && latest.expiresAt <= Date.now();
        let processAlive = true;
        if (latest.host === (process.env.HOSTNAME ?? 'local') && Number.isSafeInteger(latest.pid)) {
          try { process.kill(latest.pid, 0); } catch (probe) { processAlive = probe.code === 'EPERM'; }
        }
        if (latest.token !== current.token || !expired || processAlive) {
          throw new OptionsArchiveError('WRITER_LEASE_HELD', 'Another archive writer currently holds the lease.');
        }
        await unlink(path);
      } finally {
        try {
          const recovery = JSON.parse(await readFile(recoveryPath, 'utf8'));
          if (recovery.token === recoveryToken) await unlink(recoveryPath);
        } catch (cleanupError) {
          if (cleanupError.code !== 'ENOENT') throw cleanupError;
        }
      }
      return this.acquireWriterLease();
    }
  }

  async renewWriterLease(lease) {
    await this.assertLease(lease);
    const expiresAt = Date.now() + this.leaseTtlMs;
    const lock = { token: lease.token, pid: process.pid, host: process.env.HOSTNAME ?? 'local', expiresAt };
    await writeDurable(lease.path, canonicalJson(lock));
    lease.expiresAt = expiresAt;
    return lease;
  }

  async assertLease(lease) {
    if (!lease?.token) throw new OptionsArchiveError('WRITER_LEASE_REQUIRED', 'A writer lease is required for archive writes.');
    let current;
    try { current = JSON.parse(await readFile(lease.path, 'utf8')); } catch {
      throw new OptionsArchiveError('WRITER_LEASE_LOST', 'Writer lease file is missing or unreadable.');
    }
    if (current.token !== lease.token || current.expiresAt <= Date.now()) {
      throw new OptionsArchiveError('WRITER_LEASE_LOST', 'Writer lease expired or was replaced.');
    }
  }

  async releaseWriterLease(lease) {
    if (!lease?.path || !lease?.token) return;
    try {
      const current = JSON.parse(await readFile(lease.path, 'utf8'));
      if (current.token === lease.token) {
        await unlink(lease.path);
        await fsyncDirectory(this.root);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  async readCursor() {
    const path = join(this.root, 'cursor.json');
    try { return verifyCursor(JSON.parse(await readFile(path, 'utf8'))); }
    catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async writeCursor(value) {
    const envelope = cursorEnvelope(value, new Date().toISOString());
    await writeDurable(join(this.root, 'cursor.json'), canonicalJson(envelope));
    return envelope;
  }

  async getArchiveBytes() {
    const files = await walkFiles(join(this.root, 'segments'));
    let total = 0;
    for (const file of files) total += (await stat(file)).size;
    return total;
  }

  async cleanTemporaryFiles(lease) {
    await this.assertLease(lease);
    const tempRoot = join(this.root, '.tmp');
    const entries = await readdir(tempRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.ndjson.tmp')) {
        throw new OptionsArchiveError('TEMP_DIRECTORY_UNEXPECTED_ENTRY', 'Archive temp directory contains an unexpected entry; manual inspection is required.');
      }
      await unlink(join(tempRoot, entry.name));
    }
    if (entries.length) await fsyncDirectory(tempRoot);
  }

  async appendBatch(records, options = {}) {
    if (!this.initialized) await this.initialize();
    await this.assertLease(options.lease);
    await this.cleanTemporaryFiles(options.lease);
    if (!Array.isArray(records) || records.length === 0) throw new OptionsArchiveError('EMPTY_BATCH', 'At least one archive record is required.');
    const groups = new Map();
    let duplicates = 0;
    const pending = new Map();

    for (const record of records) {
      validateOptionsArchiveRecord(record);
      const identity = recordIdentity(record);
      const recordHash = sha256(canonicalJson(record));
      const existing = this.index.get(identity) ?? pending.get(identity);
      if (existing) {
        if (existing !== recordHash) throw new OptionsArchiveError('IDEMPOTENCY_CONFLICT', 'An idempotency key was reused with different content.');
        duplicates += 1;
        continue;
      }
      pending.set(identity, recordHash);
      const date = recordDate(record);
      const partition = join(record.kind.toLowerCase(), symbolPartition(record.symbol), date);
      if (!groups.has(partition)) groups.set(partition, []);
      groups.get(partition).push(record);
    }

    const segments = [];
    let newBytes = 0;
    for (const [partition, group] of groups) {
      const content = group.map((record) => canonicalJson(record)).join('\n') + '\n';
      const hash = sha256(content);
      const path = join(this.root, 'segments', partition, `${hash}.ndjson`);
      newBytes += Buffer.byteLength(content);
      segments.push({ path, content, hash, group });
    }
    const currentBytes = await this.getArchiveBytes();
    if (currentBytes + newBytes > this.maxBytes) throw new OptionsArchiveError('ARCHIVE_QUOTA_EXCEEDED', 'Archive quota would be exceeded; no segment or cursor was committed.');

    const committed = [];
    for (const segment of segments) {
      await this.assertLease(options.lease);
      await mkdir(dirname(segment.path), { recursive: true });
      const temp = join(this.root, '.tmp', `${randomUUID()}.ndjson.tmp`);
      const handle = await open(temp, 'wx', 0o600);
      try { await handle.writeFile(segment.content, 'utf8'); await handle.sync(); } finally { await handle.close(); }
      try {
        await link(temp, segment.path);
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const existing = await readFile(segment.path, 'utf8');
        if (existing !== segment.content) throw new OptionsArchiveError('SEGMENT_COLLISION', 'A segment path exists with different content.');
      } finally {
        await unlink(temp).catch((error) => { if (error.code !== 'ENOENT') throw error; });
      }
      await fsyncDirectory(dirname(segment.path));
      for (const record of segment.group) this.index.set(recordIdentity(record), sha256(canonicalJson(record)));
      committed.push({ hash: segment.hash, path: relative(this.root, segment.path), records: segment.group.length });
    }

    const cursorValue = {
      source: options.cursor ?? null,
      committedSegmentHashes: committed.map((segment) => segment.hash),
    };
    await this.assertLease(options.lease);
    const cursor = await this.writeCursor(cursorValue);
    return { appended: pending.size, duplicates, segments: committed, cursor };
  }

  async verify() {
    const errors = [];
    const index = new Map();
    const segmentRoot = join(this.root, 'segments');
    await mkdir(segmentRoot, { recursive: true });
    const files = await walkFiles(segmentRoot);
    const segmentHashes = new Set();
    for (const file of files) {
      if (!file.endsWith('.ndjson')) { errors.push(`UNEXPECTED_FILE:${relative(this.root, file)}`); continue; }
      const content = await readFile(file, 'utf8');
      const expectedHash = file.slice(file.lastIndexOf('/') + 1).replace(/\.ndjson$/, '');
      if (sha256(content) !== expectedHash) { errors.push(`SEGMENT_HASH_MISMATCH:${relative(this.root, file)}`); continue; }
      segmentHashes.add(expectedHash);
      for (const [lineIndex, line] of content.split('\n').entries()) {
        if (!line) continue;
        try {
          const record = JSON.parse(line);
          validateOptionsArchiveRecord(record);
          const expectedPath = join('segments', record.kind.toLowerCase(), symbolPartition(record.symbol), recordDate(record), `${expectedHash}.ndjson`);
          if (relative(this.root, file) !== expectedPath) errors.push(`SEGMENT_PARTITION_MISMATCH:${relative(this.root, file)}`);
          const identity = recordIdentity(record);
          const hash = sha256(canonicalJson(record));
          const prior = index.get(identity);
          if (prior && prior !== hash) errors.push(`IDEMPOTENCY_CONFLICT:${identity}`);
          else index.set(identity, hash);
        } catch (error) {
          errors.push(`INVALID_RECORD:${relative(this.root, file)}:${lineIndex + 1}:${error.code ?? 'PARSE_ERROR'}`);
        }
      }
    }
    const tempFiles = await walkFiles(join(this.root, '.tmp'));
    for (const file of tempFiles) errors.push(`ORPHAN_TEMP_FILE:${relative(this.root, file)}`);
    try {
      const cursor = await readFile(join(this.root, 'cursor.json'), 'utf8');
      const cursorValue = verifyCursor(JSON.parse(cursor));
      if (Array.isArray(cursorValue?.committedSegmentHashes)) {
        for (const hash of cursorValue.committedSegmentHashes) {
          if (!segmentHashes.has(hash)) errors.push(`CURSOR_SEGMENT_MISSING:${hash}`);
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') errors.push(`CURSOR_INVALID:${error.code ?? 'PARSE_ERROR'}`);
    }
    return { ok: errors.length === 0, errors, index: [...index.entries()], segmentCount: files.length };
  }

  async exportTo(destination) {
    const lease = await this.acquireWriterLease();
    try {
      const report = await this.verify();
      if (!report.ok) throw new OptionsArchiveError('ARCHIVE_CORRUPT', report.errors.join('; '));
      const target = resolve(destination);
      if (target === this.root || target.startsWith(`${this.root}/`)) throw new OptionsArchiveError('EXPORT_INTO_SOURCE', 'Export destination cannot be inside the source archive.');
      await mkdir(target, { recursive: false });
      await cp(join(this.root, 'segments'), join(target, 'segments'), { recursive: true, errorOnExist: true, force: false });
      try { await cp(join(this.root, 'cursor.json'), join(target, 'cursor.json'), { errorOnExist: true, force: false }); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      const restored = new ResumableOptionsArchive(target, { maxBytes: this.maxBytes, leaseTtlMs: this.leaseTtlMs });
      return await restored.initialize();
    } finally { await this.releaseWriterLease(lease); }
  }

  static async restore(source, destination, options = {}) {
    const sourceArchive = new ResumableOptionsArchive(source, options);
    await sourceArchive.initialize();
    const lease = await sourceArchive.acquireWriterLease();
    try {
      const report = await sourceArchive.verify();
      if (!report.ok) throw new OptionsArchiveError('ARCHIVE_CORRUPT', report.errors.join('; '));
      const target = resolve(destination);
      if (target === sourceArchive.root || target.startsWith(`${sourceArchive.root}/`)) throw new OptionsArchiveError('RESTORE_INTO_SOURCE', 'Restore destination cannot be inside the source archive.');
      await mkdir(target, { recursive: false });
      await cp(join(sourceArchive.root, 'segments'), join(target, 'segments'), { recursive: true, errorOnExist: true, force: false });
      try { await cp(join(sourceArchive.root, 'cursor.json'), join(target, 'cursor.json'), { errorOnExist: true, force: false }); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      const restored = new ResumableOptionsArchive(target, options);
      return await restored.initialize();
    } finally { await sourceArchive.releaseWriterLease(lease); }
  }
}
