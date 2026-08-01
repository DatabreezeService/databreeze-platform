# DataBreeze Desktop security shell

`@databreeze/desktop` is the Windows Electron/React foundation for the DataBreeze local agent. This
slice proves the renderer/main security boundary and exposes two content-free status capabilities.
It is not an enrolled, file-processing, or synchronized agent yet.

## Trust boundaries

- **Renderer:** React only. It has no Electron or Node import, Node global, raw IPC, filesystem,
  process, shell, keychain, updater, or arbitrary network surface. The repository dependency checker
  enforces that renderer modules do not import Desktop application, main, or preload code.
- **Preload:** the sole context bridge entry point. It installs exactly one deeply frozen global,
  `window.databreezeDesktop`, containing the versioned `v1` API.
- **Main:** owns application lifecycle, BrowserWindow construction, navigation/permission policy,
  guarded IPC registration, and the reference local-state and sidecar adapters.
- **Shared:** closed serializable types, channel names, limits, and result validators. It imports no
  Electron runtime.

The production BrowserWindow uses `contextIsolation: true`, `nodeIntegration: false`, `sandbox:
true`, `webSecurity: true`, `allowRunningInsecureContent: false`, and `webviewTag: false`, with the
application-owned preload path. New windows, foreign navigation and redirects, webviews, and all
permission requests are denied before the renderer file loads. IPC accepts only the active main
frame of the current window at the exact renderer file URL.

## Bridge contract

```text
window.databreezeDesktop.v1.session.getSafeState()
window.databreezeDesktop.v1.sidecar.getStatus()
```

Both calls are argument-free. Main validates sender, frame, exact URL, current window, empty input,
and the complete result schema. Unknown channels, keys, prototypes, accessors, oversized values,
and unexpected adapter errors fail closed with bounded safe codes. Rejected values and exception
details are never logged or reflected.

The renderer HTML carries the deployed CSP: no default content, inline/eval scripts, remote connect
target, object/frame embedding, base/form escape, workers, or remote media. Vite emits external
scripts and styles compatible with that policy.

## Ports and reference adapters

`LocalStatePort` retrieves content-free shell state only. `LockedLocalStateAdapter` is deliberately
in-memory and locked; it does not claim encryption, persistence, migration, SQLite, or DPAPI.

`SidecarLifecyclePort` reports bounded lifecycle metadata. The launch-plan value object requires a
trusted absolute executable identity, explicit argv, `shell: false`, an allowlisted environment,
opaque attempt/work-directory handles, a 16 MiB-or-smaller protocol frame, and bounded resource
metadata. `UnavailableSidecarAdapter` honestly reports that no engine is installed. Nothing in this
slice starts Python or accepts a renderer-controlled command, path, environment map, URL, handler,
or JSON-RPC payload.

## Scripts and build behavior

| Script | Behavior |
|---|---|
| `corepack pnpm --filter @databreeze/desktop dev` | Builds all three secure outputs, validates them, then starts the pinned local Electron runtime. There is intentionally no remote development origin or weaker HMR window. |
| `corepack pnpm --filter @databreeze/desktop build` | Emits `dist/main/index.js`, `dist/preload/index.cjs`, and `dist/renderer/` without source maps, then runs the build smoke/security and brand checks. |
| `corepack pnpm --filter @databreeze/desktop lint` | Runs repository ESLint rules. |
| `corepack pnpm --filter @databreeze/desktop typecheck` | Checks separate main, preload, renderer, test, and tooling TypeScript projects. |
| `corepack pnpm --filter @databreeze/desktop test` | Builds first, then runs unit/adversarial, architecture, and built-output smoke tests. |
| `corepack pnpm --filter @databreeze/desktop security:check` | Runs the focused Desktop security and boundary tests. |

The renderer JavaScript measures **60,641 gzip bytes** against a **184,320-byte** production budget.
The build gate also verifies the emitted visible wordmark is byte-identical to the approved legacy
derivative. Electron resolves the checked-in approved
`@databreeze/design-tokens/brand/generated/desktop/application.ico` for the window icon.

## Security non-goals and deferrals

This foundation provides partial coverage of:

- **DSK-001:** secure BrowserWindow preferences, navigation/permission denial, and restrictive CSP.
- **DSK-002:** one versioned allowlisted bridge and schema-validated content-free results.
- **DSK-008:** sidecar port and launch-plan invariants only.

It does **not** complete DSK-003. Origin/frame checks cover only the two read-only shell
capabilities; workspace authorization, current capability checks, and permissions remain deferred.
It also defers folder grants and watching, storage and queue encryption, engine bundling, framed
JSON-RPC, process-tree/resource supervision, enrollment, device keys, sync/offline packages, file
effects, updater, packaging/installer/signing, production telemetry, and all customer data. No other
Desktop requirement is claimed complete by this shell.
