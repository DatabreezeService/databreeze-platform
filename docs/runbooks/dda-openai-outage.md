# DDA OpenAI Outage

1. Set `DATABREEZE_OPENAI_RECEIPT_ENABLED=false` (kill switch).
2. Confirm receipt originals remain immutable and manual correction works.
3. Confirm deterministic ETL, typed manual analysis, and last complete snapshots remain usable.
4. Record content-safe correlation IDs and provider error classes (rate limit, auth, timeout, schema) without payload content.
5. Re-enable only after owner approval and fresh evaluation if model/prompt/schema changed.
