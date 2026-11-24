import { ChevronDown } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatAssetPrice, getFormatter, getQuoteCurrency } from '../lib/format';
import { getUnderlyingReferencePrice } from '../lib/options';
import type { OptionQuote, OptionSide } from '../lib/types';

const numberFormat = getFormatter(2, 0);


interface SmilePoint {
  strike: number;
  iv: number;
}

interface TermPoint {
  expiry: string;
  days: number;
  iv: number;
}

export interface VolatilityChartsProps {
  smileData: SmilePoint[];
  termData: TermPoint[];
  underlying: string;
  selectedQuote: OptionQuote;
  selectedType: OptionSide;
}

function ChartEmptyState({ title, note }: { title: string; note: string }) {
  return <div className="empty-state"><strong>{title}</strong><span>{note}</span></div>;
}

export default function VolatilityCharts({ smileData, termData, underlying, selectedQuote, selectedType }: VolatilityChartsProps) {
  const referencePrice = getUnderlyingReferencePrice(selectedQuote);
  const quoteCurrency = getQuoteCurrency(selectedQuote) ?? null;
  return (
    <>
      <article className="panel chart-panel">
        <div className="panel-heading"><div><span className="section-kicker">VOLATILITY STRUCTURE</span><h2>ابتسامة التقلب</h2><p>IV غير المعلّم كتقديري حسب سعر التنفيذ · 20–40 يوماً</p></div><div className="chart-select"><span className="chart-legend-dot" />{selectedType === 'CALL' ? 'Calls' : 'Puts'}<ChevronDown size={13} /></div></div>
        {smileData.length ? <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={smileData} margin={{ top: 10, right: 8, left: -18, bottom: 2 }}>
              <defs><linearGradient id="ivFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b6f36e" stopOpacity={0.22} /><stop offset="100%" stopColor="#b6f36e" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid stroke="#222b31" strokeDasharray="3 5" vertical={false} />
              <XAxis dataKey="strike" tickFormatter={(value) => Number(value) >= 10_000 ? `${numberFormat.format(Number(value) / 1000)}k` : formatAssetPrice(Number(value), referencePrice, null)} tick={{ fill: '#78838a', fontSize: 10 }} axisLine={{ stroke: '#283137' }} tickLine={false} />
              <YAxis tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`} tick={{ fill: '#78838a', fontSize: 10 }} axisLine={false} tickLine={false} domain={['dataMin - 0.04', 'dataMax + 0.04']} />
              <Tooltip contentStyle={{ background: '#11171b', border: '1px solid #2b353b', borderRadius: 10, color: '#e7ede8', fontSize: 12 }} formatter={(value) => [`${(Number(value) * 100).toFixed(2)}%`, 'IV']} labelFormatter={(value) => `Strike: ${formatAssetPrice(Number(value), referencePrice, quoteCurrency)}`} />
              <Area type="monotone" dataKey="iv" stroke="#b6f36e" strokeWidth={2.2} fill="url(#ivFill)" activeDot={{ r: 4, fill: '#d2ff92', stroke: '#182012', strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div> : <ChartEmptyState title="لا تتوفر سلسلة كافية" note="تتطلب الرسمة IV غير معلّم كتقديري وسعر تنفيذ صالحاً." />}
        <div className="chart-footnote"><span>سعر التنفيذ · {quoteCurrency ?? 'عملة غير محددة'} لكل {underlying}</span><span>تُستبعد قيم IV المعلّمة كتقديرية</span></div>
      </article>

      <article className="panel chart-panel term-panel">
        <div className="panel-heading"><div><span className="section-kicker">TERM STRUCTURE</span><h2>منحنى الانتهاء</h2><p>IV ومدة انتهاء غير مقدّرين لأقرب عقد إلى السعر المرجعي</p></div><div className="chart-legend"><span className="chart-legend-dot blue" />ATM IV</div></div>
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
        </div> : <ChartEmptyState title="لا تتوفر قيم IV صالحة" note="لا تُرسم القيم المقدّرة؛ يلزم IV غير معلّم كتقديري قرب السعر المرجعي." />}
        <div className="chart-footnote"><span>المدة حتى الانتهاء</span><span>تُستبعد IV والمدة المعلّمتان كتقديريتين</span></div>
      </article>
    </>
  );
}
