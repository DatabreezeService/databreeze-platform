# Public Pricing UI Plan

**Status:** approved for implementation  
**Approval:** product-owner request on 2026-08-16; flow expansion approved on 2026-08-17
**Goal:** Add a polished, localized pricing section to the public landing page and connect each plan to the authenticated billing journey through PayOS.

**Primary requirements:** BUA-002, BUA-003, BUA-006, BUA-009, BUA-011, BUA-015, WEB-002, WEB-003, WEB-011, WEB-013, WEB-014, WEB-016, WEB-021

## Source and scope

- Use the immutable commercial catalog values currently defined on `origin/PayOS` in `services/api/src/features/bua/application/payos-plan-catalog.ts`: Personal (`149,000` VND monthly / `1,490,000` VND annual), Professional (`399,000` / `3,990,000`), and Team (`999,000` / `9,990,000`).
- Add a `#pricing` section to the public landing page and a `Bảng giá` / `Pricing` navbar link that scrolls to it.
- Present three comparable plan families with monthly/annual switching, concise catalog-derived allowances, an honest recommended treatment, keyboard semantics, reduced-motion compatibility, and responsive layouts.
- Keep Vietnamese as the default presentation and provide complete English pricing copy.
- Route each plan call to action to the locale-correct authenticated billing route with the selected immutable plan ID. The monthly/annual control updates those destination IDs without sending an amount or entitlement claim from the browser.
- Preserve the billing destination through the protected-route sign-in redirect. After successful session establishment, return the user to the billing page and selected plan.
- Let the authenticated billing page remain the only customer-facing place that explicitly creates a PayOS checkout session. PayOS redirects back to localized success/failed routes, which confirm the order through the server API and verified webhook state.

## Explicit non-goals

- Do not duplicate provider checkout or settlement logic in the landing page; reuse the existing BUA PayOS endpoints and server-owned catalog.
- Do not create payment orders, persist a selected plan, or imply that clicking a public pricing CTA has purchased or reserved it.
- Do not make the browser authoritative for price, entitlement, subscription, tax, invoice, or payment state.
- Do not alter authenticated billing, usage, tenant scope, retention, approval, or audit behavior; the new flow only composes the existing contracts.

## Implementation sequence

1. Add requirement-linked markup tests for navbar discovery, exact catalog prices, bilingual copy, billing-route CTAs, cycle-specific plan IDs, and absence of public checkout calls.
2. Add a localized landing pricing renderer sourced from a small immutable presentation catalog that mirrors the approved PayOS catalog values.
3. Add a protected-route return target that preserves the billing path/query through sign-in and rejects external redirects.
4. Add the pricing section slot and navbar anchor to the existing teammate landing markup.
5. Add responsive, accessible styles and a progressively enhanced monthly/annual tab control to the existing landing assets.
6. Add localized billing success/failed assertions and a selected-plan presentation on the authenticated billing page.
7. Run focused Web tests, typecheck/build, JavaScript syntax validation, and browser checks at desktop and mobile widths.

## Verification mapping

- `BUA-002`: tests prove the landing surface is advisory, sends only a plan identifier in a navigation target, and introduces no client-side entitlement enforcement or payment mutation.
- `BUA-003`: tests pin every displayed monthly and annual amount to the immutable catalog values already present in the repository history.
- `BUA-006/009/011/015`: authenticated checkout and return tests assert server-owned amounts, tenant-scoped status lookup, explicit user checkout initiation, and stable result/remediation states.
- `WEB-002/003/011/016/021`: route/auth and billing tests prove protected navigation, generated contract validation, server-confirmed results, idempotent checkout transport, and safe localized errors.
- `WEB-013`: component tests cover Vietnamese and English pricing output, labels, currency, locale-correct billing destinations, and localized result screens.
- `WEB-014`: semantic tab/button/link names, keyboard focus, responsive layout, and reduced-motion behavior are verified by focused tests and browser inspection.

## Rollback

Remove the pricing renderer, its landing slot/nav item, its isolated CSS/JavaScript hooks, auth return-target composition, selected-plan presentation, and focused tests. No billing endpoint, payment record, entitlement, or migration is changed by this slice.
