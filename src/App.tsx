import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
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
  Star,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  WalletCards,
  X,
  Zap,
} from 'lucide-react';
import DeferredVolatilityCharts from './components/DeferredVolatilityCharts';
import DeferredPayoffChart from './components/DeferredPayoffChart';

import { DEMO_MARKETS, DEMO_QUOTES, getExpiryChoices } from './lib/demo';
import { applyBinanceBookTicker, applyBinanceOptionMarkPrice, applyBinanceOptionTicker, BinanceMarketDataError, fetchBinanceDepth, fetchBinanceOptions, parseBinanceBookTickerMessage, parseBinanceOptionMarkPriceMessage, parseBinanceOptionTickerMessage } from './lib/binance';
import type { BinanceDepthSnapshot, BinanceOptionsSnapshot } from './lib/binance';
import { getAtmTermStructure } from './lib/analysis';
import type { IVHistoryObservation, IVRankPercentileResult } from './lib/iv-history';
import { getLatestQuotePerContract, getMarketSnapshotFromQuotes } from './lib/market';
import { getQuoteDataCoverage } from './lib/quote-data-coverage';
import { assessSnapshotFreshness, DEFAULT_SNAPSHOT_STALE_AFTER_MS, formatSourceTimestampAge } from './lib/market-data-health';
import { isQuoteFieldEstimated } from './lib/quote-quality';
import { getContractScaleIssue, getContractScaleIssueMessage, hasLegacyScalarAnalyticsCapability } from './lib/contract-scale';
import { downloadCsv, downloadCsvTemplate, MAX_CSV_FILE_BYTES, parseOptionsCsv } from './lib/csv';
import type { CsvTimestampRange } from './lib/csv';
import { buildScenarioSeries, getBreakeven, getExpectedMove, getMaxLoss, getMidPrice, getSpreadPct, getUnderlyingReferencePrice } from './lib/options';
import { buildQuoteCashExpiryScenarioSeries, calculateQuoteCashBreakeven, calculateQuoteCashMaxLoss } from './lib/quote-economics';
import { calculatePremiumCash } from './lib/contract-economics-calculations';
import { formatAssetPrice, formatNumber, formatOptionPrice, formatQuantity, formatSmallNumber, getOptionPricePrecision, getQuantityPrecision, getQuoteCurrency } from './lib/format';
import type { AssetClass, OptionQuote, OptionSide, PaperTrade, Underlying } from './lib/types';
import { ASSET_CLASS_LABELS } from './lib/asset-class';
import { PAPER_CAMPAIGN_CAPITAL, PAPER_CAMPAIGN_MAX_LOSS, PAPER_CAMPAIGN_PER_TRADE_CAP, canAllocatePaperCampaignTrade, isCanonicalPaperCloseEventForTrade, summarizePaperCampaignBudget } from './lib/paper-campaign-budget';
import { clearPaperJournalRecovery, loadPaperJournal, PAPER_JOURNAL_STORAGE_KEY, readPaperJournalPrimary, readPaperJournalRecovery } from './lib/paper-journal-storage';
import type { PaperCloseEventsLoadResult } from './lib/paper-journal-events';
const MarketDepthPanel = lazy(() => import('./components/MarketDepthPanel'));
const OpportunityReview = lazy(() => import('./components/OpportunityReview'));
const GreeksPanel = lazy(() => import('./components/GreeksPanel'));
const FinancialCockpit = lazy(() => import('./components/FinancialCockpit'));
const HistoricalReplayPanel = lazy(() => import('./components/HistoricalReplayPanel'));

const UNDERLYING_NAMES: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  BNB: 'BNB',
  XRP: 'XRP',
  DOGE: 'Dogecoin',
  SOL: 'Solana',
  XAU: 'Gold',
  XAG: 'Silver',
  CL: 'WTI crude',
  BZ: 'Brent crude',
};

function getUnderlyingName(underlying: string): string {
  return UNDERLYING_NAMES[underlying] ?? 'Underlying asset';
}

function formatMoney(value: number, digits: number, currency: string | null): string {
  return formatNumber(value, digits) + (Number.isFinite(value) && currency ? ' ' + currency : '');
}

function formatCompact(value: number, currency: string | null): string {
  const formatted = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
  return formatted + (currency ? ' ' + currency : '');
}

function formatQuotePrice(value: number, quote: OptionQuote): string {
  return formatOptionPrice(value, quote, getQuoteCurrency(quote) ?? null);
}

function formatEstimatedFields(fields: string[] | undefined): string {
  if (!fields?.length) return '';
  const labels: Record<string, string> = {
    iv: 'IV', markPrice: 'السعر المرجعي', delta: 'Delta', gamma: 'Gamma', theta: 'Theta', vega: 'Vega', rho: 'Rho', unit: 'وحدة العقد', riskFreeRate: 'معدل الفائدة', daysToExpiry: 'المدة حتى الانتهاء',
  };
  return [...new Set(fields)].map((field) => labels[field] ?? field).join('، ');
}

function formatAge(ageMs: number, label: string, futureLabel = 'وقت المصدر مستقبلي؛ تحقّق'): string {
  if (!Number.isFinite(ageMs)) return 'الوقت غير صالح';
  if (ageMs < -5 * 60_000) return futureLabel;
  const minutes = Math.max(0, Math.floor(ageMs / 60_000));
  const age = minutes < 1 ? 'أقل من دقيقة' : minutes < 60 ? `${minutes} د` : minutes < 1440 ? `${Math.floor(minutes / 60)} س` : `${Math.floor(minutes / 1440)} يوم`;
  return `${label}: ${age}`;
}

function formatSourceAge(sourceTimeRange: CsvTimestampRange | null, now = Date.now()): string {
  if (!sourceTimeRange) return 'عمر المصدر غير معلوم';
  const ageMs = now - new Date(sourceTimeRange.latest).getTime();
  const age = formatAge(ageMs, 'عمر البيانات');
  if (age === 'الوقت غير صالح' || age === 'وقت المصدر مستقبلي؛ تحقّق') return age;
  const partial = sourceTimeRange.timestampedRows < sourceTimeRange.totalRows ? ' · تغطية زمنية جزئية' : '';
  return `${age}${partial}`;
}

function formatTimestampAge(timestamp: number, now = Date.now()): string {
  const ageMs = now - timestamp;
  if (!Number.isFinite(ageMs)) return 'وقت الجلب غير صالح';
  if (ageMs < -5_000) return 'وقت الاستلام مستقبلي؛ تحقّق';
  return formatAge(ageMs, 'عمر الاستلام');
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

function formatSourceTimestamp(timestamp: string | undefined): string {
  if (!timestamp) return 'غير منشور من المصدر';
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? `${formatDateTime(date)} UTC` : 'وقت المصدر غير صالح';
}

function isPaperTrade(value: unknown): value is PaperTrade {
  if (!value || typeof value !== 'object') return false;
  const trade = value as Partial<PaperTrade>;
  const isOptionalPrecision = (precision: number | undefined) => precision === undefined
    || (Number.isInteger(precision) && precision >= 0 && precision <= 8);
  return typeof trade.id === 'string'
    && typeof trade.createdAt === 'string' && Number.isFinite(Date.parse(trade.createdAt))
    && typeof trade.underlying === 'string' && /^[A-Z0-9]{2,16}$/.test(trade.underlying)
    && typeof trade.symbol === 'string'
    && (trade.type === 'CALL' || trade.type === 'PUT')
    && typeof trade.expiry === 'string' && Number.isFinite(Date.parse(trade.expiry))
    && typeof trade.strike === 'number' && Number.isFinite(trade.strike) && trade.strike > 0
    && typeof trade.quantity === 'number' && Number.isFinite(trade.quantity) && trade.quantity > 0
    && isOptionalPrecision(trade.quantityPrecision)
    && typeof trade.entryPremium === 'number' && Number.isFinite(trade.entryPremium) && trade.entryPremium > 0
    && isOptionalPrecision(trade.pricePrecision)
    && typeof trade.fees === 'number' && Number.isFinite(trade.fees) && trade.fees >= 0
    && typeof trade.spotAtEntry === 'number' && Number.isFinite(trade.spotAtEntry) && trade.spotAtEntry > 0
    && (trade.quoteAsset === undefined || (typeof trade.quoteAsset === 'string' && /^[A-Z0-9]{2,12}$/.test(trade.quoteAsset)))
    && (trade.sourceReceivedAtAtEntry === undefined || (trade.sourceReceivedAtAtEntry !== null && typeof trade.sourceReceivedAtAtEntry === 'object' && typeof trade.sourceReceivedAtAtEntry.bidAsk === 'string' && Number.isFinite(Date.parse(trade.sourceReceivedAtAtEntry.bidAsk))))
    && (trade.askQuantityAtEntry === undefined || (typeof trade.askQuantityAtEntry === 'number' && Number.isFinite(trade.askQuantityAtEntry) && trade.askQuantityAtEntry > 0))
    && (trade.askSizeUnitAtEntry === undefined || trade.askSizeUnitAtEntry === 'CONTRACTS')
    && (trade.contractEconomics === undefined || (
      trade.contractEconomics !== null && typeof trade.contractEconomics === 'object'
      && trade.contractEconomics.provenance?.status === 'PROVIDER_VERIFIED'
      && trade.contractEconomics.provenance?.provider === 'BINANCE'
      && trade.contractEconomics.provenance?.sourceRef === 'https://eapi.binance.com/eapi/v1/exchangeInfo'
      && trade.contractEconomics.premium?.priceUnit === 'PER_CONTRACT'
      && Number.isFinite(trade.contractEconomics.premium?.multiplier) && trade.contractEconomics.premium.multiplier > 0
      && trade.contractEconomics.exercise?.style === 'EUROPEAN'
      && trade.contractEconomics.exercise?.settlement === 'CASH'
      && trade.contractEconomics.exercise?.cashSettlement?.reference === 'INDEX'
      && trade.contractUnitAtEntry === trade.contractEconomics.exercise.cashSettlement.multiplier
      && trade.premiumMultiplierAtEntry === trade.contractEconomics.premium.multiplier
      && typeof trade.premiumAmountAtEntry === 'number' && Number.isFinite(trade.premiumAmountAtEntry) && trade.premiumAmountAtEntry >= 0
      && typeof trade.premiumDebitAtEntry === 'number' && Number.isFinite(trade.premiumDebitAtEntry) && trade.premiumDebitAtEntry >= trade.premiumAmountAtEntry
      && trade.premiumCurrencyAtEntry === trade.contractEconomics.premium.quoteCurrency
      && (trade.priceSourceAtEntry !== 'MID' || trade.bidAskSourceAtEntry === 'BOOK_TICKER' || trade.bidAskSourceAtEntry === 'OPTION_TICKER' || trade.bidAskSourceAtEntry === 'MARK_PRICE')))
    && trade.status === 'PAPER';
}

function loadWatchlist(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem('volterra-watchlist-v1') ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((item): item is string => typeof item === 'string' && /^[A-Z0-9._-]{1,24}$/.test(item)))].slice(0, 50);
  } catch {
    return [];
  }
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
  const [assetClassFilter, setAssetClassFilter] = useState<AssetClass | 'ALL'>('ALL');
  const [venueFilter, setVenueFilter] = useState('ALL');
  const [quotes, setQuotes] = useState<OptionQuote[]>(DEMO_QUOTES);
  const [dataMode, setDataMode] = useState<'DEMO' | 'CSV' | 'BINANCE'>('DEMO');
  const [binanceSnapshot, setBinanceSnapshot] = useState<BinanceOptionsSnapshot | null>(null);
  const [ivHistory, setIvHistory] = useState<IVHistoryObservation[]>([]);
  const [currentIVObservation, setCurrentIVObservation] = useState<IVHistoryObservation | null>(null);
  const [ivRankMetrics, setIvRankMetrics] = useState<IVRankPercentileResult | null>(null);
  const [ivHistoryNotice, setIvHistoryNotice] = useState('جارٍ تحميل سجل التقلب المحلي.');
  const [binanceLoading, setBinanceLoading] = useState(false);
  const [binanceError, setBinanceError] = useState('');
  const [binanceAccessRestricted, setBinanceAccessRestricted] = useState(false);
  const [binanceDirectMode, setBinanceDirectMode] = useState(false);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [binanceDepth, setBinanceDepth] = useState<BinanceDepthSnapshot | null>(null);
  const [binanceDepthLoading, setBinanceDepthLoading] = useState(false);
  const [binanceDepthError, setBinanceDepthError] = useState('');
  const [binanceDepthRefreshKey, setBinanceDepthRefreshKey] = useState(0);
  const [bookTickerStatus, setBookTickerStatus] = useState<'idle' | 'connecting' | 'connected' | 'reconnecting'>('idle');
  const [bookTickerUpdates, setBookTickerUpdates] = useState(0);
  const [optionMarkStatus, setOptionMarkStatus] = useState<'idle' | 'connecting' | 'connected' | 'reconnecting'>('idle');
  const [optionMarkUpdates, setOptionMarkUpdates] = useState(0);
  const [importedAt, setImportedAt] = useState<Date | null>(null);
  const [sourceTimeRange, setSourceTimeRange] = useState<CsvTimestampRange | null>(null);
  const [activeView, setActiveView] = useState('overview');
  const [selectedType, setSelectedType] = useState<OptionSide>('CALL');
  const [selectedExpiry, setSelectedExpiry] = useState(() => DEMO_QUOTES.find((quote) => quote.underlying === 'BTC' && quote.daysToExpiry === 30)?.expiry ?? DEMO_QUOTES[0].expiry);
  const [selectedId, setSelectedId] = useState(() => DEMO_QUOTES.find((quote) => quote.underlying === 'BTC' && quote.daysToExpiry === 30 && quote.type === 'CALL' && Math.abs(quote.delta - 0.5) < 0.1)?.id ?? DEMO_QUOTES[0].id);
  const [searchQuery, setSearchQuery] = useState('');
  const [instrumentSearch, setInstrumentSearch] = useState('');
  const [watchlist, setWatchlist] = useState<string[]>(loadWatchlist);
  const [quantity, setQuantity] = useState(0.01);
  const [riskBudget, setRiskBudget] = useState(PAPER_CAMPAIGN_PER_TRADE_CAP);
  const [fees, setFees] = useState(0);
  const [exitFees, setExitFees] = useState<number | null>(null);
  const [paperCloseEventsLoad, setPaperCloseEventsLoad] = useState<PaperCloseEventsLoadResult>({
    events: [], rejectedCount: 0, backupAvailable: false, persistenceBlocked: true, parseError: false,
  });
  const [paperCloseEvents, setPaperCloseEvents] = useState<PaperCloseEventsLoadResult['events']>([]);
  const [paperCloseEventsReady, setPaperCloseEventsReady] = useState(false);
  const [paperJournalLoad, setPaperJournalLoad] = useState(() => loadPaperJournal<PaperTrade>(localStorage, isPaperTrade));
  const [trades, setTrades] = useState<PaperTrade[]>(paperJournalLoad.entries);
  const closedTradeIds = useMemo(
    () => new Set(paperCloseEvents.filter((event) => trades.some((trade) => isCanonicalPaperCloseEventForTrade(event, trade))).map((event) => event.tradeId)),
    [paperCloseEvents, trades],
  );
  const getPaperCloseEventForTrade = (trade: PaperTrade) =>
    paperCloseEvents.find((event) => event.tradeId === trade.id && isCanonicalPaperCloseEventForTrade(event, trade));
  const [toast, setToast] = useState('');
  const [csvWarnings, setCsvWarnings] = useState<string[]>([]);
  const [showAllCsvWarnings, setShowAllCsvWarnings] = useState(false);

  useEffect(() => {
    let active = true;
    import('./lib/paper-journal-events').then(({ loadPaperCloseEvents }) => {
      if (!active) return;
      const loaded = loadPaperCloseEvents(localStorage);
      setPaperCloseEventsLoad(loaded);
      setPaperCloseEvents(loaded.events);
      setPaperCloseEventsReady(true);
    }).catch(() => {
      if (!active) return;
      setPaperCloseEventsLoad({
        events: [], rejectedCount: 0, backupAvailable: false, persistenceBlocked: true, parseError: false,
      });
      setPaperCloseEventsReady(true);
    });
    return () => { active = false; };
  }, []);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const binanceRequestId = useRef(0);
  const binanceDepthRequestId = useRef(0);

  useEffect(() => {
    try { localStorage.setItem('volterra-watchlist-v1', JSON.stringify(watchlist)); } catch { /* Local storage may be unavailable in private browsing. */ }
  }, [watchlist]);

  const expiryChoices = useMemo(() => getExpiryChoices(quotes, underlying), [quotes, underlying]);
  const selectedExpiryExists = expiryChoices.some((item) => item.value === selectedExpiry);
  const effectiveExpiry = selectedExpiryExists ? selectedExpiry : expiryChoices.find((item) => item.days >= 20 && item.days <= 40)?.value ?? expiryChoices[0]?.value ?? '';

  useEffect(() => {
    if (dataMode !== 'BINANCE' || !binanceSnapshot) return;
    const ageMs = Date.now() - binanceSnapshot.fetchedAt;
    const delayMs = Number.isFinite(ageMs)
      ? Math.max(0, DEFAULT_SNAPSHOT_STALE_AFTER_MS - ageMs + 1)
      : 0;
    const timer = window.setTimeout(() => setClockNow(Date.now()), delayMs);
    return () => window.clearTimeout(timer);
  }, [binanceSnapshot?.fetchedAt, dataMode]);

  useEffect(() => {
    if (effectiveExpiry && effectiveExpiry !== selectedExpiry) setSelectedExpiry(effectiveExpiry);
  }, [effectiveExpiry, selectedExpiry]);

  const availableAssetClasses = useMemo(() => [...new Set(quotes.map((quote) => quote.assetClass ?? 'UNKNOWN'))]
    .sort((a, b) => a.localeCompare(b)), [quotes]);
  const classQuotes = useMemo(() => quotes.filter((quote) => assetClassFilter === 'ALL' || quote.assetClass === assetClassFilter), [assetClassFilter, quotes]);
  const venueChoices = useMemo(() => [...new Set(classQuotes.map((quote) => quote.venue).filter((venue): venue is string => Boolean(venue)))]
    .sort((a, b) => a.localeCompare(b)), [classQuotes]);
  const scopedQuotes = useMemo(() => classQuotes.filter((quote) => venueFilter === 'ALL' || quote.venue === venueFilter), [classQuotes, venueFilter]);
  const assetQuotes = useMemo(() => scopedQuotes.filter((quote) => quote.underlying === underlying), [scopedQuotes, underlying]);
  const bookTickerCandidates = useMemo(() => dataMode === 'BINANCE' && binanceSnapshot
    ? binanceSnapshot.quotes
      .filter((quote) => quote.underlying === underlying && quote.expiry === effectiveExpiry && quote.type === selectedType
        && (quote.bid <= 0 || quote.ask <= 0 || quote.ask < quote.bid))
      .sort((a, b) => Math.abs(a.strike - getUnderlyingReferencePrice(a)) - Math.abs(b.strike - getUnderlyingReferencePrice(b)))
    : [], [binanceSnapshot, dataMode, effectiveExpiry, selectedType, underlying]);
  const bookTickerTargets = useMemo(() => bookTickerCandidates.slice(0, 180).map((quote) => quote.symbol), [bookTickerCandidates]);
  const optionMarkTarget = useMemo(() => (
    dataMode === 'BINANCE' && binanceSnapshot ? underlying.toLowerCase() : ''
  ), [binanceSnapshot, dataMode, underlying]);
  const optionTickerTargets = useMemo(() => {
    if (dataMode !== 'BINANCE' || !binanceSnapshot) return [];
    const expiries = new Set(binanceSnapshot.quotes
      .filter((quote) => quote.underlying === underlying)
      .map((quote) => quote.symbol.split('-')[1])
      .filter((expiry): expiry is string => Boolean(expiry && /^\d{6}$/.test(expiry))));
    return [...expiries].sort().map((expiry) => `${underlying.toLowerCase()}@ticker@${expiry}`);
  }, [binanceSnapshot, dataMode, underlying]);
  const assetChoices = useMemo(() => [...new Set(scopedQuotes.map((quote) => quote.underlying))]
    .sort((a, b) => a.localeCompare(b)), [scopedQuotes]);
  const market = useMemo(() => dataMode === 'DEMO' ? DEMO_MARKETS[underlying] : getMarketSnapshotFromQuotes(scopedQuotes, underlying), [dataMode, scopedQuotes, underlying]);


  useEffect(() => {
    let active = true;
    void import('./lib/iv-history-store').then(({ loadIVHistory }) => {
      if (!active) return;
      const loaded = loadIVHistory(localStorage);
      if (loaded.ok) {
        setIvHistory(loaded.observations);
        setIvHistoryNotice('السجل المحلي جاهز؛ تُحفظ عينات Binance على هذا الجهاز فقط.');
      } else {
        setIvHistoryNotice(loaded.reason);
      }
    }).catch(() => {
      if (active) setIvHistoryNotice('STORAGE_UNAVAILABLE');
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (dataMode !== 'BINANCE' || !binanceSnapshot) {
      setCurrentIVObservation(null);
      return;
    }
    let active = true;
    const asOf = new Date(binanceSnapshot.fetchedAt).toISOString();
    void import('./lib/iv-history').then(({ extractObservedAtm30DayIV }) => {
      if (!active) return;
      const result = extractObservedAtm30DayIV(
        binanceSnapshot.quotes.filter((quote) => quote.underlying === underlying),
        asOf,
      );
      if (!result.ok) {
        setCurrentIVObservation(null);
        setIvHistoryNotice(result.reason);
      } else {
        setCurrentIVObservation(result.observation);
      }
    }).catch(() => {
      if (active) {
        setCurrentIVObservation(null);
        setIvHistoryNotice('تعذر تحميل محلل التقلب.');
      }
    });
    return () => { active = false; };
  }, [binanceSnapshot, dataMode, underlying]);

  useEffect(() => {
    if (dataMode !== 'BINANCE' || !currentIVObservation) return;
    let active = true;
    void import('./lib/iv-history-store').then(({ appendIVHistoryObservation, loadIVHistory }) => {
      if (!active) return;
      const saved = appendIVHistoryObservation(localStorage, currentIVObservation, currentIVObservation.capturedAt);
      if (!saved.ok) {
        setIvHistoryNotice(saved.reason);
        return;
      }
      const loaded = loadIVHistory(localStorage);
      if (loaded.ok) setIvHistory(loaded.observations);
      setIvHistoryNotice('حُفظت عينة IV مرصودة محلياً؛ السجل لا يغادر هذا المتصفح.');
    }).catch(() => {
      if (active) setIvHistoryNotice('STORAGE_UNAVAILABLE');
    });
    return () => { active = false; };
  }, [currentIVObservation, dataMode]);

  useEffect(() => {
    if (!currentIVObservation) {
      setIvRankMetrics(null);
      return;
    }
    let active = true;
    void import('./lib/iv-history').then(({ computeIVRankPercentile }) => {
      if (active) setIvRankMetrics(computeIVRankPercentile(ivHistory, currentIVObservation, currentIVObservation.capturedAt));
    }).catch(() => {
      if (active) setIvRankMetrics(null);
    });
    return () => { active = false; };
  }, [currentIVObservation, ivHistory]);
  const filteredQuotes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return assetQuotes
      .filter((quote) => quote.expiry === effectiveExpiry && quote.type === selectedType)
      .filter((quote) => !query || quote.symbol.toLowerCase().includes(query) || String(quote.strike).includes(query))
      .sort((a, b) => a.strike - b.strike);
  }, [assetQuotes, effectiveExpiry, searchQuery, selectedType]);

  const selectedQuote = useMemo(() => {
    const chosen = scopedQuotes.find((quote) => quote.id === selectedId);
    if (chosen && chosen.underlying === underlying && chosen.expiry === effectiveExpiry && chosen.type === selectedType) return chosen;
    return filteredQuotes[0]
      ?? assetQuotes.find((quote) => quote.expiry === effectiveExpiry && quote.type === selectedType)
      ?? assetQuotes[0]
      ?? scopedQuotes[0]
      ?? quotes[0]
      ?? DEMO_QUOTES[0];
  }, [assetQuotes, effectiveExpiry, filteredQuotes, quotes, scopedQuotes, selectedId, selectedType, underlying]);

  useEffect(() => {
    if (dataMode !== 'BINANCE' || !optionMarkTarget) {
      setOptionMarkStatus('idle');
      return;
    }

    let active = true;
    let socket: WebSocket | null = null;
    let retryTimer: number | undefined;
    let attempts = 0;
    const subscriptionId = Math.floor(Date.now() % 2_147_483_647);
    let connect = () => {};
    const scheduleRetry = () => {
      if (!active) return;
      attempts += 1;
      setOptionMarkStatus('reconnecting');
      const delay = Math.min(30_000, 3_000 * (2 ** Math.min(attempts - 1, 3)));
      retryTimer = window.setTimeout(() => connect(), delay);
    };

    connect = () => {
      if (!active) return;
      setOptionMarkStatus(attempts === 0 ? 'connecting' : 'reconnecting');
      let connection: WebSocket;
      try {
        connection = new WebSocket('wss://fstream.binance.com/market/stream');
        socket = connection;
      } catch {
        scheduleRetry();
        return;
      }
      connection.onopen = () => {
        if (!active) return;
        connection.send(JSON.stringify({
          method: 'SUBSCRIBE',
          params: [`${optionMarkTarget}@markPrice`, ...optionTickerTargets],
          id: subscriptionId,
        }));
      };
      connection.onmessage = (message) => {
        if (!active) return;
        if (typeof message.data === 'string') {
          try {
            const acknowledgement = JSON.parse(message.data) as Record<string, unknown>;
            if (acknowledgement.id === subscriptionId) {
              if (acknowledgement.result === null && acknowledgement.code === undefined) {
                setOptionMarkStatus('connected');
              } else {
                setOptionMarkStatus('reconnecting');
                connection.close();
                return;
              }
            }
          } catch {
            // The market event parser below rejects malformed payloads.
          }
        }
        const markEvents = parseBinanceOptionMarkPriceMessage(message.data);
        const tickerEvents = parseBinanceOptionTickerMessage(message.data);
        if (!markEvents.length && !tickerEvents.length) return;
        setOptionMarkStatus('connected');
        setQuotes((current) => {
          const marksBySymbol = new Map(markEvents.map((event) => [event.symbol, event]));
          const tickersBySymbol = new Map(tickerEvents.map((event) => [event.symbol, event]));
          return current.map((quote) => {
            const mark = marksBySymbol.get(quote.symbol);
            const ticker = tickersBySymbol.get(quote.symbol);
            const withMark = mark ? applyBinanceOptionMarkPrice(quote, mark) : quote;
            return ticker ? applyBinanceOptionTicker(withMark, ticker) : withMark;
          });
        });
        setOptionMarkUpdates((current) => current + markEvents.length + tickerEvents.length);
      };
      connection.onerror = () => {
        if (active) connection.close();
      };
      connection.onclose = () => scheduleRetry();
    };

    connect();
    return () => {
      active = false;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      socket?.close();
    };
  }, [optionMarkTarget, optionTickerTargets, dataMode]);

  useEffect(() => {
    if (dataMode !== 'BINANCE' || !bookTickerTargets.length) {
      setBookTickerStatus('idle');
      return;
    }

    let active = true;
    let socket: WebSocket | null = null;
    let retryTimer: number | undefined;
    let attempts = 0;

    let connect = () => {};
    const scheduleRetry = () => {
      if (!active) return;
      attempts += 1;
      setBookTickerStatus('reconnecting');
      const delay = Math.min(30_000, 3_000 * (2 ** Math.min(attempts - 1, 3)));
      retryTimer = window.setTimeout(() => connect(), delay);
    };

    connect = () => {
      if (!active) return;
      setBookTickerStatus(attempts === 0 ? 'connecting' : 'reconnecting');
      let connection: WebSocket;
      try {
        connection = new WebSocket('wss://fstream.binance.com/public/stream');
        socket = connection;
      } catch {
        scheduleRetry();
        return;
      }
      connection.onopen = () => {
        if (!active) return;
        setBookTickerStatus('connected');
        connection.send(JSON.stringify({
          method: 'SUBSCRIBE',
          params: bookTickerTargets.map((symbol) => `${symbol.toLowerCase()}@bookTicker`),
          id: Math.floor(Date.now() % 2_147_483_647),
        }));
      };
      connection.onmessage = (event) => {
        if (!active) return;
        const ticker = parseBinanceBookTickerMessage(event.data);
        if (!ticker) return;
        setQuotes((current) => current.map((quote) => quote.symbol === ticker.symbol
          ? applyBinanceBookTicker(quote, ticker)
          : quote));
        setBookTickerUpdates((current) => current + 1);
      };
      connection.onerror = () => {
        if (active) connection.close();
      };
      connection.onclose = () => scheduleRetry();
    };

    connect();
    return () => {
      active = false;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      socket?.close();
    };
  }, [bookTickerTargets, dataMode]);

  useEffect(() => {
    if (dataMode !== 'BINANCE') {
      binanceDepthRequestId.current += 1;
      setBinanceDepth(null);
      setBinanceDepthError('');
      setBinanceDepthLoading(false);
      return;
    }

    if (!binanceSnapshot) {
      binanceDepthRequestId.current += 1;
      setBinanceDepth(null);
      setBinanceDepthError('');
      setBinanceDepthLoading(false);
      return;
    }
    if (!binanceSnapshot.quotes.some((quote) => quote.symbol === selectedQuote.symbol)) {
      binanceDepthRequestId.current += 1;
      setBinanceDepth(null);
      setBinanceDepthError('العقد المحدد لا ينتمي إلى لقطة Binance المحمّلة.');
      setBinanceDepthLoading(false);
      return;
    }

    const proxyUrl = binanceDirectMode ? undefined : import.meta.env.VITE_BINANCE_PROXY_URL;
    if (!proxyUrl && !binanceDirectMode) {
      setBinanceDepth(null);
      setBinanceDepthError('عنوان وسيط Binance غير مهيأ في هذا البناء.');
      setBinanceDepthLoading(false);
      return;
    }

    const requestId = ++binanceDepthRequestId.current;
    const controller = new AbortController();
    let active = true;
    setBinanceDepth(null);
    setBinanceDepthError('');
    setBinanceDepthLoading(true);
    fetchBinanceDepth(selectedQuote.symbol, proxyUrl, controller.signal)
      .then((snapshot) => {
        if (active && requestId === binanceDepthRequestId.current) setBinanceDepth(snapshot);
      })
      .catch((error: unknown) => {
        if (!active || requestId !== binanceDepthRequestId.current || controller.signal.aborted) return;
        setBinanceDepthError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active && requestId === binanceDepthRequestId.current) setBinanceDepthLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [binanceDepthRefreshKey, binanceSnapshot?.fetchedAt, binanceDirectMode, dataMode, selectedQuote.symbol]);

  useEffect(() => {
    if (filteredQuotes.length && !filteredQuotes.some((quote) => quote.id === selectedId)) setSelectedId(filteredQuotes[0].id);
  }, [filteredQuotes, selectedId]);

  useEffect(() => {
    if (paperJournalLoad.persistenceBlocked) {
      setToast('توقفت الكتابة إلى دفتر PAPER لحماية نسخة بيانات سابقة لم يمكن حفظها بأمان. صدّر نسخة الاستعادة قبل المتابعة.');
      return;
    }
    try {
      localStorage.setItem('volterra-paper-trades-v1', JSON.stringify(trades));
    } catch {
      setToast('تعذر حفظ الدفتر محلياً؛ قد يكون التخزين معطلاً أو ممتلئاً.');
    }
  }, [trades, paperJournalLoad.persistenceBlocked]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectedPremium = getMidPrice(selectedQuote);
  const canonicalEntryPremium = selectedQuote.contractEconomics ? selectedQuote.ask : selectedPremium;
  const quantityStep = getQuantityStep(selectedQuote);
  const minimumQuantity = selectedQuote.minQty ?? quantityStep;
  const safeQuantity = Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
  const safeFees = Number.isFinite(fees) ? Math.max(0, fees) : 0;
  const safeRiskBudget = Number.isFinite(riskBudget) ? Math.min(PAPER_CAMPAIGN_PER_TRADE_CAP, Math.max(0, riskBudget)) : 0;
  const contractScaleIssue = getContractScaleIssue(selectedQuote, dataMode);
  // Canonical terms must never fall back to legacy scalar calculations, even when unit=1.
  // Legacy calculations remain limited to quotes that have no canonical terms at all.
  const hasLegacyScalarCapability = hasLegacyScalarAnalyticsCapability(selectedQuote, dataMode);
  const hasExplicitConsistentContractScale = hasLegacyScalarCapability;
  const canonicalUnitPremium = selectedQuote.contractEconomics
    ? calculatePremiumCash({ economics: selectedQuote.contractEconomics, premiumPrice: canonicalEntryPremium, contracts: 1 })
    : undefined;
  const canonicalPremiumPerContract = canonicalUnitPremium?.ok ? canonicalUnitPremium.value.amount : undefined;
  const canonicalBreakEven = selectedQuote.contractEconomics
    ? calculateQuoteCashBreakeven(selectedQuote, { premiumPrice: canonicalEntryPremium, contracts: safeQuantity, fees: safeFees })
    : undefined;
  const canonicalBreakEvenPrice = canonicalBreakEven?.ok ? canonicalBreakEven.value.price : undefined;
  const canonicalMaxLossResult = selectedQuote.contractEconomics
    ? calculateQuoteCashMaxLoss(selectedQuote, { premiumPrice: canonicalEntryPremium, contracts: safeQuantity, fees: safeFees })
    : undefined;
  const canonicalMaxLossAmount = canonicalMaxLossResult?.ok ? canonicalMaxLossResult.value.amount : undefined;
  const canCalculatePremiumCost = canonicalPremiumPerContract !== undefined || hasExplicitConsistentContractScale;
  const canCalculateBreakEven = canonicalBreakEvenPrice !== undefined || hasExplicitConsistentContractScale;
  const canCalculateMaxLoss = canonicalMaxLossAmount !== undefined || hasExplicitConsistentContractScale;
  const contractScaleIssueMessage = selectedQuote.contractEconomics
    ? canonicalPremiumPerContract !== undefined
      ? 'تم احتساب تكلفة القسط وحجم المركز من مضاعف القسط الموثق، ويمكن تسجيل إدخال PAPER مع حفظ مواصفات العقد والمصدر. Greeks المركز وEV متاحان فقط عند استيفاء محوّلات Binance الموثقة ومدخلاتها؛ أما إعادة التشغيل فتبقى محجوبة حتى اكتمال مسارها.'
      : 'مواصفات العقد الاقتصادية غير كافية لحساب القسط أو المخاطر؛ لم نستخدم unit أو أي حساب قديم كبديل.'
    : contractScaleIssue ? getContractScaleIssueMessage(contractScaleIssue) : '';
  const totalCost = canonicalPremiumPerContract !== undefined
    ? canonicalPremiumPerContract * safeQuantity + safeFees
    : hasExplicitConsistentContractScale ? selectedPremium * safeQuantity * selectedQuote.unit + safeFees : Number.NaN;
  const breakEven = canonicalBreakEvenPrice !== undefined
    ? canonicalBreakEvenPrice
    : hasExplicitConsistentContractScale ? getBreakeven(selectedQuote, selectedPremium, safeFees, safeQuantity) : Number.NaN;
  const maxLoss = canonicalMaxLossAmount !== undefined
    ? canonicalMaxLossAmount
    : hasExplicitConsistentContractScale ? getMaxLoss(selectedPremium, safeQuantity, selectedQuote.unit, safeFees) : Number.NaN;
  const premiumCostPerContract = canonicalPremiumPerContract
    ?? (hasExplicitConsistentContractScale ? selectedPremium * selectedQuote.unit : undefined);
  const hasPremiumSizingCapability = premiumCostPerContract !== undefined;
  const hasModelGreeks = hasExplicitConsistentContractScale && (selectedQuote.pricingStatus ?? (dataMode === 'DEMO' ? 'ASSUMED' : 'OBSERVED_ONLY')) !== 'OBSERVED_ONLY';
  const quoteAssetLabel = getQuoteCurrency(selectedQuote);
  const campaignBudget = useMemo(
    () => summarizePaperCampaignBudget(trades, quoteAssetLabel ?? '', undefined, paperCloseEvents),
    [trades, quoteAssetLabel, paperCloseEvents],
  );
  const campaignBudgetBlockMessage = !paperCloseEventsReady
    ? 'جارٍ تحميل سجل إغلاقات PAPER والتحقق منه؛ الإدخالات والإغلاقات محجوبة مؤقتاً.'
    : paperJournalLoad.backupAvailable || paperJournalLoad.persistenceBlocked
      || paperCloseEventsLoad.backupAvailable || paperCloseEventsLoad.persistenceBlocked
      ? 'توجد نسخة استعادة محلية لم يتم تأكيد حفظها خارج المتصفح؛ نزّل النسخ الخام وأكّد الاستعادة قبل أي إدخال أو إغلاق جديد.'
    : !campaignBudget.supportedCurrency
      ? 'سقف الحملة يدعم USD أو USDT فقط حالياً؛ لا نفترض تحويل عملات.'
    : campaignBudget.unknownEntries > 0
      ? 'يوجد إدخال سابق بتكلفة غير موثقة؛ صدّر الدفتر ثم أعد ضبط حملة PAPER قبل إضافة صفقة.'
      : campaignBudget.currencyMismatchEntries > 0
        ? 'تحتوي الحملة على عملة مختلفة؛ لا نخلط USD وUSDT دون تحويل موثق.'
        : campaignBudget.remaining <= 1e-9
          ? 'تم استهلاك سقف الخسارة الإجمالي للحملة (60). أوقف الإضافات حتى تبدأ حملة جديدة.'
          : '';
  const openInterestCurrencyLabel = market?.openInterestCurrency ?? null;
  const volumeCurrencyLabel = market?.volume24hCurrency ?? null;
  const underlyingReferencePrice = getUnderlyingReferencePrice(selectedQuote);
  const expectedMove = hasModelGreeks ? getExpectedMove(underlyingReferencePrice, selectedQuote.iv, selectedQuote.daysToExpiry) : undefined;
  const scenarioSeries = useMemo(() => {
    if (selectedQuote.contractEconomics) {
      return buildQuoteCashExpiryScenarioSeries(selectedQuote, canonicalEntryPremium, safeQuantity, safeFees) ?? [];
    }
    return hasExplicitConsistentContractScale
      ? buildScenarioSeries(selectedQuote, selectedPremium, safeQuantity, safeFees)
      : [];
  }, [hasExplicitConsistentContractScale, safeFees, safeQuantity, selectedPremium, canonicalEntryPremium, selectedQuote]);
  const effectiveRiskBudget = campaignBudget.canAllocate ? Math.min(safeRiskBudget, campaignBudget.remaining) : 0;
  const rawAffordableQty = hasPremiumSizingCapability && premiumCostPerContract > 0
    ? Math.floor(Math.max(0, effectiveRiskBudget - safeFees) / premiumCostPerContract / quantityStep + 1e-9) * quantityStep
    : 0;
  const affordableQty = selectedQuote.maxQty === undefined ? rawAffordableQty : Math.min(rawAffordableQty, selectedQuote.maxQty);
  const modelPriceLabel = selectedQuote.pricingModel === 'BLACK_76' ? 'Black–76' : 'Black–Scholes مع Carry';
  const spreadPct = getSpreadPct(selectedQuote);
  const quoteQuality = !Number.isFinite(spreadPct) ? 'غير متاح' : spreadPct <= 4 ? 'ضيق نسبياً' : spreadPct <= 10 ? 'متوسط' : 'واسع';
  const hasValidTwoSidedQuote = selectedQuote.bid > 0 && selectedQuote.ask >= selectedQuote.bid;
  const binancePriceBasis = selectedQuote.priceSource === 'MARK' ? 'Mark price من Binance'
    : selectedQuote.priceSource === 'MID' ? 'منتصف Bid/Ask من Binance'
      : selectedQuote.priceSource === 'LAST' ? 'آخر تداول من Binance'
        : selectedQuote.priceSource === 'BID' ? 'Bid فقط من Binance'
          : selectedQuote.priceSource === 'ASK' ? 'Ask فقط من Binance'
            : selectedQuote.priceSource === 'MODEL' ? `تقدير ${modelPriceLabel} · ليس سعراً مرصوداً`
              : selectedQuote.estimatedFields?.includes('markPrice') ? `تقدير ${modelPriceLabel} · ليس سعراً مرصوداً`
                : 'سعر مرجعي من Binance';
  const priceBasis = dataMode === 'DEMO'
    ? 'منتصف Bid/Ask · بيانات محاكاة'
    : hasValidTwoSidedQuote
      ? `منتصف Bid/Ask من ${dataMode === 'BINANCE' ? 'Binance' : 'الملف'}`
      : dataMode === 'BINANCE'
        ? binancePriceBasis
        : selectedQuote.estimatedFields?.includes('markPrice') && selectedQuote.markPrice > 0
          ? `تقدير ${modelPriceLabel} · ليس سعراً مرصوداً`
          : selectedQuote.markPrice > 0
            ? 'Mark من الملف · طرف سوق ناقص'
            : selectedQuote.bid > 0
              ? 'Bid فقط · لا يتوفر Ask أو Mark'
              : selectedQuote.ask > 0
                ? 'Ask فقط · لا يتوفر Bid أو Mark'
                : 'لا يوجد سعر موثوق';

  const latestAssetQuotes = useMemo(() => getLatestQuotePerContract(assetQuotes), [assetQuotes]);
  const quoteDataCoverage = useMemo(() => getQuoteDataCoverage(latestAssetQuotes), [latestAssetQuotes]);
  const smileData = useMemo(() => latestAssetQuotes
    .filter((quote) => quote.daysToExpiry >= 20 && quote.daysToExpiry <= 40
      && !isQuoteFieldEstimated(quote, 'daysToExpiry')
      && quote.type === selectedType && !isQuoteFieldEstimated(quote, 'iv')
      && quote.iv > 0 && Number.isFinite(quote.iv))
    .sort((a, b) => a.strike - b.strike)
    .map((quote) => ({ strike: quote.strike, iv: quote.iv })), [latestAssetQuotes, selectedType]);

  const termData = useMemo(() => getAtmTermStructure(assetQuotes)
    .map((point) => ({
      expiry: `${Math.round(point.daysToExpiry)} يوم`,
      days: point.daysToExpiry,
      iv: point.iv,
    })), [assetQuotes]);

  const ivRvSpread = !market || market.rv30 === null || market.iv30 === null ? null : market.iv30 - market.rv30;
  const ivTone = ivRvSpread === null ? 'neutral' : ivRvSpread >= 0 ? 'yellow' : 'green';
  const binanceFreshness = binanceSnapshot
    ? assessSnapshotFreshness(binanceSnapshot.fetchedAt, clockNow)
    : 'unknown';
  const staleThresholdSeconds = DEFAULT_SNAPSHOT_STALE_AFTER_MS / 1000;
  const binanceAgeDetail = binanceSnapshot
    ? formatTimestampAge(binanceSnapshot.fetchedAt, clockNow)
    : '';
  const binanceStatusClass = dataMode === 'BINANCE' && binanceFreshness === 'stale'
    ? 'stale'
    : dataMode === 'BINANCE' && binanceFreshness === 'future' ? 'invalid-time' : '';
  const dataStatusDetail = dataMode === 'DEMO'
    ? `${formatDateTime(new Date())} UTC · محاكاة`
    : dataMode === 'CSV'
      ? formatSourceAge(sourceTimeRange, clockNow)
      : binanceSnapshot
        ? binanceFreshness === 'stale' ? `لقطة قديمة · تجاوزت ${staleThresholdSeconds} ث` : binanceAgeDetail
        : binanceLoading ? 'جارٍ تحميل لقطة السوق' : 'لم تُحمّل بعد';
  const binanceFetchedAtLabel = binanceSnapshot && Number.isFinite(binanceSnapshot.fetchedAt)
    ? new Date(binanceSnapshot.fetchedAt).toISOString()
    : 'وقت جلب غير صالح';
  const dataStatusTitle = dataMode === 'BINANCE' && binanceSnapshot
    ? `آخر جلب REST عام من Binance: ${binanceFetchedAtLabel}. عمر الاستلام محلي، ويصنّف التطبيق اللقطة قديمة بعد ${staleThresholdSeconds} ثانية؛ لا يثبت عمر حقول المصدر. لقطة وليست بثاً لحظياً.`
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
    setBinanceAccessRestricted(false);
    try {
      const proxyUrl = import.meta.env.VITE_BINANCE_PROXY_URL;
      let snapshot: BinanceOptionsSnapshot;
      let usedDirectConnection = false;
      try {
        snapshot = await fetchBinanceOptions(proxyUrl);
      } catch (proxyError) {
        if (!(proxyError instanceof BinanceMarketDataError && proxyError.status === 451)) throw proxyError;
        try {
          // This is a plain public-data request from the user's current browser
          // network. It does not alter IP, region, residence, or account identity.
          snapshot = await fetchBinanceOptions();
          usedDirectConnection = true;
        } catch (directError) {
          if (requestId !== binanceRequestId.current) return;
          setBinanceAccessRestricted(true);
          const detail = directError instanceof Error ? directError.message : String(directError);
          setBinanceError(`أعاد وسيط الخادم HTTP 451، ثم لم تنجح محاولة الاتصال المباشر من متصفحك إلى Binance. قد تمنع الشبكة الطلب أو تمنع CORS قراءة الاستجابة. هذا لا يثبت منع حسابك أو المقيمين في سوريا، ولا يغيّر عنوان IP أو منطقة التنفيذ. صفحة Binance تذكر إتاحة الخيارات عموماً وفق KYC والامتثال، دون ضمان كل منتج فرعي أو صلاحيات الحساب. التفاصيل: ${detail}`);
          return;
        }
      }
      if (requestId !== binanceRequestId.current) return;
      const nextUnderlying = snapshot.availableAssets.includes(underlying)
        ? underlying
        : snapshot.availableAssets.includes('BTC') ? 'BTC' : snapshot.availableAssets[0] ?? snapshot.quotes[0]?.underlying ?? 'BTC';
      const assetQuotes = snapshot.quotes.filter((quote) => quote.underlying === nextUnderlying);
      const calls = assetQuotes.filter((quote) => quote.type === 'CALL');
      const preferredCalls = calls.filter((quote) => quote.daysToExpiry >= 20 && quote.daysToExpiry <= 40);
      const defaultQuote = [...(preferredCalls.length ? preferredCalls : calls)].sort((a, b) =>
        Math.abs(a.daysToExpiry - 30) - Math.abs(b.daysToExpiry - 30)
        || Math.abs(a.strike - getUnderlyingReferencePrice(a)) - Math.abs(b.strike - getUnderlyingReferencePrice(b)),
      )[0] ?? assetQuotes[0];

      setClockNow(snapshot.fetchedAt);
      setBinanceSnapshot(snapshot);
      setBinanceDirectMode(usedDirectConnection);
      setQuotes(snapshot.quotes);
      setDataMode('BINANCE');
      setAssetClassFilter('ALL');
      setVenueFilter('ALL');
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
      notify(usedDirectConnection ? `تم تحميل ${formatNumber(snapshot.quotes.length, 0)} عقد من Binance مباشرة عبر شبكة جهازك.` : `تم تحميل بيانات ${formatNumber(snapshot.quotes.length, 0)} من أصل ${formatNumber(snapshot.activeSymbols, 0)} عقد نشط من Binance.`);
    } catch (error) {
      if (requestId !== binanceRequestId.current) return;
      if (error instanceof BinanceMarketDataError && error.status === 451) {
        setBinanceAccessRestricted(true);
        setBinanceError('أعاد طلب Binance المباشر HTTP 451 من شبكة متصفحك. هذا يصف الطلب العام الحالي فقط؛ لا يثبت منع حسابك أو المقيمين في سوريا. تذكر صفحة Binance إتاحة الخيارات عموماً وفق KYC والامتثال، لكنها لا تضمن كل منتج فرعي أو صلاحيات الحساب. لم نغيّر IP أو منطقة التنفيذ.');
        return;
      }
      setBinanceAccessRestricted(false);
      const message = error instanceof Error ? error.message : String(error);
      const networkHint = /fetch|network|abort|timeout|load failed/i.test(message)
        ? ' تحقّق من الاتصال؛ قد تكون الشبكة أو CORS أو مهلة الخدمة سبباً.'
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

  const selectUnderlyingFromQuotes = (next: Underlying, sourceQuotes: OptionQuote[]) => {
    const nextQuotes = sourceQuotes.filter((quote) => quote.underlying === next);
    if (!nextQuotes.length) return;
    setUnderlying(next);
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

  const changeUnderlying = (next: Underlying) => selectUnderlyingFromQuotes(next, scopedQuotes);

  const handleInstrumentSearch = (value: string) => {
    setInstrumentSearch(value);
    const normalized = value.trim().toLowerCase();
    if (!normalized) return;
    const match = assetChoices.find((item) => item.toLowerCase() === normalized
      || getUnderlyingName(item).toLowerCase() === normalized
      || `${item} · ${getUnderlyingName(item)}`.toLowerCase() === normalized);
    if (match) changeUnderlying(match);
  };

  const toggleWatchlist = (symbol: string) => setWatchlist((current) => current.includes(symbol)
    ? current.filter((item) => item !== symbol)
    : current.length < 50 ? [...current, symbol] : current);
  const visibleWatchlist = watchlist.filter((symbol) => assetChoices.includes(symbol));

  const changeAssetClass = (next: AssetClass | 'ALL') => {
    const nextQuotes = quotes.filter((quote) => next === 'ALL' || quote.assetClass === next);
    const nextUnderlying = nextQuotes.some((quote) => quote.underlying === underlying) ? underlying : nextQuotes[0]?.underlying;
    setAssetClassFilter(next);
    setVenueFilter('ALL');
    if (nextUnderlying) selectUnderlyingFromQuotes(nextUnderlying, nextQuotes);
  };

  const changeVenue = (next: string) => {
    const nextQuotes = classQuotes.filter((quote) => next === 'ALL' || quote.venue === next);
    const nextUnderlying = nextQuotes.some((quote) => quote.underlying === underlying) ? underlying : nextQuotes[0]?.underlying;
    setVenueFilter(next);
    if (nextUnderlying) selectUnderlyingFromQuotes(nextUnderlying, nextQuotes);
  };

  const handleCsvUpload = (file?: File) => {
    if (!file) return;
    if (file.size > MAX_CSV_FILE_BYTES) {
      notify('حجم ملف CSV يتجاوز 5 MiB؛ اختصر الملف قبل استيراده.');
      if (uploadRef.current) uploadRef.current.value = '';
      return;
    }
    invalidateBinanceRequest();
    setBinanceError('');
    setBinanceAccessRestricted(false);
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
      setAssetClassFilter('ALL');
      setVenueFilter('ALL');
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
      notify(`تم استيراد ${formatNumber(result.quotes.length, 0)} عقد محلياً.`);
    };
    reader.onerror = () => notify('تعذر قراءة الملف. جرّب ملف CSV آخر.');
    reader.readAsText(file);
    if (uploadRef.current) uploadRef.current.value = '';
  };

  const resetDemo = () => {
    invalidateBinanceRequest();
    setBinanceError('');
    setBinanceAccessRestricted(false);
    setBinanceDirectMode(false);
    setQuotes(DEMO_QUOTES);
    setDataMode('DEMO');
    setAssetClassFilter('ALL');
    setVenueFilter('ALL');
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

  const savePaperTrade = async () => {
    if (paperJournalLoad.persistenceBlocked || paperJournalLoad.backupAvailable) {
      notify('تم إيقاف تسجيل صفقات PAPER حتى تنزيل نسخة الاستعادة خارج المتصفح وتأكيدها.');
      return;
    }
    if (campaignBudgetBlockMessage) {
      notify(campaignBudgetBlockMessage);
      return;
    }
    if (safeQuantity <= 0) {
      notify('أدخل كمية أكبر من صفر للمحاكاة.');
      return;
    }
    if ((selectedQuote.contractEconomics ? canonicalEntryPremium : selectedPremium) <= 0) {
      notify('لا يوجد سعر Ask موجب وموثوق لتسجيل القسط. حدّث دفتر السوق أو اختر عقداً آخر.');
      return;
    }
    if (dataMode === 'BINANCE') {
      const stepCount = safeQuantity / quantityStep;
      if (safeQuantity + 1e-9 < minimumQuantity) {
        notify(`الكمية أقل من الحد الأدنى لعقد Binance (${formatQuantity(minimumQuantity, selectedQuote)}).`);
        return;
      }
      if (selectedQuote.maxQty !== undefined && safeQuantity - 1e-9 > selectedQuote.maxQty) {
        notify(`الكمية تتجاوز الحد الأقصى للعقد (${formatQuantity(selectedQuote.maxQty, selectedQuote)}).`);
        return;
      }
      if (Math.abs(stepCount - Math.round(stepCount)) > 1e-7) {
        notify(`الكمية يجب أن تتوافق مع خطوة العقد ${formatQuantity(quantityStep, selectedQuote)}.`);
        return;
      }
    }
    if (selectedQuote.contractEconomics) {
      const { createCanonicalPaperTrade } = await import('./lib/paper-journal');
      const result = createCanonicalPaperTrade({
        quote: selectedQuote,
        sourceMode: dataMode,
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`,
        createdAt: new Date().toISOString(),
        quantity: safeQuantity,
        premiumPrice: canonicalEntryPremium,
        fees: safeFees,
        spotAtEntry: underlyingReferencePrice,
      });
      if (!result.ok) {
        notify('لم يُسجّل الإدخال: يلزم عقد Binance موثّق وسعر سوق مرصود مع توقيت مصدر، ومقياس قسط صالح.');
        return;
      }
      const allocation = canAllocatePaperCampaignTrade(campaignBudget, result.premiumDebit, result.premiumCurrency, safeRiskBudget);
      if (!allocation.ok) {
        notify(allocation.reason === 'PER_TRADE_RISK_CAP_EXCEEDED'
          ? 'تجاوزت الصفقة سقف 20 دولاراً للمحاولة الواحدة.'
          : allocation.reason === 'CAMPAIGN_RISK_CAP_EXCEEDED'
            ? 'تتجاوز الصفقة المتبقي من سقف الحملة البالغ 60 دولاراً.'
            : 'تعذر اعتماد الصفقة ضمن ميزانية الحملة؛ تحقق من العملة وتكلفة الإدخالات السابقة.');
        return;
      }
      setTrades((current) => [result.trade, ...current]);
      notify(`سُجّل إدخال PAPER بتكلفة قسط ${formatMoney(result.premiumDebit, 2, result.premiumCurrency)}. لم يُرسل أي أمر ولم تُحسب نتيجة أو ربح وخسارة.`);
      return;
    }
    if (!hasExplicitConsistentContractScale) {
      notify(contractScaleIssueMessage);
      return;
    }
    const legacyAllocation = canAllocatePaperCampaignTrade(campaignBudget, totalCost, quoteAssetLabel ?? '', safeRiskBudget);
    if (!legacyAllocation.ok) {
      notify(legacyAllocation.reason === 'PER_TRADE_RISK_CAP_EXCEEDED'
        ? 'تجاوزت الصفقة سقف 20 دولاراً للمحاولة الواحدة.'
        : legacyAllocation.reason === 'CAMPAIGN_RISK_CAP_EXCEEDED'
          ? 'تتجاوز الصفقة المتبقي من سقف الحملة البالغ 60 دولاراً.'
          : 'تعذر اعتماد الصفقة ضمن ميزانية الحملة؛ تحقق من العملة وتكلفة الإدخالات السابقة.');
      return;
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
      quantityPrecision: getQuantityPrecision(selectedQuote),
      entryPremium: selectedPremium,
      pricePrecision: getOptionPricePrecision(selectedPremium, selectedQuote),
      fees: safeFees,
      spotAtEntry: underlyingReferencePrice,
      quoteAsset: quoteAssetLabel,
      contractVenueAtEntry: selectedQuote.venue,
      contractAssetClassAtEntry: selectedQuote.assetClass,
      contractUnderlyingKindAtEntry: selectedQuote.underlyingKind,
      contractUnitAtEntry: selectedQuote.unit,
      premiumMultiplierAtEntry: 1,
      premiumAmountAtEntry: selectedPremium * safeQuantity * selectedQuote.unit,
      premiumDebitAtEntry: totalCost,
      premiumCurrencyAtEntry: quoteAssetLabel ?? undefined,
      status: 'PAPER',
    };
    setTrades((current) => [newTrade, ...current]);
    notify('أضيفت الصفقة إلى الدفتر التجريبي فقط.');
  };

  const closePaperTrade = async (trade: PaperTrade) => {
    if (!paperCloseEventsReady || paperJournalLoad.persistenceBlocked || paperJournalLoad.backupAvailable || paperCloseEventsLoad.persistenceBlocked || paperCloseEventsLoad.backupAvailable) {
      notify('إغلاق PAPER متوقف حتى تنزيل نسخ الاستعادة خارج المتصفح وتأكيدها.');
      return;
    }
    if (closedTradeIds.has(trade.id)) {
      notify('هذه الصفقة مغلقة بالفعل في دفتر PAPER.');
      return;
    }
    if (paperCloseEvents.some((event) => event.tradeId === trade.id)) {
      notify('يوجد حدث إغلاق غير متطابق لهذه الصفقة؛ لا نعيد الإغلاق قبل مراجعة سجل JSON.');
      return;
    }
    if (dataMode !== 'BINANCE') {
      notify('إغلاق الصفقة يتطلب لقطة Binance موثقة للعقد نفسه.');
      return;
    }
    if (exitFees === null || !Number.isFinite(exitFees) || exitFees < 0) {
      notify('أدخل رسوم الخروج يدوياً وفق جدول الرسوم المطبق على حسابك؛ لا نفترض أنها صفر.');
      return;
    }
    let result: ReturnType<typeof import('./lib/paper-journal').createCanonicalPaperCloseEvent>;
    let appendPaperCloseEvent: typeof import('./lib/paper-journal-events').appendPaperCloseEvent;
    let loadPaperCloseEvents: typeof import('./lib/paper-journal-events').loadPaperCloseEvents;
    try {
      const [journalModule, eventModule] = await Promise.all([
        import('./lib/paper-journal'),
        import('./lib/paper-journal-events'),
      ]);
      result = journalModule.createCanonicalPaperCloseEvent({
        trade,
        quote: selectedQuote,
        sourceMode: dataMode,
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `close-${Date.now()}`,
        closedAt: new Date().toISOString(),
        exitFees,
        spotAtExit: underlyingReferencePrice,
      });
      appendPaperCloseEvent = eventModule.appendPaperCloseEvent;
      loadPaperCloseEvents = eventModule.loadPaperCloseEvents;
    } catch {
      notify('تعذر تحميل وحدة إغلاق PAPER؛ لم نسجل أي حدث.');
      return;
    }
    if (!result.ok) {
      const messages: Record<string, string> = {
        CANONICAL_EXECUTABLE_BID_REQUIRED: 'يلزم Bid مرصود من BookTicker مع حجم معروض بوحدة العقود.',
        PAPER_CLOSE_CONTRACT_IDENTITY_MISMATCH: 'العقد المحدد لا يطابق عقد الدخول تماماً؛ اختر العقد نفسه قبل الإغلاق.',
        INVALID_PAPER_CLOSE_INPUT: 'مدخلات الإغلاق غير صالحة.',
        OPTION_EXPIRED_AT_PAPER_CLOSE: 'انتهى العقد؛ لا نسجل إغلاقاً سوقياً بعد الانتهاء. يلزم مسار تسوية مستقل.',
        PAPER_CLOSE_MARKET_SNAPSHOT_STALE_OR_FUTURE: 'توقيت Bid أو المؤشر قديم أو مستقبلي؛ حدّث بيانات السوق.',
        INSUFFICIENT_OBSERVED_BID_SIZE: 'حجم Bid المعروض أقل من كمية الصفقة؛ لا نفترض تعبئة الكمية كاملة.',
        PAPER_CLOSE_SPOT_DOES_NOT_MATCH_INDEX: 'السعر المرجعي لا يطابق لقطة المؤشر الموقّتة.',
        PAPER_ENTRY_DEBIT_SNAPSHOT_INVALID: 'تكلفة الدخول المحفوظة غير متطابقة؛ أوقفنا حساب الربح والخسارة.',
        PAPER_CLOSE_CONTRACT_ECONOMICS_NOT_VERIFIED: 'مواصفات العقد المحفوظة لم تعد موثقة.',
      };
      notify(messages[result.reason] ?? `تعذر إغلاق الصفقة: ${result.reason}`);
      return;
    }
    const appended = appendPaperCloseEvent(localStorage, result.event);
    if (!appended.ok) {
      setPaperCloseEventsLoad(loadPaperCloseEvents(localStorage));
      notify(appended.reason === 'PAPER_TRADE_ALREADY_CLOSED'
        ? 'هذه الصفقة مغلقة بالفعل.'
        : 'تعذر حفظ حدث الإغلاق بأمان؛ لم نعرض الصفقة كمغلقة. صدّر نسخة الدفتر إذا ظهر تنبيه الاستعادة.');
      return;
    }
    setPaperCloseEvents(appended.events);
    notify(`سُجّل إغلاق PAPER بسعر Bid. النتيجة المحاكاة: ${formatMoney(result.event.netPnl, 2, result.event.currency)}. رسوم الخروج مدخلة يدوياً؛ لا يوجد أمر حقيقي.`);
  };

  const exportPaperCloseEvents = (raw: string | null, filename: string) => {
    if (raw === null) {
      notify('لا توجد نسخة أحداث قابلة للتصدير في التخزين المحلي.');
      return;
    }
    const blob = new Blob([raw], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    notify('تم تنزيل نسخة أحداث PAPER؛ احتفظ بها خارج المتصفح.');
  };

  const retryPaperCloseEventsPersistence = async () => {
    if (!paperCloseEventsReady || (!paperCloseEventsLoad.backupAvailable && !paperCloseEventsLoad.persistenceBlocked)) return;
    if (!window.confirm('بعد تنزيل نسخ أحداث الإغلاق الخام وحفظها خارج المتصفح، هل تريد اعتماد الأحداث الصالحة فقط وإزالة قفل الاستعادة؟')) return;
    try {
      const eventModule = await import('./lib/paper-journal-events');
      if (paperCloseEventsLoad.rejectedCount > 0 || paperCloseEventsLoad.parseError) {
        const original = eventModule.readPaperCloseEventsPrimary(localStorage);
        if (original === null) {
          notify('تعذر قراءة سجل الإغلاق الأصلي؛ لم نكتب فوقه ولم نزل قفل الاستعادة.');
          return;
        }
        const sanitized = JSON.stringify(paperCloseEvents);
        localStorage.setItem(eventModule.PAPER_CLOSE_EVENTS_KEY, sanitized);
        if (localStorage.getItem(eventModule.PAPER_CLOSE_EVENTS_KEY) !== sanitized) throw new Error('write verification failed');
      }
      if (!eventModule.clearPaperCloseEventsRecovery(localStorage)) {
        notify('تعذر إزالة قفل استعادة أحداث الإغلاق؛ لم نكمل إعادة التهيئة.');
        return;
      }
      const next = eventModule.loadPaperCloseEvents(localStorage);
      setPaperCloseEventsLoad(next);
      setPaperCloseEvents(next.events);
      notify(next.persistenceBlocked || next.backupAvailable
        ? 'ما زالت استعادة أحداث الإغلاق غير مكتملة؛ بقيت الإغلاقات محجوبة.'
        : 'اكتملت استعادة سجل الإغلاق؛ يمكن استئناف الإغلاق إذا كانت البيانات سليمة.');
    } catch {
      notify('تعذر تحميل وحدة استعادة أحداث PAPER؛ لم نغيّر السجل عمداً.');
    }
  };

  const exportIVHistoryBackup = async () => {
    const { exportIVHistory } = await import('./lib/iv-history-store');
    const result = exportIVHistory(localStorage);
    if (!result.ok) {
      notify('تعذر تصدير سجل IV: ' + result.reason);
      return;
    }
    const blob = new Blob([result.json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'sol-iv-history-backup.json';
    anchor.click();
    URL.revokeObjectURL(url);
    notify('تم تصدير ' + result.count + ' عينة IV محلية.');
  };

  const clearPaperJournal = async () => {
    if (!paperCloseEventsReady || paperJournalLoad.persistenceBlocked || paperJournalLoad.backupAvailable || paperCloseEventsLoad.persistenceBlocked || paperCloseEventsLoad.backupAvailable) {
      notify('لا يمكن مسح دفتر PAPER قبل تنزيل نسخ الاستعادة وتأكيدها.');
      return;
    }
    if (!trades.length && !paperCloseEvents.length) return;
    if (!window.confirm('سيتم حذف إدخالات PAPER وأحداث الإغلاق المحلية وتحرير ميزانية الحملة. صدّر CSV وأحداث الإغلاق JSON أولاً إذا أردت الاحتفاظ بالسجل. ستبقى نسخ الاستعادة السابقة محفوظة. لا يؤثر هذا على أي أموال أو أوامر حقيقية. هل تريد المتابعة؟')) return;
    try {
      const { clearPaperCloseEvents } = await import('./lib/paper-journal-events');
      if (!clearPaperCloseEvents(localStorage)) {
        notify('تعذر تصفير أحداث الإغلاق؛ لم نمسح إدخالات PAPER.');
        return;
      }
      setTrades([]);
      setPaperCloseEvents([]);
      notify('تم تصفير حملة PAPER المحلية فقط؛ بقيت نسخ الاستعادة السابقة محفوظة.');
    } catch {
      notify('تعذر تحميل وحدة دفتر الإغلاق؛ لم نمسح إدخالات PAPER.');
    }
  };

  const downloadPaperJournalRaw = (raw: string | null, filename: string, label: string) => {
    if (raw === null) {
      notify('تعذر قراءة النسخة الخام من التخزين المحلي؛ لا تمسح بيانات المتصفح.');
      return;
    }
    const blob = new Blob([raw], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    notify(label + '؛ احتفظ بها خارج المتصفح.');
  };

  const exportPaperJournalRecovery = () => {
    downloadPaperJournalRaw(
      readPaperJournalRecovery(localStorage),
      'sol-paper-journal-recovery.json',
      'تم تنزيل نسخة الاستعادة السابقة من دفتر PAPER',
    );
  };

  const exportPaperJournalOriginal = () => {
    downloadPaperJournalRaw(
      readPaperJournalPrimary(localStorage),
      'sol-paper-journal-original.json',
      'تم تنزيل الملف الأصلي الحالي من دفتر PAPER',
    );
  };

  const retryPaperJournalPersistence = () => {
    if (!paperJournalLoad.backupAvailable && !paperJournalLoad.persistenceBlocked) return;
    if (!window.confirm('بعد تنزيل كل النسخ الخام وحفظها خارج المتصفح، هل تريد اعتماد السجلات الصالحة فقط وإزالة قفل الاستعادة؟')) return;
    if (paperJournalLoad.rejectedCount > 0 || paperJournalLoad.parseError) {
      const original = readPaperJournalPrimary(localStorage);
      if (original === null) {
        notify('تعذر قراءة الملف الأصلي؛ لم نكتب فوقه ولم نزل قفل الاستعادة.');
        return;
      }
      const sanitized = JSON.stringify(paperJournalLoad.entries);
      try {
        localStorage.setItem(PAPER_JOURNAL_STORAGE_KEY, sanitized);
        if (localStorage.getItem(PAPER_JOURNAL_STORAGE_KEY) !== sanitized) throw new Error('write verification failed');
      } catch {
        notify('تعذر اعتماد السجلات الصالحة؛ بقي الملف الأصلي دون تغيير قدر الإمكان.');
        return;
      }
    }
    if (!clearPaperJournalRecovery(localStorage)) {
      notify('تعذر إزالة قفل الاستعادة؛ لم نكمل إعادة التهيئة.');
      return;
    }
    const next = loadPaperJournal<PaperTrade>(localStorage, isPaperTrade);
    setPaperJournalLoad(next);
    setTrades(next.entries);
    notify(next.persistenceBlocked || next.backupAvailable
      ? 'ما زالت الاستعادة غير مكتملة؛ بقيت الكتابة محجوبة لحماية النسخة الخام.'
      : 'اكتملت الاستعادة بعد تأكيد حفظ النسخة خارج المتصفح؛ استؤنف دفتر PAPER.');
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
      entryPremium: trade.entryPremium,
      fees: trade.fees,
      spotAtEntry: trade.spotAtEntry,
      quoteAsset: trade.quoteAsset ?? '',
      contractVenueAtEntry: trade.contractVenueAtEntry ?? '',
      contractUnitAtEntry: trade.contractUnitAtEntry ?? '',
      premiumMultiplierAtEntry: trade.premiumMultiplierAtEntry ?? '',
      premiumAmountAtEntry: trade.premiumAmountAtEntry ?? '',
      premiumDebitAtEntry: trade.premiumDebitAtEntry ?? '',
      premiumCurrencyAtEntry: trade.premiumCurrencyAtEntry ?? '',
      priceSourceAtEntry: trade.priceSourceAtEntry ?? '',
      bidAskSourceAtEntry: trade.bidAskSourceAtEntry ?? '',
      contractEconomicsJSON: trade.contractEconomics ? JSON.stringify(trade.contractEconomics) : '',
      sourceTimestampsAtEntryJSON: trade.sourceTimestampsAtEntry ? JSON.stringify(trade.sourceTimestampsAtEntry) : '',
      sourceReceivedAtAtEntryJSON: trade.sourceReceivedAtAtEntry ? JSON.stringify(trade.sourceReceivedAtAtEntry) : '',
      mode: 'PAPER',
    })));
  };

  const handleBudgetClick = () => {
    if (campaignBudgetBlockMessage) {
      notify(campaignBudgetBlockMessage);
      return;
    }
    if (!hasPremiumSizingCapability) {
      notify(contractScaleIssueMessage);
      return;
    }
    if (affordableQty + 1e-9 < minimumQuantity) {
      notify(`الميزانية لا تكفي للحد الأدنى لهذه السلسلة (${formatQuantity(minimumQuantity, selectedQuote)}).`);
      return;
    }
    setQuantity(affordableQty);
    notify(`حُسبت كمية تجريبية قدرها ${formatQuantity(affordableQty, selectedQuote)} وفق الميزانية المدخلة.`);
  };

  const navItems = [
    { id: 'overview', label: 'نظرة عامة', mobileLabel: 'السوق', icon: <BarChart3 size={17} /> },
    { id: 'opportunities', label: 'تحليل السوق', mobileLabel: 'الفرص', icon: <Activity size={17} /> },
    { id: 'scanner', label: 'ماسح العقود', mobileLabel: 'السلسلة', icon: <ListFilter size={17} /> },
    { id: 'trade-lab', label: 'مختبر الصفقة', mobileLabel: 'الحساب', icon: <Target size={17} /> },
    { id: 'greeks', label: 'Greeks', mobileLabel: 'Greeks', icon: <Gauge size={17} /> },
    { id: 'journal', label: 'الدفتر التجريبي', mobileLabel: 'الدفتر', icon: <BookOpen size={17} /> },
    { id: 'finance', label: 'المركز المالي', mobileLabel: 'مالي', icon: <WalletCards size={17} /> },
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
            <div className={`data-status ${binanceStatusClass}`} title={dataStatusTitle}><span className={`pulse-dot ${dataMode !== 'DEMO' ? 'imported' : ''} ${binanceStatusClass}`} /><span>{dataMode === 'DEMO' ? 'محاكاة' : dataMode === 'CSV' ? 'CSV محلي' : 'Binance'}</span><small>{dataStatusDetail}</small></div>
            <button className="icon-button help-button" title="حول هذا المختبر" onClick={() => setShowAssumptions((value) => !value)}><CircleHelp size={17} /></button>
            <button className="avatar-button" title="ملف شخصي محلي">م</button>
          </div>
        </header>

        <div className="page-container">
          <section className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> MULTI-ASSET OPTIONS <span className="eyebrow-dot">·</span> WORKSPACE</div>
              <h1>مختبر <span>الخيارات</span></h1>
              <p>حلّل العقد، اختبر السيناريو، وسجّل قرارك — من دون تنفيذ أوامر.</p>
            </div>
            <div className="heading-actions">
              <label className="instrument-search">
                <Search size={14} aria-hidden="true" />
                <input type="search" role="searchbox" aria-label="ابحث عن رمز أو أصل" placeholder="ابحث عن أصل…" list="volterra-underlying-options" value={instrumentSearch} onChange={(event) => handleInstrumentSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { const value = instrumentSearch.trim().toLowerCase(); const match = assetChoices.find((item) => item.toLowerCase() === value || getUnderlyingName(item).toLowerCase() === value); if (match) changeUnderlying(match); } }} />
                <datalist id="volterra-underlying-options">{assetChoices.map((item) => <option key={item} value={item} label={getUnderlyingName(item)} />)}</datalist>
              </label>
              <label className="select-control asset-class-select"><span>فئة الأصل</span><select value={assetClassFilter} onChange={(event) => changeAssetClass(event.target.value as AssetClass | 'ALL')} aria-label="اختر فئة الأصل">
                <option value="ALL">كل الفئات</option>
                {availableAssetClasses.map((item) => <option key={item} value={item}>{ASSET_CLASS_LABELS[item]}</option>)}
              </select><ChevronDown size={13} /></label>
              {venueChoices.length > 1 && <label className="select-control venue-select"><span>المنصة</span><select value={venueFilter} onChange={(event) => changeVenue(event.target.value)} aria-label="اختر المنصة">
                <option value="ALL">كل المنصات</option>
                {venueChoices.map((item) => <option key={item} value={item}>{item}</option>)}
              </select><ChevronDown size={13} /></label>}
              {dataMode === 'BINANCE' ? (
                <label className="select-control asset-select"><span>الأصل</span><select value={underlying} onChange={(event) => changeUnderlying(event.target.value)} aria-label="اختر أصل Binance">
                  {assetChoices.map((item) => <option key={item} value={item}>{item} · {getUnderlyingName(item)}</option>)}
                </select><ChevronDown size={13} /></label>
              ) : (
                <div className="asset-switch" role="group" aria-label="الأصل الأساسي">
                  {assetChoices.map((item) => <button key={item} className={underlying === item ? 'selected' : ''} onClick={() => changeUnderlying(item)}>{item}<span>{getUnderlyingName(item)}</span></button>)}
                </div>
              )}
              <button type="button" className={`watchlist-toggle ${watchlist.includes(underlying) ? 'active' : ''}`} aria-label={watchlist.includes(underlying) ? `إزالة ${underlying} من المفضلة` : `إضافة ${underlying} إلى المفضلة`} aria-pressed={watchlist.includes(underlying)} onClick={() => toggleWatchlist(underlying)} title={watchlist.includes(underlying) ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}><Star size={14} fill={watchlist.includes(underlying) ? 'currentColor' : 'none'} /></button>
              <div className="upload-actions">
                <button className={`button button-binance ${dataMode === 'BINANCE' ? 'active' : ''}`} onClick={loadBinanceOptions} disabled={binanceLoading} title="تحميل سلسلة الخيارات والبيانات العامة من Binance">
                  <RefreshCw className={binanceLoading ? 'spin' : ''} size={14} /> {binanceLoading ? 'جارٍ جلب Binance…' : dataMode === 'BINANCE' ? 'تحديث Binance' : 'تحميل Binance'}
                </button>
                <button className="button button-ghost" onClick={downloadCsvTemplate}><Download size={15} /> قالب CSV</button>
                <button className="button button-primary" onClick={() => uploadRef.current?.click()}><FileUp size={16} /> استيراد CSV</button>
                <input ref={uploadRef} type="file" accept=".csv,text/csv" hidden onChange={(event) => handleCsvUpload(event.target.files?.[0])} />
              </div>
            </div>
            {visibleWatchlist.length > 0 && <div className="watchlist-bar" role="group" aria-label="الأصول المفضلة"><span>المفضلة</span>{visibleWatchlist.map((item) => <button key={item} type="button" className={item === underlying ? 'selected' : ''} onClick={() => changeUnderlying(item)}>{item}<small>{getUnderlyingName(item)}</small></button>)}</div>}
          </section>

          <section className="compliance-banner" aria-label="تنبيه تنظيمي وتعليمي">
            <div className="compliance-icon"><ShieldAlert size={18} /></div>
            <div className="compliance-copy"><strong>وضع تحليلي وتجريبي</strong><span>مصدر البيانات موضح في الواجهة: Demo اصطناعي، CSV محلي، أو لقطة REST عامة من Binance عبر وسيط للقراءة فقط، وليست بثاً لحظياً. لا تمثل الأرقام توصية. أهلية الحساب لدى المنصة لا تعني أن التداول مسموح قانونياً في بلد الإقامة. للمقيمين في سوريا، الوضع القانوني لتداول العملات الرقمية والمشتقات المرتبطة بها يحتاج تحققاً مستقلاً؛ استخدم البحث والمحاكاة فقط ولا تموّل حساباً أو تنفّذ صفقة قبل مراجعة قانونية محلية.</span></div>
            <a href="https://www.fca.org.uk/news/press-releases/fca-lift-ban-crypto-exchange-traded-notes" target="_blank" rel="noreferrer" className="fca-link">معلومات FCA <ExternalLink size={13} /></a>
          </section>

          {dataMode === 'BINANCE' && binanceSnapshot && (binanceFreshness === 'stale' || binanceFreshness === 'future') && (
            <div className={`source-stale ${binanceFreshness === 'future' ? 'source-stale-clock' : ''}`} role="status">
              <ShieldAlert size={17} />
              <div>
                <strong>{binanceFreshness === 'future' ? 'وقت استلام اللقطة غير متسق' : 'لقطة Binance تجاوزت حدّ العمر المحلي'}</strong>
                <span>{binanceFreshness === 'future'
                  ? 'تحقّق من ساعة الجهاز؛ وقت الاستلام مسجل في المستقبل.'
                  : `تجاوزت اللقطة حدّاً محلياً قدره ${staleThresholdSeconds} ثانية. هذا يقيس وقت استلام اللقطة في التطبيق فقط، ولا يثبت حداثة حقول Binance.`}</span>
              </div>
              <button className="button button-ghost" onClick={loadBinanceOptions} disabled={binanceLoading}>
                <RefreshCw className={binanceLoading ? 'spin' : ''} size={13} /> تحديث اللقطة
              </button>
            </div>
          )}

          {binanceError && (
            <div className={`source-error ${binanceAccessRestricted ? 'source-error-restricted' : ''}`} role="alert">
              <div className="source-error-icon"><ShieldAlert size={16} /></div>
              <div>
                <strong>{binanceAccessRestricted ? 'رفض طلب الوسيط من Binance · HTTP 451' : dataMode === 'BINANCE' && binanceSnapshot ? 'تعذّر تحديث Binance' : 'تعذّر تحميل بيانات Binance'}</strong>
                <span>{binanceError}{dataMode === 'BINANCE' && binanceSnapshot ? ' — المعروض آخر لقطة محمّلة، وليس تحديثاً ناجحاً.' : ''}</span>
              </div>
              <div className="source-error-actions">
                {binanceAccessRestricted ? <>
                  <a className="source-error-link" href="https://www.binance.com/ar/support/faq/detail/863795c36a224bd7aa7d677996328ff9" target="_blank" rel="noreferrer">سياسة Binance للمقيمين في سوريا <ExternalLink size={12} /></a>
                  <button className="button button-ghost" onClick={resetDemo}><Zap size={13} /> استخدام Demo</button>
                </> : <button className="button button-ghost" onClick={loadBinanceOptions} disabled={binanceLoading}><RefreshCw size={13} /> إعادة المحاولة</button>}
              </div>
            </div>
          )}

          {visibleWarnings.length > 0 && (
            <div className="csv-warning" role="status"><div><Info size={16} /><strong>{dataMode === 'BINANCE' ? 'ملاحظات بيانات Binance' : 'ملاحظات استيراد CSV'}</strong></div><button className="csv-warning-close" onClick={() => dataMode === 'BINANCE' ? setBinanceSnapshot((current) => current ? { ...current, warnings: [] } : null) : setCsvWarnings([])} aria-label="إغلاق"><X size={15} /></button><ul>{(showAllCsvWarnings ? visibleWarnings : visibleWarnings.slice(0, 5)).map((warning, index) => <li key={index}>{warning}</li>)}</ul>{visibleWarnings.length > 5 && <button className="csv-warning-toggle" onClick={() => setShowAllCsvWarnings((value) => !value)}>{showAllCsvWarnings ? 'عرض ملاحظات أقل' : `عرض ${visibleWarnings.length - 5} ملاحظات أخرى`}</button>}</div>
          )}

          <section className="market-summary section-anchor" id="overview-metrics">
            <div className="section-title-row compact-title"><div><span className="section-kicker">MARKET SNAPSHOT</span><h2>لقطة السوق</h2></div><div className="snapshot-meta"><span className="live-hollow" />{dataMode === 'DEMO' ? 'قيم توضيحية مولّدة' : dataMode === 'CSV' ? 'مصدر الملف الذي استوردته' : `Binance REST · ${formatNumber(binanceSnapshot?.activeSymbols ?? 0, 0)} عقد نشط / ${formatNumber(binanceSnapshot?.quotes.length ?? 0, 0)} محلل`}<span className="meta-separator">·</span><span>{underlying}{quoteAssetLabel ? `/${quoteAssetLabel}` : ''}</span></div></div>
            {market ? <div className="stats-grid">
              <StatCard label={`السعر المرجعي · ${underlying}`} value={formatAssetPrice(market.spot, market.spot, quoteAssetLabel ?? null)} change={dataMode === 'DEMO' ? formatSignedPercent(DEMO_MARKETS[underlying].dayChangePct) : undefined} tone={dataMode === 'DEMO' ? (DEMO_MARKETS[underlying].dayChangePct >= 0 ? 'positive' : 'negative') : 'neutral'} footnote={dataMode === 'DEMO' ? 'قيمة محاكاة — ليست سعر Binance' : dataMode === 'BINANCE' ? 'مؤشر الأصل من Binance Options REST' : 'وسيط الأسعار الواردة في CSV'} icon={<span className="asset-symbol">{underlying === 'BTC' ? '₿' : underlying === 'ETH' ? 'Ξ' : underlying.slice(0, 3)}</span>} />
              <StatCard label="التقلب الضمني · 30 يوم" value={market.iv30 === null ? 'غير متاح' : formatPercent(market.iv30)} change={market.iv30 === null ? 'لا يوجد IV صالح' : dataMode === 'DEMO' ? 'قيمة مولّدة' : dataMode === 'BINANCE' ? 'سلسلة الخيارات' : 'تقريب من السلسلة'} tone={market.iv30 === null ? 'neutral' : 'accent'} footnote={market.iv30 === null ? 'لا يتوفر IV وأجل 20–40 يوماً غير معلّمين كتقديريين' : dataMode === 'DEMO' ? 'بيانات محاكاة وليست حية' : dataMode === 'BINANCE' ? 'وسيط IV غير المعلّم كتقديري لعقود 20–40 يوماً' : 'وسيط IV غير المعلّم كتقديري لصفوف 20–40 يوماً بوقت صالح'} icon={<Activity size={17} />} />
              <StatCard label="التقلب المحقّق · 30 يوم" value={market.rv30 === null ? 'غير متاح' : formatPercent(market.rv30)} change={market.rv30 === null ? 'يلزم تاريخ الأصل' : 'مرجع توضيحي'} tone="neutral" footnote={market.rv30 === null ? dataMode === 'BINANCE' ? 'لقطة REST لا توفر تاريخاً كافياً' : 'CSV لا يتضمن سلسلة أسعار تاريخية' : 'المحاكاة تستخدم قيمة ثابتة'} icon={<LineChart size={17} />} />
              <StatCard label="IV − RV" value={ivRvSpread === null ? 'غير متاح' : `${ivRvSpread >= 0 ? '+' : ''}${(ivRvSpread * 100).toFixed(1)} نقطة`} change={ivRvSpread === null ? 'بيانات غير كافية' : 'قراءة وصفية'} tone={ivTone === 'yellow' ? 'accent' : ivTone === 'green' ? 'positive' : 'neutral'} footnote={ivRvSpread === null ? 'لا نخلط بيانات تاريخية غير متوفرة' : 'ليس إشارة بيع أو شراء'} icon={<Gauge size={17} />} />
              <StatCard label="الفائدة المفتوحة الاسمية" value={market.openInterestValue === null || !openInterestCurrencyLabel ? 'غير متاح' : formatCompact(market.openInterestValue, openInterestCurrencyLabel)} change="من صفوف اللقطة" tone="neutral" footnote={market.openInterestValue === null ? 'لا تتوفر قيمة مباشرة أو بيانات OI قابلة للتحويل' : !openInterestCurrencyLabel ? 'تتضمن الصفوف عملات تسعير مختلفة أو مجهولة؛ لا تُجمع القيمة' : dataMode === 'DEMO' ? 'قيمة تقريبية مولّدة' : market.openInterestValueEstimated ? 'تقدير بعملة التسعير المعلنة من OI × السعر المرجعي × وحدة العقد' : dataMode === 'BINANCE' ? 'مجموع sumOpenInterestUsd من Binance' : 'قيمة USD واردة في ملف CSV'} icon={<Layers3 size={17} />} />
              <StatCard label="حجم التداول · 24 ساعة" value={market.volume24hValue === null || !volumeCurrencyLabel ? 'غير متاح' : formatCompact(market.volume24hValue, volumeCurrencyLabel)} change="من صفوف اللقطة" tone="neutral" footnote={market.volume24hValue === null ? 'لا تتوفر قيمة تداول أو حجم عقود للتحويل' : !volumeCurrencyLabel ? 'تتضمن الصفوف عملات تسعير مختلفة أو مجهولة؛ لا تُجمع القيمة' : dataMode === 'DEMO' ? 'قيمة تقريبية مولّدة' : market.volume24hValueEstimated ? 'تقدير بعملة التسعير المعلنة من حجم العقود × علاوة الخيار × وحدة العقد' : dataMode === 'BINANCE' ? 'مجموع amount (عملة التسعير) من Binance' : 'volumeQuote/turnover وارد في ملف CSV'} icon={<BarChart3 size={17} />} />
            </div> : <EmptyState title="لا توجد بيانات لهذا الأصل في الملف" note="استورد سلسلة تتضمن عقوداً وسعراً مرجعياً لهذا الأصل، أو استعد بيانات المحاكاة." />}
          </section>

          {dataMode !== 'DEMO' && quoteDataCoverage.contracts > 0 && (
            <section className="data-coverage-panel" aria-labelledby="data-coverage-title">
              <div className="data-coverage-heading">
                <div>
                  <span className="section-kicker">DATA COVERAGE</span>
                  <h2 id="data-coverage-title">اكتمال بيانات العقود</h2>
                  <p>{underlying} · {formatNumber(quoteDataCoverage.contracts, 0)} عقداً فريداً بعد إزالة تكرار الملاحظات</p>
                </div>
                <span className="data-coverage-source">{dataMode === 'BINANCE' ? `BookTicker · ${bookTickerStatus === 'connected' ? 'متصل' : bookTickerStatus === 'connecting' ? 'جارٍ الاتصال' : bookTickerStatus === 'reconnecting' ? 'إعادة اتصال' : 'غير نشط'}` : 'ملف CSV محلي'}</span>
              </div>
              <div className="data-coverage-grid">
                {[
                  ['Bid + Ask صالحان', quoteDataCoverage.twoSidedQuotes],
                  ['جانب سعري واحد', quoteDataCoverage.oneSidedQuotes],
                  ['Bid وAsk غير متاحين', quoteDataCoverage.missingBothSides],
                  ['Bid/Ask متعارضان', quoteDataCoverage.crossedQuotes],
                  ['IV مرصود', quoteDataCoverage.observedIv],
                  ['IV مقدر بالنموذج', quoteDataCoverage.estimatedIv],
                  ['IV غير متاح', quoteDataCoverage.unavailableIv],
                  ['عقود لها OI', quoteDataCoverage.openInterestAvailable],
                  ['عقود لها حجم تداول', quoteDataCoverage.volumeAvailable],
                  ['مواصفات اقتصادية موثقة', quoteDataCoverage.providerVerifiedEconomics],
                  ['عقود وصلها BookTicker', quoteDataCoverage.bookTickerAvailable],
                  ['عقود وصلها Mark Price حي', quoteDataCoverage.liveMarkPriceAvailable],
                  ['عقود وصلها Option Ticker حي', quoteDataCoverage.liveOptionTickerAvailable],
                  ['عقود تتوفر لها كميات أفضل Bid/Ask', quoteDataCoverage.bestBookQuantitiesAvailable],
                  ['عقود لديها Bid/Ask من Ticker', quoteDataCoverage.optionTickerBookAvailable],
                  ['Bid IV متاح', quoteDataCoverage.bidIvAvailable],
                  ['Ask IV متاح', quoteDataCoverage.askIvAvailable],
                ].map(([label, count]) => (
                  <div className="data-coverage-item" key={label}>
                    <strong>{formatNumber(Number(count), 0)}<small> / {formatNumber(quoteDataCoverage.contracts, 0)}</small></strong>
                    <span>{label}</span>
                    <i><b style={{ width: `${quoteDataCoverage.contracts ? Math.min(100, Number(count) / quoteDataCoverage.contracts * 100) : 0}%` }} /></i>
                  </div>
                ))}
              </div>
              <p className="data-coverage-note">الأصفار في OI والحجم تُحسب قيماً متاحة، لا حقولاً مفقودة. لا تُستبدل الأسعار أو IV الناقصة بقيم مخمّنة. وجود Bid وAsk لا يضمن التنفيذ أو حداثة السعر.</p>
              {dataMode === 'BINANCE' && <p className="data-coverage-note">BookTicker: {bookTickerStatus === 'connected' ? 'متصل' : bookTickerStatus === 'connecting' ? 'جارٍ الاتصال' : bookTickerStatus === 'reconnecting' ? 'يعيد الاتصال تلقائياً' : 'غير نشط'} · الاشتراك في {formatNumber(bookTickerTargets.length, 0)} من {formatNumber(bookTickerCandidates.length, 0)} عقد ناقص، بحد أقصى 180 رمزاً · {formatNumber(bookTickerUpdates, 0)} تحديثاً مستلماً. إذا لم ينشر المزود تحديثاً، يبقى الحقل ناقصاً.</p>}
              {dataMode === 'BINANCE' && <p className="data-coverage-note">Option Mark Price + Ticker: {optionMarkStatus === 'connected' ? 'متصل' : optionMarkStatus === 'connecting' ? 'جارٍ الاتصال' : optionMarkStatus === 'reconnecting' ? 'إعادة اتصال' : 'غير نشط'} · {optionMarkTarget}@markPrice + {formatNumber(optionTickerTargets.length, 0)} قنوات انتهاء · {formatNumber(optionMarkUpdates, 0)} أحداث سوق مستلمة. توقيت الحدث من Binance، ولا تُستخدم Greeks المصدرية مباشرة في حسابات النموذج.</p>}
            </section>
          )}

          <Suspense fallback={<div className="panel chart-loading-area" role="status">جارٍ تحميل تحليل التقلب والتقييم...</div>}>
          <OpportunityReview
            quotes={assetQuotes}
            market={market ?? null}
            ivRank={ivRankMetrics}
            ivHistoryNotice={ivHistoryNotice}
            underlying={underlying}
            dataMode={dataMode}
            onReviewQuote={(quote) => {
              setSelectedExpiry(quote.expiry);
              setSelectedType(quote.type);
              setSelectedId(quote.id);
              setQuantity(quote.minQty ?? getQuantityStep(quote));
              navigate('scanner');
            }}
          />
          </Suspense>

          <Suspense fallback={<div className="panel chart-loading-area" role="status">جارٍ تحميل إعادة التشغيل التاريخية...</div>}>
            <HistoricalReplayPanel quotes={assetQuotes} dataMode={dataMode} underlying={underlying} />
          </Suspense>

          <DeferredVolatilityCharts
            smileData={smileData}
            termData={termData}
            underlying={underlying}
            selectedQuote={selectedQuote}
            selectedType={selectedType}
          />

          <section className="section-anchor scanner-section" id="scanner">
            <div className="section-title-row"><div><span className="section-kicker">OPTION CHAIN</span><h2>ماسح العقود</h2><p>اختر عقداً لعرض تحليله — لا توجد أوامر تنفيذ في هذا المختبر.</p></div><button className="text-button" onClick={resetDemo}><Zap size={14} /> استعادة المحاكاة</button></div>
            <div className="scanner-layout">
              <article className="panel chain-panel">
                <div className="chain-toolbar">
                  <div className="option-tabs" role="group" aria-label="نوع الخيار">
                    <button type="button" aria-pressed={selectedType === 'CALL'} className={selectedType === 'CALL' ? 'active call-tab' : ''} disabled={!assetQuotes.some((quote) => quote.expiry === effectiveExpiry && quote.type === 'CALL')} onClick={() => {
                      const next = assetQuotes.find((quote) => quote.expiry === effectiveExpiry && quote.type === 'CALL');
                      if (next) { setSelectedType('CALL'); setSelectedId(next.id); }
                    }}>Call <span>شراء حق الصعود</span></button>
                    <button type="button" aria-pressed={selectedType === 'PUT'} className={selectedType === 'PUT' ? 'active put-tab' : ''} disabled={!assetQuotes.some((quote) => quote.expiry === effectiveExpiry && quote.type === 'PUT')} onClick={() => {
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
                        const quoteReferencePrice = getUnderlyingReferencePrice(quote);
                        const moneyness = ((quote.strike / quoteReferencePrice) - 1) * 100;
                        return <tr key={quote.id} onClick={() => setSelectedId(quote.id)} className={isSelected ? 'selected-row' : ''}>
                          <td><div className="contract-cell"><strong>{formatAssetPrice(quote.strike, quoteReferencePrice, getQuoteCurrency(quote) ?? null)}</strong><span className={`moneyness ${Math.abs(moneyness) < 2.6 ? 'atm' : ''}`}>{Math.abs(moneyness) < 2.6 ? 'ATM' : `${moneyness > 0 ? '+' : ''}${moneyness.toFixed(1)}%`}</span></div><span className="contract-symbol">{quote.symbol}</span></td>
                          <td>{formatQuotePrice(quote.bid, quote)}</td><td>{formatQuotePrice(quote.ask, quote)}</td><td className="iv-cell">{quote.ivStatus === 'UNAVAILABLE' || quote.iv <= 0 ? '—' : formatPercent(quote.iv)}</td><td className={quote.delta >= 0 ? 'positive-text' : 'negative-text'}>{quote.pricingStatus === 'OBSERVED_ONLY' ? '—' : `${quote.delta.toFixed(3)}${quote.pricingStatus === 'ASSUMED' ? '*' : ''}`}</td><td>{quote.openInterest === null ? '—' : formatSmallNumber(quote.openInterest)}</td><td>{quote.volume === null ? '—' : formatSmallNumber(quote.volume)}</td><td><span className={`spread-pill ${!Number.isFinite(spread) ? 'unknown' : spread > 8 ? 'wide' : spread > 4 ? 'medium' : 'tight'}`}>{Number.isFinite(spread) ? `${spread.toFixed(1)}%` : '—'}</span></td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                  <div className="chain-mobile-list" role="group" aria-label="عقود الخيارات">
                    {filteredQuotes.map((quote) => {
                      const spread = getSpreadPct(quote);
                      const isSelected = quote.id === selectedQuote.id;
                      const quoteReferencePrice = getUnderlyingReferencePrice(quote);
                      const moneyness = ((quote.strike / quoteReferencePrice) - 1) * 100;
                      return <button
                        type="button"
                        key={quote.id}
                        className={`chain-mobile-card ${isSelected ? 'selected' : ''}`}
                        aria-pressed={isSelected}
                        onClick={() => setSelectedId(quote.id)}
                      >
                        <span className="chain-mobile-card-head">
                          <span>
                            <span className="chain-mobile-card-contract">
                              <strong>{formatAssetPrice(quote.strike, quoteReferencePrice, getQuoteCurrency(quote) ?? null)}</strong>
                              <span className={`moneyness ${Math.abs(moneyness) < 2.6 ? 'atm' : ''}`}>{Math.abs(moneyness) < 2.6 ? 'ATM' : `${moneyness > 0 ? '+' : ''}${moneyness.toFixed(1)}%`}</span>
                            </span>
                            <span className="chain-mobile-card-symbol">{quote.symbol}</span>
                          </span>
                          <span className={`spread-pill ${!Number.isFinite(spread) ? 'unknown' : spread > 8 ? 'wide' : spread > 4 ? 'medium' : 'tight'}`}>{Number.isFinite(spread) ? `${spread.toFixed(1)}%` : 'Spread —'}</span>
                        </span>
                        <span className="chain-mobile-quote-grid">
                          <span><small>Bid</small><b dir="ltr">{formatQuotePrice(quote.bid, quote)}</b></span>
                          <span><small>Ask</small><b dir="ltr">{formatQuotePrice(quote.ask, quote)}</b></span>
                          <span><small>IV</small><b dir="ltr" className="iv-cell">{quote.ivStatus === 'UNAVAILABLE' || quote.iv <= 0 ? '—' : formatPercent(quote.iv)}</b></span>
                          <span><small>Delta</small><b dir="ltr" className={quote.delta >= 0 ? 'positive-text' : 'negative-text'}>{quote.pricingStatus === 'OBSERVED_ONLY' ? '—' : `${quote.delta.toFixed(3)}${quote.pricingStatus === 'ASSUMED' ? '*' : ''}`}</b></span>
                        </span>
                        <span className="chain-mobile-meta">
                          <span>OI <b dir="ltr">{quote.openInterest === null ? '—' : formatSmallNumber(quote.openInterest)}</b></span>
                          <span>حجم 24س <b dir="ltr">{quote.volume === null ? '—' : formatSmallNumber(quote.volume)}</b></span>
                          <span>{isSelected ? 'العقد المحدد' : 'اضغط لعرض التحليل'}</span>
                        </span>
                      </button>;
                    })}
                  </div>
                  {!filteredQuotes.length && <EmptyState title="لا توجد عقود مطابقة" note="غيّر نوع العقد أو تاريخ الانتهاء أو ابحث برمز مختلف." />}
                </div>
                <div className="table-footer"><span>عرض {formatNumber(filteredQuotes.length, 0)} عقد من أصل {formatNumber(assetQuotes.filter((quote) => quote.expiry === effectiveExpiry && quote.type === selectedType).length, 0)} في هذه السلسلة</span><span><span className={`table-dot ${dataMode === 'BINANCE' ? 'binance-dot' : ''}`} />{dataMode === 'DEMO' ? 'بيانات محاكاة' : dataMode === 'CSV' ? 'بيانات CSV محلية' : 'لقطة سوق عامة من Binance · ليست بثاً لحظياً'}</span></div>
              </article>

              <aside className="panel quick-analysis" id="trade-lab">
                <div className="analysis-header"><div><span className="section-kicker">CONTRACT REVIEW</span><h3>ملخص العقد</h3></div><span className="analysis-state"><span /> فحص فقط</span></div>
                <div className="selected-contract-title"><div className={`contract-type-icon ${selectedQuote.type.toLowerCase()}`}>{selectedQuote.type === 'CALL' ? <TrendingUp size={17} /> : <TrendingDown size={17} />}</div><div><strong>{selectedQuote.underlying} {selectedQuote.type}</strong><span>{formatAssetPrice(selectedQuote.strike, underlyingReferencePrice, quoteAssetLabel ?? null)} · ينتهي بعد {selectedQuote.daysToExpiry.toFixed(0)} يوم</span></div><button className="copy-symbol" onClick={() => { navigator.clipboard?.writeText(selectedQuote.symbol); notify('تم نسخ رمز العقد.'); }} title="نسخ رمز العقد">⧉</button></div>
                {dataMode === 'BINANCE' && <div className="contract-specs"><span><small>وحدة العقد</small><b>{formatSmallNumber(selectedQuote.unit)} {selectedQuote.underlying}</b></span><span><small>حد الكمية</small><b>{selectedQuote.minQty === undefined ? '—' : formatQuantity(selectedQuote.minQty, selectedQuote)} – {selectedQuote.maxQty === undefined ? '—' : formatQuantity(selectedQuote.maxQty, selectedQuote)}</b></span><span><small>رسوم taker</small><b>{selectedQuote.takerFeeRate === undefined ? '—' : formatPercent(selectedQuote.takerFeeRate, 2)}</b></span></div>}
                <div className="price-highlight"><span>{dataMode === 'BINANCE' ? 'سعر العقد المرجعي' : 'السعر المرجعي التقديري'}</span><strong>{formatOptionPrice(selectedPremium, selectedQuote)}</strong><small>{priceBasis}</small></div>
                <div className="quote-row"><span>Bid <b>{formatQuotePrice(selectedQuote.bid, selectedQuote)}</b><small>{selectedQuote.bidQuantity === undefined ? 'حجم غير متاح' : `حجم معروض: ${formatQuantity(selectedQuote.bidQuantity, selectedQuote)} عقد`}</small></span><span>Ask <b>{formatQuotePrice(selectedQuote.ask, selectedQuote)}</b><small>{selectedQuote.askQuantity === undefined ? 'حجم غير متاح' : `حجم معروض: ${formatQuantity(selectedQuote.askQuantity, selectedQuote)} عقد`}</small></span></div>
                {dataMode === 'BINANCE' && <div className="source-time-panel" aria-label="توقيتات مصادر بيانات العقد">
                  <div><span>آخر تداول ضمن 24 ساعة · Ticker</span><strong>{formatSourceTimestamp(selectedQuote.sourceTimestamps?.ticker)}</strong><small>{formatSourceTimestampAge(selectedQuote.sourceTimestamps?.ticker)}</small></div>
                  <div><span>مؤشر الأصل · Index</span><strong>{formatSourceTimestamp(selectedQuote.sourceTimestamps?.index)}</strong><small>{formatSourceTimestampAge(selectedQuote.sourceTimestamps?.index)}</small></div>
                  <div><span>الفائدة المفتوحة · OI</span><strong>{formatSourceTimestamp(selectedQuote.sourceTimestamps?.openInterest)}</strong><small>{formatSourceTimestampAge(selectedQuote.sourceTimestamps?.openInterest)}</small></div>
                  <div><span>أفضل Bid/Ask · BookTicker</span><strong>{formatSourceTimestamp(selectedQuote.sourceTimestamps?.bookTicker)}</strong><small>{formatSourceTimestampAge(selectedQuote.sourceTimestamps?.bookTicker)}</small><small>وقت الاستلام المحلي: {formatSourceTimestamp(selectedQuote.sourceReceivedAt?.bidAsk)}</small></div>
                  <div><span>Mark Price / IV · Options Stream</span><strong>{formatSourceTimestamp(selectedQuote.sourceTimestamps?.markPrice)}</strong><small>{formatSourceTimestampAge(selectedQuote.sourceTimestamps?.markPrice)}</small></div>
                  <small>العمر هو الزمن المنقضي منذ التوقيت المنشور لكل نقطة. BookTicker يخص أفضل Bid/Ask فقط ولا يضمن التنفيذ؛ closeTime يخص آخر صفقة ضمن نافذة 24 ساعة. هذه أوقات المصدر وليست أوقات استلام التطبيق، وMark Price يستخدم توقيت حدث optionMarkPrice من Binance؛ لا نخلط بينه وبين وقت استلام التطبيق.</small>
                </div>}
                {dataMode === 'BINANCE' && <div className="iv-source-range" aria-label="قيم IV المتاحة للعقد">
                  <span>Bid IV <b>{selectedQuote.bidIv === undefined ? '—' : formatPercent(selectedQuote.bidIv)}</b></span>
                  <span>{selectedQuote.ivStatus === 'UNAVAILABLE' || selectedQuote.iv <= 0 ? 'IV غير متاح' : selectedQuote.ivStatus === 'ESTIMATED' || selectedQuote.estimatedFields?.includes('iv') ? 'IV مقدر بالنموذج' : 'Mark IV'} <b>{selectedQuote.ivStatus === 'UNAVAILABLE' || selectedQuote.iv <= 0 ? '—' : formatPercent(selectedQuote.iv)}</b></span>
                  <span>Ask IV <b>{selectedQuote.askIv === undefined ? '—' : formatPercent(selectedQuote.askIv)}</b></span>
                </div>}
                <div className="quote-quality"><span>الفارق السعري</span><span className={`quality-badge ${!Number.isFinite(spreadPct) ? 'unknown' : spreadPct > 10 ? 'bad' : spreadPct > 4 ? 'warn' : 'good'}`}><i />{Number.isFinite(spreadPct) ? `${quoteQuality} · ${spreadPct.toFixed(1)}%` : 'غير متاح · يلزم Bid وAsk'}</span></div>
                <div className="analysis-divider" />
                <div className="input-grid">
                  <label><span>{dataMode === 'BINANCE' ? 'كمية العقود' : 'الكمية'} <small>{dataMode === 'BINANCE' ? 'حسب مواصفات Binance' : 'من الأصل'}</small></span><input type="number" min={dataMode === 'BINANCE' ? minimumQuantity : 0.01} step={dataMode === 'BINANCE' ? quantityStep : 0.01} max={dataMode === 'BINANCE' ? selectedQuote.maxQty : undefined} value={quantity} onChange={(event) => setQuantity(Math.max(0, Number(event.target.value)))} /></label>
                  <label><span>الرسوم التقديرية <small>{quoteAssetLabel ?? 'عملة غير محددة'}</small></span><input type="number" min="0" step="0.1" value={fees} onChange={(event) => setFees(Math.max(0, Number(event.target.value)))} /></label>
                  <label><span>رسوم الخروج <small>يدوي · {quoteAssetLabel ?? 'عملة غير محددة'}</small></span><input type="number" min="0" step="0.01" placeholder="مطلوبة عند الإغلاق" value={exitFees ?? ''} onChange={(event) => setExitFees(event.target.value === '' ? null : Math.max(0, Number(event.target.value)))} /></label>
                  <label><span>رسوم الخروج <small>أدخلها يدوياً · {quoteAssetLabel ?? 'عملة غير محددة'}</small></span><input type="number" min="0" step="0.01" placeholder="مطلوبة عند الإغلاق" value={exitFees ?? ''} onChange={(event) => setExitFees(event.target.value === '' ? null : Math.max(0, Number(event.target.value)))} /></label>
                </div>
                {hasPremiumSizingCapability && <div className="budget-row"><label htmlFor="risk-budget">ميزانية المحاولة (حد أقصى 20)</label><div><input id="risk-budget" type="number" min="0" max={PAPER_CAMPAIGN_PER_TRADE_CAP} step="1" value={riskBudget} onChange={(event) => setRiskBudget(Math.min(PAPER_CAMPAIGN_PER_TRADE_CAP, Math.max(0, Number(event.target.value))))} /><span>{quoteAssetLabel ?? 'عملة غير محددة'}</span><button onClick={handleBudgetClick} title="احسب كمية لا تتجاوز الميزانية">احسب الكمية</button></div></div>}
                <div className="risk-summary campaign-risk-summary">
                  <div><span>رأس مال الحملة</span><strong>{formatMoney(PAPER_CAMPAIGN_CAPITAL, 0, 'USD')}</strong></div>
                  <div><span>سقف الخسارة الكلي</span><strong>{formatMoney(PAPER_CAMPAIGN_MAX_LOSS, 0, quoteAssetLabel ?? 'USDT')}</strong></div>
                  <div><span>المخصص في الدفتر</span><strong>{campaignBudget.unknownEntries || campaignBudget.currencyMismatchEntries ? 'غير محسوب' : formatMoney(campaignBudget.used, 2, campaignBudget.currency || null)}</strong></div>
                  <div><span>المتبقي للحملة</span><strong>{campaignBudgetBlockMessage ? 'محجوب' : formatMoney(campaignBudget.remaining, 2, campaignBudget.currency || null)}</strong></div>
                  <div><span>احتياطي خارج التداول</span><strong>{formatMoney(PAPER_CAMPAIGN_CAPITAL - PAPER_CAMPAIGN_MAX_LOSS, 0, 'USD')}</strong></div>
                </div>
                {campaignBudgetBlockMessage && <div className="analysis-footnote"><ShieldAlert size={13} /><span>{campaignBudgetBlockMessage} يحتسب السقف تكلفة المراكز المفتوحة والخسائر المحققة في صفقات PAPER المغلقة؛ الأرباح المحققة تخفض خسارة الحملة المحسوبة، ولا تُعد أرباحاً فعلية.</span></div>}
                <div className="risk-summary">
                  <div><span>تكلفة القسط + الرسوم</span><strong>{canCalculatePremiumCost ? formatMoney(totalCost, 2, quoteAssetLabel ?? null) : 'غير متاح'}</strong></div>
                  <div><span>نقطة التعادل عند الانتهاء</span><strong>{canCalculateBreakEven ? formatMoney(breakEven, 0, quoteAssetLabel ?? null) : 'غير متاح'}</strong></div>
                  <div className="risk-row"><span>أقصى خسارة للمشتري</span><strong className="loss-value">{canCalculateMaxLoss ? formatMoney(maxLoss, 2, quoteAssetLabel ?? null) : 'غير متاح'}</strong></div>
                </div>
                <div className="analysis-footnote"><Info size={13} /><span>{contractScaleIssueMessage ? `${contractScaleIssueMessage} ` : ''}{dataMode !== 'DEMO' && selectedQuote.estimatedFields?.length ? `حقول مقدّرة أو افتراضية في هذا العقد: ${formatEstimatedFields(selectedQuote.estimatedFields)}. ` : ''}اتساق unit وcontractMultiplier إن توفرا هو تحقق داخلي من الحقول فقط، ولا يثبت مطابقة deliverables لمواصفات البورصة. الحساب لا يضيف تلقائياً رسوم المنصة أو أثر التنفيذ؛ أدخل الرسوم الفعلية وراجع وحدة العقد.</span></div>
                <button className="button button-paper" onClick={savePaperTrade} disabled={!hasExplicitConsistentContractScale && !selectedQuote.contractEconomics}><Plus size={16} /> أضف إلى الدفتر التجريبي</button>
                <div className="no-signal"><ShieldAlert size={15} /><span>لا يصدر المختبر توصية شراء أو بيع.</span></div>
              </aside>
            </div>
            {dataMode === 'BINANCE' && (
              <Suspense fallback={<div className="panel" role="status">جارٍ تحميل دفتر العمق...</div>}>
                <MarketDepthPanel
                  quote={selectedQuote}
                  quantity={safeQuantity}
                  depth={binanceDepth}
                  loading={binanceDepthLoading}
                  error={binanceDepthError}
                  onRefresh={() => setBinanceDepthRefreshKey((value) => value + 1)}
                />
              </Suspense>
            )}
          </section>

          <Suspense fallback={<div className="panel" role="status">جارٍ تحميل تحليل Greeks...</div>}>
            <GreeksPanel quote={selectedQuote} quantity={safeQuantity} dataMode={dataMode} />
          </Suspense>

          <section className="section-anchor payoff-section" id="payoff">
            <div className="section-title-row"><div><span className="section-kicker">EXPIRY SCENARIOS</span><h2>ماذا لو انتهى العقد عند مستويات مختلفة؟</h2><p>ربح/خسارة الخيار المشترى عند الانتهاء · قبل إضافة أي رسوم غير مدخلة</p></div><div className="scenario-controls"><span className="scenario-key"><i className="profit-key" /> صافي P&amp;L</span><span className="scenario-key"><i className="zero-key" /> التعادل</span></div></div>
            <div className="panel payoff-panel">
              {scenarioSeries.length > 0
                ? <DeferredPayoffChart scenarioSeries={scenarioSeries} selectedQuote={selectedQuote} />
                : <div className="empty-state"><strong>{selectedQuote.contractEconomics ? 'حساب P&L عند الانتهاء غير متاح' : 'حساب P&L لكل عقد غير متاح'}</strong><span>{selectedQuote.contractEconomics ? 'لم تجتز مواصفات التسوية النقدية والتحقق من مصدرها شروط المحوّل الاقتصادي؛ لم نستخدم مضاعف unit بديلاً.' : contractScaleIssueMessage}</span></div>}
              <div className="scenario-side">
                <div className="scenario-side-head"><span>نطاق الحركة الضمني التقريبي</span><CircleHelp size={14} /></div>
                {expectedMove !== undefined ? <>
                  <div className="expected-move-value">±{formatAssetPrice(expectedMove, underlyingReferencePrice, quoteAssetLabel ?? null)}</div>
                  <div className="expected-range"><span>{formatAssetPrice(Math.max(0, underlyingReferencePrice - expectedMove), underlyingReferencePrice, quoteAssetLabel ?? null)}</span><i /><span>{formatAssetPrice(underlyingReferencePrice + expectedMove, underlyingReferencePrice, quoteAssetLabel ?? null)}</span></div>
                  <p>تقريب 1σ من IV حتى الانتهاء. ليس توقعاً ولا احتمالاً مؤكداً.</p>
                </> : <p>نطاق الحركة غير متاح: لا يوجد نموذج تسعير موثّق لهذا العقد. {selectedQuote.pricingReason}</p>}
                <div className="scenario-divider" />
                <div className="scenario-stat"><span>Delta</span><strong className={hasModelGreeks && selectedQuote.delta >= 0 ? 'positive-text' : 'negative-text'}>{hasModelGreeks ? selectedQuote.delta.toFixed(3) : '—'}</strong><small>حساسية تقريبية لكل حركة وحدة</small></div>
                <div className="scenario-stat"><span>Theta / يوم</span><strong className="negative-text">{hasModelGreeks ? formatMoney(selectedQuote.theta * safeQuantity * selectedQuote.unit, 2, quoteAssetLabel ?? null) : '—'}</strong><small>تقدير النموذج، يتغير مع السوق</small></div>
                <div className="scenario-stat"><span>Vega / نقطة تقلب</span><strong>{hasModelGreeks ? formatMoney(selectedQuote.vega * safeQuantity * selectedQuote.unit, 2, quoteAssetLabel ?? null) : '—'}</strong><small>حساسية تقريبية لـ +1 نقطة مئوية</small></div>
              </div>
            </div>
          </section>

          <section className="model-strip">
            <button className="model-toggle" onClick={() => setShowAssumptions((value) => !value)}><div className="model-icon"><Info size={16} /></div><div><strong>افتراضات النموذج وحدوده</strong><span>{dataMode === 'BINANCE' ? 'Crypto: BSM مع Carry مفترض · Commodity: بيانات مرصودة فقط' : dataMode === 'CSV' ? 'توجيه النموذج حسب مواصفات العقد · الافتراضات ظاهرة' : 'Black–76 للعقود الآجلة وBSM مع Carry للـSpot · بيانات اصطناعية'}</span></div><ChevronDown className={showAssumptions ? 'rotated' : ''} size={16} /></button>
            {showAssumptions && <div className="model-details">{dataMode === 'BINANCE' ? <><p>تمر طلبات Binance عبر وسيط Supabase عام محدود بواجهات بيانات السوق للقراءة فقط لتوافق CORS؛ يطلب exchangeInfo لاكتشاف العقود النشطة وmark/ticker/index وopenInterest لبيانات السوق. لا يخزن الوسيط مفاتيح API ولا يقبل مسارات حساب أو تداول، ولا يتجاوز قيود Binance الجغرافية. ما يظهر لقطة REST عند آخر تحديث وليس بثاً لحظياً؛ وقد تتغير العقود أو تتأخر البيانات أو تُحجب حسب الشبكة والمنطقة.</p><p>تُعرض Mark/IV وBid/Ask والمؤشر والفائدة المفتوحة عند توفرها. خيارات الكريبتو المعروفة تُنمذج كخيارات أوروبية على مؤشر Spot باستخدام Black–Scholes مع Carry، مع افتراض carry=0 إذا لم يتوفر من المصدر؛ لذلك تظهر بحالة «افتراض معلن». تُحفظ Greeks الخام من Binance للتدقيق فقط ولا تُخلط مع Greeks المحسوبة. أما Commodity/TradFi Options المرتبطة بمؤشر Perpetual، وأي نوع أصل غير معروف، فتعرض بيانات السوق المرصودة فقط وتُحجب Greeks والحركة الضمنية إلى أن يتوفر نموذج مثبت. لا نستخدم Black–Scholes تلقائياً على الذهب أو العقود الدائمة. Rho لكل نقطة مئوية من معدل سنوي مركب باستمرار، ووحدة `riskFreeInterest` تحتاج تحققاً من المصدر.</p></> : <><p>{dataMode === 'DEMO' ? 'هذه نسخة محاكاة: بيانات الأسعار مولدة وليست متصلة بمنصة. تستخدم Black–76 لعقود CL/BZ الآجلة وBlack–Scholes مع Carry لبقية الأصول، مع افتراض معدل فائدة وCarry يساويان 0%. كل القيم اصطناعية.' : 'يستخدم CSV نموذج Black–76 للعقود الآجلة فقط عند توفر Forward ومعدل فائدة ومواصفات أوروبية وتسوية صريحة؛ ويستخدم Black–Scholes مع Carry لعقود Spot/Index/FX عند إدخال Spot والمعدل والـCarry. العقود الأمريكية أو الدائمة أو غير المكتملة تبقى بيانات مرصودة فقط. إذا غاب IV ولا تسمح مواصفات العقد بنموذج مدعوم، يُرفض الصف بدلاً من تخمين IV أو Greeks بنموذج عام. إذا توفر IV مرصود، تبقى الأسعار وIV قابلة للاستيراد مع حجب Greeks النموذجية. تحقّق من الوحدات والطوابع الزمنية.'}</p><p>لا يستخدم المختبر مصادر بديلة خفية ولا يخلط بيانات Demo ببيانات CSV أو Binance. لا تستخدم المحاكاة لاتخاذ قرار مالي مباشر.</p></>}</div>}
          </section>

          <Suspense fallback={<div className="panel" role="status">جارٍ تحميل المركز المالي...</div>}>
            <FinancialCockpit />
          </Suspense>

          <section className="section-anchor journal-section" id="journal">
            <div className="section-title-row"><div><span className="section-kicker">PAPER WORKSPACE</span><h2>الدفتر التجريبي</h2><p>سجل الفرضية والكمية والقسط قبل أن تقيم جودة القرار.</p></div><div className="journal-actions"><button className="button button-ghost" onClick={exportTrades}><Download size={14} /> تصدير CSV</button>{paperCloseEvents.length > 0 && <button className="button button-ghost" onClick={() => exportPaperCloseEvents(JSON.stringify(paperCloseEvents, null, 2), 'sol-paper-close-events.json')}><Download size={14} /> أحداث الإغلاق JSON</button>}<button className="button button-ghost" onClick={exportIVHistoryBackup}><Download size={14} /> نسخة IV JSON</button><button className="button button-ghost danger-ghost" onClick={clearPaperJournal} disabled={!paperCloseEventsReady || (!trades.length && !paperCloseEvents.length) || paperJournalLoad.persistenceBlocked || paperJournalLoad.backupAvailable || paperCloseEventsLoad.persistenceBlocked || paperCloseEventsLoad.backupAvailable}><Trash2 size={14} /> مسح الدفتر</button></div></div>
            <article className="panel journal-panel">
              <div className="journal-summary"><div className="journal-summary-icon"><WalletCards size={18} /></div><div><strong>{trades.length} <span>صفقة تجريبية</span></strong><small>محفوظة محلياً في هذا المتصفح فقط</small></div><div className="journal-metric"><span>وضع التنفيذ</span><strong><i /> PAPER ONLY</strong></div><div className="journal-metric"><span>مفاتيح تداول</span><strong className="safe-label"><LockKeyhole size={13} /> غير مطلوبة</strong></div></div>
              {(paperJournalLoad.backupAvailable || paperJournalLoad.persistenceBlocked) && <div className="journal-recovery-warning" role="alert"><strong>تنبيه سلامة دفتر PAPER</strong><p>{paperJournalLoad.persistenceBlocked ? 'أوقفنا أي كتابة جديدة حتى لا نفقد بيانات قديمة لم نستطع حفظ نسخة استعادتها بأمان.' : paperJournalLoad.parseError ? 'تعذر تحليل ملف الدفتر الأصلي؛ احتفظنا بنسخته الخام قبل استبعادها من العرض.' : paperJournalLoad.rejectedCount > 0 ? `تم عزل ${paperJournalLoad.rejectedCount} سجل غير صالح من العرض، مع الاحتفاظ بالملف الأصلي الخام للاستعادة.` : 'توجد نسخة استعادة سابقة محفوظة من دفتر PAPER؛ احتفظ بها خارج المتصفح قبل مسح بياناته.'} لا تمسح بيانات المتصفح قبل تنزيل النسخة.</p>{paperJournalLoad.backupAvailable && <button className="button button-ghost" onClick={exportPaperJournalRecovery}><Download size={14} /> تنزيل نسخة الاستعادة JSON</button>}{paperJournalLoad.persistenceBlocked && <button className="button button-ghost" onClick={exportPaperJournalOriginal}><Download size={14} /> تنزيل الملف الأصلي الحالي</button>}{(paperJournalLoad.persistenceBlocked || paperJournalLoad.backupAvailable) && <button className="button button-ghost" onClick={retryPaperJournalPersistence}>متابعة بعد حفظ النسخ خارج المتصفح</button>}</div>}
              {(paperCloseEventsReady && (paperCloseEventsLoad.backupAvailable || paperCloseEventsLoad.persistenceBlocked)) && <div className="journal-recovery-warning" role="alert"><strong>تنبيه سجل إغلاقات PAPER</strong><p>{paperCloseEventsLoad.persistenceBlocked ? 'أوقفنا الإغلاقات الجديدة لحماية سجل أحداث لم نستطع استعادته بأمان.' : paperCloseEventsLoad.parseError ? 'تعذر تحليل سجل الإغلاق الأصلي؛ احتفظنا بنسخته الخام.' : paperCloseEventsLoad.rejectedCount > 0 ? `تم عزل ${paperCloseEventsLoad.rejectedCount} حدث غير صالح مع الاحتفاظ بالنسخة الخام.` : 'توجد نسخة استعادة سابقة لأحداث الإغلاق؛ نزّلها قبل مسح بيانات المتصفح.'}</p>{paperCloseEventsLoad.backupAvailable && <button className="button button-ghost" onClick={async () => { const { readPaperCloseEventsRecovery } = await import('./lib/paper-journal-events'); exportPaperCloseEvents(readPaperCloseEventsRecovery(localStorage), 'sol-paper-close-events-recovery.json'); }}><Download size={14} /> تنزيل نسخة الاستعادة</button>}{paperCloseEventsLoad.persistenceBlocked && <button className="button button-ghost" onClick={async () => { const { readPaperCloseEventsPrimary } = await import('./lib/paper-journal-events'); exportPaperCloseEvents(readPaperCloseEventsPrimary(localStorage), 'sol-paper-close-events-original.json'); }}><Download size={14} /> تنزيل السجل الأصلي</button>}{(paperCloseEventsLoad.persistenceBlocked || paperCloseEventsLoad.backupAvailable) && <button className="button button-ghost" onClick={retryPaperCloseEventsPersistence}>متابعة بعد حفظ النسخ خارج المتصفح</button>}</div>}
              {trades.length ? <>
                <div className="journal-table-wrap"><table className="journal-table"><thead><tr><th>وقت التسجيل</th><th>العقد</th><th>Strike</th><th>كمية</th><th>قسط الدخول</th><th>السعر المرجعي وقتها</th><th>الحالة</th></tr></thead><tbody>{trades.map((trade) => <tr key={trade.id}><td>{formatDateTime(new Date(trade.createdAt))}</td><td><span className={`mini-type ${trade.type.toLowerCase()}`}>{trade.type}</span><strong>{trade.symbol}</strong>{trade.contractEconomics && <small>لقطة العقد: قسط ×{trade.premiumMultiplierAtEntry} · وحدة التسليم {trade.contractUnitAtEntry}</small>}</td><td>{formatAssetPrice(trade.strike, trade.spotAtEntry, trade.quoteAsset ?? null)}</td><td>{formatQuantity(trade.quantity, { quantityScale: trade.quantityPrecision })}</td><td>{formatOptionPrice(trade.entryPremium, { priceScale: trade.pricePrecision }, trade.quoteAsset ?? null)}{trade.premiumDebitAtEntry !== undefined && <small>القسط والرسوم: {formatMoney(trade.premiumDebitAtEntry, 2, trade.premiumCurrencyAtEntry ?? null)}</small>}</td><td>{formatAssetPrice(trade.spotAtEntry, trade.spotAtEntry, trade.quoteAsset ?? null)}</td><td>{paperCloseEvents.some((event) => event.tradeId === trade.id) ? (getPaperCloseEventForTrade(trade) ? <span className="paper-status"><i /> مغلقة PAPER · {formatMoney(getPaperCloseEventForTrade(trade)!.netPnl, 2, getPaperCloseEventForTrade(trade)!.currency)}</span> : <span className="paper-status">حدث إغلاق غير متطابق · لا تعتمد النتيجة</span>) : <><span className="paper-status"><i /> مفتوحة PAPER</span><button className="button button-ghost" onClick={() => closePaperTrade(trade)} disabled={!paperCloseEventsReady || dataMode !== 'BINANCE' || paperCloseEventsLoad.persistenceBlocked || paperCloseEventsLoad.backupAvailable || paperJournalLoad.persistenceBlocked || paperJournalLoad.backupAvailable}>إغلاق بسعر Bid</button></>}</td></tr>)}</tbody></table></div>
                <div className="journal-mobile-list" role="list" aria-label="سجل الصفقات التجريبية">
                  {trades.map((trade) => <article className="journal-mobile-card" role="listitem" key={trade.id}>
                    <div className="journal-mobile-card-head">
                      <span><span className={`mini-type ${trade.type.toLowerCase()}`}>{trade.type}</span><strong dir="ltr">{trade.symbol}</strong>{trade.contractEconomics && <small>قسط ×{trade.premiumMultiplierAtEntry} · وحدة التسليم {trade.contractUnitAtEntry}</small>}</span>
                      <small>{formatDateTime(new Date(trade.createdAt))}</small>
                    </div>
                    <div className="journal-mobile-values">
                      <div><small>Strike</small><strong>{formatAssetPrice(trade.strike, trade.spotAtEntry, trade.quoteAsset ?? null)}</strong></div>
                      <div><small>الكمية</small><strong>{formatQuantity(trade.quantity, { quantityScale: trade.quantityPrecision })}</strong></div>
                      <div><small>قسط الدخول</small><strong>{formatOptionPrice(trade.entryPremium, { priceScale: trade.pricePrecision }, trade.quoteAsset ?? null)}</strong>{trade.premiumDebitAtEntry !== undefined && <small>القسط والرسوم: {formatMoney(trade.premiumDebitAtEntry, 2, trade.premiumCurrencyAtEntry ?? null)}</small>}</div>
                      <div><small>السعر المرجعي</small><strong>{formatAssetPrice(trade.spotAtEntry, trade.spotAtEntry, trade.quoteAsset ?? null)}</strong></div>
                    </div>
                    {paperCloseEvents.some((event) => event.tradeId === trade.id) ? (getPaperCloseEventForTrade(trade) ? <span className="paper-status"><i /> مغلقة PAPER · {formatMoney(getPaperCloseEventForTrade(trade)!.netPnl, 2, getPaperCloseEventForTrade(trade)!.currency)}</span> : <span className="paper-status">حدث إغلاق غير متطابق · لا تعتمد النتيجة</span>) : <><span className="paper-status"><i /> مفتوحة · PAPER ONLY</span><button className="button button-ghost" onClick={() => closePaperTrade(trade)} disabled={!paperCloseEventsReady || dataMode !== 'BINANCE' || paperCloseEventsLoad.persistenceBlocked || paperCloseEventsLoad.backupAvailable || paperJournalLoad.persistenceBlocked || paperJournalLoad.backupAvailable}>إغلاق بسعر Bid</button></>}
                  </article>)}
                </div>
              </> : <div className="journal-empty"><div className="journal-empty-icon"><BookOpen size={20} /></div><strong>لا توجد صفقات مسجلة بعد</strong><span>اختر عقداً من الماسح ثم أضفه إلى الدفتر. لن يتم إرسال أي أمر إلى أي منصة.</span><button className="text-button" onClick={() => navigate('scanner')}>ابدأ بتحليل عقد <ArrowUpLeft size={14} /></button></div>}
            </article>
          </section>

          <footer className="app-footer"><div><span className="footer-brand-mark">V</span><span>VOLTERRA <small>DECISION LAB</small></span></div><p>أداة تحليل تعليمية ومحاكاة — ليست نصيحة مالية، ولا تنفّذ أوامر تداول.</p><div className="footer-links"><button onClick={downloadCsvTemplate}>قالب البيانات</button><a href="https://www.fca.org.uk/" target="_blank" rel="noreferrer">FCA <ExternalLink size={11} /></a></div></footer>
        </div>
      </main>

      <div className="mobile-bottom-nav">
        {navItems.map((item) => <button key={item.id} className={activeView === item.id ? 'active' : ''} onClick={() => navigate(item.id)}>{item.icon}<span>{item.mobileLabel}</span></button>)}
      </div>

      {toast && <div className="toast-message"><span><Check size={15} /></span>{toast}<button onClick={() => setToast('')} aria-label="إغلاق"><X size={14} /></button></div>}
    </div>
  );
}

export default App;
