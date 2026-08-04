# DataBreeze dogfood walking skeleton — 2026-08-04

This slice is the first testable product path for the private alpha:

`approved Windows folder → local-only artifact registration → typed Spreadsheet Auditor run → Web review`

The path does not require Shopee, TikTok, accounting, OCR, payment, or other restricted vendor APIs.
The desktop boundary returns only a bounded folder summary; it never sends a local path, file name,
workbook bytes, formulas, or cell values to the Web/API boundary.

## Included

- Desktop folder selection and bounded local file-count summary.
- Content-free IAE local artifact registration with hash, size, media type, and placement metadata.
- Idempotent, tenant-scoped Spreadsheet Auditor run admission and status lookup.
- Safe Python Spreadsheet Auditor action registration and JSON-RPC envelope validation.
- Vietnamese-first Web audit list/detail views with English fallback and value-free evidence rendering.
- Clean-scan evidence/grant gates and the dogfood readiness check.

## Verification

From a clean checkout:

```text
corepack pnpm dogfood:check
corepack pnpm --filter @databreeze/engine test
corepack pnpm --filter @databreeze/api test
corepack pnpm --filter @databreeze/web test
corepack pnpm repo:check
corepack pnpm repo:build
```

The run-admission and local-registration endpoints remain content-free. Durable JRA scheduling,
Desktop sidecar execution, Android approval, and derived repair effects are the next vertical slice;
this evidence record must not be interpreted as GA completion.
