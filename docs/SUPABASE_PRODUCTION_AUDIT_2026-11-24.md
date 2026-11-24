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
- This is a real hardening opportunity. The available connected Supabase actions do not expose an Auth password-security settings update, so it was not changed here.
- Recommended action: enable leaked-password protection in Supabase Dashboard → Authentication → Settings / Password Security (label may vary), then verify the setting and test signup/password-change flows.

## Performance advisor findings

### Duplicate index

The advisor reports duplicate indexes on `rawaa_store.orders`:

- `orders_closed_at_idx`
- `orders_retention_idx`

Catalog definitions are identical: btree on `(closed_at, id)` with predicate `closed_at IS NOT NULL`.

Both are reported unused. The table currently has zero rows, so unused-index telemetry is not sufficient evidence to drop other indexes. The duplicate pair is a plausible storage/write-amplification cleanup, but these are legacy `rawaa_store` objects and are not represented in the current Sol repository migrations. No index was dropped.

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

## Recommended action order

1. Enable leaked-password protection in Auth settings and verify signup/password-change behavior.
2. Map legacy commerce/Telegram Edge Function callers, schedules, and secrets; preserve them until dependencies are proven absent.
3. Resolve the duplicate `rawaa_store.orders` partial index through a reviewed migration only after confirming the retention job's query plan.
4. Revisit the seven unused-index warnings after representative workload exists.
5. Keep the Volterra rate-limit table inaccessible to `anon` and `authenticated`; retain the service-side function boundary.
6. Continue treating Binance HTTP 451 as a source/network restriction, not proof of account eligibility or universal market-data unavailability.

## Change record

- Branch: `ops/supabase-production-audit-2026-11-24`
- Changes: this audit document only.
- No production database or runtime changes.
