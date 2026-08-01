# Alpha environment

The alpha composition is for review and dogfood planning only. It defaults to
Singapore, creates a private network and encrypted managed data resources, and
does not create NAT gateways, CloudFront, or running ECS services unless a
caller opts in.

Before planning, install the pinned OpenTofu release required by the root
`versions.tf`, and copy `terraform.tfvars.example` to `terraform.tfvars` when
planning. RDS manages its master password through AWS Secrets Manager. Never commit
`.terraform/`, `*.tfstate`, `terraform.tfvars`, or provider credentials.

Production changes require a separate reviewed variable set enabling at least:

- two availability zones with one NAT gateway per AZ;
- RDS backups/PITR (`backup_retention_period >= 7`, deletion protection);
- two or more API tasks and worker capacity;
- CloudFront only after the Web bucket and cache policy are reviewed;
- a repository-scoped GitHub OIDC role with no long-lived AWS keys.
