import {
  PAPER_JOURNAL_BACKUP_MAX_BYTES,
  createPaperJournalBackup,
  mergePaperJournalBackup,
  parsePaperJournalBackup,
} from './paper-journal-backup.ts';
import { PAPER_JOURNAL_STORAGE_KEY } from './paper-journal-storage.ts';
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
): { ok: true; entries: T[]; added: number } | { ok: false; message: string; persistenceBlocked?: true } {
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
  let original: string | null;
  try {
    original = storage.getItem(PAPER_JOURNAL_STORAGE_KEY);
  } catch {
    return { ok: false, persistenceBlocked: true, message: 'تعذر قراءة الدفتر الحالي؛ أوقفنا الاستيراد والكتابة حتى تعيد تحميل الصفحة وتتحقق من النسخة الخام.' };
  }
  const expectedCurrent = current.length === 0 && original === null ? null : JSON.stringify(current);
  if (original !== expectedCurrent) {
    return { ok: false, persistenceBlocked: true, message: 'تغير الدفتر في تبويب آخر؛ أوقفنا الكتابة. أعد تحميل الصفحة ثم أعد الاستيراد لتجنب فقد أي تعديل.' };
  }
  const serialized = JSON.stringify(merged.entries);
  if (new TextEncoder().encode(serialized).byteLength > PAPER_JOURNAL_BACKUP_MAX_BYTES) {
    return { ok: false, message: 'النسخة المدمجة تتجاوز 5 MiB؛ لم تتغير بياناتك.' };
  }
  try {
    if (storage.getItem(storageKey) !== original) {
      return { ok: false, persistenceBlocked: true, message: 'تغير الدفتر أثناء الاستيراد؛ أوقفنا الكتابة ولم نكتب فوق التعديل الآخر. أعد تحميل الصفحة.' };
    }
    storage.setItem(PAPER_JOURNAL_STORAGE_KEY, serialized);
    if (storage.getItem(storageKey) !== serialized) {
      return { ok: false, persistenceBlocked: true, message: 'تعذر التحقق من حفظ النسخة المدمجة؛ أوقفنا الكتابة. نزّل الملف الأصلي ثم أعد تحميل الصفحة قبل المتابعة.' };
    }
  } catch {
    return { ok: false, message: 'تعذر حفظ النسخة المدمجة بسبب مساحة التخزين؛ بقي الدفتر الحالي كما هو.' };
  }
  return { ok: true, entries: merged.entries, added };
}
