import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowUpLeft,
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Database,
  Download,
  ExternalLink,
  FileUp,
  Gauge,
  Info,
  Layers3,
  LineChart,
  ListFilter,
  LockKeyhole,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  WalletCards,
  X,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DEMO_MARKETS, DEMO_QUOTES, getExpiryChoices } from './lib/demo';
import { fetchBinanceOptions } from './lib/binance';
import type { BinanceOptionsSnapshot } from './lib/binance';
import { downloadCsv, downloadCsvTemplate, parseOptionsCsv } from './lib/csv';
import type { CsvTimestampRange } from './lib/csv';
import { buildScenarioSeries, getBreakeven, getExpectedMove, getMaxLoss, getMidPrice, getSpreadPct } from './lib/options';
import type { AssetSnapshot, OptionQuote, OptionSide, PaperTrade, Underlying } from './lib/types';

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const integerFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function formatMoney(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—';
  return `${new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)} USDT`;
}

function formatCompact(value: number): string {
  return `${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value)} USDT`;
}

function formatQuotePrice(value: number): string {
  return value > 0 ? formatMoney(value, 0) : '—';
}

function formatEstimatedFields(fields: string[] | undefined): string {
  if (!fields?.length) return '';
  const labels: Record<string, string> = {
    iv: 'IV', markPrice: 'السعر المرجعي', delta: 'Delta', gamma: 'Gamma', theta: 'Theta', vega: 'Vega', unit: 'وحدة العقد', riskFreeRate: 'معدل الفائدة',
  };
  return [...new Set(fields)].map((field) => labels[field] ?? field).join('، ');
}

function formatSourceAge(sourceTimeRange: CsvTimestampRange | null): string {
  if (!sourceTimeRange) return 'عمر المصدر غير معلوم';
  const ageMs = Date.now() - new Date(sourceTimeRange.latest).getTime();
  if (!Number.isFinite(ageMs)) return 'وقت المصدر غير صالح';
  if (ageMs < -5 * 60_000) return 'وقت المصدر مستقبلي؛ تحقّق';
  const minutes = Math.max(0, Math.floor(ageMs / 60_000));
  const age = minutes < 1 ? 'أقل من دقيقة' : minutes < 60 ? `${minutes} د` : minutes < 1440 ? `${Math.floor(minutes / 60)} س` : `${Math.floor(minutes / 1440)} يوم`;
  const partial = sourceTimeRange.timestampedRows < sourceTimeRange.totalRows ? ' · تغطية زمنية جزئية' : '';
  return `عمر البيانات: ${age}${partial}`;
}

function formatTimestampAge(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'وقت الجلب غير صالح';
  const isoTime = date.toISOString();
  return formatSourceAge({ earliest: isoTime, latest: isoTime, timestampedRows: 1, totalRows: 1 });
}

function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function formatSignedPercent(value: number): string {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}%`;
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('ar-GB', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
}

function loadPaperTrades(): PaperTrade[] {
  try {
    const value = localStorage.getItem('volterra-paper-trades-v1');
    return value ? JSON.parse(value) as PaperTrade[] : [];
  } catch {
    return [];
  }
}

function getCsvMarket(quotes: OptionQuote[], underlying: Underlying): AssetSnapshot | null {
  const rows = quotes.filter((quote) => quote.underlying === underlying);
  if (!rows.length) return null;
  const spot = rows.map((row) => row.spot).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
  const near30 = rows.filter((row) => row.daysToExpiry >= 20 && row.daysToExpiry <= 40);
  const sortedIv = near30.map((row) => row.iv).sort((a, b) => a - b);
  const iv30 = sortedIv.length ? sortedIv[Math.floor(sortedIv.length / 2)] : null;
  const oiRows = rows.filter((row) => row.openInterest !== null);
  const directOiUsdRows = rows.filter((row) => row.openInterestUsd !== undefined && row.openInterestUsd !== null);
  const volumeRows = rows.filter((row) => row.volume !== null);
  const directVolumeUsdRows = rows.filter((row) => row.volumeQuote !== undefined && row.volumeQuote !== null);
  const openInterestUsd = directOiUsdRows.length
    ? directOiUsdRows.reduce((sum, row) => sum + (row.openInterestUsd ?? 0), 0)
    : oiRows.length
      ? oiRows.reduce((sum, row) => sum + (row.openInterest ?? 0) * row.spot * row.unit, 0)
      : null;
  const volume24hUsd = directVolumeUsdRows.length
    ? directVolumeUsdRows.reduce((sum, row) => sum + (row.volumeQuote ?? 0), 0)
    : volumeRows.length
      ? volumeRows.reduce((sum, row) => sum + (row.volume ?? 0) * row.spot * row.unit, 0)
      : null;
  return {
    underlying,
    spot,
    dayChangePct: 0,
    iv30,
    rv30: null,
    openInterestUsd,
    volume24hUsd,
    fundingRate: 0,
  };
}

function getQuantityStep(quote: OptionQuote): number {
  const lotFilter = quote.filters?.find((filter) => ['LOT_SIZE', 'MARKET_LOT_SIZE'].includes(filter.filterType.toUpperCase()));
  const filterStep = Number(lotFilter?.stepSize);
  if (Number.isFinite(filterStep) && filterStep > 0) return filterStep;
  if (quote.quantityScale !== undefined && quote.quantityScale >= 0) return 10 ** -quote.quantityScale;
  return 0.01;
}

function StatCard({ label, value, change, icon, tone = 'neutral', footnote }: {
  label: string;
  value: string;
  change?: string;
  icon: React.ReactNode;
  tone?: 'neutral' | 'positive' | 'negative' | 'accent';
  footnote?: string;
}) {
  return (
    <article className={`stat-card stat-${tone}`}>
      <div className="stat-top">
        <span className="stat-icon">{icon}</span>
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-value-row">
        <strong className="stat-value">{value}</strong>
        {change && <span className={`stat-change ${tone === 'negative' ? 'down' : tone === 'positive' ? 'up' : ''}`}>{change}</span>}
      </div>
      {footnote && <span className="stat-footnote">{footnote}</span>}
      <div className="stat-spark" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
    </article>
  );
}

function EmptyState({ title, note }: { title: string; note: string }) {
  return <div className="empty-state"><Database size={20} /><strong>{title}</strong><span>{note}</span></div>;
}

function App() {
  const [underlying, setUnderlying] = useState<Underlying>('BTC');
  const [quotes, setQuotes] = useState<OptionQuote[]>(DEMO_QUOTES);
  const [dataMode, setDataMode] = useState<'DEMO' | 'CSV' | 'BINANCE'>('DEMO');
  const [binanceSnapshot, setBinanceSnapshot] = useState<BinanceOptionsSnapshot | null>(null);
  const [binanceLoading, setBinanceLoading] = useState(false);
  const [binanceError, setBinanceError] = useState('');
  const [importedAt, setImportedAt] = useState<Date | null>(null);
  const [sourceTimeRange, setSourceTimeRange] = useState<CsvTimestampRange | null>(null);
  const [activeView, setActiveView] = useState('overview');
  const [selectedType, setSelectedType] = useState<OptionSide>('CALL');
  const [selectedExpiry, setSelectedExpiry] = useState(() => DEMO_QUOTES.find((quote) => quote.underlying === 'BTC' && quote.daysToExpiry === 30)?.expiry ?? DEMO_QUOTES[0].expiry);
  const [selectedId, setSelectedId] = useState(() => DEMO_QUOTES.find((quote) => quote.underlying === 'BTC' && quote.daysToExpiry === 30 && quote.type === 'CALL' && Math.abs(quote.delta - 0.5) < 0.1)?.id ?? DEMO_QUOTES[0].id);
  const [searchQuery, setSearchQuery] = useState('');
  const [quantity, setQuantity] = useState(0.01);
  const [riskBudget, setRiskBudget] = useState(100);
  const [fees, setFees] = useState(0);
  const [trades, setTrades] = useState<PaperTrade[]>(loadPaperTrades);
  const [toast, setToast] = useState('');
  const [csvWarnings, setCsvWarnings] = useState<string[]>([]);
  const [showAllCsvWarnings, setShowAllCsvWarnings] = useState(false);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const binanceRequestId = useRef(0);

  const expiryChoices = useMemo(() => getExpiryChoices(quotes, underlying), [quotes, underlying]);
  const selectedExpiryExists = expiryChoices.some((item) => item.value === selectedExpiry);
  const effectiveExpiry = selectedExpiryExists ? selectedExpiry : expiryChoices.find((item) => item.days >= 20 && item.days <= 40)?.value ?? expiryChoices[0]?.value ?? '';

  useEffect(() => {
    if (effectiveExpiry && effectiveExpiry !== selectedExpiry) setSelectedExpiry(effectiveExpiry);
  }, [effectiveExpiry, selectedExpiry]);

  const assetQuotes = useMemo(() => quotes.filter((quote) => quote.underlying === underlying), [quotes, underlying]);
  const assetChoices = useMemo(() => dataMode === 'DEMO'
    ? Object.keys(DEMO_MARKETS)
    : [...new Set(quotes.map((quote) => quote.underlying))].sort((a, b) => a.localeCompare(b)), [dataMode, quotes]);
  const market = useMemo(() => dataMode === 'DEMO' ? DEMO_MARKETS[underlying] : getCsvMarket(quotes, underlying), [dataMode, quotes, underlying]);
  const filteredQuotes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return assetQuotes
      .filter((quote) => quote.expiry === effectiveExpiry && quote.type === selectedType)
      .filter((quote) => !query || quote.symbol.toLowerCase().includes(query) || String(quote.strike).includes(query))
      .sort((a, b) => a.strike - b.strike);
  }, [assetQuotes, effectiveExpiry, searchQuery, selectedType]);

  const selectedQuote = useMemo(() => {
    const chosen = quotes.find((quote) => quote.id === selectedId);
    if (chosen && chosen.underlying === underlying && chosen.expiry === effectiveExpiry && chosen.type === selectedType) return chosen;
    return filteredQuotes[0]
      ?? assetQuotes.find((quote) => quote.expiry === effectiveExpiry && quote.type === selectedType)
      ?? assetQuotes[0]
      ?? quotes[0]
      ?? DEMO_QUOTES[0];
  }, [assetQuotes, effectiveExpiry, filteredQuotes, quotes, selectedId, selectedType, underlying]);

  useEffect(() => {
    if (filteredQuotes.length && !filteredQuotes.some((quote) => quote.id === selectedId)) setSelectedId(filteredQuotes[0].id);
  }, [filteredQuotes, selectedId]);

  useEffect(() => {
    localStorage.setItem('volterra-paper-trades-v1', JSON.stringify(trades));
  }, [trades]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectedPremium = getMidPrice(selectedQuote);
  const quantityStep = getQuantityStep(selectedQuote);
  const minimumQuantity = selectedQuote.minQty ?? quantityStep;
  const safeQuantity = Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
  const safeFees = Number.isFinite(fees) ? Math.max(0, fees) : 0;
  const safeRiskBudget = Number.isFinite(riskBudget) ? Math.max(0, riskBudget) : 0;
  const totalCost = selectedPremium * safeQuantity * selectedQuote.unit + safeFees;
  const breakEven = getBreakeven(selectedQuote, selectedPremium, safeFees, safeQuantity);
  const maxLoss = getMaxLoss(selectedPremium, safeQuantity, selectedQuote.unit, safeFees);
  const expectedMove = getExpectedMove(selectedQuote.spot, selectedQuote.iv, selectedQuote.daysToExpiry);
  const scenarioSeries = useMemo(() => buildScenarioSeries(selectedQuote, selectedPremium, safeQuantity, safeFees), [safeFees, safeQuantity, selectedPremium, selectedQuote]);
  const rawAffordableQty = selectedPremium > 0 ? Math.floor(Math.max(0, safeRiskBudget - safeFees) / (selectedPremium * selectedQuote.unit) / quantityStep + 1e-9) * quantityStep : 0;
  const affordableQty = selectedQuote.maxQty === undefined ? rawAffordableQty : Math.min(rawAffordableQty, selectedQuote.maxQty);
  const spreadPct = getSpreadPct(selectedQuote);
  const quoteQuality = !Number.isFinite(spreadPct) ? 'غير متاح' : spreadPct <= 4 ? 'ضيق نسبياً' : spreadPct <= 10 ? 'متوسط' : 'واسع';
  const hasValidTwoSidedQuote = selectedQuote.bid > 0 && selectedQuote.ask >= selectedQuote.bid;
  const binancePriceBasis = selectedQuote.priceSource === 'MARK' ? 'Mark price من Binance'
    : selectedQuote.priceSource === 'MID' ? 'منتصف Bid/Ask من Binance'
      : selectedQuote.priceSource === 'LAST' ? 'آخر تداول من Binance'
        : selectedQuote.priceSource === 'BID' ? 'Bid فقط من Binance'
          : selectedQuote.priceSource === 'ASK' ? 'Ask فقط من Binance'
            : selectedQuote.priceSource === 'MODEL' ? 'تقدير Black–Scholes · ليس سعراً مرصوداً'
              : selectedQuote.estimatedFields?.includes('markPrice') ? 'تقدير Black–Scholes · ليس سعراً مرصوداً'
                : 'سعر مرجعي من Binance';
  const priceBasis = dataMode === 'DEMO'
    ? 'منتصف Bid/Ask · بيانات محاكاة'
    : hasValidTwoSidedQuote
      ? `منتصف Bid/Ask من ${dataMode === 'BINANCE' ? 'Binance' : 'الملف'}`
      : dataMode === 'BINANCE'
        ? binancePriceBasis
        : selectedQuote.estimatedFields?.includes('markPrice') && selectedQuote.markPrice > 0
          ? 'تقدير Black–Scholes · ليس سعراً مرصوداً'
          : selectedQuote.markPrice > 0
            ? 'Mark من الملف · طرف سوق ناقص'
            : selectedQuote.bid > 0
              ? 'Bid فقط · لا يتوفر Ask أو Mark'
              : selectedQuote.ask > 0
                ? 'Ask فقط · لا يتوفر Bid أو Mark'
                : 'لا يوجد سعر موثوق';

  const smileData = useMemo(() => {
    const target = assetQuotes.filter((quote) => quote.daysToExpiry >= 20 && quote.daysToExpiry <= 40 && quote.type === selectedType);
    return target.sort((a, b) => a.strike - b.strike).map((quote) => ({ strike: quote.strike, iv: quote.iv, delta: quote.delta }));
  }, [assetQuotes, selectedType]);

  const termData = useMemo(() => expiryChoices.map((choice) => {
    const expiryQuotes = assetQuotes.filter((quote) => quote.expiry === choice.value);
    const referenceSpot = market?.spot ?? assetQuotes[0]?.spot ?? 0;
    const atm = [...expiryQuotes].sort((a, b) => Math.abs(a.strike - referenceSpot) - Math.abs(b.strike - referenceSpot))[0];
    return { expiry: choice.label, days: choice.days, iv: atm?.iv ?? market?.iv30 ?? 0 };
  }), [assetQuotes, expiryChoices, market]);

  const ivRvSpread = !market || market.rv30 === null || market.iv30 === null ? null : market.iv30 - market.rv30;
  const ivTone = ivRvSpread === null ? 'neutral' : ivRvSpread >= 0 ? 'yellow' : 'green';
  const dataStatusDetail = dataMode === 'DEMO'
    ? `${formatDateTime(new Date())} UTC · محاكاة`
    : dataMode === 'CSV'
      ? formatSourceAge(sourceTimeRange)
      : binanceSnapshot
        ? formatTimestampAge(binanceSnapshot.fetchedAt)
        : binanceLoading ? 'جارٍ تحميل لقطة السوق' : 'لم تُحمّل بعد';
  const dataStatusTitle = dataMode === 'BINANCE' && binanceSnapshot
    ? `آخر جلب REST عام من Binance: ${new Date(binanceSnapshot.fetchedAt).toISOString()} · لقطة وليست بثاً لحظياً.`
    : dataMode === 'CSV'
      ? `وقت الاستيراد: ${importedAt ? formatDateTime(importedAt) : '—'} UTC · ${dataStatusDetail}`
      : 'بيانات تجريبية مولّدة محلياً؛ ليست أسعاراً حية.';
  const visibleWarnings = dataMode === 'BINANCE' ? binanceSnapshot?.warnings ?? [] : csvWarnings;

  const notify = (message: string) => setToast(message);

  const invalidateBinanceRequest = () => {
    binanceRequestId.current += 1;
    setBinanceLoading(false);
  };

  const loadBinanceOptions = async () => {
    const requestId = ++binanceRequestId.current;
    setBinanceLoading(true);
    setBinanceError('');
    try {
      const snapshot = await fetchBinanceOptions(import.meta.env.VITE_BINANCE_PROXY_URL);
      if (requestId !== binanceRequestId.current) return;
      const nextUnderlying = snapshot.availableAssets.includes(underlying)
        ? underlying
        : snapshot.availableAssets.includes('BTC') ? 'BTC' : snapshot.availableAssets[0] ?? snapshot.quotes[0]?.underlying ?? 'BTC';
      const assetQuotes = snapshot.quotes.filter((quote) => quote.underlying === nextUnderlying);
      const calls = assetQuotes.filter((quote) => quote.type === 'CALL');
      const preferredCalls = calls.filter((quote) => quote.daysToExpiry >= 20 && quote.daysToExpiry <= 40);
      const defaultQuote = [...(preferredCalls.length ? preferredCalls : calls)].sort((a, b) =>
        Math.abs(a.daysToExpiry - 30) - Math.abs(b.daysToExpiry - 30)
        || Math.abs(a.strike - a.spot) - Math.abs(b.strike - b.spot),
      )[0] ?? assetQuotes[0];

      setBinanceSnapshot(snapshot);
      setQuotes(snapshot.quotes);
      setDataMode('BINANCE');
      setImportedAt(null);
      setSourceTimeRange(null);
      setCsvWarnings([]);
      setShowAllCsvWarnings(false);
      setUnderlying(nextUnderlying);
      if (defaultQuote) {
        setSelectedExpiry(defaultQuote.expiry);
        setSelectedType(defaultQuote.type);
        setSelectedId(defaultQuote.id);
        setQuantity(defaultQuote.minQty ?? getQuantityStep(defaultQuote));
      }
      setSearchQuery('');
      notify(`تم تحميل بيانات ${integerFormat.format(snapshot.quotes.length)} من أصل ${integerFormat.format(snapshot.activeSymbols)} عقد نشط من Binance.`);
    } catch (error) {
      if (requestId !== binanceRequestId.current) return;
      const message = error instanceof Error ? error.message : String(error);
      const networkHint = /fetch|network|abort|timeout|load failed/i.test(message)
        ? ' تحقّق من الاتصال وإمكانية الوصول إلى Binance؛ قد تمنع الشبكة أو قيود المنطقة أو CORS الطلب.'
        : '';
      setBinanceError(`${message}${networkHint}`);
    } finally {
      if (requestId === binanceRequestId.current) setBinanceLoading(false);
    }
  };

  const navigate = (section: string) => {
    setActiveView(section);
    const target = document.getElementById(section);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const changeUnderlying = (next: Underlying) => {
    if (dataMode !== 'DEMO' && !quotes.some((quote) => quote.underlying === next)) return;
    setUnderlying(next);
    const nextQuotes = quotes.filter((quote) => quote.underlying === next);
    const calls = nextQuotes.filter((quote) => quote.type === 'CALL');
    const near30Calls = calls.filter((quote) => quote.daysToExpiry >= 20 && quote.daysToExpiry <= 40);
    const defaultQuote = [...(near30Calls.length ? near30Calls : calls)].sort((a, b) =>
      Math.abs(a.daysToExpiry - 30) - Math.abs(b.daysToExpiry - 30)
      || Math.abs(a.strike - a.spot) - Math.abs(b.strike - b.spot),
    )[0] ?? nextQuotes[0];
    if (defaultQuote) {
      setSelectedExpiry(defaultQuote.expiry);
      setSelectedType(defaultQuote.type);
      setSelectedId(defaultQuote.id);
      if (dataMode === 'BINANCE') setQuantity(defaultQuote.minQty ?? getQuantityStep(defaultQuote));
    }
    setSearchQuery('');
  };

  const handleCsvUpload = (file?: File) => {
    if (!file) return;
    invalidateBinanceRequest();
    setBinanceError('');
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseOptionsCsv(String(reader.result ?? ''));
      if (!result.quotes.length) {
        setCsvWarnings(result.warnings);
        setShowAllCsvWarnings(false);
        notify('لم يتم العثور على عقود صالحة في الملف.');
        return;
      }
      setQuotes(result.quotes);
      setDataMode('CSV');
      setImportedAt(new Date());
      setSourceTimeRange(result.sourceTimeRange ?? null);
      setCsvWarnings(result.warnings);
      setShowAllCsvWarnings(false);
      const first = result.quotes[0];
      setUnderlying(first.underlying);
      setSelectedExpiry(first.expiry);
      setSelectedType(first.type);
      setSelectedId(first.id);
      setSearchQuery('');
      notify(`تم استيراد ${integerFormat.format(result.quotes.length)} عقد محلياً.`);
    };
    reader.onerror = () => notify('تعذر قراءة الملف. جرّب ملف CSV آخر.');
    reader.readAsText(file);
    if (uploadRef.current) uploadRef.current.value = '';
  };

  const resetDemo = () => {
    invalidateBinanceRequest();
    setBinanceError('');
    setQuotes(DEMO_QUOTES);
    setDataMode('DEMO');
    setImportedAt(null);
    setSourceTimeRange(null);
    setCsvWarnings([]);
    setShowAllCsvWarnings(false);
    setUnderlying('BTC');
    setSelectedType('CALL');
    const defaultQuote = DEMO_QUOTES.find((quote) => quote.underlying === 'BTC' && quote.daysToExpiry === 30 && quote.type === 'CALL' && Math.abs(quote.delta - 0.5) < 0.1) ?? DEMO_QUOTES[0];
    setSelectedExpiry(defaultQuote.expiry);
    setSelectedId(defaultQuote.id);
    setQuantity(0.01);
    setSearchQuery('');
    notify('تمت استعادة مجموعة المحاكاة.');
  };

  const savePaperTrade = () => {
    if (safeQuantity <= 0) {
      notify('أدخل كمية أكبر من صفر للمحاكاة.');
      return;
    }
    if (dataMode === 'BINANCE') {
      const stepCount = safeQuantity / quantityStep;
      if (safeQuantity + 1e-9 < minimumQuantity) {
        notify(`الكمية أقل من الحد الأدنى لعقد Binance (${numberFormat.format(minimumQuantity)}).`);
        return;
      }
      if (selectedQuote.maxQty !== undefined && safeQuantity - 1e-9 > selectedQuote.maxQty) {
        notify(`الكمية تتجاوز الحد الأقصى للعقد (${numberFormat.format(selectedQuote.maxQty)}).`);
        return;
      }
      if (Math.abs(stepCount - Math.round(stepCount)) > 1e-7) {
        notify(`الكمية يجب أن تتوافق مع خطوة العقد ${numberFormat.format(quantityStep)}.`);
        return;
      }
    }
    const newTrade: PaperTrade = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`,
      createdAt: new Date().toISOString(),
      underlying: selectedQuote.underlying,
      symbol: selectedQuote.symbol,
      type: selectedQuote.type,
      expiry: selectedQuote.expiry,
      strike: selectedQuote.strike,
      quantity: safeQuantity,
      entryPremium: selectedPremium,
      fees: safeFees,
      spotAtEntry: selectedQuote.spot,
      status: 'PAPER',
    };
    setTrades((current) => [newTrade, ...current]);
    notify('أضيفت الصفقة إلى الدفتر التجريبي فقط.');
  };

  const exportTrades = () => {
    if (!trades.length) {
      notify('لا توجد صفقات تجريبية لتصديرها.');
      return;
    }
    downloadCsv('volterra-paper-journal.csv', trades.map((trade) => ({
      createdAtUTC: trade.createdAt,
      symbol: trade.symbol,
      underlying: trade.underlying,
      optionType: trade.type,
      expiry: trade.expiry,
      strike: trade.strike,
      quantity: trade.quantity,
      entryPremiumUSDT: trade.entryPremium,
      feesUSDT: trade.fees,
      spotAtEntryUSDT: trade.spotAtEntry,
      mode: 'PAPER',
    })));
  };

  const handleBudgetClick = () => {
    if (affordableQty + 1e-9 < minimumQuantity) {
      notify(`الميزانية لا تكفي للحد الأدنى لهذه السلسلة (${numberFormat.format(minimumQuantity)}).`);
      return;
    }
    setQuantity(affordableQty);
    const precision = Math.min(8, Math.max(0, String(quantityStep).split('.')[1]?.length ?? 0));
    notify(`حُسبت كمية تجريبية قدرها ${affordableQty.toFixed(precision)} وفق الميزانية المدخلة.`);
  };

  const navItems = [
    { id: 'overview', label: 'نظرة عامة', icon: <BarChart3 size={17} /> },
    { id: 'scanner', label: 'ماسح العقود', icon: <ListFilter size={17} /> },
    { id: 'trade-lab', label: 'مختبر الصفقة', icon: <Target size={17} /> },
    { id: 'journal', label: 'الدفتر التجريبي', icon: <BookOpen size={17} /> },
  ];

  return (
    <div className="app-shell" dir="rtl">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark"><span>V</span><i /></div>
          <div><div className="brand-name">VOLTERRA</div><div className="brand-subtitle">OPTIONS INTELLIGENCE</div></div>
        </div>

        <div className="workspace-label">مساحة العمل <ChevronDown size={14} /></div>
        <div className="workspace-card"><div className="workspace-avatar">A</div><div><strong>مختبر شخصي</strong><span>وضع تحليلي</span></div><span className="online-dot" /></div>

        <div className="nav-caption">المنصة</div>
        <nav className="side-nav" aria-label="التنقل الرئيسي">
          {navItems.map((item) => (
            <button key={item.id} className={`nav-item ${activeView === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)}>
              {item.icon}<span>{item.label}</span>{item.id === 'journal' && trades.length > 0 && <em>{trades.length}</em>}
            </button>
          ))}
        </nav>

        <div className="sidebar-divider" />
        <div className="nav-caption">مصدر البيانات</div>
        <div className="source-card">
          <div className="source-icon"><Database size={16} /></div>
          <div className="source-copy"><strong>{dataMode === 'DEMO' ? 'بيانات تجريبية' : dataMode === 'CSV' ? 'ملف محلي مستورد' : 'Binance Options'}</strong><span>{dataMode === 'DEMO' ? 'ليست أسعاراً حية' : dataMode === 'CSV' ? 'لا يغادر جهازك' : 'وسيط عام للقراءة فقط'}</span></div>
          <span className={`source-indicator ${dataMode === 'DEMO' ? 'demo' : dataMode === 'CSV' ? 'imported' : 'binance'}`} />
        </div>

        <div className="sidebar-spacer" />
        <div className="sidebar-disclaimer"><ShieldAlert size={15} /><span>تحليل ومحاكاة فقط<br />لا ينفّذ أوامر تداول</span></div>
        <div className="sidebar-footer"><span>VOL 0.1.0</span><span>UTC · 24/7</span></div>
      </aside>

      <main className="main-content" id="overview">
        <header className="topbar">
          <div className="breadcrumbs"><span>مساحة العمل</span><span className="crumb-slash">/</span><strong>مختبر الخيارات</strong></div>
          <div className="topbar-actions">
            <div className="data-status" title={dataStatusTitle}><span className={`pulse-dot ${dataMode !== 'DEMO' ? 'imported' : ''}`} /><span>{dataMode === 'DEMO' ? 'محاكاة' : dataMode === 'CSV' ? 'CSV محلي' : 'Binance'}</span><small>{dataStatusDetail}</small></div>
            <button className="icon-button help-button" title="حول هذا المختبر" onClick={() => setShowAssumptions((value) => !value)}><CircleHelp size={17} /></button>
            <button className="avatar-button" title="ملف شخصي محلي">م</button>
          </div>
        </header>

        <div className="page-container">
          <section className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> DIGITAL ASSET DERIVATIVES <span className="eyebrow-dot">·</span> WORKSPACE</div>
              <h1>مختبر <span>الخيارات</span></h1>
              <p>حلّل العقد، اختبر السيناريو، وسجّل قرارك — من دون تنفيذ أوامر.</p>
            </div>
            <div className="heading-actions">
              {dataMode === 'BINANCE' ? (
                <label className="select-control asset-select"><span>الأصل</span><select value={underlying} onChange={(event) => changeUnderlying(event.target.value)} aria-label="اختر أصل Binance">
                  {assetChoices.map((item) => <option key={item} value={item}>{item}</option>)}
                </select><ChevronDown size={13} /></label>
              ) : (
                <div className="asset-switch" role="tablist" aria-label="الأصل الأساسي">
                  {assetChoices.map((item) => <button key={item} className={underlying === item ? 'selected' : ''} onClick={() => changeUnderlying(item)}>{item}<span>{item === 'BTC' ? 'Bitcoin' : item === 'ETH' ? 'Ethereum' : 'الأصل الأساسي'}</span></button>)}
                </div>
              )}
              <div className="upload-actions">
                <button className={`button button-binance ${dataMode === 'BINANCE' ? 'active' : ''}`} onClick={loadBinanceOptions} disabled={binanceLoading} title="تحميل سلسلة الخيارات والبيانات العامة من Binance">
                  <RefreshCw className={binanceLoading ? 'spin' : ''} size={14} /> {binanceLoading ? 'جارٍ جلب Binance…' : dataMode === 'BINANCE' ? 'تحديث Binance' : 'تحميل Binance'}
                </button>
                <button className="button button-ghost" onClick={downloadCsvTemplate}><Download size={15} /> قالب CSV</button>
                <button className="button button-primary" onClick={() => uploadRef.current?.click()}><FileUp size={16} /> استيراد CSV</button>
                <input ref={uploadRef} type="file" accept=".csv,text/csv" hidden onChange={(event) => handleCsvUpload(event.target.files?.[0])} />
              </div>
            </div>
          </section>

          <section className="compliance-banner" aria-label="تنبيه تنظيمي وتعليمي">
            <div className="compliance-icon"><ShieldAlert size={18} /></div>
            <div className="compliance-copy"><strong>وضع تحليلي وتجريبي</strong><span>مصدر البيانات موضح في الواجهة: Demo اصطناعي، CSV محلي، أو لقطة REST عامة من Binance عبر وسيط للقراءة فقط، وليست بثاً لحظياً. لا تمثل الأرقام توصية. إذا كنت في المملكة المتحدة، تحقّق من أهلية الوصول إلى مشتقات الأصول المشفرة.</span></div>
            <a href="https://www.fca.org.uk/news/press-releases/fca-lift-ban-crypto-exchange-traded-notes" target="_blank" rel="noreferrer" className="fca-link">معلومات FCA <ExternalLink size={13} /></a>
          </section>

          {binanceError && (
            <div className="source-error" role="alert">
              <div className="source-error-icon"><ShieldAlert size={16} /></div>
              <div><strong>{dataMode === 'BINANCE' && binanceSnapshot ? 'تعذّر تحديث Binance' : 'تعذّر تحميل بيانات Binance'}</strong><span>{binanceError}{dataMode === 'BINANCE' && binanceSnapshot ? ' — ما يزال المعروض آخر لقطة محمّلة.' : ''}</span></div>
              <button className="button button-ghost" onClick={loadBinanceOptions} disabled={binanceLoading}><RefreshCw size={13} /> إعادة المحاولة</button>
            </div>
          )}

          {visibleWarnings.length > 0 && (
            <div className="csv-warning" role="status"><div><Info size={16} /><strong>{dataMode === 'BINANCE' ? 'ملاحظات بيانات Binance' : 'ملاحظات استيراد CSV'}</strong></div><button className="csv-warning-close" onClick={() => dataMode === 'BINANCE' ? setBinanceSnapshot((current) => current ? { ...current, warnings: [] } : null) : setCsvWarnings([])} aria-label="إغلاق"><X size={15} /></button><ul>{(showAllCsvWarnings ? visibleWarnings : visibleWarnings.slice(0, 5)).map((warning, index) => <li key={index}>{warning}</li>)}</ul>{visibleWarnings.length > 5 && <button className="csv-warning-toggle" onClick={() => setShowAllCsvWarnings((value) => !value)}>{showAllCsvWarnings ? 'عرض ملاحظات أقل' : `عرض ${visibleWarnings.length - 5} ملاحظات أخرى`}</button>}</div>
          )}

          <section className="market-summary section-anchor" id="overview-metrics">
            <div className="section-title-row compact-title"><div><span className="section-kicker">MARKET SNAPSHOT</span><h2>لقطة السوق</h2></div><div className="snapshot-meta"><span className="live-hollow" />{dataMode === 'DEMO' ? 'قيم توضيحية مولّدة' : dataMode === 'CSV' ? 'مصدر الملف الذي استوردته' : `Binance REST · ${integerFormat.format(binanceSnapshot?.activeSymbols ?? 0)} عقد نشط / ${integerFormat.format(binanceSnapshot?.quotes.length ?? 0)} محلل`}<span className="meta-separator">·</span><span>{underlying}/USDT</span></div></div>
            {market ? <div className="stats-grid">
              <StatCard label={`السعر المرجعي · ${underlying}`} value={formatMoney(market.spot, underlying === 'BTC' ? 0 : 2)} change={dataMode === 'DEMO' ? formatSignedPercent(DEMO_MARKETS[underlying].dayChangePct) : undefined} tone={dataMode === 'DEMO' ? (DEMO_MARKETS[underlying].dayChangePct >= 0 ? 'positive' : 'negative') : 'neutral'} footnote={dataMode === 'DEMO' ? 'قيمة محاكاة — ليست سعر Binance' : dataMode === 'BINANCE' ? 'مؤشر الأصل من Binance Options REST' : 'وسيط الأسعار الواردة في CSV'} icon={<span className="asset-symbol">{underlying === 'BTC' ? '₿' : underlying === 'ETH' ? 'Ξ' : underlying.slice(0, 3)}</span>} />
              <StatCard label="التقلب الضمني · 30 يوم" value={market.iv30 === null ? 'غير متاح' : formatPercent(market.iv30)} change={market.iv30 === null ? 'لا يوجد أجل قريب' : dataMode === 'DEMO' ? 'قيمة مولّدة' : dataMode === 'BINANCE' ? 'سلسلة الخيارات' : 'تقريب من السلسلة'} tone={market.iv30 === null ? 'neutral' : 'accent'} footnote={market.iv30 === null ? 'يلزم وجود خيارات بين 20 و40 يوماً' : dataMode === 'DEMO' ? 'بيانات محاكاة وليست حية' : dataMode === 'BINANCE' ? 'وسيط IV لعقود 20–40 يوماً؛ قد يتضمن استنتاجاً' : 'وسيط صفوف 20–40 يوماً المتاحة'} icon={<Activity size={17} />} />
              <StatCard label="التقلب المحقّق · 30 يوم" value={market.rv30 === null ? 'غير متاح' : formatPercent(market.rv30)} change={market.rv30 === null ? 'يلزم تاريخ الأصل' : 'مرجع توضيحي'} tone="neutral" footnote={market.rv30 === null ? dataMode === 'BINANCE' ? 'لقطة REST لا توفر تاريخاً كافياً' : 'CSV لا يتضمن سلسلة أسعار تاريخية' : 'المحاكاة تستخدم قيمة ثابتة'} icon={<LineChart size={17} />} />
              <StatCard label="IV − RV" value={ivRvSpread === null ? 'غير متاح' : `${ivRvSpread >= 0 ? '+' : ''}${(ivRvSpread * 100).toFixed(1)} نقطة`} change={ivRvSpread === null ? 'بيانات غير كافية' : 'قراءة وصفية'} tone={ivTone === 'yellow' ? 'accent' : ivTone === 'green' ? 'positive' : 'neutral'} footnote={ivRvSpread === null ? 'لا نخلط بيانات تاريخية غير متوفرة' : 'ليس إشارة بيع أو شراء'} icon={<Gauge size={17} />} />
              <StatCard label="الفائدة المفتوحة الاسمية" value={market.openInterestUsd === null ? 'غير متاح' : formatCompact(market.openInterestUsd)} change="من صفوف اللقطة" tone="neutral" footnote={dataMode === 'DEMO' ? 'قيمة تقريبية مولّدة' : dataMode === 'BINANCE' ? 'مجموع sumOpenInterestUsd من Binance' : 'OI × السعر المرجعي × وحدة العقد'} icon={<Layers3 size={17} />} />
              <StatCard label="حجم التداول · 24 ساعة" value={market.volume24hUsd === null ? 'غير متاح' : formatCompact(market.volume24hUsd)} change="من صفوف اللقطة" tone="neutral" footnote={dataMode === 'DEMO' ? 'قيمة تقريبية مولّدة' : dataMode === 'BINANCE' ? 'مجموع amount من تكرات Binance' : 'تقدير من الحجم والسعر ووحدة العقد'} icon={<BarChart3 size={17} />} />
            </div> : <EmptyState title="لا توجد بيانات لهذا الأصل في الملف" note="استورد سلسلة تتضمن عقوداً وسعراً مرجعياً لهذا الأصل، أو استعد بيانات المحاكاة." />}
          </section>

          <section className="charts-grid">
            <article className="panel chart-panel">
              <div className="panel-heading"><div><span className="section-kicker">VOLATILITY STRUCTURE</span><h2>ابتسامة التقلب</h2><p>IV حسب سعر التنفيذ · أقرب انتهاء إلى 30 يوماً</p></div><div className="chart-select"><span className="chart-legend-dot" />{selectedType === 'CALL' ? 'Calls' : 'Puts'}<ChevronDown size={13} /></div></div>
              {smileData.length ? <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={smileData} margin={{ top: 10, right: 8, left: -18, bottom: 2 }}>
                    <defs><linearGradient id="ivFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b6f36e" stopOpacity={0.22} /><stop offset="100%" stopColor="#b6f36e" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid stroke="#222b31" strokeDasharray="3 5" vertical={false} />
                    <XAxis dataKey="strike" tickFormatter={(value) => numberFormat.format(Number(value) / (underlying === 'BTC' ? 1000 : 1000))} tick={{ fill: '#78838a', fontSize: 10 }} axisLine={{ stroke: '#283137' }} tickLine={false} />
                    <YAxis tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`} tick={{ fill: '#78838a', fontSize: 10 }} axisLine={false} tickLine={false} domain={['dataMin - 0.04', 'dataMax + 0.04']} />
                    <Tooltip contentStyle={{ background: '#11171b', border: '1px solid #2b353b', borderRadius: 10, color: '#e7ede8', fontSize: 12 }} formatter={(value) => [`${(Number(value) * 100).toFixed(2)}%`, 'IV']} labelFormatter={(value) => `Strike: ${numberFormat.format(Number(value))}`} />
                    <Area type="monotone" dataKey="iv" stroke="#b6f36e" strokeWidth={2.2} fill="url(#ivFill)" activeDot={{ r: 4, fill: '#d2ff92', stroke: '#182012', strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div> : <EmptyState title="لا تتوفر سلسلة كافية" note="استورد صفوف خيارات تتضمن IV وسعر التنفيذ." />}
              <div className="chart-footnote"><span>سعر التنفيذ (آلاف {underlying})</span><span>الابتسامة المعروضة من البيانات الحالية فقط</span></div>
            </article>

            <article className="panel chart-panel term-panel">
              <div className="panel-heading"><div><span className="section-kicker">TERM STRUCTURE</span><h2>منحنى الانتهاء</h2><p>التقلب الضمني لأقرب عقد إلى السعر المرجعي</p></div><div className="chart-legend"><span className="chart-legend-dot blue" />ATM IV</div></div>
              {termData.length ? <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={termData} margin={{ top: 10, right: 5, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="#222b31" strokeDasharray="3 5" vertical={false} />
                    <XAxis dataKey="expiry" tick={{ fill: '#78838a', fontSize: 10 }} axisLine={{ stroke: '#283137' }} tickLine={false} />
                    <YAxis tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`} tick={{ fill: '#78838a', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 'dataMax + 0.12']} />
                    <Tooltip contentStyle={{ background: '#11171b', border: '1px solid #2b353b', borderRadius: 10, color: '#e7ede8', fontSize: 12 }} formatter={(value) => [`${(Number(value) * 100).toFixed(2)}%`, 'ATM IV']} />
                    <Bar dataKey="iv" fill="#8e9ff5" radius={[5, 5, 0, 0]} maxBarSize={34} />
                  </BarChart>
                </ResponsiveContainer>
              </div> : <EmptyState title="لا تتوفر استحقاقات" note="استورد أكثر من تاريخ انتهاء لرؤية المنحنى." />}
              <div className="chart-footnote"><span>المدة حتى الانتهاء</span><span>أداة وصفية وليست توقعاً</span></div>
            </article>
          </section>

          <section className="section-anchor scanner-section" id="scanner">
            <div className="section-title-row"><div><span className="section-kicker">OPTION CHAIN</span><h2>ماسح العقود</h2><p>اختر عقداً لعرض تحليله — لا توجد أوامر تنفيذ في هذا المختبر.</p></div><button className="text-button" onClick={resetDemo}><Zap size={14} /> استعادة المحاكاة</button></div>
            <div className="scanner-layout">
              <article className="panel chain-panel">
                <div className="chain-toolbar">
                  <div className="option-tabs" role="tablist" aria-label="نوع الخيار">
                    <button className={selectedType === 'CALL' ? 'active call-tab' : ''} disabled={!assetQuotes.some((quote) => quote.expiry === effectiveExpiry && quote.type === 'CALL')} onClick={() => {
                      const next = assetQuotes.find((quote) => quote.expiry === effectiveExpiry && quote.type === 'CALL');
                      if (next) { setSelectedType('CALL'); setSelectedId(next.id); }
                    }}>Call <span>شراء حق الصعود</span></button>
                    <button className={selectedType === 'PUT' ? 'active put-tab' : ''} disabled={!assetQuotes.some((quote) => quote.expiry === effectiveExpiry && quote.type === 'PUT')} onClick={() => {
                      const next = assetQuotes.find((quote) => quote.expiry === effectiveExpiry && quote.type === 'PUT');
                      if (next) { setSelectedType('PUT'); setSelectedId(next.id); }
                    }}>Put <span>شراء حق الهبوط</span></button>
                  </div>
                  <div className="chain-controls">
                    <label className="select-control"><span>الانتهاء</span><select value={effectiveExpiry} onChange={(event) => {
                      const nextExpiry = event.target.value;
                      setSelectedExpiry(nextExpiry);
                      const nextQuote = assetQuotes.find((quote) => quote.expiry === nextExpiry && quote.type === selectedType)
                        ?? assetQuotes.find((quote) => quote.expiry === nextExpiry);
                      if (nextQuote) { setSelectedType(nextQuote.type); setSelectedId(nextQuote.id); }
                    }}>
                      {expiryChoices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                    </select><ChevronDown size={13} /></label>
                    <label className="search-control"><Search size={14} /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="سعر التنفيذ أو الرمز" /></label>
                  </div>
                </div>
                <div className="chain-table-wrap">
                  <table className="chain-table">
                    <thead><tr><th>العقد / Strike</th><th>Bid</th><th>Ask</th><th>IV</th><th>Delta</th><th title="الفائدة المفتوحة بالعقود">OI</th><th title="الحجم المتداول خلال 24 ساعة بوحدات العقد">حجم 24س</th><th>Spread</th></tr></thead>
                    <tbody>
                      {filteredQuotes.map((quote) => {
                        const spread = getSpreadPct(quote);
                        const isSelected = quote.id === selectedQuote.id;
                        const moneyness = ((quote.strike / quote.spot) - 1) * 100;
                        return <tr key={quote.id} onClick={() => setSelectedId(quote.id)} className={isSelected ? 'selected-row' : ''}>
                          <td><div className="contract-cell"><strong>{numberFormat.format(quote.strike)}</strong><span className={`moneyness ${Math.abs(moneyness) < 2.6 ? 'atm' : ''}`}>{Math.abs(moneyness) < 2.6 ? 'ATM' : `${moneyness > 0 ? '+' : ''}${moneyness.toFixed(1)}%`}</span></div><span className="contract-symbol">{quote.symbol}</span></td>
                          <td>{formatQuotePrice(quote.bid)}</td><td>{formatQuotePrice(quote.ask)}</td><td className="iv-cell">{formatPercent(quote.iv)}</td><td className={quote.delta >= 0 ? 'positive-text' : 'negative-text'}>{quote.delta.toFixed(3)}</td><td>{quote.openInterest === null ? '—' : numberFormat.format(quote.openInterest)}</td><td>{quote.volume === null ? '—' : numberFormat.format(quote.volume)}</td><td><span className={`spread-pill ${!Number.isFinite(spread) ? 'unknown' : spread > 8 ? 'wide' : spread > 4 ? 'medium' : 'tight'}`}>{Number.isFinite(spread) ? `${spread.toFixed(1)}%` : '—'}</span></td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                  {!filteredQuotes.length && <EmptyState title="لا توجد عقود مطابقة" note="غيّر نوع العقد أو تاريخ الانتهاء أو ابحث برمز مختلف." />}
                </div>
                <div className="table-footer"><span>عرض {integerFormat.format(filteredQuotes.length)} عقد من أصل {integerFormat.format(assetQuotes.filter((quote) => quote.expiry === effectiveExpiry && quote.type === selectedType).length)} في هذه السلسلة</span><span><span className={`table-dot ${dataMode === 'BINANCE' ? 'binance-dot' : ''}`} />{dataMode === 'DEMO' ? 'بيانات محاكاة' : dataMode === 'CSV' ? 'بيانات CSV محلية' : 'لقطة سوق عامة من Binance · ليست بثاً لحظياً'}</span></div>
              </article>

              <aside className="panel quick-analysis" id="trade-lab">
                <div className="analysis-header"><div><span className="section-kicker">CONTRACT REVIEW</span><h3>ملخص العقد</h3></div><span className="analysis-state"><span /> فحص فقط</span></div>
                <div className="selected-contract-title"><div className={`contract-type-icon ${selectedQuote.type.toLowerCase()}`}>{selectedQuote.type === 'CALL' ? <TrendingUp size={17} /> : <TrendingDown size={17} />}</div><div><strong>{selectedQuote.underlying} {selectedQuote.type}</strong><span>{numberFormat.format(selectedQuote.strike)} · ينتهي بعد {selectedQuote.daysToExpiry.toFixed(0)} يوم</span></div><button className="copy-symbol" onClick={() => { navigator.clipboard?.writeText(selectedQuote.symbol); notify('تم نسخ رمز العقد.'); }} title="نسخ رمز العقد">⧉</button></div>
                {dataMode === 'BINANCE' && <div className="contract-specs"><span><small>وحدة العقد</small><b>{numberFormat.format(selectedQuote.unit)} {selectedQuote.underlying}</b></span><span><small>حد الكمية</small><b>{selectedQuote.minQty === undefined ? '—' : numberFormat.format(selectedQuote.minQty)} – {selectedQuote.maxQty === undefined ? '—' : numberFormat.format(selectedQuote.maxQty)}</b></span><span><small>رسوم taker</small><b>{selectedQuote.takerFeeRate === undefined ? '—' : formatPercent(selectedQuote.takerFeeRate, 2)}</b></span></div>}
                <div className="price-highlight"><span>{dataMode === 'BINANCE' ? 'سعر العقد المرجعي' : 'السعر المرجعي التقديري'}</span><strong>{formatMoney(selectedPremium)}</strong><small>{priceBasis}</small></div>
                <div className="quote-row"><span>Bid <b>{formatQuotePrice(selectedQuote.bid)}</b></span><span>Ask <b>{formatQuotePrice(selectedQuote.ask)}</b></span></div>
                <div className="quote-quality"><span>الفارق السعري</span><span className={`quality-badge ${!Number.isFinite(spreadPct) ? 'unknown' : spreadPct > 10 ? 'bad' : spreadPct > 4 ? 'warn' : 'good'}`}><i />{Number.isFinite(spreadPct) ? `${quoteQuality} · ${spreadPct.toFixed(1)}%` : 'غير متاح · يلزم Bid وAsk'}</span></div>
                <div className="analysis-divider" />
                <div className="input-grid">
                  <label><span>{dataMode === 'BINANCE' ? 'كمية العقود' : 'الكمية'} <small>{dataMode === 'BINANCE' ? 'حسب مواصفات Binance' : 'من الأصل'}</small></span><input type="number" min={dataMode === 'BINANCE' ? minimumQuantity : 0.01} step={dataMode === 'BINANCE' ? quantityStep : 0.01} max={dataMode === 'BINANCE' ? selectedQuote.maxQty : undefined} value={quantity} onChange={(event) => setQuantity(Math.max(0, Number(event.target.value)))} /></label>
                  <label><span>الرسوم التقديرية <small>USDT</small></span><input type="number" min="0" step="0.1" value={fees} onChange={(event) => setFees(Math.max(0, Number(event.target.value)))} /></label>
                </div>
                <div className="budget-row"><label htmlFor="risk-budget">حد الميزانية التجريبية</label><div><input id="risk-budget" type="number" min="0" step="10" value={riskBudget} onChange={(event) => setRiskBudget(Math.max(0, Number(event.target.value)))} /><span>USDT</span><button onClick={handleBudgetClick} title="احسب كمية لا تتجاوز الميزانية">احسب الكمية</button></div></div>
                <div className="risk-summary">
                  <div><span>تكلفة القسط + الرسوم</span><strong>{formatMoney(totalCost)}</strong></div>
                  <div><span>نقطة التعادل عند الانتهاء</span><strong>{formatMoney(breakEven, 0)}</strong></div>
                  <div className="risk-row"><span>أقصى خسارة للمشتري</span><strong className="loss-value">{formatMoney(maxLoss)}</strong></div>
                </div>
                <div className="analysis-footnote"><Info size={13} /><span>{dataMode !== 'DEMO' && selectedQuote.estimatedFields?.length ? `حقول مقدّرة أو افتراضية في هذا العقد: ${formatEstimatedFields(selectedQuote.estimatedFields)}. ` : ''}الحساب لا يضيف تلقائياً رسوم المنصة أو أثر التنفيذ؛ أدخل الرسوم الفعلية وراجع وحدة العقد.</span></div>
                <button className="button button-paper" onClick={savePaperTrade}><Plus size={16} /> أضف إلى الدفتر التجريبي</button>
                <div className="no-signal"><ShieldAlert size={15} /><span>لا يصدر المختبر توصية شراء أو بيع.</span></div>
              </aside>
            </div>
          </section>

          <section className="section-anchor payoff-section" id="payoff">
            <div className="section-title-row"><div><span className="section-kicker">EXPIRY SCENARIOS</span><h2>ماذا لو انتهى العقد عند مستويات مختلفة؟</h2><p>ربح/خسارة الخيار المشترى عند الانتهاء · قبل إضافة أي رسوم غير مدخلة</p></div><div className="scenario-controls"><span className="scenario-key"><i className="profit-key" /> صافي P&amp;L</span><span className="scenario-key"><i className="zero-key" /> التعادل</span></div></div>
            <div className="panel payoff-panel">
              <div className="payoff-chart">
                <ResponsiveContainer width="100%" height={264}>
                  <RechartsLineChart data={scenarioSeries} margin={{ top: 12, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid stroke="#222b31" strokeDasharray="3 5" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#829096', fontSize: 11 }} axisLine={{ stroke: '#283137' }} tickLine={false} />
                    <YAxis tickFormatter={(value) => `${Math.round(Number(value))}`} tick={{ fill: '#829096', fontSize: 10 }} axisLine={false} tickLine={false} width={54} />
                    <Tooltip contentStyle={{ background: '#11171b', border: '1px solid #2b353b', borderRadius: 10, color: '#e7ede8', fontSize: 12 }} formatter={(value) => [formatMoney(Number(value)), 'صافي P&L']} labelFormatter={(value, payload) => payload?.[0]?.payload ? `${value} · ${formatMoney(Number(payload[0].payload.spot), 0)}` : String(value)} />
                    <ReferenceLine y={0} stroke="#8e9aa0" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="pnl" stroke="#b6f36e" strokeWidth={2.5} dot={{ r: 3, fill: '#b6f36e', stroke: '#0f1518', strokeWidth: 2 }} activeDot={{ r: 5 }} />
                  </RechartsLineChart>
                </ResponsiveContainer>
              </div>
              <div className="scenario-side">
                <div className="scenario-side-head"><span>نطاق الحركة الضمني التقريبي</span><CircleHelp size={14} /></div>
                <div className="expected-move-value">±{formatMoney(expectedMove, 0)}</div>
                <div className="expected-range"><span>{formatMoney(Math.max(0, selectedQuote.spot - expectedMove), 0)}</span><i /><span>{formatMoney(selectedQuote.spot + expectedMove, 0)}</span></div>
                <p>تقريب 1σ من IV حتى الانتهاء. ليس توقعاً ولا احتمالاً مؤكداً.</p>
                <div className="scenario-divider" />
                <div className="scenario-stat"><span>Delta</span><strong className={selectedQuote.delta >= 0 ? 'positive-text' : 'negative-text'}>{selectedQuote.delta.toFixed(3)}</strong><small>حساسية تقريبية لكل حركة وحدة</small></div>
                <div className="scenario-stat"><span>Theta / يوم</span><strong className="negative-text">{formatMoney(selectedQuote.theta * safeQuantity * selectedQuote.unit)}</strong><small>تقدير النموذج، يتغير مع السوق</small></div>
                <div className="scenario-stat"><span>Vega / نقطة تقلب</span><strong>{formatMoney(selectedQuote.vega * safeQuantity * selectedQuote.unit)}</strong><small>حساسية تقريبية لـ +1 نقطة مئوية</small></div>
              </div>
            </div>
          </section>

          <section className="model-strip">
            <button className="model-toggle" onClick={() => setShowAssumptions((value) => !value)}><div className="model-icon"><Info size={16} /></div><div><strong>افتراضات النموذج وحدوده</strong><span>{dataMode === 'BINANCE' ? 'Binance REST snapshot · Mark/IV عند التوفر · بعض Greeks نموذجية' : dataMode === 'CSV' ? 'CSV محلي · Black–Scholes تقديري للقيم الناقصة' : 'Black–Scholes توضيحي · فائدة مفترضة 0% · تسوية أوروبية'}</span></div><ChevronDown className={showAssumptions ? 'rotated' : ''} size={16} /></button>
            {showAssumptions && <div className="model-details">{dataMode === 'BINANCE' ? <><p>تمر طلبات Binance عبر وسيط Supabase عام محدود بواجهات بيانات السوق للقراءة فقط لتوافق CORS؛ يطلب exchangeInfo لاكتشاف العقود النشطة وmark/ticker/index وopenInterest لبيانات السوق. لا يخزن الوسيط مفاتيح API ولا يقبل مسارات حساب أو تداول، ولا يتجاوز قيود Binance الجغرافية. ما يظهر لقطة REST عند آخر تحديث وليس بثاً لحظياً؛ وقد تتغير العقود أو تتأخر البيانات أو تُحجب حسب الشبكة والمنطقة.</p><p>تُعرض Mark/IV وBid/Ask والمؤشر والفائدة المفتوحة عند توفرها. يستخدم التحليل Delta من Binance عند وجوده ويقدّر Gamma وTheta وVega بنموذج Black–Scholes؛ ويعلّم القيم المستنتجة والافتراضات. قد تختلف وحدات العقد ووحدات Greeks عن افتراضات النموذج، لذا لا تُعاملها كقياسات تداول موثقة ولا تعتمد عليها مالياً.</p></> : <><p>{dataMode === 'DEMO' ? 'هذه نسخة محاكاة: بيانات الأسعار في وضع Demo مولدة وليست متصلة بـBinance. تسعير العرض يتم بنموذج Black–Scholes مبسط مع معدل فائدة 0%؛ وقد تختلف أسواق العملات المشفرة بسبب الابتسامة، القفزات، السيولة، التمويل، والفروقات بين السعر النظري وسعر التنفيذ.' : 'يستخدم المحلل في CSV السعر المتوسط من Bid/Ask إن توفرا، ويحسب القيم المفقودة تقريبياً. النتائج لا تشمل الرسوم تلقائياً إلا إذا أدخلتها؛ تحقّق من الوحدات والطوابع الزمنية.'}</p><p>لا يستخدم المختبر مصادر بديلة خفية ولا يخلط بيانات Demo ببيانات CSV أو Binance. لا تستخدم المحاكاة لاتخاذ قرار مالي مباشر.</p></>}</div>}
          </section>

          <section className="section-anchor journal-section" id="journal">
            <div className="section-title-row"><div><span className="section-kicker">PAPER WORKSPACE</span><h2>الدفتر التجريبي</h2><p>سجل الفرضية والكمية والقسط قبل أن تقيم جودة القرار.</p></div><div className="journal-actions"><button className="button button-ghost" onClick={exportTrades}><Download size={14} /> تصدير CSV</button><button className="button button-ghost danger-ghost" onClick={() => { setTrades([]); notify('تم مسح الدفتر المحلي.'); }} disabled={!trades.length}><Trash2 size={14} /> مسح الدفتر</button></div></div>
            <article className="panel journal-panel">
              <div className="journal-summary"><div className="journal-summary-icon"><WalletCards size={18} /></div><div><strong>{trades.length} <span>صفقة تجريبية</span></strong><small>محفوظة محلياً في هذا المتصفح فقط</small></div><div className="journal-metric"><span>وضع التنفيذ</span><strong><i /> PAPER ONLY</strong></div><div className="journal-metric"><span>مفاتيح تداول</span><strong className="safe-label"><LockKeyhole size={13} /> غير مطلوبة</strong></div></div>
              {trades.length ? <div className="journal-table-wrap"><table className="journal-table"><thead><tr><th>وقت التسجيل</th><th>العقد</th><th>Strike</th><th>كمية</th><th>قسط الدخول</th><th>Spot وقتها</th><th>الحالة</th></tr></thead><tbody>{trades.map((trade) => <tr key={trade.id}><td>{formatDateTime(new Date(trade.createdAt))}</td><td><span className={`mini-type ${trade.type.toLowerCase()}`}>{trade.type}</span><strong>{trade.symbol}</strong></td><td>{numberFormat.format(trade.strike)}</td><td>{trade.quantity.toFixed(2)}</td><td>{formatMoney(trade.entryPremium, 2)}</td><td>{formatMoney(trade.spotAtEntry, 0)}</td><td><span className="paper-status"><i /> تجريبية</span></td></tr>)}</tbody></table></div> : <div className="journal-empty"><div className="journal-empty-icon"><BookOpen size={20} /></div><strong>لا توجد صفقات مسجلة بعد</strong><span>اختر عقداً من الماسح ثم أضفه إلى الدفتر. لن يتم إرسال أي أمر إلى أي منصة.</span><button className="text-button" onClick={() => navigate('scanner')}>ابدأ بتحليل عقد <ArrowUpLeft size={14} /></button></div>}
            </article>
          </section>

          <footer className="app-footer"><div><span className="footer-brand-mark">V</span><span>VOLTERRA <small>DECISION LAB</small></span></div><p>أداة تحليل تعليمية ومحاكاة — ليست نصيحة مالية، ولا تنفّذ أوامر تداول.</p><div className="footer-links"><button onClick={downloadCsvTemplate}>قالب البيانات</button><a href="https://www.fca.org.uk/" target="_blank" rel="noreferrer">FCA <ExternalLink size={11} /></a></div></footer>
        </div>
      </main>

      <div className="mobile-bottom-nav">
        {navItems.map((item) => <button key={item.id} className={activeView === item.id ? 'active' : ''} onClick={() => navigate(item.id)}>{item.icon}<span>{item.label}</span></button>)}
      </div>

      {toast && <div className="toast-message"><span><Check size={15} /></span>{toast}<button onClick={() => setToast('')} aria-label="إغلاق"><X size={14} /></button></div>}
    </div>
  );
}

export default App;
