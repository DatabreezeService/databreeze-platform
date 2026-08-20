"""Bounded production worker loop with an explicit fail-closed workload seam.

The control plane currently grants exact source artifacts, not a typed engine execution
envelope.  This module therefore provides the production polling/shutdown boundary but
refuses to claim work until a server-authored workload resolver is injected.
"""

from __future__ import annotations

import os
import signal
import sys
import threading
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Protocol

from .local_worker_resolver import LocalDashboardWidgetWorkloadResolver
from .worker_client import WorkerClient, WorkerClientError


class AssignmentClient(Protocol):
    def assignment(self) -> dict[str, object] | None: ...


class WorkloadResolver(Protocol):
    def execute(self, client: AssignmentClient, assignment: dict[str, object]) -> None: ...


@dataclass(frozen=True, slots=True)
class WorkerRuntimeConfig:
    api_endpoint: str
    bearer_token: str
    idle_poll_seconds: float = 1.0
    error_backoff_seconds: float = 5.0

    def __post_init__(self) -> None:
        if not 0.1 <= self.idle_poll_seconds <= 30.0:
            raise WorkerClientError("worker idle poll interval is outside bounded limit")
        if not 0.1 <= self.error_backoff_seconds <= 60.0:
            raise WorkerClientError("worker error backoff is outside bounded limit")


def load_runtime_config(environment: Mapping[str, str] | None = None) -> WorkerRuntimeConfig:
    values = os.environ if environment is None else environment
    endpoint = values.get("DATABREEZE_WORKER_API_ENDPOINT", "").strip()
    bearer = values.get("DATABREEZE_WORKER_BEARER_TOKEN", "")
    # WorkerClient owns the exact HTTPS and protected-token validation contract.
    WorkerClient(endpoint, bearer)
    return WorkerRuntimeConfig(api_endpoint=endpoint, bearer_token=bearer)


class WorkerLoop:
    def __init__(
        self,
        config: WorkerRuntimeConfig,
        *,
        client: AssignmentClient | None = None,
        workload_resolver: WorkloadResolver | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._config = config
        self._client = client or WorkerClient(config.api_endpoint, config.bearer_token)
        self._workload_resolver = workload_resolver
        self._sleep = sleep

    def serve(self, stopped: threading.Event) -> None:
        if self._workload_resolver is None:
            raise WorkerClientError("worker workload resolver unavailable")
        while not stopped.is_set():
            try:
                assignment = self._client.assignment()
                if assignment is None:
                    self._sleep(self._config.idle_poll_seconds)
                    continue
                self._workload_resolver.execute(self._client, assignment)
            except WorkerClientError as error:
                if not error.retryable:
                    raise
                # Keep retryable failures observable without exposing bearer tokens or
                # request bodies. A silent retry loop makes a local deployment look
                # healthy while every lease expires; the bounded error text is the
                # only useful operator signal until structured worker telemetry is
                # wired.
                print(f"worker retryable error: {error}", file=sys.stderr, flush=True)
                self._sleep(self._config.error_backoff_seconds)


def main() -> int:
    try:
        config = load_runtime_config()
        stopped = threading.Event()

        def stop(_signal_number: int, _frame: object) -> None:
            stopped.set()

        signal.signal(signal.SIGTERM, stop)
        signal.signal(signal.SIGINT, stop)
        WorkerLoop(
            config,
            workload_resolver=LocalDashboardWidgetWorkloadResolver(),
        ).serve(stopped)
        return 0
    except WorkerClientError as error:
        print(str(error), file=sys.stderr)
        return 78


if __name__ == "__main__":
    raise SystemExit(main())
