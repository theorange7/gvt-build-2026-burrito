# Design note — Interactive sense-making

**Status**: Direction agreed; Spec 60 (v0) drafted, Spec 61 (v1 wrap) drafted
**Last updated**: 2026-05-16

This is a **design note**, not a shaped spec. It captures the direction
agreed across a sequence of brainstorm rounds, the load-bearing
decisions that inform Specs 60 and 61, and the open questions deferred
further. Specs in this initiative should cite back to this note.

## Why this exists

UAT against the original 10-slice fan-out wrap generator surfaced a
trust-collapse pattern: even before generation runs, users encountered a
contribution timeline of 2000+ raw GitLab signals that were duplicated,
misclassified, and unreadable on their own. The novelty of the recap
faded; healthy skepticism took its place.

The deeper diagnosis: the original architecture quietly authors a
narrative on the user's behalf. The AI picks slices, fills them, and
hands the user a finished story. That inverts the brand voice
("recording tool first, AI narrative is a starting point"). Users sense
this misalignment even when the copy denies it.

## Identity decision

Burrito is **a recording tool with AI assistance**, not an AI tool with
recording assistance. The AI's job is to help the user notice and
contextualize. The user is the author of their own record.

Operational implications:

- The original 10-slice fan-out as a generator over raw signals is the
  wrong primary path.
- The contribution timeline changes role: reference material the user
  dips into during a session, not a step to clear before generation
  runs.
- The "human judge" interaction is **absorbed into the session** — there
  is no separate "review the timeline, then click generate" step.
- The wrap remains as a shareable output artifact (fun, delightful,
  something a user can share with their manager) but becomes the
  **byproduct of accumulated user sense-making**, not the **output of a
  one-shot generator over raw signals**.

## Reframe: Burrito as an evaluation system that assists the user

A useful way to think about this: Burrito is an eval system, and the
evaluation runs on the system itself, never on the user's work.

Two evaluation jobs, both with the user as ground truth:

1. **Eval on extraction** — is the parse trustworthy? Did we consolidate
   events into artifacts correctly? Is the classification right?
2. **Eval on interpretation** — did we surface the right groupings? Did
   we sketch a framing the user can edit into truth?

The user is the grader in both. They are **never** the subject being
evaluated.

This resolves the philosophical tension between "don't judge the user"
and "must select a subset of signals." Selection is judgment — but if
it's judgment of *our extraction quality*, not of *the user's work
quality*, it's brand-safe.

## The session as the primary experience

A session is a small, bounded reflection ritual. It works on a
**collection of artifacts**. The default collection is one day's
worth; the user can also start a session against a custom date range.

Inside a session, the user uses an **editorial workbench** (Mode C from
the brainstorm). The system proposes 1–3 panels grouped by simple rules
(by repo within the day, or a single panel if the day's set is small).
Each panel has a draft framing the AI has sketched; the user edits in
their own voice, then locks the panel in (or skips it). When the user
closes the session, locked framings persist to **the record** — a
growing journal of reflected work.

This is the **main experience** of using Burrito. It's a journaling
cadence: open the app, see yesterday's prompt, sit down with it for a
few minutes, close.

### Why sessions, not one big year-end pass

- A day's artifacts is 5–15 items, not 2000. The trust collapse we
  were architecting around mostly evaporates at this scope.
- The cadence matches the recording-tool identity: you record
  continuously, you reflect regularly, you celebrate when there's
  something to celebrate.
- Each session's LLM call count is modest (1–3 draft framings, not
  10–20 slice generations). Latency, cost, and prompt coherence all
  improve.
- A user's annotated history grows over time. It becomes browseable,
  searchable, and — eventually — the substrate the wrap composes from.

### Range sessions

The user can also initiate a session against an arbitrary date range
via a "Start a session for…" affordance. The workbench shape is the
same; the artifact collection is bigger. This is how a user might
catch up on a quarter, or focus on a specific project's window.

Range sessions handle the "I want to reflect on April" use case without
needing a different UX. The cap-and-group rules in the panel extractor
keep the workbench scannable even for larger collections.

## The wrap as a distinct, user-initiated action

The wrap is **decoupled** from the session. It remains a shareable,
delightful artifact — something a user can hand to their manager or
post proudly. But it is **not** the goal of a session.

The user invokes "Make a wrap" as a separate action, ideally after a
meaningful amount of sense-making has accumulated in the record.

For v0 (Spec 60): the existing year-end fan-out path remains, untouched.
Demo day uses this as the wrap surface. v0 does not add a new wrap
path.

For v1 (Spec 61): a new wrap composition path reads from the record,
composing slices from accumulated session framings. The user picks a
date range and (optionally) curates which session framings make it in.
The visual format of the wrap (`WrapViewer`, slide components) stays
the same. Composer (Spec 30) is unaffected.

## Three artifact sources

An **artifact** is the unit a session works on. Artifacts have three
sources:

- **Sync** — from connected providers (GitLab today, GitHub and others
  later). Events are consolidated into artifacts at read time.
- **File upload** — via the existing Spec 50 (file-upload contribution
  provider). Each upload yields one or more artifacts.
- **Manual input** — via the existing `src/components/dashboard/
  manual-input-form` component. User types in artifacts that didn't
  come from any provider.

v0 (Spec 60) is GitLab-only. The other sources are already shaped in
their own specs; integration with the session experience comes as part
of those specs' delivery or in follow-up work.

A future v1+ feature ("add an artifact during a session") could let the
user type directly into the workbench. Out of scope for now.

## Data layers

The data substrate now has three explicit layers:

- **L0 — Raw provider events** (immutable, audit trail). Provider
  writes; nobody else.
- **L1 — Consolidated artifacts** (read-time grouping, in-memory in
  v0). Events for one merge request collapse into one artifact with a
  lifecycle.
- **L2 — The record**. Locked framings from sessions, indexed by
  session, scope, and the artifacts they cover. The user's own words
  attached to groupings of artifacts. Persisted encrypted in the local
  store.

L2 is what the v1 wrap composes from. L2 is what a user might browse
later ("what did I say about April?"). It's effectively a journal.

A future layer (call it L3 — narrative-ready units) would represent
wrap-side curation on top of L2: the user picks which record entries
contribute to a wrap. v1 (Spec 61) introduces this as a transient
shape, not yet a persisted layer.

A future eval layer (reliability scores on extraction, golden sets,
classification confidence) is deferred until after Spec 60 ships and
we have real signal about where extraction errors land.

## Onboarding journey

A "soul.md"-style guided sequence runs once per install. Establishes:

- What Burrito is — a recording tool, your AI assistant for reflection.
- What it isn't — a verdict, a manager-grade evaluation, a highlight
  reel chosen by an algorithm.
- What the AI's job is — notice, contextualize, draft language for you
  to edit.
- What the user's job is — author, decide what matters, sign off.

This isn't decoration. It's the frame inside which every subsequent
session makes sense. Without it, the recurring soft prompt will feel
like "AI is hiding the magic"; with it, the session feels like a
collaboration the user opted into.

Three screens, under 90 seconds total, never re-required. Implementation
details in Spec 60.

## Session entry

After data sync completes (or on dashboard load with new artifacts
since the last session), the dashboard shows a soft, brand-voice panel:

> *"You had 7 artifacts on Tuesday. When you're ready, we can sit down
> with them."*

Primary CTA: "Begin a session". A secondary affordance "Start a session
for…" opens a date-range picker for user-initiated range sessions.

No nudges, no countdowns, no auto-trigger. The door is always open;
the user decides when to walk through it.

### Backlog handling

A new user who syncs a year of GitLab data shouldn't get 200 unsession'd
day-prompts. The rule: auto-prompt only fires for days **after install**.
Older days stay browseable and range-session'able but don't push.

The very first session on install runs against the most recent day's
artifacts as part of the onboarding tail, so the user has a real
session experience without having to wait.

## Vocabulary discipline

The whole initiative collapses if the system uses judgement-language
about the user's work. Audit copy and code identifiers against this
list:

| Avoid                              | Why                                                                                  |
|------------------------------------|--------------------------------------------------------------------------------------|
| "Highlights" / "top contributions" | Implies the system ranked work by importance.                                        |
| "Most impactful" / "key" / "best"  | Quality verdict on the user's work.                                                  |
| "What mattered" without an explicit operational criterion | If "mattered" means "the model thinks it matters", that's authoring. |
| "Your wrap shows…"                 | Frames the wrap as the system speaking *about* the user.                             |
| "Generated for you"                | Drifts back into the AI-as-author seat.                                              |

Prefer:

- "your record", "your year", "what you noticed"
- "things you spent time on" (factual, defensible)
- "people you worked with most" (frequency, not importance)
- "we sketched this — your turn", "edit freely"
- "confidence in this parse", "we're not sure about this one" — about
  the system's extraction, not the user's work

Reliability scores, if and when they exist, must always grade the
**system's extraction**, never the **user's contribution**. Cross-check:
"what does a low score mean?" If the answer is anything close to "the
work was less important", the score crosses the line.

## Scheduled work

- **Spec 60** — Interactive sense-making session v0. The one-week
  build. Onboarding, day-scoped sessions, the record, existing wrap
  path untouched. Demo target.
- **Spec 61** — Wrap from the record (v1). Replaces the existing
  year-end fan-out with a composition path that reads from L2. Date
  range picker, optional curation, same wrap renderer.

## Deferred to v2+

These are explicitly out of scope for both Specs 60 and 61, and live
as future specs after demo day:

- Reliability scoring on extraction with a golden set.
- Mode B conversational sense-making (free-form dialogue).
- Mode A "wizard noticings" between panels.
- Resumability of in-progress sessions.
- Multi-year memory / cross-session continuity.
- In-session artifact creation ("add an artifact while you're here").
- Classification on demand inside slice prompts.
- Theme extraction beyond simple grouping.
- Multi-provider normalisation past GitLab.
- Replacing or hiding the contribution timeline.
- Deprecating the original `/wrap` enqueue path once Spec 61 lands.
- A browseable record UI ("read my journal").
- Telemetry on session edit/lock/skip patterns.

## Open questions not yet answered

- **Projects and Collaborators as persistent organizational concepts.**
  Should Burrito have a layer of organization above sessions —
  long-running Projects (a repo, an initiative) and Collaborators
  (people the user works with regularly) — that artifacts roll up to?
  Open exploration in progress via Claude Design visual prototyping
  (the brief asks for browse views, session starters, and wrap entry
  points around these concepts). Key sub-decisions when this lands:
  derived (auto-extracted) vs curated (user-named) vs hybrid (system
  suggests, user accepts/edits) — this is the brand-identity-shaping
  decision; whether artifacts belong to one Project or many; how this
  layers with day-scoped sessions; how it interacts with the record.
  Not specified in Specs 60 or 61; may become a v2 spec after the
  visual exploration informs the architectural choice.
- **When can a user "make a wrap"?** Always available, threshold-gated,
  or context-prompted? Spec 61 takes a position: always available, but
  with a soft state when the record is thin ("Your record is short —
  the wrap will reflect that").
- **Multiple wraps per year — what's the canonical one?** If a user
  makes three wraps from overlapping ranges, they have three wraps.
  Whether that's right is a v2 question.
- **Cross-year remembering**: scoped to themes the user explicitly
  carries forward, or implicit? Deferred entirely.
- **A browseable record UI**: when does this become necessary?
  Probably when users want to revisit a specific past day's framing
  outside the wrap context. v2.

## See also

- `tasks/60-interactive-sensemaking-v0.md` — v0 build (one-week demo).
- `tasks/61-wrap-from-record.md` — v1 wrap path replacement.
- Spec 30 (Composer) — unaffected by either spec.
- Spec 31 (Shareable highlight wheels) — affected only in that the
  wrap it shares now comes from sessions/record, not from raw signals,
  once Spec 61 ships.
- Spec 50 (File upload provider) — a second artifact source. Already
  shaped.
