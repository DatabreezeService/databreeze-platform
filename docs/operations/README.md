# Operations Documentation

Operational runbooks are versioned with the product and linked from alerts and release records. Foundation evidence is tracked in [engineering-foundation-verification](engineering-foundation-verification.md).

Every production deployable requires:

- ownership and escalation
- health and service-level signals
- deployment and rollback
- configuration and secret rotation
- backup and restoration
- capacity limits and scaling
- dependency degradation
- security revocation
- data export, retention, and deletion
- customer-impact communication

Platform-wide runbooks cover tenant access incidents, lost devices, compromised credentials, malicious artifacts, queue recovery, object-storage failure, database restoration, provider outage, Desktop update rollback, Android release halt, and processor revocation.

Runbooks use synthetic examples and never contain production secrets or customer data.
