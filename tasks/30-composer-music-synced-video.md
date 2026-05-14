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

## Testing

The pipeline has three slow dependencies — MusicGen inference, LLM
calls, and FFmpeg I/O. Real-loop testing all three on every change
is too slow for both the developer's edit-test loop and CI's per-PR
budget. This section pins the test architecture so the spec doesn't
get quietly redesigned by an agent who hits the first slow test.

### Test layers

| Layer | When it runs | Wall-clock | What it covers |
|-------|--------------|------------|----------------|
| `unit` | every save | < 2 s total | pure functions, schemas, FFmpeg argv builder, beat detect on synthetic clicks, privacy invariants |
| `integration` (fixture mode) | every PR | < 30 s total | full pipeline, real FFmpeg, **stubbed MusicGen + LLM** backed by golden artifacts |
| `live-musicgen`, `live-llm`, `smoke-live` | manual / pre-release | minutes | real model weights + real LLM; gated by env vars |

### Local: fast loop

`composer/tests/unit/` is no-network, no-model, no-subprocess. Targets:
schema parsing, FFmpeg argv builder (snapshot-test the list), fallback
prompt mapping, beat detection against a numpy-generated click track,
privacy invariants. Goal: `pytest composer/tests/unit/` under 2 s,
runnable on save via an editor watcher.

### Local: integration with golden samples

`composer/tests/integration/` runs the full pipeline with real FFmpeg
but **stubbed MusicGen and LLM**. Both stubs read from artifacts checked
into `composer/tests/fixtures/`:

```
fixtures/
  wrap-year-end-10slice.json     synthetic SliceContent[]
  pngs/                          pre-rendered slide PNGs (downsampled)
  stems/                         WAVs (~12s, 22kHz mono) — one per mood category
  beats/                         detected-beats JSON per stem
  llm/
    pass1-responses.json         recorded director-LLM responses by sliceKey
    pass2-response.json          recorded pass-2 response for the fixture wrap
  golden/
    manifest.json                expected manifest.json (renderedAtUtc + outputMp4 redacted)
    mp4-metadata.json            expected `ffprobe -show_streams` output (creation_time redacted)
```

`pipeline/musicgen.py` and `pipeline/llm.py` honour
`COMPOSER_FIXTURE_MODE=1`. In fixture mode, `musicgen.generate(...)`
returns the bytes of `fixtures/stems/<moodTag>.wav` via a deterministic
`sliceKey → moodTag` map; `llm.direct_call(...)` returns the recorded
response. The JWT verifier itself stays live — tests inject a real
signed token via a helper.

Assertions in fixture-mode integration:

- The produced MP4 matches `golden/mp4-metadata.json` on stream count
  and codec strings, and on total duration within ±50 ms.
- The produced manifest.json matches `golden/manifest.json` after
  redacting `renderedAtUtc` and `outputMp4`.
- Running the same fixture-mode test twice produces an identical
  manifest (excluding redacted fields). Non-determinism is a bug —
  flag and fix, don't add tolerance.

### Golden sample regeneration

Goldens drift when the prompt template, MusicGen pin, FFmpeg flag set,
or the fixture wrap itself changes. A regen script —
`composer/scripts/regen_goldens.py` — re-runs the live paths against
the fixture wrap and rewrites artifacts in place:

```bash
COMPOSER_FIXTURE_MODE=0 LLM_LIVE=1 MUSICGEN_LIVE=1 \
  python -m composer.scripts.regen_goldens \
    --wrap composer/tests/fixtures/wrap-year-end-10slice.json \
    --out composer/tests/fixtures/
```

The resulting diff is reviewed in PR. Surprising movement — all beats
shifted 200 ms, manifest grew a new field, MP4 duration jumped — is
the test signal you want to see.

**Never auto-regen goldens in CI.** A stale golden is the failure mode
we're relying on; auto-refreshing erases it.

### Local: live (gated)

Mirrors the Node-side `INTEGRATION_LIVE=1` pattern with three env-gated
markers under `composer/tests/integration/live/`:

- `MUSICGEN_LIVE=1 pytest -m musicgen_live` — pulls
  `facebook/musicgen-small`, generates a single 4 s stem, asserts a
  valid WAV comes back. ~2 min on CPU; ~10 s on GPU.
- `LLM_LIVE=1 pytest -m llm_live` — hits a locally-running Node
  server's `/api/composer/direct`, asserts response shape. Requires
  `az login` (Anthropic via the existing dispatch path) plus
  `pnpm -C server dev` running on a known port.
- `COMPOSER_LIVE=1 pytest -m smoke_live` — both of the above plus the
  full pipeline → real MP4 → ffprobe. Longest test in the codebase;
  budget ~5 min.

None of these run in default CI. They exist for pre-PR smoke checks,
post-deploy validation, and golden regen.

### CI: per-PR

`.github/workflows/ci.yml` adds a `composer` job:

```yaml
composer:
  runs-on: ubuntu-latest
  timeout-minutes: 8
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-python@v5
      with: { python-version: '3.12' }
    - uses: actions/cache@v4
      with: { path: ~/.cache/uv, key: uv-${{ hashFiles('composer/uv.lock') }} }
    - run: uv sync --frozen --project composer
    - run: ruff check composer/ && ruff format --check composer/
    - run: mypy --strict composer/
    - run: pytest composer/tests/unit/ -q
    - run: COMPOSER_FIXTURE_MODE=1 pytest composer/tests/integration/ -q
    - run: pytest composer/tests/privacy_invariants/ -q
    - run: docker build composer/ --build-arg variant=cpu -t composer:ci
    - run: ./composer/scripts/check-image-size.sh composer:ci 4096   # MB
```

Budget: 8 min. The integration step uses **only** golden fixtures —
no model pulls, no HTTPS, no GPU — so wall-clock is dominated by
`uv sync` + `docker build`, not by the actual test work.

What CI deliberately does **not** do:

- Pull MusicGen weights (fixture stems substitute).
- Hit a real LLM (recorded responses substitute).
- Run on GPU (CPU + fixtures only).
- Auto-regen goldens (stale = signal).
- Run `live-musicgen` / `live-llm` / `smoke-live` (manual only).
- Push the Docker image (release-on-tag is a separate spec).

### Test data hygiene

- Fixture wrap JSON contains **synthetic** slice content — never copied
  from a real user's wrap. A unit test flags suspiciously real-looking
  identifiers (URLs containing real domains, project names matching
  internal repos, etc.).
- Fixture PNGs render the synthetic wrap, not screenshots of a real one.
- Recorded LLM responses are scrubbed of provider usage / cost / debug
  metadata before commit. The regen script handles this — don't write
  raw provider responses by hand.
- Stems are treated as artifacts, not source: regenerate them when the
  prompt grammar changes; don't preserve them across breaking changes.

## Deployment & dependencies

Reference: [`Echooff3/azure-musicgen-tools`](https://github.com/Echooff3/azure-musicgen-tools).
That repo targets Azure ML for **training** runs; Composer is an
**inference + compose** service, so the deployment shape differs.
Useful borrowings: GPU SKU sizing (T4 / V100 trade-off), spot-instance
cost framing, model-weights-in-blob pattern. Things that don't carry
over: Azure ML managed endpoints (we want a long-running FastAPI app
that also runs FFmpeg + writes blobs, not a `score.py` scoring
endpoint).

### Hosting target

**Azure Container Apps** with workload profiles, in the same resource
group as the Node server.

- **API tier**: Consumption profile (CPU only). Handles request
  routing, JWT verification, FFmpeg compositing, blob upload. Scales
  to zero.
- **Worker tier**: Consumption-GPU profile —
  `Consumption-GPU-NC8as-T4` (NVIDIA T4) — runs MusicGen. v1 ships
  API + worker in the same container image and the same Container App
  with min-replicas=0, max-replicas=1. The worker becomes a separate
  Container App when concurrency demands it (Rabbit holes already
  flag the module boundary for this split).

Compute alternatives considered and rejected:

- **Azure ML managed endpoints** (the reference repo's choice): right
  for pure-inference scoring; wrong for a service that also runs FFmpeg
  + writes blobs + holds asyncio jobs. Adds an Azure ML control plane
  we don't otherwise need.
- **Azure Container Instances**: supports GPU but no scale-to-zero
  revisions or built-in ingress; we'd reinvent both.
- **AKS**: overkill for v1.
- **Azure Functions (Premium with GPU)**: not a real offering.

### LLM path: Azure Foundry stays on the Node side

Composer never calls Azure Foundry directly in v1. The shape is:

```
Composer (Python) ──HTTPS──► Node server /api/composer/direct ──Azure Foundry──► LLM
```

The Node server already authenticates to Foundry via
`DefaultAzureCredential` (`src/lib/ai/client.ts`); Composer's only LLM
config is the Node server's internal URL plus the user's JWT. One
identity boundary, one model registry.

If a future spec wants Composer to talk to Foundry directly (e.g. to
remove a hop on the director-pass-2), the Python mirror is
`azure-identity.DefaultAzureCredential` + `azure-ai-projects` —
analogous to the Node side's `getAzureOpenAIClient`. **Explicitly out
of scope here**; v1 keeps Foundry credentials off Composer's managed
identity.

### Container image: two variants, one Dockerfile

Build via `docker build composer/ --build-arg variant=cpu|gpu`.

| Variant | Base image | Use |
|---------|------------|-----|
| `cpu` | `python:3.12-slim-bookworm` | CI, local dev, fixture-mode tests, CPU-only fallback prod |
| `gpu` | `nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04` + Python 3.12 (deadsnakes PPA) | Production worker on Consumption-GPU profile |

Multi-stage layout:

1. **deps**: `apt-get install` system packages, then `uv sync --frozen`.
2. **runtime**: copy `composer/`, set non-root user, `ENV
   COMPOSER_FIXTURE_MODE=0`, expose 8080, healthcheck `/healthz`.

GPU variant additionally installs `torch==<pin>+cu121` from
`https://download.pytorch.org/whl/cu121`. CPU variant uses the matching
CPU torch wheel from PyPI. The torch + audiocraft pin pair is the most
volatile dep in the tree — verify both wheels on first build and
record the pinned versions in `composer/pyproject.toml` and the lock.

### System packages (apt)

Both variants:

- `ffmpeg` — Composer's compositor.
- `libsndfile1` — librosa runtime.
- `sox`, `libsox-fmt-mp3` — audiocraft + librosa codecs.
- `libgomp1` — numpy / torch OpenMP runtime.
- `ca-certificates`, `curl` — TLS + healthchecks.

### Python dependencies

Declared in `composer/pyproject.toml`; versions pinned at
implementation time and locked via `uv lock`. The shape:

Runtime:
- `fastapi`, `uvicorn[standard]`
- `pydantic`, `pydantic-settings`
- `pyjwt[crypto]` — JWT verify, HS256 to match the Node server
- `httpx` — Node server calls
- `azure-storage-blob`, `azure-identity`, `azure-keyvault-secrets`
- `audiocraft` — MusicGen
- `torch` (variant-specific wheel)
- `transformers` (audiocraft pulls it; pin explicitly)
- `librosa`, `soundfile`, `numpy`

Dev:
- `ruff`, `mypy`
- `pytest`, `pytest-asyncio`, `pytest-mock`
- `respx` — httpx test stubs for the Node server

### Model weights: HuggingFace cache on Azure Files

`facebook/musicgen-small` (~1.5 GB) is **not** baked into the image.
Pulled on first cold-start into a HuggingFace cache that's mounted
from an **Azure Files share** so weights persist across replicas:

- Azure Files share: `composer-hf-cache` (5 GB quota).
- Mount path: `/cache/huggingface`.
- `ENV HF_HOME=/cache/huggingface TRANSFORMERS_CACHE=/cache/huggingface`.

We use Azure Files (POSIX mount) rather than Blob (object semantics)
because HuggingFace's cache layout assumes a filesystem. The reference
repo uses Blob for **finished training artifacts** — a different
access pattern. The cache survives redeploys, scale events, and SKU
changes.

### Blob storage (output)

Outputs land in a dedicated storage account, separate from any other
application data:

- Storage account: existing or new (small marginal cost).
- Container: `composer-output` (private; access via signed URLs only).
- Lifecycle policy: **delete blobs ≥ 24h old**, enforced at the
  storage layer — so a Composer bug can't retain user data past TTL.
- Access: Container App's managed identity has Storage Blob Data
  Contributor scoped to that container only.

### Key Vault & managed identity

Composer's Container App is assigned a **system-assigned managed
identity** with these grants:

| Grant | Resource | Purpose |
|-------|----------|---------|
| Storage Blob Data Contributor | `composer-output` container | Write MP4s + manifests, mint signed URLs |
| Storage File Data SMB Share Contributor | `composer-hf-cache` share | Write to HF cache on first cold-start |
| Key Vault Secrets User | shared Key Vault (`wrap-secrets`) | Read JWT signing secret |
| Cognitive Services User | Foundry resource | **Not granted in v1**. Only if a future spec moves the LLM path into Composer. |

Secrets read at boot via `azure-identity.DefaultAzureCredential`:

- `JWT_SIGNING_SECRET` — shared with Node server. Spec 20's `kid` map
  drops in once that lands.
- `NODE_SERVER_URL` — internal HTTPS endpoint of the Node server's
  `/api/composer/direct` route.
- No Anthropic or Foundry keys on Composer's identity in v1.

### Azure resources summary

| Resource | Notes |
|----------|-------|
| Container Apps Environment | Existing or new; must enable workload profiles + Consumption-GPU profile |
| Container App: `composer` | Min replicas 0, max 1 in v1; ingress external HTTPS |
| Storage Account | Either reuse the wrap server's or provision new — output container is namespaced |
| Blob container: `composer-output` | 24h lifecycle policy |
| Azure Files share: `composer-hf-cache` | 5 GB |
| ACR | Reuse the wrap server's registry |
| Key Vault: `wrap-secrets` | Reuse the Node server's |
| Managed Identity (system-assigned) | RBAC grants per the table above |

### Build & deploy

Following spec 14's pattern: build → push → deploy is operator-driven,
not auto-merge.

1. `pnpm composer:build` (wraps `docker build composer/ --build-arg variant=gpu -t composer:<sha>`).
2. `pnpm composer:push` (`az acr login` + `docker push <ACR>/composer:<sha>`).
3. `az containerapp update --name composer --image <ACR>/composer:<sha>`.
4. Smoke: `curl https://composer.../healthz` → 200; one fixture job
   end-to-end.

Documented in `tasks/runbooks/composer-deploy.md`. CI builds the CPU
image and pushes nothing (see Testing → CI: per-PR).

### Cost envelope (reference-grade)

Drawn loosely from `azure-musicgen-tools`'s reported numbers, adjusted
for inference rather than training. Not a contract; revisit after the
first weeks of real usage.

- API tier (Consumption, scale-to-zero): ~$0 idle.
- GPU worker (Consumption-GPU T4, scale-to-zero): ~$0 idle; ~$0.50/h
  active. A 10-slice wrap is ~10 stems × 10–30 s each on T4 ≈ 2–5 min
  active GPU time, so ~$0.02–$0.05 per wrap in GPU.
- Storage + Key Vault baseline: ~$5/month.
- Azure Files HF cache (5 GB): < $1/month.
- Outbound bandwidth: dominated by MP4 download; ~$0.05 per 1 GB
  egress, so a single user generating ~daily wraps stays under $1/mo.

### Out of scope here

- **Bicep / Terraform IaC** for Composer's resources. v1 deploy is
  `az` CLI from the runbook, mirroring spec 14. A follow-up infra
  spec adds IaC.
- **Auto-deploy on tag / merge.** Manual deploy only.
- **Multi-region**. Single region matches the rest of the stack.
- **Reserved or savings-plan GPU.** Consumption-GPU fits spiky use.
- **A100 / V100 SKUs.** T4 is sufficient for `musicgen-small`; larger
  models or `musicgen-medium` may push us up the SKU ladder, but
  that's a separate model-quality decision.

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
- **Spec 31 (shareable highlight wheels)** reserves a public blob path
  at `wraps/{slug}/video.mp4` for Composer to drop the MP4 into when a
  wrap is shared. Composer's primary output stays in the private
  `composer-output` container with the 24h TTL — that flow is unchanged
  and the signed URL is still what the user gets back. The hook for
  spec 31 is an **additional** write: when the originating wrap has a
  `shareSlug` (the worker enqueueing the compose job passes it through
  in the request body), Composer copies the finished MP4 into the
  `wraps` container under that slug. The shared bundle's HEAD probe
  for `./video.mp4` then lights up automatically — no re-rendering of
  the published `index.html`. Composer needs `Storage Blob Data
  Contributor` scoped to the `wraps` container in addition to its
  existing grant on `composer-output`. If spec 31 has not yet shipped,
  drop the dual-write silently — it's gated on the presence of
  `shareSlug` in the request.

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
