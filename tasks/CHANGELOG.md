# Spec changelog

Chronological log of completed specs, newest-first. This is the
cross-spec view; each entry corresponds to a `## Done` block on the
spec file itself.

When you ship a spec, add an entry here in the **same PR** that flips
`Status: Done` on the spec file. See `tasks/README.md` ("How an agent
should use this directory") and the root `CLAUDE.md` for the workflow.

## Format

```
## YYYY-MM-DD
- **Spec NN — Title** (#PR). One-paragraph summary: what shipped, any
  deviation from the Solution shape, follow-ups raised.
```

Group entries by date, newest date at the top. Multiple specs that ship
on the same day share one date heading.

---

## 2026-05-10
- **Spec 20 — JWT secret rotation (`kid` + key map)** (claude/spec-20-9mk1y). Added `loadKeys()` to enumerate `WRAP_JWT_KEY_<kid>` env vars and select the active signer via `WRAP_JWT_ACTIVE_KID`. `signInstallToken` now stamps `kid` into the JWT protected header; `verifyInstallToken` uses a `jose` key-resolver to look up the kid on each incoming token, rejecting tokens with missing or unregistered kids. Backwards-compat shim for `WRAP_JWT_SECRET` (treated as `kid=legacy`) is included for one-release migration. Rotation runbook added to `tasks/runbooks/jwt-rotation.md`.
