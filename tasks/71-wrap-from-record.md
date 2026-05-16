# Spec 61 — Wrap from the record (v1)

**Status**: Shaped — ready to pick up (blocked by Spec 60)
**Branch**: both (client primary; server adds one route + one prompt; shared adds wrap-composition types)
**Appetite**: medium (≤ 3 days)
**Last shaped**: 2026-05-16

## Problem

Spec 60 ships the new main experience: small day-scoped sense-making
sessions that accumulate locked framings into **the record** (L2 in
the design note). After Spec 60, users have their own words attached
to groupings of their work — but the wrap path still fans out over
raw signals, ignoring everything the user authored.

This spec rewires the wrap to do what the brand has promised all
along: compose a shareable artifact from the user's own
sense-making, not from a generator's interpretation of raw events.

The deliverable: a user picks a date range, optionally curates which
record entries are included, and gets a wrap whose slices carry their
own voice. The wrap renderer (`WrapViewer`, slide components) is
unchanged. Composer (Spec 30) is unchanged. What changes is the
composition path.

Once Spec 61 ships, the original `/wrap` enqueue path (raw-signal
fan-out) is hidden from the UI but left in code for compatibility.
A future spec removes it entirely.

## Solution shape

A user clicks "Make a wrap" from the dashboard. A modal walks them
through three steps:

1. **Pick a range** — calendar date-range picker, with quick options
   ("Last 7 days", "This quarter", "This year", "All time").
2. **Curate** — list of RecordEntries in the chosen range, grouped
   by session. All on by default. User can untick entries they don't
   want in the wrap. A live count shows "N entries → ~M slides".
3. **Confirm** — soft summary + brand-voice copy + a single
   [Make my wrap] CTA.

Clicking the CTA enqueues a wrap job via a new server route, the
existing async pattern. Each selected RecordEntry maps to one wrap
slice, composed by an LLM call that polishes the user's framing into
a slide-ready shape without changing the substance. The result is
saved through the existing `wraps.ts` local-store path and rendered
via the existing `/wrap/[id]` page.

The wrap data shape (`SliceContent[]`) is **unchanged** from today.
Composer (Spec 30) and the renderer don't know whether the wrap came
from the old path or the new one.

### Repo touch points

```
src/
  components/
    dashboard/
      MakeWrapButton.tsx             (new) opens the wrap modal
    wrap-from-record/                (new)
      WrapModal.tsx                  3-step flow shell
      RangeStep.tsx                  calendar + quick options
      CurateStep.tsx                 RecordEntry checklist grouped by session
      ConfirmStep.tsx                summary + CTA
  lib/
    wrap-from-record/                (new)
      enqueue.ts                     POST /wrap-from-record, returns jobId
      poll.ts                        GET /wrap/{jobId} reuse — no new endpoint
      compose.ts                     client-side helper: shape RecordEntries → request
      copy.ts                        all user-visible strings (copy-lint target)
  lib/
    local-store/
      record.ts                      (modified) add queryByRange()
server/
  src/
    functions/
      wrapFromRecord.ts              (new) POST /wrap-from-record enqueue
      wrapFromRecordWorker.ts        (new) Service Bus trigger — composes slices
    ai/
      prompts/
        wrap-from-record.ts          (new) RecordEntry → SliceContent prompt
shared/
  src/
    types.ts                         (modified) WrapFromRecordRequest, slice-template kinds
    schemas.ts                       (modified) Zod for above
```

### High-level flow

```
Dashboard
─────────
1. User clicks [Make a wrap]
2. WrapModal opens at RangeStep
3. User picks a range (or quick option) → CurateStep
4. CurateStep fetches RecordEntries in range from local store
   - if zero entries: soft empty state — "Your record is empty for
     this range. Try a wider range or run a session first." Link to
     start a session.
   - otherwise: list grouped by session date, all checked by default
5. User adjusts selection → ConfirmStep
6. ConfirmStep shows: N entries, expected M slides, brand-voice
   acknowledgement, [Make my wrap]
7. Click → POST /wrap-from-record with the selected record entry
   payload (see Data shapes); receive jobId; client navigates to a
   loading state inside the wrap viewer
8. Existing poll path (GET /wrap/{jobId}) handles status; when
   complete, the wrap is saved + rendered as today

Server side
───────────
A. POST /wrap-from-record enqueues a Service Bus message; returns
   jobId immediately (matching the existing wrap async pattern)
B. wrapFromRecordWorker picks up the job, runs through the entries
   in parallel:
   - one LLM call per entry → SliceContent
   - cap concurrency to 8 (matches existing pattern)
   - failures fall back to a deterministic shape derived from the
     entry's framing — never block the wrap
C. Results assembled into the wrap shape and written to Azure Table
   Storage, mirroring the existing wrap worker
D. Client polls and rehydrates the wrap into local-store wraps table
```

### Data shapes (new)

```ts
// shared/src/types.ts (additions)

export type SliceTemplate =
  | "by-repo"            // record entry from a by-repo panel
  | "by-day"             // record entry from a by-day / all-of-day panel
  | "by-collaborator";   // reserved; not produced in v0 / v1

export interface WrapFromRecordRequest {
  jobId: string;                   // client-generated uuid
  range: { from: string; to: string };
  entries: Array<{
    // pre-redacted by the client before send
    sessionScopeLabel: string;     // e.g. "Tuesday, May 14"
    panelTitle: string;            // e.g. "frontend/app"
    template: SliceTemplate;
    framing: string;               // the user's locked words
    artifactSummaries: Array<{     // for visual context only
      kind: "merge_request" | "issue";
      title: string;
      repo: string;
      resolvedAt: string | null;
    }>;
  }>;
}

export interface WrapFromRecordResponse {
  jobId: string;
  status: "queued" | "running" | "complete" | "failed";
  wrap?: WrapResult;               // existing shape from current wrap path
  error?: { code: string };
}
```

The client never sends user identifiers, raw artifact IDs, URLs, or
collaborator names to the server. Slice composition operates on the
user's framing as the source of truth, with `artifactSummaries`
providing only the lightest factual context for visual templating.

### Compose prompt (server)

`server/src/ai/prompts/wrap-from-record.ts` is a single prompt with
one core instruction: take the user's framing as truth. Polish only
where polish helps a slide read clearly — typo fixes, light
sentence-level rhythm, never substance changes, never additions, and
never reframings. The framing's voice is the slide's voice.

The slice output shape matches the existing `SliceContent`. Visual
template hints come from `template` (the panel kind from the source
RecordEntry). The renderer maps templates to existing slide
components — for v1, all three templates render with the existing
text-forward slide layout; visual differentiation between templates
is a follow-up.

Same forbidden-phrase post-check as Spec 60. Same fallback shape: if
the LLM output contains banned phrasing or fails the Zod parse,
substitute a deterministic slice that carries the user's framing
verbatim with the panel title as the headline.

### Curation default

Default = all record entries in the range are checked. The user
removes the ones they don't want. The opposite default (all off, user
opts in) would force authorship without giving them a sense of what's
available. Defaulting on with easy untick respects the user's time
without sliding into "we picked for you".

A line of copy on CurateStep makes the model explicit: *"These are
the things you've written down. Untick anything you'd rather not
share."*

### Empty record state

If the record contains zero entries in the chosen range:

> Your record is empty for this range. Try a wider range, or run a
> session first to add some framings.

Inline link: [Start a session for…] (re-uses the date-range picker
from Spec 60). No fallback to the old raw-signal wrap path from this
modal — Make a wrap from the record means from the record.

The legacy `/wrap` enqueue path lives in code but is removed from
the dashboard UI by this spec, so there's no longer a "make a wrap
from raw signals" affordance for users.

### Mockups

#### Dashboard with new affordance

```
┌─────────────────────────────────────────────────────────────┐
│  You had 4 artifacts on Wednesday.                          │
│  When you're ready, we can sit down with them.              │
│                                                             │
│  [Begin a session]              Start a session for… →     │
└─────────────────────────────────────────────────────────────┘

[existing contribution feed below — unchanged]

──── Your record ────────────────────────────────────────────
You've recorded 27 entries across 12 sessions.

                                            [Make a wrap]
```

#### Wrap modal — RangeStep

```
┌─────────────────────────────────────────────────────────────┐
│  Make a wrap                                          [×]   │
│                                                             │
│  Pick a range to draw from.                                 │
│                                                             │
│  [ Last 7 days ]  [ This quarter ]  [ This year ]  [ All ]  │
│                                                             │
│  Or pick custom dates:                                      │
│     From [2026-01-01]      To [2026-05-16]                  │
│                                                             │
│  In this range: 27 record entries across 12 sessions.       │
│                                                             │
│                                                  [Next →]   │
└─────────────────────────────────────────────────────────────┘
```

#### Wrap modal — CurateStep

```
┌─────────────────────────────────────────────────────────────┐
│  Make a wrap                                          [×]   │
│                                                             │
│  These are the things you've written down. Untick anything  │
│  you'd rather not share.                                    │
│                                                             │
│  Tuesday, May 14                                            │
│   [✓] frontend/app — "You spent time in frontend/app…"      │
│   [✓] Other work    — "Took a look at the noisy CI logs…"   │
│                                                             │
│  Monday, May 13                                             │
│   [✓] platform/api — "Wrote the new rate-limit middle…"     │
│   [ ] Other work    — "Cleaned up dotfiles…"                │
│                                                             │
│  Sunday, May 12                                             │
│   [✓] All of Sunday — "Mostly review work — went deep on…"  │
│                                                             │
│  …24 more entries below                          [Show all] │
│                                                             │
│  4 entries selected  → about 4 slides                       │
│                                                             │
│  [← Back]                                        [Next →]   │
└─────────────────────────────────────────────────────────────┘
```

#### Wrap modal — ConfirmStep

```
┌─────────────────────────────────────────────────────────────┐
│  Make a wrap                                          [×]   │
│                                                             │
│  We'll polish the words you wrote into a wrap. We won't     │
│  add new ideas, change your meaning, or invent anything.    │
│                                                             │
│  Range: May 12 — May 16, 2026                               │
│  Entries: 4   →   ~4 slides                                 │
│                                                             │
│  [← Back]                              [Make my wrap]       │
└─────────────────────────────────────────────────────────────┘
```

## Rabbit holes

- **Don't redesign the slice taxonomy.** The 10-slice taxonomy from
  the old generator is gone; `SliceTemplate` is a small enum of
  three values matching panel kinds. Don't add new templates without
  a separate design conversation.
- **Don't summarize the user's framing.** The prompt's job is
  light polish (typos, mild rhythm). Word reduction, summarisation,
  and rewording are explicitly out. If the framing is long, the
  slice carries the long version; the renderer handles overflow.
- **Don't merge multiple entries into one slice in v1.** Each
  selected entry = one slice. Merging is a curation choice the user
  should make themselves (by untick), not a model choice.
- **Don't introduce themes / clustering across entries.** v1 keeps
  the order = the entries' lock order (chronological by session
  scope). Reordering is a v2 design conversation.
- **Don't reach into the consolidated artifact layer (L1) during
  composition.** The framing is the source of truth.
  `artifactSummaries` are for visual context only; the prompt must
  not derive substantive content from them. Test this with a
  fixture where the artifact summary list contradicts the user's
  framing and assert the slice reflects the framing.
- **Don't keep the legacy `/wrap` enqueue path reachable from
  the dashboard.** This spec removes the UI affordance for it. The
  code stays for compatibility (existing in-flight jobs, stored
  wraps from before Spec 61). A future spec deletes the code.
- **Don't let an empty record fall back to the legacy path.** The
  CurateStep's empty state must point to "start a session", not to
  the old generator. The whole point of v1 is that the wrap comes
  from sense-making.
- **Don't add a "ranged auto-prompt" to suggest making a wrap.**
  The wrap is user-initiated. No "you've reached 20 entries — want
  to make a wrap?" nudges. v2 may revisit this with a soft prompt
  pattern matching Spec 60's session entry.
- **Don't surface forbidden phrases in CurateStep entry titles.**
  The framing previews come from RecordEntries which already passed
  the forbidden-phrase check in Spec 60. But the previews must
  truncate without altering — no system-side ellipsis that injects
  new words.

## No-gos

- **No new wrap renderer.** `WrapViewer` and slide components are
  unchanged.
- **No new local-store encryption.** Wraps continue to write through
  `wraps.ts` as today.
- **No removal of the legacy `/wrap` enqueue code.** UI removal
  only; code stays.
- **No new slice templates beyond the three declared.**
- **No multi-entry-to-one-slice merging.** Each record entry is one
  slice.
- **No reordering of slices** in v1 — chronological order is the
  default and the only option.
- **No themes panel or theme-aware composition.** v2+.
- **No telemetry on curation behavior** (what users tick / untick).
  v2 may revisit with bounded counters under existing privacy rules.
- **No server-side persistence of record entries.** The client
  sends the selected entries in the request payload; the server
  composes from them in-memory and writes only the resulting wrap.
- **No "make a wrap from session" CTA inside Spec 60's workbench.**
  Wrap creation is initiated from the dashboard, not from a closing
  session. Sessions write to the record; the wrap reads from the
  record. The decoupling is the point.
- **No "highlights" / "top" / "best" copy anywhere.** Enforced by
  the same copy-lint check shared with Spec 60.
- **No fan-out across raw signals.** This spec deletes that path
  from the user's experience. Compose from framings only.

## Verification

Functional (client):

- **MakeWrapButton visibility**: only renders if the user has
  ≥ 1 record entry. Empty state on the dashboard shows a different
  message.
- **RangeStep quick options**: each quick option populates the
  range correctly and live-updates the entry count.
- **CurateStep grouping**: entries grouped by session date,
  ordered most-recent-first; tick state persists across step
  transitions.
- **Empty range state**: zero entries in range surfaces the empty
  state with the start-a-session link.
- **ConfirmStep summary**: shows correct N entries / M slides
  values mirroring the selection.
- **Enqueue + poll**: clicking Make my wrap navigates to a loading
  state, polls correctly, and rehydrates a wrap into the local
  store on completion.
- **Wrap rendering**: the resulting `/wrap/[id]` page renders with
  exactly N slides where N = selected entries; each slide's body
  contains substring overlap with its source framing.

Functional (server):

- **`/wrap-from-record` enqueue**: accepts a valid request, returns
  a jobId; bad request body → 400; unauthorized → 401.
- **wrapFromRecordWorker**: given a fixture request, composes the
  expected number of slices; each slice contains substring overlap
  with its source framing.
- **Slice fallback path**: when the model output fails Zod parse or
  contains a forbidden phrase, the worker substitutes the
  deterministic slice with framing verbatim. Test with seeded bad
  responses.
- **Concurrency cap**: with a 20-entry request, the worker runs no
  more than 8 LLM calls in flight at once.
- **Forbidden-phrase guard**: same shared guard as Spec 60.
- **Adversarial test (substance preservation)**: a fixture where
  `artifactSummaries` say "frontend/app — 4 MRs all merged" but the
  user's framing says "Spent the day chasing a flaky test in
  platform/api" → the slice reflects the user's framing, not the
  summaries.

Privacy invariants (extends the existing client + server suites):

- `src/lib/wrap-from-record/**` may not import server-only env vars.
- `server/src/functions/wrapFromRecord.ts` and
  `wrapFromRecordWorker.ts` carry the PRIVACY banner.
- `/wrap-from-record` request body Zod rejects fields named
  `userId`, `id`, `externalId`, `email`, `name`, `username`. The
  client's enqueue helper strips identifiers before send (test this
  with a fixture that injects them and asserts they're absent in
  the outbound body).
- Static-analysis test on `src/lib/wrap-from-record/copy.ts`
  enforces the shared copy-lint.
- A test asserts that the server worker never logs the framing
  text, the artifact summaries, or any prompt content beyond opaque
  counters.

Operational:

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` green.
- `cd server && pnpm typecheck && pnpm test` green.
- The existing wrap viewer renders both legacy wraps (from raw
  signals, stored locally) and new wraps (from the record) without
  changes. Smoke-test by inspecting a pre-Spec-61 stored wrap and a
  post-Spec-61 stored wrap.

## Notes

### Phasing (recommended PR sequence)

Three PRs, each merge-ready on its own.

1. **PR 1**: shared types + `record.queryByRange()` +
   `wrapFromRecord` route + worker scaffolding (no LLM call yet —
   returns deterministic slices verbatim from framings). Tests
   cover the enqueue/poll/save round-trip.
2. **PR 2**: real composition prompt + forbidden-phrase guard +
   fallback path + substance-preservation adversarial test.
3. **PR 3**: client wrap modal (3 steps) + dashboard affordance +
   removal of legacy wrap UI affordance + e2e Playwright. Mark
   spec done in this PR.

The `## Done` block + index update + changelog entry land on PR 3.

### Cross-spec considerations

- **Spec 30 (Composer)**: unaffected. Composer takes a wrap and
  produces a video; the wrap shape is unchanged. Verify with a
  fixture: a Spec-61-composed wrap → Composer → MP4 should work
  without code changes to Composer.
- **Spec 31 (shareable highlight wheels)**: unaffected. The wrap
  bundle format Spec 31 publishes is the same.
- **Spec 60 (sense-making v0)**: this spec is the v1 completion of
  that initiative. Cannot land until Spec 60 ships and at least one
  user has a non-empty record.
- **Legacy `/wrap` enqueue**: code stays for compatibility; UI
  affordance removed. A v2 spec deletes the code and the worker
  function after a deprecation window.

### Pre-existing wraps

Wraps stored locally from before Spec 61 (composed by the legacy
fan-out) continue to render exactly as today via the existing
`/wrap/[id]` page. The shape is unchanged. No migration needed.

### Demo-day relevance

Spec 60 ships first for demo day. Spec 61 is the follow-up. If
demo timing pulls Spec 61 forward, the cuts are:

- Drop the curation step entirely — first cut. All record entries
  in the range become slides; no user-side untick UI.
- Collapse the modal to two steps (range + confirm).
- Skip the visual differentiation by `SliceTemplate` (which is
  deferred anyway) — all slices render with the same template.
- Skip the substance-preservation adversarial test — keep the basic
  composition tests.

These cuts get the v1 path running in ~1 day instead of ~3, at the
cost of less user agency at wrap time.

### Out-of-scope follow-ups (parking lot)

- Visual differentiation between slice templates.
- Themes / clustering across record entries (cross-session
  patterns).
- Reordering slices manually before wrap render.
- Merging multiple entries into one slice on the user's request.
- Suggested ranges based on record density ("your busiest month
  was…" — careful with brand line).
- Deletion of the legacy `/wrap` enqueue path code.
- Browseable record UI (read the journal outside the wrap context).
- Wrap diffs ("what changed in my record between two wraps").
- Auto-prompt for new wraps after N new entries (carefully — see
  Rabbit holes).
- Cross-year wraps once multi-year memory exists.
