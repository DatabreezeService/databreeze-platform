# Plan 415: Account settings surface

**Status:** Approved for implementation by the product owner in this task.

## Goal

Make account-level settings discoverable inside the existing premium settings
surface without inventing authority or claiming unsupported mutations.

## Requirements

- IAM-005/IAM-006/IAM-009: show authenticated identity, MFA posture, and the
  current-session boundary from server bootstrap/session state.
- IAM-016: expose the current locale preference and link to the existing locale
  switcher without changing stored business values.
- IAM-023: keep browser credentials and session controls server-authoritative.
- WEB-001/WEB-002: keep settings states explicit for loading, unavailable,
  forbidden, and read-only capability boundaries.

## Scope

1. Add an account-settings section with identity, email, locale, MFA posture,
   session posture, password recovery, and sign-out actions.
2. Use existing authenticated bootstrap/session and recovery routes. Do not add
   a client-authored profile update until IAM publishes a revisioned profile
   mutation port and contract.
3. Show MFA enrollment as unavailable/read-only when the server proof provider is
   not composed; never accept or persist a client-generated secret as a fake
   enrollment.
4. Keep workspace administration, invitations, role presets, agent grants,
   entitlements, usage, and billing in their existing server-backed sections.

## Verification

- Web focused settings tests cover identity, locale, recovery, sign-out, and
  unavailable MFA copy in Vietnamese and English.
- Web typecheck/build, API typecheck, contract generation/check, and diff check.
- Local authenticated journey reaches `/settings`, `/usage`, and `/billing`.

## Explicit non-goals

- No fake profile-save success.
- No client-side MFA secret generation or bypass of the server proof verifier.
- No payment credential storage or browser-side entitlement counters.

## Implementation checkpoint (2026-08-18)

- Account identity, verified email, locale, MFA posture, active-session posture,
  recovery, and sign-out actions are projected from the authenticated bootstrap
  and session boundary. MFA enrollment remains an explicit read-only/unavailable
  state until a real proof provider is composed.
- Account identity and security actions remain visible even when the separate
  workspace-member projection is forbidden or temporarily unavailable; Viewer
  accounts are not stranded on a workspace-administration error screen.
- Session security has an explicit localized empty state when no session
  projection is available; a missing list never renders as a blank panel or
  implies that no active credentials exist.
- Focused settings/workspace Web tests, API typechecks, Web typecheck/build, and
  copy-encoding checks are green. Docker-backed authenticated verification is
  still an environment gate rather than an unverified completion claim.
