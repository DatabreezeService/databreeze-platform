# Public Pricing UI Plan

**Status:** approved for implementation  
**Approval:** product-owner request on 2026-08-16  
**Goal:** Add a polished, localized pricing section to the public landing page, with an in-page navbar destination and truthful pre-checkout calls to action.

**Primary requirements:** BUA-002, BUA-003, WEB-013, WEB-014

## Source and scope

- Use the immutable commercial catalog values currently defined on `origin/PayOS` in `services/api/src/features/bua/application/payos-plan-catalog.ts`: Personal (`149,000` VND monthly / `1,490,000` VND annual), Professional (`399,000` / `3,990,000`), and Team (`999,000` / `9,990,000`).
- Add a `#pricing` section to the public landing page and a `Bảng giá` / `Pricing` navbar link that scrolls to it.
- Present three comparable plan families with monthly/annual switching, concise catalog-derived allowances, an honest recommended treatment, keyboard semantics, reduced-motion compatibility, and responsive layouts.
- Keep Vietnamese as the default presentation and provide complete English pricing copy.
- Route plan calls to action to locale-correct registration. The public pricing surface remains advisory and performs no entitlement decision, checkout request, payment redirect, or provider interaction.

## Explicit non-goals

- Do not merge or reimplement the PayOS checkout flow.
- Do not create payment orders, persist a selected plan, or imply that clicking a plan has purchased or reserved it.
- Do not make the browser authoritative for price, entitlement, subscription, tax, invoice, or payment state.
- Do not alter authenticated billing, usage, tenant scope, retention, approval, or audit behavior.

## Implementation sequence

1. Add requirement-linked markup tests for navbar discovery, exact catalog prices, Vietnamese/English copy, registration-only CTAs, and absence of checkout hooks.
2. Add a localized landing pricing renderer sourced from a small immutable presentation catalog that mirrors the approved PayOS catalog values.
3. Add the pricing section slot and navbar anchor to the existing teammate landing markup.
4. Add responsive, accessible styles and a progressively enhanced monthly/annual tab control to the existing landing assets.
5. Run focused Web tests, typecheck/build, JavaScript syntax validation, and browser checks at desktop and mobile widths.

## Verification mapping

- `BUA-002`: tests prove the landing surface is advisory and exposes registration links only; no client-side purchase or entitlement enforcement is introduced.
- `BUA-003`: tests pin every displayed monthly and annual amount to the immutable catalog values already present in the repository history.
- `WEB-013`: component tests cover Vietnamese and English pricing output, labels, currency, and locale-correct registration destinations.
- `WEB-014`: semantic tab/button/link names, keyboard focus, responsive layout, and reduced-motion behavior are verified by focused tests and browser inspection.

## Rollback

Remove the pricing renderer, its landing slot/nav item, its isolated CSS/JavaScript hooks, and the focused tests. No persisted state, API contract, billing record, or migration is affected.
