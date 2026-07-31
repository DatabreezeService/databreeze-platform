# Contract compatibility policy

DataBreeze v1 contracts are published, conservative, and immutable. A schema's absolute `$id`,
registry entry, path, and exact source bytes cannot change in place. Version-specific generated
TypeScript, Python, and Kotlin public outputs are immutable for the same reason. This rule also
applies to changes that would normally be described as additive or backward compatible: after
publication, they require a new contract version and new absolute schema IDs.

`public-outputs.json` is the explicit versioned inventory of generated public files and selected
package JSON surfaces. It includes language-package metadata outside `/vN/` directories, such as the
Python `pyproject.toml`, package-root `__init__.py`, and `py.typed`, plus the JavaScript package
name, exports, and runtime dependency map. Every file below `generated/` must appear in the
inventory.

`compatibility/published.json` locks the SHA-256 digest of each reviewed version baseline. Each
`compatibility/vN/baseline.json` locks every schema ID/path/byte digest, the version's exact
public-output inventory entry, every inventoried generated public file, and each selected package
surface. The check fails for removed or added v1 schemas, changed IDs or bytes, missing, changed,
added, or unlisted generated outputs, public export drift, missing baselines, and baseline edits
that do not match the published registry.

Run the read-only checks with:

```sh
corepack pnpm contracts:check
```

That root gate checks generated drift, published compatibility, compile-time TypeScript fixture
consumption, and TypeScript/Python/Kotlin runtime fixture parity.

To publish a reviewed new version after its new schema IDs, generated outputs, and fixtures exist:

```sh
corepack pnpm --filter @databreeze/contracts compatibility:baseline -- --version 2 --approve-new-version
```

The update is deterministic and is a no-op when the same version is already current. It refuses to
rewrite a published version. `--approve-new-version` records the caller's intent; it is not a
substitute for repository review. An incompatible change therefore requires a new version/ID,
consumer migration evidence, an updated shared fixture suite, and review of the new immutable
baseline.

There is deliberately no command that rewrites a published baseline or its registry digest. An
exceptional coordinated repair remains a repository-review trust boundary; Task 21 must protect the
inventory, baseline, and registry together in CI and review policy.
