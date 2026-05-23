# Design note — Wrap design system + generator harness

**Status**: Brainstorm — open. No spec shaped yet.
**Last updated**: 2026-05-23

This is a **design note**, not a shaped spec. It opens the
exploration of "what does the wrap surface (viewer + LLM generator)
look like once Spec 72 has overhauled everything around it." It
captures direction, calls out the load-bearing tensions, and lists
research questions to resolve before we shape concrete specs.

Specs 70/71/72 deliberately leave the wrap viewer untouched. This
note is the start of the conversation about the *next* surface to
revisit, now that sessions and the record exist as the substrate
upstream of it.

## Why this exists

The wrap renderer (`src/components/wrap/`, `src/components/slides/`)
and the 10-slice fan-out (`server/src/ai/generate.ts` +
`server/src/ai/prompts/*.ts`) were designed when the only input was
**raw contributions**, the only output was **10 fixed slices**, and
the only viewing context was **a one-shot year-end recap**. Every
one of those constants is now in motion:

- **Input variability has exploded**. After Spec 60/61/72 a wrap can
  be composed from: raw provider signals (legacy), file-upload
  artifacts (Spec 50), session framings from the record (Spec 61),
  or a curated mix. A year of GitLab activity could feed it 2000+
  raw events; a single file-upload session could feed it 4 locked
  framings. The wrap pipeline currently assumes "year of raw
  events" and silently degrades on everything else.
- **Output variability has not kept up**. The viewer ships a fixed
  10-slot publication grammar — every wrap is exactly 10 slides,
  whether or not the input justifies that many slices. Empty slices
  fall back to "Still building this story." (`server/src/ai/shared.ts:17`),
  which is honest but also a tell: it announces "the harness is
  filling space."
- **The brand voice has shifted**. The interactive-sense-making
  initiative (`design-interactive-sensemaking.md`) re-defined Burrito
  as a **recording tool with AI assistance**, not the inverse. The
  current wrap, born of the older identity, still authors a fixed
  narrative on the user's behalf. The voice on the dashboard ("a
  mirror, not a judge. burrito drafts. you edit. you own it.") does
  not yet have a counterpart on the wrap itself.

The combined gap is: we have a fixed harness pretending to handle
variable input, and a fixed viewer pretending to publish a uniform
artifact. Both work for the demo-day shape (one year, lots of
contributions, well-classified). Both visibly strain when reality
deviates.

## Two goals (restated from the brainstorm)

The brainstorm names two goals; the rest of this note is in service
of them.

1. **Preserve the visual experience and novelty of the first-time
   wrap that "just works."** The first time a user sees their wrap
   is the make-or-break moment. The slide grammar, hard shadows,
   ghost numerals, italic display type, color-blocked chapters —
   that material is doing the emotional work. None of it should be
   sacrificed to handle variability. Variability handling has to
   live underneath the surface, not on top of it.
2. **Improve the quality of the sketch we draw of a person's work,
   so that it represents their efforts and struggles
   honestly.** The wrap should feel *of* the person, not *about*
   them. Today's slices tilt toward outcomes ("3 launches", "12
   collaborators") because outcomes are what the categories and
   weights surface. Effort, friction, the long meandering things —
   those are not currently representable.

## Mental model: reflective constructing

The user's framing — *reflective constructing* — has three stages,
each with a distinct mental posture:

| Stage | What the user is doing | Where it lives today |
|-------|------------------------|----------------------|
| **Recap** | Sense-making. Looking at one day or one range, naming what mattered, deciding what's noise. | The session workbench (Spec 60/72). One day or one range at a time. |
| **Record** | Accumulation. Locked framings persist into a journal-like substrate the user owns. | `record` table / locked panels (Spec 60, browseable in Spec 72). |
| **Wrap** | Synthesis. The fruit of the construction — a shareable artifact composed *from* the record, with a visual grammar that elevates it. | `WrapViewer` + `SlideFrame` + the 10-slice fan-out. **This note's scope.** |

Treating these as distinct stages with distinct mental postures has
operational consequences for the wrap:

- **The wrap is downstream of recap and record.** Its primary
  input should be the user's own framings, not raw events. Where
  raw events appear, they should be in service of (or supporting
  detail for) a framing the user already wrote.
- **The wrap is the celebration moment.** Recap is intentional
  work; record is accumulation; wrap is "look at what you've
  noticed." The viewer's editorial maximalism is correct *for the
  wrap stage specifically*. We do not need to soften the wrap to
  match the workbench — they are different rooms.
- **The wrap is also the place a user shares.** Recap is private
  reflection; record is private accumulation; wrap is the artifact
  they hand a manager. That changes how much polish is justified
  and where the user expects to be able to edit.

## The harness — managing input variability

The harness is everything between "we have some inputs" and "we
produce SliceContent objects the viewer can render." Today it's a
hard-coded 10-way Promise.allSettled (`server/src/ai/generate.ts`)
with per-slice filtering rules baked into prompt files. That works
for one shape of input and silently degrades on others.

Sketch of a harness that takes variability seriously:

### 1. Characterize the input

Before any slice is generated, profile what we have:

- **Volume** — count of artifacts/framings/signals.
- **Time span** — does the input cover a day, a quarter, a year?
- **Diversity** — how many sources, how many categories, how many
  distinct projects/people are represented?
- **Polish** — what fraction is raw signals vs. session framings
  vs. file-upload artifacts? (Polished = the user has already done
  sense-making work on it; raw = we'd be the first to interpret it.)
- **Confidence** — for raw signals, what's the classification
  confidence? For framings, was the user editing actively or
  rubber-stamping our drafts?

This profile is what every downstream decision keys off. It's a
small object; carry it through the pipeline.

### 2. Pick the slices that apply

Not all 10 slices fit all wraps. A snapshot of one week has no
"deep work streak" worth narrating; a wrap composed from 4 file-
upload framings shouldn't pretend it's a year-end review.

The harness should select from a library of **candidate slices**
based on the input profile. Selection rules are explicit and
auditable (no LLM in the selection step). Examples:

- "Launches shipped" — requires ≥2 high-weight delivery items.
- "Year rhythm" — requires ≥3 distinct months represented.
- "What you sat with" — *new slice idea*: requires evidence of
  return-visits to the same project/issue over time. Surfaces
  effort and friction.
- "Cross-team" — requires ≥2 collaborators outside the user's
  primary group.

Selection produces an **ordered list of slices to generate**, not
a fixed 10. A thin wrap might be 4 slices. A rich wrap might be 12.
That's fine; the viewer learns to handle variable length.

### 3. Allocate effort and elaboration per slice

Slices are not all equally weighty. A "launches shipped" slice with
8 launches deserves more body, more supporting chips, maybe two
variants (one stat-forward, one anecdote-forward). A "consistency"
slice with marginal data deserves a stat-only treatment or gets
dropped.

The harness assigns each selected slice a **density grade** —
`hero | standard | minimal` — that controls:

- Body length budget
- Whether to request `supporting[]` from the LLM
- Whether to expect a stat
- How many examples to inline

The viewer reads this grade and renders accordingly. Same grammar,
different intensities. (This is where the design system contract
sits — see below.)

### 4. Generate with awareness of neighbors

Today each slice generator runs independently. A "launches shipped"
slice and a "highlight reel" slice can pick the same launch as
their headline, with the same words. The wrap then feels
duplicative even when each slice in isolation is fine.

A coherence pass — either as a final LLM call ("here are 8 draft
slices, flag overlaps and propose dedupes") or as deterministic
post-processing on the artifacts each slice references — should
sit between generation and persistence.

### 5. Express uncertainty, don't hide it

Where the harness is unsure (low-confidence classification, sparse
data, conflicting signals), the wrap can say so in brand voice —
"we sketched this — your turn", "we're not sure about this one" —
rather than padding. This is the bridge to letting the user edit
the wrap, which Spec 61 already shapes as an entry point but doesn't
yet design.

### 6. Sources for the harness, in priority order

The harness reads from (in order of preference):

1. **Locked session framings** (record entries). The user's own
   words, already curated. These are the most trustworthy and
   should drive the wrap's voice.
2. **File-upload artifacts** post-session. These have been through
   recap; they carry a user-authored framing.
3. **Project/person aggregations**. Derived structure from
   provider data — repos, collaborators, rhythms. Factual.
4. **Raw classified contributions**. The legacy path. Useful as
   *supporting detail* for slices grounded in 1–3, but no longer
   the primary substrate.

When a user has thin record coverage, the wrap is short and lean on
framings. When a user has rich record coverage, the wrap composes
from their own words. The viewer's response to "thin wrap" is what
the brainstorm calls out as critical to preserve — it should still
*feel like* a wrap.

## The design system — managing output variability

The viewer's job is to make every wrap feel like a polished, authored
artifact regardless of how much the harness handed it. There is
already a strong visual vocabulary documented in
`tasks/design-system-reference.md`; this section is about extending
it from "uniform 10-slide publication" to "publication that adapts
without losing its identity."

### What's already a design system

The slide grammar in `SlideFrame.tsx` is already doing meaningful
work — per-slice color blocks, ghost numerals, hard offset shadows,
phone vs desktop variants, mode-aware (snapshot vs year-end) accent
stripes. The `tasks/design-system-reference.md` document captures
the broader app-level visual language. Both are real. The *gap*
isn't that we lack a design system; it's that the system today
assumes a uniform input.

### What needs to become a design system

1. **Slice density variants.** For each existing slice (and any
   new ones), we need three rendering levels:
   - **Hero** — the giant italic stat, full body, supporting
     chips, the works.
   - **Standard** — today's default.
   - **Minimal** — stat-only, or headline-only, with the visual
     drama (color block, ghost numeral) preserved but no body
     padding. A minimal slice is honest about being a sketch.
   The harness picks the level; the viewer honors it.

2. **A "pacing curve" rule for slice ordering.** Today's wrap
   alternates hot openers / calm middles / ink finales mostly by
   the slice key. With variable slice count, that mapping breaks.
   The system needs an ordering rule expressed in terms of energy
   (hot → calm → punctuation → ink), not in terms of fixed slice
   types. Three minimal slices in the middle of a wrap should not
   feel like a dip in energy; they should feel like a deliberate
   quieter passage.

3. **A vocabulary for showing the user's own voice.** When a
   slice is composed from a locked framing, the wrap should *look
   different* from a slice composed from raw classified events.
   The user's words deserve typographic weight — perhaps a
   pulled-quote treatment, or a "from your record · 2026-03-14"
   topline byline. This is how we visually honor the
   recording-tool identity inside the wrap.

4. **Visible "we sketched this — your turn" affordances.**
   Edit-on-slide is not in scope for v1, but the affordance — a
   small pencil icon, a hover treatment — should sit in the design
   system from the start so v2 can wire it up without redesigning.

5. **A graceful "thin wrap" treatment.** When the harness only
   selects 3–4 slices, the viewer should not look broken. It
   should look intentional. Possibly: a thinner wrap is presented
   as a "snapshot" mode artifact rather than "year-end", with
   different chrome and explicit copy ("a short wrap — your record
   is still growing"). Snapshot mode already exists; we may need
   a third mode or a "lean" sub-variant.

6. **An anti-pattern catalogue.** A short list of what the wrap
   should never look like (uniform sans-serif title-case, soft
   shadows, low-contrast surfaces — most of this already lives in
   `design-system-reference.md` under "What NOT to use"). Pin
   this where slice authors and prompt authors will read it.

## The contract between harness and viewer

Today the contract is the `SliceContent` type (`shared/src/types.ts`).
It's small and flat: `sliceKey, headline, body, stat?, supporting?[]`.
That's sufficient for the fixed 10-slot wrap but does not carry
enough metadata for the variability we want.

A sketch of what the contract could grow to (illustrative only —
do not implement from this; it's a thinking artifact):

```ts
type SliceContent = {
  sliceKey: string;          // existing
  density: 'hero' | 'standard' | 'minimal';  // new
  headline: string;
  body?: string;             // optional in minimal
  stat?: string | null;
  supporting?: string[] | null;
  voice?: {                  // new — when composed from record
    fromFramingId?: string;  // pointer for "edit in record" affordance
    framedOn?: string;       // ISO date of the locked framing
    confidence?: 'high' | 'medium' | 'low';
  };
  pacing?: 'opener' | 'rise' | 'sit' | 'crest' | 'finale';  // new
};
```

The point is not these specific fields; the point is that the
contract should carry **density**, **voice provenance**, and
**pacing role** so the viewer can do its job without guessing.

## What this is not

- Not a redesign of `SlideFrame.tsx`'s visual language. The bones
  stay. We're adding variants, not replacing the system.
- Not a rewrite of the LLM provider/dispatch layer
  (`server/src/ai/client.ts`, `providers/`). That layer is fine.
- Not a new wrap entry point. Spec 61 already shapes "wrap from
  the record"; this note is about what happens *after* a user
  presses "make a wrap" in any of those entry points.
- Not edit-on-slide. That's a deliberate v2 follow-up; this note
  only asks that the design system not preclude it.
- Not telemetry. Out of scope until the harness exists and we know
  what to measure.

## Research questions to resolve before shaping a spec

Numbered for easy reference; some will become small experiments,
some are UAT-style observations, some are design exercises.

### On the harness

1. **What does the input profile look like across real users
   today?** Sample a handful of UAT participants' contribution
   sets: volume, source mix, category distribution, classification
   confidence. The variance is the design constraint.
2. **How thin is "too thin" for a wrap?** Render mock wraps with
   3, 5, 7, 10, and 14 slices and ask testers which feel like a
   complete artifact and which feel like padding or fragments.
3. **Does a coherence pass meaningfully change perceived quality,
   or is it dedupe theater?** Generate 10-slice wraps with and
   without a dedupe pass; A/B at a small scale.
4. **What slices should exist that don't today?** Brainstorm
   candidates that surface *effort and struggle* rather than
   outcomes — e.g. "what you sat with", "the thing you returned to",
   "the months that asked more". Validate against the
   anti-judgment vocabulary in `design-interactive-sensemaking.md`.
5. **Where does the LLM belong in slice selection — anywhere?**
   Or is selection always deterministic (rule-based) and the LLM
   only writes the prose? Argument for deterministic selection:
   auditable, defensible, no surprises. Argument for LLM-assisted
   selection: catches themes humans wouldn't pre-encode.
6. **How does the wrap compose when the record is empty?** A user
   skips every session for a year but their providers have synced
   plenty of artifacts. Do we wrap from raw, refuse to wrap, or
   wrap with explicit "you didn't record any framings — here are
   the rhythms we noticed"?
7. **Should density be set by the harness, by the LLM, or by the
   user?** The user-set version is editorial: pick 3 hero slices,
   the rest minimal. That's a wrap-as-editorial-tool framing.

### On the design system

8. **Does the publication identity survive a 4-slice wrap?**
   Mock it and look. If a thin wrap looks "broken" no matter what,
   we need a different visual register for thin wraps, not just a
   length-cap.
9. **What does a slice composed of the user's own framing look
   like?** Sketch pulled-quote, byline, and quoted-paragraph
   treatments. Pick one.
10. **How does pacing work without a fixed slice order?** Right
    now slice ordering follows the array order from `generate.ts`.
    Test: shuffle the order, do the wraps still feel coherent?
    If no, we need a deliberate energy-curve assignment.
11. **What does "we sketched this — your turn" look like on a
    slide?** Without inviting edit-mode yet — just the affordance
    sitting in the type. Hover state? Tiny pencil glyph in the
    topline label?
12. **Phone vs desktop — when does a slice's density choice
    differ between variants?** A "minimal" slice on phone may
    still feel full; the same minimal on desktop may feel empty.
    The contract may need per-variant density, or the viewer may
    interpret one density differently per variant.

### On the experience

13. **What did first-time users react to in past UAT?** Pull the
    qualitative notes from earlier UAT rounds (the trust-collapse
    pattern that drove `design-interactive-sensemaking.md`) and
    extract the moments that were specifically about the wrap
    surface vs the timeline surface.
14. **What slices, today, get "wow" reactions vs "huh, that's not
    me" reactions?** Per-slice qualitative read.
15. **Does showing the wrap *immediately after a session* (rather
    than at year-end) shift the relationship to it?** Possibly
    test by composing a wrap from a single rich session's framings
    and showing it on session close. Currency might be a feature.
16. **How shareable is the wrap, actually?** Have any UAT users
    shared a wrap with a manager? What did they say or wish they
    could change before sharing?
17. **Where does the user *want* to edit?** If we observe a user
    reading their wrap, what do they reach for first? The
    headline? A specific stat? The supporting chips? That's where
    edit-on-slide should land first in v2.
18. **Does the "struggle and effort" framing land as honoring or
    as patronizing?** This is the most fragile new direction.
    Test the copy carefully; some users will feel seen, others
    will feel diminished. The anti-judgment vocabulary helps but
    doesn't fully resolve it.

## Possible follow-up specs

Numbered in the existing tasks/ scheme; not yet shaped.

- **Spec 73 — Input profile + slice selection harness.** Add the
  characterization step; make slice selection rule-based and
  variable-length. Keep the existing 10 generators; just stop
  always running all 10. The viewer continues to render whatever
  it gets.
- **Spec 74 — `SliceContent` density variants + viewer
  adaptation.** Extend the contract with `density`, render the
  three levels in `SlideFrame.tsx`. Wire the harness to pick a
  density per selected slice.
- **Spec 75 — Voice-aware slice rendering.** When a slice is
  composed from a locked framing, render it with quoted-paragraph
  treatment and a `from your record` byline. Requires the record
  side (Spec 61) to have shipped, since this is the consumer of
  that work.
- **Spec 76 — "What you sat with" + struggle/effort slices.** New
  slice types that surface return-visits, sustained focus, and
  effort that didn't ship. The hardest spec to land correctly;
  needs the anti-judgment vocabulary baked in from the start.
- **Spec 77 — Pacing curve assignment for variable-length wraps.**
  Make the slice ordering deliberate rather than incidental.

These would land in roughly the order listed: harness first
(73), then viewer (74), then voice (75), then new slices (76),
then pacing (77). Each is a small/medium spec independently.

## See also

- `tasks/design-interactive-sensemaking.md` — the upstream
  direction that reframed Burrito as a recording tool. The wrap
  surface should align to that frame.
- `tasks/design-system-reference.md` — the existing visual
  language. Anything in this note that contradicts that document
  is wrong and should be reconciled in favor of the existing
  language.
- `tasks/60-interactive-sensemaking-v0.md`,
  `tasks/61-wrap-from-record.md`,
  `tasks/72-ui-functionality-overhaul.md` — the upstream specs.
  This note picks up where Spec 72 deliberately stops (it left the
  wrap viewer untouched).
- `server/src/ai/generate.ts`, `server/src/ai/shared.ts`,
  `server/src/ai/prompts/` — the harness today.
- `src/components/wrap/`, `src/components/slides/` — the viewer
  today.

## Notes

- This is a deliberate design-note rather than a shaped spec
  because: (a) the user explicitly asked for a brainstorm; (b)
  the work is large enough to fork into several specs and a
  premature shape would arbitrarily constrain them; (c) the
  research questions need attention before a shape becomes
  defensible. If a fully shaped spec is wanted instead, the
  natural first cut would be Spec 73 (input profile + selection),
  which is the smallest piece that demonstrably moves the goal.
- The two stated goals (preserve novelty; honor effort/struggle)
  are in tension at exactly one point: minimal slices. A minimal
  slice is honest about thin data but risks breaking the "wrap
  that just works" magic. Research question 8 is the resolution
  point for that tension.
