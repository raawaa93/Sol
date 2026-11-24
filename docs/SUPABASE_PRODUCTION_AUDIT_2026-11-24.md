# Supabase production audit — 24 November 2026

## Scope and evidence

Read-only review of the Supabase projects visible to the connected account, the active Volterra project metadata, database advisors, table grants/RLS policies, indexes, migration history, and the `raawaa93/Sol` repository configuration.

No database schema, data, Auth setting, Edge Function, credential, or project was changed during this audit.

## Project inventory

- The connected Supabase account currently lists exactly one project: `Ghaioooth-core` (`oyoyozdugicmnkfhjovo`).
- Its status is `ACTIVE_HEALTHY`, region `eu-west-1`, PostgreSQL 17.11.0.002.
- The previously identified `raawaa-engine-fallback` project is absent from the current project list. This confirms it is no longer visible as an owned project in this account; it does not independently establish the deletion timestamp or provide a deletion receipt.
- The repository's `supabase/config.toml` points to this same project ID.

## Security advisor findings

### RLS warnings: 10 tables

Supabase Security Advisor reports RLS enabled without policies on:

- `commerce.order_events`
- `commerce.orders`
- `commerce.rate_limits`
- `public.volterra_rate_limit_windows`
- `rawaa_store.marketing_preference_events`
- `rawaa_store.notification_outbox`
- `rawaa_store.order_rate_limit`
- `rawaa_store.orders`
- `rawaa_store.telegram_pairing_challenge`
- `rawaa_store.telegram_recipient`

A read-only catalog query verified that none of these tables has a policy and none has a direct grant to `anon` or `authenticated`. The observed table grants are restricted to `postgres` and, for the `rawaa_store` tables, selected `service_role` privileges. The Volterra rate-limit table has no direct `service_role` table grant after the lock-down migration.

**Interpretation:** the advisor is reporting a lint condition, not a demonstrated public-data exposure. These tables appear to be intentionally service-side-only. Do not add broad RLS policies just to silence the advisor; doing so could expose private orders, phone hashes, pairing data, or rate-limit state.

### Auth warning

- `auth_leaked_password_protection` is WARN: leaked-password protection is disabled.
- The Supabase organization is on the **Free** plan. Supabase's current password-security documentation says leaked-password protection is available on Pro and above.
- This is therefore not an available no-cost toggle on the current plan. No upgrade or paid change was made or recommended; retain the finding as a known limitation unless the plan changes for separate reasons.

## Performance advisor findings

### Duplicate index

The advisor reports duplicate indexes on `rawaa_store.orders`:

- `orders_closed_at_idx`
- `orders_retention_idx`

Catalog definitions are identical: btree on `(closed_at, id)` with predicate `closed_at IS NOT NULL`.

The table currently has zero rows in the table inventory, but a later direct `pg_stat_user_indexes` snapshot showed `idx_scan = 1` for **each** index. That contradicts any claim that both are unused. The duplicate pair remains structurally redundant, but these are legacy `rawaa_store` objects and are not represented in the current Sol repository migrations. No index was dropped.

**Next safe step:** identify the active callers/retention job and decide which index name is canonical; then remove one duplicate through a reviewed migration with a rollback/restore plan.

### Other unused indexes

Seven indexes are reported unused across `commerce` and `rawaa_store`. These tables currently have zero rows in the inspected table inventory. Do not remove them solely on this signal; first confirm production workload and query plans.

## Project/repository boundary mismatch

The active Supabase project contains both Volterra resources and older Rawaa commerce/Telegram resources:

- Volterra: `volterra-binance-market-data`, `public.volterra_rate_limit_windows`, and the two Volterra migrations tracked in this repository.
- Legacy-named functions still active: `commerce-api`, `rawaa-owner-orders`, `rawaa-retention`, `rawaa-outbox`, `rawaa-telegram-pair`, and `rawaa-telegram-test`.
- The database migration history also includes `rawaa_*` and `commerce_*` migrations that are not present in the Sol repository's tracked migration directory.

This is a real ownership/operational-boundary inconsistency. It does not prove the legacy functions are unused. They were not disabled or deleted because doing so could break existing order, retention, notification, or Telegram workflows. Before cleanup, inspect each function's callers, scheduled triggers, secrets/configuration dependencies, and recent invocation logs; export a backup first.

## Current repository and deployment health

At the time of this audit, the latest `main` commit was `8cd1c3bda29c5e2c1aae8af884940640ea970f52`. Its GitHub checks reported success for:

- CI verification/build/test job
- Project Context Guard
- GitHub Pages deployment
- Production smoke test
- Production Lighthouse audit
- Performance Lighthouse baseline

The successful smoke test verifies the deployed app/proxy contract exercised by the workflow. It does **not** prove Binance currently returns live options data; recent observed HTTP 451 responses remain upstream rejections for those requests.

### Latest Binance proxy telemetry (24-hour log window)

For the deployed `volterra-binance-market-data` function, read-only Edge Function logs show:

- Version 6: 27 responses with HTTP 451, latest at 04:50:35 UTC on 24 November 2026.
- Version 6: 2 responses with HTTP 400, latest at 03:54:19 UTC.
- Version 5: 98 responses with HTTP 200 on 23 November, plus 3 responses with HTTP 451.

No HTTP 200 response was observed for version 6 in this log window. This is consistent with an upstream rejection affecting the current deployment, but does not establish whether the rejection is specific to one endpoint, egress route, region, or product entitlement. Preserve the existing distinction between proxy transport health and upstream market-data availability.

## Recommended action order

1. Keep leaked-password protection documented as a Free-plan limitation; do not upgrade solely for this feature without a separate cost decision.
2. Map legacy commerce/Telegram Edge Function callers, schedules, and secrets; preserve them until dependencies are proven absent.
3. Resolve the duplicate `rawaa_store.orders` partial index through a reviewed migration only after confirming the retention job's query plan.
4. Revisit the seven unused-index warnings after representative workload exists.
5. Keep the Volterra rate-limit table inaccessible to `anon` and `authenticated`; retain the service-side function boundary.
6. Continue treating Binance HTTP 451 as a source/network restriction, not proof of account eligibility or universal market-data unavailability.

## Change record

- Branch: `ops/supabase-production-audit-2026-11-24`
- Changes: this audit document only.
- No production database or runtime changes.


## Latest deployment verification — 24 November 2026, 05:19 UTC

The post-merge workflow run for main commit `3ab1e642701d2ce13b24671cab3694ac3aee3d0a` completed successfully:

- CI run [45331623042](https://github.com/raawaa93/Sol/actions/runs/45331623042): unit/property tests, build, compressed bundle budget, and Playwright browser journeys all passed.
- Pages run [45331623265](https://github.com/raawaa93/Sol/actions/runs/45331623265): build, deployment, published smoke test, production Lighthouse, summary, and report artifact upload all passed.
- Project Context Guard run [45331623071](https://github.com/raawaa93/Sol/actions/runs/45331623071) passed.
- Published app shell returned HTTP 200 in 83 ms.
- Published Lighthouse median across three runs: Performance 99, Accessibility 100, Best Practices 100, SEO 100; FCP 784 ms, LCP 784 ms, TBT 98 ms, CLS 0.000; transfer size 104 KiB.
- The published smoke test also confirmed the Binance proxy reached the upstream but `exchangeInfo` returned HTTP 451 with a regional/product restriction message. The app deployment and proxy transport are healthy; live Binance market data remains unavailable from this runtime.

This deployment contains the workflow-only changes from PR #35; no application runtime or Supabase database code changed in that commit. These results supersede the earlier 801 ms LCP / 113 ms TBT measurement for this deployed build.

## Superseding production change — 24 November 2026, 05:23 UTC

After this audit and its 05:19 deployment verification, migration `20261124052328_remove_non_sol_legacy_schemas_20261124` was applied to the live project. It dropped `commerce` and `rawaa_store` with CASCADE, including their data. No backup was created before that operation according to the operation record. The two Telegram rows observed earlier are no longer present. The Volterra table and RPC remain. Six legacy Edge Function deployment records remain ACTIVE with `verify_jwt=true`; their reported HTTP 410 behavior has not been independently verified because source retrieval failed. This note supersedes the earlier recommendation to preserve those schemas and the earlier statement that no production DDL had been applied.

The recorded user instruction concerned removing the separate fallback project; it did not explicitly authorize deleting the live schemas or their data. The cleanup is recorded as an out-of-band destructive production change. External backups outside connected sources remain unknown; no matching dump was found in the connected file Library.
