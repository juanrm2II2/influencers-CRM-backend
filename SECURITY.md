# Security Policy

## Scope

This document covers the **Influencers-CRM Backend** repository
(`juanrm2II2/influencers-CRM-backend`).  Frontend, smart-contract, and
infrastructure-as-code components are tracked in their own repositories
with their own `SECURITY.md` files.

## Supported Versions

We provide security fixes for the latest minor release on the `main`
branch.  Older release branches are best-effort only.

| Version | Supported          |
| ------- | ------------------ |
| `main`  | :white_check_mark: |
| Older   | :x:                |

## Reporting a Vulnerability

**Do not open public GitHub issues for security reports.**

Please disclose security issues privately via one of the following
channels (in order of preference):

1. **GitHub Security Advisories** — open a private advisory through the
   ["Security" tab](../../security/advisories/new) of this repository.
2. Encrypted e-mail to the maintainer address listed on the project
   homepage, with the subject line `[SECURITY] influencers-CRM-backend`.

We aim to:

* Acknowledge receipt within **48 hours**.
* Provide an initial assessment and remediation timeline within **5
  business days**.
* Publish a coordinated advisory and CVE (where applicable) once a fix
  has shipped.

## Severity Classification

We follow the [CVSS v3.1](https://www.first.org/cvss/v3.1/specification-document)
specification.  Issues are also tagged High / Medium / Low using the
internal Pre-ICO audit nomenclature (see
`influencers-CRM-backend_AUDIT_REPORT.pdf`).

## In Scope

* Authentication / authorization (JWT verification, session handling).
* Tenant isolation / Row-Level Security policies.
* GDPR consent, DSAR, retention, and erasure flows.
* PII handling and column-level encryption.
* Outbound integrations (Supabase, ScrapeCreators, AWS KMS).
* Container and dependency supply-chain security.

## Out of Scope

* Denial-of-service achievable only with traffic volumes that violate
  fair-use limits.
* Attacks requiring physical access to a developer workstation.
* Issues in third-party services (Supabase, AWS, ScrapeCreators) — please
  report those upstream.

## Bug Bounty

We expect to launch a paid bug-bounty programme on Immunefi at least
two weeks before any public token-generation event.  Until then,
researchers acting in good faith are recognised in our public Hall of
Fame and will not be subject to legal action under safe-harbour
principles compatible with [disclose.io](https://disclose.io).
