# Local Gmail OTP Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow the local production-shaped profile to deliver OTP messages to a real Gmail inbox through an explicit TLS SMTP opt-in, while keeping Mailpit as the default and preserving production fail-closed boundaries.

**Architecture:** The local profile selects `mailpit` by default. When `DATABREEZE_LOCAL_EMAIL_PROVIDER=gmail`, the API uses `smtp.gmail.com:465` over certificate-validated TLS and SMTP AUTH LOGIN with a Gmail App Password. Credentials remain in the ignored local `.env`; no credential is passed to the Web bundle or persisted in application data.

**Tech Stack:** NestJS API, Node.js `tls`, Docker Compose, TypeScript Node tests, PostgreSQL/Redis unchanged.

## Global Constraints

- Mailpit remains the default local provider.
- Gmail requires an App Password; ordinary Gmail passwords are rejected by setup guidance.
- TLS certificate validation is mandatory; plaintext external SMTP is not supported.
- Production composition and published contracts remain unchanged.
- Provider failures return the existing content-safe email-delivery error.

---

### Task 1: Secure Gmail SMTP transport

**Files:**
- Create: `services/api/src/features/iam/adapter/gmail-smtp-email-verification-delivery.adapter.ts`
- Create: `services/api/test/features/iam/gmail-smtp-email-verification-delivery.adapter.test.ts`

- [x] Write tests for Gmail-only host/port validation, App Password validation, sender identity matching, and content-safe delivery failures.
- [x] Run the focused test and verify it fails because the adapter does not exist.
- [x] Implement implicit TLS SMTP AUTH LOGIN with bounded timeout and normalized errors.
- [x] Run the focused test and verify it passes.

### Task 2: Local composition and operator setup

**Files:**
- Modify: `services/api/src/platform/local-database.composition.ts`
- Modify: `services/api/test/platform/local-database-composition.test.ts`
- Modify: `infrastructure/local/compose.yml`
- Modify: `infrastructure/local/.env.example`
- Modify: `infrastructure/local/README.md`

- [x] Write tests for Mailpit default selection, Gmail selection, and invalid Gmail configuration rejection.
- [x] Run the focused composition test and verify the Gmail cases fail.
- [x] Add explicit `DATABREEZE_LOCAL_EMAIL_PROVIDER=gmail` selection and pass only local API SMTP credentials into the API container.
- [x] Run API typecheck, focused tests, Compose config validation, and diff checks.
- [x] Document Gmail 2-Step Verification/App Password setup and the local registration journey.
