# DDA Incident Response

**Blocked on:** MANUAL-PREREQUISITES §1/§8 (named owners, paging, communication channels)

## Content-safe diagnostics only

Correlate intake, ETL, dataset, analysis, dashboard, materialization, snapshot, folder/device, receipt, OpenAI, usage, and audit identifiers. Never paste images, OCR text, filenames, local paths, prompts with customer content, or secrets into tickets/chat.

## Immediate actions

1. Confirm blast radius (tenant/workspace) without enumerating customer content.
2. Toggle OpenAI kill switch if provider-related (`DATABREEZE_OPENAI_RECEIPT_ENABLED=false`).
3. Preserve last complete dashboard snapshots; do not force partial refresh commits.
4. Follow `dda-openai-outage.md` or DR runbook as applicable.
