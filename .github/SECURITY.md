# Security Policy

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Use GitHub's [private vulnerability reporting](https://github.com/theorange7/gvt-build-2026-burrito/security/advisories/new) to submit a report.

**Response SLAs:**
- Acknowledgement: within 7 days
- Triage and severity assessment: within 30 days
- Fix timeline communicated after triage

## In Scope

- **Client crypto** — AES-GCM encryption, PBKDF2 key derivation, IndexedDB envelope format (`src/lib/local-store/crypto.ts`)
- **Server authentication** — JWT issuance/verification, per-install token flow (`server/src/auth/`)
- **Privacy invariants** — identifier leakage in `/wrap` payloads, client AI wrapper thin-ness, log hygiene
- **Server functions** — input validation, rate limiting, PII handling in Azure Functions
- **Infrastructure** — Terraform config, RBAC, secrets management

## Out of Scope

- Vulnerabilities in third-party AI providers (Anthropic, Azure OpenAI)
- Theoretical attacks without a working proof-of-concept
- Social engineering or phishing
- Issues already known and tracked in GitHub Issues
- Denial-of-service attacks against the publicly hosted instance

## Disclosure Policy

This project follows responsible disclosure. After a fix is released, a security advisory will be published describing the issue and crediting the reporter (unless they prefer to remain anonymous).
