import type { OptionFilter, OptionQuote } from './types';

const formatters = new Map<string, Intl.NumberFormat>();

type PrecisionSource = Pick<OptionQuote, 'priceScale' | 'quantityScale' | 'filters'>;

function clampPrecision(value: number): number {
  return Math.max(0, Math.min(8, Math.trunc(value)));
}

export function getFormatter(precision: number, minimumFractionDigits = precision): Intl.NumberFormat {
  const maximum = clampPrecision(precision);
  const minimum = Math.min(maximum, clampPrecision(minimumFractionDigits));
  const key = `${minimum}:${maximum}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: minimum,
      maximumFractionDigits: maximum,
    });
    formatters.set(key, formatter);
  }
  return formatter;
}

export function formatNumber(value: number, precision: number): string {
  if (!Number.isFinite(value)) return '—';
  return getFormatter(precision).format(value);
}

function formatCurrency(value: number, currency: string | null | undefined, precision: number): string {
  const formatted = formatNumber(value, precision);
  return formatted + (currency ? ' ' + currency.toUpperCase() : '');
}

export function getQuoteCurrency(quote?: Partial<Pick<OptionQuote, 'quoteAsset' | 'venue'>>): string | undefined {
  const declared = quote?.quoteAsset?.trim().toUpperCase();
  if (declared) return declared;
  return quote?.venue?.toUpperCase() === 'BINANCE' ? 'USDT' : undefined;
}

export function formatUsdt(value: number, precision = 2): string {
  if (!Number.isFinite(value)) return '—';
  return formatCurrency(value, 'USDT', precision);
}

export function getAdaptivePrecision(value: number): number {
  const magnitude = Math.abs(value);
  if (!Number.isFinite(magnitude) || magnitude >= 10) return 2;
  if (magnitude >= 1) return 3;
  if (magnitude >= 0.1) return 4;
  if (magnitude >= 0.01) return 5;
  if (magnitude >= 0.001) return 6;
  return 8;
}

export function getAssetPricePrecision(referencePrice: number): number {
  const magnitude = Math.abs(referencePrice);
  if (Number.isFinite(magnitude) && magnitude >= 10_000) return 0;
  if (Number.isFinite(magnitude) && magnitude >= 100) return 2;
  return getAdaptivePrecision(referencePrice);
}

function getFilterPrecision(
  filters: OptionFilter[] | undefined,
  filterTypes: string[],
  field: 'tickSize' | 'stepSize',
): number | undefined {
  const filter = filters?.find((item) => filterTypes.includes(item.filterType.toUpperCase()));
  const step = filter?.[field];
  if (!step || !/^\d+(?:\.\d+)?$/.test(step)) return undefined;
  const decimals = step.split('.')[1]?.replace(/0+$/, '').length ?? 0;
  return clampPrecision(decimals);
}

export function getOptionPricePrecision(
  value: number,
  contract?: Pick<PrecisionSource, 'priceScale' | 'filters'>,
): number {
  const contractPrecision = contract?.priceScale !== undefined
    && Number.isFinite(contract.priceScale)
    && contract.priceScale >= 0
    ? clampPrecision(contract.priceScale)
    : undefined;
  const tickPrecision = getFilterPrecision(contract?.filters, ['PRICE_FILTER'], 'tickSize');
  const declaredPrecision = [contractPrecision, tickPrecision].filter((item): item is number => item !== undefined);
  const magnitude = Math.abs(value);
  const minimumForNonzeroDisplay = magnitude >= 0.01 ? 0
    : magnitude >= 0.001 ? 4
      : magnitude >= 0.0001 ? 6
        : 8;
  return Math.max(minimumForNonzeroDisplay, ...declaredPrecision, declaredPrecision.length ? 0 : 2);
}

export function formatOptionPrice(
  value: number,
  contract?: Pick<PrecisionSource, 'priceScale' | 'filters'> & Partial<Pick<OptionQuote, 'quoteAsset' | 'venue'>>,
  currency?: string | null,
): string {
  if (!Number.isFinite(value) || value <= 0) return '—';
  const inferredCurrency = currency === undefined
    ? contract?.quoteAsset ?? (contract?.venue?.toUpperCase() === 'BINANCE' || !contract?.venue ? 'USDT' : undefined)
    : currency ?? undefined;
  return formatCurrency(value, inferredCurrency, getOptionPricePrecision(value, contract));
}

export function formatAssetPrice(value: number, referencePrice: number, currency: string | null = 'USDT'): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return formatCurrency(0, currency, 0);
  return formatCurrency(value, currency, getAssetPricePrecision(referencePrice));
}

export function getQuantityPrecision(contract?: Pick<PrecisionSource, 'quantityScale' | 'filters'>): number {
  const contractPrecision = contract?.quantityScale !== undefined
    && Number.isFinite(contract.quantityScale)
    && contract.quantityScale >= 0
    ? clampPrecision(contract.quantityScale)
    : undefined;
  const stepPrecision = getFilterPrecision(contract?.filters, ['LOT_SIZE', 'MARKET_LOT_SIZE'], 'stepSize');
  const declaredPrecision = [contractPrecision, stepPrecision].filter((item): item is number => item !== undefined);
  return declaredPrecision.length ? Math.max(...declaredPrecision) : 2;
}

function getValuePrecision(value: number): number {
  if (!Number.isFinite(value)) return 2;
  const text = String(value).toLowerCase();
  const [coefficient, exponentText] = text.split('e');
  const fractionLength = coefficient.split('.')[1]?.length ?? 0;
  const exponent = Number(exponentText ?? 0);
  return clampPrecision(Math.max(0, fractionLength - exponent));
}

export function formatQuantity(
  value: number,
  contract?: Pick<PrecisionSource, 'quantityScale' | 'filters'>,
): string {
  if (!Number.isFinite(value)) return '—';
  const declaredPrecision = getQuantityPrecision(contract);
  const roundedToContractPrecision = Number(value.toFixed(declaredPrecision));
  const hasMeaningfulExtraPrecision = Math.abs(value - roundedToContractPrecision) > Math.max(1e-10, Math.abs(value) * 1e-12);
  const valuePrecision = hasMeaningfulExtraPrecision ? getValuePrecision(value) : declaredPrecision;
  return formatNumber(value, Math.max(declaredPrecision, valuePrecision));
}

export function formatSmallAmount(value: number, currency: string | null = 'USDT'): string {
  if (!Number.isFinite(value)) return '—';
  const magnitude = Math.abs(value);
  const precision = magnitude >= 1 ? 2
    : magnitude >= 0.01 ? 4
      : magnitude >= 0.0001 ? 6
        : 8;
  return formatCurrency(value, currency, precision);
}

export function formatSmallNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const magnitude = Math.abs(value);
  const precision = magnitude >= 1000 ? 0
    : magnitude >= 1 ? 2
      : magnitude >= 0.01 ? 4
        : magnitude >= 0.0001 ? 6
          : 8;
  return getFormatter(precision, 0).format(value);
}
