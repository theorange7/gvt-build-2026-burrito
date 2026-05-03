# Burrito Maximalist — Implementation Tasks

Reference design: `docs/designs/Burrito Maximalist Prototype.html`  
Base branch: `claude/burrito-maximalist-prototype-YGwhk`

---

## Active Component PRs

| # | Component | Branch | PR | Status |
|---|-----------|--------|----|--------|
| 1 | Theme & Design System | `claude/mx-theme` | [#14](https://github.com/theorange7/gvt-build-2026-burrito/pull/14) | 🟢 Open |
| 2 | Dashboard Shell Redesign | `claude/mx-dashboard` | [#17](https://github.com/theorange7/gvt-build-2026-burrito/pull/17) | 🟢 Open |
| 3 | Event Detail Drawer | `claude/mx-event-detail` | [#13](https://github.com/theorange7/gvt-build-2026-burrito/pull/13) | 🟢 Open |
| 4 | Connect Tools Modal | `claude/mx-settings` | [#12](https://github.com/theorange7/gvt-build-2026-burrito/pull/12) | 🟢 Open |
| 5 | Wrap Phone Player | `claude/mx-wrap-phone` | [#15](https://github.com/theorange7/gvt-build-2026-burrito/pull/15) | 🟢 Open |
| 6 | Wrap Desktop Player | `claude/mx-wrap-desktop` | [#16](https://github.com/theorange7/gvt-build-2026-burrito/pull/16) | 🟢 Open |

## Suggested Merge Order

Components 2–6 depend on the palette module that component 1 creates.
Merge in this order to minimise conflict resolution:

1. `claude/mx-theme` (PR #14) — foundational (layout, CSS, palette module)
2. `claude/mx-dashboard` (PR #17)
3. `claude/mx-event-detail` (PR #13)
4. `claude/mx-settings` (PR #12)
5. `claude/mx-wrap-phone` (PR #15)
6. `claude/mx-wrap-desktop` (PR #16)

---

## Unimplemented / Future Features (from design)

Features visible in the Maximalist Prototype that are **not** addressed by the
active branches above. Tackle in a later sprint.

### High Priority

- [ ] **Archive View** — The prototype sidebar has an `archive` nav link showing
  past wraps (e.g. "2025 · Year", "2025 · Q3 snapshot") with cover colours from
  `MX_ARCHIVE`. No archive page/route exists yet.
- [ ] **Palette Persistence** — The palette switcher state resets on reload.
  Persist the chosen palette ID to `localStorage` so the user's choice survives
  page refreshes and navigation.
- [ ] **Share Link Feature** — The wrap final slide has "COPY SHARE LINK 🔗".
  Needs a backend route to mint a public token + a public wrap viewer route.

### Medium Priority

- [ ] **Contribution Weight Editing** — The event-detail drawer shows an
  "IMPORTANCE" bar with the note "you can adjust this". No write path exists to
  mutate `contribution.weight` in the local store.
- [ ] **Post to Slack #wins** — Desktop wrap final slide has "POST TO SLACK ·
  #wins". Requires a Slack provider write integration.
- [ ] **Real Tool OAuth (Jira / Slack / Confluence)** — The connect-tools modal
  shows "+ LINK" for four tools. Only GitLab is currently wired with a real
  OAuth/token flow (`src/lib/providers/gitlab-dedicated/`). Jira, Slack, and
  Confluence need equivalent provider modules.

### Low Priority

- [ ] **Per-slide Editing** — "Edit any slide ✎" action on the wrap final slide.
  Needs an edit mode inside the wrap player where users can rewrite the headline
  / body of individual slices.
- [ ] **Draft Save for Wraps** — "Save as draft" on the wrap final slide should
  mark a wrap as draft (not yet shared) vs. published. The schema and UI
  distinction don't exist yet.
- [ ] **Phi / Llama / Mistral via Azure Foundry** — `CLAUDE.md` notes that
  `@azure-rest/ai-inference` is not yet wired; non-OpenAI deployments on
  Azure Foundry (Phi, Llama, Mistral) can't be selected today.
- [ ] **Jira Provider** — Placeholder in the connect-tools modal but no provider
  module under `src/lib/providers/`.
- [ ] **Slack Provider** — Same — UI placeholder only.
- [ ] **Confluence Provider** — Same — UI placeholder only.
