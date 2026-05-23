# Spec 73 — Review step: date UX for undated documents

**Status**: Shaped — ready to pick up
**Branch**: client
**Appetite**: small (≤ 1 day)
**Last shaped**: 2026-05-22

## Problem

The review modal (`ReviewImportModal`) was designed for documents where most
rows have explicit dates and a handful are flagged `autoDated`. The user
corrects one or two dates, hits confirm, done.

That assumption breaks for documents with few or no temporal signals:
performance reviews, brag docs, meeting notes, and similar prose. After the
Spec 73 extraction-prompt relaxation (infer dates from vague signals like
"Q1", "last March", "this year"), some rows will carry approximate-but-real
dates. But documents with no dates at all still surface every row as
`autoDated`, all defaulting to today. The user faces a table of N identical
dates, each needing individual correction — there is no bulk path.

The extraction-prompt relaxation (the prompt change paired with this spec) is
a pre-condition: it reduces how often this situation arises. This spec fixes
the UX for when it still does.

## Solution shape

### 1. Bulk date bar

When two or more rows are `autoDated`, show a prominent bar at the top of the
scrollable row list:

```
┌─────────────────────────────────────────────────────────────┐
│  4 rows have no confirmed date.  [ __________ ]  Apply to all │
└─────────────────────────────────────────────────────────────┘
```

- The `[ __________ ]` is a single `<input type="date">`.
- "Apply to all" sets `occurredAt` on every row that is still `autoDated:
  true` (rows the user has already touched individually are excluded — the
  patch should check `autoDated` at apply time, not at render time).
- Clears `autoDated` on the affected rows, same as individual editing does.
- The bar disappears once no `autoDated` rows remain.
- No "apply to all rows regardless" variant — don't clobber rows the user has
  already corrected.

### 2. Header badge

Update the sub-heading copy to always surface the undated count explicitly:

- Today: *"N contributions extracted — give them a quick look."* + separate
  sentence about auto-dated rows.
- After: collapse into one line — *"N contributions extracted · M need
  dates."* (only show the `· M need dates` fragment when M > 0).

### 3. Row visual treatment

The `AUTO-DATED` chip on individual rows is fine as-is. No change needed to
the per-row layout — it already has a date picker per row for individual
correction.

### Mockup — bulk bar state

```
REVIEW · MY PERFORMANCE REVIEW 2024

8 contributions extracted · 6 need dates.

┌────────────────────────────────────────────────────────────────────┐
│  6 rows have no confirmed date.   2024-03-01 [×]   Apply to all   │
└────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ DATE          SIGNAL              CATEGORY   WEIGHT   SOURCE     │
│ [2024-03-01]  Led the migration…  delivery   4        manual     │
│ [AUTO-DATED]                                                     │
├─ ... ───────────────────────────────────────────────────────────┤
│ DATE          SIGNAL              CATEGORY   WEIGHT   SOURCE     │
│ [2024-06-14]  Mentored two…       mentorship 3        manual     │
│ (user already corrected this row — not affected by Apply to all) │
└─────────────────────────────────────────────────────────────────┘

                              [ cancel ]  [ confirm & save ]
```

## Rabbit holes

- **Don't add a "clear all dates" affordance.** It adds complexity for no
  real benefit; the bulk bar is for setting, not clearing.
- **Don't change the per-row grid layout.** The 5-column grid is fine for
  the current row fields. Resist the urge to redesign it while here.
- **Don't change `autoDated` semantics in the data layer.** The flag already
  means "date is uncertain"; whether that's "defaulted to today" or "inferred
  from Q1" doesn't need a new field. The review step treats both the same:
  flag it, let the user correct it.
- **Don't block confirm on undated rows.** The user should be able to confirm
  with some rows still auto-dated — maybe they genuinely don't remember and
  today is the best they can do. Blocking would be patronising.

## No-gos

- No changes to `ReviewableContribution`, `ImportReviewHook`, or
  `importIntoIdentity` — this is a pure UI change inside
  `ReviewImportModal.tsx`.
- No changes to `autoDated` tagging logic in `orchestrator.ts`.
- No changes to the extraction prompt — that's a separate change paired with
  this spec.
- No pagination or virtualisation of the row list — out of scope for this
  appetite. If a document produces 100+ rows the list scrolls; that's
  acceptable for v1.

## Verification

- Upload a document with no dates (e.g. a plain performance review). The
  bulk date bar appears above the row list.
- Setting a date in the bar and clicking "Apply to all" updates every
  auto-dated row's date field and removes their `AUTO-DATED` chip.
- Rows where the user has already edited the date individually are not
  overwritten by "Apply to all".
- The bar disappears after all rows have confirmed dates.
- A document where all rows have explicit dates: bulk bar never appears.
- A document where some rows have dates and some don't: bar appears; "Apply
  to all" only affects the undated subset.
- `pnpm typecheck` and `pnpm test` pass.

## Notes

- Paired with: extraction-prompt relaxation (accept vague temporal signals,
  omit only when truly no date signal exists). That change reduces the
  frequency of all-undated review sessions; this spec handles the ones that
  still slip through.
- If the row count at scale (50+) proves painful before virtualisation is
  tackled, a quick mitigation is to sort auto-dated rows to the top of the
  list so the user hits them first without scrolling.
