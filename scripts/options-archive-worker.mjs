import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { ResumableOptionsArchive } from './options-archive.mjs';
import {
  collectForwardOptionsEvents,
  createBinanceOptionsWebSocketTransport,
} from './options-collector.mjs';

const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_RUNTIME_MS = 6 * 60 * 60 * 1000;

function positiveInteger(value, fallback, maximum) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new Error('Worker configuration contains an invalid positive integer.');
  }
  return parsed;
}

export function readOptionsWorkerConfig(env = process.env) {
  const archiveRoot = typeof env.OPTIONS_ARCHIVE_DIR === 'string' ? env.OPTIONS_ARCHIVE_DIR.trim() : '';
  const streamValue = typeof env.OPTIONS_PUBLIC_STREAMS === 'string' ? env.OPTIONS_PUBLIC_STREAMS.trim() : '';
  if (!archiveRoot) throw new Error('OPTIONS_ARCHIVE_DIR is required.');
  if (!streamValue) throw new Error('OPTIONS_PUBLIC_STREAMS is required; select only permitted public streams.');
  const streams = [...new Set(streamValue.split(',').map((value) => value.trim()).filter(Boolean))];
  if (!streams.length || streams.length > 200) throw new Error('OPTIONS_PUBLIC_STREAMS must contain 1–200 unique streams.');
  return Object.freeze({
    archiveRoot: resolve(archiveRoot),
    streams,
    maxBytes: positiveInteger(env.OPTIONS_ARCHIVE_MAX_BYTES, 128 * 1024 * 1024, MAX_ARCHIVE_BYTES),
    maxRuntimeMs: positiveInteger(env.OPTIONS_ARCHIVE_MAX_RUNTIME_MS, 60 * 60 * 1000, MAX_RUNTIME_MS),
    heartbeatMs: positiveInteger(env.OPTIONS_ARCHIVE_HEARTBEAT_MS, 30_000, 5 * 60 * 1000),
    refreshExchangeInfo: env.OPTIONS_ARCHIVE_REFRESH_EXCHANGE_INFO === 'true',
  });
}

export async function runOptionsArchiveWorker({
  config,
  archive = new ResumableOptionsArchive(config.archiveRoot, { maxBytes: config.maxBytes }),
  transport,
  restTransport = { fetch: (...args) => fetch(...args) },
  signal,
  logger = (entry) => process.stdout.write(JSON.stringify(entry) + '\\n'),
  now = () => new Date().toISOString(),
} = {}) {
  if (!config || !Array.isArray(config.streams) || !config.archiveRoot) {
    throw new Error('A validated options archive worker configuration is required.');
  }
  if (!transport) {
    transport = createBinanceOptionsWebSocketTransport({ signal });
  }
  await archive.initialize();
  const initialBytes = await archive.getArchiveBytes();
  if (initialBytes > config.maxBytes) throw new Error('Existing archive already exceeds the configured quota.');
  const startedAt = now();
  logger({ type: 'worker_started', startedAt, streams: config.streams, archiveRoot: config.archiveRoot, bytes: initialBytes });
  const heartbeat = setInterval(async () => {
    try {
      const bytes = await archive.getArchiveBytes();
      logger({ type: 'worker_heartbeat', at: now(), bytes, quotaBytes: config.maxBytes });
    } catch (error) {
      logger({ type: 'worker_health_error', at: now(), code: error?.code ?? 'HEALTH_CHECK_FAILED' });
    }
  }, config.heartbeatMs);
  heartbeat.unref?.();
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason ?? new Error('Worker stopped.'));
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) onAbort();
  const runtimeTimer = setTimeout(() => controller.abort(new Error('Configured worker runtime reached.')), config.maxRuntimeMs);
  runtimeTimer.unref?.();
  try {
    const result = await collectForwardOptionsEvents({
      archive,
      transport,
      streams: config.streams,
      enabled: true,
      restTransport,
      refreshExchangeInfo: config.refreshExchangeInfo,
      signal: controller.signal,
      now,
    });
    const verification = await archive.verify();
    if (!verification.ok) throw new Error('Archive verification failed after collection: ' + verification.errors.join('; '));
    const bytes = await archive.getArchiveBytes();
    logger({ type: 'worker_stopped', at: now(), result, bytes, verifiedSegments: verification.segmentCount, archiveIntegrity: 'OK' });
    return { ...result, bytes, verification };
  } catch (error) {
    logger({ type: 'worker_failed', at: now(), code: error?.code ?? 'WORKER_FAILED', message: String(error?.message ?? error) });
    throw error;
  } finally {
    clearTimeout(runtimeTimer);
    clearInterval(heartbeat);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function main() {
  const config = readOptionsWorkerConfig();
  const controller = new AbortController();
  const stop = (signal) => controller.abort(new Error('Received ' + signal));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    await runOptionsArchiveWorker({ config, signal: controller.signal });
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(JSON.stringify({ type: 'fatal', code: error?.code ?? 'WORKER_FATAL', message: String(error?.message ?? error) }) + '\\n');
    process.exitCode = 1;
  });
}
