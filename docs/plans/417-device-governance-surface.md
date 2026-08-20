# Plan 417 — Device governance surface

Status: Approved by the product owner in the active implementation conversation.

## Goal

Expose the existing IAM device inventory in Web so users can see which Windows
and Android identities are connected to the organization. The first slice is a
content-free read surface; enrollment, activation, key rotation, and revocation
remain protected operations until their proof and step-up UI are composed.

## Requirements

- WEB-001/038: the Web management surface provides device administration.
- IAM-001/012/020: device identity rows remain organization-scoped, content-free,
  and server-authorized; no client-provided organization ID becomes authority.
- Local providers may return an honest unavailable state; the UI must not show
  fabricated devices or treat an error as an empty inventory.

