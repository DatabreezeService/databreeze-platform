# DataBreeze All-in-One Platform Design

**Status:** Superseded<br>
**Superseded by:** [DataBreeze documentation suite](../../README.md)

This historical design established the ten-module, three-platform, local-first direction. The structured documentation suite under `docs/` now replaces it and incorporates the approved changes:

- one clean `databreeze-platform` monorepo
- React/TypeScript Web
- Electron/React/TypeScript Windows Desktop
- native Kotlin/Jetpack Compose Android
- NestJS/Fastify TypeScript control plane
- shared Python local/cloud processing engine
- separate foundation, platform, and feature specifications with stable requirement IDs

Use the [product definition](../../product/product-definition.md), [architecture](../../architecture/system-architecture.md), and [specification index](../../specs/README.md) for all implementation decisions.
