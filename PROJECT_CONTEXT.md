# Project Context Lock — Volterra

**Status:** ACTIVE  
**Canonical project name:** Volterra Multi-Asset Options Decision Lab  
**Canonical repository:** https://github.com/raawaa93/Sol  
**Default branch:** main  
**Last verified:** 2026-11-24  
**Product scope:** provider-neutral research, analysis and paper trading for vanilla options across all legally accessible asset classes and venues. Gold is one underlying, not the product definition.

## 1. Non-negotiable identity rule

This repository is the source of truth for work in this project. Before researching, coding, changing settings, creating automation, or reporting progress:

1. Resolve the active project from the current user request and this file.
2. Confirm repository identity and branch. Never infer a repository from a historical memory, similar project name, or an old conversation.
3. Read this file and `AGENTS.md`; then inspect the current tree, recent commits, open PRs and relevant existing implementation.
4. If the request does not clearly identify a project and multiple projects are plausible, ask one concise clarification before any write or external action.
5. If a remembered fact conflicts with this file or current repository evidence, do not silently blend them. Prefer the latest explicit user decision and current repository state; record unresolved conflicts.
6. Never copy credentials, settings, assumptions, project status, or code from another project unless the user explicitly requests a migration and the source/target are verified.

## 2. Project state and scope

- This project is **ACTIVE**. Historical or unrelated projects are not active dependencies.
- The research universe includes crypto, listed equities and ETFs, indices, rates, FX, energy, metals, agriculture and other genuine vanilla-options markets where lawful access and reliable data exist.
- Distinguish target coverage from implemented coverage and from live, verified coverage. Never represent a market as supported merely because its underlying trades on a venue.
- Binance is one adapter/provider, not the definition of the product. Keep venue/product lines separate.
- User jurisdiction, platform eligibility, API restrictions and the research-only/PAPER safety boundaries are governed by `AGENTS.md` and the dated research documents. Revalidate before adding execution capability.
- Current product behavior, data limitations, and test commands are documented in `README.md`.

## 3. Change-control protocol

For every substantive task:
- State internally the project/repository/branch being changed and verify it from GitHub.
- Inspect the exact files and existing patterns before editing.
- Make the smallest coherent change on a dedicated branch.
- Run the relevant tests/build or CI. If tests cannot be run, state that clearly; never imply they passed.
- Open a PR with a concise summary, test evidence, risks and rollback note. Merge only when checks pass and the change is within existing user authorization.
- Verify the resulting commit, CI run and deployed state separately. A merged commit is not proof of deployment.
- Record meaningful architectural decisions and changed assumptions in repository documentation.

## 4. Response and memory hygiene

- Do not introduce unrelated historical projects into Volterra status reports or implementation plans.
- Do not treat old user goals, budgets, risk limits, or preferences as current unless they are explicitly reaffirmed or recorded in the current project's source of truth.
- When answering a cross-project question, name each project and its state explicitly; otherwise keep the answer scoped to Volterra.
- Do not claim background monitoring or work between turns. Report only actions actually performed and evidence returned by tools.
- Keep secrets out of commits, logs, prompts and browser storage.

## 5. Current scope boundary

**Allowed by default:** public-source research, architecture/design, read-only public market data, local analysis, tests, paper trading, documentation, and low-risk repository maintenance.

**Not allowed without separate explicit authorization:** live orders, withdrawal/transfer permissions, paid subscriptions or spend beyond the existing user limit, identity/residency misrepresentation, circumvention of venue restrictions, or publication of private credentials.

## 6. Conflict resolution

Priority order:
1. Current explicit user instruction (within safety, legal and platform constraints).
2. This project lock and current repository state.
3. Current project documentation and verified tool/provider evidence.
4. Relevant prior conversation context.
5. General memory or assumptions.

If two current authoritative sources conflict, pause the affected action, explain the conflict, and request only the minimum clarification needed.
