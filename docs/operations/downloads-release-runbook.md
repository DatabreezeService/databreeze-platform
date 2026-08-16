# DataBreeze Downloads Release Runbook

**Status:** setup guide for the public Web downloads surface

The downloads page lives on the Lightsail Web origin at:

- `https://databreeze.tech/vi-VN/downloads`
- `https://databreeze.tech/en/downloads`

The binary artifacts should live in a separate private S3 bucket and be
distributed through CloudFront. The browser should receive CloudFront release
URLs, never an S3 URL and never AWS credentials.

## Current repository state

The page currently renders a truthful `Release preparing` state. Its
`DownloadReleaseManifestV1` input is ready for the first signed release, but no
installer or APK is claimed to be published yet.

Do not upload the current unsigned Windows package or an Android debug APK as a
customer-facing release. The Desktop and Android foundations still need their
release signing/package gates completed.

## 1. Create the private artifact bucket

Use the same AWS region as the pilot where practical, for example
`ap-southeast-1`. Choose a globally unique name such as
`databreeze-downloads-prod-<account-suffix>`.

In the S3 console:

1. Create the bucket with **Object Ownership: Bucket owner enforced**.
2. Keep **Block all public access** enabled.
3. Enable bucket versioning.
4. Keep default encryption enabled; use SSE-KMS if the organization already
   operates a customer-managed KMS key.
5. Add a lifecycle rule that aborts incomplete multipart uploads after 7 days.
6. Do not enable the S3 website endpoint.

The bucket should have no public `s3:GetObject` statement. CloudFront will be
the only reader.

## 2. Create the CloudFront distribution

Create a distribution with:

1. The S3 **REST bucket origin**, not the S3 website endpoint.
2. A CloudFront Origin Access Control (OAC) with signing behavior **Sign
   requests** and signing protocol **sigv4**.
3. Viewer protocol policy **Redirect HTTP to HTTPS**.
4. Allowed methods `GET, HEAD`.
5. A custom domain such as `downloads.databreeze.tech`.
6. An ACM certificate for `downloads.databreeze.tech` in `us-east-1`.
7. A cache policy that caches versioned artifact paths for a long time. Keep
   `releases/manifest.json` short-lived or invalidate that object after each
   release.

After CloudFront creates the distribution, copy its distribution ID and add a
bucket policy like this. Replace every placeholder before saving it:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontReadOnly",
      "Effect": "Allow",
      "Principal": { "Service": "cloudfront.amazonaws.com" },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::BUCKET_NAME/releases/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::AWS_ACCOUNT_ID:distribution/CLOUDFRONT_DISTRIBUTION_ID"
        }
      }
    }
  ]
}
```

## 3. Add DNS

Keep the existing `databreeze.tech` record pointing at the Lightsail static IP.
Add a separate record:

```text
downloads.databreeze.tech  CNAME  <your CloudFront distribution hostname>
```

If DNS is hosted in Route 53, use an Alias record instead of CNAME at the
zone apex. Wait for the certificate and DNS status to become issued before
testing HTTPS.

## 4. Use immutable object keys

Upload each release under a versioned prefix. Never overwrite a published
version:

```text
releases/manifest.json
releases/desktop/1.0.0/DataBreeze-Setup-1.0.0.exe
releases/desktop/1.0.0/SHA256SUMS
releases/desktop/1.0.0/signature.sig
releases/android/1.0.0/databreeze-1.0.0.apk
releases/android/1.0.0/SHA256SUMS
```

Generate the Windows checksum with PowerShell:

```powershell
Get-FileHash .\DataBreeze-Setup-1.0.0.exe -Algorithm SHA256
```

Generate the APK checksum with the platform toolchain or a trusted CI runner.
The Windows installer must be Authenticode-signed, and the Android artifact
must be release-signed. Keep private signing keys outside the repository.

## 5. Publish a signed manifest

The page’s typed boundary corresponds to this shape:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-08-16T00:00:00.000Z",
  "channel": "stable",
  "artifacts": [
    {
      "platform": "windows",
      "distribution": "direct",
      "availability": "available",
      "version": "1.0.0",
      "releasedAt": "2026-08-16T00:00:00.000Z",
      "sizeLabel": "84 MB",
      "downloadUrl": "https://downloads.databreeze.tech/releases/desktop/1.0.0/DataBreeze-Setup-1.0.0.exe",
      "checksumUrl": "https://downloads.databreeze.tech/releases/desktop/1.0.0/SHA256SUMS",
      "signatureUrl": "https://downloads.databreeze.tech/releases/desktop/1.0.0/signature.sig"
    },
    {
      "platform": "android",
      "distribution": "google-play",
      "availability": "preparing"
    }
  ]
}
```

Publish the versioned artifacts first, verify their hashes/signatures, then
publish `manifest.json` last. A future release integration should validate the
JSON at the Web boundary before rendering any link.

For Android, use Google Play as the primary customer distribution. Keep the S3
APK path for internal, enterprise, or controlled sideload testing until Play
release signing and policy review are complete.

## 6. Give GitHub Actions short-lived AWS access

Use GitHub Actions OIDC. Do not create an IAM user with a permanent access key
for this workflow.

1. In GitHub, create a protected environment such as `downloads-publish`.
2. In AWS IAM, create an OIDC provider for
   `https://token.actions.githubusercontent.com` with audience
   `sts.amazonaws.com`.
3. Create a role whose trust policy restricts the `sub` claim to this
   repository and environment:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::AWS_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:OWNER/REPOSITORY:environment:downloads-publish"
        }
      }
    }
  ]
}
```

4. Grant the role only the release bucket actions it needs: `s3:PutObject`
   under `releases/*`, `s3:AbortMultipartUpload`, and
   `cloudfront:CreateInvalidation` for the one distribution. Avoid delete
   permissions so a published release remains recoverable.
5. Add the non-secret role ARN, bucket name, region, and distribution ID as
   GitHub environment variables or environment secrets according to the
   repository workflow.
6. Require review for that environment and restrict the workflow to protected
   branches/tags.

The workflow should upload a version prefix, verify object checksums, upload
the manifest last, and invalidate only `/releases/manifest.json`.

## 7. Connect the first real release to the page

The current page defaults to the empty manifest so deployment is safe before
artifacts exist. When the first signed release is ready, the implementation
should replace that default with a validated manifest loader or a build-time
manifest injection from the CloudFront URL. Keep the loader outside the
tenant-data API path and never fetch S3 directly from the browser.

Before enabling an available action, verify:

```powershell
curl.exe -I https://downloads.databreeze.tech/releases/manifest.json
curl.exe -I https://downloads.databreeze.tech/releases/desktop/1.0.0/DataBreeze-Setup-1.0.0.exe
```

The responses should be HTTPS, come from CloudFront, and not expose an S3
endpoint. Then test the page from both localized URLs and confirm that the
displayed version, checksum link, signature link, and binary path match the
manifest.

## 8. Lightsail deployment sequence

Once the page branch is merged into `main`:

1. Let the existing `lightsail-pilot.yml` build and publish the immutable Web
   image.
2. Confirm the Lightsail host has the latest release manifest and runs the
   corresponding `WEB_IMAGE` digest.
3. Run the existing host health check.
4. Open `/vi-VN/downloads` and `/en/downloads` over HTTPS.
5. Only after the S3/CloudFront smoke checks pass should the release manifest
   mark an artifact `available`.

If the page deploys before the bucket is ready, that is expected: users will
see the preparing state and no dead download button.
