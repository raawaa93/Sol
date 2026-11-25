# Hosting decision — options research collector (25 November 2026)

## Decision

**Do not deploy or start market-data collection yet.** The code-level transport is merged, but the user's true residence is Syria and the repository's legal gate remains closed pending written local advice and exact product/account permission. No endpoint, runner, proxy, VPN, cloud region or credential should be used to work around a 403/451 or a regional/product restriction.

For a future *permitted, low-frequency REST sampler*, Cloudflare Workers Free + R2 is the best zero-recurring-cost candidate found in this review. It is not yet connected to this ChatGPT session and has not been provisioned or tested against Binance. It should be treated as a deployment candidate, not as an implemented service.

For an always-on WebSocket collector with durable storage, no verified zero-cost, always-on hosted option is currently available through the connected accounts. A paid low-end Render deployment may fit the user's USD 15/month ceiling, but it is not authorized for spend and is not selected.

## Existing connected infrastructure

| Provider | What was found | Decision |
|---|---|---|
| Supabase | Only organization visible: Ghaioooth. Only project: Ghaioooth-core, shared with other workloads and left untouched. | Do not repurpose the shared database. A separate Free project is possible in principle, but project creation requires the user to select the organization. |
| Render | Connected workspace "My Workspace" exists, but no services, Postgres instances, Key Value stores or workflows exist. | No existing runtime/storage to reuse. |
| GitHub Actions | Used for CI, not selected for live data collection. | Do not use a hosted runner to make Binance calls while regional/legal eligibility is unresolved; no alternate egress. |
| Cloudflare | No Cloudflare connector/account tools are connected in this session. | Candidate only; no deployment or secret provisioning performed. |

## Current free-tier comparison

| Option | Current documented limits/cost | Suitability |
|---|---|---|
| Cloudflare Workers Free + R2 Standard | Workers Free: 100,000 requests/day, 10 ms CPU per invocation, 5 Cron Triggers/account. R2 Free: 10 GB-month, 1 million Class A operations/month, 10 million Class B/month, free egress. | Best candidate for short scheduled REST snapshots and append-only object archives, if the account is connected and source access is lawful. The 10 ms Cron CPU limit and serverless execution model do not establish a reliable always-on WebSocket collector. |
| Supabase Free | $0; 500 MB database, 1 GB storage, 5 GB egress, 500,000 Edge Function invocations; projects may pause after 7 days of low activity. | Useful isolated database if created with secure Auth/RLS. Not a guaranteed always-on service; do not build a fake heartbeat just to defeat inactivity pausing. |
| Render Cron Jobs | Minimum $1/month per cron service; compute billed by active seconds. | A scheduled REST sampler could fit the budget, but it is not free and requires explicit spend approval. |
| Render Workflows | Starter task compute $0.05/hour, billed by the second; standard $0.20/hour. | Useful for resumable jobs, but recurring polling could create spend. Not selected without a costed workload and spend approval. |
| Render Free Postgres / Key Value | Free Postgres expires after 30 days and has no backups; Free Key Value is memory-only and loses data on restart. | Not suitable as the sole durable archive. |

## Recommended staged architecture

### Stage A — before any market capture
- Keep the merged Sol app read-only / research / PAPER-only.
- Keep the public WebSocket transport opt-in and unused.
- Finish deterministic collector tests and the archive export/restore runbook.
- Do not put credentials in the browser, repository, issue comments or logs.
- Do not collect until legal/account permission and the source's data-use terms are verified.

### Stage B — first permissible zero-cost deployment
- Provision an isolated Cloudflare Worker and R2 bucket only after the account is connected and its owner confirms the account/zone.
- Use a scheduled REST sampler only, initially at a conservative interval. Each record must retain source endpoint, contract-spec version, exchange/event timestamp, receive timestamp, availability time, raw-payload hash and quality flags.
- Store immutable, content-addressed daily NDJSON segments in R2. Maintain a small manifest/checkpoint with compare-and-set semantics or a D1 transaction; never overwrite historical observations silently.
- Add bounded retries, per-endpoint rate limits, 403/451 hard stop, health heartbeat, quota guard, export/restore verification and an operator kill switch.
- The capture flag defaults OFF. Legal approval and source permission are separate required flags; missing either prevents outbound requests.
- Do not describe sampled REST BBO as continuous event-level quote history. Label sampling gaps and missed windows explicitly.

### Stage C — only if a real continuous stream is justified
- Compare a supervised worker with a persistent disk / transactional database against the Cloudflare scheduled sampler.
- Price the full monthly cost before provisioning. Render Cron Jobs have a $1/month minimum; Render Workflow compute is billed by runtime. No spend is made without approval.
- Add a single-writer lease, durable cursor, reconnect epoch/gap events, crash recovery and independent restore test before running unattended.

## Operational acceptance gates

1. **Jurisdiction:** written advice from qualified Syrian counsel or the relevant regulator for the exact instrument, venue, settlement asset and activity.
2. **Venue:** written or in-account confirmation of exact product and market-data permissions for the truthful residence and account entity.
3. **Data rights:** verify that public API access permits the intended storage and use; public access is not a redistribution licence.
4. **Network:** first permitted request must use the approved standard path. Stop on HTTP 403/451, geoblock or any product denial. No VPN/proxy/region switching to bypass.
5. **Security:** no public write endpoint; use least-privilege secrets and authenticated operator controls. Never expose service-role credentials.
6. **Durability:** crash/restart, idempotency, integrity, quota, backup and restore tests must pass.
7. **Research quality:** accumulate at least 30 valid distinct daily IV observations before IV Rank/Percentile becomes available; build a materially longer history and point-in-time executable BBO/size corpus before performance evaluation.
8. **Cost:** recurring total must remain $0 unless the user explicitly approves a priced alternative; hard cap remains $15/month.

## Evidence and references

- Cloudflare Workers limits (updated 18 Nov 2026): https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Cloudflare Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare R2 pricing (updated 1 Oct 2026): https://developers.cloudflare.com/r2/pricing/
- Supabase Free project pausing (updated 22 Sep 2026): https://supabase.com/docs/guides/platform/free-project-pausing
- Supabase billing and Free plan quotas: https://supabase.com/docs/guides/platform/billing-on-supabase
- Render Cron Jobs (minimum $1/month): https://render.com/docs/cronjobs
- Render Workflows pricing: https://render.com/docs/workflows-limits
- Render Free service limitations: https://render.com/docs/free
- Render pricing: https://render.com/pricing

## Verification state

- Research completed: yes.
- Connected infrastructure inventory: Render and Supabase checked; no Render resources; one shared Supabase project found.
- Hosting deployment: not done.
- Secrets configured: none.
- Binance network request or capture: none.
- Live eligibility/legal approval: not verified.
- Paid services: none created.
## R2 archive design refinement — 25 November 2026

Cloudflare's current Standard R2 free allowance is 10 GB-month storage, 1 million Class A operations and 10 million Class B operations per billing month, with free internet egress. Above those included quotas, Standard storage and request operations are billable. The allowance is account-wide/monthly and is not a hard spend cap. Therefore R2 is a free-tier candidate, not a guaranteed $0 service. Do not create a bucket or enable billing until the account owner has reviewed the billing model and usage controls.

If later authorized and provisioned, use the S3-compatible endpoint with a narrowly scoped, short-lived R2 credential where available. R2 supports conditional PutObject with If-None-Match: *; use this to prevent manifest overwrite. Proposed object layout:

- immutable segment objects keyed by SHA-256, not by mutable filenames;
- a per-capture manifest listing relative paths, byte lengths, SHA-256 values, schema version, segment count, record count, cursor checksum and archive verification result;
- publish the manifest last, using create-only conditional write; the manifest is the commit marker;
- verify object metadata and content hashes before marking a capture export complete;
- restore only into a new destination, verify every object and the archive cursor, then atomically publish the restored directory;
- bounded retries, explicit maximum object/total bytes, and no delete/overwrite API in the uploader.

A future deployment must also have account-level budget/usage monitoring and an operational kill switch. Application-level 8 GB/800k Class A/8m Class B warning thresholds would be only local guardrails; they cannot guarantee no account-wide overage if other R2 buckets consume the same allowance. No hard spending cap or billing alert is assumed to exist.

Official references:
- R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Conditional S3 writes: https://developers.cloudflare.com/r2/api/s3/conditional-operations/
- Temporary credentials: https://developers.cloudflare.com/r2/api/s3/temporary-credentials/
- S3 authentication: https://developers.cloudflare.com/r2/examples/authenticate-r2-auth-tokens/

**Current state remains unchanged:** no R2 account/bucket/credential has been connected or provisioned, no upload code is deployed, and no remote archive/restore has been tested.
