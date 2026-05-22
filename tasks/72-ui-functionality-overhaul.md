# Spec 72 — UI and functionality overhaul

**Status**: Shaped — ready to pick up (subsumes the UI scope of Specs 70 and 71; incorporates file upload — Spec 50 — as a recap entry point)
**Branch**: both (client primary; server gains one route; shared gains several types)
**Appetite**: large (≤ 1 week) — see Notes; this is at the upper edge and likely needs 2 weeks if shipped as a single initiative. Phasing is intentional so the first 2–3 PRs are landable independently and can ship for demo even if later PRs slip. The file-upload-as-recap addition (2026-05-21 reshape) is incremental on top — see "File upload as a recap entry point".
**Last shaped**: 2026-05-21

## Problem

Specs 70 and 71 (interactive sense-making v0; wrap from the record)
shaped a direction before any visual prototyping existed. Since then,
a Claude Design exploration produced a full interactive prototype at
`docs/designs/spec70/burrito/project/` covering nine surfaces — and
in the process answered several open questions and surfaced new ones:

- **Projects and Collaborators became first-class concepts**, not just
  an open question. They get their own navigation tabs (`projects`,
  `people`), index views, and detail pages. Sessions can be scoped by
  project or by person, not only by day or range.
- **The record gets a dedicated browseable view** rather than living
  only as a count.
- **A timeline surface** appears: a chronological day-by-day view of
  activity with markers for sessioned vs unsessioned days; clicking
  any past day starts a session scoped to that day.
- **The dashboard is rebuilt from scratch**: a session prompt + a
  light artifact feed for today + sidebars for projects and people.
  The current dashboard's Year Rhythm and Category Breakdown widgets
  do not survive (Year Rhythm reappears on Project Detail).
- **The 3-screen stepped onboarding is replaced by a single-page
  scroll** (`OnboardingScroll` in the prototype). The stepped version
  is dropped entirely.
- **The wrap is reached from project/person detail pages** with
  "make a wrap about this" and "make a wrap together" entry points,
  in addition to the global path Spec 71 specifies.

The prototype also explores three navigation taxonomies (`flat`,
`grouped`, `timeline-first`) via a tweaks panel. This spec picks
**flat** as the v1 default and treats the other two as deferred
explorations.

Separately, **file upload** (Spec 50) shipped as a contribution
provider but lands outside this workflow: an uploaded batch becomes
loose artifacts in the timeline with no path into a recap. The
Recap → Record → Wrap model has no first-class place for "I brought a
file of my work — help me sit down with it." This spec closes that
gap: a completed file upload auto-creates a recap session scoped to
that upload, so file upload becomes a way *into* the recap workflow
rather than a side-channel around it.

The work is a full UI + functionality overhaul of the production app
that lands behind the existing unlock gate, identity flow, and
settings (those are unchanged). It supersedes the UI scope of Spec
70 and adds project/person navigation that Spec 71 didn't account
for. The server-side work specified in Spec 70 (artifact
consolidation, `/compose-panel` route, the record table) and Spec
71 (wrap-from-record composition) is consumed wholesale into this
spec's phasing.

## Solution shape

The source of truth for visuals and interactions is the prototype at
`docs/designs/spec70/burrito/project/`. Pixel-match the prototype;
don't redesign. Map each prototype component to the production stack
(Next.js 15 + React 19 + Tailwind + Framer Motion). The prototype
uses inline styles and global CSS — production translates those into
the Mx* primitive system and Tailwind utility classes per the
existing pattern in `src/components/`.

### Surfaces (the nine routes)

| Route | Prototype file | What it is | Notes |
|-------|----------------|------------|-------|
| `/onboarding` | `onboarding.jsx` (`OnboardingScroll`) | Single-page scrolly first-run | Replaces 3-step `Onboarding`. The stepped version is **not** shipped. |
| `/dashboard` (today) | `dashboard.jsx` | Session prompt + today's artifact feed + Projects sidebar + People sidebar | Replaces the current production dashboard entirely. |
| `/session/[id]` (workbench) | `workbench.jsx` (`Workbench`) | Editorial workbench with panel cards | Per-session-id route. |
| `/session/[id]/panel/[pid]` (editor) | `workbench.jsx` (`PanelEditor`) | Full panel edit experience: draft + editable framing + supporting artifacts | Used inline or as a takeover; pick one and stick to it. |
| `/projects` | `explore.jsx` (`ProjectsIndex`) | Grid of project cards | Repo-derived + (later) user-curated. |
| `/projects/[id]` | `explore.jsx` (`ProjectDetail`) | One project's stats, year rhythm, collaborators, record entries scoped to it | "Start a session about [project]" + "make a wrap about this" CTAs. |
| `/people` | `explore.jsx` (`PeopleIndex`) | Grid of collaborator cards | |
| `/people/[handle]` | `explore.jsx` (`PersonDetail`) | One person's overlaps, shared artifacts, shared sessions | "Start a session with [person]" + "make a wrap together" CTAs. |
| `/record` | `explore.jsx` (`RecordView`) | Read-only browse of all locked framings | Renamed from "completed sessions". |
| `/timeline` | `timeline.jsx` (`Timeline`) | Chronological day-by-day with sessioned/unsessioned markers | Clicking any day starts a session for that day. |
| `/sessions` | `timeline.jsx` (`SessionsIndex`) | List of past sessions with their scope and resolution counts | Reachable from the record / timeline. |

The existing **settings**, **unlock gate**, **identity / providers**,
and **wrap viewer** routes are unchanged. The wrap renderer
(`WrapViewer`, slide components) continues to render any wrap object
the same way it does today.

### Navigation (information architecture)

v1 ships the **flat** IA from the prototype:

```
[ today | your record | projects | people ]              [2026 · MAY] [AL]
```

The two other IAs in the prototype (`grouped` with a Record menu;
`timeline-first` with timeline replacing record) are **deferred**.
The tweaks panel that lets users switch them is **not** in
production; it's a prototype-only construct.

Active-state rules:
- `today` active when route is dashboard.
- `your record` active when route is `record`, `timeline`, or
  `sessions`.
- `projects` active when route is `projects` or `project-detail`.
- `people` active when route is `people` or `person-detail`.

### Onboarding — single-page scroll

Ship `OnboardingScroll` from `onboarding.jsx`. The 3-step
`Onboarding` component is dropped — do not port it.

Single page, scrollable, with sections in this order:

1. Hero — "hi. you've arrived." + "burrito is a place to record your
   work — not to be told what's important, but to notice it
   yourself."
2. Two cards side by side — "✎ what we do" (the AI sketches) +
   "your turn" (you author). Same words and treatment as the
   prototype.
3. "before we begin —" with two inputs:
   - Name or handle (text input)
   - What brings you here (4 radio-style buttons: "remember what i
     did", "keep track for reviews", "share work with my team",
     "just curious")
4. "READY ENOUGH" green card — "connect a source when you want.
   nothing happens automatically. nothing leaves your machine until
   you say so."
5. Bottom action bar (sticky) — "SCROLL UP TO REREAD ANYTIME"
   secondary text + primary CTA "open burrito →".

The CTA persists the user's name + `onboardingCompleted: true` to
the local store and routes to `/dashboard`. No "back" affordance —
the user scrolls.

On subsequent app loads, the onboarding is skipped. A "replay
onboarding" entry lives in settings (a small follow-up to add).

### Dashboard

The dashboard is rebuilt. It is **not** the existing
`DashboardShell`. Two columns:

**Left column (1.4fr):**
- Session prompt card (`SessionPrompt` in prototype) — sticky to top.
  - Variant: brand voice; "you had N artifacts on tuesday. when
    you're ready, we can sit down with them."
  - Primary CTA "start a session →" → opens workbench scoped to most
    recent unsession'd day.
  - Secondary "start a session for…" — expands an inline range
    picker with from/to date inputs + "or scope by: 📁 a project /
    👤 a collaborator" chips that link to project/people index for
    selection.
  - "✕ NOT TODAY" dismissal — hides the prompt for the day.
  - If `completedSessions > 0`: dashed-rule footer with "YOU HAVE N
    completed sessions. view →" → links to `/record`.
- Closed-session acknowledgment (`ClosedAcknowledgment`) — shows
  after a session closes, replacing the prompt for that load.
  - Green card; "[day] is in the book." + "nice. two panels locked,
    one skipped."
  - CTAs: "read your record →" + "continue".
- File-upload session prompts (`FileUploadSessionPrompt`) — a stack
  of cards below the day prompt, one per pending (open,
  not-yet-closed) file-upload session. Reuses the `SessionPrompt`
  card treatment (this pattern is new — not in the prototype — so it
  borrows the existing card's visual language). Each card: "you
  imported N artifacts as \"[label]\". when you're ready, we can sit
  down with them." + "open session →" CTA linking to `/session/[id]`
  (the session already exists — this is "open", not "start"). A
  "✕ not now" dismissal suppresses the card for the day via the same
  per-day dismissal mechanism as the day prompt; it does not delete
  the session, which stays reachable from `/sessions`. See "File
  upload as a recap entry point".
- `SectionLabel` "TODAY · [day]" + the today's-artifact feed.
- Today's artifact feed (`ArtifactFeed`): a stack of rows, each row
  is `[kind chip] [title] [source chip] [time]`. Read-only in v1
  (no click-to-detail; that's drill-down in v2). "+ ADD
  CONTRIBUTION MANUALLY" ghost button at bottom routes to the
  existing `ManualInputForm` modal.

**Right column (1fr):**
- `ProjectsSidebar` — paper card. "○ YOUR PROJECTS" label, N count
  in mono. List of project mini-cards, each with label, source
  chip, "N ARTIFACTS · M DAYS". Hover lift. Click → `/projects/[id]`.
  Bottom "+ GROUP YOUR OWN" ghost link → opens curated-project flow
  (cut-listed: drop curated grouping in v1; the link can navigate
  to a stub or be hidden).
- `PeopleSidebar` — cream card. "○ PEOPLE YOU WORKED WITH MOST".
  List of collaborator mini-cards as ink-bordered pills: avatar
  dot + @handle + "N ARTIFACTS TOGETHER".

The **prompt-style tweak** (`card` vs `notebook`) from the prototype
is a prototype-only exploration. Ship the `card` style (default).
The `notebook` variant is deferred.

### Workbench

Pixel-match `Workbench` in `workbench.jsx`.

- Header bar (cream, 2px ink bottom border): section label
  "EDITORIAL WORKBENCH" + display headline of the scope
  (`scope.label` — e.g., "Tuesday, May 14", or "May 10 → May 14",
  or "about frontend/app", or "with @sam", or
  "imported · \"Q1 commits\""). `[N PANELS]` chip.
  Right side: "✕ leave session" ghost button + "X OF Y RESOLVED"
  mono count.
- Body (paper background): grid of `PanelCard`s, `minmax(320px, 1fr)`,
  gap 22px, max-width 1100px. Below the grid, a mono caption: "take
  them in any order. skip what doesn't matter. nothing's written
  until you close the session."
- Action bar (sticky bottom, paper background, ink top border):
  status text "WHEN YOU'RE DONE / ready to seal the day." (or
  "lock at least one panel first." if zero locked). "save for
  later" secondary + "close session →" primary (disabled until ≥ 1
  locked).

`PanelCard` states:
- **pending** (`var(--draft)` background): "PANEL NN · SUBTITLE"
  mono label, title, "[N ITEMS]" chip, `✎ WE SKETCHED THIS` draft
  tag, italic draft framing in quotes, collaborator + project
  chips, "OPEN →" mono link in hot color.
- **locked** (cream background): "● SEALED" tab at top-right (lime
  chip), user's framing as plain text, "REVIEW →".
- **skipped** (paper background, opacity 0.55): "— SKIPPED" tab,
  "set aside." body, "REOPEN →".

The "save for later" CTA is **cut-listed** — drop in v1; "leave
session" is the only exit (with a confirm dialog warning of
unsaved edits). v2 adds true save-for-later (session resumability).

### Panel editor

Pixel-match `PanelEditor` in `workbench.jsx`. Choose **full-screen
takeover** (not a modal) so the writing surface is generous.

- Header (cream, 2px ink bottom border): "← back to session" ghost
  link; "EDITING PANEL" mono label; display headline of panel
  title; chip row: artifact count, collaborator chips, project chip.
- Two-column body (`1.4fr 1fr`, divided by 2px ink rule):
  - **Left (editor)** — paper background.
    - "Our sketch" card (draft tag + italic quote of `draft`),
      `use this →` ghost button that copies draft into the
      textarea and flips `edited = true`.
    - "○ YOUR TURN" / "● YOUR WORDS" indicator (transitions in hot
      on first edit).
    - Textarea — placeholder "rewrite this in your own voice, or
      start fresh. nothing's been saved yet." Visual treatment:
      transitions from italic placeholder-ish to firm Space
      Grotesk medium 19px on first edit; 3px ink shadow appears
      when edited.
    - Char counter (mono, opacity 0.45).
  - **Right (supporting artifacts)** — cream background.
    - "○ SUPPORTING ARTIFACTS" label.
    - Card per artifact: kind chip + source chip + time (mono);
      title in 15px medium; "STATUS · X" + "VIEW ORIGINAL ↗" link
      (opens the original URL in a new tab; safe because we
      already store provider URLs).
- Action bar (sticky bottom): status mono "WRITING IN YOUR VOICE"
  or "USING OUR SKETCH"; "skip this panel" secondary; "lock in
  this panel ✦" primary.

Locking writes a `RecordEntry` to the local-store `record` table,
attaches it to the parent `Session`, marks the panel `locked`, and
returns to the workbench.

### Projects (index + detail)

Pixel-match `ProjectsIndex` and `ProjectDetail` in `explore.jsx`.

**Index**:
- Header: "○ PROJECTS · THINGS YOU'VE WORKED ON" + display
  headline + supporting prose. "+ group your own" button
  (cut-listed for v1; render as disabled if not built, or hide).
- Grid of project cards (`minmax(300px, 1fr)`, gap 22px). Card
  background differs by source: cream for repo-derived,
  `accent3` for curated.
- Card contents: "GROUPED BY YOU" or "SUGGESTED FROM REPO" mono
  label, status chip, project label as display headline, blurb,
  divided footer with big numerals (artifacts, days), "OPEN →"
  link.

**Detail**:
- Back link "← all projects".
- Ghost numeral (the first 2 chars of artifact count, 260px,
  opacity 0.06).
- "/ GROUPED BY YOU" or "/ SUGGESTED FROM REPO" mono label.
- Status chip.
- Project label as 96px display headline.
- Blurb prose.
- CTA row: "start a session about [project] →" primary (this is
  a project-scoped session — the workbench opens with that
  scope). "make a wrap about this" — **defer to v2 (Spec 71
  extension)**. "rename" and "merge into…" — **cut-listed in v1**;
  render as ghost links if needed but they're no-ops or hidden.
- 4-cell stat band: artifacts, days touched, people also here,
  locked panels.
- Two-column body:
  - Left: "FROM YOUR RECORD · [project]" card showing the
    record entries scoped to this project.
  - Right: "YEAR RHYTHM" card (the bar chart the current
    production dashboard has — survives here, on the project
    detail page); "ALSO HERE" card listing collaborators on this
    project with shared artifact counts.

### People (index + detail)

Pixel-match `PeopleIndex` and `PersonDetail` in `explore.jsx`.

**Index**:
- "○ PEOPLE · WHO YOU WORKED WITH" + display headline "people
  you worked with most." + supporting prose ("not 'top
  collaborators' — just the people whose names showed up
  alongside yours…").
- Grid of person cards: avatar dot + @handle + overlap count +
  one-line context ("you've overlapped on N MRs and M issues
  this year, mostly in [project]."). "OPEN →".

**Detail**:
- Back link "← all people".
- Big avatar (96×96, 28px initials, person's accent color
  background) + "/ PEOPLE" mono label + 84px display headline
  @handle.
- Supporting prose.
- CTA row: "start a session with [person] →" primary (this is
  a person-scoped session). "make a wrap together" — **defer to
  v2**.
- 3-cell stat band: shared artifacts, reviews exchanged, projects
  in common.
- "WHEN YOU OVERLAPPED" card — list of dated overlap moments
  with one-line descriptions.

### Record view

Pixel-match `RecordView` in `explore.jsx`.

- "○ YOUR RECORD · 2026" mono label.
- Display headline "your record."
- Supporting prose ("everything you've sealed in a session, in
  your own words. nothing here is from us.").
- Stack of record entry cards. Each card: day mono, project chip,
  artifact count chip, then the user's framing as 19px medium
  prose in quotes. The most recent gets a lime background; others
  get cream.
- No filters in v1; no edit; no delete. Read-only.

### Timeline

Pixel-match `Timeline` in `timeline.jsx`.

- Header: "○ TIMELINE · 2026" + display headline + supporting prose.
- Right-side filter chips: "ALL", "SESSIONED", repo names,
  person handles. v1 ships only "ALL" and "SESSIONED" toggles;
  repo and person filters are **cut-listed** (defer to v2).
- Vertical rule with day cards stacked. Each row:
  - Left: date label outside the rule (weekday + day number).
  - Marker on the rule: hot for sessioned, cream for has-artifacts-
    unsessioned, paper for quiet day.
  - Card to the right:
    - **Sessioned**: cream card with "● SEALED" chip, project
      chip, "X OF Y LOCKED" mono, "REVIEW →"; below, the user's
      framing in quotes. Click → workbench (read-only) or record
      detail (v2). v1: route to `/record` (anchored to that day
      ideally — or just `/record` if anchoring is too much work).
  - **Has artifacts, unsealed**: paper card showing artifact
    count and "sit down with this day →" button (starts a
    session for that day).
  - **Quiet day**: mono caption "QUIET DAY — NOTHING TO LOOK
    AT", opacity 0.45.

Weekends are dimmed (opacity 0.4).

### Sessions index

Pixel-match `SessionsIndex` in `timeline.jsx`.

- "○ PAST SESSIONS" + display headline + supporting prose.
- Card per session: mono session id + display date + scope chip
  ("DAY" / "RANGE" / "PROJECT" / "PERSON" / "FILE UPLOAD") + "N
  LOCKED" / "M SKIPPED" chips + "OPEN →".
- Click → routes to that session's read-only view (v1: same
  destination as `/record` filtered to that session — or just
  `/record` if filtering is too much work).

### File upload as a recap entry point

Spec 50 shipped the file-upload provider: the user uploads a text
file, the server extracts contributions, and (with the Spec 50 review
step) the user confirms dates and details in a modal before the rows
land encrypted on the device. Today those rows simply join the
`contributions` pool and become loose artifacts. This spec makes file
upload a **first-class recap entry point**.

In the Recap → Record → Wrap model, file upload is a means of **recap
only**: its job is to hand the user a batch of work to sit down with.
It is not a wrap entry point and not a timeline backfill.

**Auto-created session on upload completion.** When a file-upload
import completes — the user has confirmed the Spec 50 review modal and
the rows are persisted — the client auto-creates a `Session` scoped to
that upload. The session is created **open** (panels pending), never
closed: the upload's job is to produce something to recap; the recap
itself stays the user's to do. If an upload adds **zero** new
artifacts (every row was a duplicate — `added === 0`), no session is
created; the existing "all duplicates" import result is surfaced
instead. Nothing to recap, no empty session.

**One session per upload event.** Each upload creates exactly one
file-upload session, keyed by a per-upload `uploadId` (the import
queue item's id). Re-uploading under the same label still appends to
the same file-upload *identity* (Spec 50 behaviour — unchanged) but
creates a *new* session: each batch is its own sit-down.

**Sessions per client per day.** A day has at most **one** day-scoped
session — `SessionScope` of kind `day` is keyed by date, so two
sessions for the same day cannot exist. File-upload sessions are
**unbounded** per day: three uploads in a day yield three file-upload
sessions. So a client's sessions for a given day are: one day session
(if started) plus zero-or-more file-upload sessions.

**No double-counting between the day session and file-upload
sessions.** A file-upload session's artifacts are exactly the rows
that upload produced; its panels reference those artifact ids
directly. The day-scoped collection logic in
`src/lib/sensemaking/collections.ts` **excludes** file-upload
artifacts — even when an imported row's `occurredAt` is today (the
Spec 50 review step auto-dates undated rows to the upload day), it
belongs to its file-upload session, not the day session. The day
session draws only from the daily recording: synced + manual
artifacts. The collection filter keys this off the artifact's
identity provider — rows whose identity has
`providerId === 'file-upload'` are visible only to their own
file-upload session.

**Orchestrator change.** `importIntoIdentity` currently returns
`{ added, skippedExisting, rejectedRows }`. To build the auto-created
session's panels it must also return the **ids of the newly-added
contributions** (`addedIds: string[]`). The session-creation helper
(`createSessionFromUpload` in `src/lib/sensemaking/session.ts`) takes
those ids, runs the same panel extractor used for every other scope,
and writes the `Session` to the encrypted `sessions` table. The hook
fires from the import queue (`ImportQueueContext`) on the `complete`
transition, after the existing query-cache invalidation.

**Workbench.** A file-upload session opens the same workbench as any
other scope. Its `scopeLabel` is `imported · "[label]"` (e.g.
`imported · "Q1 commits from work laptop"`). Panel extraction is
unchanged: `by-repo` grouping when the upload produced > 5 artifacts,
a single `all-of-day`-style panel otherwise.

**Surfacing.** Pending file-upload sessions surface as a stack of
prompt cards on the dashboard (see "Dashboard" above) and in
`/sessions` with a `FILE UPLOAD` scope chip. The timeline
(`/timeline`) stays day-recording-focused — a file-upload session is
not a day, so it gets no timeline row in v1; a marker on the upload
day is a v2 follow-up.

### Data shape (replaces + supersedes Spec 70's shape)

```ts
// shared/src/types.ts

export type ArtifactKind = "merge_request" | "issue" | "doc" | "manual";
export type ArtifactSource = "gitlab" | "github" | "linear" | "notion" | "manual";

export interface Artifact {
  id: string;
  kind: ArtifactKind;
  title: string;
  url?: string;
  source: ArtifactSource;
  project: string;            // repo path or curated-project id
  collaborators: string[];    // @handles
  occurredAt: string;         // ISO timestamp
  resolvedAt: string | null;
  status: string;             // "merged" | "in-review" | "open" | "draft" | "noted" | ...
  eventCount: number;         // consolidated event count
}

export type PanelState = "pending" | "locked" | "skipped";
export type PanelKind = "by-repo" | "by-day" | "by-collaborator" | "all-of-day";

export interface SessionPanel {
  id: string;
  kind: PanelKind;
  title: string;
  subtitle: string;
  draftFraming: string;
  userFraming: string;        // empty until locked
  state: PanelState;
  artifactIds: string[];
  collaborators: string[];
  project: string | null;
}

export type SessionScope =
  | { kind: "day"; date: string }
  | { kind: "range"; from: string; to: string }
  | { kind: "project"; projectId: string }
  | { kind: "person"; handle: string }
  // file-upload sessions (Spec 50 + this spec): one per upload event.
  // uploadId is unique per upload (the import-queue item id);
  // identityId ties back to the Spec 50 file-upload identity for
  // disconnect semantics; label is the user's batch label.
  | { kind: "file-upload"; uploadId: string; identityId: string; label: string };

export interface Session {
  id: string;
  scope: SessionScope;
  scopeLabel: string;         // human-readable; derived but stored
  startedAt: string;
  closedAt: string | null;
  panels: SessionPanel[];
}

export interface RecordEntry {
  id: string;
  sessionId: string;
  scope: SessionScope;
  scopeLabel: string;
  panelKind: PanelKind;
  panelTitle: string;
  framing: string;
  artifactIds: string[];
  project: string | null;
  collaborators: string[];
  lockedAt: string;
}

export interface Project {
  id: string;
  label: string;
  source: "repo" | "curated"; // v1: only "repo" is populated
  artifactIds: string[];      // derived, recomputed
  status: "ongoing" | "sometimes" | "archived";
  blurb: string | null;
}

export interface Collaborator {
  handle: string;
  initials: string;
  color: string;              // CSS color from palette
  artifactIds: string[];      // derived, recomputed
}
```

Persisted encrypted in new Dexie tables: `sessions`, `record`. The
existing `contributions` table stores raw provider events; `Artifact`
is a read-time view over it. `Project` and `Collaborator` are
derived (not persisted in v1).

### Compose-panel server route (from Spec 70)

The synchronous `POST /compose-panel` route from Spec 70 is consumed
into this spec unchanged. Two modes:

- `draft`: panel summary → 2–4 sentence factual framing.
- `lock`: user's framing → minimally polished `framingFinal` for
  the record (light typo + flow only; substance preserved).

Forbidden-phrase guard, fallback to deterministic phrasing,
PRIVACY banner, no logging of bodies — all per Spec 70.

### Wrap entry points (from Spec 71, deferred to v2)

The prototype shows "make a wrap about this" on ProjectDetail and
"make a wrap together" on PersonDetail. In **v1 (this spec)**, these
buttons are **rendered as visible but disabled with a "soon" mono
tag**, or hidden entirely — pick one and apply consistently across
both surfaces. They don't navigate.

In v2 (Spec 71 evolution), these become first-class wrap creation
entry points alongside the global "Make a wrap" path.

### Cleanup: tasks/README.md merge marker

`tasks/README.md` line 121 currently has a leftover merge marker
`>>>>>>> 7329645 (docs: shape Specs 60 + 61 ...)` from the merge
of the earlier shaping branch. This must be removed as part of PR
1 of this spec; the file should end cleanly without conflict
markers.

## Rabbit holes

- **Don't ship the tweaks panel** (`tweaks-panel.jsx`, `app.jsx` →
  `TweaksPanel`). It's a prototype-only construct for exploring IA
  modes, onboarding styles, and prompt styles. Production picks one
  of each and ships it.
- **Don't ship the 3-step onboarding.** Drop `Onboarding`; ship
  `OnboardingScroll`. If you find yourself porting the `ScreenA`,
  `ScreenB`, `ScreenC` components, you've drifted.
- **Don't ship the `grouped` or `timeline-first` IA modes.** Ship
  `flat`. The other IAs are deferred design explorations, not
  options at runtime.
- **Don't ship the `notebook` prompt variant.** Ship the `card`
  variant.
- **Don't try to migrate the provider-event store.** Artifact is a
  read-time view; the provider keeps writing events as today.
- **Don't add new providers in this spec.** GitLab + manual stay
  the only sources. The prototype shows GitHub, Linear, Notion as
  source chips — those are fixture-only. The data model declares
  them for future use; v1 doesn't surface non-existent providers.
- **Don't build curated projects in v1.** The "+ group your own"
  button on the projects sidebar / projects index is a cut-listed
  affordance. Render disabled or hide. v2 adds curated grouping
  with naming, merging, and renaming.
- **Don't build the wrap entry points on project/person detail.**
  "make a wrap about this" and "make a wrap together" are
  disabled-with-soon-tag in v1; v2 (Spec 71 evolution) wires them.
- **Don't change the existing `WrapViewer` or slide components.**
  The wrap renderer continues to render wrap objects exactly as
  today.
- **Don't change the unlock gate or identity / provider setup
  flow.** Those are out of scope. The new dashboard mounts behind
  them.
- **Don't preserve the existing dashboard's Year Rhythm or
  Category Breakdown widgets on the new dashboard.** Year Rhythm
  reappears on Project Detail; Category Breakdown is dropped in
  v1 (no replacement; the new dashboard is intentionally calmer).
- **Don't ship "save for later" in the workbench.** The button
  exists in the prototype but session resumability is deferred to
  v2. v1: "leave session" is the only exit, with a browser-confirm
  warning of unsaved edits.
- **Don't build per-day anchored deep links** in the record /
  timeline. Clicking a sessioned day from the timeline can route
  to `/record` without scrolling to that day. v2 adds anchored
  deep linking.
- **Don't build curated-project rename / merge UIs.** Hidden or
  ghost-disabled.
- **Don't surface forbidden phrases anywhere.** Use the same
  copy-lint check as Spec 70.
- **Don't merge a file upload's artifacts into the day session.**
  File-upload artifacts belong to their own file-upload session only.
  The day-scope collection must filter them out by identity provider —
  see "File upload as a recap entry point". A row auto-dated to today
  by the Spec 50 review step is the trap: it looks like a "today"
  artifact but is not part of the daily recording.
- **Don't auto-close the file-upload session.** It is created open,
  with pending panels. The user does the recap; the upload only hands
  them the batch.
- **Don't create a session for an upload that added zero artifacts.**
  If every extracted row was a duplicate (`added === 0`) there is
  nothing to recap — surface the existing import result, create no
  session.
- **Don't reuse one session across re-uploads of the same label.**
  Same identity, yes (Spec 50 behaviour); same session, no. Each
  upload event is its own session keyed by `uploadId`.
- **Don't give file-upload sessions a timeline row.** The timeline is
  the day-by-day recording view. File-upload sessions live on the
  dashboard prompt stack and in `/sessions` only.

## No-gos

- **No conversational chat mode** (Mode B from earlier shaping).
- **No reliability scoring on extraction.**
- **No mid-session resumability.**
- **No multi-year memory** or cross-session continuity.
- **No removal of the existing wrap viewer route or any wrap
  rendering code.** Composer (Spec 30) and shareable wraps (Spec
  31) continue to consume wrap objects.
- **No changes to the existing settings / identities /
  passphrase flows.** They mount untouched.
- **No removal of the `/wrap` enqueue path** from server. Spec 71
  retires it; this spec does not.
- **No telemetry on session edit/lock/skip patterns** or on
  navigation between surfaces.
- **No "highlights" / "top" / "best" / "most impactful" /
  "key contributions" copy anywhere.** Enforced by the shared
  copy-lint.
- **No server-side persistence of sessions or record entries.**
  All session and record state is client-side, encrypted.
- **No new local-store encryption layer.** Reuse the existing
  envelope encryption.
- **No new wrap renderer.** The existing one stays.
- **No server-side creation of file-upload sessions.** The session is
  created client-side and written to the encrypted `sessions` table,
  exactly like every other session. The Spec 50 `/import` route is
  unchanged — it still returns extracted rows and nothing else.
- **No making file upload a wrap entry point.** File upload feeds the
  recap. The wrap continues to read from the record (Spec 71). There
  is no "make a wrap from this upload" affordance.
- **No file-upload backfill of the day timeline.** Imported artifacts
  do not appear in the dashboard's today artifact feed or in the
  day-scoped session.

## Verification

Functional — onboarding:
- First-run install routes to `/onboarding`, renders the
  scrolly single-page version.
- Filling in name + selecting a "why" reason, clicking "open
  burrito" persists both to local store and routes to
  `/dashboard`.
- Second app load routes directly to `/dashboard`; onboarding does
  not re-render.

Functional — dashboard:
- Session prompt renders with correct artifact count for the most
  recent unsession'd day.
- "Start a session →" routes to a fresh workbench scoped to that
  day with consolidated artifacts.
- "Start a session for…" expands the range picker; valid range
  routes to a range-scoped workbench.
- "Project" and "Collaborator" chips inside the expanded picker
  route to `/projects` and `/people` respectively.
- "✕ NOT TODAY" hides the prompt and persists the dismissal
  (per-day).
- After a session closes, the dashboard renders the
  `ClosedAcknowledgment` card; on reload it reverts to the
  session prompt for the next unsession'd day.
- ProjectsSidebar lists projects with correct artifact + days
  counts; click → `/projects/[id]`.
- PeopleSidebar lists collaborators with correct overlap counts;
  click → `/people/[handle]`.

Functional — workbench + panel editor:
- Workbench renders 1–3 panel cards from the panel extractor
  (`by-repo` grouping for days with > 5 artifacts; `all-of-day`
  for ≤ 5; analogous for range / project / person scopes).
- Opening a pending card routes to the panel editor.
- Editor renders the draft as italic placeholder; first keystroke
  flips visual treatment to "YOUR WORDS" with hot indicator.
- "use this →" copies draft into the textarea.
- "lock in this panel ✦" writes a `RecordEntry`, marks the panel
  `locked`, returns to workbench.
- "skip this panel" marks `skipped`, returns to workbench.
- "close session →" disabled until ≥ 1 locked; enabled with the
  right status text; closes session, navigates to dashboard with
  `ClosedAcknowledgment` showing.
- "leave session" exits without closing; browser-confirm warns of
  unsaved edits.

Functional — projects + people:
- `/projects` renders all repo-derived projects with stats from
  the consolidation layer.
- `/projects/[id]` renders the project detail with year rhythm,
  collaborators list, scoped record entries.
- "start a session about [project] →" opens workbench with
  project-scoped collection.
- `/people` renders all collaborators with overlap-based stats.
- `/people/[handle]` renders the person detail.
- "start a session with [person] →" opens workbench with
  person-scoped collection.
- "make a wrap about this" / "make a wrap together" buttons are
  rendered with a "soon" indicator (or hidden — pick one) and do
  not navigate.

Functional — record / timeline / sessions:
- `/record` lists every `RecordEntry` ordered most-recent-first.
- `/timeline` renders the chronological day list with the correct
  marker states (sessioned / has-artifacts / quiet).
- Clicking an unsealed day with artifacts → starts a session for
  that day.
- Clicking a sealed day → routes to `/record`.
- `/sessions` lists all closed sessions with their resolution
  counts.

Functional — file upload as recap:
- Completing a file-upload import (Spec 50 modal → review step →
  confirm) auto-creates one open `Session` of scope kind
  `file-upload`, with panels extracted from exactly the rows that
  upload added.
- An import that adds zero new artifacts (all duplicates) creates no
  session.
- Re-uploading under an existing label creates a new, separate
  file-upload session (same identity, new `uploadId`).
- The day-scoped session for the upload day does not include any
  file-upload artifacts, including rows auto-dated to today by the
  review step.
- The dashboard renders one `FileUploadSessionPrompt` card per
  pending file-upload session; "open session →" routes to that
  session's workbench; "✕ not now" suppresses the card for the day
  without deleting the session.
- `/sessions` lists file-upload sessions with the `FILE UPLOAD` scope
  chip; the workbench header for one reads `imported · "[label]"`.
- Locking a panel in a file-upload session writes a `RecordEntry`
  the same as any other session; it appears in `/record`.

Privacy invariants (extend the existing suites):
- All new client modules under `src/components/session/`,
  `src/components/dashboard/`, `src/components/onboarding/`,
  `src/components/projects/`, `src/components/people/`,
  `src/components/record/`, `src/components/timeline/`, and
  `src/lib/sensemaking/` may not import server-only env vars.
- `src/lib/sensemaking/**` continues to be the only client area
  permitted to bridge `src/lib/local-store/**` and
  `src/lib/ai/**`.
- The `/compose-panel` request body Zod continues to reject
  identifier fields.
- The copy-lint static test scans every new module's user-facing
  strings; presence of any banned phrase fails CI.
- `server/src/functions/composePanel.ts` carries the PRIVACY
  banner. No bodies, no prompts, no framings logged.
- The new `record` Dexie table writes encrypted; raw IndexedDB
  inspection shows opaque rows (extend the existing encryption
  e2e test to assert this).

Operational:
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`
  green.
- `cd server && pnpm typecheck && pnpm test` green.
- Demo-mode seed routes a fresh user through onboarding → seeded
  dashboard with today's artifacts → session → closed session →
  record entry visible in `/record` and in `/projects/[id]` and
  `/people/[handle]`.
- The merge marker in `tasks/README.md` is gone.

## Notes

### Phasing (recommended PR sequence)

Five PRs. Each merge-ready on its own. If appetite slips, the
order is the cut order — earlier PRs ship for demo even without
later ones.

1. **PR 1 (Day 1)**: Foundation + cleanup.
   - Remove the merge marker in `tasks/README.md`.
   - Add `shared/src/types.ts` additions (Artifact, SessionPanel,
     Session, RecordEntry, Project, Collaborator).
   - Add Zod schemas in `shared/src/schemas.ts`.
   - Add `src/lib/sensemaking/{consolidate, collections, panels,
     session}.ts` from Spec 70.
   - Add the new Dexie tables (`sessions`, `record`).
   - Server: add `/compose-panel` route from Spec 70.
   - No UI yet. Tests cover the data layer.

2. **PR 2 (Day 2)**: Onboarding (scroll) + new dashboard.
   - `src/components/onboarding/OnboardingJourney.tsx` —
     single-page scroll, copy from prototype.
   - `src/app/onboarding/page.tsx` route.
   - `src/components/dashboard/DashboardShell.tsx` replaced:
     two-column layout with SessionPrompt, ArtifactFeed,
     ProjectsSidebar, PeopleSidebar.
   - Removes the old Year Rhythm + Category Breakdown
     components from the dashboard (don't delete the files yet
     — they live on for Project Detail).
   - Wires "✕ NOT TODAY" dismissal + per-day persistence.

3. **PR 3 (Day 3)**: Workbench + panel editor.
   - `src/components/session/SessionWorkbench.tsx`,
     `PanelCard.tsx`, `PanelEditor.tsx`.
   - Routes `/session/[id]` and `/session/[id]/panel/[pid]`.
   - Wires draft fan-out on session open, locking, skipping,
     closing.
   - Existing `ManualInputForm` reachable from dashboard's
     artifact feed unchanged.

4. **PR 4 (Day 4–5)**: Projects + people + record.
   - `src/components/projects/{ProjectsIndex, ProjectDetail}.tsx`
     with routes `/projects` and `/projects/[id]`.
   - `src/components/people/{PeopleIndex, PersonDetail}.tsx`
     with routes `/people` and `/people/[handle]`.
   - `src/components/record/RecordView.tsx` with route
     `/record`.
   - Project Detail's Year Rhythm reuses the existing widget
     code from the prior dashboard.
   - "start a session about / with [...]" CTAs wire to the
     workbench with the right scope kind.
   - "make a wrap…" CTAs render with "soon" indicator.

5. **PR 5 (Day 5–6)**: Timeline + sessions index + nav + polish.
   - `src/components/timeline/Timeline.tsx` and
     `SessionsIndex.tsx` with routes `/timeline` and `/sessions`.
   - Top nav (`TopNav`) updated with flat IA: today / your
     record / projects / people. Active-state rules per spec.
   - Demo-mode seed updated (5–10 days of recent artifacts,
     fixtures across 2–3 repos + 2–3 collaborators).
   - Copy-lint test extended to cover all new modules.
   - Privacy-invariants test extended.
   - Playwright e2e covering: onboarding → session → close →
     record → projects → people → timeline.
   - Mark spec done in this PR.

The `## Done` block + index update + changelog entry land on PR 5.

**File-upload-as-recap placement.** The `file-upload` `SessionScope`
variant + its Zod schema and the day-scope collection-exclusion filter
land in PR 1 with the rest of the data layer. The auto-session hook
(`createSessionFromUpload`, the `ImportQueueContext` wiring, the
`importIntoIdentity` `addedIds` change), the workbench `scopeLabel`,
and the dashboard `FileUploadSessionPrompt` stack land in PR 3 with
the session machinery. The `/sessions` `FILE UPLOAD` chip lands in
PR 5 polish.

### Cut-list if appetite blows out

In order:

1. Drop the timeline filter chips (ALL/SESSIONED stays; project
   and person filters drop).
2. Drop `/sessions` entirely (record view is enough; sessions
   index becomes v2).
3. Drop person detail's "WHEN YOU OVERLAPPED" listing (v2; the
   stats stay).
4. Drop project detail's stat band (the "FROM YOUR RECORD" and
   "YEAR RHYTHM" panels stay; collapse stats inline).
5. Drop the range-session UI (day-scoped sessions only). The
   "Start a session for…" disclosure collapses to just the
   project/person chips.
6. Drop the `ClosedAcknowledgment` card on the dashboard. Use a
   simple toast instead.
7. Drop the dashboard's PeopleSidebar (Projects sidebar stays).
8. Reduce the workbench grid to single-column on the
   `< 1100px` breakpoint and accept it on desktop too.

If by end of Day 4 PR 3 isn't merge-ready, ship onboarding +
dashboard only as a "preview" build and follow up with the rest.

### Relationship to Specs 50, 70 and 71

- **Spec 50** (file-upload contribution provider): shipped and
  `Done`. This spec consumes it as the recap entry point described in
  "File upload as a recap entry point" — a completed upload
  auto-creates a file-upload-scoped session. The only change Spec 50's
  code needs is `importIntoIdentity` returning `addedIds`; the
  `/import` route, the provider, and the review step are otherwise
  untouched. Spec 50's spec file carries a forward-reference note
  under its `Notes`.
- **Spec 70** (interactive sense-making v0): UI scope is fully
  superseded by Spec 72. Data and server scope (Artifact type,
  consolidation logic, `/compose-panel` route, the record table,
  forbidden-phrase guard) is **consumed wholesale** into Spec 72's
  PR 1 + PR 3. The PR sequence and verification criteria in Spec
  70 are no longer the source of truth; Spec 72 is.
  - After Spec 72 ships, Spec 70 should be marked
    `Superseded by Spec 72` in its Status line and in the
    `tasks/README.md` index. Do not delete the file — keep it as
    a record of the shaping conversation.
- **Spec 71** (wrap from the record): the wrap-from-record path
  remains the v1 wrap path. Spec 72 doesn't implement Spec 71's
  composition UI — it only adds the entry points from
  `ProjectDetail` and `PersonDetail` as disabled-soon affordances.
  Spec 71 evolves in a subsequent spec to wire them up.

### IA decision is open

The prototype's tweaks panel surfaces three IA taxonomies:

- `flat`: today / your record / projects / people  (Spec 72 ships this)
- `grouped`: today / record ▾ / projects / people
- `timeline-first`: today / timeline / projects / people

Spec 72 picks `flat` as the v1 default. The other two stay as
visual exploration. If post-ship user testing surfaces issues
with discoverability of timeline/sessions under `flat`, a
follow-up spec revisits.

### Visual fidelity

The prototype uses inline styles + a single global CSS. Production
should translate this into Tailwind utilities + the Mx* primitive
system per `src/components/`, **not** preserve the prototype's
internal structure. Match the visual output (colors, spacing,
typography, motion). The values in the prototype's `styles.css`
should be cross-referenced with `tasks/design-system-reference.md`;
where they differ, the design-system reference (which describes
the live codebase) wins for tokens, and the prototype wins for
new patterns.

### Open questions

- **Onboarding "what brings you here" answer — what do we do with
  it?** The prototype captures it but never reads it. v1: persist
  to local store as part of the user profile; do not use it to
  vary the experience. v2: consider tailoring copy or session
  suggestions based on it.
- **Curated projects ("+ group your own")**: deferred to v2 but
  the data model declares `source: "repo" | "curated"`. The
  curation UX (naming, picking artifacts, merging across repos)
  is its own design conversation.
- **What happens when a user has zero artifacts at all?** v1:
  the dashboard's session prompt shows a calm empty state
  ("we haven't seen any artifacts yet. connect a source in
  settings, or add one by hand."). Implementation lives in
  `SessionPrompt`'s empty branch.

### Reshaping history

- **2026-05-21** — added "File upload as a recap entry point". File
  upload (Spec 50) was previously disconnected from the
  Recap → Record → Wrap workflow; uploaded rows were loose artifacts.
  The reshape makes a completed upload auto-create an open,
  file-upload-scoped recap session, adds the `file-upload`
  `SessionScope` variant, and establishes the "one day session +
  N file-upload sessions per day" model with no double-counting
  between them. Incremental on top of the existing five-PR plan —
  see "File-upload-as-recap placement" under Phasing.

### Out-of-scope follow-ups (parking lot)

- File-upload session markers on the day-by-day timeline (v1 keeps
  file-upload sessions off the timeline; they surface on the
  dashboard prompt stack and in `/sessions` only).
- Auto-creating the day session (it stays user-initiated; only
  file-upload sessions auto-create on completion).
- Curated project grouping (naming, merging, renaming).
- Person-detail "make a wrap together" — wire to Spec 71-evolved
  wrap path.
- Project-detail "make a wrap about this" — wire to Spec 71-evolved
  wrap path.
- The `grouped` and `timeline-first` IA modes.
- The `notebook` prompt style.
- Mid-session resumability.
- Anchored deep links in the record / timeline.
- Drill-down from the dashboard artifact feed to an artifact
  detail view.
- Per-artifact edit / delete (the artifact feed is read-only).
- Multi-year memory.
- Reliability scoring on extraction.
- Browseable session detail (read-only view of a specific past
  session beyond what `/record` filtered shows).
- A "Make a wrap" global affordance — the wrap is reached only
  through project/person CTAs in v1; a global entry is a v2
  question (the existing global wrap is already reachable via
  the wrap viewer for legacy wraps).
