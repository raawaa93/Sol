import {
  ArrowUpLeft,
  BookOpen,
  Download,
  LockKeyhole,
  Trash2,
  WalletCards,
} from 'lucide-react';
import type { PaperJournalLoadResult } from '../lib/paper-journal-storage';
import type { PaperTrade } from '../lib/types';
import PaperJournalTrades from './PaperJournalTrades';

interface PaperJournalSectionProps {
  trades: PaperTrade[];
  paperJournalLoad: PaperJournalLoadResult<PaperTrade>;
  selectedQuoteSymbol: string;
  paperExitFees: string;
  onExitFeesChange: (value: string) => void;
  onClose: (trade: PaperTrade) => void | Promise<void>;
  onExportTrades: () => void;
  onExportIVHistory: () => void | Promise<void>;
  onExportJson: () => void | Promise<void>;
  onImportBackup: (raw: string) => void | Promise<void>;
  onClearJournal: () => void;
  onExportRecovery: () => void;
  onExportOriginal: () => void;
  onRetryPersistence: () => void;
  onNavigateToScanner: () => void;
}

export default function PaperJournalSection({
  trades,
  paperJournalLoad,
  selectedQuoteSymbol,
  paperExitFees,
  onExitFeesChange,
  onClose,
  onExportTrades,
  onExportIVHistory,
  onExportJson,
  onImportBackup,
  onClearJournal,
  onExportRecovery,
  onExportOriginal,
  onRetryPersistence,
  onNavigateToScanner,
}: PaperJournalSectionProps) {
  return (
    <section className="section-anchor journal-section" id="journal">
      <div className="section-title-row">
        <div><span className="section-kicker">PAPER WORKSPACE</span><h2>الدفتر التجريبي</h2><p>سجل الفرضية والكمية والقسط قبل أن تقيم جودة القرار.</p></div>
        <div className="journal-actions">
          <button className="button button-ghost" onClick={onExportTrades}><Download size={14} /> تصدير CSV</button>
          <button className="button button-ghost" onClick={onExportIVHistory}><Download size={14} /> نسخة IV JSON</button>
          <button className="button button-ghost" onClick={onExportJson} disabled={!trades.length}><Download size={14} /> نسخة الدفتر JSON</button>
          <label className="button button-ghost journal-import-button">استيراد نسخة JSON
            <input aria-label="استيراد نسخة دفتر PAPER JSON" type="file" accept="application/json,.json" disabled={paperJournalLoad.persistenceBlocked} onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (file.size > 5 * 1024 * 1024) {
                window.alert('النسخة أكبر من الحد المسموح 5 MiB.');
                event.target.value = '';
                return;
              }
              try { await onImportBackup(await file.text()); }
              catch { window.alert('تعذر قراءة ملف النسخة الاحتياطية.'); }
              event.target.value = '';
            }} />
          </label>
          <button className="button button-ghost danger-ghost" onClick={onClearJournal} disabled={!trades.length || paperJournalLoad.persistenceBlocked}><Trash2 size={14} /> مسح الدفتر</button>
        </div>
      </div>
      <article className="panel journal-panel">
        <div className="journal-summary">
          <div className="journal-summary-icon"><WalletCards size={18} /></div>
          <div><strong>{trades.length} <span>صفقة تجريبية</span></strong><small>محفوظة محلياً في هذا المتصفح فقط</small></div>
          <div className="journal-metric"><span>وضع التنفيذ</span><strong><i /> PAPER ONLY</strong></div>
          <div className="journal-metric"><span>مفاتيح تداول</span><strong className="safe-label"><LockKeyhole size={13} /> غير مطلوبة</strong></div>
        </div>
        {(paperJournalLoad.backupAvailable || paperJournalLoad.persistenceBlocked) && (
          <div className="journal-recovery-warning" role="alert">
            <strong>تنبيه سلامة دفتر PAPER</strong>
            <p>{paperJournalLoad.persistenceBlocked
              ? 'أوقفنا أي كتابة جديدة حتى لا نفقد بيانات قديمة لم نستطع حفظ نسخة استعادتها بأمان.'
              : paperJournalLoad.parseError
                ? 'تعذر تحليل ملف الدفتر الأصلي؛ احتفظنا بنسخته الخام قبل استبعادها من العرض.'
                : paperJournalLoad.rejectedCount > 0
                  ? `تم عزل ${paperJournalLoad.rejectedCount} سجل غير صالح من العرض، مع الاحتفاظ بالملف الأصلي الخام للاستعادة.`
                  : 'توجد نسخة استعادة سابقة محفوظة من دفتر PAPER؛ احتفظ بها خارج المتصفح قبل مسح بياناته.'} لا تمسح بيانات المتصفح قبل تنزيل النسخة.</p>
            {paperJournalLoad.backupAvailable && <button className="button button-ghost" onClick={onExportRecovery}><Download size={14} /> تنزيل نسخة الاستعادة JSON</button>}
            {paperJournalLoad.persistenceBlocked && <button className="button button-ghost" onClick={onExportOriginal}><Download size={14} /> تنزيل الملف الأصلي الحالي</button>}
            {paperJournalLoad.persistenceBlocked && <button className="button button-ghost" onClick={onRetryPersistence}>إعادة المحاولة بعد حفظ النسخ</button>}
          </div>
        )}
        {trades.length
          ? <PaperJournalTrades
              trades={trades}
              selectedQuoteSymbol={selectedQuoteSymbol}
              persistenceBlocked={paperJournalLoad.persistenceBlocked}
              paperExitFees={paperExitFees}
              onExitFeesChange={onExitFeesChange}
              onClose={onClose}
            />
          : <div className="journal-empty">
              <div className="journal-empty-icon"><BookOpen size={20} /></div>
              <strong>لا توجد صفقات مسجلة بعد</strong>
              <span>اختر عقداً من الماسح ثم أضفه إلى الدفتر. لن يتم إرسال أي أمر إلى أي منصة.</span>
              <button className="text-button" onClick={onNavigateToScanner}>ابدأ بتحليل عقد <ArrowUpLeft size={14} /></button>
            </div>}
      </article>
    </section>
  );
}
