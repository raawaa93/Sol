import type { PaperTrade } from '../lib/types';
import { formatAssetPrice, formatNumber, formatOptionPrice, formatQuantity } from '../lib/format';

interface PaperJournalTradesProps {
  trades: PaperTrade[];
  selectedQuoteSymbol: string;
  persistenceBlocked: boolean;
  paperExitFees: string;
  onExitFeesChange: (value: string) => void;
  onClose: (trade: PaperTrade) => void | Promise<void>;
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('ar-GB', {
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}

function formatMoney(value: number, currency: string | null): string {
  return formatNumber(value, 2) + (Number.isFinite(value) && currency ? ' ' + currency : '');
}

export default function PaperJournalTrades({
  trades,
  selectedQuoteSymbol,
  persistenceBlocked,
  paperExitFees,
  onExitFeesChange,
  onClose,
}: PaperJournalTradesProps) {
  return (
    <>
      <div className="journal-exit-controls">
        <p>إغلاق الصفقة التجريبية يستخدم سعر Bid وحجم العرض المرصود للعقد نفسه. اختر العقد من الماسح أولاً. اترك الرسوم فارغة إذا لم تعرفها؛ عندها نعرض الربح/الخسارة الإجمالي فقط ولا نخمن الصافي.</p>
        <label>رسوم الخروج الدقيقة بعملة العقد (اختياري)
          <input type="number" min="0" step="any" inputMode="decimal" value={paperExitFees} onChange={(event) => onExitFeesChange(event.target.value)} placeholder="اتركه فارغاً إذا كانت غير معروفة" />
        </label>
      </div>
      <div className="journal-table-wrap">
        <table className="journal-table">
          <thead><tr><th>وقت التسجيل</th><th>العقد</th><th>Strike</th><th>كمية</th><th>قسط الدخول</th><th>السعر المرجعي وقتها</th><th>الحالة / الإغلاق</th></tr></thead>
          <tbody>
            {trades.map((trade) => (
              <tr key={trade.id}>
                <td>{formatDateTime(new Date(trade.createdAt))}</td>
                <td><span className={`mini-type ${trade.type.toLowerCase()}`}>{trade.type}</span><strong>{trade.symbol}</strong>{trade.contractEconomics && <small>لقطة العقد: قسط ×{trade.premiumMultiplierAtEntry} · وحدة التسليم {trade.contractUnitAtEntry}</small>}</td>
                <td>{formatAssetPrice(trade.strike, trade.spotAtEntry, trade.quoteAsset ?? null)}</td>
                <td>{formatQuantity(trade.quantity, { quantityScale: trade.quantityPrecision })}</td>
                <td>{formatOptionPrice(trade.entryPremium, { priceScale: trade.pricePrecision }, trade.quoteAsset ?? null)}{trade.premiumDebitAtEntry !== undefined && <small>القسط والرسوم: {formatMoney(trade.premiumDebitAtEntry, trade.premiumCurrencyAtEntry ?? null)}</small>}</td>
                <td>{formatAssetPrice(trade.spotAtEntry, trade.spotAtEntry, trade.quoteAsset ?? null)}</td>
                <td>{trade.exit
                  ? <span className="paper-status"><i /> مغلقة · {formatMoney(trade.exit.realizedGrossPnl, trade.premiumCurrencyAtEntry ?? null)} إجمالي{trade.exit.realizedNetPnl !== undefined ? ` · صافي ${formatMoney(trade.exit.realizedNetPnl, trade.premiumCurrencyAtEntry ?? null)}` : ' · الصافي غير معروف'}</span>
                  : <button className="button button-ghost journal-close-button" disabled={!trade.contractEconomics || selectedQuoteSymbol !== trade.symbol || persistenceBlocked} onClick={() => onClose(trade)}>إغلاق عند Bid</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="journal-mobile-list" role="list" aria-label="سجل الصفقات التجريبية">
        {trades.map((trade) => (
          <article className="journal-mobile-card" role="listitem" key={trade.id}>
            <div className="journal-mobile-card-head">
              <span><span className={`mini-type ${trade.type.toLowerCase()}`}>{trade.type}</span><strong dir="ltr">{trade.symbol}</strong>{trade.contractEconomics && <small>قسط ×{trade.premiumMultiplierAtEntry} · وحدة التسليم {trade.contractUnitAtEntry}</small>}</span>
              <small>{formatDateTime(new Date(trade.createdAt))}</small>
            </div>
            <div className="journal-mobile-values">
              <div><small>Strike</small><strong>{formatAssetPrice(trade.strike, trade.spotAtEntry, trade.quoteAsset ?? null)}</strong></div>
              <div><small>الكمية</small><strong>{formatQuantity(trade.quantity, { quantityScale: trade.quantityPrecision })}</strong></div>
              <div><small>قسط الدخول</small><strong>{formatOptionPrice(trade.entryPremium, { priceScale: trade.pricePrecision }, trade.quoteAsset ?? null)}</strong>{trade.premiumDebitAtEntry !== undefined && <small>القسط والرسوم: {formatMoney(trade.premiumDebitAtEntry, trade.premiumCurrencyAtEntry ?? null)}</small>}</div>
              <div><small>السعر المرجعي</small><strong>{formatAssetPrice(trade.spotAtEntry, trade.spotAtEntry, trade.quoteAsset ?? null)}</strong></div>
            </div>
            {trade.exit
              ? <span className="paper-status"><i /> PAPER ONLY · مغلقة · إجمالي {formatMoney(trade.exit.realizedGrossPnl, trade.premiumCurrencyAtEntry ?? null)}{trade.exit.realizedNetPnl !== undefined ? ` · صافي ${formatMoney(trade.exit.realizedNetPnl, trade.premiumCurrencyAtEntry ?? null)}` : ' · الصافي غير معروف'}</span>
              : <><span className="paper-status"><i /> تجريبية · PAPER ONLY · مفتوحة</span><button className="button button-ghost journal-close-button" disabled={!trade.contractEconomics || selectedQuoteSymbol !== trade.symbol || persistenceBlocked} onClick={() => onClose(trade)}>إغلاق عند Bid</button></>}
          </article>
        ))}
      </div>
    </>
  );
}
