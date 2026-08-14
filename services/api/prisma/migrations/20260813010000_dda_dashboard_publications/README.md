# DDA publication migration gate

This gate is part of the DDA-025/DDA-029/DDA-032/AUD-003 deployment contract.

1. Deploy the admission block that rejects new `SHARED_LINK` publication writes and stop all legacy
   writers.
2. Run the executable deploy command. It runs preflight first, then Prisma migration, and writes a deploy receipt only when both succeed:

```powershell
$env:DATABASE_URL = '...'
node services/api/scripts/dda-publication-deploy.mjs --phase deploy --preflight-receipt "$env:RELEASE_RECEIPTS\dda-publication-preflight.json" --receipt "$env:RELEASE_RECEIPTS\dda-publication-deploy.json"
```

3. After the deployment is healthy, run the later promotion command. Promotion is blocked unless
   the deploy receipt exists and post-deploy validation succeeds:

```powershell
node services/api/scripts/dda-publication-deploy.mjs --phase promote --deploy-receipt "$env:RELEASE_RECEIPTS\dda-publication-deploy.json" --validation-receipt "$env:RELEASE_RECEIPTS\dda-publication-validate.json" --receipt "$env:RELEASE_RECEIPTS\dda-publication-promote.json"
```

The deploy command invokes `psql` and Prisma (override with `DDA_PSQL_COMMAND` and
`DDA_MIGRATE_COMMAND` for CI harnesses), stops on the first error, and writes receipts only after
each phase succeeds. The additive migration intentionally installs
`NOT VALID` checks/FKs; the validate phase is an ordered operator gate and is not run by Prisma
automatically.
