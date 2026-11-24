# Binance live-data production verification — 2026-11-24

## Scope

This record distinguishes a server-side egress failure from successful public market-data requests. It does not determine Binance account eligibility, product permissions, or availability from Syrian networks.

## Observations

All timestamps below are UTC on 2026-11-24.

| Time | Request path | Observed result | Interpretation |
|---|---|---|---|
| 06:52:20 | GitHub Actions production smoke test through the Supabase proxy | HTTP 451 on `exchangeInfo`; Cloudflare caller metadata was US / Iowa | The CI runner's server-side request was denied. The smoke script emitted a warning and did not claim live data was verified. |
| 06:54:16–06:54:35 | Requests reaching the production Supabase function; Cloudflare caller metadata was GB / England | HTTP 200 for `exchangeInfo`, `mark`, `ticker`, multiple `index` underlyings, multiple `openInterest` expiries, and `depth` | Public Options market data was reachable through the deployed proxy for requests from this network region. Available logs had no Origin or Referer header, so do not assume these requests came from the published browser app. |

## What is verified

- The production Edge Function is active (version 10) and serves the six allowlisted, read-only public market-data endpoints.
- Binance public Options data was successfully returned to requests from at least one GB / England network path.
- The US-based GitHub Actions request still received HTTP 451. This is not evidence that the GB requests or a user's account are blocked.
- The successful GB requests do not prove connectivity from Syria, nor do they prove that any individual Binance account has access to every options product.
- The browser's direct-network fallback remains a fallback path; these server logs do not prove that the browser fallback was invoked.

## Safety boundaries

- Keep using Binance's global public Options API host, `https://eapi.binance.com`.
- Do not use VPNs, IP masking, region spoofing, altered residence details, private account endpoints, signed requests, or order endpoints to work around a restriction.
- Do not enable live trading based on public market-data availability.
- Keep Demo and CSV modes clearly separate from live data.

## Next verification

For an end-to-end browser confirmation, open the published app and load Binance data from the intended device/network. Confirm the UI reports live data and that requests to the proxy return HTTP 200. If the proxy returns 451, check whether the direct public-data request from that browser succeeds; a browser/network CORS failure must remain clearly distinguished from account eligibility.


## Syrian network observation — 07:00 UTC

A later production request burst was recorded on 2026-11-24 between 07:00:20 and 07:00:27 UTC:

| Field | Observed value |
|---|---|
| Cloudflare country classification | SY |
| Cloudflare city/region classification | Damascus / Damascus Governorate |
| Requests | 50 |
| HTTP outcomes | 50 × HTTP 200 |
| Browser signature | iPhone / Chrome on iOS |
| Endpoints represented | exchangeInfo, mark, ticker, index, openInterest, depth |
| Supabase function | Active, version 10 |
| Edge deployment | eu-west-2 |

The request burst demonstrates that the deployed read-only proxy successfully retrieved Binance public Options market data for requests whose Cloudflare network metadata was classified as Syrian. It is consistent with a successful iPhone browser session, but the available log rows did not contain Origin or Referer values; therefore this log evidence alone cannot tie the requests to the published page or to a particular person. The accompanying UI screenshot is separate evidence that the app rendered a Binance snapshot.

This verifies public market-data network reachability through the proxy from a Syrian-classified network path at that time. It does not verify Binance account-level eligibility, entitlement to every options sub-product, legal permission to trade from Syria, or uninterrupted future availability. It does not justify live order execution.

The earlier US/GB observations remain valid historical comparisons: US server-side requests returned HTTP 451, while GB requests returned HTTP 200. Do not treat any one server egress result as the user's account eligibility.

## Data completeness note

The app's observed count of 336 contracts with at least one missing side (Bid or Ask) is a quote-availability limitation, not evidence that the proxy failed. The normalizer intentionally preserves a missing side as unavailable instead of fabricating a price. A contract with no complete two-sided quote must not be treated as executable or used to infer a reliable spread. The displayed Greeks Gamma, Theta, Vega and Rho remain model-derived where indicated; public market-data access does not make them exchange-observed values.


## Rolling 24-hour regional egress recheck — through 08:22 UTC

A read-only aggregate of all logs for the same function endpoint covered 2026-11-23 08:22 UTC through 2026-11-24 08:22 UTC and includes deployment versions 1–10. The first table groups by Cloudflare client-country classification, Supabase execution region, response status and reports the versions contributing to each total; no client IPs or identity data are reproduced here.

| Client-country classification | Supabase Edge region | Requests | Outcome | Versions | First → last observed (UTC) |
|---|---|---:|---|---|
| SY | eu-west-2 | 50 | HTTP 200 | 10 | 07:00:20 → 07:00:27 |
| GB | eu-west-2 | 337 | HTTP 200 | 3, 4, 5, 10 | 15:23:03 (23 Nov) → 06:54:35 |
| US | eu-central-2 | 6 | HTTP 200 | 8, 9 | 06:39:37 → 06:43:40 |
| US | us-west-1 | 12 | HTTP 451 | 6, 7, 10 | 01:54:38 → 08:18:06 |
| US | us-west-2 | 8 | HTTP 451 | 6, 7, 10 | 01:25:44 → 08:11:01 |
| US | us-east-2 | 15 | HTTP 451 | 6, 7, 10 | 01:29:13 → 08:01:19 |
| US | us-east-1 | 23 | HTTP 451 | 1, 5, 6, 7, 10 | 15:18:15 (23 Nov) → 07:39:33 |
| US | us-east-1 | 5 | HTTP 400 | 6, 7, 10 | 03:54:18 → 08:05:06 |

The latest observed HTTP 451 was an exchangeInfo request at 08:18:06 UTC from a US-classified caller executed in us-west-1. The 58 HTTP 451 responses across four US execution regions coexist with successful requests from SY/GB classifications through eu-west-2 and from a US-classified caller through eu-central-2.

### Version 10 only

Filtering the same 24-hour window to deployment version `10` changes the interpretation materially: 50 SY-classified requests returned HTTP 200 in eu-west-2; 92 GB-classified requests returned HTTP 200 in eu-west-2; 12 US-classified requests returned HTTP 451 across us-east-1, us-east-2, us-west-1 and us-west-2; and 2 US-classified requests returned HTTP 400 in us-east-1. There were **no US-classified HTTP 200 responses on version 10** in this window. The six US-classified HTTP 200 responses in eu-central-2 came from older versions 8 and 9, not version 10.

### Interpretation

- This is evidence of region-, request-path- and deployment-version-dependent outcomes, not a universal Binance outage and not a blanket statement that every US request is denied.
- The 50 SY-classified successes all came from version 10 and are the most recent Syrian-classified burst in this log window. No later SY-classified request appears in this aggregate.
- Logs for these successful requests did not contain Origin or Referer values. They cannot be attributed conclusively to the published browser app or to a specific person/device.
- Supabase's automatic edge routing remains enabled. No region pinning, proxy rotation, IP masking, VPN geofencing bypass, or residence changes were introduced.
- The published app's smoke test is run from US infrastructure; its HTTP 451 is not a test of the user's Syrian ISP or Binance account.
- None of these results establishes account-level Options permission, legal permission to trade from Syria, or access to every Binance options sub-product.

The next meaningful end-to-end check remains a direct user-device/browser session on the intended Syrian network path, with the app's source status and the resulting HTTP outcome observed together. Do not treat the server-side log classification alone as that confirmation.
