# ECS secret rotation operations

The API task definition stores only Secrets Manager ARNs. Updating a secret version or moving `AWSCURRENT` does not change the task definition, and Terraform does not automatically refresh already-running tasks.

Before a rollout, verify the intended whole-secret version is `AWSCURRENT` with `describe-secret` or `list-secret-version-ids`; never put a value in a command, variable file, plan, or log. If the new version is bad, roll back the label first, then force the deployment. This module intentionally rejects JSON-key and version-suffixed ECS references, so a reviewed version-pinned ARN is not an alternative here:

```text
aws secretsmanager update-secret-version-stage --region <aws-region> --secret-id <secret-arn> --version-stage AWSCURRENT --move-to-version-id <known-good-version-id> --remove-from-version-id <bad-version-id>
```

After an owner updates either runtime secret out of band and confirms its `AWSCURRENT` shape, force a new API deployment:

```text
aws ecs update-service --region <aws-region> --cluster databreeze-<deployment-name> --service api --force-new-deployment
aws ecs wait services-stable --region <aws-region> --cluster databreeze-<deployment-name> --services api
```

Confirm the service has the expected running count, one primary deployment, and a completed rollout. The API task health check directly invokes `/nodejs/bin/node` from the distroless image and requests the database-aware `/health/ready` route. Check this ECS health signal, the HTTPS target-group health, and CloudWatch API logs for startup or secret-retrieval errors; do not print environment variables or secret contents. The API and worker services enable the ECS deployment circuit breaker with rollback.

If the new deployment fails health or startup checks, select the last known-good API task-definition revision and roll back explicitly:

```text
aws ecs update-service --region <aws-region> --cluster databreeze-<deployment-name> --service api --task-definition databreeze-<deployment-name>-api:<known-good-revision> --force-new-deployment
aws ecs wait services-stable --region <aws-region> --cluster databreeze-<deployment-name> --services api
```

The owner must verify the `AWSCURRENT` secret shape before forcing deployment: the database secret is the raw PostgreSQL URL, and the CSRF secret is the validated comma-separated HTTPS-origin list.

## Service-account envelope-key contract

The security module creates the dedicated whole secret `databreeze/<deployment-name>/iam/service-account-envelope-key`. An owner must populate `AWSCURRENT` out of band with exactly one unpadded base64url value encoding 32 random bytes. Do not put the key in Terraform, tfvars, a plan, a command argument, source, or logs. The API task receives it as `DATABREEZE_SERVICE_ACCOUNT_SECRET_ENVELOPE_KEY`; the worker task never receives it and its execution role cannot read it.

Before activating or rotating the key, verify the reviewed whole-secret version is `AWSCURRENT` without printing its value. Force a new API deployment after the label change using the commands above. If startup or health checks fail, restore the prior known-good version to `AWSCURRENT` first, then force another deployment; do not rely on Terraform to refresh unversioned secret values. If the API must be disabled while investigating, stop the API service or roll back to the last known-good task-definition revision and follow the service rollback checks above. The application fails closed if the key is missing or not an exact 32-byte base64url value.

## Optional OpenAI API-key contract

The security module creates the dedicated whole secret `databreeze/<deployment-name>/openai/api-key` when the environment is applied. That creates metadata only. An owner then populates it out of band through the approved secret-management process, for example with an owner-controlled file outside the repository:

```text
aws secretsmanager put-secret-value --region <aws-region> --secret-id <openai-api-key-secret-arn> --secret-string file://<owner-controlled-file>
```

The file contains only the raw key, is never committed, and must be removed through the owner’s secure handling procedure. Terraform stores only the ARN and never the value. The API task receives `OPENAI_API_KEY` only when `openai_agent_enabled` or `openai_receipt_enabled` is true. The worker task has no OpenAI secret or API environment variables.

All three feature flags default to false. The bounded non-secret settings are `openai_agent_model`, `openai_agent_timeout_ms`, `openai_agent_max_output_tokens`, `openai_receipt_model`, `openai_dashboard_model`, `openai_image_detail`, `openai_timeout_ms`, and `openai_max_output_tokens`; the defaults match the current API parsers (`gpt-4o-mini-2024-07-18`, 30000 ms, 2048 tokens, and `high`). Enabling agent, receipt, or dashboard assistance without a valid whole-secret ARN fails the plan, and the API fails closed at startup if the injected key is absent or malformed.

Owner activation is manual: create the named secret if it is absent, then populate it through the approved secret-store workflow with the raw OpenAI key, never a JSON object, committed file, tfvars value, command argument, plan, or log. No automatic Secrets Manager rotation is configured by this module. To rotate, create a replacement provider key, write it as a new secret version through the approved owner process, retain the prior version ID, promote the replacement to `AWSCURRENT`, and force a new API deployment. If health or startup checks fail, move `AWSCURRENT` back to the prior version with `update-secret-version-stage`, or set all three feature flags to false and deploy the disabled task definition, then force another deployment. Verify the API task no longer lists `OPENAI_API_KEY` after disabling and do not delete the secret until the retention/owner policy permits it.

## Public HTTPS API

Hosted environments enable `enable_public_api` together with the ECS services. The module creates an internet-facing
application load balancer in at least two public subnets, terminates TLS with the owner-provided ACM certificate, and
forwards only to IP targets that pass `/health/ready`. The network module permits port 443 from the internet to the
load balancer and port 3000 only from the load-balancer security group to API tasks. Populate
`api_certificate_arn` with a reviewed certificate from the same AWS account and region; never place certificate
private-key material in Terraform or Secrets Manager inputs for this module.
