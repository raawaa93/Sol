import { Info, RefreshCw } from 'lucide-react';
import { estimateBookFill } from '../lib/market-depth';
import { formatOptionPrice, formatQuantity, formatSmallNumber } from '../lib/format';
import type { BinanceDepthLevel, BinanceDepthSnapshot } from '../lib/binance';
import type { OptionQuote } from '../lib/types';

export interface MarketDepthPanelProps {
  quote: OptionQuote;
  quantity: number;
  depth: BinanceDepthSnapshot | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
}

function formatAge(timestamp: number): string {
  const ageMs = Date.now() - timestamp;
  if (!Number.isFinite(ageMs) || ageMs < -5 * 60_000) return 'وقت المصدر غير صالح';
  const seconds = Math.max(0, Math.floor(ageMs / 1000));
  return seconds < 60 ? `منذ ${seconds} ث` : `منذ ${Math.floor(seconds / 60)} د`;
}

function DepthSide({ label, levels, side, quote }: {
  label: string;
  levels: BinanceDepthLevel[];
  side: 'bid' | 'ask';
  quote: OptionQuote;
}) {
  const shown = levels.slice(0, 5);
  let cumulative = 0;
  return (
    <div className={`depth-side depth-${side}`}>
      <h4>{label}</h4>
      {shown.length ? <div className="depth-level-list">
        <div className="depth-level-row depth-level-label"><span>السعر</span><span>الكمية</span><span>تراكمية</span></div>
        {shown.map((level, index) => {
          cumulative += level.quantity;
          return <div className="depth-level-row" key={`${level.price}-${index}`}>
            <span dir="ltr">{formatOptionPrice(level.price, quote)}</span>
            <span dir="ltr">{formatQuantity(level.quantity, quote)}</span>
            <span dir="ltr">{formatQuantity(cumulative, quote)}</span>
          </div>;
        })}
      </div> : <p className="depth-empty">لا توجد مستويات منشورة لهذا الجانب.</p>}
    </div>
  );
}

export default function MarketDepthPanel({ quote, quantity, depth, loading, error, onRefresh }: MarketDepthPanelProps) {
  const bestBid = depth?.bids[0];
  const bestAsk = depth?.asks[0];
  const spreadPct = bestBid && bestAsk && bestAsk.price >= bestBid.price
    ? ((bestAsk.price - bestBid.price) / ((bestAsk.price + bestBid.price) / 2)) * 100
    : Number.NaN;
  const buyEstimate = depth ? estimateBookFill(depth.asks, quantity) : null;
  const sellEstimate = depth ? estimateBookFill(depth.bids, quantity) : null;
  const timestamp = depth?.transactionTime ?? depth?.fetchedAt;

  return (
    <section className="market-depth-panel" aria-labelledby="market-depth-heading">
      <div className="depth-panel-header">
        <div>
          <span className="section-kicker">SELECTED CONTRACT · BOOK SNAPSHOT</span>
          <h3 id="market-depth-heading">عمق السوق للعقد المحدد</h3>
        </div>
        <button className="depth-refresh" type="button" onClick={onRefresh} disabled={loading} aria-label="تحديث عمق السوق">
          <RefreshCw className={loading ? 'spin' : ''} size={14} />
          <span>{loading ? 'جارٍ التحديث' : 'تحديث العمق'}</span>
        </button>
      </div>

      {loading && <p className="depth-status" role="status">جارٍ جلب أفضل 20 مستوى من Binance…</p>}
      {error && <p className="depth-error" role="alert">تعذّر تحميل دفتر العمق: {error}</p>}
      {!loading && !error && !depth && <p className="depth-status">حمّل Binance لعرض دفتر العمق لهذا العقد فقط.</p>}

      {depth && <>
        <div className="depth-snapshot-note">
          <Info size={14} />
          <span>لقطة REST {depth.transactionTime !== undefined ? '· وقت المعاملة من المصدر' : '· وقت الاستلام محلياً'} · {timestamp === undefined ? 'العمر غير متاح' : formatAge(timestamp)} · ليست بثاً ولا ضماناً للتنفيذ.</span>
        </div>
        <div className="depth-summary-grid">
          <div><span>Spread من دفتر العمق</span><strong>{Number.isFinite(spreadPct) ? `${spreadPct.toFixed(2)}%` : 'غير متاح'}</strong></div>
          <div><span>أفضل Bid × كمية</span><strong dir="ltr">{bestBid ? `${formatOptionPrice(bestBid.price, quote)} × ${formatQuantity(bestBid.quantity, quote)}` : '—'}</strong></div>
          <div><span>أفضل Ask × كمية</span><strong dir="ltr">{bestAsk ? `${formatOptionPrice(bestAsk.price, quote)} × ${formatQuantity(bestAsk.quantity, quote)}` : '—'}</strong></div>
        </div>
        <div className="depth-book-grid">
          <DepthSide label="Ask · شراء الخيار" levels={depth.asks} side="ask" quote={quote} />
          <DepthSide label="Bid · بيع الخيار" levels={depth.bids} side="bid" quote={quote} />
        </div>
        <div className="depth-fill-grid">
          <div className="depth-fill-card">
            <span>شراء الكمية الحالية · {formatSmallNumber(quantity)} عقد</span>
            <strong>{buyEstimate?.complete && buyEstimate.averagePrice !== undefined
              ? `${formatOptionPrice(buyEstimate.averagePrice, quote)} متوسط مرجح`
              : `المتاح ${formatQuantity(buyEstimate?.visibleQuantity ?? 0, quote)} من ${formatQuantity(quantity, quote)}`}</strong>
            <small>{buyEstimate?.complete && buyEstimate.slippageFromBestPct !== undefined
              ? `انزلاق الدفتر النظري ${buyEstimate.slippageFromBestPct >= 0 ? '+' : ''}${buyEstimate.slippageFromBestPct.toFixed(2)}% من أفضل Ask`
              : 'الكمية المطلوبة لا تغطيها المستويات المعروضة؛ لا نقدّر سعراً للجزء غير المرئي.'}</small>
          </div>
          <div className="depth-fill-card">
            <span>بيع الكمية الحالية · {formatSmallNumber(quantity)} عقد</span>
            <strong>{sellEstimate?.complete && sellEstimate.averagePrice !== undefined
              ? `${formatOptionPrice(sellEstimate.averagePrice, quote)} متوسط مرجح`
              : `المتاح ${formatQuantity(sellEstimate?.visibleQuantity ?? 0, quote)} من ${formatQuantity(quantity, quote)}`}</strong>
            <small>{sellEstimate?.complete && sellEstimate.slippageFromBestPct !== undefined
              ? `أثر الدفتر النظري ${sellEstimate.slippageFromBestPct >= 0 ? '+' : ''}${sellEstimate.slippageFromBestPct.toFixed(2)}% من أفضل Bid`
              : 'الكمية المطلوبة لا تغطيها المستويات المعروضة؛ لا نقدّر سعراً للجزء غير المرئي.'}</small>
          </div>
        </div>
        <p className="depth-caveat">الحساب يستهلك الكميات الظاهرة في لقطة 20 مستوى فقط، ويفترض ثباتها أثناء التنفيذ؛ لا يشمل الرسوم أو التأخير أو تغير الدفتر. الكمية معروضة بوحدة Binance، ووحدة العقد تظل لازمة لتحويل القيمة النقدية.</p>
      </>}
    </section>
  );
}
