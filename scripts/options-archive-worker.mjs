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
  archive,
  transport,
  restTransport = { fetch: (...args) => fetch(...args) },
  signal,
  logger = (entry) => process.stdout.write(JSON.stringify(entry) + '\n'),
  now = () => new Date().toISOString(),
} = {}) {
  if (!config || !Array.isArray(config.streams) || !config.archiveRoot
    || config.streams.length === 0 || config.streams.length > 200
    || config.streams.some((stream) => typeof stream !== 'string' || !stream.trim())
    || new Set(config.streams).size !== config.streams.length
    || !Number.isSafeInteger(config.maxBytes) || config.maxBytes <= 0 || config.maxBytes > MAX_ARCHIVE_BYTES
    || !Number.isSafeInteger(config.maxRuntimeMs) || config.maxRuntimeMs <= 0 || config.maxRuntimeMs > MAX_RUNTIME_MS
    || !Number.isSafeInteger(config.heartbeatMs) || config.heartbeatMs <= 0 || config.heartbeatMs > 5 * 60 * 1000
    || typeof config.refreshExchangeInfo !== 'boolean') {
    throw new Error('A validated options archive worker configuration is required.');
  }
  const activeArchive = archive ?? new ResumableOptionsArchive(config.archiveRoot, { maxBytes: config.maxBytes });
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason ?? new Error('Worker stopped.'));
  let heartbeat;
  let runtimeTimer;
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) onAbort();
  try {
    const activeTransport = transport ?? createBinanceOptionsWebSocketTransport({ signal: controller.signal });
    await activeArchive.initialize();
    const initialBytes = await activeArchive.getArchiveBytes();
    if (initialBytes > config.maxBytes) throw new Error('Existing archive already exceeds the configured quota.');
    logger({ type: 'worker_started', at: now(), streams: config.streams, archiveRoot: config.archiveRoot, bytes: initialBytes });

    let heartbeatFailure = null;
    let heartbeatCheck = Promise.resolve();
    let heartbeatInFlight = false;
    heartbeat = setInterval(() => {
      if (heartbeatInFlight || heartbeatFailure) return;
      heartbeatInFlight = true;
      heartbeatCheck = (async () => {
        try {
          const bytes = await activeArchive.getArchiveBytes();
          if (bytes > config.maxBytes) throw new Error('Archive quota exceeded.');
          logger({ type: 'worker_heartbeat', at: now(), bytes, quotaBytes: config.maxBytes });
        } catch (error) {
          heartbeatFailure = error;
          controller.abort(error);
          logger({ type: 'worker_health_error', at: now(), code: error?.code ?? 'HEALTH_CHECK_FAILED' });
        } finally {
          heartbeatInFlight = false;
        }
      })();
    }, config.heartbeatMs);
    heartbeat.unref?.();
    runtimeTimer = setTimeout(() => controller.abort(new Error('Configured worker runtime reached.')), config.maxRuntimeMs);
    runtimeTimer.unref?.();

    const result = await collectForwardOptionsEvents({
      archive: activeArchive,
      transport: activeTransport,
      streams: config.streams,
      enabled: true,
      restTransport,
      refreshExchangeInfo: config.refreshExchangeInfo,
      onFatal: (error) => controller.abort(error),
      signal: controller.signal,
      now,
    });
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = undefined;
    }
    await heartbeatCheck;
    if (heartbeatFailure) throw heartbeatFailure;
    const verification = await activeArchive.verify();
    if (!verification.ok) throw new Error('Archive verification failed after collection: ' + verification.errors.join('; '));
    const bytes = await activeArchive.getArchiveBytes();
    if (bytes > config.maxBytes) throw new Error('Archive quota exceeded after collection.');
    const stopped = controller.signal.aborted;
    const stopReason = stopped ? String(controller.signal.reason?.message ?? 'Worker stopped by operator.') : null;
    logger({
      type: stopped ? 'worker_stopped' : 'worker_completed',
      at: now(),
      result,
      bytes,
      verifiedSegments: verification.segmentCount,
      archiveIntegrity: 'OK',
      stopReason,
    });
    return { ...result, bytes, verification, stopped, stopReason };
  } catch (error) {
    logger({ type: 'worker_failed', at: now(), code: error?.code ?? 'WORKER_FAILED', message: String(error?.message ?? error) });
    throw error;
  } finally {
    if (runtimeTimer) clearTimeout(runtimeTimer);
    if (heartbeat) clearInterval(heartbeat);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function main() {
  const config = readOptionsWorkerConfig();
  const controller = new AbortController();
  const stop = (signalName) => controller.abort(new Error('Received ' + signalName));
  const stopOnInterrupt = () => stop('SIGINT');
  const stopOnTerminate = () => stop('SIGTERM');
  process.once('SIGINT', stopOnInterrupt);
  process.once('SIGTERM', stopOnTerminate);
  try {
    await runOptionsArchiveWorker({ config, signal: controller.signal });
  } finally {
    process.removeListener('SIGINT', stopOnInterrupt);
    process.removeListener('SIGTERM', stopOnTerminate);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(JSON.stringify({ type: 'fatal', code: error?.code ?? 'WORKER_FATAL', message: String(error?.message ?? error) }) + '\n');
    process.exitCode = 1;
  });
}
