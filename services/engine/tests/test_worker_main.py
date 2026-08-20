from __future__ import annotations

import threading

import pytest

from databreeze_engine.worker_client import WorkerClientError
from databreeze_engine.worker_main import WorkerLoop, WorkerRuntimeConfig, load_runtime_config


class FakeClient:
    def __init__(self, assignments: list[dict[str, object] | None]) -> None:
        self.assignments = assignments
        self.calls = 0

    def assignment(self) -> dict[str, object] | None:
        self.calls += 1
        return self.assignments.pop(0)


class NoopResolver:
    def execute(self, _client: object, _assignment: dict[str, object]) -> None:
        return None


def config() -> WorkerRuntimeConfig:
    return WorkerRuntimeConfig(
        api_endpoint="https://api.databreeze.example",
        bearer_token="protected-worker-token",
        idle_poll_seconds=0.25,
        error_backoff_seconds=1.0,
    )


def test_runtime_config_requires_only_https_endpoint_and_protected_bearer() -> None:
    loaded = load_runtime_config(
        {
            "DATABREEZE_WORKER_API_ENDPOINT": "https://api.databreeze.example",
            "DATABREEZE_WORKER_BEARER_TOKEN": "protected-worker-token",
        }
    )
    assert loaded.api_endpoint == "https://api.databreeze.example"
    assert loaded.bearer_token == "protected-worker-token"

    with pytest.raises(WorkerClientError, match="HTTPS"):
        load_runtime_config(
            {
                "DATABREEZE_WORKER_API_ENDPOINT": "http://api.databreeze.example",
                "DATABREEZE_WORKER_BEARER_TOKEN": "protected-worker-token",
            }
        )
    with pytest.raises(WorkerClientError, match="credential"):
        load_runtime_config({"DATABREEZE_WORKER_API_ENDPOINT": "https://api.example"})


def test_loop_polls_with_bounded_idle_delay_and_stops_without_claiming() -> None:
    stopped = threading.Event()
    sleeps: list[float] = []
    client = FakeClient([None, None])

    def sleep(seconds: float) -> None:
        sleeps.append(seconds)
        if len(sleeps) == 2:
            stopped.set()

    loop = WorkerLoop(config(), client=client, workload_resolver=NoopResolver(), sleep=sleep)
    loop.serve(stopped)

    assert client.calls == 2
    assert sleeps == [0.25, 0.25]


def test_loop_fails_closed_before_claim_when_workload_resolver_is_absent() -> None:
    client = FakeClient([{"attemptId": "opaque"}])
    loop = WorkerLoop(config(), client=client, sleep=lambda _seconds: None)

    with pytest.raises(WorkerClientError, match="workload resolver unavailable"):
        loop.serve(threading.Event())

    assert client.calls == 0


def test_loop_retries_only_retryable_control_plane_errors_with_bounded_backoff() -> None:
    class ErrorClient:
        def __init__(self, retryable: bool) -> None:
            self.retryable = retryable
            self.calls = 0

        def assignment(self) -> None:
            self.calls += 1
            raise WorkerClientError("control plane", retryable=self.retryable)

    stopped = threading.Event()
    sleeps: list[float] = []
    retryable = ErrorClient(True)

    def sleep(seconds: float) -> None:
        sleeps.append(seconds)
        stopped.set()

    WorkerLoop(config(), client=retryable, workload_resolver=NoopResolver(), sleep=sleep).serve(
        stopped
    )
    assert retryable.calls == 1
    assert sleeps == [1.0]

    permanent = ErrorClient(False)
    with pytest.raises(WorkerClientError, match="control plane"):
        WorkerLoop(
            config(),
            client=permanent,
            workload_resolver=NoopResolver(),
            sleep=lambda _seconds: None,
        ).serve(threading.Event())
