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

void test('[DDA-052..059][IAM-022..025] registers unified workspace persistence models', () => {
  const iam = readFileSync(resolve(prismaRoot, 'schema/iam.prisma'), 'utf8');
  const dda = readFileSync(resolve(prismaRoot, 'schema/dda.prisma'), 'utf8');

  for (const model of [
    'IamEmailVerificationChallenge',
    'IamOidcIdentityLink',
    'WorkspaceAgentGrant',
  ]) {
    assert.match(iam, new RegExp(`model ${model}\\b`, 'u'), `missing IAM model ${model}`);
  }

  for (const model of [
    'DdaDatasetSource',
    'DdaSourceAssignment',
    'DdaFolderPlacementReview',
    'DdaFolderMoveReceipt',
    'DdaConversation',
    'DdaConversationMessage',
    'DdaConversationContextEvent',
    'DdaConversationSummary',
    'DdaExtractionCandidate',
    'DdaNamedDashboardView',
  ]) {
    assert.match(dda, new RegExp(`model ${model}\\b`, 'u'), `missing DDA model ${model}`);
  }

  assert.doesNotMatch(dda, /\bBytes\b|@db\.ByteA|\bByteA\b|\bBLOB\b/u);
  assert.doesNotMatch(dda, /references:\s*\[[^\]]*(iam|iae|dsm)/iu);
  assert.doesNotMatch(iam, /\brawOtp\b|refreshToken\b|providerAccessToken\b|localPath\b/iu);
  assert.doesNotMatch(dda, /localPath|absolutePath|ocrText|sourceContent/iu);
});

void test('[DDA-052..059] migration creates unified workspace tables with rollback guidance', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  assert.match(migration, /DDA-052|IAM-022/u);
  assert.match(migration, /ROLLBACK/u);
  assert.match(migration, /Never delete IAE content or AUD history/u);
  assert.doesNotMatch(migration, /DROP TABLE .*"iae"/iu);
  assert.doesNotMatch(migration, /DELETE FROM "aud"/iu);

  for (const table of [
    'email_verification_challenges',
    'oidc_identity_links',
    'workspace_agent_grants',
    'dataset_sources',
    'source_assignments',
    'folder_placement_reviews',
    'folder_move_receipts',
    'conversations',
    'conversation_messages',
    'conversation_context_events',
    'conversation_summaries',
    'extraction_candidates',
    'named_dashboard_views',
  ]) {
    assert.match(
      migration,
      new RegExp(`CREATE TABLE "(?:iam|dda)"\\."${table}"`, 'u'),
      `missing table ${table}`,
    );
  }
});

void test('[DDA-055] conversation messages remain append-only metadata without content blobs', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  assert.match(migration, /CREATE TABLE "dda"\."conversation_messages"/u);
  assert.match(migration, /"idempotency_key"/u);
  assert.doesNotMatch(migration, /ALTER TABLE "dda"\."conversation_messages".*UPDATE/iu);
});
