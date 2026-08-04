# IAM-010 durable invitation token slice — 2026-08-03

## Scope

This evidence record covers the durable persistence boundary for the IAM-010 invitation-token
slice. It is a partial implementation record, not a release approval or a claim that Plan 020 is
complete.

## Delivered

- `2a65756` adds the `iam.invitation_tokens` Prisma model and centrally ordered migration.
- Only the token digest and recipient-email digest are persisted; the raw bearer value is accepted
  only by the delivery port and is never returned by the application result or stored in a row.
- `PrismaIamInvitationRepositoryAdapter` maps persisted rows through domain validation, enforces
  tenant scope visibility, rejects sibling-token reads, prevents multiple active invitations per
  membership, and uses compare-and-set revisions for redemption and membership activation.
- The Prisma foundation test proves the schema diff and migration inventory include the new table.

## Verification

- `corepack pnpm --filter @databreeze/api exec prisma validate --config prisma.config.ts`
- `corepack pnpm --filter @databreeze/api test` — 352 tests passed.
- `corepack pnpm --filter @databreeze/domain test` — 134 tests passed.
- `git diff --check` passed before commit.

## Explicitly not complete

The invitation HTTP/controller and production composition wiring, transactional AUD append,
registration for unknown recipients, resend/revocation administration, email-provider adapter,
and production PostgreSQL/backup/security evidence remain future work. IAM-010 therefore remains
`partial` and `not-verified` in the requirement manifest.
