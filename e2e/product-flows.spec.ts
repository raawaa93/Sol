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

  const assetTabs = page.getByRole('tablist', { name: 'الأصل الأساسي' });
  await assetTabs.getByRole('button', { name: /XRP/ }).click();
  await expect(page.locator('#overview-metrics')).toContainText('XRP/USDT');
  await expect(page.locator('#scanner')).toContainText('XRP');
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

test('CSV import stays local and supports a non-crypto underlying', async ({ page }) => {
  const expiry = new Date(Date.now() + 40 * 86_400_000).toISOString();
  const sourceTime = new Date().toISOString();
  const header = 'symbol,underlying,expiry,strike,type,bid,ask,markPrice,iv,delta,gamma,theta,vega,openInterest,volume,spot,unit,timestamp';
  const row = [
    'XAU-custom-P', 'XAU', expiry, '4000', 'PUT', '50', '52', '51', '45%',
    '', '', '', '', '', '', '4100', '1', sourceTime,
  ].join(',');
  const csv = `${header}\n${row}`;

  await page.locator('input[type="file"]').setInputFiles({
    name: 'xau-snapshot.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });

  await expect(page.getByText('تم استيراد 1 عقد محلياً.')).toBeVisible();
  await expect(page.locator('#overview-metrics')).toContainText('XAU/USDT');
  await expect(page.locator('#scanner')).toContainText('XAU-custom-P');
});

test('Binance order-book UI is exercised only with a deterministic mocked REST snapshot', async ({ page }) => {
  const now = Date.now();
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
  await expect(sourceGreeks).toContainText('قيم Greeks الخام من Binance لأغراض التدقيق فقط');
  await sourceGreeks.locator('summary').click();
  await expect(sourceGreeks).toContainText('لم تُطبع وحداتها');
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
