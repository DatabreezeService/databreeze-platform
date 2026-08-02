# GitHub Actions

The repository keeps three pinned workflows:

- `quality.yml` runs the repository gate and only enables runtime-specific jobs
  when the changed-path detector says they are affected.
- `security.yml` runs dependency, license, secret, SAST, container-policy, and
  source-SBOM checks. It never receives production credentials.
- `release.yml` is tag-only, requests GitHub OIDC only for the protected
  `release` environment, and publishes a deterministic SBOM plus provenance
  record as release evidence.

Every third-party action is pinned to a full commit SHA. The same checks are
available locally through the `ci:*` scripts in the root `package.json`.
