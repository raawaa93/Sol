import { ArrowUpLeft, Info, ShieldAlert } from 'lucide-react';
import { getComparableDeltaSkew, getIvRvSpread, getReviewCandidates, getTermStructureContext } from '../lib/analysis';
import { getSpreadPct } from '../lib/options';
import { formatAssetPrice, formatSmallNumber } from '../lib/format';
import type { AssetSnapshot, OptionQuote, Underlying } from '../lib/types';

type DataMode = 'DEMO' | 'CSV' | 'BINANCE';

export interface OpportunityReviewProps {
  quotes: OptionQuote[];
  market: AssetSnapshot | null;
  underlying: Underlying;
  dataMode: DataMode;
  onReviewQuote: (quote: OptionQuote) => void;
}

function formatPercent(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '—' : `${(value * 100).toFixed(digits)}%`;
}

function formatVolPoints(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'غير متاح';
  return `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)} نقطة`;
}

function getDataNote(mode: DataMode): string {
  if (mode === 'DEMO') return 'بيانات اصطناعية للتجربة فقط';
  return mode === 'BINANCE' ? 'لقطة Binance REST · قد تختلف أوقات الحقول' : 'قيم الملف المستورد · تحقق من وقت المصدر والوحدات';
}

function MetricCard({ title, value, detail, note, tone = 'neutral' }: {
  title: string;
  value: string;
  detail: string;
  note: string;
  tone?: 'neutral' | 'positive' | 'negative' | 'accent';
}) {
  return (
    <article className={`panel opportunity-metric opportunity-${tone}`}>
      <div className="opportunity-metric-heading"><span>{title}</span><Info size={13} /></div>
      <strong className="opportunity-value">{value}</strong>
      <span className="opportunity-detail">{detail}</span>
      <small>{note}</small>
    </article>
  );
}

function getSpreadClass(spread: number): string {
  if (!Number.isFinite(spread)) return 'unknown';
  return spread > 10 ? 'wide' : spread > 4 ? 'medium' : 'tight';
}

function formatEstimatedFields(fields: string[] | undefined): string {
  const labels: Record<string, string> = {
    iv: 'IV', markPrice: 'السعر المرجعي', delta: 'Delta', gamma: 'Gamma',
    theta: 'Theta', vega: 'Vega', rho: 'Rho', unit: 'وحدة العقد',
    riskFreeRate: 'معدل الفائدة', daysToExpiry: 'المدة حتى الانتهاء',
  };
  return [...new Set(fields ?? [])].map((field) => labels[field] ?? field).join('، ');
}

export default function OpportunityReview({ quotes, market, underlying, dataMode, onReviewQuote }: OpportunityReviewProps) {
  const ivRvSpread = getIvRvSpread(market);
  const skew = getComparableDeltaSkew(quotes);
  const term = getTermStructureContext(quotes);
  const candidates = getReviewCandidates(quotes);
  const ivRvDetail = market?.iv30 !== null && market?.iv30 !== undefined && market?.rv30 !== null && market?.rv30 !== undefined
    ? `IV30 ${formatPercent(market.iv30)} · RV30 ${formatPercent(market.rv30)}`
    : 'تحتاج المقارنة IV وبيانات سعر تاريخية متوافقة';
  const skewDetail = skew
    ? `Put IV ${formatPercent(skew.putIv)} · Call IV ${formatPercent(skew.callIv)} · |Δ| ${skew.putAbsDelta.toFixed(2)}/${skew.callAbsDelta.toFixed(2)}`
    : 'يلزم وجود جناحي Put وCall ببيانات Delta قابلة للمقارنة';
  const termDetail = term
    ? [term.front, term.near, term.back]
      .filter((point, index, list) => point && list.findIndex((candidate) => candidate?.expiry === point.expiry) === index)
      .map((point) => `${Math.round(point!.daysToExpiry)}d ${formatPercent(point!.iv)}`)
      .join(' · ')
    : 'لا تتوفر استحقاقات كافية لبناء منحنى تقلب';

  return (
    <section className="section-anchor opportunity-section" id="opportunities" aria-labelledby="opportunities-heading">
      <div className="section-title-row">
        <div>
          <span className="section-kicker">CONTEXT &amp; LIQUIDITY</span>
          <h2 id="opportunities-heading">تحليل السوق وفرص تستحق المراجعة</h2>
          <p>مقارنة IV وRV، الأجنحة، الاستحقاقات، وجودة التسعير — بلا توصية اتجاهية.</p>
        </div>
        <span className="opportunity-source"><i />{getDataNote(dataMode)}</span>
      </div>

      <div className="opportunity-grid">
        <MetricCard
          title="IV − RV · 30 يوم"
          value={formatVolPoints(ivRvSpread)}
          detail={ivRvDetail}
          note={ivRvSpread === null ? 'لا يخترع المختبر تقلباً محققاً عند غياب التاريخ.' : 'فرق وصفي، وليس توقعاً للعائد أو إشارة بيع/شراء.'}
          tone={ivRvSpread === null ? 'neutral' : 'accent'}
        />
        <MetricCard
          title="انحراف الجناحين · 25Δ تقريباً"
          value={skew ? formatVolPoints(skew.putMinusCallIv) : 'غير متاح'}
          detail={skewDetail}
          note="Put IV − Call IV عند Delta مطلقة متقاربة وفي الاستحقاق نفسه؛ ليست استراتيجية تداول بحد ذاتها."
          tone={skew && skew.putMinusCallIv > 0 ? 'accent' : 'neutral'}
        />
        <MetricCard
          title="بنية الأجل · ATM IV"
          value={term ? `${Math.round(term.near.daysToExpiry)}d · ${formatPercent(term.near.iv)}` : 'غير متاح'}
          detail={termDetail}
          note="وسيط IV قرب Spot لكل استحقاق؛ المنحنى يصف الأسعار الحالية ولا يتنبأ بها."
          tone="neutral"
        />
      </div>

      <div className="panel opportunity-watchlist">
        <div className="watchlist-heading">
          <div><span className="section-kicker">REVIEW QUEUE · {underlying}</span><h3>عقود للتمحيص، لا للشراء التلقائي</h3></div>
          <span>{candidates.length ? `${candidates.length} عقود ثنائية الجانب` : 'لا توجد عروض مكتملة'}</span>
        </div>
        <p className="watchlist-method">يفضّل الماسح استحقاق 20–40 يوماً و|Delta| بين 0.25 و0.75 إن توفرا، ثم يرتب وفق ضيق Bid/Ask، فالفائدة المفتوحة والحجم. هذا ترتيب أولي لا يدخل عمق دفتر الأوامر ولا يحسب ربحاً متوقعاً؛ افتح عقد Binance لمراجعة لقطة أفضل 20 مستوى والحجم الظاهر قبل الحكم على قابلية التنفيذ.</p>
        {candidates.length ? <div className="review-candidate-grid">
          {candidates.map((quote) => {
            const spread = getSpreadPct(quote);
            const spreadClass = getSpreadClass(spread);
            const estimated = quote.estimatedFields?.length
              ? formatEstimatedFields(quote.estimatedFields.slice(0, 4))
              : '';
            return (
              <button key={quote.id} className="review-candidate" onClick={() => onReviewQuote(quote)}>
                <span className="review-candidate-top">
                  <span className={`mini-type ${quote.type.toLowerCase()}`}>{quote.type}</span>
                  <span className={`review-spread ${spreadClass}`}>Spread {spread.toFixed(1)}%</span>
                  <ArrowUpLeft size={14} />
                </span>
                <strong className="review-symbol">{quote.symbol}</strong>
                <span className="review-contract-meta">{formatAssetPrice(quote.strike, quote.spot)} · {Math.round(quote.daysToExpiry)} يوم · Δ {quote.delta.toFixed(2)}</span>
                <span className="review-market-meta">IV {formatPercent(quote.iv)} · OI {quote.openInterest === null ? '—' : formatSmallNumber(quote.openInterest)} · حجم {quote.volume === null ? '—' : formatSmallNumber(quote.volume)}</span>
                {estimated && <small className="review-estimated">حقول تقديرية: {estimated}</small>}
                <span className="review-open">افتح العقد في الماسح</span>
              </button>
            );
          })}
        </div> : <div className="opportunity-empty"><strong>لا توجد أسعار Bid وAsk سليمة للترتيب</strong><span>استورد سلسلة مكتملة أو حمّل لقطة سوق أخرى؛ لم نصنع فارقاً سعرياً بديلاً.</span></div>}
        <div className="watchlist-caution"><ShieldAlert size={14} /><span>الفارق الضيق أو OI/الحجم الأعلى لا يضمنان التنفيذ أو جودة السعر. افحص عمر البيانات والوحدة والرسوم والانزلاق، ثم اختبر الخسارة المحتملة قبل أي قرار.</span></div>
      </div>
    </section>
  );
}
