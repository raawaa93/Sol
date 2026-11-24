# Canonical Contract Economics — Design Specification

**Date:** 24 November 2026  
**Status:** Proposed implementation design; the fail-closed scalar guard is already merged in PR #101.  
**Tracking:** #91

## 1. Problem

A single `unit` or `contractMultiplier` cannot safely represent every option contract. At minimum, an option needs distinct representations for:

1. The premium quotation scale used to calculate the cash debit/credit.
2. The package delivered on exercise/assignment.
3. The aggregate exercise cash amount.
4. The currency in which premium is quoted and the currency in which settlement occurs.
5. Exercise and settlement mechanics.

These values happen to match for some standard contracts, but they are not interchangeable. Treating them as one scalar produces incorrect cost, payoff, position Greeks and replay when contracts are adjusted or have multiple deliverable components.

## 2. Evidence from official specifications

### Binance Crypto Options

The public Options REST API defines `unit` as the quantity of the underlying represented by one contract. The contract catalogue separately publishes `quoteAsset`, `settleAsset`, `underlyingType` and `contractType`. The published contract specifications identify European exercise, USDT settlement and asset-specific contract units (for example BTC/ETH = 1, XRP = 100, DOGE = 1,000).

This is an exchange-specific contract unit; it must not be generalized to equities or futures.

### Binance Stock Options

The Stock Options Market Data API explicitly distinguishes:
- `multiplier`: premium multiplier; order cost = price × quantity × multiplier.
- `contractSize`: shares delivered per contract.
- `deliverables[]`: the exercise package, with separate EQUITY and CASH components.

For standard contracts multiplier and contractSize are both 100, but the documentation says they may differ after corporate actions. The market-data endpoints return contract reference data only; they do not supply option quotes, Greeks or IV. The market-data endpoints require an API key header but are not signed.

### OCC listed equity options

OCC says a standard equity option generally represents 100 shares, but corporate actions can create adjusted contracts representing a different number of shares. OCC's special-settlement data describes multiple delivery components and fixed cash amounts. Its risk disclosure gives examples where the aggregate exercise price remains unchanged even when the share deliverable changes.

**Conclusion:** premium multiplier, share quantity, deliverable package and aggregate exercise amount must be separate fields.

## 3. Canonical data contract

Introduce an optional `contractEconomics` object on each quote/instrument. Do not infer it from the symbol, asset class or venue name.

```ts
type ContractEconomics = {
  premium: {
    multiplier: number;          // quoted premium × contracts × multiplier
    quoteCurrency: string;
    priceUnit: 'PER_UNDERLYING_UNIT' | 'PER_CONTRACT';
  };
  exercise: {
    style: 'EUROPEAN' | 'AMERICAN' | 'BERMUDAN' | 'UNKNOWN';
    settlement: 'CASH' | 'PHYSICAL' | 'FUTURE_DELIVERY' | 'UNKNOWN';
    aggregateExerciseCash?: {
      currency: string;
      strikeMultiplier: number;  // strike × multiplier, if the venue defines it
      fixedAmount?: number;      // explicit per-contract amount when not strike-derived
    };
    settlementCurrency?: string;
    deliverables: Array<
      | { type: 'EQUITY' | 'UNDERLYING'; symbol: string; amount: number; currency?: string }
      | { type: 'CASH'; currency: string; amount: number }
      | { type: 'FUTURE'; symbol: string; amount: number; pointValue?: number }
    >;
  };
  provenance: {
    status: 'PROVIDER_VERIFIED' | 'USER_ASSERTED' | 'SYNTHETIC_DEMO' | 'UNKNOWN';
    provider?: string;
    sourceRef?: string;
    retrievedAt?: string;
    rawFields?: Record<string, string | number | boolean | null>;
  };
};
```

The exact TypeScript shape may be refined during implementation, but the semantic separation is mandatory. Keep legacy `unit` and `contractMultiplier` as adapter inputs during migration; do not treat either as a universal canonical field.

### Required invariants

- All numeric scales must be finite and strictly positive unless a documented deliverable is explicitly zero.
- Currency codes must be explicit and normalized.
- Deliverables must be preserved as a list; never collapse multiple equity/cash components into one number.
- Aggregate exercise cash must be source-defined or model-defined by a validated adapter; never default it to strike × premium multiplier.
- Missing/unknown fields stay unknown.
- A CSV's `venue` string is a user assertion, not provider provenance.
- Demo provenance is assigned by the application, never by CSV data.
- Provider metadata and raw source fields must remain traceable for audit.

## 4. Calculation boundaries

### Premium cash

`premiumCash = premiumPrice × premium.multiplier × contracts + fees`

The premium multiplier is the only scale used for premium debit/credit. Deliverable quantity must not be substituted.

### Exercise package value

For a fully specified physical deliverable, calculate each component independently:

- EQUITY / UNDERLYING: amount × the matching underlying reference price.
- CASH: explicit fixed cash amount in its stated currency.
- FUTURE: only through a futures-specific adapter with a documented point value and delivery semantics.

Do not add unlike currencies without an explicit, sourced conversion. Do not value a deliverable using the option's quote currency by assumption.

### Exercise cash and payoff

For physical delivery, compare the complete deliverable package against the source-defined aggregate exercise cash. Long call/put payoff can only be derived after the adapter establishes the exact exercise obligation and settlement convention.

For cash-settled contracts, use the venue's published settlement formula. Do not infer a cash-settlement formula from a generic European option formula.

### Greeks

Greeks must be produced by a model adapter that knows the economic exposure represented by the deliverables. Do not multiply every Greek by premium multiplier or contract unit as a universal shortcut. Per-unit model Greeks may remain visible, but position-level Greek values must be blocked until their scale is validated.

### Replay and opportunity analytics

Historical replay, expiry EV and opportunity ranking must consume the same canonical economics result as P&L. A quote must not pass one screen's scale check and fail another's.

## 5. Provider adapters and current scope

| Product | Source facts | Initial adapter policy |
|---|---|---|
| Binance Crypto Options | `unit`, quote/settlement assets, European style, USDT settlement | Preserve `unit` as underlying contract unit; only enable calculations covered by a verified Binance crypto adapter |
| Binance Stock Options | `multiplier`, `contractSize`, `deliverables[]`; reference data only | Model the distinct fields, but do not claim live quotes/Greeks; market-data API key and account/product availability remain separate |
| OCC equity options | Standard 100 shares; adjusted multi-component deliveries and fixed cash | Support only when a current contract-level deliverable and aggregate exercise terms are available |
| Futures options | Exchange-specific point value and exercise-to-future mechanics | Unsupported until an exchange-specific specification adapter and independent reference vectors exist |
| Commodity / TradFi options | Product-specific index, settlement and contract terms | Unsupported until exact product specifications and source provenance are mapped |

The current merged guard remains in force until each adapter passes conformance tests. This design does not authorize live orders or private account keys.

## 6. Migration sequence

1. Add the canonical types and validators without changing existing calculations.
2. Add provider adapters that preserve raw fields and provenance.
3. Add premium debit/credit calculation using only `premium.multiplier`.
4. Add physical deliverable valuation and aggregate exercise cash for a narrow standard-equity reference case.
5. Add adjusted equity cases with multiple deliverables and cash-in-lieu.
6. Add Binance Crypto Options settlement and unit reference vectors.
7. Add futures and commodity adapters only when exact contract specifications are sourced.
8. Route P&L, break-even, max-loss, Greeks, EV and replay through the same adapter output.
9. Update CSV v2; keep legacy CSV inspectable but observed-only unless it carries complete explicit economics.
10. Display premium scale, exercise package, exercise cash, currencies and provenance in the contract detail UI.

## 7. Required test vectors

- Binance crypto units 1, 100 and 1,000; verify contract unit and settlement currency are preserved.
- Standard US equity: premium multiplier 100, 100 shares delivered, aggregate exercise cash = strike × 100.
- Adjusted equity: premium multiplier 100, 10 shares plus a fixed cash deliverable, aggregate exercise cash remains independently specified.
- Cash-only adjusted deliverable.
- Multi-component equity + cash deliverable.
- Different premium and settlement currencies; block conversion unless an explicit FX source/rate is supplied.
- Futures option with known point value and a separate futures deliverable.
- Missing multiplier, missing deliverable, unknown settlement, mismatched currency, estimated multiplier, and CSV venue spoofing must fail closed.
- Property tests: premium cost scales only with premium multiplier; exercise payoff changes only with deliverable/exercise terms; changing a venue label cannot change provenance.

## 8. Acceptance criteria

- No calculation path reads legacy `unit` or `contractMultiplier` as a universal substitute for canonical economics.
- Standard and adjusted contract test vectors match official reference examples.
- Premium cost and exercise payoff use different scales where specifications require it.
- Position Greeks are derived from the deliverable-aware model or remain unavailable.
- CSV user assertions never become provider-verified facts.
- Unsupported contracts remain visible as observations without fabricated per-contract values.
- All analytics and replay share the same validated contract-economics result.
- No live order endpoint, account key or paid provider is introduced in this milestone.

## Sources

- Binance Options REST market data: https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-options/api/rest-api/market-data
- Binance Crypto Options Contract Specifications (published 5 January 2026): https://bin.bnbstatic.com/static/cms/cg08ou2ak0tn7mcplvfg/file/443bcc67fde7274898ff8e3f7af23c7d89e654c5e609d250772e0ddaa96409be.pdf
- Binance Stock Options REST market data: https://developers.binance.me/en/docs/catalog/advanced-trading-stock-option-trading/api/rest-api
- Binance Stock Options introduction: https://developers.binance.me/en/docs/products/stock-options/introduction
- OCC Equity Options Product Specifications: https://www.theocc.com/clearance-and-settlement/clearing/equity-options-product-specifications
- OCC Equity Special Settlements: https://www.theocc.com/market-data/market-data-reports/series-and-trading-data/equity-special-settlements
- OCC Characteristics and Risks of Standardized Options: https://www.theocc.com/getmedia/a151a9ae-d784-4a15-bdeb-23a029f50b70/riskstoc.pdf
