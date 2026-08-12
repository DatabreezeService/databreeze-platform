# IAM email OTP and Google OIDC runbook

Owner-controlled configuration for verified registration and persistent sessions (`IAM-022`, `IAM-023`). Real credentials are owner-supplied secrets and never fixtures.

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABREEZE_IAM_EMAIL_VERIFICATION_DIGEST_KEY` | HMAC key for OTP and admission digests. Rotate with previous-key support. |
| `DATABREEZE_IAM_EMAIL_DELIVERY_ADAPTER` | Provider-neutral delivery adapter id (`local-sink`, `ses`, or approved vendor). |
| `DATABREEZE_IAM_EMAIL_FROM_ADDRESS` | Verified sender address for transactional OTP mail. |
| `DATABREEZE_IAM_EMAIL_LOCAL_SINK_PATH` | Local deterministic mail sink path for non-production. |
| `DATABREEZE_IAM_OIDC_GOOGLE_CLIENT_ID` | Google OAuth client ID for Web/Desktop PKCE and Android. |
| `DATABREEZE_IAM_OIDC_GOOGLE_CLIENT_SECRET` | Google OAuth client secret (server-only; never shipped to clients). |
| `DATABREEZE_IAM_OIDC_APPROVED_REDIRECT_ORIGINS` | Comma-separated HTTPS redirect URIs approved for authorization-code exchange. |
| `DATABREEZE_IAM_SESSION_COOKIE_DOMAIN` | Optional cookie domain for Web refresh cookies. |
| `DATABREEZE_IAM_SESSION_COOKIE_PATH` | Refresh cookie path. Default `/api/iam/session`. |

## Session cookie policy

Web refresh cookies must be `HttpOnly; Secure; SameSite=Lax` with path `/api/iam/session`. Access tokens remain at most 15 minutes. Refresh families use Web 30/180 day and Desktop/Android 90/365 day bounds.

## Owner checklist

1. Provision transactional email credentials and sender domain alignment.
2. Create Google OAuth consent screen clients for Web, Desktop PKCE, and Android.
3. Register exact redirect URIs matching `DATABREEZE_IAM_OIDC_APPROVED_REDIRECT_ORIGINS`.
4. Store digest and OAuth secrets in the approved secret manager. Do not commit them.
5. Confirm local deterministic mail sink for non-production OTP verification.
