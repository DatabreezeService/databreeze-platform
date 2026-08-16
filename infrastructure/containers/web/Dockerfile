# syntax=docker/dockerfile:1.7

FROM docker.io/library/node:24.17.0-bookworm-slim@sha256:862263c612aa437e3037674b85419622a9d93bff80aa1eee5398dfe686375532 AS build

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

WORKDIR /workspace

ARG VITE_DATABREEZE_DEMO_MODE=false
ENV VITE_DATABREEZE_DEMO_MODE=${VITE_DATABREEZE_DEMO_MODE}

RUN corepack enable && corepack prepare pnpm@11.18.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .node-version tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY packages/design-tokens/package.json packages/design-tokens/
COPY packages/domain/package.json packages/domain/
COPY packages/i18n/package.json packages/i18n/
COPY packages/telemetry/package.json packages/telemetry/
COPY packages/ui/package.json packages/ui/

RUN pnpm install --frozen-lockfile --filter @databreeze/web...

COPY apps/web ./apps/web
COPY packages/contracts ./packages/contracts
COPY packages/design-tokens ./packages/design-tokens
COPY packages/domain ./packages/domain
COPY packages/i18n ./packages/i18n
COPY packages/telemetry ./packages/telemetry
COPY packages/ui ./packages/ui
COPY prototypes ./prototypes

# The browser uses the same origin as the gateway. No provider URL, key, or
# credential is embedded in the Web bundle.
RUN pnpm --filter @databreeze/web... build

FROM docker.io/library/caddy:2.10.0-alpine@sha256:ae4458638da8e1a91aafffb231c5f8778e964bca650c8a8cb23a7e8ac557aa3c AS runtime

COPY --from=build --chown=1000:1000 /workspace/apps/web/dist /srv
COPY --chown=1000:1000 infrastructure/local/web/Caddyfile /etc/caddy/Caddyfile
RUN setcap -r /usr/bin/caddy \
    && chown -R 1000:1000 /data /config /etc/caddy /srv

USER 1000:1000

EXPOSE 8443

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=12 CMD ["wget", "--no-check-certificate", "--quiet", "--spider", "https://localhost:8443/health/ready"]

ENTRYPOINT ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
