# Public Downloads Surface and Release Artifact Plan

**Status:** approved for implementation

**Goal:** Add a localized public downloads page to the Web app and define the
typed release-manifest boundary that will later be populated by the signed
Windows and Android artifacts published behind CloudFront/S3.

**Primary requirements:** WEB-002, WEB-003; DSK-208, DSK-271

## Scope

- Add a public `/vi-VN/downloads` and `/en/downloads` route that remains
  available to both signed-out and signed-in users.
- Keep the current product voice: Vietnamese-first, calm utility copy, strong
  blue brand signal, and a dark data-led visual layer that connects to the
  landing page.
- Add Windows and Android release rows with a platform selector, truthful
  unavailable states, and a typed manifest seam for future artifact URLs,
  checksums, and signatures.
- Add focused component and routing tests.
- Document the S3 private bucket, CloudFront Origin Access Control, release
  signing, and GitHub Actions OIDC setup without committing credentials or
  pretending that unsigned local builds are production releases.

## Explicit non-goals

- Do not upload binaries or create AWS resources in this change.
- Do not expose S3 directly or put customer/data-plane downloads through this
  public page.
- Do not claim a Windows release until the installer is Authenticode-signed.
- Do not claim an Android release until a release-signed artifact is prepared;
  Google Play remains the preferred consumer distribution channel.

## Implementation sequence

1. Define the versioned release-manifest types and a safe empty manifest.
2. Build the localized page with the selected-platform action, release
   verification details, and responsive/reduced-motion styling.
3. Add the route outside the authentication gate and include routing tests for
   both session states and both locales.
4. Add the operator runbook for S3/CloudFront, release signing, OIDC upload,
   manifest publication, and smoke verification.
5. Run focused Web tests, typecheck, production build, and inspect the isolated
   diff. Leave the parent worktree untouched.

## Verification mapping

- `WEB-002`: route and artifact action are public product-release presentation;
  future artifact endpoints must still be server-authorized where they carry
  tenant data.
- `WEB-003`: manifest input is explicitly typed and versioned at the Web
  boundary.
- `DSK-208` / `DSK-271`: the runbook requires pinned release-manifest and
  Windows package signatures plus checksum verification before distribution.
