# IAM email OTP and Google OIDC runbook

Owner-controlled configuration for verified registration and persistent sessions (`IAM-022`, `IAM-023`). Real credentials are owner-supplied secrets and never fixtures.

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABREEZE_IAM_EMAIL_VERIFICATION_DIGEST_KEY` | Base64url-encoded 32-byte HMAC key for OTP and email admission digests. |
| `DATABREEZE_IAM_EMAIL_VERIFICATION_ENVELOPE_KEY` | Base64url-encoded 32-byte AES-GCM key for pending registration and idempotent activation envelopes. |
| `DATABREEZE_IAM_REGISTRATION_ADMISSION_KEY` | Base64url-encoded 32-byte HMAC key for IP and email abuse-control identifiers. |
| `DATABREEZE_REDIS_URL` | TLS-only Redis endpoint, `rediss://host:6379`, for shared registration admission counters. |
| `DATABREEZE_IAM_EMAIL_FROM_ADDRESS` | SES-verified sender identity for transactional OTP mail. |
| `DATABREEZE_IAM_EMAIL_SES_REGION` | AWS region containing the SES identity, normally `ap-southeast-1`. |
| `DATABREEZE_IAM_OIDC_GOOGLE_CLIENT_ID` | Google OAuth client ID for Web/Desktop PKCE and Android. |
| `DATABREEZE_IAM_OIDC_GOOGLE_CLIENT_SECRET` | Google OAuth client secret (server-only; never shipped to clients). |
| `DATABREEZE_IAM_OIDC_APPROVED_REDIRECT_ORIGINS` | Comma-separated HTTPS redirect URIs approved for authorization-code exchange. |
| `DATABREEZE_IAM_SESSION_COOKIE_DOMAIN` | Optional cookie domain for Web refresh cookies. |

## Session cookie policy

Web refresh cookies must be `HttpOnly; Secure; SameSite=Lax` with path `/v1/auth`, the narrow route family containing refresh and sign-out. Access tokens remain at most 15 minutes. Refresh families use Web 30/180 day and Desktop/Android 90/365 day bounds.

## AWS Secrets Manager names

For environment `{env}`, owners populate these three whole secrets out of band. Each value is one canonical 43-character base64url string decoding to exactly 32 bytes.

- `databreeze/{env}/iam/email-verification-digest-key`
- `databreeze/{env}/iam/email-verification-envelope-key`
- `databreeze/{env}/iam/registration-admission-key`

The ECS execution role can read those exact secrets. The API task role can call only `ses:SendEmail` against the configured sender identity. It does not receive broad SES permissions. Redis traffic uses the private ElastiCache endpoint with transit encryption.

## Owner checklist

1. Verify the exact sender address in SES and move the account out of the SES sandbox before external pilot delivery.
2. Create Google OAuth consent screen clients for Web, Desktop PKCE, and Android.
3. Register exact redirect URIs matching `DATABREEZE_IAM_OIDC_APPROVED_REDIRECT_ORIGINS`.
4. Generate the three independent 32-byte keys and populate the exact Secrets Manager names above. Do not commit them or reuse one key for multiple purposes.
5. Set the environment's `iam_email_from_address` to the verified SES identity and confirm `DATABREEZE_REDIS_URL` resolves only inside the VPC.
6. Run a bounded staging registration using a designated test inbox. Confirm the OTP body contains no password, provider response, account-existence signal, or internal correlation identifier.
