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
