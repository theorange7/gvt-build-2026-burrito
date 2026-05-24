# Spec 22 — Backend metrics & observability (App Insights + Azure Monitor)

**Status**: Shaped — ready to pick up
**Branch**: server (instrumentation, models config) + infra (alert rules, dashboards)
**Appetite**: medium (≤ 3 days)
**Last shaped**: 2026-05-17

## Problem

Today the server has no first-class signal for:

- Whether wraps are completing, generating, failed, or stuck.
- How long any function takes — there's no p50/p95 per endpoint.
- LLM token spend per model or per slice, or whether per-wrap cost is
  tracking sustainably.
- Per-slice fan-out quality. `Promise.allSettled` in `generateWrap` hides
  silent fallbacks, so a regressed prompt looks "successful" until users
  notice ugly slides.
- Whether Service Bus, Table Storage, or LLM providers are degrading.

The current failure modes:

- Worker crashes mid-generation → only signal is a user-reported stuck wrap.
- Anthropic starts rate-limiting → discovered when fallback slides start
  appearing in customer wraps days later.
- A prompt regression doubles token consumption → discovered on the next
  Azure invoice.

This spec adds the minimum operational visibility needed to run the
backend with confidence. It is **backend-only** — client telemetry is a
separate, deliberate decision (privacy posture, opt-in mechanics, a
first-party `/metrics` endpoint) that we are not bundling here.

## Solution shape

Application Insights + Azure Monitor only. No third-party SDK, no
sidecar collector. Five pieces, all in one PR.

### 1. `server/src/observability/` instrumentation library

A small typed wrapper around the Application Insights SDK so call sites
stay short and a privacy invariant test can enforce dimension hygiene.

```
server/src/observability/
  appInsights.ts     // initialize from APPLICATIONINSIGHTS_CONNECTION_STRING
                     // No-op when unset (dev/test/CI default).
                     // Enables auto-collection for HTTP, Azure SDK, Service Bus.
  instrument.ts      // withSpan(name, attrs, fn) wraps any async block;
                     // records duration + outcome (success | failure).
  metrics.ts         // Typed helpers: recordLLMCall, recordSliceResult,
                     // recordWrapStateTransition, recordCounter, recordCostUsd.
  dimensions.ts      // Allowlist of permitted dimension keys.
                     // Privacy invariant test asserts no other key is emitted.
  hashInstall.ts     // HMAC-SHA-256(installId, WRAP_JWT_SECRET) → 12 hex chars.
                     // Used as the `installHash` dimension. Raw installId never logged.
```

Every function entry wraps its body in `withSpan`. Every LLM call in
`server/src/ai/client.ts` is wrapped and emits an `llm.call` event.
Every per-slice resolve in `generateWrap` emits a `slice.result` event.

### 2. Events and metrics to emit

**Function-level (mostly auto-collected; we only fix operation names)**
- Duration, success/failure on `classify`, `wrapEnqueue`, `wrapGet`,
  `wrapWorker`, `authRegister`.
- Concurrent in-flight requests (App Insights surface).

**Wrap pipeline state**
- `wrap.enqueued` counter — dims: `{model, installHash}`.
- `wrap.state_transition` event — dims:
  `{from, to, durationMsSinceEnqueue, installHash}`.
- `wrap.completed` event — dims: `{model, durationMs, slicesSucceeded,
  slicesFallback, totalTokensIn, totalTokensOut, costUsd, installHash}`.
- `wrap.failed` event — dims: `{model, reason, durationMs, installHash}`.
- `wrap.queue_lag_ms` metric — recorded once at worker pickup.
- `wrap.in_flight` gauge — emitted from the worker by counting
  `wrapJobs` rows in `queued` and `processing`. Piggyback on the worker
  invocation; do not add a separate timer.
- `wrap.stuck` event — emitted by the Spec 10 TTL sweeper when it
  reclaims a stalled `running` row.

**Per-slice fan-out** (highest-value signal we lack today)
- `slice.result` event per slice — dims: `{sliceId, model,
  outcome=succeeded|fallback|failed, durationMs, inputTokens,
  outputTokens, costUsd, retryCount}`.

**LLM calls** (in `server/src/ai/client.ts`)
- `llm.call` event — dims: `{provider, model, slice, statusCode,
  durationMs, inputTokens, outputTokens, cachedTokens, retryCount,
  costUsd}`.
- `llm.retry` counter — dims: `{provider, model, attempt}`.
- `llm.cost_usd` metric — sum across dims for cost dashboards.

**Auth & abuse**
- `auth.register` event — dims: `{outcome=ok|ratelimited|rejected}`.
- `auth.token_verify_failed` counter.
- `concurrency.cap_hit` counter — dims: `{scope=install|global}`.

**Dependencies (auto-collected; verify only)**
- Outbound HTTP to Anthropic / Azure OpenAI / Ollama.
- Azure Table Storage and Service Bus SDK calls.
- These appear in the App Insights dependency map for free; the spec
  is to confirm the auto-collector is enabled in `appInsights.ts`.

### 3. Pricing in `models.config.json`

Extend the existing schema with an optional `pricing` block:

```json
{
  "id": "anthropic:claude-sonnet-4-6",
  "label": "Claude Sonnet 4.6",
  "provider": "anthropic",
  "modelId": "claude-sonnet-4-6",
  "pricing": {
    "inputPer1k": 0.003,
    "outputPer1k": 0.015,
    "cachedInputPer1k": 0.0003
  },
  "parameters": { "temperature": 1.0 }
}
```

- Zod-validated at import (like the rest of `models.config.json`).
- Provider adapters return token counts from the upstream response.
- AI client computes
  `costUsd = (inputTokens · inputPer1k + outputTokens · outputPer1k
              + cachedTokens · cachedInputPer1k) / 1000`
  at the call site and emits it on `llm.call`.
- `costUsd` per wrap is the sum across that wrap's 10 slice calls,
  computed in `generateWrap` and emitted on `wrap.completed`.
- If `pricing` is absent for a model, `costUsd` is emitted as `null`;
  tokens are still emitted so we don't lose volume signal.

### 4. Install identity = hashed token, never raw

`hashInstall(installId)` is HMAC-SHA-256 using `WRAP_JWT_SECRET` as the
key, truncated to 12 hex chars. Used as the `installHash` dimension on
every event that pertains to a specific install. The raw install id and
the JWT itself are **never** passed as a dimension or logged.

Daily-active-install count is derived (not emitted directly) via a
Kusto query against `installHash`:

```kusto
customEvents
| where name == "wrap.completed"
| summarize dcount(tostring(customDimensions.installHash))
            by bin(timestamp, 1d)
```

### 5. Distributed tracing across the queue

Enqueue and worker run in different processes connected by a Service
Bus message. App Insights' `operationId` is the link.

- In `wrapEnqueue.ts`, read the current operation id from App Insights
  context and stash it on the outbound Service Bus message
  `applicationProperties.aiOperationId`.
- In `wrapWorker.ts`, read it back and set it as the parent operation
  id for the worker's span. All 10 slice `llm.call` events then chain
  under the original `wrapEnqueue` trace.
- Verify with one end-to-end manual smoke after deploy: open App
  Insights Transaction Search, confirm a single tree from
  `wrapEnqueue` → `wrapWorker` → 10 × `llm.call`.

### 6. Dashboards & alerts (delivered as Terraform under `infra/`)

Three Azure Monitor workbooks (JSON committed to `infra/observability/`):

- **Wrap pipeline health**: state counts (queued / processing /
  completed / failed / stuck), queue lag p50/p95, end-to-end
  duration p50/p95, success rate per hour.
- **Cost**: $/day total, $/wrap rolling 24h, tokens per model, tokens
  per slice, top 10 most expensive slices.
- **Provider health**: per-(provider, model) success rate, latency,
  retry rate, 429 rate, fallback rate.

Alert rules (also in Terraform):

| Alert | Condition | Severity | Channel |
|-------|-----------|----------|---------|
| Stuck wraps | `wrap.stuck` count > 0 over 15 min | Sev 2 | page |
| Cost warning | daily `llm.cost_usd` sum > $10 | Sev 3 | email |
| Cost critical | daily `llm.cost_usd` sum > $15 | Sev 2 | page |
| Azure budget backstop | resource group spend > $20/day | Sev 2 | page |
| Function 5xx rate | > 2% over 5 min, any function | Sev 2 | page |
| Anthropic throttling | 429 rate > 5% over 5 min | Sev 3 | email |

Cost-threshold reasoning: 30 daily active users × roughly 100 classify
calls (Haiku-class) + 10 slice calls (Sonnet-class) per user per day
≈ **$3–5/day baseline**. $10 warning = 2× headroom; $15 page = 3×;
$20 budget backstop = 4× and independent of in-app math. Revisit
once we have two weeks of real data — these are starting numbers, not
SLO commitments.

## Rabbit holes

- **Don't add an OpenTelemetry SDK** alongside App Insights. The newer
  Application Insights SDK already speaks OTel underneath; adding a
  parallel OTel pipeline doubles instrumentation work and produces two
  conflicting traces.
- **Don't compute cost in a saved Kusto query** instead of in-process.
  Pricing is server-side config and changes when we add models; a saved
  query goes stale silently. Compute at the call site and emit a number.
- **Don't smuggle in client telemetry.** This spec is backend only. The
  client telemetry decision (privacy posture, opt-in mechanic, where
  the endpoint lives) is its own conversation. Don't add a `/metrics`
  endpoint, don't add a SDK to `src/`, don't change `src/lib/ai/`.
- **Don't log payload text, slice content, prompt text, or completion
  text as dimensions.** Token counts and outcomes are safe; the text
  itself is not. The dimension allowlist in `dimensions.ts` plus the
  extended privacy invariant test must catch this.
- **Don't emit `wrap.in_flight` from a timer trigger.** Piggyback on
  the worker invocation, which already scans the table. One source
  of truth.
- **Don't try to instrument cold starts manually.** App Insights
  already surfaces them. If they become a problem we fix that in a
  separate spec.
- **Don't add a "metrics admin" HTTP endpoint** to read aggregates.
  All read paths go through Azure Portal / Workbooks / Kusto. No new
  authenticated surface area.
- **Don't alert on individual slow wraps.** Aggregate signals only.
  Individual-wrap alerts page on noise; aggregate alerts page on real
  trends.

## No-gos

- Client telemetry of any kind. Separate spec.
- Third-party observability tools (Datadog, Honeycomb, New Relic,
  PostHog, Mixpanel).
- A Prometheus/Grafana sidecar.
- Per-user dashboards. Aggregate only.
- Logging raw install tokens, JWTs, IP addresses, prompt text, or LLM
  response text anywhere in the telemetry path.
- Auto-scaling rules tuned from these metrics. Capacity decisions are
  out of scope.
- Defining SLOs in this spec — we have no baseline yet. The dashboards
  let us set SLOs in a follow-up once we have ~2 weeks of real data.

## Verification

- **Unit (`server/test/unit/observability.test.ts`)**:
  - `withSpan` records duration and outcome on success and failure.
  - `recordLLMCall` rejects (typecheck + runtime) dimension keys not in
    the allowlist.
  - `hashInstall` is deterministic, depends on `WRAP_JWT_SECRET`, and
    produces no collisions across a 100k random-input sample.
  - `costUsd` arithmetic matches the pricing table for at least three
    representative models, including the cached-input path.
  - When `APPLICATIONINSIGHTS_CONNECTION_STRING` is unset, every
    helper is a no-op and no network calls are made.
- **Unit (extended `server/test/unit/privacy-invariants.test.ts`)**:
  - No call to `recordLLMCall` / `withSpan` / `trackEvent` /
    `trackMetric` anywhere in `server/src/` passes `installId`,
    `userId`, request body fields, response text, or IPs into
    dimensions.
  - All dimension keys used in `server/src/` are members of the
    `dimensions.ts` allowlist (static grep + AST scan).
  - `console.log` / `context.log` calls do not include token strings,
    payload bodies, or response bodies.
- **Unit (`server/test/unit/models.test.ts`)**:
  - `pricing` schema validates with all three fields and with only
    `inputPer1k` + `outputPer1k`.
  - Loading `models.config.json` succeeds for entries with and
    without `pricing`.
- **Integration**: with a fake App Insights channel, emitting a full
  wrap (enqueue → worker → 10 mocked LLM calls) produces a single
  operationId tree containing one `wrap.enqueued`, one `wrap.completed`,
  ten `slice.result`, and ten `llm.call` events. Token totals on
  `wrap.completed` equal the sum of the per-call totals.
- **Distributed trace check**: same integration run asserts every
  `llm.call` event carries the same `operation_ParentId` as the
  `wrapWorker` span, and that `wrapWorker.operation_ParentId` equals
  `wrapEnqueue.operation_Id`.
- **Manual smoke (post-deploy)**: trigger one real wrap; in App
  Insights Transaction Search, confirm the trace shape and that
  `costUsd` on `wrap.completed` is non-zero.
- **Terraform**: `terraform plan` under `infra/observability/` emits
  the three workbooks and six alert rules with no diff on a fresh
  `apply`.

## Notes

- Touches:
  - `server/src/observability/` (new)
  - `server/src/ai/client.ts` (capture tokens + compute cost + wrap in `withSpan`)
  - Each provider adapter under `server/src/ai/providers/*.ts`
    (return `{ text, inputTokens, outputTokens, cachedTokens }` from
    the upstream response)
  - `server/src/ai/generate.ts` (emit `slice.result` per resolve;
    emit `wrap.completed` aggregate)
  - `server/src/ai/models.ts` and `server/src/ai/models.config.json`
    (Zod `pricing` field; populate for currently-enabled models)
  - Each `server/src/functions/*.ts` (wrap entry in `withSpan`,
    operationId stash/restore in enqueue/worker)
  - `server/test/unit/privacy-invariants.test.ts` (extended)
  - `server/local.settings.json.example` (add
    `APPLICATIONINSIGHTS_CONNECTION_STRING` placeholder)
  - `infra/` (Function App setting, Service Bus message-property
    forwarding if needed, new `observability/` module with workbooks
    and alert rules)
- Interacts with **Spec 10** (TTL sweeper): the sweeper emits
  `wrap.stuck` when it reclaims a stalled row. Either land Spec 10
  first or coordinate the event name across both PRs.
- Interacts with **Spec 20** (JWT key rotation): `hashInstall` uses
  `WRAP_JWT_SECRET`. A key rotation changes all install hashes —
  acceptable, since DAU continuity across rotation is not a
  requirement. Document the rotation date in the operator runbook so
  the discontinuity is explicable.
- Anthropic prompt caching requires surfacing `cache_read_input_tokens`
  from the response — verify the current Anthropic adapter exposes it
  before relying on the cached-input cost path.
- Cost reasoning (per "Solution shape" §6) assumes ~30 DAU. Re-derive
  when DAU shifts materially; the alert thresholds are not load-bearing
  decisions, they're a starting position.
- **Out of scope, future specs**:
  - Client-side telemetry (anonymous counters via a first-party
    `/metrics` endpoint, opt-in default).
  - Formal SLOs with error budgets, once we have a baseline.
  - Auto-deploy of dashboard/alert changes (today they live in
    `infra/` and require `terraform apply`).
