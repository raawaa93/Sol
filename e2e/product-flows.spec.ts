import { expect, test } from '@playwright/test';

const PROXY_ORIGIN = 'https://market-data-proxy.test';
const proxyHeaders = {
  'access-control-allow-origin': '*',
  'content-type': 'application/json',
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('Demo explicitly labels synthetic data and asset switching updates the market context', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'مختبر الخيارات' })).toBeVisible();
  await expect(page.locator('#opportunities')).toContainText('بيانات اصطناعية للتجربة فقط');

  const assetTabs = page.getByRole('group', { name: 'الأصل الأساسي' });
  await assetTabs.getByRole('button', { name: /XRP/ }).click();
  await expect(page.locator('#overview-metrics')).toContainText('XRP/USD');
  await expect(page.locator('#scanner')).toContainText('XRP');
});

test('option type selector exposes an accessible group and pressed state', async ({ page }) => {
  const optionType = page.getByRole('group', { name: 'نوع الخيار' });
  await expect(optionType).toBeVisible();
  await expect(optionType.getByRole('button', { name: /Call/ })).toHaveAttribute('aria-pressed', 'true');
  await optionType.getByRole('button', { name: /Put/ }).click();
  await expect(optionType.getByRole('button', { name: /Put/ })).toHaveAttribute('aria-pressed', 'true');
});

test('global instrument search and local watchlist work across reloads', async ({ page }) => {
  const search = page.getByRole('searchbox', { name: 'ابحث عن رمز أو أصل' });
  await search.fill('XRP');
  await expect(page.locator('#overview-metrics')).toContainText('XRP/USD');
  await page.getByRole('button', { name: 'إضافة XRP إلى المفضلة' }).click();
  const watchlist = page.getByRole('group', { name: 'الأصول المفضلة' });
  await expect(watchlist).toContainText('XRP');
  await page.reload();
  await expect(page.getByRole('group', { name: 'الأصول المفضلة' })).toContainText('XRP');
  await page.getByRole('group', { name: 'الأصول المفضلة' }).getByRole('button', { name: /XRP/ }).click();
  await expect(page.locator('#overview-metrics')).toContainText('XRP/USD');
});

test('PAPER-only journal records and exports a local single-option scenario', async ({ page }) => {
  await page.locator('.asset-switch').getByRole('button').filter({ hasText: 'XRP' }).click();
  await expect(page.locator('#overview-metrics')).toContainText('XRP/USD');
  await expect(page.locator('#risk-budget')).toHaveValue('20');
  await expect(page.locator('#risk-budget')).toHaveAttribute('max', '20');
  await expect(page.locator('.budget-row')).toContainText('ميزانية المحاولة');
  await expect(page.locator('.campaign-risk-summary')).toContainText('60');
  await expect(page.locator('.campaign-risk-summary')).toContainText('140');
  const quantity = page.locator('#trade-lab label').filter({ hasText: 'الكمية' }).locator('input');
  await quantity.fill('100000');
  await page.getByRole('button', { name: 'أضف إلى الدفتر التجريبي' }).click();
  await expect(page.getByText('تجاوزت الصفقة سقف 20 دولاراً للمحاولة الواحدة.')).toBeVisible();
  await quantity.fill('0.01');
  await page.getByRole('button', { name: 'أضف إلى الدفتر التجريبي' }).click();
  await expect(page.getByText('أضيفت الصفقة إلى الدفتر التجريبي فقط.')).toBeVisible();
  await page.locator('.side-nav').getByRole('button', { name: 'الدفتر التجريبي' }).click();
  await expect(page.locator('#journal tbody tr')).toHaveCount(1);
  await expect(page.locator('#journal')).toContainText('PAPER ONLY');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#journal').getByRole('button', { name: 'تصدير CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('volterra-paper-journal.csv');

  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('#journal').getByRole('button', { name: 'مسح الدفتر' }).click();
  await expect(page.locator('#journal tbody tr')).toHaveCount(1);

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#journal').getByRole('button', { name: 'مسح الدفتر' }).click();
  await expect(page.locator('#journal tbody tr')).toHaveCount(0);
  await expect(page.locator('.campaign-risk-summary')).toContainText('60');
});

test('CSV asset-class and venue filters isolate traditional listed option contracts', async ({ page }) => {
  const expiry = new Date(Date.now() + 40 * 86_400_000).toISOString();
  const header = 'symbol,underlying,expiry,strike,type,bid,ask,markPrice,iv,spot,unit,timestamp,assetClass,venue,quoteAsset,settlementAsset,contractMultiplier,exerciseStyle,settlementStyle';
  const call = ['SPY-261230-700-C', 'SPY', expiry, '700', 'CALL', '5.1', '5.3', '5.2', '22%', '690', '100', new Date().toISOString(), 'EQUITY', 'CBOE', 'USD', 'USD', '100', 'AMERICAN', 'PHYSICAL'].join(',');
  const put = ['SPY-261230-680-P', 'SPY', expiry, '680', 'PUT', '4.1', '4.3', '4.2', '24%', '690', '100', new Date().toISOString(), 'EQUITY', 'ISE', '', 'USD', '100', 'AMERICAN', 'PHYSICAL'].join(',');
  const csv = `${header}\n${call}\n${put}`;

  await page.locator('section').filter({ hasText: 'MULTI-ASSET OPTIONS ·' }).locator('input[type="file"]').setInputFiles({
    name: 'spy-options.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });

  await expect(page.getByText('تم استيراد 2 عقد محلياً.')).toBeVisible();
  const assetClass = page.getByRole('combobox', { name: 'اختر فئة الأصل' });
  await expect(assetClass).toContainText('الأسهم');
  await assetClass.selectOption('EQUITY');
  await expect(page.locator('#overview-metrics')).toContainText('SPY/USD');
  const venue = page.getByRole('combobox', { name: 'اختر المنصة' });
  await expect(venue).toBeVisible();
  await venue.selectOption('ISE');
  await expect(page.locator('#overview-metrics')).toContainText('SPY');
  await expect(page.locator('#overview-metrics')).not.toContainText('SPY/USD');
  await expect(page.locator('#scanner')).toContainText('SPY-261230-680-P');
  await expect(page.locator('#scanner')).not.toContainText('SPY-261230-700-C');
});
test('asset-class selector covers every canonical class and unknown imports with an explicit empty state', async ({ page }) => {
  const expiry = new Date(Date.now() + 45 * 86_400_000).toISOString();
  const timestamp = new Date().toISOString();
  const header = 'symbol,underlying,expiry,strike,type,bid,ask,markPrice,iv,spot,unit,timestamp,assetClass,venue,quoteAsset,settlementAsset,contractMultiplier';
  const instruments = [
    ['BTC-CALL', 'BTC', 'CRYPTO', 'BINANCE', '50000'],
    ['AAPL-CALL', 'AAPL', 'EQUITY', 'CBOE', '200'],
    ['SPX-CALL', 'SPX', 'INDEX', 'CBOE', '6000'],
    ['SOFR-CALL', 'SOFR', 'RATES', 'CME', '95'],
    ['EURUSD-CALL', 'EURUSD', 'FX', 'CME', '1.1'],
    ['CL-CALL', 'CL', 'ENERGY', 'NYMEX', '75'],
    ['XAU-CALL', 'XAU', 'METALS', 'COMEX', '4000'],
    ['WHEAT-CALL', 'WHEAT', 'AGRICULTURE', 'CBOT', '600'],
    ['CARBON-CALL', 'CARBON', 'OTHER', 'OTC', '100'],
    ['ZZZ-CALL', 'ZZZ', 'UNRECOGNIZED', 'TEST', '100'],
  ];
  const rows = instruments.map(([symbol, underlying, assetClass, venue, spot]) => [
    symbol, underlying, expiry, spot, 'CALL', '2.1', '2.3', '2.2', '25%', spot, '1', timestamp,
    assetClass, venue, 'USD', 'USD', '1',
  ].join(','));
  await page.locator('section').filter({ hasText: 'MULTI-ASSET OPTIONS ·' }).locator('input[type="file"]').setInputFiles({
    name: 'all-asset-classes.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from([header, ...rows].join('\n')),
  });

  await expect(page.locator('.source-card')).toContainText('ملف محلي مستورد');
  const selector = page.getByRole('combobox', { name: 'اختر فئة الأصل' });
  const expected = [
    ['CRYPTO', 'BTC-CALL'],
    ['EQUITY', 'AAPL-CALL'],
    ['INDEX', 'SPX-CALL'],
    ['RATES', 'SOFR-CALL'],
    ['FX', 'EURUSD-CALL'],
    ['ENERGY', 'CL-CALL'],
    ['METALS', 'XAU-CALL'],
    ['AGRICULTURE', 'WHEAT-CALL'],
    ['OTHER', 'CARBON-CALL'],
    ['UNKNOWN', 'ZZZ-CALL'],
  ];
  for (const [assetClass, symbol] of expected) {
    await expect(selector.locator('option[value="' + assetClass + '"]')).toHaveCount(1);
    await selector.selectOption(assetClass);
    await expect(page.locator('#scanner')).toContainText(symbol);
  }

  await selector.selectOption('AGRICULTURE');
  await page.getByPlaceholder('سعر التنفيذ أو الرمز').fill('NO_MATCH_123');
  await expect(page.locator('#scanner .empty-state')).toContainText('لا توجد عقود مطابقة');
  await expect(page.locator('#scanner')).not.toContainText('CARBON-CALL');
});

test('CSV import stays local and replays only an explicitly scaled supported crypto option', async ({ page }) => {
  const expiry = new Date(Date.now() + 40 * 86_400_000).toISOString();
  const firstTime = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
  const secondTime = new Date(Date.now() - 60 * 60_000).toISOString();
  const header = 'symbol,underlying,expiry,strike,type,bid,ask,markPrice,iv,delta,gamma,theta,vega,openInterest,volume,spot,unit,timestamp,assetClass,venue,underlyingKind,exerciseStyle,settlementStyle,quoteAsset,settlementAsset,contractMultiplier,bidAskSource,bidAskTimestamp,bidAskReceivedAt,bidAskSizeUnit,bidQuantity,askQuantity';
  const first = [
    'BTC-custom-P', 'BTC', expiry, '40000', 'PUT', '50', '52', '51', '45%',
    '', '', '', '', '', '', '41000', '1', firstTime, 'CRYPTO', 'BINANCE', 'SPOT', 'EUROPEAN', 'CASH', 'USDT', 'USDT', '1', 'BOOK_TICKER', firstTime, new Date(Date.parse(firstTime) + 100).toISOString(), 'CONTRACTS', '10', '10',
  ].join(',');
  const second = [
    'BTC-custom-P', 'BTC', expiry, '40000', 'PUT', '60', '61', '60.5', '45%',
    '', '', '', '', '', '', '41000', '1', secondTime, 'CRYPTO', 'BINANCE', 'SPOT', 'EUROPEAN', 'CASH', 'USDT', 'USDT', '1', 'BOOK_TICKER', secondTime, new Date(Date.parse(secondTime) + 100).toISOString(), 'CONTRACTS', '10', '10',
  ].join(',');
  const csv = `${header}\n${first}\n${second}`;

  await page.locator('section').filter({ hasText: 'MULTI-ASSET OPTIONS ·' }).locator('input[type="file"]').setInputFiles({
    name: 'btc-history.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });

  await expect(page.getByText('تم استيراد 2 عقد محلياً.')).toBeVisible();
  await expect(page.locator('#overview-metrics')).toContainText('BTC');
  await expect(page.locator('#scanner')).toContainText('BTC-custom-P');
  await expect(page.locator('#historical-replay')).toContainText('إعادة تشغيل تاريخية محافظة');
  await expect(page.locator('#historical-replay .replay-trades tbody tr')).toHaveCount(1);
  await expect(page.locator('#historical-replay')).toContainText('+8');
});

test('Binance order-book UI is exercised only with a deterministic mocked REST snapshot', async ({ page }) => {
  const now = Date.now();
  await page.clock.install({ time: now });
  const expiryDate = new Date(now + 30 * 86_400_000);
  const expiryCode = expiryDate.toISOString().slice(2, 10).replaceAll('-', '');
  const symbol = `BTC-${expiryCode}-100000-C`;
  const expiryTimestamp = expiryDate.getTime();

  await page.route(`${PROXY_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    const endpoint = url.searchParams.get('endpoint');
    let payload: unknown;

    if (endpoint === 'exchangeInfo') {
      payload = {
        serverTime: now,
        optionContracts: [{ baseAsset: 'BTC', quoteAsset: 'USDT', underlying: 'BTCUSDT' }],
        optionSymbols: [{
          symbol,
          underlying: 'BTCUSDT',
          quoteAsset: 'USDT',
          side: 'CALL',
          strikePrice: '100000',
          expiryDate: expiryTimestamp,
          unit: '1',
          minQty: '0.01',
          maxQty: '10',
          priceScale: 2,
          quantityScale: 2,
          status: 'TRADING',
        }],
      };
    } else if (endpoint === 'mark') {
      payload = [{
        symbol,
        markPrice: '5000',
        bidIV: '0.52',
        askIV: '0.58',
        markIV: '0.55',
        delta: '0.55',
        gamma: '0.001',
        theta: '-10',
        vega: '20',
      }];
    } else if (endpoint === 'ticker') {
      payload = [{ symbol, bidPrice: '4900', askPrice: '5100', lastPrice: '5000', volume: '12', amount: '60000', closeTime: now }];
    } else if (endpoint === 'index') {
      payload = [{ underlying: 'BTCUSDT', indexPrice: '100000', time: now }];
    } else if (endpoint === 'openInterest') {
      payload = [];
    } else if (endpoint === 'depth') {
      payload = {
        lastUpdateId: 42,
        T: now,
        bids: [['4990', '2'], ['4980', '3']],
        asks: [['5010', '0.5'], ['5020', '3']],
      };
    } else {
      throw new Error(`Unexpected mocked market-data endpoint: ${endpoint ?? '(missing)'}`);
    }

    await route.fulfill({ status: 200, headers: proxyHeaders, body: JSON.stringify(payload) });
  });

  await page.getByRole('button', { name: 'تحميل Binance' }).click();
  const depthPanel = page.locator('.market-depth-panel');
  await expect(depthPanel).toContainText('لقطة REST');
  await expect(depthPanel).toContainText('5,010');
  await expect(depthPanel).toContainText('20 مستوى فقط');
  await expect(depthPanel).toContainText('ليست بثاً ولا ضماناً للتنفيذ');
  await expect(page.locator('#trade-lab')).toContainText('Bid IV');
  await expect(page.locator('#trade-lab')).toContainText('Ask IV');

  const sourceGreeks = page.locator('.source-greek-raw');
  await expect(sourceGreeks).toBeVisible();
  await expect(sourceGreeks).toContainText('قيم Greeks الخام من المصدر لأغراض التدقيق فقط');
  await sourceGreeks.locator('summary').click();
  await expect(sourceGreeks).toContainText('لم تُطبع وحداتها');
  await expect(page.locator('.data-status')).toContainText('عمر الاستلام');
  await expect(page.locator('.source-stale')).toHaveCount(0);

  await page.clock.fastForward(61_000);
  await expect(page.locator('.data-status')).toHaveClass(/stale/);
  await expect(page.locator('.source-stale')).toContainText('لقطة Binance تجاوزت حدّ العمر المحلي');
  await expect(page.locator('.source-stale')).toContainText('لا يثبت حداثة حقول Binance');
});

test('Binance proxy HTTP 451 triggers a direct current-network public-data attempt without changing IP or region', async ({ page }) => {
  let directAttempted = false;
  await page.route('https://eapi.binance.com/**', async (route) => {
    directAttempted = true;
    await route.abort();
  });
  await page.route(`${PROXY_ORIGIN}/**`, (route) => route.fulfill({
    status: 451,
    headers: proxyHeaders,
    body: JSON.stringify({
      code: 0,
      msg: 'Service unavailable from a restricted location according to b. Eligibility in Binance terms.',
    }),
  }));

  await page.getByRole('button', { name: 'تحميل Binance' }).click();
  const restriction = page.locator('.source-error-restricted');
  await expect(restriction).toContainText('HTTP 451');
  await expect(restriction).toContainText('لم تنجح محاولة الاتصال المباشر من متصفحك');
  await expect(restriction).toContainText('هذا لا يثبت منع حسابك أو المقيمين في سوريا');
  await expect.poll(() => directAttempted).toBe(true);
  await expect(restriction.getByRole('link', { name: /سياسة Binance للمقيمين في سوريا/ }))
    .toHaveAttribute('href', 'https://www.binance.com/ar/support/faq/detail/863795c36a224bd7aa7d677996328ff9');
  await expect(restriction.getByRole('button', { name: 'إعادة المحاولة' })).toHaveCount(0);
  await expect(page.locator('.source-card')).toContainText('بيانات تجريبية');
  await expect(page.locator('#overview-metrics')).toContainText('قيم توضيحية مولّدة');

  await restriction.getByRole('button', { name: 'استخدام Demo' }).click();
  await expect(page.locator('.source-error')).toHaveCount(0);
  await expect(page.locator('.source-card')).toContainText('بيانات تجريبية');
});

test('mismatched contract multiplier keeps quotes visible but blocks per-contract P&L and replay', async ({ page }) => {
  const expiry = new Date(Date.now() + 45 * 86_400_000).toISOString();
  const firstTime = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
  const secondTime = new Date(Date.now() - 60 * 60_000).toISOString();
  const header = 'symbol,underlying,expiry,strike,type,bid,ask,markPrice,iv,spot,unit,timestamp,assetClass,venue,underlyingKind,forward,riskFreeRate,exerciseStyle,settlementStyle,quoteAsset,settlementAsset,contractMultiplier,bidAskSource,bidAskTimestamp,bidAskReceivedAt,bidAskSizeUnit,bidQuantity,askQuantity';
  const rows = [
    ['CL-UNVERIFIED-70-C', 'CL', expiry, '70', 'CALL', '2.0', '2.1', '2.05', '20%', '69', '1', firstTime, 'ENERGY', 'CME', 'FUTURE', '69', '3%', 'EUROPEAN', 'PHYSICAL', 'USD', 'USD', '1000', 'BOOK_TICKER', firstTime, new Date(Date.parse(firstTime) + 100).toISOString(), 'CONTRACTS', '10', '10'],
    ['CL-UNVERIFIED-70-C', 'CL', expiry, '70', 'CALL', '2.1', '2.2', '2.15', '20%', '69', '1', secondTime, 'ENERGY', 'CME', 'FUTURE', '69', '3%', 'EUROPEAN', 'PHYSICAL', 'USD', 'USD', '1000', 'BOOK_TICKER', secondTime, new Date(Date.parse(secondTime) + 100).toISOString(), 'CONTRACTS', '10', '10'],
  ].map((row) => row.join(','));
  await page.locator('section').filter({ hasText: 'MULTI-ASSET OPTIONS ·' }).locator('input[type="file"]').setInputFiles({
    name: 'unverified-futures-scale.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from([header, ...rows].join('\n')),
  });

  await expect(page.locator('.source-card')).toContainText('ملف محلي مستورد');
  await page.getByRole('combobox', { name: 'اختر فئة الأصل' }).selectOption('ENERGY');
  await expect(page.locator('#scanner')).toContainText('CL-UNVERIFIED-70-C');
  await expect(page.locator('#opportunities')).not.toContainText('EV محايد/عقد');
  await expect(page.locator('#trade-lab')).toContainText('غير متاح');
  await expect(page.locator('#trade-lab .budget-row')).toBeHidden();
  await expect(page.locator('#trade-lab')).toContainText('لا يثبت مطابقة deliverables لمواصفات البورصة');
  await expect(page.locator('#trade-lab').getByRole('button', { name: 'أضف إلى الدفتر التجريبي' })).toBeDisabled();
  await expect(page.locator('#payoff .empty-state')).toContainText('حساب P&L لكل عقد غير متاح');
  await expect(page.locator('#payoff')).toContainText('يختلف contractMultiplier عن unit');
  await expect(page.locator('#historical-replay')).toContainText('مقياس عقد غير متحقق 2');
  await expect(page.locator('#greeks')).toContainText('نحجب حساسية المركز المجمعة');
  await expect(page.locator('#greeks .greeks-mobile-card').first().locator('.greeks-mobile-values small').first()).toHaveText('القيمة لكل وحدة مرجعية');
});


test('CSV cannot spoof a Demo venue label to unlock per-contract P&L', async ({ page }) => {
  const expiry = new Date(Date.now() + 45 * 86_400_000).toISOString();
  const header = 'symbol,underlying,expiry,strike,type,bid,ask,markPrice,iv,spot,unit,timestamp,assetClass,venue,underlyingKind,exerciseStyle,settlementStyle,quoteAsset,settlementAsset,contractMultiplier,riskFreeRate,carryYield';
  const row = ['BTC-CSV-DEMO-100-C', 'BTC', expiry, '100', 'CALL', '2.0', '2.2', '2.1', '20%', '100', '1', new Date().toISOString(), 'CRYPTO', 'DEMO', 'SPOT', 'EUROPEAN', 'CASH', 'USDT', 'USDT', '1', '0%', '0%'].join(',');
  await page.locator('section').filter({ hasText: 'MULTI-ASSET OPTIONS ·' }).locator('input[type="file"]').setInputFiles({
    name: 'spoofed-demo-venue.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from([header, row].join('\n')),
  });

  await expect(page.locator('.source-card')).toContainText('ملف محلي مستورد');
  await expect(page.locator('#trade-lab')).toContainText('غير متاح');
  await expect(page.locator('#trade-lab .budget-row')).toBeHidden();
  await expect(page.locator('#trade-lab')).toContainText('لم يتم التحقق من نموذج مقياس هذا السوق');
  await expect(page.locator('#opportunities')).not.toContainText('EV محايد/عقد');
  await expect(page.locator('#trade-lab').getByRole('button', { name: 'أضف إلى الدفتر التجريبي' })).toBeDisabled();
});

test('mobile option chain renders compact cards and selects a contract without table overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();

  const mobileList = page.locator('.chain-mobile-list');
  await expect(mobileList).toBeVisible();
  await expect(page.locator('.chain-table')).toBeHidden();
  const cards = mobileList.locator('.chain-mobile-card');
  await expect(cards.first()).toBeVisible();
  await expect(cards.first()).toContainText('Bid');
  await expect(cards.first()).toContainText('Ask');
  await expect(cards.first()).toContainText('IV');
  await expect(cards.first()).toContainText('Delta');

  if (await cards.count() > 1) {
    await cards.nth(1).click();
    await expect(cards.nth(1)).toHaveAttribute('aria-pressed', 'true');
  }

  const dimensions = await mobileList.evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
});

test('mobile Greeks and paper journal use readable cards instead of wide tables', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.locator('.asset-switch').getByRole('button').filter({ hasText: 'XRP' }).click();

  const greekList = page.locator('.greeks-mobile-list');
  await greekList.scrollIntoViewIfNeeded();
  await expect(greekList).toBeVisible();
  await expect(page.locator('.greeks-table-wrap')).toBeHidden();
  await expect(greekList.locator('.greeks-mobile-card')).toHaveCount(5);
  await expect(greekList).toContainText('Delta');
  await expect(greekList).toContainText('القيمة لكل وحدة مرجعية');
  await expect(greekList).toContainText('حساسية الكمية الحالية');

  await page.getByRole('button', { name: 'أضف إلى الدفتر التجريبي' }).click();
  await page.locator('.mobile-bottom-nav').getByRole('button', { name: 'الدفتر' }).click();
  const journalList = page.locator('.journal-mobile-list');
  await expect(journalList).toBeVisible();
  await expect(page.locator('.journal-table-wrap')).toBeHidden();
  await expect(journalList.locator('.journal-mobile-card')).toHaveCount(1);
  await expect(journalList).toContainText('PAPER ONLY');
  await expect(journalList).toContainText('قسط الدخول');

  const dimensions = await journalList.evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
});

test('mobile layout has no document-level horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'مختبر الخيارات' })).toBeVisible();

  const dimensions = await page.locator('html').evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
});


test('mobile primary controls meet touch-target and keyboard-focus requirements', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();

  await expect(page.getByRole('group', { name: 'نوع الخيار' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'الانتهاء' })).toBeVisible();
  await expect(page.getByPlaceholder('سعر التنفيذ أو الرمز')).toBeVisible();

  const targets = [
    page.locator('.option-tabs button').first(),
    page.locator('.chain-controls .select-control').first(),
    page.locator('.chain-controls .search-control'),
    page.locator('.mobile-bottom-nav button').first(),
  ];
  for (const target of targets) {
    const box = await target.boundingBox();
    expect(box, 'primary mobile control should be rendered').not.toBeNull();
    expect(box!.height, 'primary mobile control should be at least 44px tall').toBeGreaterThanOrEqual(44);
  }

  const navButton = page.locator('.mobile-bottom-nav button').first();
  await page.keyboard.press('Tab');
  await navButton.focus();
  const focusStyle = await navButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(focusStyle.outlineStyle).not.toBe('none');
  expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThanOrEqual(2);
});

test('shows local legal eligibility warning in the compliance banner', async ({ page }) => {
  await page.goto('/');
  const banner = page.locator('.compliance-banner');
  await expect(banner).toContainText('أهلية الحساب لدى المنصة لا تعني أن التداول مسموح قانونياً');
  await expect(banner).toContainText('للمقيمين في سوريا');
  await expect(banner).toContainText('البحث والمحاكاة فقط');
});


test('local portfolio tracks holdings, updates net worth, persists and exports a complete backup', async ({ page }) => {
  await page.locator('.side-nav').getByRole('button', { name: 'المركز المالي' }).click();
  const finance = page.locator('#finance');
  await expect(finance.getByRole('heading', { name: 'المركز المالي الشخصي' })).toBeVisible();
  await finance.getByLabel('الرمز').fill('BTC');
  await finance.getByLabel('فئة الأصل').selectOption('CRYPTO');
  await finance.getByLabel('الكمية / عدد العقود').fill('0.5');
  await finance.getByLabel('مضاعف العقد').fill('1');
  await finance.getByLabel('متوسط تكلفة الوحدة').fill('40000');
  await finance.getByLabel('السعر الحالي / Mark').fill('60000');
  await finance.locator('.portfolio-form').getByLabel('العملة').fill('USD');
  await finance.getByLabel('مصدر السعر').fill('Playwright deterministic fixture');
  await finance.getByRole('button', { name: 'إضافة إلى المحفظة' }).click();

  const portfolio = finance.locator('.portfolio-panel');
  await expect(portfolio).toContainText('BTC');
  await expect(portfolio).toContainText('30,000 USD');
  await expect(finance.locator('.finance-metrics article').first()).toContainText('30,000 USD');

  const downloadPromise = page.waitForEvent('download');
  await finance.getByRole('button', { name: 'تصدير نسخة احتياطية' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('sol-financial-backup.json');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const backup = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(backup.version).toBe(2);
  expect(backup.holdings[0].symbol).toBe('BTC');

  await page.reload();
  await page.locator('.side-nav').getByRole('button', { name: 'المركز المالي' }).click();
  await expect(page.locator('#finance .portfolio-panel')).toContainText('BTC');
  await page.locator('#finance .portfolio-panel').getByRole('button', { name: 'حذف BTC' }).click();
  await expect(page.locator('#finance .portfolio-panel')).toContainText('لا توجد مراكز استثمارية مسجلة');
  await expect(page.locator('#finance .finance-metrics article').first()).toContainText('0 USD');
});


test('Binance observed IV history warms honestly and exports a provenance-preserving backup', async ({ page }) => {
  const now = Date.now();
  await page.clock.install({ time: now });
  const makeExpiry = (days: number) => {
    const expiry = new Date(now + days * 86_400_000);
    return {
      timestamp: expiry.getTime(),
      code: expiry.toISOString().slice(2, 10).replaceAll('-', ''),
    };
  };
  const short = makeExpiry(20);
  const long = makeExpiry(40);
  const contracts = [
    { expiry: short, side: 'CALL', strike: '100000' },
    { expiry: short, side: 'PUT', strike: '100000' },
    { expiry: long, side: 'CALL', strike: '100000' },
    { expiry: long, side: 'PUT', strike: '100000' },
  ].map((item) => ({
    symbol: `BTC-${item.expiry.code}-${item.strike}-${item.side === 'CALL' ? 'C' : 'P'}`,
    underlying: 'BTCUSDT',
    quoteAsset: 'USDT',
    side: item.side,
    strikePrice: item.strike,
    expiryDate: item.expiry.timestamp,
    unit: '1',
    minQty: '0.01',
    maxQty: '10',
    priceScale: 2,
    quantityScale: 2,
    status: 'TRADING',
  }));

  await page.route(`${PROXY_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    const endpoint = url.searchParams.get('endpoint');
    let payload: unknown;
    if (endpoint === 'exchangeInfo') {
      payload = {
        serverTime: now,
        optionContracts: [{ baseAsset: 'BTC', quoteAsset: 'USDT', underlying: 'BTCUSDT' }],
        optionSymbols: contracts,
      };
    } else if (endpoint === 'mark') {
      payload = contracts.map((contract) => ({
        symbol: contract.symbol,
        markPrice: '5000',
        bidIV: '0.52',
        askIV: '0.58',
        markIV: contract.symbol.includes(short.code) ? '0.55' : '0.60',
      }));
    } else if (endpoint === 'ticker') {
      payload = contracts.map((contract) => ({
        symbol: contract.symbol,
        bidPrice: '4.9',
        askPrice: '5.1',
        lastPrice: '5.0',
        volume: '12',
        amount: '60',
        closeTime: now,
      }));
    } else if (endpoint === 'index') {
      payload = [{ underlying: 'BTCUSDT', indexPrice: '100000', time: now }];
    } else if (endpoint === 'openInterest') {
      payload = [];
    } else if (endpoint === 'depth') {
      payload = { lastUpdateId: 42, T: now, bids: [['4.9', '2']], asks: [['5.1', '2']] };
    } else {
      throw new Error(`Unexpected mocked market-data endpoint: ${endpoint ?? '(missing)'}`);
    }
    await route.fulfill({ status: 200, headers: proxyHeaders, body: JSON.stringify(payload) });
  });

  await page.getByRole('button', { name: 'تحميل Binance' }).click();
  const opportunities = page.locator('#opportunities');
  await expect(opportunities).toContainText('IV Rank · 365 يوم');
  await expect(opportunities).toContainText('IV Percentile · 365 يوم');
  await expect(opportunities).toContainText('يلزم 30 يوماً صالحاً');
  await expect(opportunities.locator('.opportunity-metric').filter({ hasText: 'IV Rank · 365 يوم' })).toContainText('غير متاح');

  await page.locator('.side-nav').getByRole('button', { name: 'الدفتر التجريبي' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#journal').getByRole('button', { name: 'نسخة IV JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('sol-iv-history-backup.json');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const backup = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(backup.schemaVersion).toBe(1);
  expect(backup.observations).toHaveLength(1);
  expect(backup.observations[0].source).toBe('BINANCE_REST_MARK');
  expect(backup.observations[0].underlying).toBe('BTC');
  expect(backup.observations[0].tenorDays).toBe(30);
});
