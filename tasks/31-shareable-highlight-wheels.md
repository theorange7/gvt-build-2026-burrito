# Spec 31 — Shareable highlight wheels (public bundle + revoke)

**Status**: Shaped — ready to pick up
**Branch**: both (server + client; small infra change)
**Appetite**: large (≤ 1 week)
**Last shaped**: 2026-05-14

## Problem

A generated wrap is, today, a private artifact. It lives encrypted in the
user's IndexedDB, renders inside `WrapViewer`, and dies when the tab closes.
There is no way to send "look at my year" to a teammate, a manager, or a
LinkedIn audience without screen-recording the dashboard. The Spotify-Wrapped
comparison promises a shareable moment; the product currently delivers a
private one.

We want one new affordance: when a user generates a wrap, they can tick
"make this shareable". The backend, in addition to returning the usual JSON,
produces a small standalone static bundle (an `index.html` plus a handful of
assets) and uploads it to object storage under an unguessable URL. The user
gets a "Copy share link" button next to the wrap, and a "Stop sharing"
button that revokes the link.

Two follow-on considerations shaped this spec:

1. **Privacy doesn't get traded for convenience.** Sharing is opt-in per
   wrap, identifiers (`userId`, `installId`, `externalId`) never appear in
   the bundle, and the URL is a 128-bit-entropy slug — unlisted, not
   indexed. Public-by-URL, not public-by-search.
2. **Spec 30 (music-synced video) is coming.** When the composer lands, it
   will produce an MP4 that should slot into the same shared artifact. This
   spec deliberately reserves the storage path for it but does not render
   any video.

## Solution shape

When the client enqueues a wrap with `share: true`, the existing
`wrapWorker` runs its normal 10-slice fan-out, then performs a publish step:
stamp the wrap's slice JSON into a pre-built viewer template, upload the
result to Azure Blob Storage under an unguessable slug, record the
ownership mapping in Table Storage, and return the public URL in the job
result. The client surfaces the URL plus a revoke button. Revoke deletes
the blobs and tombstones the slug.

The viewer bundle is **pre-built once at deploy time** (not per request).
The worker only copies template assets and stamps in `data.json`. There is
no Next.js rendering happening inside the Function.

### Storage layout (Azure Blob Storage)

A new container `wraps` configured for `BlobAnonymousReadAccess` (object
read, **not** container listing). Layout per shared wrap:

```
wraps/
  {slug}/
    index.html        ← inlines wrap data via <script type="application/json" id="wrap-data">
    assets/
      viewer.js       ← copied from the server's deploy-time bundle
      viewer.css
      fonts/…         ← only if needed; prefer system fonts
    video.mp4         ← RESERVED for spec 30; not written in v1
```

`{slug}` is 22 chars of `base64url(crypto.randomBytes(16))` — 128 bits of
entropy, URL-safe, no hyphens. Public URL form:

```
https://<storageAccount>.blob.core.windows.net/wraps/{slug}/index.html
```

Or, if a `WRAP_SHARE_BASE_URL` is configured (CDN / custom domain), the
server returns that prefix instead. The blob path is identical either way.

### Pre-built viewer template

A new top-level `share-viewer/` package, peer to `server/` and `shared/`:

```
share-viewer/
  src/
    main.ts            ← entry: reads window's inline JSON, mounts the slide carousel
    components/        ← reuses slide visuals from src/components/slides via a thin import shim
    styles.css
  index.template.html  ← <script type="application/json" id="wrap-data">{{WRAP_JSON}}</script>
  esbuild.config.mjs
  package.json
```

Built with esbuild to a single `viewer.js` + `viewer.css` (no SSR, no
Next.js, no Framer Motion if it bloats — a CSS transition between slides is
acceptable for v1). The bundle is checked into the server deploy artifact
under `server/dist-share-viewer/` via the existing build script (see
spec 14).

`index.template.html` contains a literal `{{WRAP_JSON}}` placeholder. The
worker does string replacement (not template engine) — the JSON is escaped
via `JSON.stringify(payload).replace(/</g, '\\u003c')` to defeat
`</script>` injection. No other templating.

### Ownership table

A new Azure Table Storage entity set `shareLinks`:

| Field        | Type    | Notes                                                       |
|--------------|---------|-------------------------------------------------------------|
| PartitionKey | string  | First 2 chars of `slug` (load-balance partition fanout)     |
| RowKey       | string  | Full `slug`                                                 |
| installId    | string  | From the install JWT that enqueued the wrap                 |
| jobId        | string  | The originating wrap job                                    |
| createdAt    | ISO8601 | Server clock at publish time                                |
| displayName  | string? | Optional, opt-in display name from the share request        |

No `userId`, no IP, no user-agent. The table exists for one purpose:
authorising a revoke. There is no listing endpoint.

### Server changes

- **`POST /wrap`** — accept optional `share: boolean` and `shareName?: string`
  in the request body (Zod-validated, max 80 chars on the name, scrubbed of
  control chars). When `share` is omitted or false, behaviour is unchanged.
- **`wrapWorker`** — after slice generation succeeds, if `share=true`:
  1. Generate slug.
  2. Render `index.html` via template stamp.
  3. Upload `index.html` + a copy of the static assets to
     `wraps/{slug}/…` using `@azure/storage-blob` + `DefaultAzureCredential`.
  4. Insert a row into the `shareLinks` Table Storage entity.
  5. Write `shareUrl` and `shareSlug` into the existing `wrapResults` row
     alongside the JSON.
- **`GET /wrap/{jobId}`** — response gains optional `shareUrl` and
  `shareSlug` fields when present.
- **`DELETE /wrap/share/{slug}`** (new function) —
  - Require install JWT.
  - Look up `shareLinks[slug]`; 404 if missing.
  - Reject with 403 if `installId` on the row does not match the JWT's
    `installId`.
  - Delete `wraps/{slug}/*` blobs (list-by-prefix then delete-batch).
  - Delete the `shareLinks` row.
  - 204 on success.

All new function files carry the `PRIVACY` banner. None log slugs,
installIds, or blob paths — only opaque error codes via `safeError`.

### Client changes

- **Generate Wrap modal** (`src/components/dashboard/`): add a single
  checkbox "Share this wrap with a public link" plus a one-line caveat
  ("Anyone with the link will be able to view this wrap until you delete
  it"). When checked, reveal an optional "Display name" text input (max
  80 chars) — this is the only field that propagates into the bundle title
  bar.
- **Enqueue path** (`src/lib/ai/generate.ts`): forward `share` and
  `shareName` only when the box is ticked. Default behaviour unchanged.
- **Wrap card / WrapExperience header**: when a wrap has a stored
  `shareUrl`, show two buttons — `Copy link` and `Stop sharing`. "Stop
  sharing" calls the new DELETE endpoint, clears `shareUrl` /
  `shareSlug` from the local wrap row, and updates the card immediately.
- **Local store** (`src/lib/local-store/wraps.ts`): extend the encrypted
  wrap envelope to include `shareSlug` and `shareUrl` as part of the
  encrypted payload (not as plaintext columns). The unlock key already
  protects everything else on the row; share metadata gets the same
  envelope.

### Privacy / invariants

- **Bundle never contains identifiers.** `installId`, `userId`,
  `externalId`, email addresses, repo URLs from sliced contribution text,
  IP, and user-agent all stay out of the bundle. Slice text content is
  emitted as-is — sanitising slice text is an explicit no-go for v1 (see
  below).
- **Slug is unguessable.** 128 bits of entropy, generated with
  `crypto.randomBytes`. Never derived from `jobId`, `installId`, or any
  user input.
- **No telemetry in the bundle.** `viewer.js` contains zero `fetch`,
  `XMLHttpRequest`, `navigator.sendBeacon`, or third-party script loads.
  A static-analysis test asserts this against the built bundle.
- **No indexing.** The viewer template emits
  `<meta name="robots" content="noindex,nofollow,noarchive">`. The blob
  container disables anonymous listing; only object reads with the full
  path work.
- **Display name is opt-in.** Default share emits a generic title
  ("Wrapped for Work — 2026"). User-supplied name appears nowhere else.

### Infra (Terraform under `infra/`)

- One new `azurerm_storage_container` named `wraps` with
  `container_access_type = "blob"` (object reads only, no listing).
- Function app gets `Storage Blob Data Contributor` on the container via
  the existing managed identity.
- One new app setting `WRAP_SHARE_BASE_URL` (optional CDN override).
- No new Key Vault entries; the storage account uses managed identity.

### Future hook — spec 30 video

When the composer lands, its worker uploads `video.mp4` to
`wraps/{slug}/video.mp4` for any wrap with an active share. The viewer
template already includes a runtime check:

```html
<a id="video-link" href="./video.mp4" hidden>Watch the video</a>
<script>
  fetch('./video.mp4', { method: 'HEAD' })
    .then(r => { if (r.ok) document.getElementById('video-link').hidden = false; })
    .catch(() => {});
</script>
```

This HEAD is the **one** allowed network call from the bundle. It is
same-origin, no body, no identifiers, and tolerates offline (the link
stays hidden). The static-analysis test allows exactly this one fetch via
an allowlisted pattern; everything else is forbidden.

If you decide the HEAD probe is too much network for v1 because it
violates "offline-viewable", remove the probe and have spec 30 do an
explicit "republish bundle to flip the flag" step instead. Either is fine;
pick one in implementation and document the choice in `## Done`.

## Rabbit holes

- **Don't run Next.js inside the Function.** The viewer is a separate
  esbuild bundle pre-built at deploy time. Trying to SSR the existing
  `WrapViewer` per-request inside the worker will fight Functions cold
  starts, Next's runtime expectations, and the worker's memory budget.
- **Don't use SAS tokens.** They are long, ugly, and re-introduce
  expiry semantics we explicitly chose against. Public-read container +
  unguessable slug is the agreed model.
- **Don't sanitise slice text.** Slice content is what the user
  generated; rewriting it server-side would change wrap meaning and add a
  failure surface. The privacy contract for shared bundles is: identifiers
  out, content as-is. If a user is uncomfortable, the right answer is
  "don't tick the box".
- **Don't make slugs human-readable.** Customisable slugs (`/alex-2026`)
  defeat unguessability and create namespace collisions. The slug is a
  capability token, not a username.
- **Don't add a "list my shared wraps" server endpoint.** The client
  already knows which wraps it shared (the slug lives in the encrypted
  wrap row). Adding a server-side list creates exactly the kind of
  identifier-keyed lookup we've spent the rest of the codebase avoiding.
- **Don't bundle Framer Motion** if it pushes the viewer over ~150 KB
  gzipped. CSS transitions + minimal JS are enough for v1. The marketing
  story is "you can save this and email it"; bundle weight matters.
- **Don't trust the slug as auth.** `DELETE /wrap/share/{slug}` requires
  the install JWT **and** verifies that the JWT's `installId` matches the
  one stored in the `shareLinks` row. Slug possession alone is not enough
  to revoke (otherwise a leaked link becomes a deletion capability).
- **Don't add a Service Bus message for publishing.** The publish step is
  a few hundred milliseconds at the tail of an already-async worker run;
  inline is correct. A separate queue would complicate retry semantics
  for no real benefit.

## No-gos

- **No video rendering in this spec.** v1 reserves the path; spec 30 fills
  it. If you find yourself writing FFmpeg or MusicGen code, you are off
  the rails.
- **No TTL / expiry.** Permanent until user deletes. No background
  sweeper, no metadata-driven expiration policy. (Operational follow-up
  if abuse becomes a thing — file a new spec.)
- **No analytics / view-counting** on shared bundles. Zero telemetry, even
  anonymous. This is a hard privacy line in v1.
- **No editing the live `wraps` table schema** to add plaintext share
  metadata columns. Share state stays inside the existing encrypted
  envelope.
- **No password-protected share links** in v1. Capability URL + revoke is
  the model. Password-gated sharing can be a follow-up if customers ask.
- **No re-publish on wrap edit.** Wraps are not editable today; if that
  changes, that spec covers the cascade.
- **No AWS S3.** We're on Azure; Blob Storage covers the use case. The
  "S3 because it's straightforward" framing was about object storage, not
  about adding a second cloud.

## Verification

- **Server unit — bundle renderer**: stamping the template with a fixture
  wrap produces an `index.html` whose only network reference is the
  optional same-origin `./video.mp4` HEAD probe (asserted by regex over
  the built bundle source). Assert no occurrences of `installId`,
  `userId`, `externalId`, the input JWT, or the slug inside the bundle
  body (the slug is only in the URL).
- **Server unit — slug entropy**: generated slug is 22 chars, decodes to
  16 bytes, and 10,000-sample test sees no duplicates.
- **Server integration — publish path**: `wrap` worker called with
  `share=true` uploads `index.html` + assets (MSW for blob in test), writes
  a `shareLinks` row, and surfaces `shareUrl`/`shareSlug` in the job
  result. Repeat with `share=false` — assert zero blob writes and zero
  table writes.
- **Server integration — revoke**: DELETE with the correct install JWT
  removes all `wraps/{slug}/*` blobs and the `shareLinks` row, returns
  204. DELETE with a different installId's JWT returns 403 and leaves
  blobs in place. DELETE for an unknown slug returns 404.
- **Client unit — wrap row envelope**: round-trip a wrap with
  `shareSlug`/`shareUrl` through `wraps.ts`; assert raw IDB row contains
  neither value in plaintext.
- **Client e2e**: tick "Share" → wrap generates → "Copy link" appears →
  fetch the URL anonymously → page renders slides without the dashboard
  chrome. "Stop sharing" → URL returns 404. Re-tick "Share" on the same
  wrap is **not** supported in v1 — assert UI hides the checkbox once
  the wrap is generated.
- **Privacy invariant additions** (extend both
  `test/unit/privacy-invariants.test.ts` and
  `server/test/unit/privacy-invariants.test.ts`):
  - `share-viewer/dist/viewer.js` contains no `fetch(`, `XMLHttpRequest`,
    `sendBeacon`, or third-party hostnames (allowlist: `./video.mp4`
    HEAD if kept).
  - `server/src/functions/wrapWorker.ts` does not log slug, installId, or
    blob paths.
  - `server/src/functions/wrapShareDelete.ts` exists and starts with the
    `PRIVACY` banner.
- **Offline check (Playwright)**: download the built `index.html`, open
  it as `file:///…/index.html`, assert the slide carousel mounts and
  renders the first slide. (If you keep the video HEAD probe, accept the
  CORS/file:// failure silently — the page still works.)

## Notes

- Relates to **spec 30** (music-synced video). The blob path
  `wraps/{slug}/video.mp4` is reserved here; spec 30 will read it.
- Relates to **spec 14** (server build + deploy artifact). The viewer
  bundle output needs to land in the server deploy artifact at
  `server/dist-share-viewer/`. Coordinate the build step.
- Relates to **spec 20** (JWT rotation). DELETE auth uses the existing
  install JWT verification middleware — no new key paths.
- Branch: `claude/shareable-highlight-wheels-DONk5`.
- Once shipped, add a `Tasks.md` follow-up entry for "password-protected
  share links if customers ask" so we don't lose the option.
