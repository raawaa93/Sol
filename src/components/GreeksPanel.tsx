import { Info } from 'lucide-react';
import { estimateGreekPnl } from '../lib/options';
import { formatSmallAmount, formatSmallNumber } from '../lib/format';
import type { OptionQuote } from '../lib/types';

type DataMode = 'DEMO' | 'CSV' | 'BINANCE';
type GreekKey = 'delta' | 'gamma' | 'theta' | 'vega' | 'rho';

export interface GreeksPanelProps {
  quote: OptionQuote;
  quantity: number;
  dataMode: DataMode;
}

function greekSource(key: GreekKey, quote: OptionQuote, dataMode: DataMode): string {
  if (dataMode === 'DEMO') return 'Black–Scholes · محاكاة';
  if (quote.estimatedFields?.includes(key)) return 'مقدّر بالنموذج';
  return dataMode === 'BINANCE' ? 'قيمة المصدر · دون تحقق مستقل' : 'قيمة ملف CSV · تحقق من الوحدة';
}

export default function GreeksPanel({ quote, quantity, dataMode }: GreeksPanelProps) {
  const positionUnits = Math.max(0, Number.isFinite(quantity) ? quantity : 0) * quote.unit;
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
      positionUnit: 'USDT تقريباً لكل +1 USDT في Spot', amount: true,
      meaning: 'تغير محلي تقريبي في علاوة الخيار مع حركة الأصل بوحدة واحدة.',
    },
    {
      key: 'gamma', label: 'Gamma', symbol: 'Γ', value: quote.gamma,
      positionValue: quote.gamma * positionUnits,
      positionUnit: 'تغير Delta لكل +1 USDT في Spot', amount: false,
      meaning: 'سرعة تغير Delta؛ حد تقوس من الدرجة الثانية في صدمة السعر.',
    },
    {
      key: 'theta', label: 'Theta', symbol: 'Θ', value: quote.theta,
      positionValue: quote.theta * positionUnits,
      positionUnit: 'USDT تقريباً لكل يوم تقويمي', amount: true,
      meaning: 'أثر مرور يوم واحد مع ثبات السعر والتقلب والمدخلات الأخرى.',
    },
    {
      key: 'vega', label: 'Vega', symbol: 'ν', value: quote.vega,
      positionValue: quote.vega * positionUnits,
      positionUnit: 'USDT تقريباً لكل +1 نقطة IV', amount: true,
      meaning: 'أثر رفع IV نقطة مئوية مطلقة؛ مثلاً 50% إلى 51%.',
    },
    {
      key: 'rho', label: 'Rho', symbol: 'ρ', value: quote.rho,
      positionValue: quote.rho * positionUnits,
      positionUnit: 'USDT تقريباً لكل +1 نقطة مئوية في المعدل', amount: true,
      meaning: 'أثر رفع معدل الفائدة السنوي نقطة مئوية؛ مثلاً 2% إلى 3%.',
    },
  ];
  const scenarios = [
    { label: 'Spot +1%', detail: 'Δ + ½Γ محلياً', shock: { spotMovePercent: 1 } },
    { label: 'Spot −1%', detail: 'Δ + ½Γ محلياً', shock: { spotMovePercent: -1 } },
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
          <p>الوحدات أدناه لكل عقد، ثم الحساسية التقريبية للمركز الحالي ({formatSmallNumber(quantity)} × {formatSmallNumber(quote.unit)} وحدة).</p>
        </div>
        <span className="greek-assumption"><Info size={13} /> تغيرات محلية لا توقعات</span>
      </div>

      <article className="panel greeks-panel">
        <div className="greeks-table-wrap">
          <table className="greeks-table">
            <thead><tr><th>Greek</th><th>القيمة لكل عقد / وحدة</th><th>حساسية الكمية الحالية</th><th>المصدر</th></tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row.key}>
                <td><strong><span>{row.symbol}</span>{row.label}</strong><small>{row.meaning}</small></td>
                <td className="greek-number" dir="ltr">{formatSmallNumber(row.value)}</td>
                <td className="greek-position"><strong dir="ltr">{row.amount ? formatSmallAmount(row.positionValue) : formatSmallNumber(row.positionValue)}</strong><small>{row.positionUnit}</small></td>
                <td><span className={`greek-origin ${quote.estimatedFields?.includes(row.key) || dataMode === 'DEMO' ? 'estimated' : ''}`}>{greekSource(row.key, quote, dataMode)}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>

        <div className="greek-shock-heading"><div><strong>اختبار صدمات صغيرة</strong><span>تقدير P&amp;L للمركز الحالي، قبل الرسوم والانزلاق</span></div><span>USDT</span></div>
        <div className="greek-shock-grid">
          {scenarios.map((scenario) => (
            <div className="greek-shock-card" key={scenario.label}>
              <span>{scenario.label}</span>
              <strong dir="ltr">{formatSmallAmount(estimateGreekPnl(quote, quantity, scenario.shock))}</strong>
              <small>{scenario.detail}</small>
            </div>
          ))}
        </div>
        <div className="greeks-footnote"><Info size={14} /><span>ΔP تقريب محلي: Delta·ΔSpot + ½Gamma·ΔSpot² + Vega·ΔIV + Theta·الأيام + Rho·Δالفائدة، مضروباً في الكمية ووحدة العقد. يفترض ثبات العوامل الأخرى ويهمل Vanna/Charm والتفاعلات والابتسامة والتقلب المحقق والرسوم والتنفيذ؛ لا تجمعه مع سيناريو الانتهاء كأنه توقع. {dataMode === 'BINANCE' ? 'Delta قد يأتي من Binance، أما Gamma/Theta/Vega/Rho فتحسب بنموذج Black–Scholes؛ ووحدة معدل الفائدة تحتاج تحققاً.' : dataMode === 'CSV' ? 'وحدات Greeks الواردة في CSV يجب أن تتبع القالب؛ الحقول الناقصة مقدّرة.' : 'كل مدخلات Demo والأسعار اصطناعية، والـGreeks محسوبة بنموذج Black–Scholes.'}</span></div>
      </article>
    </section>
  );
}
