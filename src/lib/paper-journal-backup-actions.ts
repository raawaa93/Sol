import {
  createPaperJournalBackup,
  mergePaperJournalBackup,
  parsePaperJournalBackup,
} from './paper-journal-backup.ts';
import type { PaperJournalStorage } from './paper-journal-storage.ts';

export function downloadPaperJournalJsonBackup<T>(
  entries: T[],
  isValid: (value: unknown) => value is T,
): { ok: true; count: number } | { ok: false; message: string } {
  const result = createPaperJournalBackup(entries, isValid);
  if (!result.ok || !result.json) {
    return { ok: false, message: 'تعذر إنشاء نسخة JSON: توجد سجلات غير صالحة أو تجاوزت النسخة الحد المسموح.' };
  }
  const blob = new Blob([result.json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'sol-paper-journal-v1.json';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  return { ok: true, count: result.entries.length };
}

export function importPaperJournalJsonBackup<T extends { id: string }>(
  raw: string,
  current: T[],
  isValid: (value: unknown) => value is T,
  storage: PaperJournalStorage,
  storageKey: string,
): { ok: true; entries: T[]; added: number } | { ok: false; message: string } {
  const parsed = parsePaperJournalBackup(raw, isValid);
  if (!parsed.ok) {
    return {
      ok: false,
      message: parsed.reason === 'UNSUPPORTED_BACKUP_VERSION'
        ? 'إصدار نسخة PAPER غير مدعوم؛ لم تتغير بياناتك.'
        : parsed.reason === 'BACKUP_TOO_LARGE'
          ? 'حجم النسخة يتجاوز 5 MiB؛ لم تتغير بياناتك.'
          : 'ملف النسخة غير صالح أو يحتوي سجلات غير موثوقة/مكررة؛ لم تتغير بياناتك.',
    };
  }
  const merged = mergePaperJournalBackup(current, parsed.entries, isValid);
  if (!merged.ok) {
    return {
      ok: false,
      message: merged.reason === 'JOURNAL_ID_CONFLICT'
        ? 'تعارض معرّف صفقة: النسخة تحتوي بيانات مختلفة لسجل موجود. لم نستبدل أي سجل.'
        : 'تعذر دمج النسخة بسبب حد الحجم أو سلامة السجلات؛ لم تتغير بياناتك.',
    };
  }
  const added = merged.entries.length - current.length;
  if (added === 0) return { ok: true, entries: merged.entries, added: 0 };
  try {
    storage.setItem(storageKey, JSON.stringify(merged.entries));
  } catch {
    return { ok: false, message: 'تعذر حفظ النسخة المدمجة بسبب مساحة التخزين؛ بقي الدفتر الحالي كما هو.' };
  }
  return { ok: true, entries: merged.entries, added };
}
