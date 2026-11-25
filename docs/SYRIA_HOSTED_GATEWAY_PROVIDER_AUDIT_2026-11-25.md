# Syria-Hosted Market Data Gateway — Provider Audit

**Date:** 25 November 2026  
**Status:** Research verified from public provider statements; no server purchased or provisioned.  
**Purpose:** Replace the current Supabase Edge egress path with a gateway physically hosted in Syria, if a provider can confirm the location and pass an upstream Binance connectivity test.

## Executive decision

The preferred first inquiry is the **National Data Center (مركز المعطيات الوطني)** operated by the National Authority for Information Technology Services. SANA reported on 13 March 2025 that the center offers VPS hosting, website hosting, dedicated hosting/colocation of customer-owned physical servers, and shared hosting. This is the strongest public evidence found for a real in-country hosting option.

No provider has yet been technically qualified for this project. Do not migrate production until the provider supplies the exact data-center address/city, server public IPv4/IPv6, outbound NAT/egress IP, route/ASN, bandwidth and uptime terms, support escalation, backup/restore terms, and a written confirmation that the VPS is physically hosted in Syria.

## Provider comparison

| Provider | Publicly verifiable claim | Decision |
|---|---|---|
| National Data Center / NAITS | SANA reports VPS, website hosting and dedicated physical hosting at the National Data Center. | **Priority 1 inquiry.** Exact plans, prices, egress IP and provisioning SLA remain unknown. |
| VPS.sy / Al-Nobalaa | Local Damascus company; its site describes both in-country and overseas VPS options and identifies the company as licensed/accredited. The public pricing page lists worldwide data-center plans and does not bind a specific plan to Syria. | **Priority 2 inquiry.** Ask for a named Syria-only SKU, exact facility and egress IP before purchase. |
| Syrian Host | Public VPS page explicitly advertises reservations within Syria or outside it; Damascus contact details are shown. It does not identify the exact data center, upstream network, or per-plan location. | **Priority 3 inquiry.** Require written proof of physical location and actual outbound IP. |
| Illevante | Its current site says operating data centers are outside Syria and its Syrian data center is coming soon. | **Not eligible for a Syria-hosted origin today.** |
| Serversinasia — Syria | Advertises Damascus VPS, but the listed plans are marked OUT OF STOCK and require 12-month minimum billing. | **Not currently usable.** |
| DATAMENA.sy | Describes a Syrian cloud platform/project and local/global data-center partnerships; the public page does not establish a currently orderable Syria VPS product. | **Monitor only; not qualified.** |

## Sources

- SANA, National Data Center services, 13 March 2025: https://sana.sy/locals/2198047/
- VPS.sy home and contact: https://vps.sy/ and https://vps.sy/contact/
- VPS.sy pricing: https://vps.sy/pricing/
- Syrian Host VPS: https://www.syrianhost.com/en/page/virtual-private-servers-vps
- Illevante data centers: https://illevante.sy/en/datacenters
- Serversinasia Syria inventory: https://serversinasia.com/serverssyria.html
- DATAMENA: https://datamena.sy/

## Required acceptance test before migration

1. Obtain written confirmation that the compute instance and its outbound egress are physically/network-located in Syria. A Syrian company address, .sy domain, Syrian support number, DNS location, or a Syrian user connecting to an overseas VPS is not proof.
2. Obtain a dedicated public egress IPv4 and verify the IP's announced ASN, reverse DNS, and geolocation independently. Record the evidence and date; do not trust a client-supplied country header.
3. From the actual VPS, run a minimal read-only test to Binance public Options REST endpoints: `/eapi/v1/exchangeInfo`, `/eapi/v1/index`, and one SOL contract data endpoint only after exchangeInfo confirms the instrument. Record DNS, TCP/TLS, source IP, HTTP status, latency, timestamp and response schema. No API key, account access, orders or funds.
4. If Binance returns 403/451, stop. Do not change region, use a foreign proxy, VPN, alternate egress or spoof country. Mark this provider path incompatible until a lawful, officially permitted path is confirmed.
5. If the test passes, deploy a small read-only HTTPS gateway with: TLS, HMAC-signed short-lived client tokens, rate limits, request allowlist, strict query validation, bounded response sizes, audit logs with secrets redacted, health checks, automatic restart, backup and rollback.
6. Enforce source-network policy server-side using the actual TCP peer address and maintained IP/ASN intelligence. Never trust `CF-IPCountry`, `X-Forwarded-For`, or country headers unless they are injected by a reverse proxy under our control and the origin is inaccessible except through that proxy. IP geolocation is an imperfect network-origin control, not proof of residence or identity.
7. Keep the app fail-closed: only one configured Syria-hosted gateway URL; no Supabase fallback, no direct Binance REST/WebSocket fallback, no GitHub Actions market polling. If the Syria gateway is unavailable, show unavailable and stop.
8. Run unit, integration, browser, security and recovery tests before switching production traffic. Keep the current Supabase deployment as a disabled rollback artifact only; it must not be an alternate market-data path.

## Current project state and limitations

- Active project repository: `raawaa93/Sol`.
- Current market-data client uses the Volterra proxy URL and does not make a direct Binance REST fallback.
- Direct Binance WebSocket transport has been removed from the active collector and application.
- The archive worker's direct entrypoint is disabled and requires an injected, separately verified Syria-origin transport.
- The current Supabase Edge deployment was previously observed in `eu-west-2` (London). Therefore it is **not** a Syria-hosted server.
- Supabase did not provide a trustworthy `CF-IPCountry` header to the function in the tested setup; a complete geofence cannot currently be claimed. CORS is not a security boundary.
- No Syria-hosted server has been provisioned, and no fresh Binance test from such a server has been performed.
- No spend or external provider commitment is authorized by this research note.

## Compliance and scope

The project remains public-data research and PAPER only. Do not add authenticated trading credentials or order execution. Verify the current Syrian legal and provider eligibility position independently before using market-data or derivative products. This note does not imply that Binance permits requests from every Syrian network or that trading a given product is lawful.
