---
name: volterra-ui-quality
description: Improve and verify Volterra's Arabic RTL, mobile-first options research interface, accessibility, performance, SEO and deployment.
---

# Volterra UI Quality Workflow

## When to use
Use for any UI/UX, mobile layout, Arabic/RTL, navigation, search, watchlist, chart, form, accessibility, performance, SEO or release task.

## Product constraints
- The UI represents all options asset classes; never use gold-only language or assume every asset is live.
- Clearly label Demo, CSV, Binance, delayed, indicative and Paper data modes.
- Never present synthetic or stale data as live exchange data.
- Do not place private API keys in the browser, source tree, local storage or public bundles.
- Keep the interface usable on iPhone and Android tablets; prefer compact progressive disclosure over wide tables.

## Design and accessibility
1. Preserve Arabic RTL and ensure English symbols/Greeks remain readable.
2. Use semantic controls. A button group is a group; only use tablist when children are real tabs with selected state and keyboard navigation.
3. Every icon-only button needs an accessible name and pressed/selected state where appropriate.
4. Maintain WCAG AA contrast (4.5:1 for normal text, 3:1 for large text and UI components).
5. Support keyboard focus, visible focus indicators, touch targets and screen-reader labels.
6. Avoid horizontal overflow at page level; if a data table needs horizontal scrolling, provide a compact mobile alternative or clear local scroll container.
7. Search and watchlist must work from the currently loaded instrument catalogue and clearly disclose local-only persistence if not cloud-synced.

## Verification before merge
- Run unit and property tests.
- Run production build and compressed bundle budgets.
- Run Playwright browser journeys for primary workflows, mobile viewports, keyboard controls and persistence.
- Run Lighthouse with at least three runs and report the median Performance, Accessibility, Best Practices and SEO scores plus LCP, TBT and CLS.
- Inspect robots.txt, sitemap, canonical URL, page title, description and favicon.
- Confirm GitHub Pages deployment succeeded after merge.
- Report CI-only results separately from testing on a real user device.

## Release discipline
- Do not claim a feature is live until the deployment workflow succeeds.
- Keep a short audit note describing changed files, tests, results, remaining limitations and recovery path.
- Do not install paid UI plugins or services without approval; prefer existing Figma, Product Design and repository tooling.
