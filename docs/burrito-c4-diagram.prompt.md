# Burrito C4 Architecture Diagram — Generation Prompt

> **Usage:** Feed this file to Claude (via Claude Code, API, or chat) whenever the architecture changes.
> The output is a single self-contained `burrito-c4.html` HTML file. Drop it into your repo and render with Vite / CRA / Next.
>
> **CI trigger:** Run on any PR that modifies `docs/architecture/**` or `src/` to keep the diagram current.

---

## SYSTEM PROMPT

```
You are an expert technical diagrammer. Your task is to produce a single self-contained HTML file
that renders a C4 Container-level architecture diagram. You must follow every constraint in this prompt
exactly. Output ONLY the HTML file — no explanation, no markdown fences, no preamble.
```

---

## USER PROMPT

Produce a file called `burrito-c4.html` — a single self-contained HTML component rendering
a C4 Container diagram for the Burrito system. Follow every rule below exactly.

---

### 1. Canvas and layout

- Canvas: `width=1440 height=870`, `viewBox="0 0 1440 870"`.
- Background: dark dot-grid pattern (`#07111F` fill, `#0B1E30` grid lines at 40px spacing).
- All layout uses **named coordinate constants** at the top of the component function
  (e.g. `AUTH_X`, `WRAP_Y`, `COMP_R`) so coordinates are readable and editable, not magic numbers.
- Minimum gap between sibling boxes: **44px vertical, 28px horizontal**.
- Minimum gap between a box and its enclosing boundary stroke: **18px on all sides**.

---

### 2. Color palette — do not deviate

```js
const C4 = {
  person:    { bg: "#1B4F8A", border: "#0D3468", text: "#fff", sub: "#9EC5F5" },
  auth:      { bg: "#0D5C45", border: "#08402F", text: "#fff", sub: "#5FD9B0" },
  container: { bg: "#1168BD", border: "#0A4F94", text: "#fff", sub: "#9EC5F5" },
  component: { bg: "#2C6EA6", border: "#1C508A", text: "#fff", sub: "#B8D8F5" },
  external:  { bg: "#555555", border: "#383838", text: "#fff", sub: "#C0C0C0" },
  storage:   { bg: "#0F6674", border: "#084650", text: "#fff", sub: "#7DD5DF" },
  test:      { bg: "#4A2E7A", border: "#321D56", text: "#fff", sub: "#C0A0F0" },
  bound:     { fill: "rgba(17,104,189,0.05)", stroke: "#1168BD" },
  extbound:  { fill: "rgba(85,85,85,0.05)",   stroke: "#505050" },
};
```

Active/selected box highlight stroke: `#FFD060`, strokeWidth 2.5.
Arrow color: `#4A8EC4`, opacity 0.82. Arrow label background: `#07111F`, opacity 0.92.
Dashed arrows (test routes): strokeDasharray `"5,4"`.

---

### 3. Typography

```js
const MONO = "'IBM Plex Mono', monospace";
const SANS = "'IBM Plex Sans', sans-serif";
```

Load via Google Fonts link tag inside the wrapper div.

- Box label: MONO, bold, 12px, white.
- Tech tag: SANS, italic, 8.5px, `c.sub` color, formatted as `[tech name]`.
- Box description: SANS, 9px, `c.sub` color, lineHeight 1.45, center-aligned via foreignObject.
- Boundary label: MONO, bold, 10px, boundary stroke color, on a `#071524` pill rect.
- Arrow label: SANS, 9px, `#7AB6E0`.
- Legend: SANS, 9.5px, `#4A6A8A`.

---

### 4. Primitive components — implement exactly these four

**`Box({ x, y, w, h, type, label, tech, desc, active, onClick })`**
Rounded rect (rx=6) filled with `C4[type].bg`. Tech tag at y+17, label at y+34 (with tech) or y+24 (without).
Description in a foreignObject. Drop shadow filter `url(#sh)`.

**`Cylinder({ x, y, w, h, label, tech, desc, onClick })`**
Storage shape: rect + top ellipse (ry=11) + inner highlight ellipse (`#0A7A8A`).
Used only for Azure Blob Storage containers.

**`Person({ x, y, w, label, sub })`**
Circle head (r=14) above a rounded rect body. Shows label, sub-label, and `[Person]` tag.

**`Boundary({ x, y, w, h, label, kind })`**
Dashed rect (rx=12, strokeDasharray `"8,5"`) with a pill label badge that overlaps the top edge (y-10).
`kind='external'` uses `C4.extbound` colors (gray stroke/fill) instead of the default blue.
System and client boundaries use default (blue). Contribution Sources and LLM Providers boundaries use `kind='external'`.

**`Arrow({ x1, y1, x2, y2, label, dashed, cx1, cy1, cx2, cy2, lx, ly })`**
Straight line when no control points; cubic bezier (`C`) when cx1/cy1/cx2/cy2 provided.
Label position overrideable via `lx`/`ly`. SVG marker `#arr` (filled triangle, 8×8).

---

### 5. Architecture — render these containers in this topology

#### Column layout (left to right)

1. **Left column**: Contribution Sources [External] boundary (leftmost, outside all system boundaries)
2. **Client column**: Person + Client [Browser / Tauri] boundary
3. **Adapter strip**: thin vertical Adapter Layer between Client and Azure system
4. **Azure system**: Auth Service, Backend Services boundary (Wrapper Generator, Queue, Classifier, Import Handler), Composer, Azure Blob Storage cylinders
5. **Far-right column**: LLM Providers [External] boundary (outside the Azure boundary) — Anthropic API, Azure AI Foundry, OLLAMA

#### Boundaries (render before boxes so boxes sit on top)
1. **Contribution Sources [External]** — leftmost column, `kind='external'`, dashed gray. Wraps the Pull Providers box. Clickable → opens `providers` detail panel.
2. **Client [Browser / Tauri]** — second column boundary, dashed blue, wraps the 5 client components.
3. **Burrito System [Azure]** — outer system boundary, wraps Auth Service, Backend Services, Composer, and Azure Blob cylinders.
4. **Backend Services [Container Apps]** — inner sub-boundary inside the Azure boundary, wraps Wrapper Generator, Queue, Contribution Classifier, and Import Handler. Clickable → opens `backend` detail panel.
5. **LLM Providers [External]** — far-right column, `kind='external'`, dashed gray. Wraps Anthropic API, Azure AI Foundry, OLLAMA. Clickable → opens `llm` detail panel.

#### Person
- **User** — type `person`, sub "Browser / Tauri". Sits above the Client boundary, horizontally centered over it.

#### Contribution Sources (type `external`, inside Contribution Sources boundary)
- **Pull Providers** — tech "GitHub · GitLab · Jira", desc "OAuth PKCE + cursor-based event sync via ContributionProvider adapters"

#### Client components (type `component`, inside Client boundary, stacked vertically with 36px gaps)
1. Contribution Timeline — tech "UI component", desc "Sync providers + manual input"
2. Wrapped Viewer — tech "UI component", desc "Playback, request and completed state"
3. Auto Classifier — tech "WASM / JS", desc "Pre-classification before upload"
4. Personal Vault — tech "IndexedDB", desc "Encrypted local contribution store"
5. **File Import Panel** *(new)* — tech "UI component", desc "Two-step modal: label → file + egress disclosure · POST /import"

#### Adapter Layer
Thin vertical strip (width 22px) between Client boundary right edge and Auth Service.
Filled `#0F2540`, dashed stroke `#1A3A60`. Rotated label "Adapter Layer" (MONO, 8.5px, `#2A5A90`).

#### Auth Service (type `auth`, standalone gateway)
- tech: "Azure API Management"
- desc: "Token validation · Route dispatch\nAll traffic enters here first"
- **GATEWAY badge**: small pill rect (fill `#0D5C45`, stroke `#5FD9B0`) on the top-right corner of the box.
- This box is clickable — opens detail panel for `auth`.

#### Backend Services (inside Backend Services boundary)
Four boxes stacked vertically with 44px+ gaps:
1. **Wrapper Generator** — type `container`, tech "Azure Container Apps", desc "Orchestrates wrap: 10 slice fan-out via callModel(). Writes result to Blob Shareable."
2. **Queue** — type `component`, tech "Azure Service Bus", desc "Async job queue for generation tasks"
3. **Contribution Classifier** — type `container`, tech "Azure Container Apps", desc "ML pipeline: tags and categorises contributions"
4. **Import Handler** *(new)* — type `component`, tech "Azure Functions", desc "POST /import — LLM extraction, 256 KB cap, no persistence"

The Backend Services boundary itself is clickable — opens detail panel for `backend`.

#### Composer (type `container`, independent — outside Backend Services boundary)
- tech: "Azure Container Apps  [independent]"
- desc: "Assembles slides + music. Auth routes /compose here directly."
- **INDEPENDENT badge**: small pill rect (fill `#1168BD`, stroke `#9EC5F5`) on the top-left corner.
- Clickable — opens detail panel for `composer`.
- Positioned below the Backend Services boundary, vertically aligned with it.

#### Azure Blob Storage (Cylinders, right column inside Azure boundary)
- **Blob: Shareable** — tech "Azure Blob Storage", desc "cache · owner:asset\nowner r/w · all:r". Clickable → `shareable` panel.
- **Blob: Download** — tech "Azure Blob Storage", desc "Final packaged wraps for user download"

#### UAT Agent (type `test`)
- tech: "Playwright", desc: "Unit · Integration · e2e — pre-demo validation"
- Positioned below Auth Service with ≥50px gap.

#### LLM Providers (type `external`, inside LLM Providers boundary — **outside** the Azure system boundary)
Three boxes stacked vertically:
1. **Anthropic API** — tech "api.anthropic.com", desc "Classify · Wrap generation · File import\n3-attempt retry on 429/529"
2. **Azure AI Foundry** — tech "*.services.ai.azure.com", desc "LLM-as-a-Service via AIProjectClient\nDeployment name = modelId"
3. **OLLAMA** — tech "Local LLM Runtime", desc "Local model inference (opt-in)\nDefault: localhost:11434"

---

### 6. Arrows — render before boxes

| From | To | Label | Style |
|---|---|---|---|
| Person | Client boundary top | "uses" | solid |
| Pull Providers right | Contribution Timeline left | "sync pull" | solid, cubic bezier (arc right-then-up) |
| Client (via Adapter) | Auth Service left | "JSON contract" | solid |
| Auth right (top) | Wrapper Generator left | "POST /wrap" | solid, cubic bezier |
| Auth right (mid) | Queue left | "enqueue" | solid, cubic bezier |
| Auth right (lower-mid) | Contribution Classifier left | "POST /classify" | solid, cubic bezier |
| Auth right (near-bottom) | Import Handler left | "POST /import" | solid, cubic bezier |
| Auth bottom | Composer left | "POST /compose" | solid, cubic bezier, routes downward |
| Wrapper Generator right (top) | Anthropic API left | "callModel()" | solid, cubic bezier arcing **above** Blob cylinders |
| Wrapper Generator right (bottom) | Blob Shareable top | "store result" | solid, cubic bezier |
| Composer right | Blob Download left | "write asset" | solid, cubic bezier (goes up-right) |
| UAT Agent top | Auth bottom | "test all routes" | **dashed**, straight vertical |

All arrow fan-outs from Auth use cubic bezier control points to avoid overlapping the Backend Services boundary.
The callModel() arrow from Wrapper Generator to Anthropic API must arc **above** the Blob cylinders (route at y ≈ 155–165, well above BSHARE_Y).

---

### 7. Detail panels

Use in-memory `panel` state (no localStorage). Clicking a clickable container calls `tog(key)`.
Render the panel below the SVG as a dark card (`background: #0C1D2E`), with a left border in the container's `sub` color and a close button.
Items are displayed in a CSS grid (minmax 210px).

Panel definitions:

**auth** — "Auth Service [Gateway]"
- 🔐 Token Validation — "Verifies Bearer tokens on every inbound request before passing to any service"
- 🗺️ Route Dispatcher — "Inspects path prefix — routes /wrap, /classify, /queue, /compose, /import to correct downstream"
- 🚦 Rate Limiting — "Per-client throttling to protect backend services"
- 📋 Audit Log — "All auth decisions logged for compliance and debugging"
- note: "Single entry point. No backend service or Composer is reachable without passing through Auth."

**backend** — "Backend Services [Azure Container Apps]"
- 🎁 Wrapper Generator — "Orchestrates wrap creation; fans out across 10 slice prompts via callModel(); writes result to Blob Shareable"
- 📬 Queue — "Azure Service Bus — async job queue for long-running generation tasks"
- 🏷️ Contribution Classifier — "POST /classify — LLM call: tags and categorises a single contribution signal"
- 📂 Import Handler — "POST /import — synchronous LLM extraction from uploaded file (256 KB cap). No persistence, no queue. Returns NormalizedContribution[]."
- note: "All services only reachable via Auth Service. callModel() dispatches to Anthropic API, Azure AI Foundry, or OLLAMA per models.config.json."

**composer** — "Composer [Independent Service]"
- 🎵 Music Assembly — "Selects and layers background music tracks for the wrap"
- 📊 Slide Builder — "Renders contribution data into slide layouts"
- 📦 Package Writer — "Bundles final asset and writes to Blob Download"
- note: "Independent Azure service — separate from Backend Services boundary. Auth routes POST /compose here directly by path."

**shareable** — "Blob: Shareable"
- 💾 Cache Layer — "Generated asset cache keyed by owner"
- ✏️ Owner Access — "r/w — creator can update their wrap asset"
- 👁️ Public Access — "all:r — share link is publicly readable by anyone"
- note: "Azure Blob Storage with tiered ACL. Wrapper Generator writes here; shareable links point here."

**providers** — "Contribution Sources [External]"
- 🔄 Pull Providers — "GitHub, GitLab Dedicated, Jira — OAuth PKCE + cursor-based event sync via ContributionProvider adapters in src/lib/providers/"
- 📁 File Upload — "One-shot push path: user drops a file → POST /import → LLM extracts contributions in-memory → discarded. Never stored server-side."
- 🔌 Provider Abstraction — "Each source implements ContributionProvider: auth + identity + sync (pull) or import (push). Orchestrator owns encryption and persistence."
- note: "All contributions — synced or file-extracted — are encrypted on-device. File upload is the only path where content leaves the device."

**llm** — "LLM Providers [External]"
- 🤖 Anthropic API — "Direct POST to api.anthropic.com with ANTHROPIC_API_KEY. Three-attempt retry on 429/529. Used for classify, wrap generation, and file import."
- ☁️ Azure AI Foundry — "AIProjectClient → getAzureOpenAIClient. Deployment name = modelId in models.config.json. DefaultAzureCredential auth."
- 🖥️ OLLAMA — "Local model inference via localhost:11434. Opt-in — no entry ships enabled by default. Configured per-model via baseUrl in models.config.json."
- note: "Active provider selected per-model in models.config.json. callModel() in server/src/ai/client.ts dispatches to the matching ProviderAdapter."

---

### 8. Legend and footer

Legend row at bottom of SVG: 7 color swatches with labels —
Person · Auth Gateway · Container · Component · Storage · External · Test Agent.

Footer text (MONO, 9px, `#2A4A6A`):
`OUTPUT: JSON · Shareable URL · Download Package`

Below the SVG, hint text (SANS, 10px, `#1A3A5A`):
`Click Contribution Sources · Auth Service · Backend Services boundary · Composer · Blob: Shareable · LLM Providers to expand details`

---

### 9. Output rules

- Single default export named `App`.
- No external dependencies beyond HTML (`useState`).
- No `localStorage` or `sessionStorage`.
- All SVG defs (`#arr` marker, `#sh` drop-shadow filter, `#grid` pattern) declared once inside `<defs>`.
- Google Fonts `<link>` tag inside the outer wrapper div, not in `<head>`.
- File must be runnable as a HTML artifact with zero modification.
