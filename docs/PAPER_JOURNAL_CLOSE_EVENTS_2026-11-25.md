# PAPER journal entry and close events — 25 November 2026

## Delivered in this change

The local PAPER journal now has a canonical early-close path for Binance Crypto Options long positions.

- Entry uses the observed best Ask from `BOOK_TICKER`, with enough displayed Ask quantity in explicit `CONTRACTS` units.
- Close uses the observed best Bid from `BOOK_TICKER`, with enough displayed Bid quantity for the entire recorded position.
- Both paths require matching source event and local receive clocks, a timestamped index, no future timestamps, a five-minute freshness limit, and an unexpired contract.
- A close must match the original symbol, underlying, side, strike, expiry, venue, asset class, underlying kind, unit, quote currency and canonical contract-economics snapshot.
- A close event is appended to a separate local event log. It does not overwrite the original entry record.
- Simulated net PAPER P&L is calculated as Bid-side premium proceeds minus explicitly entered exit fees and the original entry debit.
- The campaign-risk ledger reserves full entry debit for open positions. Closed positions consume cumulative realized PAPER losses; realized profits offset prior losses but risk usage never becomes negative.
- Event JSON is runtime-validated. Invalid or duplicate events are quarantined as raw JSON before the active list is rewritten. Conflicting recovery snapshots or failed preservation block further closes.
- The UI exposes mobile and desktop close controls, event export, recovery export, and explicit recovery retry.

## Fee treatment

Exit fees are an explicit user-entered amount, not a silent zero or hard-coded universal rate.

Binance's public [Options Trading Fees FAQ](https://www.binance.com/en-PH/support/faq/detail/5326e5de61c34fed98abe28d2f175a23) describes a trading-fee formula based on the Spot Index, contract unit, option traded price and traded size, with a published 0.024% example rate and a cap. The same page says it is general information and may be outdated; the applicable fee schedule can depend on current terms and account conditions. The PAPER close therefore requires a manually entered exit-fee amount and records its provenance as `USER_ENTERED`. It does not claim an exchange-confirmed fee.

## What this does not model

- Partial fills, queue position, market impact, hidden depth, order latency, or guaranteed execution. Displayed top-of-book quantity is only a snapshot.
- Slippage beyond the conservative use of Bid for a long close.
- Automatic fee-tier lookup, exercise fees, expiry settlement, assignment, delisting/removal settlement or the 30-minute arithmetic-mean expiry process.
- Amendments, scale-outs, multiple close legs, mark-to-market history, Greek snapshots, forecast-versus-outcome review, or strategy-level performance analytics.
- Live orders, account connectivity, funds movement or realized account profit.

Expired contracts are rejected by the early-close path. Expiry/settlement requires a separate model and data-quality gate.

## Storage and recovery

- Entry records remain under `volterra-paper-trades-v1`.
- Close events are stored under `volterra-paper-close-events-v1`.
- Raw recovery snapshots use separate `*-recovery-v1` keys.
- Data remains in this browser's `localStorage`; it is unencrypted and not a cloud or cross-device archive.
- Export both the entry CSV and close-event JSON before resetting a campaign or clearing browser data.
- The append operation checks for concurrent modification, but browser `localStorage` does not provide a transactional compare-and-swap. Avoid editing the same PAPER journal from multiple tabs simultaneously.
- The close-event recovery key is preserved during campaign reset; it must be exported and explicitly acknowledged before being cleared.

## Campaign-risk accounting

For a supported currency, current usage is:

`open entry debit + max(0, -sum(closed net PAPER P&L))`

Orphaned, duplicate, contract-mismatched or unreconciled close events block new campaign allocation. This is a conservative local PAPER budget, not an exchange-side risk limit or account balance.

## Verification boundary

The implementation is covered by offline unit/property tests and the repository's CI, browser journeys, Lighthouse and Project Context Guard. It does not prove that Binance is reachable or legally available from a particular network/account. No real market capture, live order, cloud archive, or profitable strategy result is claimed.
