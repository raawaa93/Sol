# Post-cleanup verification and operational baseline — 24 November 2026

**Snapshot time:** 2026-11-24 05:32–05:34 UTC  
**Repository:** `raawaa93/Sol`  
**Project:** Volterra Multi-Asset Options Decision Lab  
**Supabase project:** `Ghaioooth-core` (`oyoyozdugicmnkfhjovo`)  
**Main commit inspected:** `1507619722631cc39df3a14f6e7d1acbdb9e8231`

This is a read-only verification record. No database, Auth, Edge Function, credential, billing, or project setting was changed during this review.

## Repository and deployment

- `main` points to `1507619722631cc39df3a14f6e7d1acbdb9e8231`.
- No open pull requests were present at inspection time.
- The latest four workflow runs for that commit all completed successfully:
  - CI: [45333691742](https://github.com/raawaa93/Sol/actions/runs/45333691742)
  - GitHub Pages deploy: [45333691781](https://github.com/raawaa93/Sol/actions/runs/45333691781)
  - Lighthouse performance baseline: [45333691829](https://github.com/raawaa93/Sol/actions/runs/45333691829)
  - Project Context Guard: [45333691856](https://github.com/raawaa93/Sol/actions/runs/45333691856)
- The deploy workflow's production audit job includes a published-site smoke test and Lighthouse run. Workflow success confirms that job completed; it does not establish that Binance supplied usable live option data.
- GitHub reports `main` as **not protected** (`protected=false`, protection disabled). This is a repository governance weakness: there is no enforced branch protection/status-check gate at the default branch. The connected GitHub action set available to this review can read protection state but does not expose a branch-protection/ruleset write operation, so no setting was changed.

## Supabase project and database state

- Project status: `ACTIVE_HEALTHY`; region `eu-west-1`; PostgreSQL 17.11.
- The remote migration ledger contains 22 versions: 19 historical versions plus two Volterra rate-limit migrations and the 24 November cleanup migration.
- The public application schema contains one table: `public.volterra_rate_limit_windows`. The `public.volterra_check_rate_limit` routine exists.
- The rate-limit table has RLS enabled and no client policy. The Security Advisor reports `rls_enabled_no_policy` as INFO. The earlier audit established the intended server-side-only grant boundary; do **not** add broad `anon` or `authenticated` policies merely to silence this lint.
- A read-only table inventory returned 38 rows in the rate-limit window table at this snapshot. This is operational state and will change with traffic.
- The six legacy Rawaa/Commerce schemas are no longer present in the application schema inventory. The production cleanup was destructive and, according to the incident record, no pre-change backup was created. No claim of recoverability is made here.

## Legacy Edge Function source verification

The Supabase function-source retrieval action successfully returned the deployed source for all six legacy function slugs. Each source is the same minimal retirement handler: it returns JSON with `code: ENDPOINT_RETIRED`, HTTP status **410**, `cache-control: no-store`, and a JSON content type. All six deployment records still show `ACTIVE`, but all have `verify_jwt=true`.

| Function | Version | JWT verification | Source check |
|---|---:|---:|---|
| `rawaa-telegram-pair` | 8 | true | Retrieved; 410 handler confirmed |
| `rawaa-retention` | 4 | true | Retrieved; 410 handler confirmed |
| `rawaa-owner-orders` | 10 | true | Retrieved; 410 handler confirmed |
| `commerce-api` | 5 | true | Retrieved; 410 handler confirmed |
| `rawaa-telegram-test` | 7 | true | Retrieved; 410 handler confirmed |
| `rawaa-outbox` | 8 | true | Retrieved; 410 handler confirmed |

**Verification limit:** source and gateway configuration are confirmed, but no authenticated invocation was performed. Therefore this review does not claim an observed HTTP 410 response from the deployed gateway. The records remain deployed and were not deleted.

The Volterra market-data function remains `volterra-binance-market-data` version 6, `ACTIVE`, with `verify_jwt=false`. Its source retrieval failed with an internal connector error during this pass. Do not alter its authentication mode or redeploy it without inspecting its source, request validation, CORS behavior, rate limiting, and secret handling.

## Security findings and treatment

1. **Leaked-password protection disabled:** Supabase Security Advisor still reports `auth_leaked_password_protection` WARN. The existing production audit records that the current Free plan does not include this feature. No paid upgrade was made. Revisit only if plan eligibility changes independently; do not incur spend solely to clear the warning without a separate cost decision.
2. **RLS enabled without policy on Volterra rate-limit table:** retain the service-side-only boundary. This is an intentional access-control design, not a reason to expose the table to browser roles.
3. **Unprotected default branch:** fix through GitHub repository settings or a ruleset requiring CI and Project Context Guard checks before merge. This review did not have a write-capable branch-protection action.
4. **Legacy Edge Function records:** source-level retirement behavior is confirmed, but deployments remain listed. Removal is a separate management-plane action and should follow a final check for callers, schedules, and any required audit retention.
5. **Historical migration ownership:** the 19 unmatched historical migrations remain a reconciliation issue. Do not reset the database or replay reconstructed migrations blindly.

## Market-data limitation

The latest repository audit records Binance HTTP 451 responses from the current proxy path. A successful application build, deployment, or proxy smoke test is not proof of successful upstream market-data delivery. Keep provider reachability, endpoint response, product entitlement, and Syrian legal/account eligibility as separate checks. Volterra remains research/PAPER-only under the repository's project and jurisdiction guardrails.

## Next actions

| Priority | Action | Safe execution boundary |
|---|---|---|
| P0 | Protect `main` and require CI + Project Context Guard | GitHub repository settings/ruleset; not writable through the connected action set used in this review |
| P1 | Diagnose Binance 451 by endpoint, response body, egress and product line | Read-only tests first; do not bypass regional/product controls |
| P1 | Inspect Volterra proxy source and security boundary | Read-only source retrieval / repository review before any deployment |
| P2 | Verify whether legacy function deployments can be deleted safely | Confirm callers, schedules, secrets and audit needs first |
| P2 | Reconcile the 19 historical migration files | Recover authoritative migration source; no reset or destructive replay |

## Change record

- This file records a new verification snapshot only.
- No production Supabase changes were made.
- No paid service, subscription, or resource was created.
- The branch-protection limitation is explicitly recorded rather than represented as fixed.


## Runtime evidence addendum — 24 November 2026, 05:31–05:37 UTC

A further read-only check correlated the published smoke-test output with the retained Supabase Edge logs.

### Published smoke test

The successful Pages workflow's production audit job reported:

- Published app shell: HTTP 200 in 280 ms.
- Binance `exchangeInfo`: HTTP 451. The upstream response text was: `Service unavailable from a restricted location according to 'b. Eligibility' in https://www.binance.com/en/terms.`
- The smoke script records this as a warning and exits without failing the site deployment. Thus the workflow's green result means the site and audit pipeline completed; it does **not** mean live Binance market data passed.
- Published Lighthouse median from three runs: Performance 97, Accessibility 100, Best Practices 100, SEO 100; FCP 755 ms, LCP 755 ms, TBT 182 ms, CLS 0.000; transfer size 104 KiB.

### Supabase Edge log correlation

In the retained 24-hour function-edge log window, the `exchangeInfo` endpoint showed:

| Caller country | Supabase Edge region | Requests | HTTP status |
|---|---|---:|---:|
| US | us-east-1 | 13 | 451 |
| US | us-east-2 | 10 | 451 |
| US | us-west-1 | 10 | 451 |
| US | us-west-2 | 3 | 451 |
| GB | eu-west-2 | 5 | 200 |

This is a strong observed correlation between the request's caller country / Supabase Edge execution region and the upstream result. It is **not proof** of Binance's observed outbound IP or the sole cause of the restriction: the available logs do not expose the upstream peer address or Binance's internal eligibility decision. Other endpoints also returned HTTP 200 during the same window.

Do not change region routing, proxy egress, or account identity to bypass a regional/product restriction. The user's actual residence and product eligibility remain separate from a server-side HTTP 200. Do not infer that a successful request from a UK edge region makes the product legally or account-eligible for a Syrian resident.

### Front-end behavior

The current `src/App.tsx` handles `BinanceMarketDataError` status 451 explicitly in Arabic. It tells the user the upstream request was rejected, that this does not prove personal-account eligibility, and that the application will not attempt to circumvent regional/product restrictions; it directs users to Demo, CSV, or a properly licensed source. This is the correct safe fallback and was left unchanged.

### Operational conclusion

- Site availability: verified.
- Production build/deployment pipeline: verified.
- Binance proxy transport: reaches the upstream.
- Binance `exchangeInfo` from the inspected US-based smoke runner: rejected with HTTP 451.
- Some retained requests from the GB / `eu-west-2` path returned HTTP 200, but this does not establish lawful user eligibility or a reliable global data route.
- Live market-data coverage for the user's own permitted use remains **unverified**. Keep PAPER-only and do not present stale/demo values as live.
