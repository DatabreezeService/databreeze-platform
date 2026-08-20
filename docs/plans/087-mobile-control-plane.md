# Mobile control-plane completion slice

Status: implementation slice for AND-007, AND-008, AND-009, AND-010, AND-011, AND-016, AND-018, AND-020, AND-023 and AND-024.

## Scope

- Add durable mobile route-token, push-registration and report records under the `mobile` Prisma schema.
- Expose tenant-scoped mobile tasks, route-token consumption, push registration and report APIs.
- Expose approval policy/request/decision APIs with server membership lookup and MFA assertion requirement.
- Expose explicit invoice/table extraction paths so Android can select the server-owned profile without
  relying on a route alias hidden from generated OpenAPI.
- Bootstrap a signed DSO cursor so an enrolled Android device cannot start with an unsigned cursor.
- Keep Android offline bytes encrypted with Keystore, add local package encryption/import, quality hints, route-token handling and approval/report clients.

## Non-goals / deployment dependencies

FCM delivery, S3 credentials/presigned storage, route-token issuance by the web/API workflow, MFA factor proof provider, and Android release certificate remain deployment-owned inputs. No provider secret is committed to the APK or repository.

## Verification

`prisma validate`, generated OpenAPI drift/Redocly validation, API type/test compilation, Android unit tests and debug APK assembly must pass before handoff.
