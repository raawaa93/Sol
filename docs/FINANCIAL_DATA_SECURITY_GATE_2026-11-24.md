# Sol portfolio and personal-finance data security gate — 24 November 2026

## Decision

**Do not store personal financial records in the connected Supabase project yet.** The current Sol financial cockpit remains browser-local. Portfolio positions added in this change are also local-only and are included in the encrypted-by-user JSON export only as plaintext JSON download; browser localStorage is not encrypted.

No Supabase schema, Auth setting, Edge Function, credential, or project was changed during this review.

## Live project inspected

- Project: `Ghaioooth-core` (`oyoyozdugicmnkfhjovo`), `ACTIVE_HEALTHY`, region `eu-west-1`, PostgreSQL 17.11.
- The connected account returned one project.
- The live `public` schema currently contains one application table: `volterra_rate_limit_windows`.
- No personal-finance, portfolio, holdings, transaction, cash-flow, or user-profile tables exist in the live database.
- No public views or Storage buckets were returned by the catalog checks.
- No personal financial data was added to Supabase.

## Verified access boundary

Read-only SQL checks returned:

| Check | anon | authenticated | service_role |
|---|---:|---:|---:|
| SELECT on `public.volterra_rate_limit_windows` | false | false | false |
| EXECUTE on `public.volterra_check_rate_limit(text, integer, integer)` | false | false | true |

The public schema itself has USAGE for anon and authenticated, but the rate-limit table has no client grants and no policies. The SECURITY DEFINER RPC has a fixed `search_path = pg_catalog`, uses a schema-qualified table name, and is executable only by `service_role`. This is an intentional service-side boundary; do not add client policies or grants to silence the RLS advisor.

Supabase Security Advisor currently reports:
- INFO: RLS enabled with no policy on `public.volterra_rate_limit_windows`. This is consistent with its service-only access boundary.
- WARN: leaked-password protection is disabled. Prior project audit records the organization on the Free plan; current documentation makes this a paid-plan feature. No upgrade or paid change is proposed.
- No current performance or health advisor findings.

## Backup and recovery gate

- The GitHub repository has no Releases returned by the current API query; there is no evidence of a published encrypted database backup.
- The existing backup runbook records that the last attempted workflow skipped export because `SUPABASE_DB_URL` and/or `AGE_RECIPIENT` was missing. A green skipped workflow is not a backup.
- No verified isolated restore has been recorded.
- Database logical dumps do not include Auth users/sessions, Storage object bytes, Edge Function secrets, or project Auth settings.
- Therefore backup completeness and restoreability are **not proven**.

Before any personal financial data is persisted remotely, all of the following must be completed:
1. Produce a real encrypted off-site backup with key material held outside GitHub.
2. Restore it into an isolated disposable database and verify schema, data, grants, RLS, and functions.
3. Define an Auth ownership model with stable `auth.uid()` ownership on every user-owned row.
4. Enable RLS on every exposed table; policies must scope each row to its owner. UPDATE policies need both USING and WITH CHECK. Never authorize with user-editable `user_metadata`.
5. Revoke broad default privileges and audit table, sequence, function, view, and Storage grants.
6. Ensure views use `security_invoker = true` where appropriate; review every SECURITY DEFINER function and its execute ACL.
7. Add deletion/export and recovery procedures, short session lifetime appropriate for financial records, and test cross-user isolation with two test users.
8. Only then consider a narrowly scoped migration and integration.

## Migration ownership warning

The live Supabase migration ledger contains 22 entries. The current Sol repository tracks three migration files, leaving 19 remote migration versions absent from this repository. Do not run `db reset`, blindly push a reconstructed schema, or assume this repository fully owns the live database. Reconcile migration history before schema changes.

The active project also has legacy-named Rawaa/Commerce Edge Function deployments. They were not disabled or deleted during this review; their callers and operational ownership require separate verification.

## Data-source and calculation limits

The portfolio feature in this branch uses manually entered prices and user-supplied FX rates. It calculates market value, cost basis, unrealized P&L, asset-class weights, and simple concentration thresholds. It does not calculate realized gains, time-weighted returns, beta, volatility, VaR, drawdown, or expected returns. It does not execute trades or connect to a broker.

The published-site smoke test for main commit `2ab9e974af7bff1cfaab3aadf0d2c6afc236e8ef` succeeded for the app shell and assets, but Binance `exchangeInfo` returned HTTP 451 from Supabase Edge region `us-west-1`. This is an upstream data-access limitation, not proof of account eligibility or user-IP status.

## Evidence checked

- Supabase project inventory and project status.
- Live table inventory across schemas.
- Live public policies and grants.
- Effective privileges for anon, authenticated, and service_role.
- SECURITY DEFINER function catalog.
- Storage buckets and Storage policies.
- Security, performance, and health advisors.
- Remote migration ledger.
- Current GitHub Releases inventory.
- Supabase changelog and current RLS documentation.

## Change record

Read-only security review and repository documentation only. No production database or runtime changes.
