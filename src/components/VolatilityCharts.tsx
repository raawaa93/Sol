import { ChevronDown } from 'lucide-react';
import { formatAssetPrice, getQuoteCurrency } from '../lib/format';
import { getUnderlyingReferencePrice } from '../lib/options';
import type { OptionQuote, OptionSide } from '../lib/types';

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

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

function linePath(points: Array<{ x: number; y: number }>): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
}

function xLabel(value: number, referencePrice: number, quoteCurrency: string | null): string {
  if (value >= 10_000) return `${numberFormat.format(value / 1000)}k`;
  return formatAssetPrice(value, referencePrice, quoteCurrency);
}

function SmileChart({ data, referencePrice, quoteCurrency }: { data: SmilePoint[]; referencePrice: number; quoteCurrency: string | null }) {
  const width = 560;
  const height = 220;
  const left = 42;
  const right = 8;
  const top = 10;
  const bottom = 30;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const xMin = Math.min(...data.map((point) => point.strike));
  const xMax = Math.max(...data.map((point) => point.strike));
  const rawYMin = Math.min(...data.map((point) => point.iv));
  const rawYMax = Math.max(...data.map((point) => point.iv));
  const yMin = Math.max(0, rawYMin - 0.04);
  const yMax = rawYMax + 0.04;
  const xScale = (value: number) => left + (xMax === xMin ? plotWidth / 2 : ((value - xMin) / (xMax - xMin)) * plotWidth);
  const yScale = (value: number) => top + ((yMax - value) / (yMax - yMin || 1)) * plotHeight;
  const points = data.map((point) => ({ x: xScale(point.strike), y: yScale(point.iv), point }));
  const line = linePath(points);
  const lastPoint = points.length ? points[points.length - 1] : undefined;
  const area = `${line} L ${(lastPoint?.x ?? left).toFixed(2)} ${(top + plotHeight).toFixed(2)} L ${(points[0]?.x ?? left).toFixed(2)} ${(top + plotHeight).toFixed(2)} Z`;
  const yTicks = Array.from({ length: 5 }, (_, index) => yMin + ((yMax - yMin) * index) / 4);
  const xTicks = [...new Set([data[0], data[Math.floor(data.length / 2)], data[data.length - 1]].filter(Boolean).map((point) => point!.strike))];

  return (
    <svg className="simple-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="ابتسامة التقلب الضمني">
      <defs><linearGradient id="ivFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b6f36e" stopOpacity=".22" /><stop offset="100%" stopColor="#b6f36e" stopOpacity="0" /></linearGradient></defs>
      {yTicks.map((tick) => {
        const y = yScale(tick);
        return <g key={tick}><line x1={left} x2={width - right} y1={y} y2={y} stroke="#222b31" strokeDasharray="3 5" /><text x={left - 7} y={y + 3} textAnchor="end" fill="#78838a" fontSize="10">{Math.round(tick * 100)}%</text></g>;
      })}
      {xTicks.map((tick) => <text key={tick} x={xScale(tick)} y={height - 8} textAnchor="middle" fill="#78838a" fontSize="10">{xLabel(tick, referencePrice, quoteCurrency)}</text>)}
      <path d={area} fill="url(#ivFill)" />
      <path d={line} fill="none" stroke="#b6f36e" strokeWidth="2.2" />
      {points.map(({ x, y, point }) => <circle key={point.strike} cx={x} cy={y} r="3" fill="#d2ff92" stroke="#182012" strokeWidth="1.5"><title>{`Strike ${formatAssetPrice(point.strike, referencePrice, quoteCurrency)} · IV ${(point.iv * 100).toFixed(2)}%`}</title></circle>)}
    </svg>
  );
}

function TermChart({ data }: { data: TermPoint[] }) {
  const width = 560;
  const height = 220;
  const left = 42;
  const right = 8;
  const top = 10;
  const bottom = 30;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const yMax = Math.max(...data.map((point) => point.iv), 0) + 0.12;
  const yScale = (value: number) => top + ((yMax - value) / yMax) * plotHeight;
  const slot = plotWidth / data.length;
  const barWidth = Math.min(34, slot * 0.64);
  const yTicks = Array.from({ length: 5 }, (_, index) => (yMax * index) / 4);

  return (
    <svg className="simple-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="منحنى انتهاء التقلب الضمني">
      {yTicks.map((tick) => {
        const y = yScale(tick);
        return <g key={tick}><line x1={left} x2={width - right} y1={y} y2={y} stroke="#222b31" strokeDasharray="3 5" /><text x={left - 7} y={y + 3} textAnchor="end" fill="#78838a" fontSize="10">{Math.round(tick * 100)}%</text></g>;
      })}
      {data.map((point, index) => {
        const x = left + slot * index + (slot - barWidth) / 2;
        const y = yScale(point.iv);
        return <g key={point.expiry}><rect x={x} y={y} width={barWidth} height={top + plotHeight - y} rx="5" fill="#8e9ff5"><title>{`${point.expiry} · ${point.days} days · ATM IV ${(point.iv * 100).toFixed(2)}%`}</title></rect><text x={x + barWidth / 2} y={height - 8} textAnchor="middle" fill="#78838a" fontSize="10">{point.expiry}</text></g>;
      })}
    </svg>
  );
}

export default function VolatilityCharts({ smileData, termData, underlying, selectedQuote, selectedType }: VolatilityChartsProps) {
  const referencePrice = getUnderlyingReferencePrice(selectedQuote);
  const quoteCurrency = getQuoteCurrency(selectedQuote) ?? null;
  return (
    <>
      <article className="panel chart-panel">
        <div className="panel-heading"><div><span className="section-kicker">VOLATILITY STRUCTURE</span><h2>ابتسامة التقلب</h2><p>IV غير المعلّم كتقديري حسب سعر التنفيذ · 20–40 يوماً</p></div><div className="chart-select"><span className="chart-legend-dot" />{selectedType === 'CALL' ? 'Calls' : 'Puts'}<ChevronDown size={13} /></div></div>
        {smileData.length ? <div className="chart-wrap"><SmileChart data={smileData} referencePrice={referencePrice} quoteCurrency={quoteCurrency} /></div> : <ChartEmptyState title="لا تتوفر سلسلة كافية" note="تتطلب الرسمة IV غير المعلّم كتقديري وسعر تنفيذ صالحاً." />}
        <div className="chart-footnote"><span>سعر التنفيذ · {quoteCurrency ?? 'عملة غير محددة'} لكل {underlying}</span><span>تُستبعد قيم IV المعلّمة كتقديرية</span></div>
      </article>

      <article className="panel chart-panel term-panel">
        <div className="panel-heading"><div><span className="section-kicker">TERM STRUCTURE</span><h2>منحنى الانتهاء</h2><p>IV ومدة انتهاء غير مقدّرين لأقرب عقد إلى السعر المرجعي</p></div><div className="chart-legend"><span className="chart-legend-dot blue" />ATM IV</div></div>
        {termData.length ? <div className="chart-wrap"><TermChart data={termData} /></div> : <ChartEmptyState title="لا تتوفر قيم IV صالحة" note="لا تُرسم القيم المقدّرة؛ يلزم IV غير معلّم كتقديري قرب السعر المرجعي." />}
        <div className="chart-footnote"><span>المدة حتى الانتهاء</span><span>تُستبعد IV والمدة المعلّمتان كتقديريتين</span></div>
      </article>
    </>
  );
}
