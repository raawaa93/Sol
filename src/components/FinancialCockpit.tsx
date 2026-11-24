import { useEffect, useMemo, useState } from 'react';
import { calculateMonthlyCashFlow, calculateNetWorth, calculatePortfolio } from '../lib/personal-finance';
import type { CashFlowTransaction, FinancialBalance, FxRate, PortfolioAssetClass, PortfolioHolding } from '../lib/personal-finance';
import './FinancialCockpit.css';

type Ledger = { balances: FinancialBalance[]; transactions: CashFlowTransaction[]; fxRates: FxRate[]; holdings: PortfolioHolding[] };
const STORAGE_KEY = 'sol-financial-ledger-v1';
const today = () => new Date().toISOString().slice(0, 10);
const monthNow = () => today().slice(0, 7);
const stamp = (date: string) => `${date}T12:00:00.000Z`;
const emptyLedger: Ledger = { balances: [], transactions: [], fxRates: [], holdings: [] };

function loadLedger(): Ledger {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return emptyLedger;
    const value = parsed as Partial<Ledger>;
    return {
      balances: Array.isArray(value.balances) ? value.balances : [],
      transactions: Array.isArray(value.transactions) ? value.transactions : [],
      fxRates: Array.isArray(value.fxRates) ? value.fxRates : [],
      holdings: Array.isArray(value.holdings) ? value.holdings : [],
    };
  } catch {
    return emptyLedger;
  }
}

function money(value: number | null, currency: string): string {
  if (value === null || !Number.isFinite(value)) return 'غير مكتمل';
  return new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(value) + ' ' + currency;
}

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function FinancialCockpit() {
  const [ledger, setLedger] = useState<Ledger>(loadLedger);
  const [currency, setCurrency] = useState('USD');
  const [balanceKind, setBalanceKind] = useState<'ASSET' | 'LIABILITY'>('ASSET');
  const [balanceLabel, setBalanceLabel] = useState('');
  const [balanceAmount, setBalanceAmount] = useState('0');
  const [balanceCurrency, setBalanceCurrency] = useState('USD');
  const [balanceDate, setBalanceDate] = useState(today);
  const [flowKind, setFlowKind] = useState<'INCOME' | 'EXPENSE' | 'TRANSFER'>('EXPENSE');
  const [flowCategory, setFlowCategory] = useState('');
  const [flowAmount, setFlowAmount] = useState('0');
  const [flowCurrency, setFlowCurrency] = useState('USD');
  const [flowDate, setFlowDate] = useState(today);
  const [fxCurrency, setFxCurrency] = useState('EUR');
  const [fxRate, setFxRate] = useState('');
  const [fxSource, setFxSource] = useState('');
  const [fxDate, setFxDate] = useState(today);
  const [period, setPeriod] = useState(monthNow);
  const [holdingSymbol, setHoldingSymbol] = useState('');
  const [holdingClass, setHoldingClass] = useState<PortfolioAssetClass>('EQUITY');
  const [holdingQuantity, setHoldingQuantity] = useState('1');
  const [holdingCost, setHoldingCost] = useState('0');
  const [holdingPrice, setHoldingPrice] = useState('0');
  const [holdingCurrency, setHoldingCurrency] = useState('USD');
  const [holdingMultiplier, setHoldingMultiplier] = useState('1');
  const [holdingSource, setHoldingSource] = useState('');
  const [holdingDate, setHoldingDate] = useState(today);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ledger)); }
    catch { setNotice('تعذر الحفظ المحلي؛ صدّر نسخة احتياطية قبل مغادرة الصفحة.'); }
  }, [ledger]);

  const portfolio = useMemo(() => {
    try { return { value: calculatePortfolio(ledger.holdings, currency, ledger.fxRates), error: '' }; }
    catch (error) { return { value: null, error: error instanceof Error ? error.message : 'تعذر حساب المحفظة' }; }
  }, [currency, ledger]);
  const netWorth = useMemo(() => {
    try {
      const holdingBalances: FinancialBalance[] = ledger.holdings.map(item => ({
        id: 'portfolio:' + item.id, kind: 'ASSET', amount: item.quantity * item.contractMultiplier * item.marketPrice,
        currency: item.currency, asOf: item.priceObservedAt,
      }));
      return { value: calculateNetWorth([...ledger.balances, ...holdingBalances], currency, ledger.fxRates), error: '' }; }
    catch (error) { return { value: null, error: error instanceof Error ? error.message : 'تعذر حساب صافي الثروة' }; }
  }, [currency, ledger]);
  const cashFlow = useMemo(() => {
    try { return { value: calculateMonthlyCashFlow(ledger.transactions, period, currency, ledger.fxRates), error: '' }; }
    catch (error) { return { value: null, error: error instanceof Error ? error.message : 'تعذر حساب التدفق النقدي' }; }
  }, [currency, ledger, period]);

  const addBalance = () => {
    const amount = Number(balanceAmount);
    if (!balanceLabel.trim() || !Number.isFinite(amount) || amount < 0 || !balanceCurrency.trim()) {
      setNotice('أدخل اسماً ومبلغاً وعملة صحيحة.'); return;
    }
    setLedger(current => ({ ...current, balances: [...current.balances, {
      id: makeId(), kind: balanceKind, amount, currency: balanceCurrency.trim().toUpperCase(),
      asOf: stamp(balanceDate), label: balanceLabel.trim(),
    } as FinancialBalance] }));
    setBalanceLabel(''); setBalanceAmount('0'); setNotice('تمت إضافة الرصيد إلى السجل المحلي.');
  };

  const addFlow = () => {
    const amount = Number(flowAmount);
    if (!flowCategory.trim() || !Number.isFinite(amount) || amount < 0 || !flowCurrency.trim()) {
      setNotice('أدخل تصنيفاً ومبلغاً وعملة صحيحة.'); return;
    }
    setLedger(current => ({ ...current, transactions: [...current.transactions, {
      id: makeId(), kind: flowKind, amount, currency: flowCurrency.trim().toUpperCase(),
      occurredAt: stamp(flowDate), category: flowCategory.trim(),
    }] }));
    setFlowCategory(''); setFlowAmount('0'); setNotice('تمت إضافة الحركة إلى السجل المحلي.');
  };

  const addFx = () => {
    const rate = Number(fxRate);
    const base = fxCurrency.trim().toUpperCase();
    const quote = currency.trim().toUpperCase();
    if (!base || base === quote || !Number.isFinite(rate) || rate <= 0 || !fxSource.trim()) {
      setNotice('أدخل عملة مختلفة وسعراً موجباً ومصدراً معروفاً لسعر الصرف.'); return;
    }
    setLedger(current => ({ ...current, fxRates: [
      ...current.fxRates.filter(item => !([item.baseCurrency, item.quoteCurrency].sort().join('/') === [base, quote].sort().join('/'))),
      { baseCurrency: base, quoteCurrency: quote, rate, source: fxSource.trim(), observedAt: stamp(fxDate) },
    ] }));
    setFxRate(''); setFxSource(''); setNotice('تم تحديث سعر الصرف ومصدره في السجل المحلي.');
  };

  const addHolding = () => {
    const holding: PortfolioHolding = {
      id: makeId(), symbol: holdingSymbol.trim().toUpperCase(), assetClass: holdingClass,
      quantity: Number(holdingQuantity), averageCost: Number(holdingCost), marketPrice: Number(holdingPrice),
      currency: holdingCurrency.trim().toUpperCase(), contractMultiplier: Number(holdingMultiplier),
      quoteSource: holdingSource.trim(), priceObservedAt: stamp(holdingDate),
    };
    try {
      calculatePortfolio([...ledger.holdings, holding], currency, ledger.fxRates);
      setLedger(current => ({ ...current, holdings: [...current.holdings, holding] }));
      setHoldingSymbol(''); setHoldingQuantity('1'); setHoldingCost('0'); setHoldingPrice('0');
      setHoldingSource(''); setNotice('تمت إضافة المركز إلى المحفظة المحلية، وأُدرجت قيمته السوقية ضمن الأصول.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'تعذر إضافة المركز.'); }
  };

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), reportingCurrency: currency, ...ledger }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'sol-financial-backup.json'; anchor.click();
    URL.revokeObjectURL(url); setNotice('تم إنشاء ملف النسخة الاحتياطية.');
  };

  const importBackup = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Partial<Ledger>;
      if (!Array.isArray(parsed.balances) || !Array.isArray(parsed.transactions) || !Array.isArray(parsed.fxRates)) throw new Error('صيغة النسخة غير مكتملة');
      const holdings = Array.isArray(parsed.holdings) ? parsed.holdings as PortfolioHolding[] : [];
      // Validate imported records with the same deterministic domain functions before accepting them.
      calculateNetWorth(parsed.balances, currency, parsed.fxRates);
      calculateMonthlyCashFlow(parsed.transactions, monthNow(), currency, parsed.fxRates);
      calculatePortfolio(holdings, currency, parsed.fxRates);
      setLedger({ balances: parsed.balances, transactions: parsed.transactions, fxRates: parsed.fxRates, holdings });
      setNotice('تم استيراد النسخة والتحقق من سلامة سجلاتها.');
    } catch (error) { setNotice(error instanceof Error ? `رفض الاستيراد: ${error.message}` : 'تعذر استيراد النسخة.'); }
  };

  const clearLedger = () => {
    if (!window.confirm('سيتم حذف السجل المالي المحلي من هذا المتصفح. هل تريد المتابعة؟')) return;
    setLedger(emptyLedger); setNotice('تم حذف السجل المحلي من هذا المتصفح.');
  };

  return (
    <section className="financial-cockpit section-anchor" id="finance">
      <div className="section-title-row">
        <div><span className="section-kicker">PERSONAL FINANCE · LOCAL ONLY</span><h2>المركز المالي الشخصي</h2><p>سجل الأصول والالتزامات والدخل والمصروفات، مع تحويل عملات موثق المصدر.</p></div>
        <div className="finance-backup-actions">
          <button type="button" className="button button-ghost" onClick={exportBackup}>تصدير نسخة احتياطية</button>
          <label className="button button-ghost">استيراد نسخة<input type="file" accept="application/json,.json" hidden onChange={event => { void importBackup(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>
        </div>
      </div>
      <div className="finance-privacy-note"><strong>خصوصية السجل:</strong> البيانات تحفظ في Local Storage على هذا المتصفح فقط، وليست مشفرة ولا تزامن بين الأجهزة. لا تدخل كلمات مرور أو أرقام حسابات أو بيانات بطاقات. صدّر نسخة احتياطية بنفسك؛ مسح بيانات المتصفح قد يحذف السجل.</div>
      <div className="finance-privacy-note"><strong>ملاحظة المحفظة:</strong> المراكز الاستثمارية المسجلة أدناه تُضاف تلقائياً إلى الأصول وصافي الثروة. لا تسجل الاستثمار نفسه مرة ثانية في قسم الأصول. الأسعار يدوية وليست بثاً حياً.</div>
      <div className="finance-toolbar">
        <label>عملة التقرير<select value={currency} onChange={event => setCurrency(event.target.value.toUpperCase())}><option>USD</option><option>EUR</option><option>GBP</option><option>SYP</option><option>USDT</option></select></label>
        <label>شهر التدفق النقدي<input type="month" value={period} onChange={event => setPeriod(event.target.value)} /></label>
      </div>
      <div className="finance-metrics">
        <article><span>الأصول</span><strong>{money(netWorth.value?.assets ?? null, currency)}</strong></article>
        <article><span>الالتزامات</span><strong>{money(netWorth.value?.liabilities ?? null, currency)}</strong></article>
        <article><span>صافي الثروة</span><strong>{money(netWorth.value?.netWorth ?? null, currency)}</strong><small>{netWorth.value?.complete ? 'كل العملات محولة' : 'الإجمالي محجوب حتى اكتمال أسعار الصرف'}</small></article>
        <article><span>صافي التدفق النقدي</span><strong>{money(cashFlow.value?.netCashFlow ?? null, currency)}</strong><small>{period}</small></article>
      </div>
      {(netWorth.error || cashFlow.error || portfolio.error) && <p className="finance-error">{netWorth.error || cashFlow.error || portfolio.error}</p>}
      {netWorth.value && !netWorth.value.complete && <p className="finance-warning">أسعار صرف مفقودة: {netWorth.value.missingFxCurrencies.join('، ')}. لن يعرض Sol إجمالي ثروة مضللاً.</p>}
      {cashFlow.value && !cashFlow.value.complete && <p className="finance-warning">أسعار صرف مفقودة للتدفق النقدي: {cashFlow.value.missingFxCurrencies.join('، ')}.</p>}
      <section className="portfolio-panel" aria-labelledby="portfolio-heading">
        <div className="portfolio-heading"><div><h3 id="portfolio-heading">محفظة الاستثمارات</h3><p>تقييم المراكز وتكلفة الشراء والربح أو الخسارة غير المحققة وتوزيع الأصول</p></div><span>{ledger.holdings.length} مركز</span></div>
        <div className="portfolio-metrics">
          <article><span>القيمة السوقية</span><strong>{money(portfolio.value?.marketValue ?? null, currency)}</strong></article>
          <article><span>تكلفة الشراء</span><strong>{money(portfolio.value?.costBasis ?? null, currency)}</strong></article>
          <article><span>الربح / الخسارة غير المحققة</span><strong className={(portfolio.value?.unrealizedPnl ?? 0) >= 0 ? 'portfolio-positive' : 'portfolio-negative'}>{money(portfolio.value?.unrealizedPnl ?? null, currency)}</strong></article>
          <article><span>أكبر مركز</span><strong>{portfolio.value?.concentration.largestHoldingPct === null || portfolio.value?.concentration.largestHoldingPct === undefined ? 'غير متاح' : portfolio.value.concentration.largestHoldingPct.toFixed(1) + '%'}</strong></article>
        </div>
        {portfolio.value && !portfolio.value.complete && <p className="finance-warning">لا يمكن توحيد قيمة المحفظة بسبب أسعار صرف ناقصة: {portfolio.value.missingFxCurrencies.join('، ')}. القيم الإجمالية والأوزان محجوبة حتى إدخال أسعار الصرف.</p>}
        {portfolio.value?.concentration.warnings.length ? <div className="finance-warning"><strong>تنبيهات تركّز:</strong> {portfolio.value.concentration.warnings.map(() => 'مركز واحد يتجاوز 25%').join(' · ')}. هذه حدود تنبيه ثابتة وليست توصيات بيع أو شراء.</div> : null}
        <div className="portfolio-layout">
          <form className="finance-form portfolio-form" onSubmit={event => { event.preventDefault(); addHolding(); }}>
            <h4>إضافة مركز استثماري</h4>
            <label>الرمز / اسم الأصل<input value={holdingSymbol} onChange={event => setHoldingSymbol(event.target.value.toUpperCase())} placeholder="مثال: BTC أو SPY" required /></label>
            <label>فئة الأصل<select value={holdingClass} onChange={event => setHoldingClass(event.target.value as PortfolioAssetClass)}><option value="EQUITY">أسهم</option><option value="ETF">صناديق ETF</option><option value="CRYPTO">عملات رقمية</option><option value="BOND">سندات</option><option value="COMMODITY">سلع</option><option value="OPTION">عقود خيارات</option><option value="CASH">نقد</option><option value="OTHER">أخرى</option></select></label>
            <div className="finance-form-row"><label>الكمية / عدد العقود<input type="number" min="0.00000001" step="any" value={holdingQuantity} onChange={event => setHoldingQuantity(event.target.value)} required /></label><label>مضاعف العقد<input type="number" min="0.00000001" step="any" value={holdingMultiplier} onChange={event => setHoldingMultiplier(event.target.value)} required /></label></div>
            <div className="finance-form-row"><label>متوسط تكلفة الوحدة<input type="number" min="0" step="any" value={holdingCost} onChange={event => setHoldingCost(event.target.value)} required /></label><label>السعر الحالي / Mark<input type="number" min="0" step="any" value={holdingPrice} onChange={event => setHoldingPrice(event.target.value)} required /></label></div>
            <div className="finance-form-row"><label>العملة<input value={holdingCurrency} onChange={event => setHoldingCurrency(event.target.value.toUpperCase())} maxLength={12} required /></label><label>تاريخ رصد السعر<input type="date" value={holdingDate} onChange={event => setHoldingDate(event.target.value)} required /></label></div>
            <label>مصدر السعر<input value={holdingSource} onChange={event => setHoldingSource(event.target.value)} placeholder="كشف وسيط، بورصة، سعر يدوي..." required /></label>
            <button className="button button-primary" type="submit">إضافة إلى المحفظة</button>
          </form>
          <div className="portfolio-side">
            <article className="panel portfolio-allocations"><h4>توزيع المحفظة حسب فئة الأصل</h4>
              {portfolio.value?.allocations.length ? portfolio.value.allocations.map(item => <div className="portfolio-allocation" key={item.assetClass}><div><b>{item.assetClass}</b><span>{item.weightPct === null ? 'غير مكتمل' : item.weightPct.toFixed(1) + '%'}</span></div><div className="portfolio-bar"><i style={{ width: (item.weightPct ?? 0) + '%' }} /></div></div>) : <p className="finance-empty">أضف مراكز لعرض التوزيع.</p>}
            </article>
          </div>
        </div>
        <div className="portfolio-holdings">
          <h4>المراكز المسجلة</h4>
          {portfolio.value?.holdings.length ? portfolio.value.holdings.map(item => <div className="portfolio-holding-row" key={item.holding.id}>
            <div className="portfolio-holding-main"><b>{item.holding.symbol} <span>{item.holding.assetClass}</span></b><small>{item.holding.quantity} × {item.holding.contractMultiplier} · {item.holding.currency}</small><small>السعر: {item.holding.marketPrice} · المصدر: {item.holding.quoteSource} · {item.holding.priceObservedAt.slice(0,10)}</small></div>
            <div className="portfolio-holding-value"><strong>{money(item.reportingMarketValue, currency)}</strong><small className={(item.reportingUnrealizedPnl ?? 0) >= 0 ? 'portfolio-positive' : 'portfolio-negative'}>غير محقق: {money(item.reportingUnrealizedPnl, currency)}</small><small>الوزن: {item.weightPct === null ? 'غير مكتمل' : item.weightPct.toFixed(1) + '%'}</small></div>
            <button type="button" aria-label={'حذف ' + item.holding.symbol} onClick={() => setLedger(current => ({ ...current, holdings: current.holdings.filter(row => row.id !== item.holding.id) }))}>×</button>
          </div>) : <p className="finance-empty">لا توجد مراكز استثمارية مسجلة.</p>}
        </div>
      </section>
      <div className="finance-entry-grid">
        <form className="finance-form" onSubmit={event => { event.preventDefault(); addBalance(); }}>
          <h3>إضافة أصل أو التزام</h3>
          <label>النوع<select value={balanceKind} onChange={event => setBalanceKind(event.target.value as 'ASSET' | 'LIABILITY')}><option value="ASSET">أصل</option><option value="LIABILITY">التزام / دين</option></select></label>
          <label>الوصف<input value={balanceLabel} onChange={event => setBalanceLabel(event.target.value)} placeholder="نقد، مدخرات، دين..." required /></label>
          <div className="finance-form-row"><label>المبلغ<input type="number" min="0" step="any" value={balanceAmount} onChange={event => setBalanceAmount(event.target.value)} required /></label><label>العملة<input value={balanceCurrency} onChange={event => setBalanceCurrency(event.target.value.toUpperCase())} maxLength={12} required /></label></div>
          <label>تاريخ الرصيد<input type="date" value={balanceDate} onChange={event => setBalanceDate(event.target.value)} required /></label>
          <button className="button button-primary" type="submit">إضافة الرصيد</button>
        </form>
        <form className="finance-form" onSubmit={event => { event.preventDefault(); addFlow(); }}>
          <h3>إضافة حركة نقدية</h3>
          <label>النوع<select value={flowKind} onChange={event => setFlowKind(event.target.value as 'INCOME' | 'EXPENSE' | 'TRANSFER')}><option value="INCOME">دخل</option><option value="EXPENSE">مصروف</option><option value="TRANSFER">تحويل داخلي</option></select></label>
          <label>التصنيف<input value={flowCategory} onChange={event => setFlowCategory(event.target.value)} placeholder="راتب، طعام، إيجار..." required /></label>
          <div className="finance-form-row"><label>المبلغ<input type="number" min="0" step="any" value={flowAmount} onChange={event => setFlowAmount(event.target.value)} required /></label><label>العملة<input value={flowCurrency} onChange={event => setFlowCurrency(event.target.value.toUpperCase())} maxLength={12} required /></label></div>
          <label>التاريخ<input type="date" value={flowDate} onChange={event => setFlowDate(event.target.value)} required /></label>
          <button className="button button-primary" type="submit">إضافة الحركة</button>
        </form>
        <form className="finance-form" onSubmit={event => { event.preventDefault(); addFx(); }}>
          <h3>سعر صرف موثق</h3>
          <label>العملة المراد تحويلها<input value={fxCurrency} onChange={event => setFxCurrency(event.target.value.toUpperCase())} maxLength={12} required /></label>
          <label>سعر العملة مقابل {currency}<input type="number" min="0" step="any" value={fxRate} onChange={event => setFxRate(event.target.value)} placeholder="مثال: 1.08" required /></label>
          <label>المصدر<input value={fxSource} onChange={event => setFxSource(event.target.value)} placeholder="مصدر السعر أو رابط/مرجع" required /></label>
          <label>تاريخ الرصد<input type="date" value={fxDate} onChange={event => setFxDate(event.target.value)} required /></label>
          <button className="button button-primary" type="submit">حفظ سعر الصرف</button>
        </form>
      </div>
      <div className="finance-ledger-grid">
        <article className="panel finance-ledger"><h3>الأرصدة المسجلة <span>{ledger.balances.length}</span></h3>
          {ledger.balances.length ? ledger.balances.map(item => <div className="finance-ledger-row" key={item.id}><span><b>{(item as FinancialBalance & {label?:string}).label || item.kind}</b><small>{item.kind === 'ASSET' ? 'أصل' : 'التزام'} · {item.currency} · {item.asOf.slice(0,10)}</small></span><strong>{money(item.amount,item.currency)}</strong><button aria-label="حذف الرصيد" onClick={() => setLedger(current => ({...current,balances:current.balances.filter(row=>row.id!==item.id)}))}>×</button></div>) : <p className="finance-empty">لم تسجل أرصدة بعد.</p>}
        </article>
        <article className="panel finance-ledger"><h3>الحركات النقدية <span>{ledger.transactions.length}</span></h3>
          {ledger.transactions.length ? ledger.transactions.slice().sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)).map(item => <div className="finance-ledger-row" key={item.id}><span><b>{item.category}</b><small>{item.kind === 'INCOME' ? 'دخل' : item.kind === 'EXPENSE' ? 'مصروف' : 'تحويل'} · {item.occurredAt.slice(0,10)}</small></span><strong>{money(item.amount,item.currency)}</strong><button aria-label="حذف الحركة" onClick={() => setLedger(current => ({...current,transactions:current.transactions.filter(row=>row.id!==item.id)}))}>×</button></div>) : <p className="finance-empty">لم تسجل حركات بعد.</p>}
        </article>
      </div>
      <div className="finance-footer-actions"><span>{ledger.fxRates.length} سعر صرف محفوظ · {ledger.holdings.length} مركز استثماري · {cashFlow.value?.excludedTransfers ?? 0} تحويل داخلي مستبعد من صافي التدفق</span><button type="button" className="button button-ghost danger-ghost" onClick={clearLedger}>حذف السجل المحلي بالكامل</button></div>
      {notice && <p className="finance-notice" role="status">{notice}<button type="button" onClick={() => setNotice('')}>إغلاق</button></p>}
    </section>
  );
}
