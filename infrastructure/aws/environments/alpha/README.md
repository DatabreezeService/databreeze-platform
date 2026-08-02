# Alpha environment

The alpha composition is for review and dogfood planning only. It defaults to
Singapore, defines a private network and encrypted managed-data modules, and
does not create managed data resources, NAT gateways, CloudFront, or running
ECS services unless a caller opts in.

Before planning, install the pinned OpenTofu release required by the root
`versions.tf`, and copy `terraform.tfvars.example` to `terraform.tfvars` when
planning. RDS manages its master password through AWS Secrets Manager. Never commit
`.terraform/`, `*.tfstate`, `terraform.tfvars`, or provider credentials.

Use `tofu init -backend=false` followed by `tofu validate` for a credential-free
syntax check. A real `tofu plan` requires an approved account, region, state
backend, and injected credentials; no apply or destroy command belongs in this
alpha workflow.

Production changes require a separate reviewed variable set enabling at least:

- two availability zones with one NAT gateway per AZ;
- RDS backups/PITR (`backup_retention_period >= 7`, deletion protection);
- two or more API tasks and worker capacity;
- CloudFront only after the Web bucket and cache policy are reviewed;
- a repository-scoped GitHub OIDC role with no long-lived AWS keys.
