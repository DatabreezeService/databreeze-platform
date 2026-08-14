# syntax=docker/dockerfile:1.7

FROM docker.io/library/node:24.17.0-bookworm-slim@sha256:862263c612aa437e3037674b85419622a9d93bff80aa1eee5398dfe686375532 AS base

ENV PNPM_HOME=/pnpm
ENV COREPACK_HOME=/pnpm/corepack
ENV PATH=${PNPM_HOME}:${PATH}

WORKDIR /workspace

RUN mkdir -p ${COREPACK_HOME} \
    && corepack enable \
    && corepack prepare pnpm@11.18.0 --activate \
    && chmod -R a+rX ${COREPACK_HOME}

FROM base AS build

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .node-version tsconfig.base.json ./
COPY services/api/package.json services/api/
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain/package.json packages/domain/
COPY packages/telemetry/package.json packages/telemetry/

RUN pnpm install --frozen-lockfile --filter @databreeze/api...

COPY services/api ./services/api
COPY packages/contracts ./packages/contracts
COPY packages/domain ./packages/domain
COPY packages/telemetry ./packages/telemetry

RUN pnpm --filter @databreeze/api prisma:generate
RUN pnpm --filter @databreeze/api... build
RUN test -f services/api/dist/main.js \
    && test -f services/api/build/prisma-client/client.ts \
    && test -f services/api/build/prisma-client/internal/class.ts
RUN pnpm --filter @databreeze/api --prod deploy --legacy /workspace/api-runtime

# One-shot migration target for orchestrators. It retains the pinned Prisma CLI
# and reviewed migration inventory, but does not become part of the API runtime
# image and receives DATABASE_URL only at container runtime.
FROM build AS migration

WORKDIR /workspace/services/api

USER 1000:1000

# Invoke the pinned CLI directly. The migration container is read-only, so
# going through Corepack/pnpm would try to create an install/cache under the
# workspace before Prisma can run.
ENTRYPOINT ["node", "/workspace/services/api/node_modules/prisma/build/index.js", "migrate", "deploy", "--config", "prisma.config.ts"]

FROM gcr.io/distroless/nodejs24-debian12:nonroot@sha256:14d42e2511532589a7c7e01a753667a74fcc96266e137e8125006b87b0c32d0a AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build --chown=10001:10001 /workspace/api-runtime/ ./
COPY --from=build --chown=10001:10001 /workspace/services/api/dist ./dist
COPY --from=build --chown=10001:10001 /workspace/services/api/build/prisma-client ./build/prisma-client

USER 10001:10001

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["/nodejs/bin/node", "--input-type=module", "-e", "const port = process.env.PORT ?? '3000'; fetch('http://127.0.0.1:' + port + '/health/ready').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

STOPSIGNAL SIGTERM

ENTRYPOINT ["/nodejs/bin/node", "dist/main.js"]
