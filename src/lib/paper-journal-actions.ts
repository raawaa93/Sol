import { closeCanonicalPaperTrade } from './paper-journal.ts';
import type { OptionQuote, PaperTrade } from './types.ts';

export function closePaperTradeFromQuote(input: {
  trade: PaperTrade;
  quote: OptionQuote;
  closedAt: string;
  exitFees?: number;
}) {
  const result = closeCanonicalPaperTrade(input);
  if (result.ok) return result;
  const message = result.reason === 'INSUFFICIENT_OBSERVED_BID_SIZE_OR_PRICE'
    ? 'تعذر الإغلاق: لا يوجد سعر Bid مرصود أو أن حجم العرض أقل من كمية الصفقة.'
    : result.reason === 'PAPER_EXIT_MARKET_SNAPSHOT_STALE_OR_FUTURE'
      ? 'تعذر الإغلاق: بيانات السعر أو المؤشر أو وقت الاستلام قديمة أو مستقبلية التوقيت. حدّث السوق.'
      : result.reason === 'PAPER_EXIT_AT_OR_AFTER_EXPIRY'
        ? 'انتهى العقد أو وصل إلى وقت الانتهاء؛ لا نسجل إغلاقاً سوقياً بعد الانتهاء.'
        : 'تعذر الإغلاق التجريبي: تحقق من تطابق العقد وشروطه وسعر السوق.';
  return { ok: false as const, reason: result.reason, message };
}
