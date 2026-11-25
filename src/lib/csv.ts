import type { AssetClass, ExerciseStyle, OptionQuote, OptionSide, SettlementStyle, Underlying, UnderlyingKind } from './types';
import { CONTRACT_ECONOMICS_CSV_V2_FIELDS, parseContractEconomicsCsvV2 } from './contract-economics-csv.ts';
import { inferAssetClass, parseAssetClass } from './asset-class.ts';
import { impliedVolatilityForContract, priceOption } from './pricing-model.ts';

export interface CsvTimestampRange {
  earliest: string;
  latest: string;
  timestampedRows: number;
  totalRows: number;
}

export interface CsvImportResult {
  quotes: OptionQuote[];
  warnings: string[];
  sourceTimeRange?: CsvTimestampRange;
}

export const MAX_CSV_FILE_BYTES = 5 * 1024 * 1024;

function splitCsvLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[\s_\-./()]/g, '');
}

function readField(row: Record<string, string>, aliases: string[]): string | undefined {
  for (const alias of aliases) {
    const normalized = normalizeHeader(alias);
    if (row[normalized] !== undefined && row[normalized] !== '') return row[normalized];
  }
  return undefined;
}

function parseNumber(value: string | undefined, decimalComma = false): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  let cleaned = value.replace(/[$%\s]/g, '').replace(/USDT/gi, '').trim();
  if (decimalComma && cleaned.includes(',')) cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  else cleaned = cleaned.replace(/,/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePositiveNumber(value: string | undefined, decimalComma = false): number | undefined {
  const parsed = parseNumber(value, decimalComma);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

function parseNonnegativeNumber(value: string | undefined, decimalComma = false): number | undefined {
  const parsed = parseNumber(value, decimalComma);
  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}

function parseVolatility(value: string | undefined, decimalComma = false): number | undefined {
  if (!value) return undefined;
  const hasPercent = value.includes('%');
  const parsed = parseNumber(value, decimalComma);
  if (parsed === undefined) return undefined;
  const volatility = hasPercent || parsed > 5 ? parsed / 100 : parsed;
  return volatility > 0 && volatility <= 5 ? volatility : undefined;
}

function parseRate(value: string | undefined, decimalComma = false): number | undefined {
  if (!value) return undefined;
  const hasPercent = value.includes('%');
  const parsed = parseNumber(value, decimalComma);
  if (parsed === undefined) return undefined;
  const rate = hasPercent ? parsed / 100 : parsed;
  return Number.isFinite(rate) && Math.abs(rate) <= 1 ? rate : undefined;
}

function makeUtcDate(year: number, month: number, day: number, hour = 8, minute = 0, second = 0): Date | undefined {
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return date;
}

function parseTimestamp(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const compact = trimmed.match(/^(\d{4})(\d{2})(\d{2})(?:[T ]?(\d{2})(\d{2})(\d{2}))?$/);
  if (compact) {
    const date = makeUtcDate(Number(compact[1]), Number(compact[2]), Number(compact[3]), Number(compact[4] ?? 0), Number(compact[5] ?? 0), Number(compact[6] ?? 0));
    return date;
  }

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric >= 1_000_000_000_000) {
    const date = new Date(numeric);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (Number.isFinite(numeric) && numeric >= 1_000_000_000) {
    const date = new Date(numeric * 1000);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseExpiry(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const compact = trimmed.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (compact) {
    const date = makeUtcDate(2000 + Number(compact[1]), Number(compact[2]), Number(compact[3]));
    return date?.toISOString();
  }
  const parsed = parseTimestamp(trimmed);
  return parsed?.toISOString();
}

function parseSymbol(symbol: string): { underlying?: Underlying; strike?: number; type?: OptionSide; expiry?: string } {
  const match = symbol.toUpperCase().match(/^([A-Z0-9]{2,16})-(\d{6})-(\d+(?:\.\d+)?)-([CP])$/);
  if (!match) return {};
  const [, base, compactDate, strikeText, kind] = match;
  const expiry = parseExpiry(compactDate);
  const strike = Number(strikeText);
  return {
    underlying: base as Underlying,
    strike: Number.isFinite(strike) && strike > 0 ? strike : undefined,
    type: kind === 'C' ? 'CALL' : 'PUT',
    expiry,
  };
}

export function parseOptionsCsv(text: string, referenceTime = Date.now()): CsvImportResult {
  if (text.length > MAX_CSV_FILE_BYTES) return { quotes: [], warnings: ['حجم ملف CSV يتجاوز 5 MiB؛ اختصر الملف قبل استيراده.'] };
  const importTime = Number.isFinite(referenceTime) ? referenceTime : Date.now();
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return { quotes: [], warnings: ['يجب أن يحتوي الملف على صف عناوين وصف بيانات واحد على الأقل.'] };

  const delimiter = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const headers = splitCsvLine(lines[0], delimiter).map(normalizeHeader);
  const quotes: OptionQuote[] = [];
  const sampleWarnings: string[] = [];
  const timestamps: Date[] = [];
  const counts = {
    invalidRows: 0,
    missingSpot: 0,
    missingTimestamp: 0,
    invalidTimestamp: 0,
    missingIv: 0,
    estimatedIv: 0,
    missingQuoteSide: 0,
    estimatedMark: 0,
    modeledGreeks: 0,
    missingOpenInterest: 0,
    missingVolume: 0,
    defaultedUnit: 0,
    duplicateSymbols: 0,
  };
  const idOccurrences = new Map<string, number>();

  const dataLines = lines.slice(1);
  const limitedLines = dataLines.slice(0, 5000);
  const addRowWarning = (message: string) => {
    if (sampleWarnings.length < 5) sampleWarnings.push(message);
  };

  limitedLines.forEach((line, rowIndex) => {
    const cells = splitCsvLine(line, delimiter);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => { row[header] = cells[index] ?? ''; });
    const sourceRowNumber = rowIndex + 2;
    const canonicalEconomicsFields: Record<string, string> = {};
    CONTRACT_ECONOMICS_CSV_V2_FIELDS.forEach((field) => {
      canonicalEconomicsFields[field] = row[normalizeHeader(field)] ?? '';
    });
    const hasCanonicalEconomicsFields = Object.values(canonicalEconomicsFields).some((value) => value.trim() !== '');
    const canonicalEconomics = hasCanonicalEconomicsFields
      ? parseContractEconomicsCsvV2(canonicalEconomicsFields)
      : undefined;
    if (canonicalEconomics?.warning) {
      addRowWarning(`الصف ${sourceRowNumber}: ${canonicalEconomics.warning}`);
    } else if (canonicalEconomics?.economics) {
      addRowWarning(`الصف ${sourceRowNumber}: تم استيراد الشروط الاقتصادية كمدخلات USER_ASSERTED؛ لا تُعدّ إثباتاً من مزود ولا تفعّل الحسابات.`);
    }

    const symbol = readField(row, ['symbol', 'contract', 'instrument']) ?? '';
    const parsedSymbol = parseSymbol(symbol);
    const underlyingText = (readField(row, ['underlying', 'baseasset', 'asset']) ?? parsedSymbol.underlying ?? '').toUpperCase();
    if (!/^[A-Z0-9]{2,16}$/.test(underlyingText)) {
      counts.invalidRows += 1;
      addRowWarning(`تم تجاهل الصف ${sourceRowNumber}: يلزم رمز أصل أساسي من 2 إلى 16 حرفاً أو رقماً.`);
      return;
    }
    const underlying = underlyingText as Underlying;
    const explicitAssetClass = readField(row, ['assetClass', 'assetCategory', 'category']);
    const assetClass: AssetClass = explicitAssetClass ? parseAssetClass(explicitAssetClass) : inferAssetClass(underlying);
    const venue = readField(row, ['venue', 'exchange', 'market'])?.trim().toUpperCase();
    const underlyingKindText = readField(row, ['underlyingKind', 'underlyingType', 'instrumentKind'])?.trim().toUpperCase();
    const underlyingKind: UnderlyingKind | undefined = underlyingKindText
      ? (['SPOT', 'FUTURE', 'PERPETUAL', 'INDEX', 'FX_SPOT', 'UNKNOWN'].includes(underlyingKindText) ? underlyingKindText as UnderlyingKind : 'UNKNOWN')
      : undefined;
    const exerciseStyleText = readField(row, ['exerciseStyle', 'exerciseType'])?.trim().toUpperCase();
    const exerciseStyle: ExerciseStyle | undefined = exerciseStyleText
      ? (['EUROPEAN', 'AMERICAN', 'BERMUDAN', 'UNKNOWN'].includes(exerciseStyleText) ? exerciseStyleText as ExerciseStyle : 'UNKNOWN')
      : undefined;
    const settlementStyleText = readField(row, ['settlementStyle', 'settlementType'])?.trim().toUpperCase();
    const settlementStyle: SettlementStyle | undefined = settlementStyleText
      ? (['CASH', 'PHYSICAL', 'UNKNOWN'].includes(settlementStyleText) ? settlementStyleText as SettlementStyle : 'UNKNOWN')
      : undefined;
    const quoteAsset = readField(row, ['quoteAsset', 'quoteCurrency'])?.trim().toUpperCase();
    const settlementAsset = readField(row, ['settlementAsset', 'settleAsset', 'settlementCurrency'])?.trim().toUpperCase();
    const contractMultiplier = parsePositiveNumber(readField(row, ['contractMultiplier', 'multiplierValue', 'multiplier']), delimiter === ';');
    const inputUnit = parsePositiveNumber(readField(row, ['unit', 'contractunit']), delimiter === ';');
    if (contractMultiplier !== undefined && inputUnit === undefined) {
      addRowWarning(`الصف ${sourceRowNumber}: contractMultiplier ليس بديلاً عن unit؛ استُخدمت قيمة unit الافتراضية 1 والمعلّمة كتقديرية.`);
    } else if (contractMultiplier !== undefined && inputUnit !== undefined && Math.abs(contractMultiplier - inputUnit) > Math.max(1e-9, inputUnit * 1e-9)) {
      addRowWarning(`الصف ${sourceRowNumber}: contractMultiplier يختلف عن unit؛ تُحفظ القيمتان منفصلتين، لكننا نحجب P&L لكل عقد والكمية والمحاكاة التاريخية حتى يتوفر نموذج للتسليم والمضاعف.`);
    }
    const expiryTimezone = readField(row, ['expiryTimezone', 'timezone'])?.trim();
    const typeText = (readField(row, ['type', 'optiontype', 'side']) ?? parsedSymbol.type ?? '').toUpperCase();
    const type: OptionSide | undefined = typeText === 'C' || typeText === 'CALL' ? 'CALL'
      : typeText === 'P' || typeText === 'PUT' ? 'PUT' : undefined;
    const strike = parsePositiveNumber(readField(row, ['strike', 'strikeprice', 'exerciseprice']), delimiter === ';') ?? parsedSymbol.strike;
    const expiry = parseExpiry(readField(row, ['expiry', 'expiration', 'expirydate', 'expirationdate'])) ?? parsedSymbol.expiry;
    const forward = parsePositiveNumber(readField(row, ['forward', 'forwardprice', 'futuresprice']), delimiter === ';');
    const spotInput = parsePositiveNumber(readField(row, ['spot', 'spotprice', 'indexprice', 'underlyingprice']), delimiter === ';');
    const spot = spotInput ?? (underlyingKind === 'FUTURE' ? forward : undefined);
    const carryYield = parseRate(readField(row, ['carryYield', 'dividendYield', 'foreignRate']), delimiter === ';');
    const riskFreeRate = parseRate(readField(row, ['riskFreeRate', 'riskFree', 'interestRate', 'rate']), delimiter === ';');

    if (!spot) counts.missingSpot += 1;
    if (!type || !strike || !expiry || !spot) {
      counts.invalidRows += 1;
      addRowWarning(`تم تجاهل الصف ${sourceRowNumber}: يلزم رمز أصل صالح ونوع عقد وتاريخ انتهاء وسعر تنفيذ وسعر مرجعي موجب للأصل.`);
      return;
    }

    const timestampText = readField(row, ['timestamp', 'asof', 'quotetime', 'updatedat', 'updatetime', 'eventtime', 'datetime', 'time']);
    const sourceTimestamp = timestampText ? parseTimestamp(timestampText) : undefined;
    const bidAskSourceText = readField(row, ['bidAskSource', 'bboSource', 'quoteSource']).toUpperCase();
    const bidAskSource = bidAskSourceText === 'BOOK_TICKER' || bidAskSourceText === 'OPTION_TICKER' || bidAskSourceText === 'MARK_PRICE'
      ? bidAskSourceText as 'BOOK_TICKER' | 'OPTION_TICKER' | 'MARK_PRICE'
      : undefined;
    const bidAskTimestampText = readField(row, ['bidAskTimestamp', 'bboTimestamp', 'bookTickerTimestamp', 'quoteSnapshotTimestamp']);
    const bidAskTimestamp = bidAskTimestampText ? parseTimestamp(bidAskTimestampText) : undefined;
    const bidAskReceivedAtText = readField(row, ['bidAskReceivedAt', 'quoteReceivedAt', 'localReceiveTime']);
    const bidAskReceivedAt = bidAskReceivedAtText ? parseTimestamp(bidAskReceivedAtText) : undefined;
    const bidAskSizeUnitText = readField(row, ['bidAskSizeUnit', 'bboSizeUnit', 'quantityUnit']).toUpperCase();
    const bidAskSizeUnit = bidAskSizeUnitText === 'CONTRACTS' || bidAskSizeUnitText === 'UNDERLYING_UNITS'
      ? bidAskSizeUnitText as 'CONTRACTS' | 'UNDERLYING_UNITS'
      : undefined;
    const bidQuantity = parseNonnegativeNumber(readField(row, ['bidQuantity', 'bidQty', 'bq']), delimiter === ';');
    const askQuantity = parseNonnegativeNumber(readField(row, ['askQuantity', 'askQty', 'aq']), delimiter === ';');
    if (bidAskSourceText && !bidAskSource) addRowWarning(`تم تجاهل مصدر BBO غير معروف في الصف ${sourceRowNumber}.`);
    if (bidAskTimestampText && !bidAskTimestamp) addRowWarning(`تعذر قراءة وقت BBO في الصف ${sourceRowNumber}.`);
    const bidValue = parseNumber(readField(row, ['bid', 'bidprice', 'bestbid']), delimiter === ';');
    const askValue = parseNumber(readField(row, ['ask', 'askprice', 'bestask']), delimiter === ';');
    const markValue = parseNumber(readField(row, ['mark', 'markprice', 'mid', 'lastprice']), delimiter === ';');
    if ((bidValue !== undefined && bidValue < 0) || (askValue !== undefined && askValue < 0) || (markValue !== undefined && markValue < 0)) {
      counts.invalidRows += 1;
      addRowWarning(`تم تجاهل الصف ${sourceRowNumber}: يوجد سعر عرض أو طلب أو Mark سالب.`);
      return;
    }
    const bid = bidValue && bidValue > 0 ? bidValue : 0;
    const ask = askValue && askValue > 0 ? askValue : 0;
    const observedMark = markValue && markValue > 0 ? markValue : 0;
    if (bid > 0 && ask > 0 && ask < bid) {
      counts.invalidRows += 1;
      addRowWarning(`تم تجاهل الصف ${sourceRowNumber}: سعر Ask أقل من Bid.`);
      return;
    }

    const observedPrice = observedMark || (bid > 0 && ask > 0 ? (bid + ask) / 2 : bid || ask);
    if (observedPrice <= 0) {
      counts.invalidRows += 1;
      addRowWarning(`تم تجاهل الصف ${sourceRowNumber}: يلزم Bid أو Ask أو Mark موجب؛ لم تُنشأ أسعار نموذجية بدلاً منها.`);
      return;
    }

    const valuationTime = sourceTimestamp?.getTime() ?? importTime;
    const daysToExpiry = Math.max(0, (new Date(expiry).getTime() - valuationTime) / 86_400_000);
    const inputIv = parseVolatility(readField(row, ['iv', 'impliedvolatility', 'markiv', 'volatility']), delimiter === ';');
    const pricingInputs = {
      underlyingKind,
      exerciseStyle,
      settlementStyle,
      spot,
      forward,
      strike,
      daysToExpiry,
      type,
      rate: riskFreeRate ?? Number.NaN,
      carryYield,
    };
    let solvedIv = inputIv;
    const hasVerifiedScaleForIv = inputUnit !== undefined
      && (contractMultiplier === undefined
        || Math.abs(contractMultiplier - inputUnit) <= Math.max(1e-9, inputUnit * 1e-9));
    if (solvedIv === undefined) {
      if (!hasVerifiedScaleForIv) {
        counts.missingIv += 1;
        counts.invalidRows += 1;
        addRowWarning(`تم تجاهل الصف ${sourceRowNumber}: لا يمكن استنتاج IV من سعر السوق قبل التحقق من unit ومضاعف العقد؛ أدخل IV مرصوداً أو مواصفات مقياس متطابقة.`);
        return;
      }
      solvedIv = impliedVolatilityForContract(observedPrice, pricingInputs);
    }
    if (solvedIv === undefined) {
      counts.missingIv += 1;
      counts.invalidRows += 1;
      addRowWarning(`تم تجاهل الصف ${sourceRowNumber}: لا يوجد IV مرصود، وتعذّر استنتاجه دون افتراض نموذج غير مثبت لمواصفات العقد.`);
      return;
    }

    const estimatedFields: string[] = [];
    if (!sourceTimestamp) estimatedFields.push('daysToExpiry');
    if (inputIv === undefined) {
      counts.estimatedIv += 1;
      estimatedFields.push('iv');
    }
    if (bid === 0 || ask === 0) counts.missingQuoteSide += 1;

    const modelResult = priceOption({ ...pricingInputs, volatility: solvedIv });
    const modelGreeks = modelResult.status === 'SUPPORTED' ? modelResult.greeks : undefined;
    const pricingStatus = modelResult.status === 'SUPPORTED' ? 'SUPPORTED' as const : 'OBSERVED_ONLY' as const;
    const pricingModel = modelResult.status === 'SUPPORTED' ? modelResult.model : undefined;
    const pricingReason = modelResult.status === 'SUPPORTED' ? undefined
      : underlyingKind === 'PERPETUAL' ? 'Perpetual underlyings are not supported by a validated pricing model.'
        : exerciseStyle === 'AMERICAN' || exerciseStyle === 'BERMUDAN' ? 'American/Bermudan exercise is not supported by the current European analytical models.'
          : modelResult.reason;

    const hasObservedTwoSidedQuote = bid > 0 && ask > 0;
    const markPrice = observedMark || (hasObservedTwoSidedQuote ? (bid + ask) / 2 : observedPrice || modelGreeks?.price || 0);
    const priceSource = observedMark ? 'MARK' as const : hasObservedTwoSidedQuote ? 'MID' as const : observedPrice > 0 ? bid > 0 ? 'BID' as const : ask > 0 ? 'ASK' as const : 'LAST' as const : 'MODEL' as const;
    if (markPrice <= 0) {
      counts.invalidRows += 1;
      addRowWarning(`تم تجاهل الصف ${sourceRowNumber}: لا يوجد Mark/Bid/Ask مرصود، ولا يوجد نموذج صالح لتقدير السعر.`);
      return;
    }
    if (!observedMark && !hasObservedTwoSidedQuote && modelGreeks) {
      counts.estimatedMark += 1;
      estimatedFields.push('markPrice');
    }

    const deltaValue = parseNumber(readField(row, ['delta']), delimiter === ';');
    const gammaValue = parseNumber(readField(row, ['gamma']), delimiter === ';');
    const thetaValue = parseNumber(readField(row, ['theta', 'thetaperday']), delimiter === ';');
    const vegaValue = parseNumber(readField(row, ['vega', 'vegaperpoint']), delimiter === ';');
    const rhoValue = parseNumber(readField(row, ['rho', 'rhoperpoint']), delimiter === ';');
    if (deltaValue === undefined || gammaValue === undefined || thetaValue === undefined || vegaValue === undefined || rhoValue === undefined) {
      counts.modeledGreeks += 1;
      if (deltaValue === undefined) estimatedFields.push('delta');
      if (gammaValue === undefined) estimatedFields.push('gamma');
      if (thetaValue === undefined) estimatedFields.push('theta');
      if (vegaValue === undefined) estimatedFields.push('vega');
      if (rhoValue === undefined) estimatedFields.push('rho');
    }

    const openInterest = parseNonnegativeNumber(readField(row, ['openinterest', 'oi', 'sumopeninterest']), delimiter === ';') ?? null;
    const openInterestUsd = parseNonnegativeNumber(readField(row, ['openinterestusd', 'oiusd', 'sumopeninterestusd']), delimiter === ';') ?? null;
    const volume = parseNonnegativeNumber(readField(row, ['volume', 'volume24h', 'qty']), delimiter === ';') ?? null;
    const volumeQuote = parseNonnegativeNumber(readField(row, ['volumequote', 'volumeusd', 'turnover', 'amount']), delimiter === ';') ?? null;
    if (openInterest === null) counts.missingOpenInterest += 1;
    if (volume === null) counts.missingVolume += 1;
    const unit = inputUnit ?? 1;
    if (!inputUnit) {
      counts.defaultedUnit += 1;
      estimatedFields.push('unit');
    }

    if (!timestampText) {
      counts.missingTimestamp += 1;
    } else if (sourceTimestamp) {
      timestamps.push(sourceTimestamp);
    } else {
      counts.invalidTimestamp += 1;
    }

    const fallbackId = `${underlying}-${expiry.slice(0, 10)}-${strike}-${type}-${sourceRowNumber}`;
    const displaySymbol = symbol || fallbackId;
    const occurrence = idOccurrences.get(displaySymbol) ?? 0;
    idOccurrences.set(displaySymbol, occurrence + 1);
    if (symbol && occurrence > 0) counts.duplicateSymbols += 1;
    const id = occurrence === 0 ? displaySymbol : `${displaySymbol}#${occurrence + 1}`;
    quotes.push({
      id,
      symbol: displaySymbol,
      underlying,
      assetClass,
      venue,
      underlyingKind,
      forward,
      carryYield,
      riskFreeRate,
      pricingStatus,
      pricingModel,
      pricingReason,
      quoteAsset,
      settlementAsset,
      contractMultiplier,
      ...(canonicalEconomics?.economics ? { contractEconomics: canonicalEconomics.economics } : {}),
      exerciseStyle,
      settlementStyle,
      expiryTimezone,
      expiry,
      daysToExpiry,
      strike,
      type,
      bid,
      ask,
      markPrice,
      priceSource,
      iv: solvedIv,
      delta: pricingStatus === 'SUPPORTED' ? modelGreeks?.delta ?? deltaValue ?? 0 : deltaValue ?? modelGreeks?.delta ?? 0,
      gamma: pricingStatus === 'SUPPORTED' ? modelGreeks?.gamma ?? gammaValue ?? 0 : gammaValue ?? modelGreeks?.gamma ?? 0,
      theta: pricingStatus === 'SUPPORTED' ? modelGreeks?.thetaPerDay ?? thetaValue ?? 0 : thetaValue ?? modelGreeks?.thetaPerDay ?? 0,
      vega: pricingStatus === 'SUPPORTED' ? modelGreeks?.vegaPerVolPoint ?? vegaValue ?? 0 : vegaValue ?? modelGreeks?.vegaPerVolPoint ?? 0,
      rho: pricingStatus === 'SUPPORTED' ? modelGreeks?.rhoPerRatePoint ?? rhoValue ?? 0 : rhoValue ?? modelGreeks?.rhoPerRatePoint ?? 0,
      unverifiedSourceGreeks: [deltaValue, gammaValue, thetaValue, vegaValue].some((value) => value !== undefined)
        ? { delta: deltaValue, gamma: gammaValue, theta: thetaValue, vega: vegaValue }
        : undefined,
      openInterest,
      openInterestUsd,
      volume,
      volumeQuote,
      spot,
      unit,
      sourceTimestamp: sourceTimestamp?.toISOString(),
      bidAskSource,
      bidAskSizeUnit,
      bidQuantity,
      askQuantity,
      sourceTimestamps: bidAskTimestamp && bidAskSource === 'BOOK_TICKER'
        ? { bookTicker: bidAskTimestamp.toISOString() }
        : bidAskTimestamp && bidAskSource === 'OPTION_TICKER'
          ? { ticker: bidAskTimestamp.toISOString() }
          : undefined,
      sourceReceivedAt: bidAskReceivedAt ? { bidAsk: bidAskReceivedAt.toISOString() } : undefined,
      estimatedFields,
    });
  });

  const summaryWarnings: string[] = [];
  const totalRows = quotes.length;
  if (counts.missingTimestamp >= totalRows && totalRows > 0) {
    summaryWarnings.push('لا يحتوي أي صف صالح على وقت المصدر؛ حداثة اللقطة غير معروفة. وقت الاستيراد لا يثبت وقت الأسعار.');
  } else if (counts.missingTimestamp > 0 || counts.invalidTimestamp > 0) {
    summaryWarnings.push(`وقت مصدر صالح موجود في ${timestamps.length} من ${totalRows} صفاً فقط؛ قد تختلف حداثة العقود.`);
  }
  const estimatedTimeRows = counts.missingTimestamp + counts.invalidTimestamp;
  if (estimatedTimeRows > 0) summaryWarnings.push(`حُسبت مدة الانتهاء من وقت الاستيراد، لا من وقت السوق، في ${estimatedTimeRows} صف؛ اعتبرها تقديراً.`);
  const futureTimestampRows = timestamps.filter((timestamp) => timestamp.getTime() > importTime + 5 * 60_000).length;
  if (futureTimestampRows > 0) summaryWarnings.push(`وقت المصدر مستقبلي بأكثر من 5 دقائق في ${futureTimestampRows} صف؛ تحقّق من المنطقة الزمنية وساعة الجهاز.`);
  if (timestamps.length > 1) {
    const times = timestamps.map((timestamp) => timestamp.getTime());
    const rangeMinutes = (Math.max(...times) - Math.min(...times)) / 60_000;
    if (rangeMinutes > 5) summaryWarnings.push(`أوقات المصدر غير متزامنة؛ يمتد تفاوت الطوابع الزمنية إلى ${rangeMinutes.toFixed(0)} دقيقة.`);
  }
  if (counts.missingSpot > 0) summaryWarnings.push(`رُفض ${counts.missingSpot} صفاً لغياب السعر المرجعي للأصل؛ لم يُستخدم سعر Demo كبديل.`);
  if (counts.estimatedIv > 0) summaryWarnings.push(`استُنتج IV من السعر باستخدام نموذج محدد أو افتراض Black–Scholes قديم في ${counts.estimatedIv} صف؛ اعتبره تقديراً لا قيمة مرصودة.`);
  if (counts.missingQuoteSide > 0) summaryWarnings.push(`Bid أو Ask مفقود في ${counts.missingQuoteSide} صف؛ لم يُختلق الطرف الناقص، والفارق غير متاح لهذه الصفوف.`);
  if (counts.estimatedMark > 0) summaryWarnings.push(`حُسب Mark بنموذج Black–Scholes في ${counts.estimatedMark} صف لغياب Mark وغياب أحد طرفي السوق.`);
  if (counts.modeledGreeks > 0) summaryWarnings.push(`توجد Greeks غير واردة من المصدر في ${counts.modeledGreeks} صف؛ حُسبت فقط عند توفر نموذج صريح، وإلا بقيت غير متاحة بدلاً من عرض أصفار مضللة.`);
  if (counts.missingOpenInterest > 0) summaryWarnings.push(`الفائدة المفتوحة مفقودة في ${counts.missingOpenInterest} صف؛ ستظهر كغير متاحة لا كصفر.`);
  if (counts.missingVolume > 0) summaryWarnings.push(`الحجم مفقود في ${counts.missingVolume} صف؛ ستظهر قيمته كغير متاحة.`);
  if (counts.defaultedUnit > 0) summaryWarnings.push(`لم تُحدد وحدة العقد في ${counts.defaultedUnit} صف؛ استُخدمت قيمة افتراضية 1، فتحقق من المضاعف قبل تفسير الربح والخسارة.`);
  if (counts.duplicateSymbols > 0) summaryWarnings.push(`تكرر رمز العقد في ${counts.duplicateSymbols} صف؛ قد تكون البيانات لقطات زمنية متعددة، فتحقق من التوقيت قبل استخدام السلسلة.`);
  [...new Set(quotes.map((quote) => quote.underlying))].forEach((asset) => {
    const spots = quotes.filter((quote) => quote.underlying === asset).map((quote) => quote.spot).sort((a, b) => a - b);
    if (spots.length > 1) {
      const medianSpot = spots[Math.floor(spots.length / 2)];
      const variation = medianSpot > 0 ? (spots[spots.length - 1] - spots[0]) / medianSpot : 0;
      if (variation > 0.005) summaryWarnings.push(`أسعار ${asset} المرجعية متباعدة بأكثر من 0.5% بين الصفوف؛ لوحة السوق تعرض الوسيط، وتحليل كل عقد يستخدم سعر صفه.`);
    }
  });
  if (counts.invalidRows > 0) summaryWarnings.push(`تم تجاهل ${counts.invalidRows} صف غير صالح من الملف.`);
  if (dataLines.length > 5000) summaryWarnings.push('تم فحص أول 5000 صف فقط لحماية أداء المتصفح.');

  const sortedTimestamps = [...timestamps].sort((a, b) => a.getTime() - b.getTime());
  const sourceTimeRange = sortedTimestamps.length
    ? {
      earliest: sortedTimestamps[0].toISOString(),
      latest: sortedTimestamps[sortedTimestamps.length - 1].toISOString(),
      timestampedRows: sortedTimestamps.length,
      totalRows,
    }
    : undefined;

  const warnings = [...summaryWarnings, ...sampleWarnings];
  if (quotes.length === 0) warnings.unshift('لم نعثر على عقود صالحة. استخدم قالب CSV وتأكد من الأعمدة المطلوبة ووحداتها.');
  return { quotes, warnings, sourceTimeRange };
}

export function downloadCsvTemplate(): void {
  const template = 'symbol,underlying,expiry,strike,type,bid,ask,markPrice,iv,delta,gamma,theta,vega,rho,openInterest,openInterestUsd,volume,volumeQuote,spot,forward,unit,timestamp,assetClass,venue,underlyingKind,carryYield,riskFreeRate,quoteAsset,settlementAsset,contractMultiplier,exerciseStyle,settlementStyle,expiryTimezone,' + CONTRACT_ECONOMICS_CSV_V2_FIELDS.join(',');
  const blob = new Blob([template], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'volterra-options-template.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export function escapeCsvCell(value: string | number): string {
  const text = String(value);
  const safeText = typeof value === 'string' && /^[\u0000-\u0020\uFEFF]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

export function downloadCsv(filename: string, rows: Array<Record<string, string | number>>): void {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);

  const content = [headers.map(escapeCsvCell).join(','), ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header] ?? '')).join(','))].join('\n');
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
