# syntax=docker/dockerfile:1.7

FROM docker.io/library/python:3.13.7-slim-bookworm@sha256:adafcc17694d715c905b4c7bebd96907a1fd5cf183395f0ebc4d3428bd22d92d AS build

ENV PIP_DISABLE_PIP_VERSION_CHECK=1
ENV PIP_NO_CACHE_DIR=1

WORKDIR /build

COPY packages/contracts/generated/python ./contracts
COPY services/engine ./engine

RUN python -m pip wheel --wheel-dir /wheels "hatchling==1.31.0"
RUN python -m pip wheel --wheel-dir /wheels ./contracts
RUN python -m pip wheel --no-index --find-links /wheels --wheel-dir /wheels ./engine

FROM docker.io/library/python:3.13.7-slim-bookworm@sha256:adafcc17694d715c905b4c7bebd96907a1fd5cf183395f0ebc4d3428bd22d92d AS runtime

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_DISABLE_PIP_VERSION_CHECK=1

RUN groupadd --gid 10001 databreeze \
    && useradd --uid 10001 --gid 10001 --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin databreeze

COPY --from=build /wheels /wheels
RUN python -m pip install --no-cache-dir --no-index --find-links /wheels "databreeze-engine==0.1.0" \
    && rm -rf /wheels /root/.cache

WORKDIR /app

USER 10001:10001

STOPSIGNAL SIGTERM

ENTRYPOINT ["/usr/local/bin/databreeze-engine-worker"]
