import { Info } from 'lucide-react';
import { estimateGreekPnl } from '../lib/options';
import { getContractScaleIssue, getContractScaleIssueMessage, hasLegacyScalarAnalyticsCapability, hasCanonicalBinanceModelGreekCapability } from '../lib/contract-scale';
import { formatSmallAmount, formatSmallNumber, getQuoteCurrency } from '../lib/format';
import type { OptionQuote } from '../lib/types';

type DataMode = 'DEMO' | 'CSV' | 'BINANCE';
type GreekKey = 'delta' | 'gamma' | 'theta' | 'vega' | 'rho';

export interface GreeksPanelProps {
  quote: OptionQuote;
  quantity: number;
  dataMode: DataMode;
}

function greekSource(key: GreekKey, quote: OptionQuote, dataMode: DataMode): string {
  if (quote.pricingStatus === 'OBSERVED_ONLY') return 'غير متاح · لا يوجد نموذج موثّق';
  if (quote.pricingStatus === 'ASSUMED') return `نموذج ${quote.pricingModel === 'BLACK_76' ? 'Black–76' : 'Black–Scholes مع Carry'} · افتراضات معلنة`;
  if (quote.pricingStatus === 'SUPPORTED') return quote.pricingModel === 'BLACK_76' ? 'Black–76 · نموذج العقود الآجلة' : 'Black–Scholes مع Carry';
  if (dataMode === 'DEMO') return 'Black–Scholes · محاكاة';
  if (quote.estimatedFields?.includes(key)) return 'مقدّر بالنموذج';
  return dataMode === 'BINANCE' ? 'قيمة المصدر · دون تحقق مستقل' : 'قيمة ملف CSV · تحقق من الوحدة';
}

export default function GreeksPanel({ quote, quantity, dataMode }: GreeksPanelProps) {
  const hasCanonicalModelGreeks = hasCanonicalBinanceModelGreekCapability(quote, dataMode);
  const scaleIssue = hasCanonicalModelGreeks ? undefined : getContractScaleIssue(quote, dataMode);
  const hasExplicitConsistentContractScale = hasLegacyScalarAnalyticsCapability(quote, dataMode) || hasCanonicalModelGreeks;
  const scaleIssueMessage = scaleIssue ? getContractScaleIssueMessage(scaleIssue) : '';
  const positionUnits = hasExplicitConsistentContractScale ? Math.max(0, Number.isFinite(quantity) ? quantity : 0) * quote.unit : 0;
  const pricingStatus = quote.pricingStatus ?? (dataMode === 'DEMO' ? 'ASSUMED' : 'OBSERVED_ONLY');
  const modelAvailable = pricingStatus !== 'OBSERVED_ONLY' && (!quote.contractEconomics || hasCanonicalModelGreeks);
  const underlyingMoveLabel = quote.underlyingKind === 'FUTURE' ? 'Forward' : 'السعر المرجعي';
  const modelName = quote.pricingModel === 'BLACK_76' ? 'Black–76' : 'Black–Scholes مع Carry';
  const quoteCurrency = getQuoteCurrency(quote);
  const currencyLabel = quoteCurrency ?? 'عملة التسعير غير محددة';
  const rows: Array<{
    key: GreekKey;
    label: string;
    symbol: string;
    value: number;
    positionValue: number;
    positionUnit: string;
    amount: boolean;
    meaning: string;
  }> = [
    {
      key: 'delta', label: 'Delta', symbol: 'Δ', value: quote.delta,
      positionValue: quote.delta * positionUnits,
      positionUnit: `${currencyLabel} تقريباً لكل +1 في ${underlyingMoveLabel}`, amount: true,
      meaning: 'تغير محلي تقريبي في علاوة الخيار مع حركة الأصل بوحدة واحدة.',
    },
    {
      key: 'gamma', label: 'Gamma', symbol: 'Γ', value: quote.gamma,
      positionValue: quote.gamma * positionUnits,
      positionUnit: `تغير Delta لكل +1 في ${underlyingMoveLabel}`, amount: false,
      meaning: 'سرعة تغير Delta؛ حد تقوس من الدرجة الثانية في صدمة السعر.',
    },
    {
      key: 'theta', label: 'Theta', symbol: 'Θ', value: quote.theta,
      positionValue: quote.theta * positionUnits,
      positionUnit: `${currencyLabel} تقريباً لكل يوم تقويمي`, amount: true,
      meaning: 'أثر مرور يوم واحد مع ثبات السعر والتقلب والمدخلات الأخرى.',
    },
    {
      key: 'vega', label: 'Vega', symbol: 'ν', value: quote.vega,
      positionValue: quote.vega * positionUnits,
      positionUnit: `${currencyLabel} تقريباً لكل +1 نقطة IV`, amount: true,
      meaning: 'أثر رفع IV نقطة مئوية مطلقة؛ مثلاً 50% إلى 51%.',
    },
    {
      key: 'rho', label: 'Rho', symbol: 'ρ', value: quote.rho,
      positionValue: quote.rho * positionUnits,
      positionUnit: `${currencyLabel} تقريباً لكل +1 نقطة مئوية في المعدل`, amount: true,
      meaning: 'أثر رفع معدل الفائدة السنوي نقطة مئوية؛ مثلاً 2% إلى 3%.',
    },
  ];
  const scenarios = [
    { label: `${underlyingMoveLabel} +1%`, detail: 'Δ + ½Γ محلياً', shock: { spotMovePercent: 1 } },
    { label: `${underlyingMoveLabel} −1%`, detail: 'Δ + ½Γ محلياً', shock: { spotMovePercent: -1 } },
    { label: 'IV +1 نقطة', detail: 'Vega فقط', shock: { volatilityMovePoints: 1 } },
    { label: 'مرور يوم', detail: 'Theta فقط', shock: { daysElapsed: 1 } },
    { label: 'معدل +1 نقطة', detail: 'Rho فقط', shock: { riskFreeRateMovePoints: 1 } },
  ];

  return (
    <section className="section-anchor greeks-section" id="greeks" aria-labelledby="greeks-heading">
      <div className="section-title-row">
        <div>
          <span className="section-kicker">GREEK EXPOSURE · {quote.symbol}</span>
          <h2 id="greeks-heading">Greeks مفصّلة وحساسية الكمية</h2>
          <p>القيم أدناه لكل وحدة مرجعية؛ حساسية المركز لا تظهر إلا عندما يكون مقياس العقد متحققاً.</p>
        </div>
        <span className="greek-assumption"><Info size={13} /> تغيرات محلية لا توقعات</span>
      </div>

      <article className="panel greeks-panel">
        {pricingStatus === 'OBSERVED_ONLY' && <div className="greeks-footnote"><Info size={14} /><span>تتوفر بيانات السوق وIV، لكن مواصفات هذا العقد لا تسمح حالياً بحساب Greeks موثوقة. لن نستخدم أصفاراً مصطنعة أو نموذج Spot بديل. {quote.pricingReason ?? 'أدخل مواصفات عقد كاملة أو بيانات Greeks موثقة.'}</span></div>}
        {pricingStatus === 'ASSUMED' && <div className="greeks-footnote"><Info size={14} /><span>القيم التالية محسوبة بنموذج {modelName} مع افتراضات غير مرصودة بالكامل. {quote.pricingReason ?? 'تحقق من معدل الفائدة والـcarry ومواصفات التسوية قبل الاعتماد عليها.'}</span></div>}
        {hasCanonicalModelGreeks && <div className="greeks-footnote"><Info size={14} /><span>تم التحقق من محوّل Binance النقدي: markIV من لقطة REST حديثة، ومعدل الفائدة ومؤشر التسوية بمدخلات مؤرخة؛ قيم Greeks لكل وحدة من الأصل الأساسي، وحساسية المركز مجمّعة باستخدام كمية العقد الموثقة. شروط RIE/RCH غير مؤكدة الانطباق على حسابك؛ Carry مفترض عند 0%، والقيم ناتج نموذج لا توقع أو قيم Greeks مرصودة.</span></div>}
        {quote.contractEconomics && !hasCanonicalModelGreeks && <div className="greeks-footnote"><Info size={14} /><span>مواصفات العقد موثّقة، لكن هذه اللقطة لا تستوفي شروط الحداثة: markIV من لقطة REST المستلمة حديثاً، ومعدل فائدة ومؤشر تسوية بتوقيت صالح. لا نستخدم حقل vo أو بيانات 24 ساعة بديلاً عن markIV، ونحجب قيم النموذج وحساسية المركز معاً حتى تكتمل المصادر.</span></div>}
        {scaleIssue && <div className="greeks-footnote"><Info size={14} /><span>{scaleIssueMessage} ستبقى Greeks لكل وحدة مرجعية ظاهرة عند توفر النموذج، لكننا نحجب حساسية المركز المجمعة.</span></div>}
        <div className="greeks-table-wrap">
          <table className="greeks-table">
            <thead><tr><th>Greek</th><th>القيمة لكل وحدة مرجعية</th><th>حساسية الكمية الحالية</th><th>المصدر</th></tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row.key}>
                <td><strong><span>{row.symbol}</span>{row.label}</strong><small>{row.meaning}</small></td>
                <td className="greek-number" dir="ltr">{modelAvailable ? formatSmallNumber(row.value) : '—'}</td>
                <td className="greek-position"><strong dir="ltr">{modelAvailable && hasExplicitConsistentContractScale ? (row.amount ? formatSmallAmount(row.positionValue, quoteCurrency ?? null) : formatSmallNumber(row.positionValue)) : '—'}</strong><small>{row.positionUnit}</small></td>
                <td><span className={`greek-origin ${quote.estimatedFields?.includes(row.key) || pricingStatus === 'ASSUMED' || dataMode === 'DEMO' ? 'estimated' : ''}`}>{greekSource(row.key, quote, dataMode)}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="greeks-mobile-list" role="list" aria-label="حساسية Greeks">
          {rows.map((row) => (
            <div className="greeks-mobile-card" role="listitem" key={row.key}>
              <div className="greeks-mobile-card-head">
                <strong><span>{row.symbol}</span>{row.label}</strong>
                <span className={`greek-origin ${quote.estimatedFields?.includes(row.key) || pricingStatus === 'ASSUMED' || dataMode === 'DEMO' ? 'estimated' : ''}`}>{greekSource(row.key, quote, dataMode)}</span>
              </div>
              <div className="greeks-mobile-values">
                <div><small>القيمة لكل وحدة مرجعية</small><strong dir="ltr">{modelAvailable ? formatSmallNumber(row.value) : '—'}</strong></div>
                <div><small>حساسية الكمية الحالية</small><strong dir="ltr">{modelAvailable && hasExplicitConsistentContractScale ? (row.amount ? formatSmallAmount(row.positionValue, quoteCurrency ?? null) : formatSmallNumber(row.positionValue)) : '—'}</strong></div>
              </div>
              <p>{row.meaning}</p>
              <small className="greeks-mobile-unit">{row.positionUnit}</small>
            </div>
          ))}
        </div>

        {modelAvailable && hasExplicitConsistentContractScale ? <>
          <div className="greek-shock-heading"><div><strong>اختبار صدمات صغيرة</strong><span>تقدير P&amp;L للمركز الحالي، قبل الرسوم والانزلاق</span></div><span>{currencyLabel}</span></div>
          <div className="greek-shock-grid">
            {scenarios.map((scenario) => (
              <div className="greek-shock-card" key={scenario.label}>
                <span>{scenario.label}</span>
                <strong dir="ltr">{formatSmallAmount(estimateGreekPnl(quote, quantity, scenario.shock), quoteCurrency ?? null)}</strong>
                <small>{scenario.detail}</small>
              </div>
            ))}
          </div>
          <div className="greeks-footnote"><Info size={14} /><span>ΔP تقريب محلي: Delta·Δ{underlyingMoveLabel} + ½Gamma·Δ{underlyingMoveLabel}² + Vega·ΔIV + Theta·الأيام + Rho·Δالفائدة، مضروباً في الكمية ووحدة العقد. يفترض ثبات العوامل الأخرى ويهمل Vanna/Charm والتفاعلات والابتسامة والتقلب المحقق والرسوم والتنفيذ؛ لا تجمعه مع سيناريو الانتهاء كأنه توقع.</span></div>
        </> : null}
        {quote.unverifiedSourceGreeks && <details className="source-greek-raw">
          <summary>قيم Greeks الخام من المصدر لأغراض التدقيق فقط</summary>
          <p>لا تدخل هذه القيم في حساب الحساسية. يحتفظ بها المختبر كما وردت؛ لم تُطبع وحداتها أو تُثبت مقابل مضاعف كل عقد.</p>
          <div className="source-greek-values" dir="ltr">
            {(['delta', 'gamma', 'theta', 'vega'] as const).map((key) => {
              const raw = quote.unverifiedSourceGreeks?.[key];
              return <span key={key}><small>{key}</small><strong>{raw === undefined ? '—' : formatSmallNumber(raw)}</strong></span>;
            })}
          </div>
        </details>}
      </article>
    </section>
  );
}
