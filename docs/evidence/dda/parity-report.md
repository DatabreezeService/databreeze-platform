# DDA Local/Cloud Parity Report (DDA-038)

## Claim scope

Prototype deterministic parity for the messy-sales typed ETL fixture. This is not a production Local/Cloud security, recovery, or scale claim.

## Environment

- Engine processors: `services/engine/src/databreeze_engine/processors/dda_etl_execute.py`
- Fixture: `tools/fixture-validation/fixtures/dda/messy-sales`
- Harness: `tools/fixture-validation/src/run-dda-parity.mjs`
- Python test: `services/engine/tests/test_dda_local_cloud_parity.py`

## Assertion

For identical typed plan + normalized fixture rows, Local and Cloud processor invocations produce equal:

- rowCount / rejectedCount
- quality denominators
- lineage IDs
- contentHash / schemaHash

Delivery order may differ; the harness normalizes by `(sold_at, name)` before execution so logical output is compared, not accidental physical order.

## Declared byte differences

None for the golden messy-sales fixture. Representation bytes may diverge later only where a frozen contract explicitly allows it.

## Commands

```bash
corepack pnpm --filter @databreeze/fixture-validation exec node --test test/dda-parity.test.mjs
python -m pytest services/engine/tests/test_dda_local_cloud_parity.py -q
node tools/fixture-validation/src/run-dda-parity.mjs
```

## Status

`partial` — processor-level parity proven for the mentor fixture. Full sidecar/cloud worker admission, registry enrollment, and multi-tenant production gates remain for plan 400.
