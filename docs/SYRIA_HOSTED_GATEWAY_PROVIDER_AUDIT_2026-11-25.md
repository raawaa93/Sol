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

## Primary-source update: National Data Center VPS

Official NDC service page: https://ndc.sy/vps-hosting.html

Verified on the provider's own site:
- VPS is a self-managed virtual server with root access and isolated VLAN; Linux and Windows are listed.
- The listed plans appear to range from 1 vCPU / 512 MB RAM / 30 GB to 3 vCPU / 2 GB RAM / 80 GB SSD. Because the table is RTL-formatted, confirm the exact plan-to-spec mapping directly.
- Annual fees are displayed in SYP: 2,600 / 3,500 / 3,900 / 7,200 for the four tiers, plus setup 450, real-IP 200 and optional backups 550 / 900 / 1,400 / 1,400. The page carries a 2024 copyright notice; these figures may be stale or affected by currency redenomination. They are not a valid quote until NDC confirms the current denomination, total, taxes and renewal.
- Optional backups are described as daily with 10-day retention.
- Documents: signed/stamped VPS form; ID for individuals or commercial registration/license for companies; payment notice.
- Contact: domain@naits.gov.sy; +963 11 393 7032 / 393 7052; +963 11 393 7079. Location: Rif Dimashq, Sahara Intersection, Dimas Technical Complex.

**Technical recommendation:** request a custom minimum of 2 vCPU, 4 GB RAM, 40 GB SSD, root access, Ubuntu 22.04/24.04, static public IPv4, outbound HTTPS, and explicit disclosure of public egress IP and ASN. A local business address or data-center address does not prove the server's egress route is Syrian.

## Outreach and tracking

No email has been sent and no server has been purchased. Gmail is not yet connected. The qualification checklist is tracked in https://github.com/raawaa93/Sol/issues/250.

## Binance Syria policy caveat

Binance's Syrian-resident FAQ dated 12 June 2025 states that Syrian residents may register and access services subject to ordinary KYC/compliance checks after its stated policy change. This does not guarantee every API endpoint, product, or regional Binance entity. Check the terms applicable to the actual product/account; do not route through another country to evade restrictions.
Source: https://www.binance.com/en/support/faq/detail/863795c36a224bd7aa7d677996328ff9

## Additional provider candidates found in the 25 November follow-up

### Onyx IT Solutions — potential budget fit, location still unproven
Official offer: https://onyxits.sy/خدماتنا/vps-hosting-syria/
The provider advertises a Syria VPS starting at $10/month: 1 vCPU, 2 GB RAM, 40 GB SSD, 2 TB/month, root; its $15/month tier lists 1 vCPU, 4 GB RAM, 80 GB SSD, 4 TB/month. The page says prices updated November 2026 and describes local support in Latakia. This is the closest advertised fit to the $15/month ceiling, but the page does not give a facility address, public IP, ASN or an independently verifiable Syria egress. **Do not buy until the provider confirms the physical host and egress IP/ASN in writing.** Contact: +963 932 796 767; info@onyxits.sy (verify spelling from the site contact).

### Mijad Technology / Sham Cloud — promising but insufficient technical disclosure
Official site: https://mijadtechnology.com/ lists local cloud hosting based on a Tier III-standard data center in Syria, a Damascus address, info@mijadtechnology.com and +963 957 667 723. Its portal link points to https://shamcloud.sy/. A 2025 Syrian government decree search result identifies Mijad Technology Services as registered for hosting, data-center and cloud services. This supports corporate/service legitimacy but does not independently prove current physical location, tier certification, public egress, VPS availability, or pricing. **Treat as a serious second inquiry, not a qualified provider.**
A third-party BGP page returned conflicting/stale route ownership for an IP prefix previously associated in search snippets with Mijad; the opened current BGP page shows different route data and a bogon warning. Therefore, that prefix is explicitly NOT accepted as proof of Mijad's Syrian egress.

### Updated priority
1. NDC: strongest physical in-country evidence and official VPS offer; obtain custom specs and current quote.
2. Onyx: best public price/spec fit within $15/month; obtain physical location and egress proof.
3. Mijad/Sham Cloud: local Tier III data-center claim and registered company purpose; obtain independently verifiable technical details.
4. VPS.sy/Nobalaa: local provider with Syria and overseas options; exact plan/location must be named in writing.
5. Syrian Host and other local firms: lower priority until they publish or confirm the exact Syria-hosted VPS offer.

### Compliance update
Binance's own FAQ for Syrian residents (published 12 June 2025) says Syrian residents can register subject to standard KYC and compliance, after the policy change described in the FAQ. However, Binance's regional terms are not uniform; one regional terms page includes Syria in a high-risk jurisdiction clause. Do not infer API eligibility from account onboarding FAQ alone. Before any market-data gateway is used, confirm the terms applicable to the correct Binance contracting entity, API product and user context. No geo-evasion, VPN, foreign proxy, or egress switching is allowed.

## Sham Cloud / Mijad — upgraded priority after current platform review

Official platform: https://shamcloud.sy/ar and https://shamcloud.sy/en  
Operator: Mijad Technology Services Company. Official site identifies the platform as a local Syrian cloud and hosting service. The published plans visible in the current search index include:
- Cloud VM business: 8 vCPU, 16 GB RAM, 100 GB storage, 50 Mbps.
- IaaS Enterprise: 6 vCPU, 8 GB RAM, 100 GB storage, 1 public IP, 20 Mbps.
- IaaS Professional: 4 vCPU, 6 GB RAM, 75 GB storage, 1 public IP, 20 Mbps.
No prices are shown in the indexed plan cards; ask for a small gateway-only quote and monthly billing. The platform describes local infrastructure and 99.95% availability; these are provider claims, not an independently audited SLA.
The platform's own news/index says the local cloud service launched in September 2026 under Ministry of Communications sponsorship. Mijad's official contact: info@mijadtechnology.com; +963 957 667 732 / +963 11 4855. Its website's separate company contact page lists +963 957 667 723; verify which is the correct sales/support number.

**Priority adjustment:** Mijad/Sham Cloud becomes the leading private-provider candidate because it publicly lists cloud VM/IaaS capacities materially above the NDC public VPS tiers and explicitly markets local Syrian cloud hosting. NDC remains the leading government/public-provider candidate. Neither is technically qualified until the exact hosting facility, public egress IP/ASN, current quote, and external connectivity are confirmed.

## Inquiry message — Arabic

الموضوع: طلب عرض فني وتجاري لخادم سحابي مستضاف فعلياً داخل سوريا

نرغب بتشغيل بوابة HTTPS صغيرة للقراءة فقط لجلب بيانات السوق العامة من واجهات Binance Options API، دون مفاتيح API أو دخول حسابات أو تنفيذ أوامر تداول.

نرجو تأكيد النقاط التالية كتابةً:
1. هل الخادم الافتراضي أو عقدة الحوسبة التي ستستضيفه موجودة فعلياً داخل مركز بيانات في سوريا؟ نرجو ذكر اسم المركز والمدينة.
2. هل يخرج الاتصال إلى الإنترنت من عنوان IP عام سوري؟ نرجو تزويدنا بعنوان IPv4 المقترح وASN/مزود الشبكة، وتوضيح أي NAT أو وسيط خروج.
3. هل يمكن توفير Ubuntu 22.04 أو 24.04 مع Root، و2 vCPU على الأقل و4GB RAM و40GB SSD (أو أصغر مواصفات متاحة قابلة للترقية)، وعنوان IPv4 ثابت، واتصال صادر TCP/443؟
4. هل يمكن إجراء اختبار اتصال تجريبي من الخادم نفسه إلى واجهات Binance العامة للقراءة فقط قبل الالتزام السنوي أو الدفع؟
5. ما السعر الشهري والسنوي النهائي، ورسوم الإعداد والعنوان الثابت والنسخ الاحتياطي والتجديد والضرائب؟ وهل يمكن الدفع شهرياً؟
6. ما ضمان التوافر والدعم، وسياسة الصيانة، والنسخ الاحتياطي والاستعادة؟
7. هل تسمح شروطكم بهذا الاستخدام المحدد؟ نرجو إرسال شروط الخدمة وسياسة الاستخدام المقبول.

لن نستخدم VPN أو بروكسي أجنبي أو تغيير منطقة خروج. إذا لم تسمح الخدمة أو لم ينجح الاتصال من عنوانها السوري الفعلي، فلن نتابع هذا المسار. هذا استفسار فني فقط ولا يمثل موافقة على شراء أو التزام مالي.

## Outreach status

This inquiry is prepared for NDC, Mijad/Sham Cloud and Onyx. It has **not** been sent. The connected Activepieces project currently has only a GitHub connection; no email or WhatsApp sender is connected. Gmail was offered for connection in ChatGPT but no connection confirmation was received. No external provider has been contacted from this session.
