import { formatAssetPrice, formatSmallAmount, getQuoteCurrency } from '../lib/format';
import { buildScenarioSeries } from '../lib/options';
import type { OptionQuote } from '../lib/types';

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
type ScenarioPoint = ReturnType<typeof buildScenarioSeries>[number];

export interface PayoffChartViewProps {
  scenarioSeries: ScenarioPoint[];
  selectedQuote: OptionQuote;
}

function formatMoney(value: number, currency: string | null): string {
  if (!Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${formatSmallAmount(value, currency)}`;
}

function linePath(points: Array<{ x: number; y: number }>): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
}

export default function PayoffChartView({ scenarioSeries, selectedQuote }: PayoffChartViewProps) {
  const quoteCurrency = getQuoteCurrency(selectedQuote) ?? null;
  const width = 560;
  const height = 264;
  const left = 54;
  const right = 10;
  const top = 12;
  const bottom = 30;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const xValues = scenarioSeries.map((point) => point.spot);
  const yValues = scenarioSeries.map((point) => point.pnl);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMin = Math.min(0, ...yValues);
  const yMax = Math.max(0, ...yValues);
  const xScale = (value: number) => left + (xMax === xMin ? plotWidth / 2 : ((value - xMin) / (xMax - xMin)) * plotWidth);
  const yScale = (value: number) => top + ((yMax - value) / (yMax - yMin || 1)) * plotHeight;
  const points = scenarioSeries.map((point) => ({ x: xScale(point.spot), y: yScale(point.pnl), point }));
  const line = linePath(points);
  const yTicks = Array.from({ length: 5 }, (_, index) => yMin + ((yMax - yMin) * index) / 4);
  const xTicks = [...new Set([scenarioSeries[0], scenarioSeries[Math.floor(scenarioSeries.length / 2)], scenarioSeries[scenarioSeries.length - 1]].filter(Boolean).map((point) => point!.spot))];

  return (
    <svg className="simple-chart payoff-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="رسم صافي الربح والخسارة عند انتهاء العقد">
      {yTicks.map((tick) => {
        const y = yScale(tick);
        return <g key={tick}><line x1={left} x2={width - right} y1={y} y2={y} stroke="#222b31" strokeDasharray="3 5" /><text x={left - 7} y={y + 3} textAnchor="end" fill="#829096" fontSize="10">{numberFormat.format(tick)}</text></g>;
      })}
      {xTicks.map((tick) => <text key={tick} x={xScale(tick)} y={height - 8} textAnchor="middle" fill="#829096" fontSize="11">{numberFormat.format(tick)}</text>)}
      <line x1={left} x2={width - right} y1={yScale(0)} y2={yScale(0)} stroke="#8e9aa0" strokeDasharray="4 4" />
      <path d={line} fill="none" stroke="#b6f36e" strokeWidth="2.5" />
      {points.map(({ x, y, point }) => <circle key={point.spot} cx={x} cy={y} r="3" fill="#b6f36e" stroke="#0f1518" strokeWidth="2"><title>{`${point.label} · ${formatAssetPrice(point.spot, selectedQuote.spot, quoteCurrency)} · صافي P&L ${formatMoney(point.pnl, quoteCurrency)}`}</title></circle>)}
    </svg>
  );
}
