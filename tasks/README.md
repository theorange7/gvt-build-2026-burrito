# Shaped task specs

This directory holds **shaped work** — solution proposals discussed with a human,
ready for an agent to pick up and execute against a clear boundary. The format
borrows from Basecamp's Shape Up: each spec defines the problem, the chosen
shape of the solution, what's explicitly out of scope, and how to know it's done.

The point: when you (the human) tell an agent "do task 12", they read the
spec and execute against the shape — they do **not** redesign the solution
or expand the scope.

## Why this exists separately from `Tasks.md`

`/Tasks.md` (in repo root) is an informal todo list — short bullets, lightly
groomed, a parking lot. The specs in this directory are heavier: they capture
the design conversation that turned a one-line problem into a tractable plan.
A spec lands here only after a human has decided what the solution should
look like.

When work in `Tasks.md` grows beyond a one-liner — a real design decision is
needed, mockups would help, scope needs explicit boundaries — promote it into
a spec here.

## Format

Every spec lives in a file `<id>-<slug>.md` and follows this structure:

```markdown
# Spec NN — Short title

**Status**: Shaped — ready to pick up | In progress | Blocked | Done
**Branch**: server | client | both | docs-only
**Appetite**: small (≤ 1 day) | medium (≤ 3 days) | large (≤ 1 week)
**Last shaped**: YYYY-MM-DD

## Problem
The "why" — what hurts today, who's affected, what we're not solving without
this.

## Solution shape
The "what" — fat-marker sketch of the chosen approach. Not full pseudo-code,
but enough that an agent can execute without redesigning.

### Mockups
Optional ASCII or markdown mockups for UX work.

## Rabbit holes
Specific traps a fresh agent might wander into. Things that look like good
ideas but aren't.

## No-gos
Things explicitly out of scope. If the agent finds themselves doing one of
these, they're off the rails.

## Verification
Concrete checks for "done" — tests that pass, behaviour you can observe,
invariants that hold.

## Notes
Cross-references to other specs, prior code-review items, links to discussion.
```

`<id>` is the original code-review item number (10, 11, …) when the spec
maps to one; otherwise pick the next free number.

## Index

| ID | Title | Status | Branch | Appetite |
|----|-------|--------|--------|----------|
| 10 | Stuck `running` job recovery | Shaped — ready | both | medium |
| 11 | Pause polling when hidden / offline | Shaped — ready | client | small |
| 12 | Encrypt `pendingWrapRequests` | Shaped — ready | client | small |
| 13 | Graceful "wrap not on this device" | Shaped — ready | client | small |
| 20 | JWT secret rotation (`kid` + key map) | Shaped — ready | server | medium |

## How an agent should use this directory

1. When the user says "work on task 12" or "spec 12", read
   `tasks/12-<slug>.md` end to end **before** writing any code.
2. Stay inside the shape. The "Solution shape" section is the design — do
   not invent a different one. If you think the shape is wrong, raise it
   with the user before changing course.
3. Treat "No-gos" as hard. Treat "Rabbit holes" as warnings.
4. Update the `Status` line as you progress (Shaped → In progress → Done).
   When merging, leave a `Done` row pointing at the PR.
5. If you discover follow-up work that doesn't fit the current spec, add a
   bullet under "Notes" instead of doing it inline.
