# Deployment and Rollback Runbook

## Scope

This runbook covers the portable AWS baseline in `ap-southeast-1`: CloudFront
and S3 for Web, ECS Fargate for API/workers, RDS PostgreSQL, ElastiCache Redis,
KMS, Secrets Manager, logs, and GitHub OIDC. It also applies to a local or
alternate-cloud deployment that implements the same open interfaces.

## Pre-deploy gate

1. Confirm the release manifest lists Web, API, worker, engine, Desktop, and
   Android versions plus migration and processor versions.
2. Confirm all required P0/P1 trace records are `verified`, the SBOM and
   provenance files have checksums, and no critical/high security finding is
   open.
3. Run the expand/migrate/verify/contract migration sequence against a restored
   staging snapshot. Confirm the rollback target is compatible with the
   expanded schema.
4. Confirm alarms, dashboards, kill switches, support access, and the release
   communication are ready. Never use customer data in a preview environment.

## Order

Deploy additive database changes first, then API, workers, Web assets, and
feature activation. Keep the flag disabled until health checks, queue drain,
contract checks, and a synthetic end-to-end workflow pass. Desktop and Android
packages use their own signed release channels and do not receive an unreviewed
server-only breaking change.

## Rollback

- **API/worker:** stop activation, route traffic to the last healthy image, and
  let durable jobs resume from PostgreSQL leases. Do not delete outbox rows.
- **Web:** restore the last immutable S3/CloudFront artifact and purge only the
  affected cache paths.
- **Processor:** disable the immutable processor version; never overwrite its
  digest. Requeue only after the input/result compatibility check passes.
- **Database:** use the reviewed backward-compatible migration rollback or
  restore into a new instance and switch through a tested cutover. Do not run an
  irreversible destructive rollback under incident pressure.
- **Infrastructure:** revert the reviewed OpenTofu plan, preserving encrypted
  buckets, logs, KMS keys, and recovery metadata.

Record the incident, exact versions, migration state, decision owner,
correlation IDs, customer impact, and verification evidence. A rollback is not
complete until a synthetic job, audit append, sync cursor, and backup alarm have
been checked.
