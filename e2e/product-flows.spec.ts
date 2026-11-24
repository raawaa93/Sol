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
  await page.getByRole('button', { name: 'أضف إلى الدفتر التجريبي' }).click();
  await expect(page.getByText('أضيفت الصفقة إلى الدفتر التجريبي فقط.')).toBeVisible();
  await page.locator('.side-nav').getByRole('button', { name: 'الدفتر التجريبي' }).click();
  await expect(page.locator('#journal tbody tr')).toHaveCount(1);
  await expect(page.locator('#journal')).toContainText('PAPER ONLY');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#journal').getByRole('button', { name: 'تصدير CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('volterra-paper-journal.csv');
});

test('CSV asset-class and venue filters isolate traditional listed option contracts', async ({ page }) => {
  const expiry = new Date(Date.now() + 40 * 86_400_000).toISOString();
  const header = 'symbol,underlying,expiry,strike,type,bid,ask,markPrice,iv,spot,unit,timestamp,assetClass,venue,quoteAsset,settlementAsset,contractMultiplier,exerciseStyle,settlementStyle';
  const call = ['SPY-261230-700-C', 'SPY', expiry, '700', 'CALL', '5.1', '5.3', '5.2', '22%', '690', '100', new Date().toISOString(), 'EQUITY', 'CBOE', 'USD', 'USD', '100', 'AMERICAN', 'PHYSICAL'].join(',');
  const put = ['SPY-261230-680-P', 'SPY', expiry, '680', 'PUT', '4.1', '4.3', '4.2', '24%', '690', '100', new Date().toISOString(), 'EQUITY', 'ISE', '', 'USD', '100', 'AMERICAN', 'PHYSICAL'].join(',');
  const csv = `${header}\n${call}\n${put}`;

  await page.locator('input[type="file"]').setInputFiles({
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
test('CSV import stays local and powers a timestamped XAU execution replay', async ({ page }) => {
  const expiry = new Date(Date.now() + 40 * 86_400_000).toISOString();
  const firstTime = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
  const secondTime = new Date(Date.now() - 60 * 60_000).toISOString();
  const header = 'symbol,underlying,expiry,strike,type,bid,ask,markPrice,iv,delta,gamma,theta,vega,openInterest,volume,spot,unit,timestamp';
  const first = [
    'XAU-custom-P', 'XAU', expiry, '4000', 'PUT', '50', '52', '51', '45%',
    '', '', '', '', '', '', '4100', '1', firstTime,
  ].join(',');
  const second = [
    'XAU-custom-P', 'XAU', expiry, '4000', 'PUT', '60', '61', '60.5', '45%',
    '', '', '', '', '', '', '4100', '1', secondTime,
  ].join(',');
  const csv = `${header}\n${first}\n${second}`;

  await page.locator('input[type="file"]').setInputFiles({
    name: 'xau-history.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });

  await expect(page.getByText('تم استيراد 2 عقد محلياً.')).toBeVisible();
  await expect(page.locator('#overview-metrics')).toContainText('XAU');
  await expect(page.locator('#scanner')).toContainText('XAU-custom-P');
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

  const greekList = page.locator('.greeks-mobile-list');
  await greekList.scrollIntoViewIfNeeded();
  await expect(greekList).toBeVisible();
  await expect(page.locator('.greeks-table-wrap')).toBeHidden();
  await expect(greekList.locator('.greeks-mobile-card')).toHaveCount(5);
  await expect(greekList).toContainText('Delta');
  await expect(greekList).toContainText('القيمة لكل عقد');
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


test('shows local legal eligibility warning in the compliance banner', async ({ page }) => {
  await page.goto('/');
  const banner = page.locator('.compliance-banner');
  await expect(banner).toContainText('أهلية الحساب لدى المنصة لا تعني أن التداول مسموح قانونياً');
  await expect(banner).toContainText('للمقيمين في سوريا');
  await expect(banner).toContainText('البحث والمحاكاة فقط');
});
