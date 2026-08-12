import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const prismaRoot = resolve(root, 'prisma');
const migrationPath = resolve(
  prismaRoot,
  'migrations/20260812010000_unified_workspace/migration.sql',
);

function readMigration(): string {
  return readFileSync(migrationPath, 'utf8');
}

void test('[IAM-022] rejects duplicate active OTP purpose for the same admission digest', () => {
  const migration = readMigration();
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "email_verification_challenges_active_purpose_key"[\s\S]*WHERE\s+\("status"\s*=\s*'ACTIVE'\)/iu,
  );
  assert.match(migration, /"code_digest"\s+CHAR\(64\)/u);
  assert.doesNotMatch(migration, /"otp_code"|"raw_code"|"plain_code"/iu);
});

void test('[DDA-052] rejects cross-workspace source assignment ancestry', () => {
  const migration = readMigration();
  assert.match(
    migration,
    /FOREIGN KEY \("organization_id", "workspace_id", "source_id"\)[\s\S]*REFERENCES "dda"\."dataset_sources"/u,
  );
});

void test('[DDA-055] rejects cross-workspace conversation message and context linkage', () => {
  const migration = readMigration();
  assert.match(
    migration,
    /FOREIGN KEY \("organization_id", "workspace_id", "conversation_id"\)[\s\S]*REFERENCES "dda"\."conversations"/u,
  );
  assert.match(migration, /CONSTRAINT "conversation_messages_conversation_scope_fkey"/u);
  assert.match(migration, /CONSTRAINT "conversation_context_events_conversation_scope_fkey"/u);
});

void test('[DDA-055] rejects duplicate conversation message idempotency keys', () => {
  const migration = readMigration();
  assert.match(
    migration,
    /UNIQUE INDEX "conversation_messages_workspace_idempotency_key"|CONSTRAINT "conversation_messages_workspace_idempotency_key"/u,
  );
});

void test('[IAM-024] rejects invalid workspace agent grant levels', () => {
  const migration = readMigration();
  assert.match(
    migration,
    /CHECK \("level" IN \('NONE', 'ANALYZE', 'PROPOSE_CHANGES', 'APPLY_CONFIRMED_CHANGES'\)\)/u,
  );
});

void test('[DDA-053] rejects folder move receipts without an accepted placement review', () => {
  const migration = readMigration();
  assert.match(
    migration,
    /FOREIGN KEY \("organization_id", "workspace_id", "review_id"\)[\s\S]*REFERENCES "dda"\."folder_placement_reviews"/u,
  );
});

void test('[DDA-055] conversation deletion requires an explicit retention state column', () => {
  const migration = readMigration();
  const iam = readFileSync(resolve(prismaRoot, 'schema/dda.prisma'), 'utf8');
  assert.match(migration, /"retention_state"\s+VARCHAR\(/u);
  assert.match(iam, /retentionState/u);
  assert.match(
    migration,
    /CHECK \("retention_state" IN \('ACTIVE', 'PENDING_DELETE', 'DELETED'\)\)/u,
  );
});

void test('[DDA-052][IAE-003] source originals store IAE references without local paths', () => {
  const migration = readMigration();
  assert.match(migration, /"iae_artifact_version_id"\s+UUID\s+NOT NULL/u);
  assert.match(migration, /"dsm_dataset_id"\s+UUID\s+NOT NULL/u);
  assert.doesNotMatch(migration, /"local_path"|"absolute_path"|"file_path"/iu);
});

void test('[DDA-052..059] workspace indexes cover organization, workspace, updatedAt, id', () => {
  const migration = readMigration();
  assert.match(
    migration,
    /CREATE INDEX "conversations_workspace_updated_idx"[\s\S]*\("organization_id", "workspace_id", "updated_at", "id"\)/u,
  );
  assert.match(
    migration,
    /CREATE INDEX "dataset_sources_workspace_updated_idx"[\s\S]*\("organization_id", "workspace_id", "updated_at", "id"\)/u,
  );
});
