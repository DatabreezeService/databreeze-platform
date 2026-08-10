# Desktop Release Runbook

**Blocked on:** MANUAL-PREREQUISITES §5 (Windows code-signing identity)

## Agent-complete prep

- Electron security, IPC schema, folder path escape tests exist under `apps/desktop/test/`.
- Folder binding UI is composed into Desktop shell nav on `codex/dda-400-production`.

## Owner steps

1. Provide organization-controlled signing identity to protected CI secrets (never chat/repo).
2. Build signed installer/update artifacts.
3. Verify hashes/provenance; clean-machine install/update/rollback/uninstall.
4. Attach evidence to `docs/evidence/dda/desktop-release-report.md`.
