# Dashboard workspace redesign evidence

This evidence record covers the Plan 405 Task 9 responsive Web E2E lane. It uses only the repository's synthetic demo fixtures and is not a claim of live API, AWS, or production readiness.

## Scope

- Vietnamese-first dashboard workspace at 1440x1000, 1024x900, and 390x844.
- Invitation closed and open states for the dashboard agent.
- Governed chart proposal alternatives with no publication controls.
- Analysis-history collapse persistence across reload.
- Dataset, source-file, original receipt-image, OCR, and Data agent surfaces.
- Analysis full conversation surface without a duplicate floating agent.
- Strict preview CSP with `script-src 'self'`, no `unsafe-eval`, and `object-src 'none'`.
- Reduced-motion rendering, font readiness, viewport geometry, and horizontal-overflow checks.

## Commands

```powershell
corepack pnpm --filter @databreeze/web test:e2e:preview -- dashboard-authoring.spec.ts dashboard-workspace.visual.spec.ts
corepack pnpm --filter @databreeze/web exec playwright test --config playwright.config.ts e2e/dashboard-authoring.spec.ts e2e/dashboard-workspace.visual.spec.ts --project=chromium --list
```

The Playwright preview web server sets `VITE_DATABREEZE_DEMO_MODE=true` through `webServer.env` in both Web Playwright configurations. This keeps the fixture data deterministic across Windows and CI shells.

## Latest bounded run

Playwright discovery reports 9 tests in the two owned specs. The first preview execution completed with 3 passed and 6 failed. The three non-visual checks passed: dataset/source/OCR evidence, Analysis without a duplicate floating agent, and strict CSP. Three authoring failures were caused by a test-only `page.evaluate` closure not receiving its storage-key argument; that defect is fixed. The three viewport failures exposed the current production shell's real page overflow: body scroll width measured 1579 px at 1440 px, 1371 px at 1024 px, and 902 px at 390 px. The required strict assertions remain in place.

The follow-up run was bounded at five minutes with one worker and did not produce a final Playwright reporter summary before the runner timed out. It is recorded as blocked by the local browser/preview runner, not as a passing production result.

The final Web typecheck is also blocked by a pre-existing dirty `apps/web/vitest.config.ts`: the installed Vitest type rejects its `test.poolOptions` property (`TS2769`). That file is outside this lane's ownership and was not changed.

## Evidence artifacts

The visual suite writes viewport screenshots to Playwright's test output directory:

- `dashboard-workspace-desktop.png`
- `dashboard-workspace-tablet.png`
- `dashboard-workspace-mobile.png`
- `data-dataset-source-evidence.png`

Screenshots are generated test artifacts and are intentionally not treated as product data or production baselines. The tests also assert DOM landmarks, Vietnamese text, bounded widget geometry, no horizontal overflow, and strict CSP so a passing screenshot alone is not sufficient.

## Latest local verification

The initial Playwright run passed the Data, Analysis, and CSP cases and exposed horizontal overflow at every target viewport. The grid was corrected to measure its real container instead of rendering first at a fixed 1024 px width. A fresh headless Chromium measurement then reported exact document containment at all required widths:

- 1440 px viewport: body 1440 px, document 1440 px.
- 1024 px viewport: body 1024 px, document 1024 px.
- 390 px viewport: body 390 px, document 390 px.

The full Playwright reporter remains environment-blocked by intermittent local Chrome process hangs, so this record does not mark the six responsive Playwright cases green yet. Component coverage, Web typecheck, production build, bundle budget, and the direct headless geometry measurement are green.

The failed run left Playwright diagnostics under `apps/web/test-results/`, including two failure screenshots, error-context markdown, and trace artifacts for the authoring failures. The responsive viewport failures also produced screenshots showing the overflow condition.

## Limitations

The suite does not exercise authenticated live APIs, AWS services, real customer data, OCR provider calls, billing, deployment, or cross-browser production readiness. It does not assert pixel-perfect golden baselines; geometry and stable DOM assertions are used to keep synthetic evidence deterministic.
