import type { AssetClass, Underlying } from './types';

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  CRYPTO: 'العملات الرقمية',
  EQUITY: 'الأسهم',
  INDEX: 'المؤشرات',
  RATES: 'أسعار الفائدة',
  FX: 'العملات الأجنبية',
  ENERGY: 'الطاقة',
  METALS: 'المعادن',
  AGRICULTURE: 'الزراعة',
  OTHER: 'أخرى',
  UNKNOWN: 'غير مصنف',
};

const VALID_ASSET_CLASSES = new Set<AssetClass>([
  'CRYPTO', 'EQUITY', 'INDEX', 'RATES', 'FX', 'ENERGY', 'METALS', 'AGRICULTURE', 'OTHER', 'UNKNOWN',
]);

const UNDERLYING_ASSET_CLASSES: Record<string, AssetClass> = {
  BTC: 'CRYPTO', ETH: 'CRYPTO', BNB: 'CRYPTO', XRP: 'CRYPTO', DOGE: 'CRYPTO', SOL: 'CRYPTO',
  XAU: 'METALS', XAG: 'METALS',
  CL: 'ENERGY', BZ: 'ENERGY',
};

export function parseAssetClass(value: string | undefined): AssetClass {
  const normalized = value?.trim().toUpperCase();
  if (normalized && VALID_ASSET_CLASSES.has(normalized as AssetClass)) return normalized as AssetClass;
  return 'UNKNOWN';
}

export function inferAssetClass(underlying: Underlying): AssetClass {
  return UNDERLYING_ASSET_CLASSES[underlying.trim().toUpperCase()] ?? 'UNKNOWN';
}
