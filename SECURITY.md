# Security Policy

Fulfillmenty is under development and has no production service or live merchant-fetching infrastructure.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting feature for this repository when available. Do not post credentials, private URLs, personal addresses, or exploit details in a public issue.

## Security boundaries

- Contributor URLs are untrusted input and must not be fetched by public API processes.
- Any future connector worker must use reviewed source policies, bounded requests, and network egress restrictions.
- Secrets belong in local environment variables or a deployment secret manager, never in source control.
- Public catalog data must not contain customer addresses, payment data, or unredacted receipts.
