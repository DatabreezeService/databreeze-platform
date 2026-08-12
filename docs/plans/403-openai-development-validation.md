# DDA OpenAI Development Validation Plan

> **For Cursor:** Execute this plan with `superpowers:executing-plans` and use `superpowers:test-driven-development` for every implementation task. Never ask the owner to paste an API key into chat, a prompt, source control, an issue, or a committed file.

**Status:** Approved focused subplan<br>
**Requirements:** DDA-003, DDA-005, DDA-006, DDA-008, DDA-010, DDA-011, DDA-015 through DDA-024, DDA-036, DDA-040 through DDA-045, DDA-050<br>
**Decisions:** ADR-0005<br>
**Parent plans:** Plan 402 Tasks 1-3, 7-8, 11-12; plans 082, 083, 086, and 400<br>
**Execution point:** Start only after plan 402 Tasks 1-3 are green. The direct synthetic provider smoke test may run before Android Task 7; Android-to-OCR end-to-end validation still waits for Task 7.<br>
**Production state:** This plan never sets `productionReady` to true.

**Goal:** Complete and safely test every V1 OpenAI-dependent assistance path—receipt extraction first, then mapping suggestions, typed analyst proposals, bounded narratives, and dashboard/canvas proposals—while preserving deterministic authority, tenant isolation, egress controls, human review, and non-AI fallbacks.

**Architecture:** OpenAI is a server-only adapter behind provider-neutral ports. A shared Responses API client owns authentication, timeout/error normalization, request correlation, and content-safe usage metadata. Capability adapters own versioned prompts and strict output schemas. Application services authorize purpose and payload, obtain BUA admission, validate every provider output through deterministic domain rules, and persist only proposals or candidates. Receipt extraction sends an approved immutable image version; the other paths receive only bounded authorized metadata, samples, or deterministic result/provenance packages. Clients never receive the key and never call OpenAI.

**Tech stack:** NestJS/Fastify, the official OpenAI Node SDK, JSON Schema strict structured outputs, Node test runner, generated DataBreeze contracts, the existing fixture-validation package, and synthetic Vietnamese/English fixtures.

## Why a key is not the first coding step

The current `OpenAiReceiptOcrAdapter` is intentionally incomplete. It sends artifact/profile identifiers but no image, requests no strict output schema, discards a successful provider response, and throws `OPENAI_EVALUATION_REQUIRED`. The evaluation runner and adapter/contract tests named in plans 086 and 402 are also missing. Supplying a key now would prove authentication at most; it would not test OCR or the complete product path.

Cursor must finish the offline contract and safety work first. The owner then runs the explicit live command from a private terminal using synthetic fixtures. AWS, Google Play, signing, and production credentials are not required for this development evaluation.

## Global constraints

- Preserve the four untracked `.superpowers/sdd/400-production-readiness` reports. Do not stage, delete, rename, or rewrite them.
- Execute from `codex/dda-400-production` at `480eb8b` or a descendant. Do not restart plans 081-087.
- Do not run this plan until plan 402 Tasks 1-3 have fresh passing evidence. Focused work may use an isolated branch/worktree, but integration still requires the clean baseline.
- Never accept a key through Cursor chat, Codex chat, a patch, a test, `.env`, `.env.local`, `local.properties`, source control, fixture metadata, logs, screenshots, or reports.
- Local live evaluation reads `OPENAI_API_KEY` only from the manually launched server/evaluator process. Production continues to use `databreeze/{env}/openai/receipt-ocr` in AWS Secrets Manager.
- Do not put `OPENAI_API_KEY` in Web, Desktop, Android, Vite, Electron renderer, Gradle, generated contracts, or any API response.
- Standard unit, integration, E2E, and CI commands must never make a live OpenAI request. Live mode requires an explicit `--live`, an approved synthetic manifest, a request cap, and a separate acknowledgement flag.
- Use a dedicated development/evaluation OpenAI project and project service account with low spend/rate limits. Do not use a personal all-project key or the future production key.
- Use only synthetic, non-customer receipt images and synthetic dataset/result packages in this plan. A protected real-data evaluation is a later owner-controlled production gate.
- Use the Responses API with `store: false`. Do not use Conversations, background mode, web search, hosted tools, file search, code interpreter, arbitrary functions, or tool calls.
- Use strict JSON Schema output. Reject refusal, incomplete output, unexpected output item types, schema mismatch, additional properties, invalid coordinates, unknown identifiers, and unbounded output.
- Treat filenames, headers, cells, OCR text, metadata, and evidence as untrusted data. They cannot change instructions, enable tools, broaden egress, select another tenant, publish, approve, or mutate a canvas.
- Development may evaluate an image-capable model alias. Production requires an explicitly configured evaluated snapshot and a new evaluation whenever model, prompt, schema, preprocessing, or coordinate mapping changes.
- The pinned development/evaluation baseline is `gpt-4o-mini-2024-07-18` with image `detail: "high"`. It supports image input, the Responses API, and strict structured output at a low token price. Use it for receipt, mapping, analyst, narrative, and dashboard-proposal smoke tests unless the owner explicitly approves another evaluated candidate.
- Do not silently upgrade from the cheap baseline. If receipt text, field extraction, or coordinates miss the declared thresholds, record the failed metrics first and propose a separately capped comparison against a stronger image-capable model.
- `detail: "original"` is used only for an evaluated model that supports it. Unsupported model/detail combinations fail before egress; they do not silently downgrade coordinate quality.
- `store: false` is mandatory but is not represented as Zero Data Retention. Evidence must record the actual project data-control posture approved by the owner.
- OpenAI confidence is a candidate signal, not a percentage-correct claim. Quality UI and evidence continue to follow DDA-009/DDA-010.
- Provider output never supplies authoritative numeric results. DataBreeze deterministic processors calculate all metrics, reconciliation, duplicate checks, costs used in product decisions, and dashboard cells.
- Provider failure, disablement, denial, or budget exhaustion preserves original data and the last good snapshot and leaves deterministic ETL, manual typed analysis, correction, and saved dashboards usable.

## Official implementation references

- [OpenAI API authentication](https://developers.openai.com/api/reference/overview#authentication)
- [OpenAI project service accounts](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/projects/subresources/service_accounts)
- [Images and vision](https://developers.openai.com/api/docs/guides/images-vision)
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [API data controls](https://developers.openai.com/api/docs/guides/your-data#default-usage-policies-by-endpoint)
- [Model catalog](https://developers.openai.com/api/docs/models)

## Task 1: Establish the server-only client and secret boundary

**Requirements:** DDA-036, DDA-043, DDA-044, DDA-045

**Files:**

- Create: `services/api/src/features/dda/ai/adapter/openai-responses.client.ts`
- Create: `services/api/src/features/dda/ai/adapter/openai-provider.error.ts`
- Create: `services/api/src/features/dda/ai/adapter/openai-provider-metadata.ts`
- Create: `services/api/test/features/dda/openai-responses.client.test.ts`
- Modify: `services/api/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `tools/repo-cli/src/secret-patterns.mjs`
- Modify: `tools/repo-cli/src/check-secret-patterns.mjs`
- Create: `tools/repo-cli/test/secret-patterns.test.mjs`

### Steps

1. Add failing tests proving the shared client refuses missing/blank credentials, disallowed base URLs, missing explicit model configuration, unsafe storage/background/tool settings, and requests without a timeout/correlation ID.
2. Add the exact-pinned official `openai` server SDK dependency to `@databreeze/api`. Do not add it to a client package.
3. Wrap only the Responses API. Inject the SDK transport in tests so no unit test can reach the network.
4. Normalize provider failures to stable typed codes: credential, authorization, rate limit, timeout, transient provider, refusal, incomplete, schema, unsafe configuration, budget, and disabled.
5. Capture only content-safe metadata: provider request ID, returned model ID, input/output token counts, latency bucket, retry count, adapter/prompt/schema/preprocessing versions, and outcome code. Never capture prompts, source values, response text, images, bearer headers, or the key.
6. Refactor the secret scanner into an importable pattern module and add OpenAI key patterns. Tests must assemble fake tokens from fragments so the repository never contains a contiguous key-shaped literal.
7. Run the shared-client tests and `corepack pnpm ci:secrets`.

**Commit:** `feat(dda): add governed OpenAI server client`

## Task 2: Complete receipt content, policy, and admission ports before egress

**Requirements:** DDA-003, DDA-036, DDA-040, DDA-041, DDA-043, DDA-044, DDA-045

**Files:**

- Modify: `services/api/src/features/dda/application/foundation-ports.ts`
- Modify: `services/api/src/features/dda/adapter/fail-closed-foundation.adapters.ts`
- Create: `services/api/src/features/iae/application/artifact-processing-content.port.ts`
- Create: `services/api/src/features/iae/adapter/object-storage-artifact-processing-content.adapter.ts`
- Modify: `services/api/src/features/iae/iae.module.ts`
- Modify: `services/api/src/platform/dda-foundation.composition.ts`
- Modify: `services/api/src/features/dda/receipt/application/receipt-ocr.port.ts`
- Create: `services/api/src/features/dda/receipt/application/receipt-ai-policy.port.ts`
- Modify: `services/api/src/features/dda/receipt/application/receipt-extraction.service.ts`
- Modify: `services/api/src/features/dda/dda.module.ts`
- Modify: `services/api/test/features/dda/receipt-extraction.service.test.ts`
- Modify: `services/api/test/features/dda/openai-egress-policy.test.ts`
- Modify: `services/api/test/features/dda/dda-tenant-isolation.e2e.test.ts`
- Create: `services/api/test/features/iae/artifact-processing-content.test.ts`

### Interfaces

- IAE supplies a bounded immutable processing handle through a public composition port: exact artifact version, verified content hash, media type, byte length, image dimensions/pages, and approved bytes/stream. DDA never reads IAE persistence or object-store credentials.
- `ReceiptOcrRequest` receives the already authorized image plus exact tenant, artifact, profile, content hash, media type, preprocessing version, and coordinate space. The HTTP controller still accepts only opaque IDs.
- `ReceiptAiPolicyPort` returns the exact workspace egress policy and disclosure version for `RECEIPT_EXTRACTION`.
- BUA admission occurs before provider invocation and reserves request/image/text/retry/cost capacity. Finalization/release is idempotent.

### Steps

1. Add failing tests for wrong-scope artifact, unsupported content type, hash mismatch, oversize payload, denied purpose, denied evidence/original transfer, missing disclosure, admission denial, revoked tenant, and copied adapter allowlist from another tenant.
2. Add the minimum IAE processing read to the DDA composition port. Implement it only through the owning IAE public service/adapter in plan 402 Task 4/7; keep the default adapter fail closed.
3. Make the receipt application service check scope, profile, egress policy, payload class/size, and BUA admission before calling the OCR port.
4. Pass bytes only inside the server process. Do not expose a reusable public URL, object-store credential, or base64 image through a client response or audit event.
5. Replace string-message retry inspection with typed provider error codes. Retry only declared timeout/rate-limit/transient outcomes, with bounded attempts and backoff; never retry policy, credential, schema, refusal, or malformed-coordinate failures.
6. Emit content-safe AUD outcomes for denied, failed, review-required, and succeeded requests with opaque references only.
7. Prove deterministic fake OCR still works without credentials and that OpenAI disablement does not block manual correction or saved dashboard behavior.

**Commit:** `feat(dda): govern receipt OCR egress and admission`

## Task 3: Finish the OpenAI receipt extraction adapter

**Requirements:** DDA-010, DDA-041, DDA-042, DDA-043, DDA-044, DDA-045

**Files:**

- Modify: `services/api/src/features/dda/receipt/adapter/openai-receipt-ocr.config.ts`
- Modify: `services/api/src/features/dda/receipt/adapter/openai-receipt-ocr.adapter.ts`
- Create: `services/api/src/features/dda/receipt/adapter/openai-receipt-output.schema.ts`
- Create: `services/api/src/features/dda/receipt/adapter/openai-receipt-prompt.ts`
- Create: `services/api/src/features/dda/receipt/adapter/receipt-image-preprocessing.ts`
- Create: `services/api/test/features/dda/openai-receipt-ocr.adapter.test.ts`
- Create: `services/api/test/features/dda/openai-receipt-ocr.contract.test.ts`
- Modify: `services/api/test/features/dda/openai-egress-policy.test.ts`

### Provider output

The strict adapter schema returns only bounded extraction candidates:

- merchant
- transaction date and optional time
- currency
- subtotal, tax, and total as source strings plus normalized candidate strings
- optional payment method/reference
- bounded optional line items
- per-field candidate confidence with a declared candidate basis
- normalized evidence coordinates tied to the versioned preprocessing coordinate space

Adapter/model/prompt/schema/preprocessing versions and provider usage come from trusted configuration/response metadata, not from receipt text.

### Steps

1. Write failing request-construction tests for a base64 data URL `input_image`, evaluated image detail, bounded system/user instructions, strict `text.format` JSON Schema, `store: false`, empty tools, no web/background/conversation/file upload, maximum output tokens, and exact version tags.
2. Replace the existing `gpt-4.1-mini-2025-04-14` development default with the pinned cheap baseline `gpt-4o-mini-2024-07-18` and `detail: "high"`. Keep both configurable for evaluation, but require an explicit evaluated snapshot for production.
3. Write failing response tests for valid structured output, refusal, incomplete response, unexpected tool/output item, malformed JSON, schema mismatch, additional properties, missing required fields, invalid confidence, invalid/out-of-bounds coordinates, missing returned model, and prompt-like text inside the receipt.
4. Remove the identifier-only request. Send the authorized immutable image bytes and validate media type/size before encoding.
5. Use a versioned prompt that states source text is data, not instructions. Do not concatenate untrusted OCR/source text into system/developer instructions.
6. Parse and validate the strict output, map it to `ReceiptOcrResult`, preserve exact model/adapter/prompt/schema/preprocessing metadata, and let deterministic receipt validation reconcile arithmetic and duplicates.
7. Support `original` detail only through explicit evaluated configuration. Fail safe on unsupported combinations. Version every resize/rotation/crop and remap coordinates before accepting evidence.
8. Keep live network access out of these tests by injecting a fake OpenAI transport.

**Commit:** `feat(dda): complete OpenAI receipt extraction`

## Task 4: Build the offline receipt evaluation corpus and runner

**Requirements:** DDA-010, DDA-041, DDA-042, DDA-043, DDA-044

**Files:**

- Create: `tools/fixture-validation/src/run-openai-receipt-eval.mjs`
- Create: `tools/fixture-validation/test/openai-receipt-eval.test.mjs`
- Modify: `tools/fixture-validation/package.json`
- Create: `tools/fixture-validation/fixtures/dda/receipt-expense/openai-eval/manifest.json`
- Create: `tools/fixture-validation/fixtures/dda/receipt-expense/openai-eval/synthetic-vi.png`
- Create: `tools/fixture-validation/fixtures/dda/receipt-expense/openai-eval/synthetic-vi.expected.json`
- Create: `tools/fixture-validation/fixtures/dda/receipt-expense/openai-eval/synthetic-en.png`
- Create: `tools/fixture-validation/fixtures/dda/receipt-expense/openai-eval/synthetic-en.expected.json`
- Create: `tools/fixture-validation/fixtures/dda/receipt-expense/openai-eval/synthetic-hostile.png`
- Create: `tools/fixture-validation/fixtures/dda/receipt-expense/openai-eval/synthetic-hostile.expected.json`
- Create: `tools/fixture-validation/fixtures/dda/receipt-expense/openai-eval/recorded-provider-responses.json`
- Modify: `docs/evidence/dda/openai-receipt-evaluation.md`

### Acceptance criteria (corpus quality — mandatory)

Fixtures must be **readable, non-uniform, realistic synthetic receipts**, not solid-color placeholders:

- Useful resolution (at least 400×600) with legible merchant, date, currency, line items or totals, and totals that reconcile arithmetically.
- Non-uniform imagery (paper texture / rules / multi-ink text). Reject tiny, blank, uniform-fill, or low-information images via automated admission tests.
- Vietnamese, English, and hostile-text cases must contain actual receipt glyphs; hostile prompt-like text is data only.
- Manifest records content hashes, dimensions, expected fields, coordinate boxes, currency/date rules, source/licensing, and `noCustomerData: true`.
- A prior live run against solid-color squares is **plumbing evidence only**; any model-quality conclusion from that corpus is **invalid** and must not be treated as extraction-quality failure of the cheap baseline.

### Steps

1. Create visibly synthetic Vietnamese, English, and hostile-text receipts that meet the corpus-quality acceptance criteria above. Record source/licensing as project-generated, content hashes, dimensions, expected fields, coordinate boxes, currency/date rules, and no-customer-data attestation in the manifest.
2. Make the default runner entirely offline. It consumes recorded provider-shaped responses and proves parsing, validation, scoring, reconciliation, coordinate checks, refusal/schema failures, and content-safe evidence generation.
3. Report per-field exact/normalized match, required-field coverage, arithmetic reconciliation, coordinate validity/overlap, refusal rate, schema failure rate, latency/token fields when present, and unknown/not-evaluated states. Do not collapse these into a misleading percentage-correct number.
4. Fail when fixtures are missing, hashes change, expected values are absent, a recorded response contains secrets/customer-looking data, admission rejects tiny/uniform/blank/low-information images, or any network primitive is called in offline mode.
5. Add scripts `openai:receipt:offline` and `openai:receipt:live`; the ordinary `test` and CI path invokes offline mode only.
6. Update the evidence page with offline results and keep `liveEvaluation: blocked-owner-run` until Task 5 succeeds on the repaired corpus. Preserve any earlier live plumbing aggregate as non-authoritative for model quality.

**Commit:** `test(dda): add offline OpenAI receipt evaluation`

## Task 5: Add the explicit live synthetic receipt evaluation

**Requirements:** DDA-036, DDA-041, DDA-042, DDA-044, DDA-045

**Files:**

- Modify: `tools/fixture-validation/src/run-openai-receipt-eval.mjs`
- Modify: `tools/fixture-validation/test/openai-receipt-eval.test.mjs`
- Create: `docs/runbooks/openai-development-evaluation.md`
- Modify after owner run: `docs/evidence/dda/openai-receipt-evaluation.md`

### Live-mode gates

Live mode must require all of the following:

- `--live`
- `--acknowledge-external-egress`
- the checked-in synthetic corpus name and matching manifest hashes
- `OPENAI_API_KEY` in the current process
- `DATABREEZE_OPENAI_RECEIPT_MODEL` explicitly set
- an explicit image-detail choice
- a maximum request count and input-byte cap
- a development project identifier label that is safe to log, not the secret
- no customer/protected corpus flag

### Steps

1. Add negative tests proving every missing gate fails before network access and never prints the key.
2. Limit the first smoke test to one synthetic Vietnamese receipt. Only after it returns a structurally valid candidate may the runner process the English and hostile fixtures.
3. Record returned model, provider request IDs, request counts, token usage, latency, refusal/schema outcomes, and aggregate extraction metrics. Do not persist images, prompts, bearer headers, raw provider responses, or extracted source values.
4. Write the detailed local run into ignored `reports/`; emit a content-safe aggregate JSON that Cursor can use to update `docs/evidence/dda/openai-receipt-evaluation.md`.
5. Treat an unavailable model, permission error, rate limit, insufficient quota, refusal, schema mismatch, or threshold miss as a real blocked/failed result. Never turn a skipped call into a pass.
6. A development alias can pass this smoke test, but the evidence must say `promotionEligible: false` until an exact snapshot and approved evaluation thresholds pass.

The first development run uses the pinned `gpt-4o-mini-2024-07-18` snapshot and `detail: "high"`. `GPT-4o-mini` does not support `detail: "original"`; coordinate evidence must therefore be evaluated after its documented resizing behavior. A stronger model is tested only after this cheap baseline produces recorded failing metrics.

**Owner action:** Follow the manual procedure at the end of this plan only after Cursor reports Tasks 1-4 green.

**Commit after sanitized evidence:** `test(dda): record synthetic OpenAI receipt evaluation`

## Task 6: Implement bounded OpenAI mapping suggestions

**Requirements:** DDA-005, DDA-006, DDA-008, DDA-010, DDA-011, DDA-036, DDA-043, DDA-044, DDA-045

**Files:**

- Create: `services/api/src/features/dda/etl/application/mapping-assistance.port.ts`
- Create: `services/api/src/features/dda/etl/application/mapping-assistance.service.ts`
- Create: `services/api/src/features/dda/etl/adapter/openai-mapping-assistance.adapter.ts`
- Create: `services/api/src/features/dda/etl/adapter/openai-mapping-output.schema.ts`
- Modify: `services/api/src/features/dda/etl/application/etl-proposal.service.ts`
- Modify: `services/api/src/features/dda/dda.module.ts`
- Create: `services/api/test/features/dda/openai-mapping-assistance.test.ts`
- Modify: `services/api/test/features/dda/etl-proposal.service.test.ts`
- Create: `tools/fixture-validation/fixtures/dda/openai-assistance/mapping-cases.json`

### Steps

1. Define a provider-neutral port that accepts exact schema/profile versions, authorized headers/type profiles, target fields, locale, and only policy-approved bounded samples. It returns suggestions, alternatives, rationale, and uncertainty—never an accepted ETL plan.
2. Enforce `MAPPING_SUGGESTION` egress policy, payload bytes, sample permission, tenant scope, BUA admission, and a separate kill switch.
3. Request strict structured output with allowlisted mapping/transform kinds only. Reject code, SQL, expressions, unknown fields, invented target IDs, row omission, and hidden sampling.
4. Feed surviving suggestions into `review.aiSuggestions` with `authoritative: false`. The normal ETL plan validator and explicit acceptance remain mandatory.
5. Add hostile header/cell tests and prove OpenAI denial/failure leaves manual typed mapping and deterministic ETL available.
6. Add an offline synthetic mapping evaluator. Live mapping smoke is opt-in through the same guarded runner pattern and a maximum of two synthetic requests.

**Commit:** `feat(dda): add governed OpenAI mapping suggestions`

## Task 7: Implement bounded OpenAI typed analyst proposals

**Requirements:** DDA-015, DDA-016, DDA-017, DDA-018, DDA-036, DDA-043, DDA-044, DDA-045, DDA-050

**Files:**

- Modify: `services/api/src/features/dda/analyst/application/analysis-adapter.port.ts`
- Modify: `services/api/src/features/dda/analyst/application/analysis-proposal.service.ts`
- Create: `services/api/src/features/dda/analyst/adapter/openai-analysis.adapter.ts`
- Create: `services/api/src/features/dda/analyst/adapter/openai-analysis-output.schema.ts`
- Modify: `services/api/src/features/dda/dda.module.ts`
- Create: `services/api/test/features/dda/openai-analysis.adapter.test.ts`
- Modify: `services/api/test/features/dda/analysis-proposal.service.test.ts`
- Create: `tools/fixture-validation/fixtures/dda/openai-assistance/analysis-cases.json`

### Steps

1. Replace the current question-and-tenant-only adapter request with a bounded authorized catalog: opaque version IDs, allowed metrics/dimensions/joins, units, grains, time bounds, locale, output bounds, and estimated-cost limits. Send no raw rows by default.
2. Enforce `PLAN_PROPOSAL` policy, metadata permission, tenant scope, payload cap, BUA admission, and a separate analyst kill switch.
3. Request a strict typed patch containing only selected existing IDs, filters, grain, output form, assumptions, ambiguity alternatives, and rationale.
4. Reject generated SQL/code, numeric result values, unknown/unauthorized fields, invented metrics, unbounded rows, cross-tenant IDs, unsupported joins, invalid units/grain, and prompt-injected instructions.
5. Validate and merge the proposed patch through `createDdaAnalysisPlanV1`; provider output never bypasses the application validator. The plan remains a proposal until user acceptance and deterministic execution.
6. Prove disabled/failing OpenAI still permits manual typed plans and deterministic execution.
7. Add offline Vietnamese/English synthetic questions and an opt-in maximum-two-request live smoke.

**Commit:** `feat(dda): add governed OpenAI analyst proposals`

## Task 8: Implement bounded narratives and dashboard/canvas proposals

**Requirements:** DDA-018, DDA-019, DDA-020, DDA-021, DDA-022, DDA-023, DDA-024, DDA-036, DDA-043, DDA-044, DDA-045

**Files:**

- Create: `services/api/src/features/dda/analyst/application/narrative-adapter.port.ts`
- Create: `services/api/src/features/dda/analyst/application/analysis-narrative.service.ts`
- Create: `services/api/src/features/dda/analyst/adapter/openai-narrative.adapter.ts`
- Create: `services/api/src/features/dda/dashboard/application/dashboard-proposal.port.ts`
- Create: `services/api/src/features/dda/dashboard/application/dashboard-proposal.service.ts`
- Create: `services/api/src/features/dda/dashboard/adapter/openai-dashboard-proposal.adapter.ts`
- Modify: `services/api/src/features/dda/dashboard/application/dashboard-draft.service.ts`
- Modify: `services/api/src/features/dda/dda.module.ts`
- Create: `services/api/test/features/dda/openai-narrative.adapter.test.ts`
- Create: `services/api/test/features/dda/openai-dashboard-proposal.adapter.test.ts`
- Modify: `services/api/test/features/dda/dashboard-draft.service.test.ts`
- Create: `tools/fixture-validation/fixtures/dda/openai-assistance/narrative-cases.json`
- Create: `tools/fixture-validation/fixtures/dda/openai-assistance/dashboard-cases.json`

### Steps

1. Narrative input contains only an authorized bounded deterministic result/provenance package. Every proposed numeric claim must list exact result-cell IDs; the service rejects missing, mismatched, unauthorized, or invented claims.
2. Dashboard proposal input contains the accepted typed analysis plan, authorized field/metric catalog, result shapes, widget allowlist, locale, accessibility rules, responsive constraints, and cost bounds. It contains no executable code or raw source by default.
3. Enforce `NARRATIVE` or `PLAN_PROPOSAL` policy as applicable, tenant scope, result-row permission, payload cap, BUA admission, and separate kill switches.
4. Strict output may propose only declarative supported pages, KPI/table/bar/line-area/pie-donut/text-evidence widgets, bindings, filters, layout, rationale, assumptions, and affected IDs.
5. Validate proposals through the existing domain constructors/widget catalog. Unknown widgets, hidden evidence/warnings, invalid bindings, unstable IDs, permission expansion, scripts, HTML, URLs, and cross-tenant references fail closed.
6. Store a versioned proposal and preview. Explicit acceptance creates a draft only; publishing remains a separate authorized action.
7. Prove denial/outage leaves manual canvas editing, deterministic results, and saved snapshot viewing available.
8. Add offline synthetic cases and opt-in live smoke capped at one narrative and one dashboard proposal.

**Commit:** `feat(dda): add governed OpenAI dashboard assistance`

## Task 9: Prove integrated safety, budget, fallback, and tenant isolation

**Requirements:** DDA-003, DDA-010, DDA-015, DDA-018, DDA-019, DDA-024, DDA-036, DDA-043, DDA-044, DDA-045

**Files:**

- Modify: `services/api/test/features/dda/openai-egress-policy.test.ts`
- Modify: `services/api/test/features/dda/dda-tenant-isolation.e2e.test.ts`
- Modify: `services/api/test/features/dda/dda-authorization-matrix.e2e.test.ts`
- Modify: `services/api/test/features/dda/dda-retention-deletion.e2e.test.ts`
- Modify: `tools/performance/dda-openai-budget.mjs`
- Create: `services/api/test/features/dda/openai-provider-outage.e2e.test.ts`
- Create: `services/api/test/features/dda/openai-content-boundary.e2e.test.ts`

### Steps

1. Cover every purpose/locality/data-class combination, exact tenant policy, payload limit, request/token/retry/concurrency/cost admission, reservation finalization, and content-safe audit outcome.
2. Inject hostile instructions through filenames, headers, cells, questions, receipt text, metadata, samples, result rows, and evidence. Prove they cannot select tools, another tenant, broader data, code, publication, approval, or canvas mutation.
3. Simulate timeout, 429 with retry-after, 5xx, invalid auth, refusal, incomplete output, malformed schema, network loss, kill switch during work, and provider outage.
4. Prove originals and proposals remain recoverable, no partial candidate becomes governed data, no dashboard publishes, and the last good snapshot remains available.
5. Reconcile BUA usage with provider token metadata without logging content. Pricing is an explicitly versioned evaluation input; if it is absent or stale, report tokens and `costEstimate: unknown` rather than fabricate a dollar value.
6. Run focused API tests, offline evaluation, secret scanning, and the relevant plan-402 security gate.

**Commit:** `test(dda): prove OpenAI safety and fallback`

## Task 10: Record honest evidence and return to the complete program

**Requirements:** All requirements in this plan

**Files:**

- Modify: `docs/evidence/dda/openai-receipt-evaluation.md`
- Create: `docs/evidence/dda/openai-assistance-evaluation.md`
- Modify: `docs/evidence/dda/production-gate-matrix.md`
- Modify: `docs/evidence/dda/release-readiness.md`
- Modify: `docs/plans/requirement-traceability.json`
- Modify: `docs/plans/data-to-dashboard-orchestration.json`
- Modify: `docs/plans/CURSOR-HANDOFF.md`

### Steps

1. Run the focused clean commands:

   ```powershell
   corepack pnpm --filter @databreeze/api test
   corepack pnpm --filter @databreeze/fixture-validation test
   corepack pnpm --filter @databreeze/fixture-validation openai:receipt:offline
   corepack pnpm ci:secrets
   corepack pnpm requirements:check
   corepack pnpm orchestration:check
   corepack pnpm contracts:check
   ```

2. Run `corepack pnpm repo:check` from the clean plan-402 baseline. A focused pass does not excuse unrelated repository failures.
3. Record commit hashes, commands/exit codes/test counts, fixture hashes, model identifier, prompt/schema/preprocessing versions, request caps, aggregate metrics, failures/skips, and owner-run evidence. Never commit raw responses or a key.
4. Keep the following separate:
   - `offlineVerified`
   - `liveSyntheticVerified`
   - `protectedCorpusVerified`
   - `productionSnapshotApproved`
   - `productionSecretConfigured`
   - `productionReady`
5. After this focused plan is green, resume plan 402 at the next unfinished task. When plan 402 reaches Task 8, reconcile and reuse this evidence instead of reimplementing it.
6. G5 and `productionReady` remain blocked until Task 12 owner actions, the approved non-customer corpus, exact snapshot thresholds, actual OpenAI project data controls, AWS Secrets Manager, staging rehearsal, and final release approval are complete.

**Commit:** `docs(dda): record OpenAI development validation`

## Manual owner procedure

### A. Create the development/evaluation credential

Do this now or while Cursor completes Tasks 1-4. Cursor does not need the key to implement or run offline tests.

1. In the OpenAI platform, create a dedicated project such as `DataBreeze Development Evaluation`.
2. Add an organization-owned billing method and set a deliberately low project spend limit/alert and conservative model rate limits.
3. Enable only the image-capable model(s) being evaluated.
4. Create a project service account with the least privilege available. Do not use an Admin API key and do not reuse the future production credential.
5. Copy the newly displayed secret once into your password manager or approved secret store. Do not paste it into Cursor, Codex, GitHub, Slack, email, a document, or a repository file.
6. Record the non-secret project name, service-account name, approved model candidate, spend limit, and retention/data-control posture separately.

### B. Wait for Cursor's offline-ready handoff

Cursor must report all of these before any live call:

- Tasks 1-4 committed
- focused API and fixture tests passing
- offline evaluator passing
- secret scan passing
- exact live command and request cap present
- fixture manifest hashes verified
- no customer data in the corpus

### C. Run the live evaluation yourself in a private PowerShell terminal

Use the command Cursor has implemented. The following pattern prevents the key from appearing in shell history or command arguments. The development model is deliberately pinned to the inexpensive `gpt-4o-mini-2024-07-18` snapshot; production model selection remains a later evaluation decision.

```powershell
$openAiSecret = Read-Host 'OpenAI development key' -AsSecureString
$openAiPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($openAiSecret)
try {
  $env:OPENAI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($openAiPointer)
  $env:DATABREEZE_OPENAI_RECEIPT_ENABLED = 'true'
  $env:DATABREEZE_OPENAI_RECEIPT_MODEL = 'gpt-4o-mini-2024-07-18'
  $env:DATABREEZE_OPENAI_IMAGE_DETAIL = 'high'
  corepack pnpm --filter @databreeze/fixture-validation openai:receipt:live -- --acknowledge-external-egress --corpus synthetic --max-requests 3 --max-input-bytes 3000000
} finally {
  Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:DATABREEZE_OPENAI_RECEIPT_ENABLED -ErrorAction SilentlyContinue
  Remove-Item Env:DATABREEZE_OPENAI_RECEIPT_MODEL -ErrorAction SilentlyContinue
  Remove-Item Env:DATABREEZE_OPENAI_IMAGE_DETAIL -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($openAiPointer)
}
```

Run this from the repository worktree after Cursor confirms the script exists. Do not run it before Task 4, and do not substitute personal/customer receipts.

### D. Give Cursor only the sanitized result

Tell Cursor the ignored aggregate report path and whether the OpenAI dashboard shows the expected bounded request count. Do not send the key, raw provider response, receipt image, prompt, extracted values, or billing details.

Cursor then updates the committed evidence pages with aggregate metrics and keeps production promotion false.

### E. Revoke or retain safely

- Revoke the evaluation key immediately if it appeared anywhere unsafe, request counts differ, or the evaluation is finished and no further live iteration is planned.
- Otherwise retain it only in the password manager/approved development secret store, keep the project cap low, and rotate it before a wider test.
- Create the production project/service account and AWS Secrets Manager value later under plan 402 Task 12. Never promote this development key into production.

## Acceptance gate

This plan is complete only when:

- the server-only receipt path sends real approved image bytes and returns a deterministically validated candidate;
- all five assistance capabilities have strict schemas, policy/admission checks, typed validation, audit metadata, tests, and non-AI fallbacks;
- ordinary tests and CI cannot call OpenAI;
- offline synthetic evaluation is reproducible;
- owner-run live synthetic evidence is content-safe and request-capped;
- no secret or customer data is present in the worktree or Git history;
- the repository gate is green from the plan-402 baseline; and
- evidence still states that production is blocked pending the separate production activation gates.

## Intentionally deferred

- Production OpenAI project and secret configuration
- Zero Data Retention/Modified Abuse Monitoring or regional-processing approval
- Protected non-customer benchmark beyond the small checked-in synthetic smoke corpus
- Exact production model snapshot approval
- AWS deployment and staging rehearsal
- Android end-to-end live OCR until plan 402 Task 7 is complete
- Production budgets, alerts, dashboards, incident rehearsal, privacy disclosure, and release approval
- Customer data, broad document OCR, arbitrary tools/code, autonomous publish/approval, and genuine streaming
