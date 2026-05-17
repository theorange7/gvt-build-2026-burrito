# Spec 60 — Ollama local provider

**Status**: Done
**Branch**: server (with a tiny docs touch on the client)
**Appetite**: small (≤ 1 day)
**Last shaped**: 2026-05-15

## Problem

Today every wrap generation hits a paid, network-bound LLM: Anthropic
direct or Azure Foundry. That makes three groups of users second-guess
the app:

1. **Cost-sensitive demoers.** Running a wrap through Sonnet across all
   10 slices isn't free. Engineers playing with the dashboard for an
   afternoon — especially the "regenerate just to see what happens"
   loop — burn tokens that come out of someone's budget.
2. **Privacy-conscious users.** Even though signal text is the only
   thing that egresses, "egresses to Anthropic / Microsoft" is a real
   blocker for some users. The `file-upload` spec (50) already
   acknowledged egress is the sharpest knife in our drawer; Ollama is
   the opposite affordance — a path with **zero outbound egress** for
   the generation step.
3. **Offline / air-gapped dev.** Anyone iterating on prompts (the
   slice authors in `server/src/ai/prompts/`) burns real money on
   every cycle, and can't iterate at all on a plane / in a vault /
   behind an SSO interstitial that intercepts `api.anthropic.com`.

What we want: a third provider entry in `models.config.json`,
`provider: 'ollama'`, that points the existing `callModel` dispatcher
at a locally-running [Ollama](https://ollama.com) instance. Picking an
Ollama model in the UI's model dropdown should "just work" the same way
picking a different Anthropic model does — same slice fan-out, same
job queue, same poll-for-result flow — with the **only** difference
being that the per-slice HTTP call goes to `http://localhost:11434`
instead of `api.anthropic.com` or an Azure Foundry endpoint.

The framing is deliberately small: this is **one more provider in the
dispatcher**, not a new architecture. The fact that Ollama happens to
be local is an operational detail (great for cost & privacy, awkward
for cloud-hosted Functions — see No-gos), not a structural one. A more
ambitious "the client talks to Ollama directly, skipping the server
entirely" path is a separate, larger spec — listed under Notes.

## Solution shape

Three small pieces, all server-side except for one schema tweak:

1. **`models.config.json` + `models.ts`** — extend the provider enum
   with `'ollama'`. A new optional field `baseUrl` (string, URL) lets a
   single deployment target different Ollama hosts per model entry
   without forcing a global env var.
2. **`callModel` dispatcher** — new branch `callOllama` that POSTs to
   `${baseUrl}/api/chat` using the Ollama chat-completions schema,
   threads `model.parameters` through `options`, and surfaces failures
   through the same `UpstreamError` codes the other providers use.
3. **Local dev plumbing** — `server/local.settings.json.example` gets
   an `OLLAMA_BASE_URL` line documenting the override path; the
   `models.config.json` ships with one inert example entry
   (`local:llama3.1-8b`) commented in the docs but **not enabled by
   default**, so a fresh clone without Ollama installed doesn't
   surface a broken option in the UI.

There is **no client-side change** other than the implicit one of the
new model appearing in `/models` once an operator adds it to the
config. The thin-client invariant (CLAUDE.md hard rule 2) is unchanged.

### Config schema additions (`server/src/ai/models.ts`)

```ts
const ModelOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  provider: z.enum(['anthropic', 'azure-foundry', 'ollama']),  // + ollama
  modelId: z.string().min(1),
  version: z.string().optional(),
  baseUrl: z.string().url().optional(),                         // + new
  parameters: z.record(ParameterValueSchema).optional(),
});
```

A config entry looks like:

```json
{
  "id": "ollama:llama3.1-8b",
  "label": "Llama 3.1 8B (Ollama, local)",
  "provider": "ollama",
  "modelId": "llama3.1:8b",
  "baseUrl": "http://localhost:11434",
  "parameters": { "temperature": 0.7, "num_ctx": 8192 }
}
```

`baseUrl` resolution order, evaluated per call:

1. `model.baseUrl` from the config entry (most specific).
2. `process.env.OLLAMA_BASE_URL` (deployment-wide override).
3. Hard default `http://localhost:11434`.

`modelId` is whatever the user typed into `ollama pull` — the tag is
forwarded verbatim. The validator stays loose here (just `min(1)`); we
do **not** maintain a list of known Ollama models.

### `callOllama` (additions to `server/src/ai/client.ts`)

New branch in `callModel`:

```ts
if (model.provider === 'ollama') return callOllama(systemPrompt, userMessage, model);
```

Implementation outline — deliberately a near-twin of `callAnthropic`,
not a new abstraction:

```ts
async function callOllama(
  systemPrompt: string,
  userMessage: string,
  model: ModelOption,
): Promise<string> {
  const baseUrl = model.baseUrl
    ?? process.env.OLLAMA_BASE_URL
    ?? 'http://localhost:11434';

  const payload = {
    model: model.modelId,
    stream: false,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userMessage   },
    ],
    options: model.parameters ?? {},
  };

  let lastError: UpstreamError | null = null;
  for (const [index, delay] of RETRY_DELAYS.entries()) {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      // Connection refused / DNS failure / abort — Ollama not running.
      throw new UpstreamError('ollama_unreachable');
    }
    if (response.ok) {
      const data = (await response.json()) as {
        message?: { content?: string };
      };
      const text = data.message?.content;
      if (!text) throw new UpstreamError('parse_failed');
      return text;
    }
    if (response.status === 404) throw new UpstreamError('not_found', 404); // model not pulled
    if (response.status === 429 || response.status >= 500) {
      lastError = new UpstreamError(
        response.status === 429 ? 'rate_limited' : 'upstream_5xx',
        response.status,
      );
      if (index < RETRY_DELAYS.length - 1) {
        await sleep(delay);
        continue;
      }
    } else {
      throw new UpstreamError('upstream_4xx', response.status);
    }
  }
  throw lastError ?? new UpstreamError('rate_limited');
}
```

A new error code `ollama_unreachable` joins the `UpstreamError` set in
`server/src/privacy.ts`. It is the *only* new code; everything else
reuses what's already there. The `safeError` mapping should treat
`ollama_unreachable` as a 503 with a user-facing hint
("Ollama isn't reachable at <baseUrl>. Start it with `ollama serve`
and pull the model.") that names the URL but **not** the request body.

### Privacy guarantees

These are explicit so the privacy-invariant test can lock them down:

- **No request-body logging.** The existing module-level PRIVACY
  banner in `client.ts` already covers this; the new branch reuses
  the same patterns (`console.log` is absent in the call path; errors
  flow through `UpstreamError`).
- **No URL logging beyond config.** The `baseUrl` may contain a host
  the operator considers internal. We may log the *configured* URL
  once at startup (via the existing models-loaded log line if any),
  but never per-request. The `safeError` hint above is fine because
  it's a user-facing response, not a server-side log.
- **No auth header.** Ollama doesn't authenticate. We send no
  credentials; we also don't add an `Authorization` header from any
  env var "just in case" — see Rabbit holes.
- **No SSRF foothold.** `baseUrl` is operator-controlled (config file
  or env var), not user-controlled. We do **not** accept a `baseUrl`
  on the wire from any client request — it stays in
  `models.config.json` and `OLLAMA_BASE_URL`.

### Local dev plumbing

`server/local.settings.json.example` gains a commented section:

```jsonc
// Ollama (optional). Override the base URL if Ollama runs elsewhere on
// your network. Per-model overrides via models.config.json's baseUrl
// field take precedence.
// "OLLAMA_BASE_URL": "http://localhost:11434"
```

The README's "Where to look first when something breaks" table in
`CLAUDE.md` gains one row:

| Symptom                                  | Start here                            |
|------------------------------------------|---------------------------------------|
| Wrap generation 503 "Ollama unreachable" | `ollama serve` running? `OLLAMA_BASE_URL` correct? `ollama pull <model>` for the configured `modelId`? |

### What does *not* change

- `models.config.json` ships with no Ollama entry enabled by default.
  Operators opt in by adding one. A fresh clone behaves identically
  to today.
- `callClaude` (the deprecated direct-Anthropic shim) is untouched.
  Ollama is reachable only through `callModel` / `resolveModel`.
- No new function file. No new HTTP route. No queue changes. No
  client changes beyond the dropdown rendering whatever the server
  reports.
- The slice fan-out in `generate.ts` is unchanged. Each of the 10
  slices makes the same `callModel(systemPrompt, userMessage,
  modelId)` call regardless of provider; only the dispatch target
  differs.

## Rabbit holes

- **Streaming responses.** Ollama supports `stream: true` (NDJSON
  framing). Tempting because the UI could render slices progressively.
  Wrong for V1 because the entire pipeline downstream of `callModel`
  assumes a single string return value — adopting streaming means
  refactoring `shared.ts`'s JSON parse path, the slice generators,
  and the wrap worker. Keep `stream: false` and revisit only with
  measured demand.
- **Adding a "local mode" toggle to the UI.** The model picker
  already differentiates providers via the `label` field. A separate
  toggle is a second source of truth that will drift. The dropdown
  is enough.
- **Auto-detecting installed Ollama models via `/api/tags`.** Looks
  helpful — show only models the user has pulled — but it (a)
  requires the Functions host to reach the user's Ollama at startup
  before the config is loaded (chicken-and-egg with deployment
  topology) and (b) means the `/models` response varies per-request
  by upstream state, breaking caching. Keep the config file as the
  source of truth.
- **Forwarding an `Authorization` header.** Some users front Ollama
  with a reverse proxy that requires bearer auth. We don't support
  that in V1. Adding it pulls in "where does the secret live" / "how
  does it rotate" / "does it log" questions that don't fit a small
  spec. If the demand is real, it's a follow-up that re-uses the
  same Key Vault story as `WRAP_JWT_SECRET`.
- **Picking a "good default" Ollama model and shipping it enabled.**
  Different machines can run different sizes. Shipping
  `llama3.1:8b` enabled means a fresh clone shows a broken option
  in the dropdown if Ollama isn't installed. Ship the entry
  **commented out** in the config, with an example in the README,
  and let the operator opt in.
- **Treating Ollama as a "free tier" for rate-limit policy.** The
  `concurrency.ts` per-install caps exist to protect upstream
  spend. Ollama has no upstream spend but very real *local* compute
  cost. The simplest correct thing is to apply the same caps;
  letting Ollama bypass them invites a runaway-tab DoS-ing the
  user's own machine.
- **Trying to use Azure Foundry's "OpenAI-compatible" path against
  Ollama by setting `baseUrl` on an `azure-foundry` entry.** Ollama
  is *almost* OpenAI-compatible at `/v1/chat/completions`, but the
  retry-status semantics and the SDK's auth handshake (Azure AD
  token via `DefaultAzureCredential`) make this brittle. We add a
  dedicated `'ollama'` provider rather than overload `'azure-foundry'`
  with a baseUrl escape hatch.
- **Persistent client (keep-alive / connection pool).** Node's
  global `fetch` (undici) already pools per-origin. A custom agent
  to "keep the model warm" is a micro-optimization the V1 spec
  doesn't need — Ollama's own `keep_alive` request option in
  `parameters` is the right knob if it matters.

## No-gos

- **Cloud-hosted Functions reaching a user's local Ollama.** Out of
  scope. The deployment story for V1 is: an operator running the
  Functions host on the same machine (or LAN segment) as Ollama,
  which is the realistic shape for `func start` dev, the Tauri
  shell's bundled-server mode, and homelab self-hosting. We do
  **not** ship tunneling, NAT punch, or any "BYO Ollama from the
  internet" path. The disclosure in the UI for cloud-hosted users
  is: simply don't add an Ollama entry to your config.
- **Letting the wire payload specify `baseUrl` or any Ollama-specific
  knob.** The `/wrap` and `/classify` request bodies do not gain
  any new field. All Ollama configuration is server-side.
- **Logging Ollama request or response bodies.** Same rule as every
  other provider — `UpstreamError` codes only.
- **Auto-pulling models from the server.** We do not call
  `/api/pull` from `callOllama`. If the configured `modelId` isn't
  on the host, the request gets a `404` and the user sees the
  `not_found` hint. Pulling models is an operator action.
- **Falling back from Ollama to a cloud provider on failure.** If the
  user picked an Ollama model and Ollama is down, surface the error
  — do **not** silently retry against Anthropic. That defeats the
  privacy choice the user made when they selected the local model.
  The existing `fallbackForSlice` in `generate.ts` returns a
  *placeholder slice*, not a different provider, which is the
  correct behaviour and stays unchanged.
- **A `models.config.json` schema breaking change.** The new
  `baseUrl` field is **optional**; existing Anthropic / Azure
  entries are untouched and the validator must continue to accept
  them as-is. Adding `baseUrl` to a non-Ollama entry is allowed by
  the schema but ignored by `callAnthropic` / `callAzureFoundry` —
  do not silently start honouring it for those providers without a
  separate spec.

## Verification

- **Schema**: `pnpm -C server typecheck` passes. A new unit test
  (`server/test/unit/models.config.test.ts`, extending the existing
  one if present) confirms:
  - `provider: 'ollama'` is accepted.
  - `baseUrl` is optional and, when present, must parse as a URL.
  - A duplicate-id check still trips when two ollama entries share
    `id`.
- **Dispatcher**: `callModel` routes a `provider: 'ollama'` model to
  `callOllama` (asserted via a tiny `vi.spyOn` test).
- **Happy path** (`server/test/unit/ai/ollama.test.ts`, MSW-mocked):
  POSTs to `http://localhost:11434/api/chat`, returns
  `data.message.content`, threads `parameters` through `options`,
  and sets `stream: false`.
- **Per-model baseUrl precedence**: a config entry with
  `baseUrl: "http://example.local:11434"` and an env var
  `OLLAMA_BASE_URL=http://other:11434` results in the request going
  to `example.local`.
- **Connection refused**: `fetch` throws → `UpstreamError` with code
  `ollama_unreachable`. `safeError` maps it to 503 with the
  configured `baseUrl` in the hint **and no other URL anywhere
  else**.
- **Model not pulled**: 404 from Ollama → `UpstreamError('not_found',
  404)`; error response includes hint to `ollama pull <modelId>`,
  not the request body.
- **Rate-limit / 5xx retry**: 429 / 503 → retries with the existing
  `RETRY_DELAYS` schedule; gives up after the last delay with
  `rate_limited` / `upstream_5xx`.
- **Privacy invariants** (extension of
  `server/test/unit/privacy-invariants.test.ts`):
  - `client.ts`'s `callOllama` branch contains no `console.*` calls.
  - `safeError` does not surface `baseUrl` for non-`ollama_unreachable`
    codes (i.e. a normal 4xx from Ollama doesn't leak the URL into
    the hint).
- **End-to-end smoke** (manual, runbook-style — added as a note in
  `tasks/runbooks/`, not automated): with Ollama installed and
  `llama3.1:8b` pulled, enabling the example config entry produces
  a wrap whose slices are real (not placeholders), with the Anthropic
  / Azure clients never invoked. Asserted by `vi.spyOn` in an
  integration test that mocks Ollama and fails the test if either
  the Anthropic `fetch` call or the Azure OpenAI client constructor
  is touched.

## Notes

- This spec deliberately stays small — one more `provider:` value in
  the existing dispatcher, no architectural moves. The bigger,
  more interesting design — **client talks to Ollama directly,
  bypassing the server's `/wrap` queue entirely** — is a separate
  future spec. That path would:
  - Carve out a documented exception in CLAUDE.md hard rule 2 (the
    thinness invariant), since `src/lib/ai/` would gain an Ollama
    HTTP client.
  - Move slice prompt construction into `shared/` (or a new
    `prompts/` package) so the same fan-out logic runs in both
    environments.
  - Skip the Service Bus / Table Storage pipeline entirely when an
    Ollama model is selected, removing the only remaining server
    hop for fully-local users.
  Worth doing eventually — it's the cleanest "all local" story and
  meaningfully simpler operationally for the Tauri target — but
  it's a medium-or-large spec, not a small one. Land **this** spec
  first; the appetite for the bigger one becomes obvious once
  operators have actually used Ollama through the existing
  pipeline.
- Cross-reference: the file-upload spec (50) is the *opposite*
  affordance — explicit egress with prominent disclosure. Together
  the two specs frame the privacy spectrum: 50 is the "I'll trade
  some privacy for magic" end, 60 is the "I'll trade some magic for
  total privacy" end. Worth a paragraph in the README's
  "Local-first?" section when 60 lands, citing both.
- The `parameters` blob is forwarded verbatim into Ollama's
  `options`, which means power users can tune `num_ctx`,
  `num_predict`, `top_k`, `top_p`, `repeat_penalty`,
  `keep_alive`, etc. without code changes. Document the most
  common ones with a comment in `models.config.json` when the
  example entry is added.
- Open follow-up parking lot (`Tasks.md`, not specs):
  - Reverse-proxy auth header support (bearer token via Key Vault).
  - `/api/tags`-driven dynamic model list.
  - Streaming-response support across the wrap pipeline.
  - Wire `@azure-rest/ai-inference` for non-OpenAI Foundry models
    (Phi / Llama / Mistral served by the Model Inference API) — this
    was already a parking-lot item before Ollama and remains
    independent of it.

## Done

**Completed**: 2026-05-16
**PR**: claude/ollama-llm-adapters-8DpaB (branch)
**Summary**: Added `provider: 'ollama'` to the model catalog, optional
`baseUrl` on every entry, and a `callOllama` adapter that POSTs to
`${baseUrl}/api/chat` with `stream: false`, threads `parameters` into
Ollama's `options` blob, and reuses the existing `RETRY_DELAYS`
schedule. A new `ollama_unreachable` code joined the privacy allowlist;
`UpstreamError` now carries an optional `hint` so the unreachable case
can name the configured baseUrl and the 404 case can suggest
`ollama pull <modelId>` — both surface via `safeError` without ever
embedding upstream response bodies.

**Deviation from the Solution shape**: the spec described
`callOllama` as a near-twin of `callAnthropic` added inside
`client.ts`. The user (alongside picking up the spec) asked to look
for refactoring opportunities that make new providers trivial, so the
three providers were extracted into
`server/src/ai/providers/{anthropic,azureFoundry,ollama}.ts` and
`client.ts` was reduced to a `Record<ModelProvider, ProviderAdapter>`
dispatcher. The exhaustive `Record` type means an unregistered
provider is a compile error. No behavior changes for the existing
Anthropic / Azure Foundry paths; the `callClaude` shim still works
for `classify.ts`. `models.config.json` ships with **zero** Ollama
entries enabled (asserted in tests) — operators opt in.

Verification: `pnpm -C server typecheck` clean; `pnpm -C server test`
passes 101 tests across 13 files (added `test/unit/ai/ollama.test.ts`,
`test/unit/ai/dispatcher.test.ts`, `test/unit/ai/models-config.test.ts`,
plus extensions to `privacy-invariants.test.ts` and
`privacy-safeerror.test.ts`).
