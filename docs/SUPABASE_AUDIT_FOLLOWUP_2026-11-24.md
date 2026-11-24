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
- No invocation records for the Rawaa Edge Function IDs appeared in the available 30-day Edge Function log query; the returned records were for the Volterra function only.

This does not prove that no external scheduler exists. It does mean the available project/repository/automation evidence does not establish a working schedule for `rawaa-retention` or `rawaa-outbox`. Confirm the actual scheduler and its authentication before relying on automatic retention or notification delivery.

## Auth leaked-password warning: Free-plan limitation

Supabase's current Password Security documentation says leaked-password protection is available on Pro and above. The organization is on the Free plan. Therefore this warning cannot be cleared as a no-cost setting in the current plan. No upgrade, billing change, or paid workaround was attempted.

## Free-plan reliability and recovery limits

The connected project is on Supabase Free. Current Supabase plan documentation lists these operational constraints:

- Free projects may be paused after one week of inactivity.
- API/database log retention is one day.
- Automated daily database backups and downloadable database backups are not included on Free.
- The Free database allowance is 500 MB and included egress is 5 GB.

The Volterra proxy and rate-limit RPC have recent activity, but that does not replace a recoverable backup or guarantee the project will never be paused. Because the remote schema includes 19 migrations not tracked in Sol, a safe restore/export process is not yet established. Do not perform destructive cleanup until an owner-approved backup/export and restore test exist. No paid plan or add-on was enabled; the current budget constraint remains in force.


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
- No database schema, data, Auth setting, Edge Function, secret, project, or paid plan was changed.
- No Activepieces flow was executed or modified.

## Next actions in priority order

1. Treat `Ghaioooth-core` as a shared backend, not a Sol-exclusive backend. Do not delete Rawaa/Commerce objects until their owner and dependencies are established.
2. Reconcile the 19 remote migrations not tracked in Sol; then decide whether Sol needs a separate no-cost backend. Do not create a paid resource without a separate cost check and approval.
3. Retrieve and inspect source for the three legacy functions with `verify_jwt=false`, verify application-level authentication, and identify external schedulers.
4. Keep the Volterra rate-limit table/function grants locked down; retain the successful RPC path.
5. Continue investigating a licensed, eligible options data source; do not relabel HTTP 451 as account ineligibility or work around regional restrictions.
6. Keep the app in read-only analysis and paper mode; no real order execution is implemented or authorized by this audit.
