# Spec 30 — Composer: music-synced video render service

**Status**: Shaped — ready to pick up
**Branch**: composer (new top-level Python service) + server (one new route) + client (one new UI affordance)
**Appetite**: large (≤ 1 week for the v1 backend + minimal client integration; further polish lives in follow-up specs)
**Last shaped**: 2026-05-10

## Problem

A wrap today is a sequence of static slides rendered in `WrapViewer`.
Users flip through them, read, close. There's no take-home artifact,
nothing to share with a teammate or post in a Slack channel — and nothing
that turns the year-end recap into the kind of visceral moment the
Spotify Wrapped comparison promises. The slides are good; they're also
forgettable.

Composer turns a generated wrap into a short music-synced video that the
user can save locally. A per-slice MusicGen track sets the mood from
"warm mentorship piano" to "punchy launches synth-pop"; an LLM does the
creative direction (per-slice prompt + beat-to-moment alignment); FFmpeg
stitches the slide screenshots and audio stems into a single MP4 with
crossfaded transitions landing on detected beats. Output is a personal
artifact — not auto-shared anywhere — that the user can drop in Slack,
post on LinkedIn, or just keep.

This spec covers the v1: a hosted Python service co-located with the
existing Azure backend, callable over HTTPS with the same JWT auth, that
takes pre-rendered slide PNGs + slice metadata and returns an MP4. It
deliberately does **not** cover slide motion (screencast), Tauri sidecar
integration, or any kind of editing UI — those are explicitly follow-ups
called out in Notes.

## Solution shape

Composer is a new Python service in a new `composer/` directory at the
repo root, peer to `server/` and `shared/`. It accepts an authenticated
POST, runs an async job in-process, writes the resulting MP4 to object
storage, and serves a status endpoint until the client downloads it. The
client (Next.js app) drives slide rendering — Composer never re-implements
slide visuals — and uploads PNGs alongside slice text in the same request.

### High-level pipeline

```
client                                         Composer service
──────                                         ────────────────
1. render each slide to PNG via
   html-to-image (one per slice,
   1080×1920 portrait + 1920×1080
   landscape variants)
2. POST /compose                                3. JWT verify (shared HS256
   { jobId, mode, slices[],                       secret with Node server)
     pngs[], modelId?, audioSeed? }
                                ──── HTTPS ───►  4. enqueue job (asyncio task,
                                                    in-memory state)
                                                 5. per slice in parallel:
                                                    a. director LLM call ──►
                                                       Node server route
                                                       /api/composer/direct
                                                       returns:
                                                       { musicgenPrompt,
                                                         moodTag, targetBpm,
                                                         energy }
                                                    b. MusicGen ──► audio stem
                                                       (~12s, 32kHz mono)
                                                    c. librosa beat detect on
                                                       stem
                                                 6. director LLM, pass 2:
                                                    given slice order +
                                                    detected beats per stem,
                                                    decide
                                                      • per-slice key-moment
                                                        timing (ms)
                                                      • crossfade in/out points
                                                        (must land on a beat)
                                                      • per-slice display
                                                        duration
                                                 7. FFmpeg compose: PNG
                                                    sequence + audio stems +
                                                    crossfade filter graph
                                                 8. write output.mp4 +
                                                    manifest.json to object
                                                    storage with 24h TTL
6. GET /compose/<jobId>            ◄────────────  9. 200 { status: "complete",
   (poll until status: complete)                       url, manifest }
7. download MP4 directly from
   object storage signed URL
```

### Repo layout

```
composer/                              (new, top-level)
  pyproject.toml                       uv-managed; pinned versions
  composer/
    __init__.py
    api/
      app.py                           FastAPI app; carries PRIVACY banner
      auth.py                          JWT verify, shares HS256 secret with Node server
      schemas.py                       pydantic models (mirror @wrapped/shared)
      routes.py                        /healthz, /compose, /compose/{jobId}
    pipeline/
      __init__.py
      orchestrator.py                  per-job state machine (asyncio)
      llm.py                           HTTPS client → Node /api/composer/direct
      musicgen.py                      stem generation (audiocraft musicgen-small default)
      beats.py                         librosa beat + onset detection
      director.py                      pass-2 LLM: align beats to slide moments
      compose.py                       FFmpeg argv builder + invocation
      fallback.py                      deterministic prompts/stems per category
    storage/
      blob.py                          object-store client (Azure Blob in prod)
      tmp.py                           bounded scratch dir per job
      signed_url.py                    short-lived download URLs
    settings.py                        pydantic-settings; env-driven
  scripts/
    dev.sh                             uvicorn --reload
  tests/
    unit/                              no model loads, no HTTPS
    integration/                       fixture wrap → end-to-end MP4 check
    privacy_invariants/                static-analysis tests (mirror Node)
    fixtures/                          one wrap JSON, one stem WAV, one PNG
  Dockerfile                           multi-stage; CPU base + GPU variant via build arg
  README.md
```

The Node server (`server/`) gains **one** new route,
`/api/composer/direct`, structurally identical to `/api/wrap` but with
the "creative director" system prompt. This keeps a single model
registry (`models.config.json`) and a single JWT secret. **Composer
never talks to Anthropic / Azure directly.** It only talks to the Node
server over HTTPS.

The client (`src/`) gets a "Make video" button in the wrap viewer plus a
small `src/lib/composer/client.ts` that owns html-to-image rendering,
upload, and polling.

### Auth

JWT issued by the existing register endpoint is forwarded by the client
in the `Authorization: Bearer …` header. Composer verifies with the same
HS256 secret as the Node server. Composer **does not** issue tokens.

Operationally the secret is provisioned through Azure Key Vault (or env,
depending on the runner). The verifier rejects tokens missing a valid
`sub`, exactly as the Node server does, and **never logs the token or
its claims**. See spec 20 for `kid`-aware verification once that lands.

### Job model

- A single FastAPI process handles routing **and** worker work via
  `asyncio.create_task`. v1 does **not** need Redis / Celery / RQ. State
  lives in a per-process dict keyed by `jobId`. A process restart drops
  in-flight jobs (acceptable: client polls and re-submits on a 404).
- Concurrency cap: one active MusicGen invocation at a time per process
  (model load + GPU memory). Beat detection and FFmpeg run unbounded.
- Per-job TTL: MP4 + manifest stay in object storage for 24h; in-memory
  job state evicts 1h after completion.

### Privacy banner + invariants

Composer mirrors the Node server's privacy contract. `composer/api/app.py`
opens with:

```python
# PRIVACY: Composer is stateless w.r.t. user contributions and slice
# content. Inputs are processed in-memory + scratch dir per job and
# deleted on completion. No user data is logged. Outputs (MP4 +
# manifest) are written to object storage with a 24h TTL. JWT claims
# are verified but never logged.
```

A new `composer/tests/privacy_invariants/` directory carries the
Python equivalent of `test/unit/privacy-invariants.test.ts`:

- Modules under `composer/composer/api/**` may not import a database
  client (sqlalchemy, redis, psycopg, etc.).
- Modules under `composer/composer/pipeline/**` may write only via
  `composer/storage/tmp.py:scratch_dir(jobId)`. Direct `open(...)` /
  `pathlib.Path(...).write_*` calls outside that helper fail the test.
- All log statements that touch slice-derived variables (`slice`,
  `slices`, `headline`, `body`, `signal`, `prompt`) → fail. Whitelist
  `len(...)` and aggregate counters.
- All routes carry a module-level `PRIVACY` banner comment matching a
  regex.

### Output manifest

Alongside `output.mp4`, Composer writes `manifest.json`:

```json
{
  "jobId": "…",
  "wrapMode": "year-end",
  "slices": [
    {
      "sliceKey": "velocity",
      "musicgenPrompt": "punchy synth-pop, 128bpm, energetic, major key",
      "moodTag": "high-energy",
      "stemDurationMs": 12000,
      "detectedBeats": [410, 879, 1342, 1810, 2280],
      "keyMomentMs": 2750,
      "displayDurationMs": 5400,
      "crossfadeInMs": 350,
      "crossfadeOutMs": 350,
      "fellBackTo": null
    }
  ],
  "outputMp4": "https://…?sig=…",
  "renderedAtUtc": "2026-05-10T14:30:11Z",
  "modelIds": {
    "director": "anthropic:claude-…",
    "musicgen": "facebook/musicgen-small"
  }
}
```

The manifest exists for two reasons: debugging "why does this section
sound off?" without re-running the whole pipeline, and a future
regenerate-with-tweaks UX.

### Failure handling

The principle: a single weak signal degrades quality, never blocks
delivery. Each fallback is recorded in the manifest's `fellBackTo` field.

- Director LLM failure on a slice → deterministic prompt template keyed
  by `slice.category` (delivery → "uplifting electronic 120bpm";
  mentorship → "warm acoustic piano 78bpm"; etc.). Same fallback shape
  as `fallbackForSlice` in `src/lib/ai/generate.ts`.
- MusicGen failure on a slice → 12s of low-volume rain noise from a
  shipped fixture. Composition continues.
- Beat detection failure on a stem → uniform stride (one transition per
  3s of stem).
- Director pass-2 failure → place each key moment at the slice's
  midpoint, snapped to the closest detected beat. No crossfade.
- FFmpeg failure → fail the whole job; surface a clipped stderr tail
  (last 2KB, scrubbed of file paths) in the status response.

### v1 scope cut: motion

Slides are **static images** in v1. Each PNG is held for the slice's
display duration with a beat-aligned audio crossfade transition. Framer
Motion is lost. This keeps the FFmpeg filter graph simple and the upload
size bounded (~5 MB per wrap at 1080×1920 PNG-8). A follow-up spec
addresses headless screencast (see Notes → Out-of-scope follow-ups).

## Rabbit holes

- **Don't run MusicGen in the API process long-term.** Even
  `musicgen-small` takes 10–30s of GPU time per stem and pins memory.
  v1 keeps it all in one process for simplicity (single-tenant
  assumption), but mark the module boundary cleanly so a future spec
  can promote `pipeline/` to a separate worker without rewriting.
- **Don't use `subprocess.run("ffmpeg …")` with f-strings.** Build the
  argv list explicitly and pass it as a list. LLM output flows into
  prompt text but **never** into FFmpeg argv — file paths derive from
  `jobId` only. Audit this in the privacy-invariants test.
- **Don't fetch slide visuals server-side.** The client renders + uploads
  PNGs. There must not be a "render slide on Composer" code path; it
  would mean a second source of truth for slide visuals and would force
  Composer to know about React.
- **Don't synthesise audio on the client.** Some teammates will suggest
  WebAudio + Tone.js. MusicGen quality is the point; degrading it to
  oscillators removes the magic. If MusicGen is unavailable, fall back
  to fixture stems (ships with the service), not to client-side synthesis.
- **Don't cache stems across jobs.** Each job's stems are tailored to
  its slices. The cache key would be the entire slice content, and
  that's exactly what we don't want sitting on the server. A per-user
  encrypted-at-rest cache is its own future spec.
- **Don't put slice content in URLs or query params.** All slice text
  travels in the JSON request body, over HTTPS, with the privacy banner
  in force. URLs hit logs we don't control (CDN, load balancer).
- **Don't try to make MusicGen deterministic by default.** v1 accepts an
  optional `audioSeed` for reproducibility in tests; production runs use
  a fresh seed each time so re-running gives the user a different feel.
- **Don't bypass the director LLM by passing slice text directly to
  MusicGen.** MusicGen's prompt grammar is its own thing — it wants
  genre/mood/instrumentation, not "shipped 12 PRs in March". That's
  what the director LLM is for.
- **Don't ship MusicGen weights in the Docker image's CPU base layer.**
  Pull the model on first boot from HuggingFace into a mounted volume.
  The CPU image stays < 4GB; the GPU variant adds CUDA but still pulls
  weights at runtime.

## No-gos

- **No Tauri sidecar in v1.** Composer is HTTPS-only. Tauri integration
  is a follow-up spec, and the answer when it lands is "Tauri calls the
  same HTTPS endpoint", not "bundle Python in the dmg".
- **No headless screencast / motion video.** Static slides only. The
  follow-up spec for motion will need to wrestle with `WrapViewer`
  driving its own clock; that's its problem, not this one.
- **No on-server slide rendering.** Client uploads PNGs; Composer never
  loads a browser, never installs Playwright, never sees JSX.
- **No model registry inside Composer.** `models.config.json` stays in
  one place (Node server). Composer asks the Node server which director
  model to use via `/api/composer/direct`, exactly the way the existing
  `/api/wrap` flow works.
- **No persistence of slice text.** Inputs live in the per-job scratch
  dir for the duration of the job and are deleted on completion or
  failure. Outputs (MP4 + manifest) reference only `sliceKey`, never
  re-emit `headline` / `body` / `signal`.
- **No analytics / telemetry beyond opaque counters.** v1 may emit
  counters for jobs, failures, and per-slice fallback rates. It must
  not emit slice text, prompt text, mood tags, or anything derived from
  user contributions.
- **No queueing infra (Redis, Service Bus, Celery).** v1 is in-process.
  Re-evaluate when concurrent users > 1.
- **No video uploads to third-party services from inside Composer.** The
  user retrieves the MP4 from object storage and decides what to do
  with it. Composer never posts to Slack, LinkedIn, etc.
- **No GPU dependency in CI.** All tests run on CPU; MusicGen tests use
  fixture stems, not the model.
- **No editing UI.** v1 is one button: "Make video". Tweaking moods,
  reordering slices, swapping tracks — all out of scope.
- **No watermarks, intros, outros, or branded title cards.** Output is
  the slides + audio. Anything else is a future product decision.

## Verification

Functional:

- **Round-trip integration test (CPU fixture mode)**: with a fixture
  wrap (10 slices), `POST /compose` → poll → download MP4. Assert the
  MP4 is well-formed (`ffprobe`), has audio + video streams, and total
  duration is within ±5 % of `sum(displayDurationMs)`. MusicGen is
  stubbed to return fixture stems so the test runs in seconds.
- **Beat alignment test**: a unit test seeds a synthetic stem with known
  beats at 0.5s intervals, runs `beats.detect`, asserts the detected
  beats match the seeded grid within ±20 ms.
- **Director alignment test**: with a stub LLM that always returns
  "place key moment at midpoint", assert the director's chosen
  `keyMomentMs` snaps to the closest detected beat (not exactly at
  midpoint). Bound the snap distance.
- **FFmpeg argv shape test**: build the argv for a 3-slice fixture,
  snapshot the list, assert no slice text or LLM output appears anywhere
  in argv — only file paths derived from `jobId`.
- **Auth tests**: `POST /compose` without a JWT → 401; with an expired
  JWT → 401; with a valid JWT → 202. (Once spec 20 lands, add: tokens
  signed under both old and new `kid` accepted during overlap window.)

Privacy invariants (new `composer/tests/privacy_invariants/`):

- Static analysis passes per the rules in "Privacy banner + invariants"
  above.
- A regex check that every route handler module begins with the
  `PRIVACY` banner comment.
- A check that `composer/` declares no dependency on `playwright`,
  `puppeteer`, or `selenium` (motion/screencast scope cut).
- A check that no file under `composer/` references a model id directly
  — model ids only flow through the Node server's registry response.

Operational:

- **CI workflow**: `composer/` has its own GitHub Actions job (lint with
  ruff, typecheck with mypy strict, tests with pytest). Job is cached
  on `pyproject.toml` lockfile.
- **Docker build**: `docker build composer/` produces a CPU image < 4 GB.
  GPU variant via `--build-arg variant=gpu`.
- **Smoke deploy**: a `tasks/runbooks/composer-deploy.md` mirrors spec
  14's structure: build image, push to ACR, deploy to Container Apps
  (chosen for GPU support; Function Apps don't fit the workload), curl
  `/healthz`, run a one-shot fixture job, confirm MP4 downloads via the
  signed URL.

## Notes

### Phasing

This spec is one shipping unit, but the agent may stage it as three PRs
in order. All four "mark spec done" edits (status flip, `## Done` block,
index row, changelog entry) land on the **last** PR:

1. **PR 1 (skeleton)**: `composer/` directory, FastAPI app, JWT verify,
   `/healthz`, `/compose` returning a hardcoded 5s silent MP4. Privacy
   invariants test. Docker build. CI green.
2. **PR 2 (pipeline)**: real director LLM call, real MusicGen with
   fixture-mode for tests, librosa beat detection, manifest.
3. **PR 3 (FFmpeg compose + client integration)**: FFmpeg filter graph,
   client-side `html-to-image` rendering, upload + poll UI in the wrap
   viewer's "Make video" button.

If appetite blows out, ship PRs 1 + 2 and follow-up the rest as a
separate spec; do **not** mark this spec done until end-to-end works
from the wrap viewer.

### Cross-spec dependencies

- **Spec 14 (server build + deploy artifact)** should land first. The
  Composer deploy runbook borrows directly from it, and the Node server
  needs to be deployable before the new `/api/composer/direct` route
  is testable in staging.
- **Spec 20 (JWT secret rotation)** intersects with Composer's auth
  module. v1 ships with single-secret HS256; once spec 20 lands,
  Composer's verifier picks up `kid`-keyed verification by re-using
  whatever helper the Node server lands on. Don't pre-build that
  helper here.
- **Spec 12 (encrypt pendingWrapRequests)** is unrelated but worth
  noting: Composer introduces no new client-side persistence, so the
  v3 → v4 schema bump in spec 12 doesn't need to know about Composer.

### Out-of-scope follow-ups (parking lot)

These are deliberately not in this spec. Promote each to its own spec
only after a real design conversation:

- Headless screencast slide rendering (preserve Framer Motion).
- Tauri sidecar / "Make video" without a network round-trip.
- Per-user, encrypted-at-rest stem cache.
- User-tweakable mood overrides ("more upbeat", "slower", "darker").
- Audio-only export (no video).
- Multi-language MusicGen prompts.
- Reorder slices for emotional arc (intro → climax → outro).
- Telemetry on creative choices (which moods land, regen rate) — bounded
  by the same redaction rules as the existing `/api/wrap` route.
- Promote `pipeline/` out of the API process into a worker.

### Files this spec touches

```
composer/                                      (new top-level package)
server/src/functions/composerDirect.ts          (new route, mirrors wrap)
server/src/ai/prompts/director.ts               (new system prompt)
.github/workflows/ci.yml                        (add composer job)
tasks/runbooks/composer-deploy.md               (new)
src/components/wrap/MakeVideoButton.tsx         (new client UI)
src/lib/composer/client.ts                      (new client; html-to-image + poll)
```

The Node-server bits sit on the `server` branch; the client bits on
`client`; the Python service on a new `composer` branch. Per CLAUDE.md,
the implementing agent should split work across branches (and across the
three staged PRs above) and not mix.
