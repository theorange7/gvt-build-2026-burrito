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

- Canvas: `width=1120 height=830`, `viewBox="0 0 1120 830"`.
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

**`Boundary({ x, y, w, h, label })`**
Dashed rect (rx=12, strokeDasharray `"8,5"`) with a pill label badge that overlaps the top edge (y-10).

**`Arrow({ x1, y1, x2, y2, label, dashed, cx1, cy1, cx2, cy2, lx, ly })`**
Straight line when no control points; cubic bezier (`C`) when cx1/cy1/cx2/cy2 provided.
Label position overrideable via `lx`/`ly`. SVG marker `#arr` (filled triangle, 8×8).

---

### 5. Architecture — render these containers in this topology

#### Boundaries (render before boxes so boxes sit on top)
1. **Client [Browser / Tauri]** — left column boundary, dashed, wraps the 4 client components.
2. **Burrito System [Azure]** — outer system boundary, wraps everything except the Person and Client boundary.
3. **Backend Services [Container Apps]** — inner sub-boundary inside the Azure boundary, wraps Wrapper Generator, Queue, and Contribution Classifier only.

#### Person
- **User** — type `person`, sub "Browser / Tauri". Sits above the Client boundary.

#### Client components (type `component`, inside Client boundary, stacked vertically with 18px gaps)
1. Contribution Timeline — tech "UI component", desc "Sync providers + manual input"
2. Wrapped Viewer — tech "UI component", desc "Playback, request and completed state"
3. Auto Classifier — tech "WASM / JS", desc "Pre-classification before upload"
4. Personal Vault — tech "IndexedDB", desc "Encrypted local contribution store"

#### Adapter Layer
Thin vertical strip (width 22px) between Client boundary right edge and Auth Service.
Filled `#0F2540`, dashed stroke `#1A3A60`. Rotated label "Adapter Layer" (MONO, 8.5px, `#2A5A90`).

#### Auth Service (type `auth`, standalone gateway)
- tech: "Azure API Management"
- desc: "Token validation · Route dispatch\nAll traffic enters here first"
- **GATEWAY badge**: small pill rect (fill `#0D5C45`, stroke `#5FD9B0`) on the top-right corner of the box.
- This box is clickable — opens detail panel for `auth`.

#### Backend Services (inside Backend Services boundary)
Three boxes stacked vertically with 44px+ gaps:
1. **Wrapper Generator** — type `container`, tech "Azure Container Apps", desc "Orchestrates wrap: slides, music, media. Calls OLLAMA."
2. **Queue** — type `component`, tech "Azure Service Bus", desc "Async job queue for generation tasks"
3. **Contribution Classifier** — type `container`, tech "Azure Container Apps", desc "ML pipeline: tags and categorises contributions"

The Backend Services boundary itself is clickable — opens detail panel for `backend`.

#### Composer (type `container`, independent — outside Backend Services boundary)
- tech: "Azure Container Apps  [independent]"
- desc: "Assembles slides + music. Auth routes /compose here directly."
- **INDEPENDENT badge**: small pill rect (fill `#1168BD`, stroke `#9EC5F5`) on the top-left corner.
- Clickable — opens detail panel for `composer`.
- Positioned below the Backend Services boundary, vertically aligned with it.

#### OLLAMA (type `external`, right column)
- tech: "Local LLM Runtime", desc: "Model inference for wrap generation"

#### Blob: Shareable (Cylinder, right column)
- tech: "Azure Blob Storage", desc: "cache · owner:asset\nowner r/w · all:r"
- Clickable — opens detail panel for `shareable`.

#### Blob: Download (Cylinder, right column)
- tech: "Azure Blob Storage", desc: "Final packaged wraps for user download"

#### UAT Agent (type `test`)
- tech: "Playwright", desc: "Unit · Integration · e2e — pre-demo validation"
- Positioned below Auth Service with ≥100px gap.

---

### 6. Arrows — render before boxes

| From | To | Label | Style |
|---|---|---|---|
| Person | Client boundary top | "uses" | solid |
| Client (via Adapter) | Auth Service left | "JSON contract" | solid |
| Auth right (top) | Wrapper Generator left | "POST /wrap" | solid, cubic bezier |
| Auth right (mid) | Queue left | "enqueue" | solid, cubic bezier |
| Auth right (bot) | Contribution Classifier left | "POST /classify" | solid, cubic bezier |
| Auth bottom | Composer left | "POST /compose" | solid, cubic bezier, routes downward |
| Wrapper Generator right | OLLAMA left | "LLM inference" | solid |
| Wrapper Generator right (bottom) | Blob Shareable top-left | "store result" | solid, cubic bezier |
| Composer right | Blob Download left | "write asset" | solid |
| UAT Agent top | Auth bottom | "test all routes" | **dashed** |

All arrow fan-outs from Auth use cubic bezier control points to avoid overlapping the Backend Services boundary.

---

### 7. Detail panels

Use `useState(null)` for `panel`. Clicking a clickable container calls `tog(key)` which toggles the panel.
Render the panel below the SVG as a dark card (`background: #0C1D2E`), with a left border in the container's `sub` color and a close button.
Items are displayed in a CSS grid (minmax 210px).

Panel definitions:

**auth** — "Auth Service [Gateway]"
- 🔐 Token Validation — "Verifies Bearer tokens on every inbound request before passing to any service"
- 🗺️ Route Dispatcher — "Inspects path prefix — routes /wrap, /classify, /queue, /compose to correct downstream"
- 🚦 Rate Limiting — "Per-client throttling to protect backend services"
- 📋 Audit Log — "All auth decisions logged for compliance and debugging"
- note: "Single entry point. No backend service or Composer is reachable without passing through Auth."

**backend** — "Backend Services [Azure Container Apps]"
- 🎁 Wrapper Generator — "Orchestrates wrap creation; calls OLLAMA for generation; writes result to Blob Shareable"
- 📬 Queue — "Azure Service Bus — async job queue for long-running generation tasks"
- 🏷️ Contribution Classifier — "ML pipeline: tags and categorises contributions submitted from the client"
- note: "All services only reachable via Auth Service. Hosted on Azure Container Apps."

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

---

### 8. Legend and footer

Legend row at bottom of SVG: 7 color swatches with labels —
Person · Auth Gateway · Container · Component · Storage · External · Test Agent.

Footer text (MONO, 9px, `#2A4A6A`):
`OUTPUT: JSON · Shareable URL · Download Package`

Below the SVG, hint text (SANS, 10px, `#1A3A5A`):
`Click Auth Service · Backend Services boundary · Composer · Blob: Shareable to expand details`

---

### 9. Output rules

- Single default export named `App`.
- No external dependencies beyond HTML (`useState`).
- No `localStorage` or `sessionStorage`.
- All SVG defs (`#arr` marker, `#sh` drop-shadow filter, `#grid` pattern) declared once inside `<defs>`.
- Google Fonts `<link>` tag inside the outer wrapper div, not in `<head>`.
- File must be runnable as a HTML artifact with zero modification.
