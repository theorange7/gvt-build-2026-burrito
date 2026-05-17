# Spec 70 — Interactive sense-making session v0

**Status**: Shaped — ready to pick up
**Branch**: both (client primary; server adds one route + one prompt; shared adds session/panel/record types)
**Appetite**: large (≤ 1 week)
**Last shaped**: 2026-05-16

## Problem

UAT against the original 10-slice fan-out wrap generator surfaced a
trust collapse: users encountered a contribution timeline of 2000+ raw
GitLab signals — duplicated, misclassified, unreadable on their own —
before generation even ran. The novelty faded; skepticism took its
place.

The deeper diagnosis (see `tasks/design-interactive-sensemaking.md`):
the original architecture quietly authors a narrative on the user's
behalf. We're inverting Burrito to a recording tool with AI assistance,
and reshaping the **main experience** as small day-scoped sense-making
sessions. The user authors their own record through an editorial
workbench; the AI assists with drafts and context.

The wrap remains as a separately-invoked, shareable artifact. v0 does
**not** change the existing wrap path — Spec 71 handles that. v0 ships
the sense-making session experience.

This spec is the **v0** — the smallest version achievable in one
developer-week before demo day that meaningfully tests the new identity
on real users.

## Solution shape

A user opens Burrito, runs through a 3-step onboarding journey, syncs
their data (existing GitLab provider, unchanged), and lands on the
dashboard. After sync, a soft prompt appears: *"You had 7 artifacts on
Tuesday. When you're ready, we can sit down with them."* Clicking
"Begin a session" opens the editorial workbench scoped to that day's
artifacts. The user sees 1–3 panels grouped by simple rules, opens
each, edits the AI's draft framing in their own voice, locks it in
(or skips). Closing the session persists locked framings to **the
record** — a new local-store table.

The existing wrap path is reachable as it is today; v0 doesn't touch
it. v1 (Spec 71) replaces it with a wrap-from-record path.

### Repo touch points

```
src/
  components/
    onboarding/                      (new)
      OnboardingJourney.tsx          3-screen flow, state in local-store
      steps/
        WhatThisIs.tsx               "Burrito is a recording tool…"
        WhatAIDoes.tsx               "AI helps you notice, you author"
        ReadyToBegin.tsx             confirm + persist onboarding complete
    dashboard/
      SessionEntryPrompt.tsx         (new) soft prompt after sync
      DashboardShell.tsx             (modified) renders SessionEntryPrompt
    session/                         (new)
      SessionWorkbench.tsx           grid of PanelCard; close-session CTA
      PanelCard.tsx                  collapsed view of one panel
      PanelEditor.tsx                expanded edit view; framing textarea + artifacts list
      DateRangePicker.tsx            for "Start a session for…"
  lib/
    sensemaking/                     (new)
      consolidate.ts                 events → artifacts (in-memory query layer)
      collections.ts                 artifacts → day collections; range collection helper
      panels.ts                      collection → panel candidates
      session.ts                     session lifecycle: open, edit, lock/skip, close
      compose.ts                     draft + final framing via server call
      copy.ts                        all user-visible strings (copy-lint target)
    local-store/
      sessions.ts                    (new) encrypted Dexie table for sessions
      record.ts                      (new) encrypted Dexie table for locked framings
  app/
    onboarding/page.tsx              (new) entry for first-run
    session/[id]/page.tsx            (new) workbench route
server/
  src/
    functions/
      composePanel.ts                (new) POST /compose-panel — synchronous draft / lock
    ai/
      prompts/
        panel.ts                     (new) panel-from-framing prompt, dual-mode
shared/
  src/
    types.ts                         (modified) add Session, Panel, PanelKind, Artifact, RecordEntry
    schemas.ts                       (modified) Zod schemas for the above
```

No changes to: the GitLab provider, the wrap renderer (`WrapViewer`,
slide components), the existing `/wrap` enqueue flow, Composer (Spec
30), the local store encryption layer, the contribution timeline UI.

### High-level flow

```
First run                              Returning user
─────────                              ──────────────
1. Onboarding journey (3 screens)      1. Land on dashboard
2. Sync GitLab data (existing)         2. (Sync if needed)
3. Land on dashboard                   3. See SessionEntryPrompt for the
4. SessionEntryPrompt for most            most recent unsession'd day
   recent day shows immediately

Session flow (default: most recent day)
───────────────────────────────────────
4. Click "Begin a session"
5. Client runs in-memory:
   a. consolidate(rawEvents) → Artifact[]
   b. collection = artifacts where day = sessionScope
   c. panels(collection) → PanelCandidate[]   (1–3 panels, see rules)
   d. for each PanelCandidate, draft framing via /compose-panel
      (parallel, server LLM call)
6. SessionWorkbench renders 1–3 panel cards
7. User opens each PanelCard → PanelEditor:
   - sees draft framing (editable)
   - sees list of supporting artifacts (read-only)
   - edits framing freely
   - clicks "Lock in this panel" or "Skip this panel"
8. Once ≥ 1 panel is locked, "Close session" CTA enables
9. Click "Close session":
   a. for each locked panel, /compose-panel in compose mode
      (returns a final framing object, not a wrap slice)
   b. locked panels → RecordEntry[], persisted to record table
   c. day marked session'd in sessions table
   d. return to dashboard with brief "Saved to your record" toast

Range session flow (user-initiated)
───────────────────────────────────
A. From dashboard, click "Start a session for…"
B. Date range picker → submit
C. Same as flow above but collection = artifacts in range
D. Panel extraction caps apply at a wider scope (see rules)

Wrap flow
─────────
Existing /wrap enqueue path, untouched. Reachable from dashboard
exactly as today. v0 does not change wrap composition. Spec 71
rewrites this to read from the record.
```

### Data shapes (new)

```ts
// shared/src/types.ts (additions)

export type PanelKind = "by-repo" | "by-day" | "by-collaborator" | "all-of-day";

export interface Artifact {
  // One row per real-world thing (one merge request, one issue),
  // collapsed from N raw events. v0 is GitLab-only.
  id: string;                 // stable id, e.g. "gitlab:mr:1234"
  kind: "merge_request" | "issue";
  title: string;
  url: string;
  repo: string;
  collaborators: string[];    // usernames who participated
  createdAt: string;
  resolvedAt: string | null;  // merged-at / closed-at
  eventCount: number;         // raw events folded into this artifact
}

export interface ArtifactCollection {
  scope: { kind: "day"; date: string } | { kind: "range"; from: string; to: string };
  artifacts: Artifact[];
}

export interface PanelCandidate {
  kind: PanelKind;
  title: string;              // e.g. "frontend/app" or "Tuesday"
  artifacts: Artifact[];      // ordered by createdAt
  draftFraming: string;       // server-sketched, editable
}

export interface SessionPanel {
  candidate: PanelCandidate;
  status: "open" | "locked" | "skipped";
  framing: string;            // starts as draftFraming, user-edited
}

export interface Session {
  id: string;                 // uuid
  scope: ArtifactCollection["scope"];
  startedAt: string;
  closedAt: string | null;
  panels: SessionPanel[];
}

export interface RecordEntry {
  // One locked panel from a closed session. The atomic unit in the record.
  id: string;
  sessionId: string;
  scope: ArtifactCollection["scope"];
  panelKind: PanelKind;
  panelTitle: string;
  framing: string;            // user's final words
  artifactIds: string[];      // links back to L1 artifacts
  lockedAt: string;
}
```

Persisted encrypted in two new Dexie tables (`sessions`, `record`),
mirroring the shape of `wraps.ts` for write/read encryption. Schema
version bump on the local DB.

### Consolidation logic (client-side, in-memory)

`src/lib/sensemaking/consolidate.ts` takes the existing raw event list
(from the GitLab provider, however it currently lands) and groups
events by a stable artifact id. For v0:

- Group events with the same `mergeRequestIid + projectId` → one
  `Artifact` of kind `merge_request`. Title = MR title at most recent
  event. Collaborators = union of author, reviewers, commenters across
  all events. `createdAt` = first event timestamp; `resolvedAt` =
  merged-at / closed-at if present.
- Group events with the same `issueIid + projectId` → one `Artifact` of
  kind `issue`, analogously.
- Events that don't map (push events on unrelated branches, pipeline
  events) are dropped from the v0 artifact set. They stay in raw
  storage and remain accessible via the existing contribution timeline.

`eventCount` is carried forward as a confidence-adjacent signal. The
UI in v0 doesn't surface it; it exists so v1 / v2 specs can use it
without a re-ingest.

This is a read-time query layer, not a schema migration. The provider
keeps writing raw events as it does today.

### Collection logic

`src/lib/sensemaking/collections.ts`:

- `forDay(date, artifacts)` → returns artifacts whose `createdAt` or
  `resolvedAt` falls within that day's local-tz boundaries.
- `forRange(from, to, artifacts)` → analogous for arbitrary ranges.
- `mostRecentUnsession'dDay(sessions, artifacts)` → returns the most
  recent day after the user's install date that has at least one
  artifact and no closed session.

Install date is read from the existing local-store install-token row
(or persisted explicitly during onboarding if not available there).

### Panel extraction

`src/lib/sensemaking/panels.ts` produces 1–3 panels for a collection.
Rules:

**For day collections:**
- If the collection has ≤ 5 artifacts: one panel of kind `all-of-day`,
  title formatted like "Tuesday, May 14".
- If the collection has > 5 artifacts: group by `repo`. Each repo
  becomes a `by-repo` panel. **Cap at 3 panels**; if there are more
  repos, the panels include the top 3 by artifact count and remaining
  artifacts roll into a single `by-day` "Other work" panel.

**For range collections:**
- Group by `repo`. Cap at 3 `by-repo` panels by artifact count.
- Remaining artifacts roll into a single `by-day` "Other work" panel.

No clustering, no LLM-driven theme detection in v0. The cap is about
keeping the workbench scannable, not about ranking importance. Copy
frames panels as factual filters ("you touched these repos this week"),
not quality judgments.

`PanelKind` of `by-collaborator` is declared in types but **not used in
v0** — reserved for follow-up specs.

### Compose-panel server route

`POST /compose-panel` runs synchronously. Input shape:

```ts
{
  mode: "draft" | "lock";
  panelKind: PanelKind;
  panelTitle: string;
  scopeLabel: string;          // e.g. "Tuesday, May 14" — human-readable scope
  artifactSummaries: Array<{   // pre-redacted; no user identifiers
    kind: "merge_request" | "issue";
    title: string;
    repo: string;
    resolvedAt: string | null;
    eventCount: number;
  }>;
  userFraming?: string;        // required when mode = "lock"
}
```

Output:

```ts
// mode = "draft"
{ framingDraft: string }       // 2–4 sentences

// mode = "lock"
{ framingFinal: string }       // user voice preserved; minor cleanup only
```

The system prompt (in `server/src/ai/prompts/panel.ts`) is one prompt
with two modes:

- **Draft mode**: write a 2–4 sentence factual framing of the panel
  in the voice of "the system noticed this". No quality verdicts. No
  "highlights" / "top" language.
- **Lock mode**: minimally polish the user's framing (typos, light
  flow). The user's words are the source of truth. Add nothing
  substantive. Never override their intent.

The route uses `requireInstallToken` and carries the PRIVACY banner.
Request bodies are never logged.

### Onboarding journey

3 screens, copy in `src/lib/sensemaking/copy.ts`. Each is a single
React component with no animation library beyond what's already in
the project.

**Screen 1 — What Burrito is.** Title: "Burrito remembers your work so
you don't have to." Body: 2 short paragraphs in the brand voice.
Single CTA: "Continue".

**Screen 2 — What the AI does (and doesn't).** Title: "You author. I
assist." Body: 3 short bullets — what the AI does, what the user
does, why we built it this way. Single CTA: "Continue".

**Screen 3 — Ready.** Title: "Let's sync your work." Body: "Connect a
source. We'll collect quietly. When you're ready to sit down with what
we've gathered, you'll find the door open." Single CTA: "Begin". This
persists `onboardingCompleted: true` to the local store and routes to
the dashboard. The dashboard's `SessionEntryPrompt` will pick up the
most-recent-day prompt automatically after first sync.

### Session entry prompt

After data sync completes (or on dashboard load with new artifacts
since the last session), `SessionEntryPrompt` renders above the
existing contribution feed:

```
You had 7 artifacts on Tuesday.
When you're ready, we can sit down with them.

[Begin a session]                              Start a session for…
```

- N count comes from `forDay(mostRecentUnsession'dDay, artifacts)`.
- Primary CTA routes to a new session for that day.
- "Start a session for…" opens the date-range picker for range
  sessions.
- If a user has completed sessions: subtle secondary link "You have N
  completed sessions" (no browser UI in v0; link is a no-op or
  collapses to a count for the demo).
- Per-day dismissal: if the user dismisses, the prompt for that day
  doesn't reappear until the next day's prompt is due. (Stored in a
  dismissed-days set in the sessions table.)
- Older days (before install) do not auto-prompt; reachable only via
  the range picker.

### Mockups

#### Session workbench (day-scope example)

```
┌─────────────────────────────────────────────────────────────┐
│  Tuesday, May 14                                  [×] Close│
│  Three groupings from your day. Open each, edit what we     │
│  sketched. Lock in what you want in your record.            │
│                                                             │
│  ┌─────────────────────────┐ ┌─────────────────────────────┐│
│  │ frontend/app            │ │ infra/terraform             ││
│  │ 4 artifacts             │ │ 2 artifacts                 ││
│  │ Draft framing preview…  │ │ Draft framing preview…      ││
│  │                  [Open] │ │                      [Open] ││
│  └─────────────────────────┘ └─────────────────────────────┘│
│  ┌─────────────────────────┐                                │
│  │ Other work              │                                │
│  │ 1 artifact              │                                │
│  │ Draft framing preview…  │                                │
│  │                  [Open] │                                │
│  └─────────────────────────┘                                │
│                                                             │
│  0 of 3 panels resolved                  [Close session]    │
│                                            (disabled)       │
└─────────────────────────────────────────────────────────────┘
```

#### Panel editor (opened state)

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back to all panels                                       │
│                                                             │
│  frontend/app  ·  Tuesday, May 14                           │
│                                                             │
│  Our sketch (edit freely — your words go in your record)    │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ You spent time in frontend/app today — four merge       ││
│  │ requests, all merged. Mostly UI polish: the dashboard   ││
│  │ shell tweak, two login-error states, and an avatar      ││
│  │ size fix.                                               ││
│  │                                                         ││
│  │ [editable textarea, ~120 char width]                    ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  What we're looking at (4 artifacts)                        │
│   • Dashboard shell tweak  · 11:14 am · merged   [view ↗]  │
│   • Login error state — empty username · 1:02 pm [view ↗]  │
│   • Login error state — locked account · 2:30 pm [view ↗]  │
│   • Avatar size fix · 4:48 pm · merged           [view ↗]  │
│                                                             │
│             [Skip this panel]      [Lock in this panel]    │
└─────────────────────────────────────────────────────────────┘
```

#### Session entry prompt on dashboard

```
┌─────────────────────────────────────────────────────────────┐
│  You had 7 artifacts on Tuesday.                            │
│  When you're ready, we can sit down with them.              │
│                                                             │
│  [Begin a session]              Start a session for… →     │
└─────────────────────────────────────────────────────────────┘

[existing contribution feed below — unchanged]
[existing wrap path / "Generate a wrap" — unchanged]
```

## Rabbit holes

- **Don't migrate the schema.** Consolidation is a read-time query
  layer, not a write-time change. The provider keeps writing raw
  events. If you find yourself adding migrations to the provider, you've
  left the shape.
- **Don't build clustering.** Panel grouping is deterministic (by
  repo, or all-of-day for small collections). No k-means, no
  embeddings, no LLM-driven theme detection. v2 explores smarter
  extraction.
- **Don't add a `by-collaborator` panel kind in v0.** It's declared in
  types as a reservation, but not implemented. Adding it requires
  separately reasoning about how collaborator framings handle real
  names; out of scope.
- **Don't add session resumability mid-session.** If a user closes
  the workbench with unsaved edits, we lose them. Warn on close with
  a browser confirm dialog. Resumability is v2.
- **Don't try to remove the existing `/wrap` enqueue path.** Keep it
  reachable exactly as today. Spec 71 replaces it; v0 leaves it
  alone. Demo day relies on the existing path as a wrap fallback.
- **Don't put a confidence/reliability score in the UI.** We have
  `eventCount` available, but exposing it requires a framing v0
  doesn't have the bandwidth to land well.
- **Don't let "Close session" require all panels locked.** A user may
  want a 1-panel session. Enable as soon as ≥ 1 panel is locked.
  Skipped panels don't produce RecordEntries.
- **Don't let LLM output drift into authoring.** Both prompt modes
  must produce output that sounds like "the system noticed and
  sketched", not "the system declared". Watch for: "your best work
  today was…", "your most impactful…", "you really excelled at…".
  Reject any prompt response containing forbidden phrases via a
  post-processing check before persisting. If the check triggers,
  fall back to a deterministic factual sentence based on the
  artifact summaries.
- **Don't use the synchronous route for long-running operations.**
  Each `/compose-panel` call is one LLM round-trip on a small input
  (one panel's artifact summaries). If it takes more than 10s, the
  prompt is wrong or the input is too large.
- **Don't surface days before install in the auto-prompt.** Older
  days are reachable only via the "Start a session for…" picker. The
  auto-prompt for backlog days will create a 200-prompt pileup that
  destroys the experience.
- **Don't compose a wrap in v0.** "Close session" persists
  RecordEntries; it does not produce a wrap. The existing wrap path
  remains available on the dashboard, untouched. Spec 71 introduces
  wrap-from-record.

## No-gos

- **No conversational chat mode** (Mode B). v2+.
- **No `by-collaborator` panels.** Reserved in types, deferred in
  implementation.
- **No reliability scoring system.** v2+.
- **No layered (L0–L3) schema migration.** L1 stays in-memory in v0;
  L2 is the record table, written by sessions only.
- **No multi-year memory** or cross-session continuity. v2+.
- **No mid-session resumability.** v0 explicitly accepts the data
  loss on browser close, with a warning.
- **No new providers.** GitLab only. The provider abstraction stays
  but isn't exercised by this spec.
- **No timeline UI redesign.** The existing contribution feed stays
  exactly as is.
- **No changes to Composer (Spec 30).** Composer reads finished
  wraps; how the wrap was made is invisible to it.
- **No changes to the wrap renderer.** `WrapViewer` and slide
  components don't know about sessions or the record. (Spec 71 keeps
  them unchanged too; it changes only the composition path.)
- **No removal of `/wrap` enqueue.** Stays untouched in v0.
- **No "highlights" / "top" / "best" / "most impactful" copy
  anywhere.** Enforced by a copy-lint check in `test/unit/`.
- **No in-session artifact creation.** The user can't add an
  artifact while inside the workbench. Manual input is via the
  existing `manual-input-form` on the dashboard. v2 may revisit.
- **No telemetry on session edit/lock/skip patterns.** v0 ships
  without analytics.
- **No browseable record UI.** RecordEntries persist but the user
  can't browse them in v0 outside completed-sessions count. v2 adds
  this.
- **No server-side session or record state.** All session and
  record persistence is client-side, encrypted. The server is
  stateless w.r.t. both.

## Verification

Functional (client):

- **Onboarding journey end-to-end**: a Playwright test walks all 3
  screens, clicks Begin, asserts `onboardingCompleted` is persisted
  and the dashboard renders.
- **Session entry prompt visibility**: after onboarding completes
  with the demo seed data, the soft prompt shows the correct artifact
  count for the most recent unsession'd day.
- **Per-day dismissal**: dismissing the prompt hides it; the next
  day's prompt (if seeded) appears.
- **Range picker**: "Start a session for…" opens a picker, valid
  range routes to a new session scoped to that range.
- **Consolidation correctness**: unit test on a fixture of raw GitLab
  events (`test/fixtures/gitlab-mixed-events.json`) asserts the
  consolidated `Artifact[]` has expected length, collaborators set
  per artifact, and `eventCount` values.
- **Panel extraction**:
  - Collection of ≤ 5 artifacts → exactly one `all-of-day` panel.
  - Collection of > 5 across 5 repos → exactly 3 `by-repo` + 1 `by-day`
    "Other work".
  - Collection of > 5 across 2 repos → exactly 2 `by-repo` panels, no
    "Other work".
- **Workbench rendering**: a component test renders the workbench
  with a fixture session and asserts the right number of cards and
  the disabled state of "Close session" until ≥ 1 panel is locked.
- **Panel editor edit cycle**: opens a panel, edits framing, locks
  it, asserts the framing persists, the panel reports
  `status: "locked"`, and the next click on "Close session" persists
  a `RecordEntry`.
- **Backlog suppression**: a fixture user with artifacts older than
  install gets no auto-prompt for those older days; range picker
  still reaches them.

Functional (server):

- **`/compose-panel` draft mode**: with `mode: "draft"`, asserts
  response carries `framingDraft` as a string, ≥ 50 chars and
  ≤ 600 chars.
- **`/compose-panel` lock mode**: with `mode: "lock"` and a
  `userFraming`, asserts response carries `framingFinal` and that
  it contains substring overlap with `userFraming` (the user's
  voice survived).
- **Forbidden-phrase post-check**: a unit test on the
  forbidden-phrase guard with seeded responses containing each
  banned phrase confirms each triggers fallback.
- **Auth**: `/compose-panel` without JWT → 401, expired JWT → 401,
  valid JWT → 200.

Privacy invariants (extends the existing client + server suites):

- `src/lib/sensemaking/**` may not import server-only env vars; may
  not import from `src/lib/ai/**` outside the compose helper; may
  import from `src/lib/local-store/**` (this is the orchestrator
  boundary for sense-making).
- `server/src/functions/composePanel.ts` carries the PRIVACY banner.
- `/compose-panel` request body Zod rejects any field named `userId`,
  `id`, `externalId`, `email`, `name`, `username`. Artifact
  summaries strip identifiers before send.
- Static-analysis test on `src/lib/sensemaking/copy.ts` enforces the
  copy-lint: no "highlights", "top", "best", "most impactful", "key"
  (as in "key contributions"), "your standout" anywhere in
  user-visible strings.
- Static-analysis test on `server/src/ai/prompts/panel.ts`
  confirms the prompt itself forbids judgement language in the
  model's output.

Operational:

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` green.
- `cd server && pnpm typecheck && pnpm test` green.
- A demo-mode flag in the existing seed data routes a fresh user
  through onboarding → seeded recent-week artifacts → session →
  closed session → record entry written. Suitable for showing live
  without network.

## Notes

### Phasing (recommended PR sequence)

Tight one-week scope. Each PR should be merge-ready on its own.

1. **PR 1 (Day 1–2)**: shared types + `consolidate.ts` +
   `collections.ts` + `panels.ts` + unit tests. Foundation; reverts
   cheaply.
2. **PR 2 (Day 3)**: `/compose-panel` route, panel prompt, server
   tests. Forbidden-phrase guard included.
3. **PR 3 (Day 4–5)**: `SessionWorkbench`, `PanelCard`,
   `PanelEditor`, `sessions` + `record` local-store tables, plumbed
   end-to-end against fixture data.
4. **PR 4 (Day 5–6)**: onboarding journey + `SessionEntryPrompt` on
   the dashboard + date-range picker. Routes wired.
5. **PR 5 (Day 6–7)**: e2e Playwright, demo-mode seed, copy-lint
   test, polish. Mark spec done in this PR.

The `## Done` block + index update + changelog entry land on PR 5.

### Cut-list if appetite blows out

If by end of Day 4 PR 3 isn't merge-ready, cut in this order:

1. Drop the date-range picker; sessions are day-scoped only.
2. Drop the "Other work" rollup panel; cap at 3 `by-repo` and let
   extras disappear from the panel set (still in the record via the
   raw artifact list).
3. Drop the supporting-artifacts list in PanelEditor (framing
   textarea only).
4. Reduce onboarding to 2 screens.
5. Drop the per-day dismissal feature; the prompt just sits there.

If by end of Day 6 PR 5 isn't on track, skip Playwright e2e and
ship with only unit + component coverage. Hand-test the demo path.

### Copy review

The user (Timothy) owns copy. All user-visible strings live in
`src/lib/sensemaking/copy.ts`. Onboarding screens, soft prompt text,
panel editor labels, and the compose-panel system prompts all need a
copy pass before merge.

Vocabulary to avoid (enforced by copy-lint test):

- "highlights", "top contributions", "best work", "most impactful",
  "key" (in the sense of "key contributions"), "your standout"
- "AI-generated for you", "we wrote this for you"

Vocabulary to prefer:

- "your record", "your year", "what you noticed"
- "things you spent time on", "people you worked with most"
- "we sketched this — your turn", "edit freely"

See `tasks/design-interactive-sensemaking.md` § Vocabulary
discipline for full guidance.

### Demo-day risk register

- **LLM latency**: 1–3 draft framings per session, parallel,
  small input each. Budget: 10s p95 from "Begin a session" click to
  first panel rendered with framing. Per-card "Sketching a draft…"
  state so the user sees progress.
- **First-session UX on install**: the very first session should run
  against the most recent day's artifacts immediately after
  onboarding ends. If sync hasn't populated yet by then, the prompt
  shows "We're still gathering — give us a moment" rather than
  empty.
- **Fallback path**: the existing `/wrap` enqueue button stays
  reachable from a "More options" affordance on the dashboard for
  demo day. If the session path breaks live, fall back to the old
  generator.
- **Demo seed shape**: the seed user needs 5–10 days of recent
  artifacts (this week + last week) with 1–8 artifacts per day, plus
  older artifacts for the range-picker demo. Generate this fixture
  early in the week.

### Cross-spec considerations

- **Spec 30 (Composer)** is unaffected.
- **Spec 31 (shareable highlight wheels)** is unaffected.
- **Spec 50 (file upload provider)** becomes a second artifact source
  once it ships; integration into sessions is automatic if its
  artifacts surface through the same consolidation pipeline. No spec
  change needed here.
- **Spec 71 (wrap from the record)** is the v1 follow-up. v0 leaves
  the existing `/wrap` enqueue path alone; Spec 71 replaces it.
- Existing **manual-input-form** in `src/components/dashboard/` is
  the third artifact source as-is. No v0 changes to it.

### Out-of-scope follow-ups (parking lot)

- `by-collaborator` panel kind.
- Wizard "noticings" between panels (Mode A overlay).
- Conversational sense-making (Mode B).
- Reliability scoring on extraction + UI exposure.
- Layered signal schema migration (write-time consolidation).
- Multi-year memory / cross-session continuity.
- Story-aware lazy classification at slice prompt time.
- Multi-provider normalisation past GitLab.
- Replacing the contribution timeline as a discoverable surface.
- Deprecating the original `/wrap` enqueue path (after Spec 71).
- Analytics on session edit/lock/skip patterns.
- Browseable record UI ("read my journal").
- In-session artifact creation.
