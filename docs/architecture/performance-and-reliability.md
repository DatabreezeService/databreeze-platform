# Performance and Reliability

**Status:** Product specification<br>
**Version:** 2.0

## 1. Principles

- Interactive work is separated from unbounded processing.
- Every large operation is asynchronous, progress-reporting, resumable where practical, and safely cancelable.
- Performance is measured at representative data sizes and the 95th percentile, not from empty local environments.
- Durable state survives process, queue, and ordinary network failure.
- Limits are visible before execution and configurable by entitlement within tested ceilings.

## 2. Service Objectives

Initial production objectives measured monthly:

| Capability | Objective |
|---|---|
| Authenticated control-plane API availability | 99.9%, excluding announced maintenance |
| Job creation and durable acceptance | 99.9% |
| Sync change-log availability | 99.9% |
| Published report access | 99.9% |
| Published dashboard snapshot access | 99.9% |
| On-change refresh produces one complete new snapshot or preserves the last complete snapshot | 99.9% |
| Application-caused loss of an acknowledged committed mutation | Zero |
| Duplicate consequential effects caused by retry | Zero |

External provider outages are reported separately, but DataBreeze remains responsible for safe degraded behavior.

The zero-loss objective covers application crashes, instance replacement, Redis loss, ordinary network failure, worker failure, and managed PostgreSQL high-availability failover after the database has acknowledged commit. A total primary-region or backup-system disaster is governed by the separately published disaster-recovery RPO below; it must not be represented as zero-RPO durability. Local-only content is governed by device storage and user backup policy because the cloud never possessed it.

## 3. Interactive Budgets

Measured under normal production load from the primary Vietnam service region:

| Interaction | p95 budget |
|---|---|
| Cached/reference API read | 200 ms server time |
| Normal indexed API read | 350 ms server time |
| Transactional mutation excluding file transfer | 500 ms server time |
| Durable job creation | 700 ms server time |
| Search/filter first page | 800 ms server time |
| Job progress visible after accepted update | 2 seconds |
| Foreground metadata sync visibility | 5 seconds on a healthy connection |

Endpoints exceeding a budget need a measured explanation, pagination/asynchrony, and an optimization or accepted exception.

### Reference test profiles

Release benchmarks publish the exact hardware and build identifiers used. Until replaced by a recorded decision, the minimum reference profiles are:

| Profile | Fixed conditions |
|---|---|
| Web | Windows 11, four logical CPU cores, 8 GiB RAM, current supported Chromium, 1,920x1,080 display; network shaped to 10 Mbps down, 2 Mbps up, 80 ms round-trip latency, and 0.5% packet loss |
| Desktop | Windows 11, four logical CPU cores at 2.5 GHz or better, 8 GiB RAM, SSD with at least 20 GiB free, 1,920x1,080 display |
| Android | Supported Android version on a physical mid-range device with 6 GiB RAM, eight CPU cores, and UFS-class storage; the named device model and OS build are frozen for each release line |

Cold-start tests begin after reboot or process eviction with application data retained. Warm-start tests begin after a clean close with OS caches allowed. Feature specifications may define stricter profiles or budgets, but cannot silently weaken these baselines.

## 4. Client Budgets

### Web

- Authenticated shell usable within 2.5 seconds p75 on the Web reference profile after authentication.
- Route bundles are split; initial JavaScript does not include deferred specialist extensions.
- User feedback begins within 100 ms for local interactions.
- Tables virtualize or paginate before 500 visible rows.
- Charts summarize server-side or in workers; they do not render millions of raw points.
- A warm published dashboard shows its first required materialization within 2 seconds p95; bounded client-held filter/sort/highlight feedback targets 200 ms p95.

### Desktop

- Main window usable within 5 seconds p95 cold and 3 seconds p95 warm on the Desktop reference profile.
- Background folder monitoring does not require the renderer to remain open.
- Idle CPU averages below 1% on the reference device, excluding active scanning.
- Baseline idle memory is at most 300 MiB and ordinary active workflow memory is at most 600 MiB, excluding a separately measured Python sidecar or an explicitly displayed large preview; regressions above 10% fail the release budget review.
- A watched-folder burst is debounced and bounded without missing stable files.

### Android

- Main capture or assignment screen usable within 2.5 seconds p95 cold on the Android reference profile.
- Capturing a photo or barcode does not wait for network.
- Scripted core scrolling and camera-overlay flows render at least 95% of frames within 32 ms and produce no application-attributable frozen frame over 700 ms; database and network work never blocks the main thread.
- Background synchronization obeys battery, network, and Android execution constraints.

## 5. Workload Classes

| Baseline class | Typical input | Execution |
|---|---|---|
| Baseline interactive | Up to 25 MiB, 100,000 simple rows, or 100 document pages | Cloud or local; early preview prioritized |
| Baseline standard batch | Up to 500 MiB, 1 million rows, or 2,000 pages | Asynchronous worker or Desktop |
| Baseline large local | Up to 5 GiB or 10 million streaming records in supported formats | Desktop only by default |
| Published module high-capacity | Above a baseline and within a module's tested ceiling | Named module profile, published reference hardware, preflight/admission control, resource isolation, and entitlement |
| Contracted high-volume | Above the highest applicable published module ceiling or an untested combination | Explicit contract, benchmark, admission, and capacity profile |

These are default routing bands, not universal product maxima. A module may publish a higher tested profile only when it names the profile, reference hardware, execution location, concurrency, memory/disk estimate, admission behavior, and entitlement. Format-specific constraints can be lower. Compressed input limits include decompressed size, entry count, nesting, and ratio. The system estimates a class before execution and may reclassify safely after inspection.

## 6. Processing Performance

- Parsers stream where the format permits and avoid holding full large inputs in memory.
- Intermediate tabular data uses columnar/streaming representations and spills only to the access-controlled, encrypted, lifecycle-managed temporary storage defined by the security architecture.
- Worker concurrency is based on CPU, memory, and I/O resource class, not just job count.
- A first useful preview should be available before a full batch completes when the processor supports it.
- Checkpoint frequency balances replay cost and durable-write overhead and is measured per processor.
- Cloud jobs have hard memory, CPU, output, and wall-time limits.
- Local jobs reserve disk space and warn before insufficient-space failure.

Each processor publishes benchmark fixtures, reference hardware, throughput, memory peak, and supported ceilings.

## 7. Database Performance

- Organization-scoped tables index `organization_id`; workspace content tables index `organization_id, workspace_id`; project content adds `project_id`, together with common filter/order columns.
- Cursor pagination is required for unbounded collections.
- N+1 queries are detected in tests and telemetry.
- Transactions are short; external calls and document processing do not occur inside database transactions.
- Connection pools have bounded queues and timeouts.
- Summary tables or materialized views are introduced from measured queries.
- Dashboard materialization cache identity includes TenantScope, permission projection, dashboard/widget/plan, input/semantic/metric, parameters, value-affecting locale/timezone, engine/adapter, and effective policy versions.
- Partitioning, read replicas, a search engine, or warehouse require evidence that indexing, query design, and summaries are insufficient.

## 8. Backpressure and Degradation

When capacity is constrained:

1. Preserve authentication, status, cancellation, and approval traffic.
2. Stop accepting execution beyond safe queue or storage limits while still allowing drafts.
3. Reduce nonessential previews and background refresh.
4. Delay low-priority scheduled work.
5. Isolate failing provider or processor classes.
6. Show an honest queued/degraded state and retry guidance.
7. Preserve the last complete authorized dashboard snapshot when ETL, quality, source availability, or refresh work is blocked.

The system never reports completion before durable finalization.

## 9. Failure Tolerance

- API instances are stateless and replaceable.
- Job dispatch is recoverable from the PostgreSQL outbox and job tables.
- Worker leases expire and requeue from compatible checkpoints.
- Object upload finalization is atomic from the domain perspective.
- Client queues persist before acknowledging a local user action.
- Webhooks are retried with bounded retention and manual replay.
- Notifications failing do not roll back the business event.

## 10. Backup and Disaster Recovery

Early production targets:

- Managed PostgreSQL high-availability failover for ordinary instance failure without loss of acknowledged commits
- Total primary-region disaster recovery point objective of five minutes or better; acknowledged commits inside that exceptional window may require reconciliation
- Control-plane recovery time objective of four hours
- Object-storage versioning or equivalent protection for managed originals and published reports
- Encrypted backup configuration and separate administrative access
- Quarterly restoration exercises and evidence
- Exported configuration, schema, and infrastructure definitions sufficient to rebuild

Redis restoration is not part of the durable recovery path. Jobs and outbox state repopulate coordination.

Status pages, contracts, and incident reports identify the applicable failure domain and never combine the ordinary-failure zero-loss objective with the regional-disaster RPO.

Local-only originals cannot be restored by the cloud. The product communicates this plainly and supports user-managed backup guidance and local manifests.

## 11. Release Reliability

- Database migrations are backward compatible during rolling deployment.
- Destructive migrations use expand, migrate, verify, contract.
- Desktop and Android remain compatible across the supported client window.
- Feature flags default safely and have kill switches for processors/providers.
- Rollback does not read data with an unsupported older schema.
- Signed release artifacts include provenance and checksums.

## 12. Observability and Capacity Planning

Required measurements include API latency/error by route class, database saturation, connection wait, queue delay, worker utilization, job success/retry, processor resource usage, object transfer, sync lag, client crash/ANR, Desktop startup/idle resources, and Android battery/network behavior.

Alerts map to a user impact and runbook. High-cardinality tenant identifiers are controlled; artifact content and personal data are excluded.

Capacity reviews compare growth, headroom, plan limits, provider quotas, and the highest-cost processors. Optimization follows profiles and traces rather than speculation.
