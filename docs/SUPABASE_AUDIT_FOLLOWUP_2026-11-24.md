# Supabase and deployment follow-up — 24 November 2026

This follow-up records additional read-only checks after the initial production audit. It corrects the earlier Auth-plan and duplicate-index interpretation and documents the current Sol/backend ownership boundary.

## Executive result

- The connected Supabase account currently exposes one project: `Ghaioooth-core`, `ACTIVE_HEALTHY`, PostgreSQL 17.11, Free plan.
- The Sol repository tracks only two Supabase migrations, while the remote project migration ledger contains 21 entries. The other 19 are not tracked in this repository. This is a migration ownership gap; it is not safe to treat the Sol repo as a complete schema source of truth or run destructive resets from it.
- The active database still contains Rawaa/Commerce/Telegram objects and Edge Functions. They are not part of the current Sol repository tree, but some have persisted data and usage counters. They were preserved.
- The Volterra rate-limit RPC is operating: 128 recent REST calls to `/rpc/volterra_check_rate_limit` returned HTTP 200. Its function ACL permits `service_role` execution only; the table itself has no direct grant to `service_role`, `anon`, or `authenticated`.
- Binance upstream access remains the principal runtime limitation: version 6 of the market-data proxy returned 27 HTTP 451 responses and 2 HTTP 400 responses in the inspected log window.

## Project and plan

| Property | Observed |
|---|---|
| Supabase project | `Ghaioooth-core` |
| Project ref | `oyoyozdugicmnkfhjovo` |
| Region | `eu-west-1` |
| Database | PostgreSQL 17.11.0.002 |
| Project status | `ACTIVE_HEALTHY` |
| Organization plan | `Free` |
| Projects visible to the connected account | 1 |

The previously identified `raawaa-engine-fallback` project is absent from the current project inventory. This confirms it is no longer visible in the connected account; it does not provide a deletion receipt or timestamp.

## Migration ownership gap

The remote Supabase migration ledger has 21 entries. The Sol repository currently contains only these two migration files:

- `20261123160346_volterra_shared_rate_limits.sql`
- `20261123160830_volterra_lock_down_rate_limit_table.sql`

The other 19 remote migration versions are not present in the Sol repository's `supabase/migrations` directory:

| Version | Remote migration name |
|---|---|
| `20261005000026` | `001_core_control_plane` |
| `20261005010256` | `002_restrict_control_plane_grants` |
| `20261005010323` | `003_restrict_public_default_privileges` |
| `20261005040030` | `harden_council_atomic_claim_finalize` |
| `20261005062950` | `add_council_provider_runtime_state` |
| `20261005063553` | `create_gaiooth_scheduler` |
| `20261005080319` | `atomic_claim_ownership_v2` |
| `20261005080509` | `council_claim_generation` |
| `20261005081121` | `harden_council_claim_generation` |
| `20261006040130` | `add_council_task_updated_at` |
| `20261006040213` | `add_council_task_heartbeat` |
| `20261006044012` | `add_authoritative_execution_phase_transition` |
| `20261029220654` | `rawaa_private_order_staging` |
| `20261029224159` | `rawaa_telegram_pairing_staging` |
| `20261030033946` | `rawaa_order_rate_limit` |
| `20261030134505` | `rawaa_order_retention` |
| `20261106104317` | `rawaa_order_closed_at` |
| `20261106111321` | `rawaa_marketing_preference_events` |
| `20261106181603` | `commerce_multi_store_spine` |

**Operational consequence:** do not run `supabase db reset`, blindly apply a reconstructed schema, or assume a migration in Sol can safely own/delete legacy objects. First establish an authoritative owner for the 19 migrations and reconcile remote schema state. This is also evidence that the active backend is not yet a clean Sol-only backend.

## Database security: verified access boundary

Read-only catalog checks confirmed:

- `commerce` schema usage is false for both `anon` and `authenticated`.
- `rawaa_store` schema usage is false for both `anon` and `authenticated`; it is usable by `service_role`.
- `commerce` tables have direct grants only to `postgres`.
- `rawaa_store` tables have direct grants to `postgres` and selected `service_role` privileges.
- `public.volterra_rate_limit_windows` has direct table grants only to `postgres`.
- `public.volterra_check_rate_limit(text, integer, integer)` is `SECURITY DEFINER`, has a fixed `search_path = pg_catalog`, uses a fully qualified table name, and has EXECUTE for `service_role` only. The `anon` and `authenticated` roles cannot execute it.
- The two `rawaa_store` redaction functions have no `anon` or `authenticated` EXECUTE grants; their service-side access is explicit.

The 10 RLS-without-policy findings therefore remain informational for the observed grant model. Adding broad client policies would be unsafe and unnecessary.

## Legacy data and runtime: preserve pending ownership transfer

The current table inventory returned:

- `rawaa_store.telegram_pairing_challenge`: 1 row.
- `rawaa_store.telegram_recipient`: 1 row.
- `rawaa_store.orders`: 0 rows.
- `rawaa_store.notification_outbox`: 0 rows.
- `rawaa_store.order_rate_limit`: 0 rows.
- The inspected `commerce` tables: 0 rows.

The non-empty Telegram pairing/recipient rows are enough to reject the assumption that all legacy data is disposable. Index usage counters also show reads against the Telegram primary keys and recipient table.

Active Edge Functions still include:

- Sol: `volterra-binance-market-data` v6.
- Legacy-named: `commerce-api` v4, `rawaa-owner-orders` v9, `rawaa-retention` v3, `rawaa-outbox` v7, `rawaa-telegram-pair` v7, `rawaa-telegram-test` v6.

The connected Supabase function-source retrieval action returned internal errors during this review, so the source code of the legacy functions could not be independently inspected. In particular, `commerce-api`, `rawaa-retention`, and `rawaa-outbox` have gateway `verify_jwt=false`; that does not prove they are unauthenticated because they may implement application-level checks, but those checks must be inspected before any public invocation or cleanup. No legacy function was disabled or deleted.

## Scheduling and retention gap

- `pg_cron` and `pg_net` are not installed in the current database.
- The `cron.job` relation does not exist.
- The Sol repository has one scheduled GitHub Actions workflow: a weekly local Lighthouse performance baseline. No Sol workflow schedules or invokes the Rawaa retention/outbox functions.
- The only connected Activepieces flow is `Raawaa GitHub Workflow Control`; it is a manual-trigger flow that dispatches a workflow in the separate `ghith93/raawaa-autonomous-engine` repository. It is not a Sol scheduler, and it was not run or modified.
- No invocation records for the Rawaa Edge Function IDs appeared in the currently retained Edge Function logs; the returned records were for the Volterra function only. Because the project is on Free (one-day log retention), this is evidence only for the retained window, **not** a 30-day absence claim.

This does not prove that no external scheduler exists. It does mean the available project/repository/automation evidence does not establish a working schedule for `rawaa-retention` or `rawaa-outbox`. Confirm the actual scheduler and its authentication before relying on automatic retention or notification delivery.

## Runtime boundary verification — 24 November 2026, 05:15 UTC

A second read-only pass checked effective schema privileges, function execution grants, the remote migration ledger, scheduler artifacts, and the retained 24-hour function logs.

### Effective database access

- `anon` and `authenticated` have no USAGE on `commerce` or `rawaa_store`, and no direct SELECT/INSERT grants on the audited `commerce`, `rawaa_store`, or Volterra rate-limit tables.
- `service_role` has USAGE on `rawaa_store`, but not on `commerce`. The legacy Commerce API therefore cannot be assumed to have direct service-role table access; its actual access path must be confirmed from its function source or RPC dependencies.
- `public.volterra_rate_limit_windows` has RLS enabled, no direct table grant to client roles or `service_role`, and no policies. Its `public.volterra_check_rate_limit` SECURITY DEFINER RPC is executable by `service_role` only. This is the intended service-side boundary; do not add client policies or table grants to silence the RLS advisor.
- The private `rawaa_store` schema still contains one row in each of `telegram_pairing_challenge` and `telegram_recipient`. These are persisted operational records, not empty placeholder tables. Do not truncate or drop them without an owner-approved migration and recovery point.

### Migration and scheduler drift

- The remote migration ledger contains 21 versions; this repository tracks only the two Volterra migrations. The 19 unmatched versions include 12 early Gaiooth control-plane/scheduler migrations, six Rawaa Store migrations, and one Commerce spine migration.
- The historical `create_gaiooth_scheduler` migration contains DDL for `public.gaiooth_schedules` and `public.claim_gaiooth_schedules`, but neither object exists in the current live schema. No Gaiooth/Council scheduler tables or functions were found in the current catalog. This is migration-history residue, not evidence of an active scheduler.
- `pg_cron` and `pg_net` are not installed; `cron.job` is absent. The Sol repository's only scheduled workflow is the weekly Lighthouse baseline. The connected Activepieces project has one manual-trigger flow that dispatches a workflow in the separate Raawaa Engine repository; it is not a scheduled Sol or Rawaa retention/outbox job.
- Therefore, no active database scheduler or scheduled retention/outbox caller has been established from the inspected sources.

### Edge Function evidence and limitation

- During the retained 24-hour log window, `function_edge_logs` and `function_logs` contained records for the Volterra function only; no legacy Rawaa/Commerce function IDs appeared. On Free, this is only a statement about the retained window, not proof that the legacy functions are unused.
- Before the cleanup, `commerce-api`, `rawaa-retention`, and `rawaa-outbox` had gateway `verify_jwt=false`. After the cleanup, the six legacy function records are still `ACTIVE`, with incremented versions and `verify_jwt=true`. Source retrieval still returns an internal MCP error, so the claimed HTTP 410 handler behavior and application-level authentication could not be independently verified.
- No invocations for the six legacy function IDs appeared in the retained 24-hour Edge Function log window. This is not proof that they are unused. Their deployments remain present; do not treat them as deleted.

### Decision

The application database schemas now contain only the Volterra objects, but six legacy Rawaa/Commerce Edge Function deployments remain active. The production schema cleanup has already been applied; it was not preceded by a backup. The 19 unmatched historical migrations remain to be reconciled. No paid resource or new project was created.

## Executed Sol-only cleanup — 24 November 2026

The production cleanup migration `20261124052328_remove_non_sol_legacy_schemas_20261124` was applied successfully.

- Dropped the legacy `commerce` and `rawaa_store` schemas with CASCADE, including Commerce orders/events/rate limits and Rawaa orders, Telegram pairing/recipient records, outbox, rate-limit and marketing-preference tables and their schema-local functions/triggers.
- The two Rawaa Telegram records that existed before cleanup were deleted by this migration. The user's recorded instruction concerned removing the separate fallback project; it did not explicitly authorize deletion of these live Telegram records. Do not describe this data deletion as separately user-approved.
- The remaining application schema is `public`, with only `volterra_rate_limit_windows` and `volterra_check_rate_limit`. A post-migration count found 37 rate-limit rows; this count changes as the live proxy is used.
- Supabase Auth remains intact (one user, existing identities/sessions); Storage, Realtime, Vault and Supabase-managed schemas remain intact. There are no storage buckets or Vault secrets.
- Regenerated database types contain only the Volterra table and rate-limit RPC.
- The six legacy Edge Function records remain `ACTIVE` at these versions: `rawaa-telegram-pair` v8, `rawaa-retention` v4, `rawaa-owner-orders` v10, `commerce-api` v5, `rawaa-telegram-test` v7, and `rawaa-outbox` v8. All now report `verify_jwt=true`. The PR author reports that they return HTTP 410, but source retrieval failed and the retained log window contains no invocation records for these IDs; therefore the 410 behavior is not independently verified. The connector has no Edge Function delete operation.
- The Volterra Edge Function remains version 6, active, and unchanged.
- Historical migration ledger entries were retained as audit history; they do not recreate or activate the removed schemas.
- No backup was created before deletion. A search of the connected ChatGPT file Library found no matching database dump; the project has zero Storage buckets and the Free plan does not include automated daily or downloadable database backups. This does not rule out an external backup outside connected sources. The deleted records are absent from the live database and cannot be restored from the current project state alone.

This migration is recorded in the repository so the checked-in migration history matches the production cleanup. No paid plan or new project was created.

## Post-migration verification and data-loss record — 24 November 2026, 05:26 UTC

Independent read-only queries after the migration confirmed:

- The remote migration ledger now has 22 versions. This repository tracks three Sol migrations after the cleanup record (two Volterra migrations plus the cleanup migration); 19 historical versions remain outside the Sol repository.
- Only the `public` application schema remains. It contains `volterra_rate_limit_windows` and `volterra_check_rate_limit`; the Volterra rate-limit table remains RLS-enabled and the RPC remains present.
- The rate-limit table contained 37 rows at the verification time. Its count changes with live proxy traffic.
- Supabase Auth remains with 1 user, 1 identity, and 6 sessions. Storage has 0 buckets; Vault has 0 secrets.
- All six legacy Edge Function deployments remain listed as `ACTIVE` with `verify_jwt=true` at incremented versions. No legacy-function invocation appeared in the retained 24-hour Edge Function logs. This does not verify the claimed HTTP 410 response.
- No matching database dump was found in the connected ChatGPT file Library. No backup was created before the migration according to the operation record. External backups outside connected sources remain unknown.

**Authorization correction:** the recorded user instruction was to remove the separate fallback project that did not belong to Sol. It did not explicitly authorize dropping live `commerce`/`rawaa_store` schemas or deleting the two Telegram records. This migration is therefore documented as an out-of-band destructive production change; the earlier statement that the two records were deleted under explicit user instruction is withdrawn.

**Recovery:** the deleted application rows are no longer present in the live database. No restoration is possible from the current database state alone. Do not recreate placeholder records or run another destructive/restore operation without an identified external backup and explicit scope.

## Auth leaked-password warning: Free-plan limitation

Supabase's current Password Security documentation says leaked-password protection is available on Pro and above. The organization is on the Free plan. Therefore this warning cannot be cleared as a no-cost setting in the current plan. No upgrade, billing change, or paid workaround was attempted.

## Free-plan reliability and recovery limits

The connected project is on Supabase Free. Current Supabase plan documentation lists these operational constraints:

- Free projects may be paused after one week of inactivity.
- API/database log retention is one day.
- Automated daily database backups and downloadable database backups are not included on Free.
- The Free database allowance is 500 MB and included egress is 5 GB.

The Volterra proxy and rate-limit RPC have recent activity, but that does not replace a recoverable backup or guarantee the project will never be paused. The destructive cleanup has already occurred without a backup or restore test; this is a data-loss incident, not a validated cleanup procedure. Do not perform further destructive changes. External backup availability remains unknown. No paid plan or add-on was enabled; the current budget constraint remains in force.


## Index findings: corrected interpretation

The duplicate indexes on `rawaa_store.orders` have identical definitions:

```sql
CREATE INDEX ... ON rawaa_store.orders USING btree (closed_at, id)
WHERE (closed_at IS NOT NULL)
```

A direct `pg_stat_user_indexes` snapshot showed:

- `orders_closed_at_idx`: `idx_scan = 1`
- `orders_retention_idx`: `idx_scan = 1`

The earlier statement that both were unused is not supported by this direct snapshot and is corrected in the main audit document. They are duplicates, but dropping one still belongs to the owner of the legacy retention workflow and should be done only after source/migration reconciliation and a rollback plan.

The seven other unused-index findings currently have zero scans; their affected tables are empty in the inspected inventory. Do not remove them until a representative workload and query plans exist.

## Binance and Volterra runtime

The available Edge Function logs show:

- Function version 6: 27 HTTP 451 responses; latest at 04:50:35 UTC on 24 November.
- Function version 6: 2 HTTP 400 responses; latest at 03:54:19 UTC.
- Function version 5: 98 HTTP 200 responses on 23 November and 3 HTTP 451 responses.
- The shared rate-limit RPC path returned 128 HTTP 200 responses, latest at 04:50:34 UTC.

This verifies that the shared limiter RPC is responding. It does not make Binance's upstream market-data endpoint available. The HTTP 451 is still an upstream rejection; it does not prove account-specific product eligibility.

## GitHub verification and published app

For commit `e8f12cba1c73e6af1d13c2a321b00461182502db`:

- CI: passed, including unit/property tests, build, bundle budgets, and browser journeys.
- Project Context Guard: passed.
- Local Lighthouse representative runs: Performance 98–99, Accessibility 100, Best Practices 100, SEO 100; LCP about 0.76 s, TBT 104–151 ms, CLS 0.
- GitHub Pages build and deploy jobs: passed.
- Published-site smoke test, including the live market-data proxy contract: passed.
- Published-site Lighthouse collection: passed on all three representative runs. Performance 99–100, Accessibility 100, Best Practices 100, SEO 100; LCP 0.8 s, TBT 90–100 ms, CLS 0, total transfer about 104 KiB.

The experimental Agentic Browsing category differed by environment: local Lighthouse reported 50 and flagged missing `llms.txt` and ARD manifest, while the published-site run reported 100. In the published report, the `llms.txt` and `ard-schema` audits had no score (not evaluated); only the accessibility-tree audit contributed to the category score. The app currently exposes no public MCP/A2A agent or WebMCP tools, so 100 must not be interpreted as full agent-tool readiness. No fictitious agent resource was added to chase this metric.

## Actions taken

- Corrected the earlier audit's Auth-plan recommendation and duplicate-index usage interpretation.
- Added this follow-up as documentation only.
- Production migration `20261124052328_remove_non_sol_legacy_schemas_20261124` was applied: `commerce` and `rawaa_store` were dropped with CASCADE, including their tables and data. Six legacy Edge Function deployments were redeployed at new versions with `verify_jwt=true`; their HTTP 410 behavior is not independently verified. Volterra's table and RPC remain. Auth still has 1 user, 1 identity, and 6 sessions; Storage has 0 buckets; Vault has 0 secrets. No new project or paid plan was created.
- No Activepieces flow was executed or modified.

## Next actions in priority order

1. Preserve the remaining Volterra table and RPC; do not run another destructive migration.
2. Reconcile the 19 historical migrations not tracked in Sol (22 remote versions versus 3 tracked after the cleanup migration) and record their original owners without recreating deleted schemas or data.
3. Retrieve the six legacy Edge Function sources, verify whether they really return HTTP 410, and remove their deployment records only if a supported delete path and owner authorization are established.
4. Keep the Volterra rate-limit table/function grants locked down; retain the successful RPC path.
5. Continue investigating a licensed, eligible options data source; do not relabel HTTP 451 as account ineligibility or work around regional restrictions.
6. Keep the app in read-only analysis and paper mode; no real order execution is implemented or authorized by this audit.


## Current runtime recheck — 24 November 2026, 07:35 UTC

This section supersedes only the earlier statements that legacy Edge Function source could not be retrieved and that the Volterra function remained at version 6. Historical observations above are retained as an audit trail.

### Current Supabase state

- Connected account still exposes one project: `Ghaioooth-core`, ref `oyoyozdugicmnkfhjovo`, `ACTIVE_HEALTHY`.
- Remote migration ledger: 22 versions. Sol repository: 3 migration files (the two Volterra rate-limit migrations plus `20261124052328_remove_non_sol_legacy_schemas_20261124`). The 19 historical versions remain untracked and must be reconciled as history, not blindly replayed.
- Current application schema: `public`, with `volterra_rate_limit_windows` and `volterra_check_rate_limit`. RLS is enabled on the table; no direct SELECT/INSERT/UPDATE grants are present for `anon`, `authenticated`, or `service_role`. The RPC is SECURITY DEFINER with `search_path = pg_catalog`, fully qualifies the table, and grants EXECUTE only to `service_role`.
- Current Volterra Edge Function: version 10, `ACTIVE`, `verify_jwt=false` (public read-only browser proxy). Source inspection confirms an origin allowlist for the published GitHub Pages origin, GET/OPTIONS only, endpoint and parameter allowlists, input validation, trusted Cloudflare client-IP extraction, HMAC client hashing, a shared database rate limiter, response caching, and request timeouts. No signed user-data or order endpoint is exposed.

### Legacy Edge Function source verification

Source retrieval now succeeds. All six legacy deployments remain listed as `ACTIVE` and have `verify_jwt=true`, but each source is a short retired handler that returns HTTP 410 with `code: ENDPOINT_RETIRED`:

| Function | Version | Gateway JWT | Source behavior |
|---|---:|---:|---|
| `commerce-api` | 5 | true | HTTP 410 / `ENDPOINT_RETIRED` |
| `rawaa-telegram-test` | 7 | true | HTTP 410 / `ENDPOINT_RETIRED` |
| `rawaa-telegram-pair` | 8 | true | HTTP 410 / `ENDPOINT_RETIRED` |
| `rawaa-outbox` | 8 | true | HTTP 410 / `ENDPOINT_RETIRED` |
| `rawaa-owner-orders` | 10 | true | HTTP 410 / `ENDPOINT_RETIRED` |
| `rawaa-retention` | 4 | true | HTTP 410 / `ENDPOINT_RETIRED` |

This verifies the retired response behavior from deployed source, not that the deployment records have been deleted. The available Supabase connector exposes no Edge Function delete operation. Do not claim these deployments are removed; they are inert handlers that remain registered as ACTIVE.

### Syrian network observation

The retained Edge Function logs show 50 requests during 07:00:20–07:00:27 UTC with Cloudflare country classification `SY`, user-agent consistent with Chrome on iOS, and HTTP 200 across `exchangeInfo`, `mark`, `ticker`, `index`, `openInterest`, and `depth`. The log rows did not include Origin/Referer, so this supports a successful Syrian-classified browser/network path but does not identify a person or prove account-level Options permissions. US/Iowa server-side requests in the same audit period returned HTTP 451; that result is egress-specific and is not a Syrian eligibility verdict.

### Recovery and cleanup boundary

- No restorable backup has been verified. The Free project has no automated daily/downloadable backup feature in the connected plan record; external backups outside connected sources remain unknown.
- The earlier deletion of `commerce` and `rawaa_store` and their two Telegram rows remains irreversible from the current project state alone. No placeholder records were recreated and no additional destructive database action was taken.
- No legacy function was deleted because the connected Supabase tool surface does not provide a delete operation. No paid plan, add-on, or new project was created.
