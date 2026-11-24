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
