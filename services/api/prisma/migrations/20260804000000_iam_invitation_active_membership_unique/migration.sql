-- IAM-010: enforce one active invitation per membership at the database boundary.
CREATE UNIQUE INDEX "invitation_tokens_active_membership_key"
ON "iam"."invitation_tokens"("membership_id")
WHERE "status" = 'ACTIVE';
