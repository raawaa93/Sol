import { useMemo, useState } from 'react';
import { AlertTriangle, History } from 'lucide-react';
import { replayLongOptionSnapshots } from '../lib/replay';
import { formatOptionPrice, formatSmallAmount, getQuoteCurrency } from '../lib/format';
import type { OptionQuote } from '../lib/types';

interface HistoricalReplayPanelProps {
  quotes: OptionQuote[];
  dataMode: 'DEMO' | 'CSV' | 'BINANCE';
  underlying: string;
}

function formatReplayTime(value: string): string {
  return new Intl.DateTimeFormat('ar-GB', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }).format(new Date(value));
}

function formatPnl(value: number, currency: string | null): string {
  return `${value > 0 ? '+' : ''}${formatSmallAmount(value, currency)}`;
}

export default function HistoricalReplayPanel({ quotes, dataMode, underlying }: HistoricalReplayPanelProps) {
  const [holdingMinutes, setHoldingMinutes] = useState('60');
  const [exitGraceMinutes, setExitGraceMinutes] = useState('15');
  const [maxSpreadPct, setMaxSpreadPct] = useState('8');
  const [feePercent, setFeePercent] = useState('0');

  const replay = useMemo(() => {
    if (dataMode !== 'CSV') return null;
    return replayLongOptionSnapshots(quotes, {
      holdingPeriodMs: Number(holdingMinutes) * 60_000,
      maxExitDelayMs: Number(exitGraceMinutes) * 60_000,
      maxSpreadPct: Number(maxSpreadPct),
      feeRatePerSide: Number(feePercent) / 100,
      quantity: 1,
      maxTrades: 1_000,
      sourceMode: 'CSV',
    });
  }, [quotes, dataMode, holdingMinutes, exitGraceMinutes, maxSpreadPct, feePercent]);

  if (dataMode !== 'CSV') return null;

  const timestampedRows = quotes.filter((quote) => quote.sourceTimestamp && Number.isFinite(Date.parse(quote.sourceTimestamp))).length;
  const totalTrades = replay?.trades.length ?? 0;
  const replayCurrencies = [...new Set(quotes.map((quote) => getQuoteCurrency(quote) ?? ''))];
  const replayCurrency = replayCurrencies.length === 1 ? replayCurrencies[0] || null : null;

  return (
    <section className="section-anchor replay-section" id="historical-replay" aria-labelledby="historical-replay-heading">
      <div className="section-title-row">
        <div>
          <span className="section-kicker">HISTORICAL EXECUTION REPLAY · {underlying}</span>
          <h2 id="historical-replay-heading">إعادة تشغيل تاريخية محافظة</h2>
          <p>شراء عند Ask ثم إغلاق عند Bid بعد مدة محددة، باستخدام الطوابع الزمنية الفعلية للملف.</p>
        </div>
        <span className="replay-status"><History size={13} /> {timestampedRows} لقطة مؤرخة</span>
      </div>

      <div className="panel replay-panel">
        <div className="replay-controls">
          <label>مدة الاحتفاظ (دقيقة)
            <input type="number" min="1" max="10080" step="1" value={holdingMinutes} onChange={(event) => setHoldingMinutes(event.target.value)} />
          </label>
          <label>سماح تأخر الخروج (دقيقة)
            <input type="number" min="0" max="10080" step="1" value={exitGraceMinutes} onChange={(event) => setExitGraceMinutes(event.target.value)} />
          </label>
          <label>أقصى Spread (%)
            <input type="number" min="0" max="100" step="0.5" value={maxSpreadPct} onChange={(event) => setMaxSpreadPct(event.target.value)} />
          </label>
          <label>رسوم كل طرف (%)
            <input type="number" min="0" max="10" step="0.01" value={feePercent} onChange={(event) => setFeePercent(event.target.value)} />
          </label>
        </div>

        {totalTrades > 0 ? <>
          <div className="replay-metrics">
            <article><span>عدد الصفقات</span><strong>{totalTrades}</strong></article>
            <article><span>نسبة الصفقات الرابحة</span><strong>{replay!.winRate === null ? '—' : `${(replay!.winRate * 100).toFixed(1)}%`}</strong></article>
            <article><span>صافي P&amp;L</span><strong className={replay!.netPnl >= 0 ? 'replay-positive' : 'replay-negative'}>{formatPnl(replay!.netPnl, replayCurrency)}</strong></article>
            <article><span>Profit Factor</span><strong>{replay!.profitFactor === null ? 'غير محدد' : replay!.profitFactor.toFixed(2)}</strong></article>
            <article><span>أقصى تراجع</span><strong>{formatSmallAmount(replay!.maxDrawdown, replayCurrency)}</strong></article>
            <article><span>العائد على الأقساط</span><strong>{replay!.returnOnPremiumPct === null ? '—' : `${replay!.returnOnPremiumPct.toFixed(2)}%`}</strong></article>
          </div>
          <div className="replay-trades-wrap">
            <table className="replay-trades">
              <thead><tr><th>العقد</th><th>الدخول UTC</th><th>الخروج UTC</th><th>Ask</th><th>Bid</th><th>صافي P&amp;L</th></tr></thead>
              <tbody>{replay!.trades.slice(-8).reverse().map((trade, index) => (
                <tr key={`${trade.symbol}-${trade.entryTimestamp}-${index}`}>
                  <td>{trade.symbol}</td><td>{formatReplayTime(trade.entryTimestamp)}</td><td>{formatReplayTime(trade.exitTimestamp)}</td>
                  <td>{formatOptionPrice(trade.entryAsk, undefined, replayCurrency)}</td><td>{formatOptionPrice(trade.exitBid, undefined, replayCurrency)}</td>
                  <td className={trade.netPnl >= 0 ? 'replay-positive' : 'replay-negative'}>{formatPnl(trade.netPnl, replayCurrency)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </> : <div className="replay-empty"><strong>لا توجد صفقة قابلة لإعادة التشغيل بهذه الإعدادات</strong><span>يلزم وجود لقطتين مؤرختين على الأقل للعقد نفسه، مع Bid/Ask صالحين ضمن حد السبريد وفترة خروج مطابقة.</span></div>}

        <div className="replay-footnote"><AlertTriangle size={14} /><span>
          هذا خط أساس لتنفيذ شراء/إغلاق، وليس اختبار استراتيجية ذات إشارة دخول. لا يستخدم Mark كسعر تنفيذ ولا يختلق وقتاً عند غياب timestamp. لا يشمل الرسوم إلا النسبة التي تدخلها، والتراجع محسوب من P&L المحقق فقط لا من تقييم المراكز المفتوحة، ولا يمثل نتائج مستقبلية.
          {replay && ` تم استبعاد: وقت مفقود ${replay.skipped.missingTimestamp}، عرض غير صالح ${replay.skipped.invalidQuote}، وحدة غير صالحة ${replay.skipped.invalidUnit}، مقياس عقد غير متحقق ${replay.skipped.invalidContractScale}، Spread واسع ${replay.skipped.wideSpread}، بلا لقطة خروج ${replay.skipped.noExitSnapshot}.`}
        </span></div>
      </div>
    </section>
  );
}
