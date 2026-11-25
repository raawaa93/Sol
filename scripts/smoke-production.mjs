import fs from 'node:fs';

const pageUrl = requireUrl('PUBLISHED_URL');
const pageOrigin = pageUrl.origin;
const timeoutSignal = () => AbortSignal.timeout(15_000);

if (pageOrigin !== 'https://raawaa93.github.io' || pageUrl.pathname.replace(/\/$/, '') !== '/Sol') {
  throw new Error(`Unexpected published site URL: ${pageUrl.origin}${pageUrl.pathname}`);
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

function recordUpstreamDenial(endpoint, response, payload) {
  const detail = typeof payload?.msg === 'string' ? payload.msg : 'Binance rejected the server-side market-data request.';
  const edgeRegion = response.headers.get('x-sb-edge-region') ?? 'unknown';
  const line = `⚠️ ${endpoint}: Binance returned HTTP ${response.status} from Supabase Edge region ${edgeRegion}. This tests only this server-side request and region; it does not test a user's IP or account eligibility. Live data is not verified. ${detail}`;
  console.warn(line);
  annotate('warning', 'Binance upstream request denied', line);
  appendSummary(`### Live market-data smoke test\n\n${line}\n`);
}

function ensureOk(endpoint, response, payload) {
  if (response.status === 451) {
    recordUpstreamDenial(endpoint, response, payload);
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
  const moduleSource = pageHtml.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1]
    ?? pageHtml.match(/<script[^>]+src="([^"]+)"[^>]+type="module"/)?.[1];
  const stylesheetHref = pageHtml.match(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/)?.[1]
    ?? pageHtml.match(/<link[^>]+href="([^"]+)"[^>]+rel="stylesheet"/)?.[1];
  if (!moduleSource || !stylesheetHref) {
    throw new Error('Published app shell is missing its module script or stylesheet reference.');
  }
  for (const [label, assetPath] of [['JavaScript', moduleSource], ['CSS', stylesheetHref]]) {
    const assetUrl = new URL(assetPath, pageUrl.origin);
    if (!assetUrl.pathname.startsWith(pageBase.pathname)) {
      throw new Error(`Published ${label} asset escaped the GitHub Pages project path: ${assetUrl.pathname}`);
    }
    const assetResponse = await fetch(assetUrl, { signal: timeoutSignal() });
    if (!assetResponse.ok) {
      throw new Error(`Published ${label} asset failed (HTTP ${assetResponse.status}): ${assetUrl.pathname}`);
    }
    console.log(`Published ${label} asset: HTTP ${assetResponse.status}, ${assetUrl.pathname}.`);
  }
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

  if (process.env.BINANCE_UPSTREAM_SMOKE !== 'true') {
    const line = "SKIP — GitHub-hosted production audit checks the published app and assets only. It does not call Binance: runner egress may be classified as US and return HTTP 451, which is not the Syrian user network path. Verify live market data from the intended browser/network instead.";
    console.log(line);
    annotate('notice', 'Binance upstream probe skipped on CI', line);
    appendSummary(`### Binance market-data probe\n\n${line}\n`);
    return;
  }

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

  const contracts = Array.isArray(info.optionContracts) ? info.optionContracts : [];
  const contractForSymbol = (symbol) => {
    const underlying = String(symbol?.underlying ?? '').toUpperCase();
    const contract = contracts.find((item) => String(item?.underlying ?? '').toUpperCase() === underlying);
    return {
      underlying,
      baseAsset: String(contract?.baseAsset ?? symbol?.symbol?.split('-')[0] ?? '').toUpperCase(),
      underlyingType: String(symbol?.underlyingType ?? contract?.underlyingType ?? 'UNKNOWN').toUpperCase(),
    };
  };

  // Exercise every public read-only market feed used by the app, not just the
  // BTC index and depth endpoints. Mark/ticker are bulk feeds; index and open
  // interest are sampled once for each distinct active underlying.
  const [marksResult, tickersResult] = await Promise.all([
    requestJson('mark'),
    requestJson('ticker'),
  ]);
  if (!ensureOk('mark', marksResult.response, marksResult.payload)) return;
  if (!ensureOk('ticker', tickersResult.response, tickersResult.payload)) return;
  if (!Array.isArray(marksResult.payload) || !marksResult.payload.length) {
    throw new Error('mark returned no option mark/IV records.');
  }
  if (!Array.isArray(tickersResult.payload) || !tickersResult.payload.length) {
    throw new Error('ticker returned no option ticker records.');
  }
  const marks = marksResult.payload.filter((item) => typeof item?.symbol === 'string');
  const tickers = tickersResult.payload.filter((item) => typeof item?.symbol === 'string');
  if (!marks.length || !tickers.length) {
    throw new Error('mark/ticker responses did not contain symbol-keyed records.');
  }
  const markSymbols = new Set(marks.map((item) => item.symbol));
  const tickerSymbols = new Set(tickers.map((item) => item.symbol));

  const assetGroups = new Map();
  for (const symbol of activeSymbols) {
    const details = contractForSymbol(symbol);
    if (!details.underlying || !details.baseAsset) continue;
    const current = assetGroups.get(details.underlying) ?? { ...details, symbols: [] };
    current.symbols.push(symbol);
    assetGroups.set(details.underlying, current);
  }
  if (!assetGroups.size) throw new Error('exchangeInfo did not identify any active option underlyings.');

  const chooseRepresentative = (symbols, spot) => [...symbols].sort((a, b) => {
    const daysA = (Number(a.expiryDate) - serverTime) / 86_400_000;
    const daysB = (Number(b.expiryDate) - serverTime) / 86_400_000;
    const expiryDistance = Math.abs(daysA - 30) - Math.abs(daysB - 30);
    if (Math.abs(expiryDistance) > 1e-9) return expiryDistance;
    if (spot) return Math.abs(Number(a.strikePrice) - spot) - Math.abs(Number(b.strikePrice) - spot);
    return Number(a.strikePrice) - Number(b.strikePrice);
  })[0];

  const groups = [...assetGroups.values()];
  const indexAndOiResults = await mapWithConcurrency(groups, 3, async (group) => {
    const indexResult = await requestJson('index', { underlying: group.underlying });
    if (indexResult.response.status === 451) {
      ensureOk(`index ${group.underlying}`, indexResult.response, indexResult.payload);
      return { group, index: undefined, openInterestCount: 0, upstreamDenied: true };
    }
    if (!indexResult.response.ok) {
      const detail = typeof indexResult.payload?.msg === 'string' ? indexResult.payload.msg : '';
      return { group, index: undefined, openInterestCount: 0, issue: `index HTTP ${indexResult.response.status}${detail ? `: ${detail}` : ''}` };
    }
    const indexItem = Array.isArray(indexResult.payload) ? indexResult.payload[0] : indexResult.payload;
    const spot = finitePositive(indexItem?.indexPrice);
    if (!spot) {
      return { group, index: undefined, openInterestCount: 0, issue: 'index response missing positive indexPrice' };
    }

    const representative = chooseRepresentative(group.symbols, spot);
    const expiry = String(representative?.symbol ?? '').split('-')[1];
    if (!representative || !/^\d{6}$/.test(expiry)) {
      return { group, index: spot, openInterestCount: 0, issue: 'no valid active expiry' };
    }
    const oiResult = await requestJson('openInterest', {
      underlyingAsset: group.baseAsset,
      expiration: expiry,
    });
    if (oiResult.response.status === 451) {
      ensureOk(`openInterest ${group.baseAsset} ${expiry}`, oiResult.response, oiResult.payload);
      return { group, index: spot, openInterestCount: 0, upstreamDenied: true };
    }
    if (!oiResult.response.ok) {
      const detail = typeof oiResult.payload?.msg === 'string' ? oiResult.payload.msg : '';
      return { group, index: spot, representative, openInterestCount: 0, issue: `openInterest HTTP ${oiResult.response.status}${detail ? `: ${detail}` : ''}` };
    }
    const oiItems = Array.isArray(oiResult.payload)
      ? oiResult.payload
      : oiResult.payload && typeof oiResult.payload === 'object' ? [oiResult.payload] : null;
    if (!oiItems) {
      return { group, index: spot, representative, openInterestCount: 0, issue: 'openInterest response shape invalid' };
    }
    return { group, index: spot, representative, openInterestCount: oiItems.length };
  });
  if (indexAndOiResults.some((item) => item.upstreamDenied)) return;
  const indexedAssets = indexAndOiResults.filter((item) => finitePositive(item.index));
  if (!indexedAssets.length) {
    throw new Error(`No active underlying returned a valid index price (${groups.length} checked).`);
  }

  const targetAsset = indexedAssets.find((item) => item.group.baseAsset === 'BTC') ?? indexedAssets[0];
  const target = chooseRepresentative(targetAsset.group.symbols, targetAsset.index);
  if (!target || !/^[A-Z0-9]{2,16}-\d{6}-\d+(?:\.\d+)?-[CP]$/.test(target.symbol)) {
    throw new Error('Could not select a valid active option symbol for the live depth check.');
  }
  const targetHasMark = markSymbols.has(target.symbol);
  const targetHasTicker = tickerSymbols.has(target.symbol);
  if (!targetHasMark && !targetHasTicker) {
    throw new Error(`Neither mark nor ticker returned the selected active symbol ${target.symbol}.`);
  }

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
    appendSummary(`### Live market-data smoke test\\n\\n⚠️ ${line}\\n`);
    return;
  }

  const oiRecords = indexAndOiResults.reduce((sum, item) => sum + item.openInterestCount, 0);
  const testedAssets = indexedAssets.map((item) => `${item.group.baseAsset}/${item.group.underlyingType}`).join(', ');
  const unavailableAssets = indexAndOiResults.filter((item) => item.issue)
    .map((item) => `${item.group.baseAsset}: ${item.issue}`).join('; ');
  const coverageNote = unavailableAssets ? ` Partial endpoint coverage: ${unavailableAssets}.` : '';
  const line = `PASS — published app shell HTTP ${pageResponse.status} (${pageMs} ms); exchangeInfo active symbols ${activeSymbols.length}; mark records ${marks.length}; ticker records ${tickers.length}; index prices ${indexedAssets.length}/${groups.length} underlyings [${testedAssets}]; open-interest records ${oiRecords}; ${target.symbol} mark=${targetHasMark ? 'yes' : 'no'} ticker=${targetHasTicker ? 'yes' : 'no'}; depth ${bidCount} bids/${askCount} asks (${depthResult.elapsedMs} ms). Read-only point-in-time REST check; not streaming or an execution guarantee.${coverageNote}`;
  console.log(line);
  annotate('notice', 'Live Binance options market coverage', line);
  appendSummary(`### Live Binance options market coverage\\n\\n${line}\\n`);
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  annotate('error', 'Live market-data smoke failed', message);
  appendSummary(`### Live market-data smoke test\n\nFAIL — ${message}\n`);
  process.exitCode = 1;
});
