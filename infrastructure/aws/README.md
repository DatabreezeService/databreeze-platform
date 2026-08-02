# Portable AWS foundation

This directory is the first hosted composition for DataBreeze. It targets
`ap-southeast-1` (Singapore) and uses only portable OpenTofu resources and
open protocols. The composition is intentionally plan-only during foundation
work: it never runs `apply`, and no credentials or state files belong in the
repository.

## Layout

- `modules/network` — VPC, public/private subnets, routing, and service
  security groups.
- `modules/security` — KMS, Secrets Manager placeholders, and GitHub Actions
  OIDC role.
- `modules/web` — private versioned S3 bucket and optional CloudFront OAC.
- `modules/data` — private RDS PostgreSQL and ElastiCache Redis.
- `modules/compute` — ECS Fargate cluster, API/worker task definitions,
  execution roles, and CloudWatch log groups.
- `environments/alpha` — the Singapore composition and safe defaults.

## Validate without applying

```text
pnpm infra:check
cd infrastructure/aws/environments/alpha
tofu init -backend=false
tofu validate
tofu plan -var-file=terraform.tfvars
```

Copy `terraform.tfvars.example` to `terraform.tfvars` only for local planning.
Use an environment variable or a secrets manager for `github_repository`; do
not add a real account, role, token, password, or state backend to Git.

Alpha defaults disable managed data, NAT gateways, ECS services, and CloudFront
distribution creation so a plan is safe to inspect without creating recurring
spend. The `environments/alpha/production.tfvars.example` file enables
redundant API/worker capacity, PITR/backups, Multi-AZ data, NAT, and CloudFront
explicitly. Production must use a remote encrypted state backend approved in a
separate deployment ADR.

The production profile also enables RDS Performance Insights with the platform
KMS key; alpha keeps it disabled unless explicitly selected.

Before a production plan, set `api_image` and `worker_image` to immutable
registry references ending in a 64-character SHA-256 digest (for example,
`ghcr.io/example/databreeze-api@sha256:<digest>`). Mutable tags are accepted
for alpha development only; the ECS task definitions have a production
precondition that rejects them.

The modules expose IDs and endpoints only as outputs. Database credentials are
never output; the security module creates named Secrets Manager records for
later provider-managed rotation.

`pnpm infra:check` is intentionally non-applying. It checks module presence,
Singapore region defaults, private-network and encryption boundaries, OIDC
subject scoping, production recovery preconditions, and then runs OpenTofu
format/initialization/validation when the pinned tool is installed. Missing
OpenTofu is reported as an explicit environment gate rather than silently
treated as a production validation pass.
