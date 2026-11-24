import fs from 'node:fs';

const pageUrl = requireUrl('PUBLISHED_URL');
const proxyUrl = requireUrl('BINANCE_PROXY_URL');
const pageOrigin = pageUrl.origin;
const timeoutSignal = () => AbortSignal.timeout(15_000);

if (pageOrigin !== 'https://raawaa93.github.io' || pageUrl.pathname.replace(/\/$/, '') !== '/Sol') {
  throw new Error(`Unexpected published site URL: ${pageUrl.origin}${pageUrl.pathname}`);
}
if (proxyUrl.origin !== 'https://oyoyozdugicmnkfhjovo.supabase.co'
  || proxyUrl.pathname !== '/functions/v1/volterra-binance-market-data') {
  throw new Error('Unexpected market-data proxy URL; refusing to probe an unapproved endpoint.');
}

function requireUrl(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error(`${name} must use HTTPS.`);
  return url;
}

function appendSummary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  }
}

function annotate(level, title, message) {
  const escaped = message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  console.log(`::${level} title=${title}::${escaped}`);
}

async function requestJson(endpoint, params = {}) {
  const url = new URL(proxyUrl);
  url.searchParams.set('endpoint', endpoint);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));

  const startedAt = performance.now();
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', Origin: pageOrigin },
    signal: timeoutSignal(),
  });
  const elapsedMs = Math.round(performance.now() - startedAt);
  const allowOrigin = response.headers.get('access-control-allow-origin');
  if (allowOrigin !== pageOrigin) {
    throw new Error(`${endpoint}: expected CORS allow-origin ${pageOrigin}, got ${allowOrigin ?? 'none'}.`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`${endpoint}: proxy returned a non-JSON response (HTTP ${response.status}).`);
  }
  return { response, payload, elapsedMs };
}

function recordRegionRestriction(endpoint, response, payload) {
  const detail = typeof payload?.msg === 'string' ? payload.msg : 'Binance denied the request from the upstream region.';
  const line = `⚠️ ${endpoint}: proxy reached Binance, but upstream returned HTTP ${response.status} (regional/product restriction). Live data is not verified. ${detail}`;
  console.warn(line);
  annotate('warning', 'Binance live data restricted', line);
  appendSummary(`### Live market-data smoke test\n\n${line}\n`);
}

function ensureOk(endpoint, response, payload) {
  if (response.status === 451) {
    recordRegionRestriction(endpoint, response, payload);
    return false;
  }
  if (!response.ok) {
    const detail = typeof payload?.error === 'string' ? payload.error
      : typeof payload?.msg === 'string' ? payload.msg : '';
    throw new Error(`${endpoint}: HTTP ${response.status}${detail ? ` — ${detail}` : ''}.`);
  }
  return true;
}

function finitePositive(value) {
  if ((typeof value !== 'number' && typeof value !== 'string')
    || (typeof value === 'string' && value.trim() === '')) return undefined;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

async function main() {
  const pageStartedAt = performance.now();
  const pageResponse = await fetch(pageUrl, { signal: timeoutSignal() });
  const pageHtml = await pageResponse.text();
  const pageMs = Math.round(performance.now() - pageStartedAt);
  if (!pageResponse.ok || !pageHtml.includes('id="root"')) {
    throw new Error(`Published page did not return the expected app shell (HTTP ${pageResponse.status}).`);
  }
  console.log(`Published app shell: HTTP ${pageResponse.status}, ${pageMs} ms.`);

  const pageBase = new URL(`${pageUrl.pathname.replace(/\/?$/, '/')}`, pageUrl.origin);
  const discoveryUrl = new URL('.well-known/ard.json', pageBase);
  const discoveryResponse = await fetch(discoveryUrl, {
    headers: { Accept: 'application/json' },
    signal: timeoutSignal(),
  });
  if (!discoveryResponse.ok) {
    throw new Error(`Published ARD manifest did not load (HTTP ${discoveryResponse.status}): ${discoveryUrl.pathname}`);
  }
  const discoveryType = discoveryResponse.headers.get('content-type') ?? '';
  if (!discoveryType.includes('application/json')) {
    throw new Error(`Published ARD manifest returned unexpected content type: ${discoveryType || 'none'}.`);
  }
  const discovery = await discoveryResponse.json();
  if (!Array.isArray(discovery?.entries)) {
    throw new Error('Published ARD manifest is missing the required entries array.');
  }
  if (!pageHtml.includes('rel="ard"')) {
    throw new Error('Published app shell does not advertise its ARD manifest.');
  }
  console.log(`Published ARD manifest: HTTP ${discoveryResponse.status}, ${discovery.entries.length} entries.`);

  const llmsUrl = new URL('llms.txt', pageBase);
  const llmsResponse = await fetch(llmsUrl, { signal: timeoutSignal() });
  if (!llmsResponse.ok) {
    throw new Error(`Published llms.txt did not load (HTTP ${llmsResponse.status}).`);
  }
  console.log(`Published llms.txt: HTTP ${llmsResponse.status}.`);

  const infoResult = await requestJson('exchangeInfo');
  if (!ensureOk('exchangeInfo', infoResult.response, infoResult.payload)) return;
  const info = infoResult.payload;
  const serverTime = finitePositive(info?.serverTime);
  if (!serverTime || !Array.isArray(info?.optionSymbols)) {
    throw new Error('exchangeInfo response is missing a valid serverTime or optionSymbols array.');
  }

  const activeSymbols = info.optionSymbols.filter((item) => {
    const expiry = finitePositive(item?.expiryDate);
    return typeof item?.symbol === 'string'
      && expiry !== undefined
      && expiry > serverTime
      && (!item.status || String(item.status).toUpperCase() === 'TRADING');
  });
  if (!activeSymbols.length) throw new Error('exchangeInfo returned no active option symbols.');

  const contractForSymbol = (symbol) => {
    const underlying = String(symbol?.underlying ?? '').toUpperCase();
    const contract = Array.isArray(info.optionContracts)
      ? info.optionContracts.find((item) => String(item?.underlying ?? '').toUpperCase() === underlying)
      : undefined;
    return { underlying, baseAsset: String(contract?.baseAsset ?? symbol?.symbol?.split('-')[0] ?? '').toUpperCase() };
  };
  const btcContract = Array.isArray(info.optionContracts)
    ? info.optionContracts.find((item) => String(item?.baseAsset ?? '').toUpperCase() === 'BTC')
    : undefined;
  const chosenContract = btcContract ?? contractForSymbol(activeSymbols[0]);
  const underlying = String(chosenContract?.underlying ?? activeSymbols[0]?.underlying ?? '').toUpperCase();
  const baseAsset = String(chosenContract?.baseAsset ?? activeSymbols[0]?.symbol?.split('-')[0] ?? '').toUpperCase();
  const candidateSymbols = activeSymbols.filter((item) => {
    const details = contractForSymbol(item);
    return (underlying && details.underlying === underlying) || (!underlying && details.baseAsset === baseAsset);
  });
  const usableSymbols = candidateSymbols.length ? candidateSymbols : activeSymbols;
  const indexResult = underlying
    ? await requestJson('index', { underlying })
    : undefined;
  if (indexResult && !ensureOk('index', indexResult.response, indexResult.payload)) return;
  const indexPayload = indexResult?.payload;
  const indexItem = Array.isArray(indexPayload) ? indexPayload[0] : indexPayload;
  const spot = finitePositive(indexItem?.indexPrice);
  if (indexResult && !spot) throw new Error('index response did not contain a positive finite indexPrice.');

  const target = [...usableSymbols].sort((a, b) => {
    const expiryA = Number(a.expiryDate);
    const expiryB = Number(b.expiryDate);
    const daysA = (expiryA - serverTime) / 86_400_000;
    const daysB = (expiryB - serverTime) / 86_400_000;
    const expiryDistance = Math.abs(daysA - 30) - Math.abs(daysB - 30);
    if (Math.abs(expiryDistance) > 1e-9) return expiryDistance;
    if (spot) return Math.abs(Number(a.strikePrice) - spot) - Math.abs(Number(b.strikePrice) - spot);
    return Number(a.strikePrice) - Number(b.strikePrice);
  }).find((item) => /^[A-Z0-9]{2,16}-\d{6}-\d+(?:\.\d+)?-[CP]$/.test(item.symbol));
  if (!target) throw new Error('Could not select a valid active option symbol for the live depth check.');

  const depthResult = await requestJson('depth', { symbol: target.symbol, limit: '20' });
  if (!ensureOk('depth', depthResult.response, depthResult.payload)) return;
  const depth = depthResult.payload;
  if (!Array.isArray(depth?.bids) || !Array.isArray(depth?.asks)) {
    throw new Error('depth response is missing bids/asks arrays.');
  }
  const validLevels = (levels) => levels.filter((level) => Array.isArray(level)
    && finitePositive(level[0]) !== undefined && finitePositive(level[1]) !== undefined).length;
  const bidCount = validLevels(depth.bids);
  const askCount = validLevels(depth.asks);
  if (!bidCount && !askCount) {
    const line = `depth returned HTTP ${depthResult.response.status} for ${target.symbol}, but no positive visible bid/ask levels. This does not confirm usable liquidity.`;
    console.warn(line);
    annotate('warning', 'No visible order-book liquidity', line);
    appendSummary(`### Live market-data smoke test\n\n⚠️ ${line}\n`);
    return;
  }

  const line = `PASS — published app shell HTTP ${pageResponse.status} (${pageMs} ms); live exchangeInfo/index/depth proxy responses were valid; depth for ${target.symbol} returned ${bidCount} bids and ${askCount} asks (${depthResult.elapsedMs} ms). This is a point-in-time REST check, not streaming or an execution guarantee.`;
  console.log(line);
  annotate('notice', 'Live Binance market-data smoke', line);
  appendSummary(`### Live market-data smoke test\n\n${line}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  annotate('error', 'Live market-data smoke failed', message);
  appendSummary(`### Live market-data smoke test\n\nFAIL — ${message}\n`);
  process.exitCode = 1;
});
