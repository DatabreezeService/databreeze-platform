# DDA Integration Ledger (plan 087)

Prototype integration evidence only. Not production readiness.

## Base

- Branch: `codex/dda-087-integration`
- Base tip: `codex/dda-081-contracts` after G2 close (`0cb1e87`)
- Merge order: 082 → 084 → 083 → 085 → 086

## Lane merges

| Lane | Source HEAD | Integrate commit | Gate notes |
|---|---|---|---|
| 082 cloud-etl | `44baae7` | `chore(dda): integrate cloud-etl lane` | Clean merge |
| 084 refresh | `945cde1` | `chore(dda): integrate refresh lane` | Clean merge |
| 083 canvas | `6878742` | `chore(dda): integrate dashboard-canvas lane` | Clean merge |
| 085 desktop | `d94c17f` | `chore(dda): integrate desktop-folders lane` | Clean merge |
| 086 android | `b936ccd` | `chore(dda): integrate android-receipts lane` | Clean merge |

## Root composition

- `services/api/src/app.module.ts` now registers `DdaModule`
- `services/api/src/features/dda/dda.module.ts` wires intake, ETL, analyst, dashboard, refresh, and receipt controllers with in-memory/prototype foundation stubs
- Receipt leaf gained Nest HTTP decorators so composition can expose `/v1/dda/receipts`

## Honest prototype gaps preserved

- 083: Playwright CSP unsafe-eval blocked; web partly fixture-backed
- 084: in-memory refresh; synthetic perf; in-process SSE
- 085: DSO stub; no long-running FS watcher; folder UI not in shell nav
- 086: shutter prototype; in-memory staging; fake OCR; no emulator required for unit path
- Engine DDA processors are callable directly but not yet enrolled in the closed `ActionRegistry`
- Foundation ports in `DdaModule` default to prototype stubs, not production IAE/DSM/JRA adapters

## Decisions

- Do not mark production requirements verified from fixture-only demos
- Keep `DDA-051` deferred / post-ga
- Mentor demo may proceed with explicit limitations; plan 400 remains required for production
