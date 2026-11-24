import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { buildScenarioSeries } from '../lib/options';
import { formatAssetPrice } from '../lib/format';
import type { OptionQuote } from '../lib/types';

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
type ScenarioPoint = ReturnType<typeof buildScenarioSeries>[number];

export interface PayoffChartViewProps {
  scenarioSeries: ScenarioPoint[];
  selectedQuote: OptionQuote;
}

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} USDT`;
}

export default function PayoffChartView({ scenarioSeries, selectedQuote }: PayoffChartViewProps) {
  return (
    <ResponsiveContainer width="100%" height={264}>
      <LineChart data={scenarioSeries} margin={{ top: 12, right: 10, left: 10, bottom: 0 }}>
        <CartesianGrid stroke="#222b31" strokeDasharray="3 5" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: '#829096', fontSize: 11 }} axisLine={{ stroke: '#283137' }} tickLine={false} />
        <YAxis tickFormatter={(value) => numberFormat.format(Number(value))} tick={{ fill: '#829096', fontSize: 10 }} axisLine={false} tickLine={false} width={54} />
        <Tooltip contentStyle={{ background: '#11171b', border: '1px solid #2b353b', borderRadius: 10, color: '#e7ede8', fontSize: 12 }} formatter={(value) => [formatMoney(Number(value)), 'صافي P&L']} labelFormatter={(value, payload) => payload?.[0]?.payload ? `${value} · ${formatAssetPrice(Number(payload[0].payload.spot), selectedQuote.spot)}` : String(value)} />
        <ReferenceLine y={0} stroke="#8e9aa0" strokeDasharray="4 4" />
        <Line type="monotone" dataKey="pnl" stroke="#b6f36e" strokeWidth={2.5} dot={{ r: 3, fill: '#b6f36e', stroke: '#0f1518', strokeWidth: 2 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
