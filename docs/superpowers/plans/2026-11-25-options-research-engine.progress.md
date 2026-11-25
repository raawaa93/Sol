## Summary

Implements the first vertical slice of source-bound historical IV analytics in the isolated feature branch.

## Implemented on this branch
- Pure daily IV Rank / IV Percentile calculation with source-series isolation, one sample per UTC day, stale/future rejection, minimum sample threshold, partial-history reporting and flat-range handling.
- Near-30-day ATM REST mark-IV extraction from fresh paired CALL/PUT observations, with strict source/timestamp checks and variance-time interpolation only when expiry points bracket 30 days.
- Versioned, bounded browser-local IV history with idempotent append, corruption/quota errors, retention limits and JSON export.
- UI integration for IV Rank, IV Percentile, sample coverage and local backup.
- Regression tests for analytics and persistence.

## Verification status
- An earlier CI build identified two TypeScript errors: IV persistence effect declared before its memoized input, and an optional venue not narrowed. Both were corrected in later branch commits.
- A fresh CI run against the latest branch head is still required. Do not treat the branch as build-verified until it passes.
- This branch does not contain a historical year of IV data; Rank/Percentile remain unavailable until 30 distinct valid daily observations exist.
- No real market capture, paid feed, cloud archive, live orders or strategy performance claims.

## Remaining work
1. Run fresh CI against the current branch head; fix all failures.
2. Review IV extraction against the actual Binance REST mark payload and existing OptionQuote provenance fields; add tests for any uncovered mismatch.
3. Complete UI tests and CSS/UX disclosure for warming, stale, Demo and partial-history states.
4. Review PR #192 WebSocket transport and resolve its overflow/close-code semantics; merge only after its own CI passes.
5. Complete replay/data prerequisites and document what cannot be made empirical without a valid point-in-time dataset.
6. Update mainline product/research status only after verified merge and deployment evidence.