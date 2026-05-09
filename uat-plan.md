# UAT plan — Wrapped for Work (Burrito)

This document is a hand-off package for an automated tester running the app
locally in a real browser. Every step below is mechanically observable —
you should never have to use judgement to decide whether a step "looks
right." If a check requires judgement, it has been rewritten as a concrete
DOM / network / IndexedDB assertion.

**Architecture note.** The repo has migrated from the layout described in
`CLAUDE.md` and `README.md` (which still refer to Next.js `/api/wrap`,
`/api/classify` routes living under `src/app/api/`). Today there are
**two deployables**:

- **Client** (`/`, this repo root): Next.js 15 app. No `src/app/api/`
  directory at all.
- **Server** (`/server`): Azure Functions app with `auth/register`,
  `classify`, `wrap` (POST), `wrap/{jobId}` (GET) endpoints, plus the
  Service Bus-triggered `wrapWorker`.

The client points at the server via `NEXT_PUBLIC_WRAP_API_URL`.
Wrap generation is **asynchronous** — the client enqueues, polls, and
saves the result locally; the server has no DB for wrap content beyond
Azure Tables job rows that self-delete on first read.

`README.md`'s "Included flows" / "Setup" section is also out of date in
several other places (mentions `pnpm export:demo`, mentions
`/wrap/[id]` route — actual route is `/wrap?id=...` query string). Use
this UAT plan as the source of truth for what to test, not the README.

---

## 0. Prerequisites

### 0.1 Tooling
- Node ≥ 20, pnpm ≥ 9.
- Modern Chromium (Playwright Chromium or local Chrome) — the app uses
  WebCrypto + IndexedDB and assumes a Chromium engine for tooling.
- Azure Functions Core Tools v4 (`func`) for the backend, **only if** the
  full wrap pipeline is being tested. If only client-only flows (UAT-001,
  UAT-002, UAT-003, UAT-004, UAT-007) are in scope, the backend can be
  skipped.

### 0.2 Repo bootstrap
```bash
cd /home/user/gvt-build-2026-burrito
cp .env.local.example .env.local
pnpm install
```

`.env.local.example` already contains `NEXT_PUBLIC_WRAP_API_URL=http://localhost:7071/api`.
Do not change unless running the server elsewhere.

### 0.3 Backend bootstrap (only required for wrap-generation flows)
```bash
cd server
cp local.settings.json.example local.settings.json
pnpm install
# fill in WRAP_JWT_SECRET, ANTHROPIC_API_KEY (or AZURE_FOUNDRY_*),
# ServiceBusConnection, AZURE_TABLES_ENDPOINT inside local.settings.json
func start
```

If the backend is **not** running, the tester should expect:
- `UAT-001`, `UAT-002`, `UAT-003` — pass (purely client-side).
- `UAT-004` (manual entry) — **already broken regardless of backend**, see
  Known Gaps section. Mark KG-1 as confirmed.
- `UAT-005` (wrap generation) — fail at the network step
  (`POST http://localhost:7071/api/wrap` → connection refused). The tester
  should record this as "backend unavailable" rather than a regression.

### 0.4 Start the dev server
```bash
pnpm dev
# → http://localhost:3000
```

The app redirects `/` → `/dashboard`. The dashboard is gated by
`<UnlockGate>`.

### 0.5 Reset between test cases
A clean state is **clear all storage for `localhost:3000`**:
1. DevTools → Application → Storage → "Clear site data" with all checkboxes
   ticked, OR
2. From DevTools console:
   ```js
   await indexedDB.deleteDatabase('wrapped-for-work');
   localStorage.clear();
   sessionStorage.clear();
   location.reload();
   ```

After reset, the next visit to `/dashboard` must show the passphrase
**setup** form (heading "Create your passphrase.") — if it shows the
unlock form, the reset was incomplete.

### 0.6 Standard fixtures
Where a test uses a passphrase, use `correct horse battery staple`
(28 chars, well past the 8-char minimum).

For the "wrong passphrase" cases, use `wrong horse battery staple`.

---

## 1. Test cases

### UAT-001 — First-launch passphrase setup

**Preconditions**: site data fully cleared (§0.5). No `wrapped-for-work`
IndexedDB database exists.

**Steps**:
1. Navigate to `http://localhost:3000`.
2. Observe the URL redirects to `/dashboard`.
3. Observe the heading text inside the gate card.
4. In the "Passphrase (min 8 chars)" input, type `pass` and press Enter.
5. Observe the error.
6. Clear the field, type `correct horse battery staple` in the first input,
   type `correct horse battery STAPLE` in the second input (different case),
   press Enter.
7. Observe the error.
8. Type `correct horse battery staple` into both fields and press Enter.
9. Wait up to 5s for setup to finish.

**Expected results**:
- Step 3: heading text equals exactly `Create your passphrase.`.
- Step 5: visible error text matches `Passphrase must be at least 8 characters.`
- Step 7: visible error text matches `Passphrases do not match.`
- Step 9: the gate disappears; the dashboard shell mounts; the URL stays
  on `/dashboard`. A "FIRST LAUNCH" panel is visible with two buttons:
  `Try with demo data` and `Start fresh`.

**What to inspect**:
- IndexedDB → `wrapped-for-work` → `meta` table → row with key `kdfSalt`
  has `value` of length 16 (an array of 16 numbers between 0–255).
- IndexedDB → `meta` → no row with key `seeded` yet.
- Console: no uncaught errors. No request to
  `http://localhost:7071/api/auth/register` has fired yet (this only fires
  on the first wrap-related operation).

**Pass/fail**: pass iff every assertion above is exact.

---

### UAT-002 — Demo data seeding

**Preconditions**: UAT-001 passed; the FIRST LAUNCH panel is visible.

**Steps**:
1. Click `Try with demo data`.
2. Wait up to 10s for the panel to disappear.
3. Read the large number rendered next to the words "contributions caught
   this year, automatically." in the hero block.
4. Open the DevTools `Application` panel and inspect IndexedDB.

**Expected results**:
- Step 2: the FIRST LAUNCH panel is removed from the DOM.
- Step 3: the rendered count is the integer `134`.
- Year Rhythm chart shows 12 month bars; at least one bar has non-zero
  height; one bar (the peak month) has a small red number above it.
- "RECENT" section shows 5 event rows.
- Sidebar shows the `WRAP IT 🌯` CTA card.

**What to inspect**:
- IndexedDB → `contributions` table → row count is exactly 134.
- Pick any row in the `contributions` table and confirm:
  - `id` is a string (UUID).
  - `occurredAt` is a string (ISO date).
  - `source`, `category` are plaintext strings (e.g. `"github"`, `"delivery"`).
  - `iv` is a `Uint8Array` of length 12.
  - `ct` is a `Uint8Array` of length > 0.
  - There is **no** plaintext field named `signal`, `rawData`, `userId`,
    `externalId`, or `externalUrl` on the row.
- IndexedDB → `meta` table → row `seeded` has `value: true`.

**Pass/fail**: pass iff (a) count === 134, (b) every contribution row's
`iv` and `ct` are typed-array bytes, (c) no plaintext sensitive fields.

---

### UAT-003 — Lock / unlock round-trip

**Preconditions**: UAT-002 passed (134 contributions seeded, store unlocked).

**Steps**:
1. In DevTools console:
   ```js
   const m = await import('/_next/static/chunks/...'); // skip — instead:
   ```
   Use the simpler approach: open a fresh tab to
   `http://localhost:3000/dashboard`. Don't refresh the existing tab; open
   a separate one.

   (Note: the current build clears the in-memory key on `beforeunload`, so
   any reload re-locks the store.)
2. Refresh the original tab (Ctrl+R / Cmd+R).
3. Observe the gate.
4. In the "Passphrase" input, type `wrong horse battery staple` and press
   Enter.
5. Observe the error.
6. Clear the field, type `correct horse battery staple` and press Enter.
7. Wait up to 5s.

**Expected results**:
- Step 3: gate heading text equals exactly `Welcome back.` (NOT
  `Create your passphrase.`).
- Step 5: visible error text contains the substring `Wrong passphrase.`
- Step 7: gate disappears; the dashboard hero shows the same `134` count
  as before; year rhythm bars appear identical.

**What to inspect**:
- After step 5 (wrong passphrase), inspect IndexedDB → `contributions` →
  any row → `iv`/`ct` are still bytes (decryption failure must NOT have
  cleared or rewritten data).
- After step 7, the Recent section's 5 event rows render with non-empty
  `signal` text (proves decryption succeeded).

**Pass/fail**: pass iff wrong-passphrase shows the error and never reveals
plaintext, AND correct passphrase restores full functionality.

---

### UAT-004 — Manual contribution entry **(KNOWN BROKEN, see KG-1)**

**Preconditions**: store unlocked from UAT-002 or UAT-003. Network tab open.

**Steps**:
1. In the right sidebar, click `+ ADD CONTRIBUTION MANUALLY`.
2. In the Contribution textarea, type
   `Led the design review for the new payment-rail v2 migration plan.`
3. Leave date as today.
4. Leave the Category dropdown as `Let AI classify it`.
5. Click `Add Contribution`.
6. Watch the Network tab.

**Expected results (intended behaviour)**:
- A POST request to
  `http://localhost:7071/api/classify` with body `{freeText, source: "manual"}`,
  returning `{signal, category, weight}`.
- A new contribution row appears in IndexedDB encrypted (per UAT-002
  schema).
- A green success banner reading
  `Contribution saved. Add another or close.` appears below the form.
- The dashboard hero count increments by 1.

**Actual behaviour (current build)**:
- The form fires `POST /api/classify` as a **relative** URL
  (`http://localhost:3000/api/classify`), see
  `src/components/dashboard/ManualInputForm.tsx:35`. There is no Next.js
  route at that path — `src/app/api/` does not exist
  (`test/unit/privacy-invariants.test.ts:46-48` actively asserts its
  absence). The fetch returns a 404 HTML page, which fails JSON parsing,
  and the mutation throws `"Classification failed."` rendered in red below
  the form.

**Pass/fail**:
- **As-shipped**: pass iff the visible error
  `Classification failed.` is shown and the contribution count does NOT
  change. (This confirms KG-1 below.)
- **If the bug is fixed**: pass iff the green success banner appears, the
  hero count increments, and a new encrypted row exists in IndexedDB.

**Inspection regardless**:
- The Network tab must show the request URL exactly. Record whether the
  hostname is `localhost:3000` (broken) or `localhost:7071` (fixed).
- After the failure, IndexedDB → `contributions` row count is unchanged
  (134 if seeded).

---

### UAT-005 — Wrap generation, snapshot mode

**Preconditions**: backend running per §0.3. Store unlocked. 134 demo
contributions present (UAT-002).

**Steps**:
1. Click the lime `WRAP IT 🌯` button in the right sidebar.
2. The Generate Wrap modal opens. Confirm the `Snapshot` mode card has the
   selected (red border) styling.
3. In the From/To date inputs, leave defaults (`2025-04-01` to
   `2025-06-30`).
4. In the Model dropdown, leave the default
   (`claude-haiku-4-5 (Azure Foundry)`).
5. Open the Network tab and clear it.
6. Click `Generate`.
7. Observe the modal status panel.
8. Click `View status →` link when it appears.

**Expected results**:
- Step 6: the modal status text becomes `Generating your wrap…` with the
  pulsing red dot.
- Network tab shows in this order:
  - `POST http://localhost:7071/api/auth/register` (only on the first wrap
    of this device session) → 200 with `{token, expiresAt}`.
  - `POST http://localhost:7071/api/wrap` with `Authorization: Bearer ...`
    header → 200 with `{jobId, status: "queued", busy?: boolean}`.
- Step 7: status updates to `Queued — your wrap is being generated.` plus
  a lime `View status →` link.
- Step 8: navigates to `/wrap?id=<jobId>`. Page renders `PendingWrapView`
  with heading `Generating your wrap…` and one of the substrings
  `Queued — picking it up shortly.` / `Drafting your slices.` /
  `We're a little busy — this might take longer than usual.`
- Within ~30s the polling hook receives `status: "complete"` and the page
  re-renders the wrap viewer (see UAT-006 for what's displayed).

**What to inspect — request payload of POST /api/wrap**:
- Body must be valid JSON containing keys exactly
  `{jobId, contributions, mode, windowStart, windowEnd, modelId}`.
- For each element of `contributions`, the only keys are
  `{source, category, signal, rawData, occurredAt, weight}`.
- The string representation of the body must NOT contain any of the
  substrings `userId`, `"id":` (note the quoted form — `jobId` is fine),
  `externalId`, `externalUrl`, `Authorization`. (Use a regex — naive
  `includes("id")` will false-positive on `jobId`.)
- `Authorization` header is present with format `Bearer eyJ...` (a JWT).

**What to inspect — IndexedDB during pending state**:
- `pendingWrapRequests` table has 1 row with `id === jobId`,
  `status === "queued"|"running"`, `busy` ∈ {0, 1}, `mode === "snapshot"`,
  `requestedAt` (ISO string), `windowStart`/`windowEnd` (ISO strings),
  optional `modelId`. **All fields are plaintext** — see KG-2 below; this
  is intentional in the as-shipped build but a known privacy gap.

**Pass/fail**: pass iff (a) auth+enqueue requests succeed, (b) payload
contains no banned identifiers, (c) the page transitions through pending
to a complete wrap within 60s.

---

### UAT-006 — Wrap viewer rendering **(KNOWN BROKEN, see KG-3)**

**Preconditions**: UAT-005 reached `complete`. URL is `/wrap?id=<jobId>`.

**Steps**:
1. After the page transitions out of `PendingWrapView`, observe what
   renders.
2. Press `→` (right arrow key) and `←` (left arrow key) to navigate slides.
3. Inspect the slide content for any text matching
   `payment-rail v2 migration` (a hardcoded mock string from
   `src/components/wrap/WrapPhone.tsx:37`).

**Expected (intended) results**:
- Slides should render content from the saved wrap's `sliceContent` array
  (10 slices: `launches_shipped`, `velocity`, `cross_team_impact`,
  `deep_work_streak`, `mentorship`, `initiative`, `collaboration_style`,
  `consistency`, `highlight_reel`, `identity`).
- Headlines and bodies should reflect the demo contributions just sent.

**Actual (current build) results**:
- `src/components/wrap/WrapExperience.tsx` renders
  `<WrapDesktop onClose={handleClose} />` (desktop) or
  `<WrapPhone p={MX_PALETTE} onClose={handleClose} />` (mobile) — neither
  call passes `slices`, `mode`, `title`, or any wrap data. Both components
  display **hardcoded mock content** (see `WrapPhone.tsx:30-43` MOCK
  object; `WrapDesktop.tsx` likewise).
- The 10 components in `src/components/slides/*.tsx` (LaunchesShipped,
  Velocity, etc.) and `SlideFrame` are **not imported anywhere** —
  confirmed via `grep -rln 'from.*slides/' src` returning only the
  internal slides/ files.
- Therefore: regardless of what `sliceContent` was generated and saved,
  the user sees the same mock wrap.

**What to inspect**:
- IndexedDB → `wraps` table → row with `id === jobId` exists and decrypts
  (its `iv` and `ct` are bytes; if you import the crypto module and call
  `decryptJSON` with the active key, you get back an object with a
  `sliceContent` array of 10 entries, each with `sliceKey`, `headline`,
  `body`, optional `stat`, optional `supporting`).
- The DOM contains the hardcoded string `payment-rail v2` (or `181` as
  the contribution count, or `OCT` as the peak month) — these are the
  mock signals.
- IndexedDB → `pendingWrapRequests` → row for `jobId` is **deleted**.

**Pass/fail**:
- **As-shipped**: pass iff (a) `wraps` table contains the encrypted
  result (proving the pipeline saved correctly), (b) the rendered DOM
  contains the mock strings (proving the UI is wired to mock data).
  Confirms KG-3.
- **If fixed**: the rendered DOM contains the slice headlines from
  `sliceContent[*].headline` and none of the strings `181`, `OCT`,
  `payment-rail v2`.

---

### UAT-007 — Wrap list ("Wrapped" tab)

**Preconditions**: at least one completed wrap exists (UAT-005 + UAT-006
finished). Store unlocked.

**Steps**:
1. Navigate to `/dashboard` if not already there.
2. Click the `wrapped` tab in the top navigation.
3. Observe the wrap card grid.
4. Click a wrap card.

**Expected results**:
- Step 3: at least one card visible. Each card shows:
  - A pill badge reading either `SNAPSHOT` (lime background) or
    `YEAR-END` (red background).
  - A creation date (e.g. `09 May 2026`).
  - A window range (e.g. `01 Apr 2025 → 30 Jun 2025`).
- Step 4: navigates to `/wrap?id=<id>`. Same renderer as UAT-006.

**Edge case — empty state**:
- Reset state per §0.5, complete UAT-001 + skip seeding (click
  `Start fresh` instead). Click `wrapped` tab.
- Expected: panel reading `NO WRAPS YET` with the heading
  `Generate your first wrap to see it here.` and a CTA `WRAP IT 🌯`.

**Pass/fail**: cards render with correct pills/dates AND empty state
renders correct copy.

---

### UAT-008 — Year-End mode wrap

Same as UAT-005 but with these differences:

**Steps 2–3 modifications**:
- After modal opens, click the `Year-End` mode card. Confirm it gains the
  red border / red shadow.
- Confirm the From/To date inputs are **replaced** by a panel reading
  exactly `Year-End automatically uses the full 2025 calendar year.`
- Click Generate.

**Expected payload differences**:
- POST `/api/wrap` body has `mode: "year-end"`,
  `windowStart: "2025-01-01T00:00:00.000Z"`,
  `windowEnd: "2025-12-31T23:59:59.999Z"`.

**Pass/fail**: identical to UAT-005 with the mode/window assertions added.

---

### UAT-009 — Model switching

**Preconditions**: store unlocked, demo data loaded, backend running.

**Steps**:
1. Open the Generate Wrap modal.
2. Open the Model dropdown.
3. Confirm the visible options are:
   - `claude-haiku-4-5 (Azure Foundry)`
   - `gpt-5.5-1 (Azure Foundry)`
   - `Claude Sonnet 4 (Anthropic direct)`
4. Pick `Claude Sonnet 4 (Anthropic direct)`.
5. Click Generate.
6. In Network tab, find the POST `/api/wrap` request body.

**Expected results**:
- Step 3: exactly the three options above (source of truth:
  `src/lib/ai/models.ts:MODEL_OPTIONS`).
- Step 6: payload field `modelId === "anthropic:claude-sonnet-4"`.

**Pass/fail**: option list matches AND `modelId` in payload matches.

---

### UAT-010 — Provider tab (GitLab Dedicated)

**Preconditions**: store unlocked. No identities yet.

**Steps**:
1. Click the `settings` tab in the top nav.
2. Observe the provider grid.
3. Count provider cards.
4. Click the GitLab Dedicated card.

**Expected results**:
- Step 3: exactly one provider card with label `GitLab Dedicated` and
  pill `+ LINK`. (NO cards for Jira, Slack, Confluence, GitHub —
  contrary to mock-up text in `tasks.md`.)
- Step 4: a modal opens with the GitLab connect form (Instance URL +
  API Token inputs). Pressing `Esc` or clicking the X closes it.

**What to inspect**:
- DOM around the provider grid: confirm only 1 card maps to
  `PROVIDERS_CONFIG.providers`. Source of truth:
  `src/lib/providers/providers.config.json` (1 entry,
  `gitlab-dedicated`).
- The `Privacy banner` lime strip with `🔒 your data stays yours.`

**Pass/fail**: exactly 1 provider; modal opens and closes correctly.

---

### UAT-011 — Profile name persistence

**Preconditions**: store unlocked.

**Steps**:
1. Settings tab → "YOUR NAME" input → type `Alex Chen` → click `Save name`.
2. Wait for button text to flash `Saved ✓`.
3. Click the `timeline` tab.
4. Read the greeting in the hero column.
5. Refresh the page. Re-unlock if prompted.
6. Repeat steps 3–4.

**Expected results**:
- Step 4: text `hey, alex —` appears above the count hero.
- Step 4: avatar circle in the top-right shows `AC` (initials).
- Step 6: same greeting and avatar persist after reload.

**What to inspect**:
- `localStorage.getItem('burrito:profile')` equals exactly
  `'{"name":"Alex Chen"}'`.

**Pass/fail**: greeting persists across reload and matches the inputs.

---

### UAT-012 — Palette switcher (does NOT persist)

**Preconditions**: store unlocked.

**Steps**:
1. Click the palette switcher button in the top-right of the nav.
2. Pick `GovTech SG`.
3. Observe the page repaints (red header → indigo).
4. Refresh the page; re-unlock if prompted.
5. Observe the palette state.

**Expected results**:
- Step 3: dashboard repaints to indigo/blue palette without errors.
- Step 5: palette has reverted to the default `Tomato` (red). The
  selection does NOT persist — see KG-4.

**Pass/fail**: switch works in-session AND reverts after reload (this is
a confirmed unimplemented feature; passing means matching the documented
gap, not regressing it).

---

### UAT-013 — Idle lock (sped up)

The default idle-lock window is 15 minutes
(`src/lib/local-store/crypto.ts:14`). Driving real time forward is
impractical for UAT, so this case uses tab-hide behaviour as a proxy.

**Preconditions**: store unlocked.

**Steps**:
1. From DevTools console, evaluate:
   ```js
   Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
   document.dispatchEvent(new Event('visibilitychange'));
   ```
2. Wait briefly (the timer is set; not yet fired).
3. Reload the page (this triggers `beforeunload` → `lock()` synchronously).
4. After reload, observe the gate.

**Expected results**:
- Step 4: the `Welcome back.` unlock form appears, NOT the dashboard.

**What to inspect**:
- After step 1, no immediate visible change — the idle-lock timer is
  scheduled but the 15-minute window hasn't elapsed.
- After step 3, the in-memory key is cleared by the `beforeunload`
  handler in `crypto.ts:109`.

**Pass/fail**: the unlock form appears after reload.

**Known related gap**: see KG-5 — `usePendingWrap` does NOT pause polling
when the key is cleared mid-wait, so a real 15-minute idle lock during
wrap generation can lose the wrap silently. Test this in UAT-014.

---

### UAT-014 — Pending-wrap key-loss (Spec 1 verification) **(KNOWN GAP, KG-5)**

**Preconditions**: backend running. Store unlocked. Demo data loaded.

**Steps**:
1. Open the Generate Wrap modal and click `Generate` (any mode).
2. Once the `Queued — your wrap is being generated.` message appears,
   click `View status →` to land on `/wrap?id=<jobId>`.
3. Immediately, in DevTools console, run:
   ```js
   const m = await import('/src/lib/local-store/crypto.ts');
   m.lock();
   ```
   (If module imports are blocked in the dev console, alternative:
   trigger lock by invoking the `beforeunload` handler:
   `window.dispatchEvent(new Event('beforeunload'))`. Note this only
   works if the handler clears `cachedKey` synchronously in dev — observed
   behaviour in `crypto.ts:109`.)
4. Wait until the polling hook receives `status: "complete"` from the
   server (look at Network tab for `GET /api/wrap/<jobId>` returning a
   payload with `sliceContent`).
5. Observe what the page does next.

**Expected (intended) result per Spec 1**:
- The polling hook should detect `!hasActiveKey()` BEFORE issuing the
  next poll, transition to a `paused-locked` phase, and prompt the user
  to unlock. The server-side row should NOT have been read+deleted.
- Once unlocked, polling resumes; the wrap is saved locally.

**Actual current behaviour**:
- `usePendingWrap` (`src/lib/local-store/hooks.ts:61-129`) does NOT check
  `hasActiveKey()`. It calls `pollWrap` regardless. When the server
  responds with `status: "complete"`, it calls `saveWrap`, which calls
  `requireKey()` (`crypto.ts:79`), which throws because `cachedKey` is
  null. The catch block sets `phase: 'failed'` with an error message
  like `Local store is locked...`.
- Because `wrapGet.ts` deletes the result row on first read, the wrap is
  permanently lost.

**What to inspect**:
- Network tab: count of `GET /api/wrap/<jobId>` calls. Confirm at least
  one fires while `hasActiveKey()` is false.
- After the failure: IndexedDB → `wraps` table has NO row for `jobId`.
  IndexedDB → `pendingWrapRequests` → row for `jobId` may or may not be
  present depending on the throw site.

**Pass/fail**:
- **As-shipped**: pass iff the page reaches `phase: 'failed'` and the
  `wraps` table is empty for this jobId. Confirms KG-5.
- **If fixed**: pass iff the page shows an unlock prompt rather than
  `phase: 'failed'`, and after unlocking, the wrap is persisted.

---

### UAT-015 — Slice generation failure fallback

**Preconditions**: backend running, but configured to fail one slice
deterministically. The simplest way: use a model id that causes the
provider call to 404 — but this affects ALL slices, not one. A cleaner
path is unavailable without code changes.

**Approach**: this UAT verifies the system-level fallback by examining
the structure of saved wraps — every wrap should have exactly 10 slices.

**Steps**:
1. Generate a wrap per UAT-005.
2. After completion, in DevTools console:
   ```js
   const dbReq = indexedDB.open('wrapped-for-work');
   // ... read wraps table, get the row for the jobId, decrypt
   ```
   OR easier: navigate to `/wrap?id=<jobId>` and read the saved wrap's
   `sliceContent` from React DevTools → `WrapExperience` props.

**Expected results**:
- The wrap row's `sliceContent` array has length exactly 10.
- Each entry has the keys `sliceKey`, `headline`, `body` (non-empty
  strings), and may have `stat` / `supporting`.
- The `sliceKey` values are the set
  `{launches_shipped, velocity, cross_team_impact, deep_work_streak,
  mentorship, initiative, collaboration_style, consistency,
  highlight_reel, identity}` — exactly these 10.

**What to inspect**:
- See `server/src/ai/generate.ts` and the prompts under
  `server/src/ai/prompts/`. Failures should be replaced by
  `fallbackForSlice` in `shared.ts:createSlice`.

**Pass/fail**: 10 slices present, sliceKey set matches exactly.

---

### UAT-016 — Stale wrap link / "wrap not on this device"
**(Partially implemented — see KG-6)**

**Preconditions**: store unlocked. No wrap with id `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`
exists locally or on the server.

**Steps**:
1. Navigate to
   `http://localhost:3000/wrap?id=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`.
2. Wait up to 10s.
3. Observe the page.

**Expected (intended) result per Spec 13**:
- Without polling the server (since neither a pending row nor a saved
  wrap exists locally), render the `WrapViewer`'s "this wrap isn't on
  this device" panel directly.

**Actual current behaviour**:
- `src/app/wrap/page.tsx` only branches on `pending` (`useLocalPendingWrap`).
  When `pending === null`, it routes to `<WrapViewer>` which calls
  `useLocalWrap`. That returns `null` and renders the
  `This wrap isn't on this device.` panel — partially correct.
- BUT: if the user navigates from a stale URL after the pending row was
  deleted server-side, the polling hook is not invoked (path B), so the
  graceful copy DOES show. **However**, if the user navigates while a
  pending row still exists locally but the server has 404'd, the polling
  hook drops the pending row and surfaces `phase: 'failed'` with
  `error: 'not-found'` — Spec 13's "graceful 404" branch is not wired.

**What to inspect**:
- Step 3: visible heading `This wrap isn't on this device.`
  (This is the `null` saved-wrap branch in `WrapViewer.tsx:40`.)
- A `← Back to Dashboard` button is present.
- No requests to `http://localhost:7071/api/wrap/<id>` were issued
  (Network tab is empty for that URL).

**Pass/fail**:
- **As-shipped**: pass iff the graceful panel renders for unknown IDs
  with no pending row. The 404-on-pending branch (KG-6) is not tested
  here without backend manipulation.

---

### UAT-017 — Network minimality (privacy invariant)

**Preconditions**: backend running. Store unlocked. Demo data loaded.

**Steps**:
1. Open Network tab and filter to XHR/Fetch.
2. Generate a wrap (UAT-005 or UAT-008).
3. Find the `POST /api/wrap` request.
4. Save the request body to a string `B`.
5. Find the `POST /api/classify` request (only fires if KG-1 is fixed
   and a classify call occurs).

**Pass/fail assertions on `B`**:
- `JSON.parse(B)` succeeds.
- `Object.keys(parsed)` is a subset of
  `["jobId", "contributions", "mode", "windowStart", "windowEnd", "modelId"]`.
- For `parsed.contributions[i]` (every i), `Object.keys(c)` is exactly
  `["source", "category", "signal", "rawData", "occurredAt", "weight"]`
  (the `ContributionForAI` shape from `shared/src/types.ts:48`).
- The string `B` does NOT contain (case-insensitive substring search):
  `"userId"`, `"externalId"`, `"externalUrl"`, `"identityId"`. (Reminder:
  use `JSON.stringify(parsed)` to canonicalise — don't search the raw
  body if it has whitespace.)
- The request has an `Authorization: Bearer <jwt>` header.

**Pass/fail on classify (when KG-1 is fixed)**:
- `Object.keys(parsed)` is exactly `["source", "freeText"]`.

**Pass**: all four assertions hold.

---

### UAT-018 — Server silence (privacy invariant)

This is a static / structural check — no runtime browser interaction
required.

**Steps**:
1. From the repo root:
   ```bash
   ls src/app/api 2>/dev/null && echo "FAIL: api dir present" || echo "ok"
   grep -rE "from ['\"](next-auth|prisma|@prisma)" src/ 2>/dev/null | wc -l
   grep -rE "process\.env\.ANTHROPIC_API_KEY" src/ 2>/dev/null | wc -l
   pnpm test test/unit/privacy-invariants.test.ts
   ```

**Expected results**:
- Line 1 prints `ok` (no `src/app/api/`).
- Line 2 prints `0`.
- Line 3 prints `0`.
- Line 4: vitest reports the privacy-invariants suite passed.

**Pass/fail**: all four lines as expected.

---

### UAT-019 — Encryption at rest (privacy invariant)

**Preconditions**: UAT-002 completed. 134 contributions in the store.

**Steps**:
1. DevTools → Application → IndexedDB → `wrapped-for-work` →
   `contributions`.
2. Pick any 3 rows at random.
3. For each, list the field names and the type/length of `iv` / `ct`.

**Pass/fail assertions per row**:
- The set of field names is a subset of
  `{id, occurredAt, source, category, weight, createdAt, identityId,
  externalKey, iv, ct}`.
- `iv` is a `Uint8Array(12)`.
- `ct` is a `Uint8Array(N)` with N > 16 (AES-GCM tag is 16 bytes; even
  the empty-object plaintext is 2 bytes → ct is ≥ 18).
- The row contains NO field named `signal`, `rawData`, `userId`,
  `externalId`, `externalUrl`.
- The string representation of the row (`JSON.stringify(row)`) does NOT
  contain any sensitive substrings from the demo data such as
  `"feature flag"`, `"PR"`, `"merged"`. (These will appear inside
  `ct` byte values that happen to encode such bytes only with negligible
  probability.)

**Repeat for `wraps` table**: the same shape applies (id, mode,
windowStart, windowEnd, createdAt, iv, ct). No `sliceContent`,
`title`, or `headline` plaintext fields.

**Pass/fail**: all rows opaque; no plaintext leaks.

---

### UAT-020 — Locality (privacy invariant)

**Preconditions**: completed UAT-002 (134 contributions stored).

**Steps**:
1. Confirm the dashboard hero count reads `134`.
2. Open DevTools → Application → Storage → click `Clear site data`.
3. Reload the page.
4. Observe what gate state appears.
5. If a passphrase form appears, set up a fresh passphrase.
6. After unlock, observe the dashboard hero count.

**Expected results**:
- Step 4: the `Create your passphrase.` setup form (NOT the unlock
  form), proving the salt was wiped.
- Step 6: the count is `0` (no contributions). The FIRST LAUNCH panel is
  visible again.

**What to inspect**:
- After step 2, `await indexedDB.databases()` returns an array NOT
  containing `wrapped-for-work`.
- `localStorage.length` is 0.

**Pass/fail**: every clear yields a fully fresh state; nothing persists
through `Clear site data`.

---

### UAT-021 — Wrong-model fallback (server returns unknown id)

**Preconditions**: backend running.

**Steps**:
1. From DevTools console on `/dashboard`:
   ```js
   const u = process.env.NEXT_PUBLIC_WRAP_API_URL ||
             'http://localhost:7071/api';
   // we can't read process.env in the browser; instead use:
   await fetch('/api/...');
   ```
   This UAT is hard to drive purely from the UI because the model
   dropdown is restricted to `MODEL_OPTIONS`. Skip the UI and instead
   inject a request directly:
   ```js
   const tok = (await (await fetch('http://localhost:7071/api/auth/register',
                                   {method:'POST'})).json()).token;
   const res = await fetch('http://localhost:7071/api/wrap', {
     method: 'POST',
     headers: {'content-type':'application/json',
               'authorization': `Bearer ${tok}`},
     body: JSON.stringify({
       jobId: crypto.randomUUID(),
       contributions: [],
       mode: 'snapshot',
       windowStart: '2025-01-01T00:00:00.000Z',
       windowEnd: '2025-12-31T23:59:59.999Z',
       modelId: 'nonexistent:model-9000',
     }),
   });
   console.log(res.status, await res.json());
   ```

**Expected results**:
- Server returns `200 {jobId, status: "queued", busy: false}`. The
  unknown id is silently mapped to the default by the server's
  `models.ts` fallback (per `src/lib/ai/models.ts` doc-comment line 6:
  "The backend silently falls back to its default when it receives an
  unknown id").

**Pass/fail**: 200 response.

---

## 2. Privacy verification summary

| Invariant                          | UAT case  | Mechanism of check                                  |
|------------------------------------|-----------|----------------------------------------------------|
| Locality                           | UAT-020   | Clear site data → fresh setup form, 0 contributions |
| Encryption at rest                 | UAT-019   | IDB rows have only opaque iv/ct for sensitive data  |
| Network minimality                 | UAT-017   | POST /api/wrap body has none of the banned keys     |
| Server silence                     | UAT-018   | No src/app/api/, no Prisma imports, no server env   |
| Idle lock                          | UAT-013   | Reload mid-session re-locks the store               |

---

## 3. Edge cases

| ID       | Scenario                                                  | Covered by         |
|----------|-----------------------------------------------------------|--------------------|
| EC-A     | Empty state (no demo, no contributions)                   | UAT-007 (empty)    |
| EC-B     | Wrong passphrase                                          | UAT-003 step 5     |
| EC-C     | Idle lock                                                 | UAT-013            |
| EC-D     | Slice generation failure → fallback                       | UAT-015            |
| EC-E     | Model switching                                           | UAT-009            |
| EC-F     | Stale `/wrap?id=...` link                                 | UAT-016            |
| EC-G     | Pending-wrap during idle lock (Spec 1 regression)         | UAT-014            |

---

## 4. Known gaps

These items are **expected to be absent or partially implemented** in
the current build. The agent should *confirm* each is in the documented
state — a passing UAT here means "matches the documented gap." Treat any
deviation (e.g. behaviour suddenly works) as worth flagging back to the
human, since it likely means an undocumented change landed.

### KG-1 — Manual contribution entry uses the wrong endpoint
- **Symptom**: `ManualInputForm.tsx:35` calls `fetch('/api/classify', ...)`
  with a relative URL. The Next.js app has no `src/app/api/` directory
  (privacy-invariants.test.ts asserts its absence). Server-side classify
  lives at `${NEXT_PUBLIC_WRAP_API_URL}/classify`.
- **Should use**: the `classify()` helper in `src/lib/ai/classify.ts`
  which already calls `backendUrl('/classify')` with auth headers.
- **UAT confirmation**: UAT-004 — visible `Classification failed.` error
  on every save attempt.
- **Status**: not on any active spec; appears to be a live regression
  introduced when the queue migration moved API routes off the Next app.

### KG-2 — `pendingWrapRequests` table is not encrypted (Spec 12)
- **Symptom**: rows in `pendingWrapRequests` have plaintext
  `mode`, `windowStart`, `windowEnd`, `requestedAt`, `status`, `busy`,
  `modelId`, `lastCheckedAt`. See
  `src/lib/local-store/pendingWraps.ts` and
  `src/lib/local-store/db.ts:75-85`.
- **UAT confirmation**: during UAT-005, observe the
  `pendingWrapRequests` row directly in the IDB viewer — fields are
  human-readable.
- **Status**: Spec 12 "Shaped — ready", not implemented.

### KG-3 — Wrap viewer renders mock data, ignores `sliceContent`
- **Symptom**: `WrapExperience.tsx:46-50` renders `<WrapPhone>` /
  `<WrapDesktop>` without forwarding `slices`/`mode`/`title`. Both
  components display hardcoded mocks (`WrapPhone.tsx:30-43` MOCK
  object). The 10 slide components in `src/components/slides/` are not
  imported by anything (`grep -rln 'from.*slides/' src` returns 0
  results outside the slides directory itself).
- **Implication**: every generated wrap looks identical. The encryption
  and pipeline work; the rendering is detached.
- **UAT confirmation**: UAT-006.
- **Status**: not tracked in any spec; this appears to be a design /
  refactor in flight.

### KG-4 — Palette switcher does not persist (tasks.md High Priority)
- **Symptom**: `DashboardShell.tsx:759` initializes `paletteId` to
  `'tomato'` with no localStorage round-trip.
- **UAT confirmation**: UAT-012.
- **Status**: tasks.md "High Priority", not started.

### KG-5 — Pending-wrap polling does not pause on lock (Spec 1 — P0)
- **Symptom**: `usePendingWrap` (`src/lib/local-store/hooks.ts:61-129`)
  does not call `hasActiveKey()` before polling or before `saveWrap`.
  A `complete` response received while the store is locked surfaces
  as `phase: 'failed'` and the server-side result row has been deleted.
- **UAT confirmation**: UAT-014.
- **Status**: Spec 1 "Shaped — ready (P0)", not started. Severity
  P0 — silent permanent data loss.

### KG-6 — `/wrap?id=...` 404 on pending row → bad failure copy (Spec 13)
- **Symptom**: when a pending row exists locally but the server returns
  404 on `GET /api/wrap/{jobId}` (e.g. result was already drained, or
  the server forgot the job), `pollWrap` returns
  `{status: 'failed', error: 'not-found'}` and `usePendingWrap` removes
  the pending row and shows the dark `phase: 'failed'`
  "Generation failed." panel — not the gracious "this wrap isn't on
  this device" copy that `WrapViewer` already implements.
- **UAT confirmation**: hard to drive without backend manipulation;
  UAT-016 only exercises the no-pending-row branch (which DOES work
  correctly).
- **Status**: Spec 13 "Shaped — ready", partially in place — the
  no-pending-row branch is gracious, the 404-on-pending branch is not.

### KG-7 — Stuck-`running` recovery, TTL sweeper (Spec 10)
- Server has no sweeper to expire long-running jobs. Client times out
  via the polling hook's failure path. Out of scope for client UAT;
  documented for completeness.

### KG-8 — Hide-/offline-aware pause polling (Spec 11)
- Polling fires regardless of `document.hidden` or `navigator.onLine`.
  Wastes background fetches. Not currently testable as a regression.

### KG-9 — JWT `kid` rotation (Spec 20)
- `auth/register` and `requireInstallToken` use a single secret. Out
  of scope for client UAT.

### KG-10 — Unimplemented features from `tasks.md`
The agent should confirm absence (rather than failure) of each:
- Archive view: no `/dashboard/archive` route, no `archive` nav link.
- Share Link: no UI to mint a public token; final slide is mocked.
- Contribution weight editing: `EventDetailDrawer` shows the bar but no
  save / mutate path.
- Per-slide editing: no edit mode in wrap player.
- Draft save: no draft column on `wraps` table.
- Phi/Llama/Mistral via Azure Foundry: only OpenAI-compatible
  deployments are wired (`@azure-rest/ai-inference` not used).
- Slack/Jira/Confluence providers: only `gitlab-dedicated` exists in
  `providers.config.json`.

The agent should grep / inspect to confirm each is genuinely missing
and not partially wired (which would suggest hidden bitrot):
```bash
grep -rln "archive" src/app          # expect 0 lines
grep -rln "shareToken\|share-link"   # expect 0 lines
grep -rln "draft" src/lib/local-store # expect 0 lines
ls src/lib/providers/                  # expect only gitlab-dedicated/
```

### KG-11 — Dead code (informational, not a UAT)
The following components are exported but never imported by any page or
parent component. They shouldn't break anything; flagging so the agent
isn't surprised:
- `src/components/ui/MxBadge.tsx`
- `src/components/ui/MxButton.tsx`
- `src/components/ui/MxPaletteSwitcher.tsx`
- `src/components/settings/ConnectToolsModal.tsx`
- `src/components/slides/*` (all 10 + `SlideFrame`)

---

## 5. Test coverage gaps in the existing suite

For context — the agent does NOT need to test these, but if a flow has
no automated coverage, treat any UAT failure as more likely a real bug
than a stale test.

| User-facing flow                       | Has automated tests?                                      |
|----------------------------------------|----------------------------------------------------------|
| Passphrase setup / unlock              | yes — `test/component/UnlockGate.test.tsx`              |
| Demo seeding                           | yes — `test/unit/seed.test.ts`                          |
| Manual contribution entry              | **no** — no test exercises the form                     |
| Generate Wrap modal                    | **no** — no test mounts `GenerateWrapModal`             |
| Pending wrap polling                   | **no** — no test for `usePendingWrap`                   |
| Wrap viewer rendering                  | **no** — confirms KG-3 has no regression net            |
| Wrap list ("wrapped" tab)              | **no**                                                   |
| Settings / provider grid               | partial — `AddProviderForm.test.tsx` covers form only   |
| Palette switcher                       | **no**                                                   |
| Profile name persistence               | **no**                                                   |
| Privacy invariants (static)            | yes — `test/unit/privacy-invariants.test.ts`            |
| Encryption at rest (browser)           | yes — `test/e2e/encryption.spec.ts`                     |
| Locality                               | yes — `test/e2e/locality.spec.ts`                       |
| Network minimality                     | yes — `test/e2e/network-minimality.spec.ts`             |
| GitLab provider end-to-end             | yes — `test/e2e/gitlab-provider.spec.ts`                |

---

## 6. Reporting format

For each UAT case, the tester should record:

```
UAT-NNN — <flow>
  Result: PASS | FAIL | BLOCKED-BY-ENVIRONMENT
  Matches documented behaviour: yes | no
  Deviations: <free text, only if "no" above>
  Screenshots: <path>
  Network log excerpt (if relevant): <inline or path>
```

Aggregate at the end:
- Count of PASS / FAIL / BLOCKED.
- List of confirmed Known Gaps (KG-N) — these should match §4.
- List of any *unexpected* failures or *unexpected* successes (a Known
  Gap that suddenly works is news worth surfacing).
