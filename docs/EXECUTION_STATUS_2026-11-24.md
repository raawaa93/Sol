# Sol Completion Execution Record — 24 November 2026

Base: `main` at `853035548878eef674d5b525df8d54ea634f520a`.
Execution branch: `execution/sol-completion-2026-11-24`.
Scope: close the remaining safety, analytics, recovery, market-data and governance gaps without changing production financial data or enabling live trading.

## Bundle budget fix — 25 November 2026

Issue #161 is addressed in the isolated branch `fix/bundle-budget-161-isolated-2026-11-25`, based on origin/main at `82312ae958f548375c395550bb2e96fb5dc13cfa`.

The chart implementation no longer loads Recharts or D3 chart-vendor chunks. The volatility smile, term structure and payoff views use lightweight responsive SVG with native `<title>` tooltips and retain the existing units, data labels and empty states. Historical replay is lazy-loaded behind a Suspense fallback so that CSV/replay code is not required for the initial application shell.

Measured in the isolated branch:

- Unit/property tests: 209/209 pass.
- Browser journeys: 17/17 pass.
- Production build: pass.
- Initial JavaScript: 97.210 KiB / 100 KiB pass.
- All JavaScript: 111.525 KiB / 240 KiB pass.
- CSS: 13.571 KiB / 14 KiB pass.
- Project Context Guard: pass.
- Production dependency audit: 0 vulnerabilities.

Lighthouse and production URL smoke were not run because Chrome and `PUBLISHED_URL` are unavailable in the current execution environment. These gates remain to be reported by CI or the owner with the appropriate environment.

## Verified baseline

- Main CI run `45400201639` completed successfully at 13:08 UTC. Unit/property tests, mocked backup orchestration, build, bundle budget and Playwright browser journeys all passed.
- PRs #128, #129, #132, #133, #135, #136, #141, #143, #144, #145, #146 and #147 are merged.
- Binance public market-data calls were observed returning HTTP 200 from requests classified as Syria and Great Britain through Supabase Edge region `eu-west-2`; US egress requests returned 451. This is historical telemetry, not a guarantee for a particular device, ISP or account.
- The Supabase production project is ACTIVE_HEALTHY. Do not reset it or replay unmatched migration history.
- Backup workflow and mocked tests exist, but the prior production workflow skipped because required Actions configuration was missing. No encrypted production backup or isolated restore has been evidenced.
- Branch-protection administration is unavailable to the current GitHub integration; #113 remains owner-action required.

## Workstream A — canonical option economics (P0)

Current code has canonical contract types/validation, premium cash, deliverable valuation, aggregate exercise cash, and cash-settlement payoff primitives. Binance Crypto and Stock Options reference adapters exist. CSV v2 preserves canonical fields but imported provenance is USER_ASSERTED.

Remaining:
- Route every production consumer (trade cost/credit, position sizing, break-even, max loss, position Greeks, opportunity EV, paper journal, replay and export/import) through one validated provider/model capability result.
- Preserve independent scales: premium multiplier, underlying/deliverable quantity, aggregate exercise cash, currencies and settlement formula.
- Keep unsupported products observed-only. No inference from symbols, matching scalar values or CSV claims.
- Add provider-backed Binance vectors for units 1/100/1000 and independently sourced standard/adjusted equity vectors. QuantLib may be used as a comparison engine, never as the authority for exchange terms.
- Add UI provenance and unsupported-reason display.
- Futures and commodity adapters remain blocked until exact exchange terms and point values are sourced.

Acceptance: all consumer paths have shared conformance tests and no legacy scalar fallback for unsupported products; full CI and browser journeys pass.

## Workstream B — encrypted production backup and restore (P0)

Workflow: `.github/workflows/supabase-backup.yml`; script: `scripts/backup-supabase.sh`.

Owner prerequisites:
1. Configure repository Actions secret `SUPABASE_DB_URL` with the Sol project's Session Pooler connection URL.
2. Configure repository Actions variable `AGE_RECIPIENT` with the public `age1...` recipient.
3. Keep the private age identity offline and outside GitHub, chat, commits, logs and artifacts.
4. Manually run the workflow.
5. Verify a ciphertext-only release asset, hash and size.
6. Perform a restore drill only against an explicitly disposable isolated target, never production. Verify schema and essential records, document excluded Auth/Storage object bytes/Edge secrets/project settings.

No secrets should be requested in chat. Do not run a production dump until the owner has configured the required Actions values and started the workflow.

## Workstream C — Binance data reliability (P1)

- Preserve the global public Options API host and documented endpoints; do not route to Binance.US or attempt regional-policy circumvention.
- Distinguish CI runner egress from Supabase Edge and end-user browser egress.
- Validate the published application from the target device/network with read-only requests; record timestamp, endpoint, status and data freshness without storing sensitive network identifiers.
- Verify REST snapshot, all documented WebSocket streams, reconnect behavior, stale-event rejection and source timestamps.
- Do not claim that a green CI run proves live Binance connectivity.

## Workstream D — Supabase and migration safety (P1)

- Keep the 19 unmatched historical migration versions untouched pending a reviewed reconciliation against actual schema history.
- Do not reset, repair migration history, drop tables or delete legacy functions as part of this execution.
- Six retired functions return HTTP 410 but remain registered. Decommission only after verifying no caller, dependency, scheduled invocation or recovery need remains.
- Keep the rate-limit table private with RLS enabled.
- Document Free-tier leaked-password protection limitation; no plan upgrade or spending without explicit authorization.

## Workstream E — repository governance (P1)

Issue #113 records that main was unprotected and no rulesets existed. The connected integration cannot administer branch protection/rulesets. Owner must configure:
- Require pull requests for main.
- Require CI, Project Context Guard and deployment/smoke checks as appropriate.
- Block force-push and deletion.
- Do not require a second human reviewer for this single-owner workflow.

## Workstream F — local finance data (P2)

- Current financial records and portfolio holdings remain in browser localStorage; no server sync or encryption is claimed.
- Keep local JSON export/import and legacy backup compatibility.
- Before adding cloud sync, design encryption, recovery, conflict handling and cross-device authentication. Never collect broker credentials or account secrets.
- Current manually sourced prices/FX must remain visibly attributed with source and observation date.

## Execution log

### 2026-11-24
- Rechecked GitHub main, open PRs/issues, latest CI run and jobs.
- Latest main CI run #490 / run ID `45400201639`: success.
- Created this execution branch and record. No production database, credentials, billing, Binance account or trading endpoint was changed.
- Remaining blockers are explicitly separated into code work and owner-only configuration.

## Definition of completion

Do not close #91 until all canonical consumers are migrated and independently tested.
Do not close #106/#33 until an encrypted production backup exists and an isolated restore drill succeeds.
Do not close #113 until branch protection is verified from GitHub.
Do not claim Binance live-data readiness until the published app is tested from the intended end-user network.

## Execution continuation — 25 November 2026, 03:32–03:35 UTC

### Merged and verified

- PR #165 merged to main as 4df6c5b9690f4cd2759b5fc10f1dbc48f98657c1 (squash). Issue #161 closed automatically. It replaces Recharts/D3 charts with lightweight accessible SVG, lazy-loads historical replay, removes the unused Recharts dependency and preserves existing bundle thresholds. PR-head evidence: 209/209 tests, build, 17/17 E2E, bundle budgets (Initial JS 97.210/100 KiB; All JS 111.525/240 KiB; CSS 13.571/14 KiB), Project Context Guard and production dependency audit (0 vulnerabilities). PR-head Lighthouse run succeeded; published-site smoke was skipped.
- PR #164 merged to main as 33d7da6dca885b3aab0b5903acc998fda4c58c95 (squash). It corrects Binance Options stream attribution and explicitly marks archive/PIT modules, durable storage, collector and historical quote history as NOT DELIVERED / NOT VERIFIED on main. Project Context Guard succeeded on PR head 9c29abdaede73d1648b2a2ebd2b48ac205a02fb9.

### Post-merge regression requiring repair

The post-merge main CI run 45540686865 on 4df6c5b9690f4cd2759b5fc10f1dbc48f98657c1 failed: 208/209 tests passed. The failing test is src/lib/csv.test.ts:114, “missing IV is solved only when explicit European spot contract mechanics are supplied”; the expected inferred IV near 0.4 was not produced. The GitHub Pages build/deploy run 45540686881 was blocked by the same test failure. Do not treat the deploy as successful. Project Context Guard passed on the subsequent docs merge. Lighthouse run 45540687041 was still in progress at the time of this record.

### Delegated active work

- A detailed continuation task was posted to Copilot on issue #91: repair the regression first, then continue Phase 3/4/5 canonical economics routing with fail-closed behavior and full tests.
- A separate continuation task was posted to Copilot on issue #159, explicitly preserving the existing isolated archive worktree. The old bundle gate is now fixed; Copilot must rebase carefully, verify the updated budget, and continue archive/collector work with fake transport first and no production writes/live capture.
- Issue #106 was updated: Actions secret values cannot be inspected; no production backup or restore is claimed. The connector exposes no workflow-dispatch action in this session.
- Issue #113 was updated: the connected GitHub integration exposes branch-protection/ruleset reads only; no write action is available. main remains unprotected until configured in GitHub settings. Public repositories can use branch protection on Free.

### Safety boundary retained

No production database connection/dump, migration, data deletion, credential read/write, live order, paid service, new cloud resource, live market capture, or regional-policy bypass was performed. No backup/restore success is claimed. Current main SHA at record time: 33d7da6dca885b3aab0b5903acc998fda4c58c95.

### Related issues reconciled

- PR #158 merged on 25 Nov 2026 as the current main baseline `82312ae958f548375c395550bb2e96fb5dc13cfa`; its CI, Lighthouse and Project Context Guard runs all succeeded. It delivers the Binance observed-IV Greek recalculation guard and stale-model-Greek clearing. Issue #150 is now closed as completed, with the separate bundle-budget portion completed by PR #165.
- Issue #161 was closed automatically by PR #165. The later main CI regression is independent of the chart/bundle change and remains assigned for investigation in the #91 continuation.


## CSV IV regression resolved — 25 November 2026, 03:37–03:39 UTC

- PR #166 merged by squash as `736063faa78fcbb8012147a7f4bf18be8e35df9a`: https://github.com/raawaa93/Sol/pull/166
- Root cause was a non-deterministic test fixture, not the pricing engine. The test generated a 30-day Black-Scholes price from `Date.now()` but assigned a fixed historical CSV source timestamp (`2026-11-23T14:00:00Z`). The importer correctly valued historical time-to-expiry from the source timestamp, so the solver was given a different maturity than the price generator.
- The test now uses one fixed `referenceTime` to generate expiry and passes that same timestamp as the CSV import reference time. No production code, assertion, tolerance, pricing model, fail-closed guard or CI budget was changed.
- PR checks all passed: unit/property tests; mocked encrypted-backup orchestration; production build; compressed bundle budget; Playwright browser journeys; Project Context Guard; Lighthouse baseline. The published-site smoke check was skipped by workflow conditions.
- The merge commit is now the `main` head. Post-merge checks (CI/build, Lighthouse and deploy) were still running at the time of this record; their final outcomes must be checked separately before claiming the published site was redeployed.

### Remaining P0 integration audit

Canonical economics are now wired into the live Binance path in stages:
- PR #167 routes premium debit/affordability and cash-settled break-even, max-loss and expiry scenarios through separate canonical premium and settlement multipliers.
- PR #168 blocks legacy scalar analytics for every quote carrying canonical terms, including unit=1.
- PR #170 adds a risk-neutral expiry diagnostic for verified Binance European cash-settled INDEX contracts, with observed IV/rate and timestamp gates.
- PR #172/#175 add a PAPER entry audit snapshot with strict price/source consistency.
- PR #177 adds position Greeks/shock sensitivities for a narrow verified model adapter; PR #180 corrects the `vo` versus explicit mark-IV provenance before treating those Greeks as enabled.

Still incomplete: PAPER mark-to-market, amendments, exits and simulated P&L; full point-in-time replay; portfolio-level risk aggregation; and verified strategy performance. Issue #91 remains open.

### Archive worktree and replacement foundation

The old isolated worktree `research/options-pit-archive-2026-11-24` remains unavailable through the current GitHub integration. A replacement local archive foundation is being developed in PR #176: content-addressed append-only segments, integrity/idempotency, writer lease and crash recovery, PIT gates, contract-spec snapshots and fake-transport parsers. PR #176 is not merged yet and does not include a real network transport or durable cloud storage. No live capture or production persistence has started.


## Canonical Binance cash-settlement integration merged — 25 November 2026

- PR #167 merged as `acd5efcdbec53c2fbcee27a0a4e198a85454eb64`: https://github.com/raawaa93/Sol/pull/167
- Verified the Binance live adapter attaches provider-verified `contractEconomics` from explicit exchangeInfo product-family fields; source index timestamp is retained.
- Premium debit and affordability now use the independent premium multiplier; break-even, max loss and expiry scenarios use the independent cash-settlement multiplier.
- No legacy scalar fallback is allowed for a quote carrying canonical terms, even at unit=1. Dedicated capabilities now exist for EV (#170), PAPER entry capture (#172/#175) and position Greeks (#177); PAPER lifecycle valuation and replay remain gated.
- PR CI, build, bundle budget, Playwright journeys, Project Context Guard and Lighthouse passed. Published-site smoke-test job was skipped by workflow conditions; no post-merge published-site verification is claimed.
- A subsequent audit identified that the standalone GreeksPanel and direct risk-neutral EV function still accepted the old unit=1 parity path for canonical quotes. A dedicated follow-up branch now centralizes the legacy capability gate and adds regression tests; see PR to follow.


## Canonical cash risk-neutral EV merged — 25 November 2026

- PR #170 merged to main as `71a8a027659e880f22aa3b998b0c075c1a071bd3`: https://github.com/raawaa93/Sol/pull/170
- Adds a fail-closed risk-neutral expiry diagnostic for provider-verified Binance European Crypto Options cash-settled to INDEX.
- Separates premium and cash-settlement multipliers; calculates probability of ITM and probability of positive expiry P&L independently; includes supplied fees in expiry P&L.
- Requires observed IV, valid timestamped index, observed risk-free rate and model metadata; 0% carry remains an explicit assumption in UI.
- Binance per-underlying model price/Greeks normalize to per-contract only through verified canonical cash scale (premium multiplier 1). Unknown products remain blocked.
- CI, Project Context Guard and Lighthouse passed on PR head; its own published-site smoke job was skipped. A later mainline deployment and published-site smoke test passed after PR #172 and PR #177. No strategy profitability or historical edge claim.
- Remaining canonical work: PAPER lifecycle valuation (mark-to-market, amendments, exits, simulated P&L) and point-in-time replay. Binance position Greeks are merged in PR #177; canonical EV is merged in PR #170; PAPER entry snapshots are merged in PR #172/#175.


## Canonical Greek/EV safety gate merged — 25 November 2026

- PR #168 merged as `f39ffde79b25ca3fd5416fa075ad1b1e7b3c3958`: https://github.com/raawaa93/Sol/pull/168
- Shared `hasLegacyScalarAnalyticsCapability` now blocks all legacy scalar analytics for quotes carrying canonical economics, including unit=1.
- GreeksPanel position-level Greek totals and shock P&L were initially blocked pending a model-specific adapter; PR #177 now enables them only through a narrowly scoped, provider-verified Binance model-Greek capability. Legacy scalar paths remain blocked for canonical quotes.
- Unit/property tests, mocked backup tests, build, bundle budgets, Playwright, Project Context Guard, Lighthouse, main CI, GitHub Pages deploy and published-site smoke test all passed.

## Canonical PAPER entry journal merged — 25 November 2026

- PR #172 merged as `8ed00109bc6a265e463bab7f0c7a1809884a1594`: https://github.com/raawaa93/Sol/pull/172
- PR #175 merged as `9ca75b1622e79f9adf70c558a7f7052a70d2a75c`: https://github.com/raawaa93/Sol/pull/175
- The journal captures provider-verified Binance Crypto Options contract terms, independent premium multiplier and contract unit, premium debit, observed price basis and matching source timestamps.
- Mixed-source BBO, REST 24h ticker closeTime as a BBO event timestamp, model prices, CSV provenance and mismatched entry price/index reference are rejected.
- This remains an entry audit snapshot only. No mark-to-market, amendments, exits, simulated P&L, Greeks, EV or replay are inferred from stored snapshots. Browser local storage is not a durable server journal.
- PR #169 was superseded and closed unmerged; its successor #172 and hardening #175 are the delivered mainline work.
- CI, Project Context Guard, Lighthouse, GitHub Pages deployment and published-site smoke test passed on the merged mainline commits.

## Canonical Binance model position Greeks merged — 25 November 2026

- PR #177 merged as `3bb464ca3bb0f998e8f538c244d49e855232b006`: https://github.com/raawaa93/Sol/pull/177
- Enables position Greeks and local Greek shock estimates only for provider-verified Binance European Crypto Options cash-settled to INDEX, with premium multiplier=1, cash multiplier=unit, observed IV, model metadata, and exact index/mark-IV timestamps.
- Outputs are model sensitivities under explicit Black–Scholes/Carry assumptions, not observed Greeks, forecasts or trading signals. Unsupported products and incomplete/stale inputs remain blocked.
- CI, Project Context Guard and Lighthouse passed. GitHub Pages deployment and published-site smoke test also passed on merge commit `3bb464ca3bb0f998e8f538c244d49e855232b006` (run 45546747830): https://github.com/raawaa93/Sol/actions/runs/45546747830.

## Canonical PAPER entry source consistency hardening — 25 November 2026

- Reapplied the PAPER entry snapshot changes on top of current main after PR #169's original branch became non-mergeable following intervening canonical analytics merges.
- Entry snapshots accept only provider-verified Binance Crypto Options economics and a timestamped observed price basis. The captured premium must exactly match the selected source basis within a tight numeric tolerance, and the captured underlying reference must match the timestamped index value.
- Mixed BookTicker/OptionsTicker bid/ask pairs without a single coherent source are rejected; REST 24h ticker closeTime is not accepted as a bid/ask event timestamp.
- Premium cash uses the canonical premium multiplier only; contract unit and cash settlement multiplier remain separate.
- This remains an entry audit snapshot only. No mark-to-market, exits, realized P&L, Greeks, EV or replay are enabled. Local browser storage is not a durable server journal.
- Follow-up PR #175: https://github.com/raawaa93/Sol/pull/175. Merged as `9ca75b1622e79f9adf70c558a7f7052a70d2a75c`; CI and published-site verification passed.


## Binance legal-terms provenance merged — 25 November 2026

- PR #185 merged as `96b9050fe430d2574b0927195996c62e1baa3ca7`: https://github.com/raawaa93/Sol/pull/185
- Binance Crypto Options European exercise/cash INDEX assumptions now retain the published Contract Specifications and Clearing Procedures references, scoped to Binance RIE/RCH with account-specific applicability marked UNVERIFIED.
- Exercise/settlement-dependent adapter readiness fails closed if the exact exchangeInfo source, product-family fields or legal terms provenance are absent. Independently verified per-contract premium arithmetic remains available.
- Opportunity Review and GreeksPanel disclose the conditional legal scope.
- Main CI run 45549655174, Project Context Guard 45549655188, local Lighthouse 45549655137, deployment build/deploy, published app and market-data-proxy smoke check, and published-site Lighthouse all passed (deployment run 45549655164).

## Durable local options archive foundation merged — 25 November 2026

- PR #176 merged as `8dcd251e2cc6c03dccf04b82c0cd48eb2ada59a2`: https://github.com/raawaa93/Sol/pull/176
- Adds a Node-only local archive writer, content-addressed segments, raw-payload hashes, deterministic idempotency, cursor-after-durable-commit, quota, integrity checks, symlink protection, same-host serialized writer lease, orphan-temp recovery, atomic local export/restore, point-in-time eligibility gate, and fake-transport-first public stream parsing.
- Adds a strict injected `exchangeInfo` contract-spec mapper, with independent premium multiplier and cash settlement multiplier, exact underlying match, trading-status checks, event/availability clocks and separate legal terms references. The legal terms scope is explicitly Binance RIE/RCH; account-specific applicability is not yet verified.
- CI run 45548127457, Project Context Guard 45548127433, Lighthouse 45548127475, deployment 45548127461 and published-site smoke test all passed.
- No real Binance HTTP/WebSocket transport, automatic `exchangeInfo` refresh, cloud archive, or market capture is delivered. No historical edge or profitability claim.


## Binance mark-IV source provenance correction merged — 25 November 2026

- PR #180 merged as `762918f8e95c958e8013512a623341d83946e20a`: https://github.com/raawaa93/Sol/pull/180.
- Binance `vo` is now preserved as venue-reported volatility, not relabelled as observed `markIV`.
- Observed mark IV is accepted only from the explicit `markIV` field, with `markIvSource=OPTION_TICKER` and a matching event timestamp. Mark-price events cannot create an IV timestamp.
- Canonical position Greeks remain fail-closed when this explicit IV source is absent. No live trading is enabled.
- PR CI, Project Context Guard and Lighthouse passed. Subsequent mainline deployment and published-site smoke test passed on the archive merge (run 45548127461).


## Execution continuation — 25 November 2026, 04:11–05:03 UTC

### Canonical economics and data provenance

- PR #170 merged as `71a8a027659e880f22aa3b998b0c075c1a071bd3`: risk-neutral cash-settled expiry EV for the narrow verified Binance Crypto Options adapter. This remains a risk-neutral model diagnostic, not a real-world forecast or evidence of profitability. The model assumes carry=0 and approximates the exchange's 30-minute arithmetic-average settlement.
- PR #172 merged as `8ed00109bc6a265e463bab7f0c7a1809884a1594`, with PR #175 hardening merged as `9ca75b1622e79f9adf70c558a7f7052a70d2a75c`: canonical local PAPER entry snapshots now preserve contract economics, premium scale, price source and source timestamps; reject mixed-source BBO, untrusted CSV provenance, mismatched premium and mismatched index reference. This is an entry audit snapshot only, not a PAPER lifecycle/P&L engine.
- PR #177 merged as `3bb464ca3bb0f998e8f538c244d49e855232b006`: narrowly gated position Greeks and shock sensitivities for the verified Binance adapter only.
- PR #180 and PR #187 corrected Binance IV and stream provenance. PR #187 merged as `41a94cd2c08472e3c4d0d77e70e34782f9fc2200`: explicit REST markIV is separate from venue `vo`; REST mark receive time is captured independently; 24-hour ticker closeTime is not treated as trade/BBO time; out-of-order mark events cannot overwrite a newer index; stale or mismatched source inputs hide canonical model Greeks and EV. PR #187 passed CI, Lighthouse and Project Context Guard. Duplicate PR #188 was closed unmerged after a TypeScript build failure.
- PR #182 merged as `51424aaa54d5163349817d17982937a69faf9523`: UI discloses the 30-minute index averaging settlement approximation.
- PR #185 merged as `96b9050fe430d2574b0927195996c62e1baa3ca7`: Binance RIE/RCH legal-source provenance is recorded; applicability to the user's exact account/entity remains UNVERIFIED.
- PR #186 merged as `19d47c1101511a6458b113f1322a4e10ebbdfcfe`: Binance market-depth panel is deferred to preserve the initial JS budget.

### Options archive progress

- PR #176 merged as `8dcd251e2cc6c03dccf04b82c0cd48eb2ada59a2`: durable local Node archive foundation, integrity/idempotency, same-host writer lease, crash replay, quota, export/restore, PIT gate and fake-transport event parser.
- Main commit `d67d5629c61369dc388e42216b768a6466a38b12` adds opt-in injected REST `exchangeInfo` refresh, five-minute default rate limit, durable raw snapshot before publishing updated contract specs, lease renewal and fake-transport tests. It remains OFF by default and has not been tested against Binance live.
- There is still no real WebSocket transport, live market capture, cloud archive, scheduled worker or historical PIT dataset. Do not claim a historical edge or profitability.

### Verification at last check

- Main CI on `d67d5629c61369dc388e42216b768a6466a38b12`: success (run 45550879596).
- Project Context Guard: success (run 45550879632).
- Lighthouse and GitHub Pages deployment were still in progress at the last check; their final results must be verified before claiming the latest published site is current.
- No production Supabase writes/migrations, new cloud resources, paid services, API credentials, private streams, live orders or funds movement were used.

### Remaining priorities

1. #91 remains open until every supported consumer path has independent conformance vectors and unsupported multi-market products remain fail-closed.
2. #159 remains open: add remaining crash/restore fault-injection coverage, then a compliant opt-in public WebSocket transport and supervised worker only after eligibility/legal gates are satisfied.
3. #155 depends on actual compliant event capture; order-flow parser alone is not an operational order-flow dataset.
4. #153 needs append-only mark/Greek snapshots, amendments, exits and simulated P&L; current PAPER feature records entry snapshots only.
5. #152/#160 need timestamped licensed/eligible point-in-time data and out-of-sample validation before opportunity ranking or strategy performance can be claimed.
6. #106 still has no encrypted production backup or isolated restore evidence; the last known workflow skipped for missing Actions configuration.
7. #113/#179 remain owner/dashboard actions: GitHub main protection is not enabled through the current connector, and Supabase Free does not provide the leaked-password protection setting without an upgrade. No spending or upgrade is authorized.
