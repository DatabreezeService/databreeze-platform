# Release Channels

## Web, API, and workers

Use preview, staging, and production environments with immutable images and
reviewed OpenTofu plans. Production uses health-based progressive rollout and
automatic traffic rollback. Feature flags are separate from deployment and
default off.

## Windows Desktop

The internal channel may use manually installed development-signed builds. The
preview and stable channels require code-signed installers, signed update
manifests, version monotonicity, downgrade rejection, and a tested updater
rollback. Emergency builds disable the affected processor or provider before
distribution.

## Android

Dogfood uses an internally signed APK. Public distribution proceeds through
internal testing, closed testing, and staged Play rollout. Halt on crash,
startup, sync, security, accessibility, or data-loss regression. A halted
release does not revoke already accepted server jobs; the API remains truthful
about client compatibility and authorization.

Every channel has an owner, supported contract versions, a rollback target,
release evidence, and a communication path. Credentials for signing and
updating are rotated separately from application secrets and are never checked
into the repository.
