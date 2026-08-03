import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const apiDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function prisma(...argumentsList) {
  const executable = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'corepack';
  const argumentsForProcess =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', ['corepack', 'pnpm', 'exec', 'prisma', ...argumentsList].join(' ')]
      : ['pnpm', 'exec', 'prisma', ...argumentsList];
  if (argumentsList.some((argument) => !/^[A-Za-z0-9_./:-]+$/.test(argument))) {
    throw new Error('Unsafe Prisma test argument');
  }
  return spawnSync(executable, argumentsForProcess, {
    cwd: apiDirectory,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: '' },
  });
}

test('Prisma validates and generates the multi-schema client without connecting to PostgreSQL', () => {
  const validation = prisma('validate', '--config', 'prisma.config.ts');
  assert.equal(validation.status, 0, validation.stderr || validation.stdout);

  const generation = prisma('generate', '--config', 'prisma.config.ts');
  assert.equal(generation.status, 0, generation.stderr || generation.stdout);
  assert.doesNotMatch(`${generation.stdout}${generation.stderr}`, /ECONNREFUSED|P1001/);
});

test('the schema diff and centrally ordered migration inventory establish platform and system ownership', async () => {
  const diff = prisma(
    'migrate',
    'diff',
    '--from-empty',
    '--to-schema',
    'prisma/schema',
    '--script',
    '--config',
    'prisma.config.ts',
  );
  assert.equal(diff.status, 0, diff.stderr || diff.stdout);
  assert.match(diff.stdout, /CREATE SCHEMA IF NOT EXISTS "platform"/);
  assert.match(diff.stdout, /CREATE SCHEMA IF NOT EXISTS "iam"/);
  assert.match(diff.stdout, /CREATE SCHEMA IF NOT EXISTS "iae"/);
  assert.match(diff.stdout, /CREATE SCHEMA IF NOT EXISTS "aud"/);
  assert.match(diff.stdout, /CREATE SCHEMA IF NOT EXISTS "bua"/);
  assert.match(diff.stdout, /CREATE SCHEMA IF NOT EXISTS "dsm"/);
  assert.match(diff.stdout, /CREATE SCHEMA IF NOT EXISTS "jra"/);
  assert.match(diff.stdout, /CREATE SCHEMA IF NOT EXISTS "dso"/);
  assert.match(diff.stdout, /CREATE SCHEMA IF NOT EXISTS "sa"/);
  assert.match(diff.stdout, /CREATE TABLE "platform"\."schema_registry"/);
  assert.match(diff.stdout, /CREATE TABLE "iam"\."users"/);
  assert.match(diff.stdout, /CREATE TABLE "iae"\."artifact_versions"/);
  assert.match(diff.stdout, /CREATE TABLE "iae"\."inbox_items"/);
  assert.match(diff.stdout, /"assignee_id" UUID/);
  assert.match(diff.stdout, /CREATE TABLE "iae"\."artifact_lineage"/);
  assert.match(diff.stdout, /CREATE TABLE "iae"\."evidence_grants"/);
  assert.match(diff.stdout, /CREATE TABLE "aud"\."audit_events"/);
  assert.match(diff.stdout, /CREATE TABLE "bua"\."usage_ledger_entries"/);
  assert.match(diff.stdout, /CREATE TABLE "dsm"\."dataset_definitions"/);
  assert.match(diff.stdout, /CREATE TABLE "dsm"\."dataset_versions"/);
  assert.match(diff.stdout, /CREATE TABLE "dsm"\."dataset_quality_results"/);
  assert.match(diff.stdout, /CREATE TABLE "dsm"\."dataset_profiles"/);
  assert.match(diff.stdout, /CREATE TABLE "iae"\."protected_document_unlock_requests"/);
  assert.match(diff.stdout, /CREATE TABLE "dsm"\."dataset_export_manifests"/);
  assert.match(diff.stdout, /CREATE TABLE "dsm"\."reference_entity_versions"/);
  assert.match(diff.stdout, /CREATE TABLE "dsm"\."reference_entity_resolutions"/);
  assert.match(diff.stdout, /CREATE TABLE "dsm"\."mapping_definitions"/);
  assert.match(diff.stdout, /CREATE TABLE "dsm"\."rule_set_definitions"/);
  assert.match(diff.stdout, /CREATE TABLE "jra"\."jobs"/);
  assert.match(diff.stdout, /CREATE TABLE "jra"\."execution_attempts"/);
  assert.match(diff.stdout, /CREATE TABLE "jra"\."result_manifests"/);
  assert.match(diff.stdout, /CREATE TABLE "jra"\."job_dispatch_outbox"/);
  assert.match(diff.stdout, /CREATE TABLE "jra"\."recipe_versions"/);
  assert.match(diff.stdout, /CREATE TABLE "dso"\."device_sync_operations"/);
  assert.match(diff.stdout, /CREATE TABLE "dso"\."device_sync_conflicts"/);
  assert.match(diff.stdout, /CREATE TABLE "dso"\."strict_local_package_manifests"/);
  assert.match(diff.stdout, /CREATE TABLE "sa"\."spreadsheet_audit_results"/);
  assert.match(diff.stdout, /CREATE TABLE "iam"\."authorization_snapshots"/);
  assert.match(diff.stdout, /CREATE TABLE "iam"\."mfa_recovery_codes"/);
  assert.match(diff.stdout, /CREATE TABLE "iam"\."access_tokens"/);
  assert.match(diff.stdout, /CREATE TABLE "iam"\."device_enrollment_challenges"/);
  assert.match(diff.stdout, /CREATE TABLE "dso"\."device_grants"/);

  const migrationsDirectory = path.join(apiDirectory, 'prisma', 'migrations');
  const inventory = (await readdir(migrationsDirectory)).sort();
  assert.deepEqual(inventory, [
    '20260801000000_platform_schema_registry',
    '20260802000000_iam_identity_foundation',
    '20260802010000_iae_artifact_foundation',
    '20260802020000_aud_audit_ledger',
    '20260802030000_bua_entitlement_usage',
    '20260802040000_dsm_dataset_definitions',
    '20260802050000_jra_jobs_approvals',
    '20260802060000_jra_execution_attempts',
    '20260802070000_jra_result_manifests',
    '20260802080000_jra_dispatch_outbox',
    '20260802090000_jra_recipes',
    '20260802100000_iae_dsm_governance',
    '20260802110000_dsm_mappings_rules',
    '20260802120000_iae_evidence_grants',
    '20260802130000_iae_dsm_scope_hardening',
    '20260802140000_dso_device_sync',
    '20260802150000_dso_sync_sequence',
    '20260802160000_dso_device_authorization',
    '20260802170000_iam_snapshot_authority_alignment',
    '20260802180000_iam_device_enrollment',
    '20260802190000_dso_capabilities_grants',
    '20260802200000_dso_data_mode_policies',
    '20260802210000_iam_mfa_recovery',
    '20260802220000_iam_access_tokens',
    '20260802230000_iae_retention_exports',
    '20260802240000_iae_upload_sessions',
    '20260802250000_dsm_quality_results',
    '20260802260000_iae_inbox_metadata',
    '20260802270000_dsm_profiles',
    '20260802280000_iae_protected_document_unlocks',
    '20260802290000_dsm_export_manifests',
    '20260802300000_sa_spreadsheet_audits',
    '20260803000000_iae_lineage_uniqueness',
    '20260803010000_iam_session_scope_binding',
    '20260803020000_bua_project_usage_scope',
    'migration_lock.toml',
  ]);
  const migration = await readFile(
    path.join(migrationsDirectory, inventory[0], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'CREATE SCHEMA IF NOT EXISTS "platform"',
    'CREATE SCHEMA IF NOT EXISTS "system"',
    'CREATE TABLE "platform"."schema_registry"',
  ]) {
    assert.match(migration, new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const iamMigration = await readFile(
    path.join(migrationsDirectory, inventory[1], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'CREATE SCHEMA IF NOT EXISTS "iam"',
    'CREATE TABLE "iam"."users"',
    'CREATE TABLE "iam"."sessions"',
    'CREATE UNIQUE INDEX "refresh_tokens_digest_key"',
  ]) {
    assert.match(iamMigration, new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const iaeMigration = await readFile(
    path.join(migrationsDirectory, inventory[2], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'CREATE SCHEMA IF NOT EXISTS "iae"',
    'CREATE TABLE "iae"."artifact_versions"',
    'CREATE TABLE "iae"."content_placements"',
    'CREATE TABLE "iae"."evidence_references"',
  ]) {
    assert.match(iaeMigration, new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const audMigration = await readFile(
    path.join(migrationsDirectory, inventory[3], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'CREATE SCHEMA IF NOT EXISTS "aud"',
    'CREATE TABLE "aud"."audit_events"',
    'CREATE TABLE "aud"."audit_seals"',
    'CREATE UNIQUE INDEX "audit_events_scope_idempotency_key"',
  ]) {
    assert.match(audMigration, new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const buaMigration = await readFile(
    path.join(migrationsDirectory, inventory[4], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'CREATE SCHEMA IF NOT EXISTS "bua"',
    'CREATE TABLE "bua"."entitlement_plans"',
    'CREATE TABLE "bua"."usage_ledger_entries"',
    'CREATE TABLE "bua"."usage_reservations"',
    'CREATE UNIQUE INDEX "usage_ledger_scope_idempotency_key"',
  ]) {
    assert.match(buaMigration, new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const dsmMigration = await readFile(
    path.join(migrationsDirectory, inventory[5], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'CREATE SCHEMA IF NOT EXISTS "dsm"',
    'CREATE TABLE "dsm"."dataset_definitions"',
    'CREATE UNIQUE INDEX "dataset_definitions_dataset_version_key"',
  ]) {
    assert.match(dsmMigration, new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const jraMigration = await readFile(
    path.join(migrationsDirectory, inventory[6], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'CREATE SCHEMA IF NOT EXISTS "jra"',
    'CREATE TABLE "jra"."jobs"',
    'CREATE TABLE "jra"."approval_requests"',
    'CREATE UNIQUE INDEX "jobs_scope_idempotency_key"',
  ]) {
    assert.match(jraMigration, new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const attemptMigration = await readFile(
    path.join(migrationsDirectory, inventory[7], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'CREATE TABLE "jra"."execution_attempts"',
    'CREATE UNIQUE INDEX "execution_attempts_job_number_key"',
  ]) {
    assert.match(attemptMigration, new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const resultMigration = await readFile(
    path.join(migrationsDirectory, inventory[8], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'CREATE TABLE "jra"."result_manifests"',
    'CREATE UNIQUE INDEX "result_manifests_attempt_key"',
  ]) {
    assert.match(resultMigration, new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const dispatchMigration = await readFile(
    path.join(migrationsDirectory, inventory[9], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'CREATE TABLE "jra"."job_dispatch_outbox"',
    'CREATE UNIQUE INDEX "job_dispatch_job_idempotency_key"',
  ]) {
    assert.match(
      dispatchMigration,
      new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
  }
  const recipeMigration = await readFile(
    path.join(migrationsDirectory, inventory[10], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'CREATE TABLE "jra"."recipe_versions"',
    'CREATE TABLE "jra"."recipe_publication_envelopes"',
    'CREATE UNIQUE INDEX "recipe_versions_recipe_version_key"',
  ]) {
    assert.match(recipeMigration, new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const governanceMigration = await readFile(
    path.join(migrationsDirectory, inventory[11], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'ALTER TABLE "iae"."artifact_versions"',
    'CREATE TABLE "iae"."inbox_items"',
    'CREATE TABLE "iae"."artifact_lineage"',
    'ALTER TABLE "dsm"."dataset_definitions"',
    'CREATE TABLE "dsm"."dataset_versions"',
    'CREATE TABLE "dsm"."reference_entity_versions"',
    'CREATE TABLE "dsm"."reference_entity_resolutions"',
  ]) {
    assert.match(
      governanceMigration,
      new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
  }
  const mappingRulesMigration = await readFile(
    path.join(migrationsDirectory, inventory[12], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'CREATE TABLE "dsm"."mapping_definitions"',
    'CREATE TABLE "dsm"."rule_set_definitions"',
    'CREATE INDEX "artifact_lineage_scope_idx"',
  ]) {
    assert.match(
      mappingRulesMigration,
      new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
  }
  const evidenceGrantsMigration = await readFile(
    path.join(migrationsDirectory, inventory[13], 'migration.sql'),
    'utf8',
  );
  assert.match(evidenceGrantsMigration, /CREATE TABLE "iae"\."evidence_grants"/);
  const scopeHardeningMigration = await readFile(
    path.join(migrationsDirectory, inventory[14], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'ALTER TABLE "iae"."artifact_lineage"',
    'ALTER TABLE "dsm"."reference_entity_resolutions"',
    'CREATE UNIQUE INDEX "inbox_items_organization_idempotency_key"',
    'CREATE UNIQUE INDEX "inbox_items_workspace_idempotency_key"',
    'CREATE UNIQUE INDEX "inbox_items_project_idempotency_key"',
  ]) {
    assert.match(
      scopeHardeningMigration,
      new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
  }
  const dsoMigration = await readFile(
    path.join(migrationsDirectory, inventory[15], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'CREATE SCHEMA IF NOT EXISTS "dso"',
    'CREATE TABLE "dso"."device_sync_operations"',
    'CREATE TABLE "dso"."device_sync_conflicts"',
    'CREATE TABLE "dso"."strict_local_package_manifests"',
    'CREATE TABLE "dso"."device_transfer_receipts"',
    'CREATE UNIQUE INDEX "device_sync_operations_workspace_idempotency_key"',
  ]) {
    assert.match(dsoMigration, new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const dsoSequenceMigration = await readFile(
    path.join(migrationsDirectory, inventory[16], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'CREATE SEQUENCE IF NOT EXISTS "dso"."device_sync_operations_sync_sequence_seq"',
    'ADD COLUMN "sync_sequence" INTEGER',
    'CREATE UNIQUE INDEX "device_sync_operations_sync_sequence_key"',
  ]) {
    assert.match(
      dsoSequenceMigration,
      new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
  }
  const dsoAuthorizationMigration = await readFile(
    path.join(migrationsDirectory, inventory[17], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'CREATE TABLE "dso"."device_authorization_snapshots"',
    'CREATE TABLE "dso"."device_grants"',
    'CREATE INDEX "device_grants_scope_device_status_idx"',
  ]) {
    assert.match(
      dsoAuthorizationMigration,
      new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
  }
  const authorityAlignmentMigration = await readFile(
    path.join(migrationsDirectory, inventory[18], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'ALTER TABLE "iam"."authorization_snapshots"',
    'CREATE UNIQUE INDEX "authorization_snapshots_device_revision_key"',
    'DROP TABLE "dso"."device_authorization_snapshots"',
  ]) {
    assert.match(
      authorityAlignmentMigration,
      new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
  }
  const deviceEnrollmentMigration = await readFile(
    path.join(migrationsDirectory, inventory[19], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'ALTER TABLE "iam"."devices"',
    'CREATE TABLE "iam"."device_enrollment_challenges"',
    'CREATE INDEX "device_enrollment_challenges_org_status_idx"',
  ]) {
    assert.match(
      deviceEnrollmentMigration,
      new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
  }
  const capabilityMigration = await readFile(
    path.join(migrationsDirectory, inventory[20], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'CREATE TABLE "dso"."device_capabilities"',
    'CREATE TABLE "dso"."device_operational_grants"',
    'CREATE INDEX "device_operational_grants_scope_status_idx"',
  ]) {
    assert.match(
      capabilityMigration,
      new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
  }
  const dataModePolicyMigration = await readFile(
    path.join(migrationsDirectory, inventory[21], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'CREATE TABLE "dso"."device_data_mode_policies"',
    'CREATE UNIQUE INDEX "device_data_mode_policies_policy_revision_key"',
  ]) {
    assert.match(
      dataModePolicyMigration,
      new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
  }
  const accessTokenMigration = await readFile(
    path.join(migrationsDirectory, inventory[23], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'CREATE TABLE "iam"."access_tokens"',
    'CREATE UNIQUE INDEX "access_tokens_digest_key"',
  ]) {
    assert.match(
      accessTokenMigration,
      new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
  }
  const qualityMigration = await readFile(
    path.join(migrationsDirectory, inventory[26], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'CREATE TABLE "dsm"."dataset_quality_results"',
    'CREATE INDEX "dataset_quality_results_dataset_version_idx"',
  ]) {
    assert.match(qualityMigration, new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const inboxMetadataMigration = await readFile(
    path.join(migrationsDirectory, inventory[27], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'ADD COLUMN "assignee_id" UUID',
    'ADD COLUMN "labels" JSONB',
    'ADD COLUMN "priority" VARCHAR(16)',
    'ADD COLUMN "due_at" TIMESTAMPTZ(6)',
  ]) {
    assert.match(
      inboxMetadataMigration,
      new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
  }
  const profileMigration = await readFile(
    path.join(migrationsDirectory, inventory[28], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'CREATE TABLE "dsm"."dataset_profiles"',
    'CREATE INDEX "dataset_profiles_dataset_version_idx"',
    '"sampling_method" VARCHAR(96)',
    '"max_duration_ms" BIGINT',
  ]) {
    assert.match(profileMigration, new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const protectedDocumentMigration = await readFile(
    path.join(migrationsDirectory, inventory[29], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'CREATE TABLE "iae"."protected_document_unlock_requests"',
    'CREATE INDEX "protected_document_unlock_artifact_idx"',
    '"last_failure_code" VARCHAR(32)',
  ]) {
    assert.match(
      protectedDocumentMigration,
      new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
  }
  const datasetExportMigration = await readFile(
    path.join(migrationsDirectory, inventory[30], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'CREATE TABLE "dsm"."dataset_export_manifests"',
    'CREATE INDEX "dataset_export_manifests_dataset_version_idx"',
    '"policy_hash" CHAR(64)',
  ]) {
    assert.match(
      datasetExportMigration,
      new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
  }
  const spreadsheetAuditMigration = await readFile(
    path.join(migrationsDirectory, inventory[31], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'CREATE SCHEMA IF NOT EXISTS "sa"',
    'CREATE TABLE "sa"."spreadsheet_audit_results"',
    'CREATE INDEX "spreadsheet_audits_artifact_version_idx"',
    '"blocked_reasons" JSONB',
  ]) {
    assert.match(
      spreadsheetAuditMigration,
      new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
  }
  const lineageUniquenessMigration = await readFile(
    path.join(migrationsDirectory, inventory[32], 'migration.sql'),
    'utf8',
  );
  assert.match(
    lineageUniquenessMigration,
    /CREATE UNIQUE INDEX "artifact_lineage_derived_version_key"\s+ON "iae"\."artifact_lineage"\("derived_artifact_version_id"\);/u,
  );
  const sessionScopeMigration = await readFile(
    path.join(
      migrationsDirectory,
      '20260803010000_iam_session_scope_binding',
      'migration.sql',
    ),
    'utf8',
  );
  for (const statement of [
    'ALTER TABLE "iam"."sessions"',
    'ADD COLUMN "organization_id" UUID NOT NULL',
    'ADD COLUMN "workspace_id" UUID NOT NULL',
    'CREATE INDEX "sessions_scope_user_status_idx"',
  ]) {
    assert.match(
      sessionScopeMigration,
      new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
  }
  assert.match(sessionScopeMigration, /no production or legacy data migration/u);
  assert.match(sessionScopeMigration, /guessing tenant scope would be unsafe/u);
});
