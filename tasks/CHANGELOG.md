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
- **Spec 01 — Polling-success data loss when idle-locked**. Started implementation: pause polling when idle-locked, dispatch store-unlocked event on unlock. Added `paused-locked` phase to `PendingPollState`; `tick()` checks `hasActiveKey()` before fetching and waits for the `store-unlocked` CustomEvent when the key is absent. `UnlockGate` now dispatches the event after both setup and unlock flows. `PendingWrapView` renders "unlock to continue" copy for the paused-locked phase. Unit tests cover: locked→no-fetch, unlock-resumes, failing-saveWrap-no-delete, and multi-advance locked invariant.

_No completed specs yet._
