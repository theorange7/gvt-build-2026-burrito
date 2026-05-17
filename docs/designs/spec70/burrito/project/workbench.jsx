/* workbench.jsx — the editorial workbench + panel editor */

function Workbench({ data, panels, setPanels, onOpenPanel, onClose, onExit, scope }) {
  const resolved = panels.filter(p => p.state === "locked" || p.state === "skipped").length;
  const total    = panels.length;
  const canClose = resolved >= 1;

  return (
    <div data-screen-label="02 Workbench" className="col" style={{ minHeight: "calc(100vh - 64px)" }}>
      {/* persistent header bar */}
      <div style={{ padding: "26px 40px 18px", borderBottom: "2px solid var(--ink)", background: "var(--cream)" }}>
        <div className="row between middle">
          <div>
            <SectionLabel>EDITORIAL WORKBENCH</SectionLabel>
            <div style={{ height: 8 }} />
            <div className="row gap-12 middle" style={{ flexWrap: "wrap" }}>
              <h1 className="display display-md" style={{ margin: 0 }}>
                {scope.label}
              </h1>
              <span className="chip ink">{total} PANELS</span>
            </div>
          </div>
          <div className="col" style={{ alignItems: "flex-end", gap: 8 }}>
            <button className="btn ghost sm" onClick={onExit}>
              ✕ leave session
            </button>
            <div className="mono mono-sm" style={{ opacity: 0.6 }}>
              {resolved} OF {total} RESOLVED
            </div>
          </div>
        </div>
      </div>

      {/* panel cards */}
      <div style={{ flex: 1, padding: "32px 40px 32px", background: "var(--paper)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 22, maxWidth: 1100 }}>
          {panels.map((p, i) => (
            <PanelCard
              key={p.id}
              panel={p}
              idx={i}
              onOpen={() => onOpenPanel(p.id)}
            />
          ))}
        </div>

        <div style={{ height: 32 }} />
        <p style={{ fontSize: 14, opacity: 0.55, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", textTransform: "uppercase", maxWidth: 620 }}>
          take them in any order. skip what doesn't matter. nothing's written until you close the session.
        </p>
      </div>

      {/* close bar */}
      <div className="action-bar">
        <div className="col gap-4">
          <span className="mono mono-sm" style={{ opacity: 0.55 }}>WHEN YOU'RE DONE</span>
          <span style={{ fontSize: 14, opacity: 0.7 }}>
            {canClose
              ? "ready to seal the day."
              : "lock at least one panel first."}
          </span>
        </div>
        <div className="spacer flex1"></div>
        <button className="btn" onClick={onExit}>save for later</button>
        <button className="btn primary lg" disabled={!canClose} onClick={onClose}>
          close session →
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */

function PanelCard({ panel, idx, onOpen }) {
  const isLocked  = panel.state === "locked";
  const isSkipped = panel.state === "skipped";
  const isPending = panel.state === "pending";

  const bg = isLocked  ? "var(--cream)"
           : isSkipped ? "var(--paper)"
           : "var(--draft)";
  const opacity = isSkipped ? 0.55 : 1;

  return (
    <div
      className="card"
      style={{
        background: bg,
        opacity,
        position: "relative",
        cursor: "pointer",
        transition: "transform 0.12s ease, box-shadow 0.12s ease",
        minHeight: 240,
        display: "flex",
        flexDirection: "column",
      }}
      onClick={onOpen}
      onMouseEnter={e => {
        e.currentTarget.style.transform = "translate(-2px, -2px)";
        e.currentTarget.style.boxShadow = "6px 6px 0 var(--ink)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = "4px 4px 0 var(--ink)";
      }}
    >
      {isLocked && (
        <div className="sealed-tab">
          <span className="mono mono-sm" style={{ fontSize: 9 }}>● SEALED</span>
        </div>
      )}
      {isSkipped && (
        <div className="sealed-tab" style={{ background: "var(--paper)", transform: "rotate(-2deg)" }}>
          <span className="mono mono-sm" style={{ fontSize: 9, opacity: 0.7 }}>— SKIPPED</span>
        </div>
      )}

      <div className="row between middle">
        <span className="mono mono-sm" style={{ opacity: 0.55 }}>
          PANEL {String(idx+1).padStart(2,'0')}  ·  {panel.subtitle.toUpperCase()}
        </span>
        <span className={"chip " + (isLocked ? "lime" : "")}>{panel.artifactCount} ITEMS</span>
      </div>

      <div style={{ height: 14 }} />
      <h3 className="display display-sm" style={{ margin: 0 }}>{panel.title}</h3>

      <div style={{ height: 14 }} />

      {isPending ? (
        <>
          <div className="draft-tag" style={{ alignSelf: "flex-start" }}>✎ WE SKETCHED THIS</div>
          <div style={{ height: 10 }} />
          <p style={{ fontSize: 14, lineHeight: 1.55, opacity: 0.7, margin: 0, fontStyle: "italic" }}>
            “{panel.draft}”
          </p>
        </>
      ) : isLocked ? (
        <p style={{ fontSize: 14, lineHeight: 1.55, margin: 0, fontWeight: 500 }}>
          “{panel.userText}”
        </p>
      ) : (
        <p style={{ fontSize: 14, lineHeight: 1.55, opacity: 0.6, margin: 0 }}>
          set aside.
        </p>
      )}

      <div style={{ flex: 1, minHeight: 8 }} />

      <div className="row between middle" style={{ marginTop: 16 }}>
        <div className="row gap-6">
          {panel.collaborators.map(c => (
            <span key={c} className="chip">{c}</span>
          ))}
          {panel.project && <span className="chip lime">{panel.project}</span>}
        </div>
        <span className="mono mono-sm" style={{ color: "var(--hot)" }}>
          {isPending ? "OPEN →" : isLocked ? "REVIEW →" : "REOPEN →"}
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */

function PanelEditor({ panel, onBack, onLock, onSkip }) {
  const [text, setText]     = React.useState(panel.userText || "");
  const [edited, setEdited] = React.useState(!!panel.userText);

  const draft = panel.draft;
  const usingDraft = !edited && !text;

  const onChange = (e) => {
    const v = e.target.value;
    setText(v);
    if (!edited && v !== "") setEdited(true);
  };

  const acceptDraft = () => {
    setText(draft);
    setEdited(true);
  };

  const onLockClick = () => {
    onLock(text || draft);
  };

  return (
    <div data-screen-label="03 Panel editor" className="col fade-in" style={{ minHeight: "calc(100vh - 64px)" }}>
      <div style={{ padding: "22px 40px 18px", borderBottom: "2px solid var(--ink)", background: "var(--cream)" }}>
        <button onClick={onBack} className="btn ghost sm" style={{ padding: 0, opacity: 0.7 }}>
          ← back to session
        </button>
        <div style={{ height: 12 }} />
        <div className="row between middle" style={{ flexWrap: "wrap", gap: 16 }}>
          <div>
            <span className="mono mono-sm" style={{ opacity: 0.6 }}>EDITING PANEL</span>
            <div style={{ height: 4 }} />
            <h1 className="display display-lg" style={{ margin: 0 }}>{panel.title}</h1>
            <div style={{ height: 8 }} />
            <div className="row gap-6">
              <span className="chip">{panel.artifactCount} ARTIFACTS</span>
              {panel.collaborators.map(c => <span key={c} className="chip accent3">{c}</span>)}
              {panel.project && <span className="chip lime">{panel.project}</span>}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 0, flex: 1, background: "var(--paper)" }}>
        {/* ── editor column ────────────────────── */}
        <div style={{ padding: "32px 40px", borderRight: "2px solid var(--ink)", display: "flex", flexDirection: "column" }}>

          {/* draft strip */}
          <div className={"card draft"} style={{
            background: usingDraft ? "var(--draft)" : "var(--paper)",
            transition: "opacity 0.3s",
            opacity: usingDraft ? 1 : 0.6,
            position: "relative",
          }}>
            <div className="row between middle">
              <div className="draft-tag">✎ OUR SKETCH</div>
              {usingDraft && (
                <button className="btn ghost sm" onClick={acceptDraft} style={{ padding: "4px 10px", opacity: 0.8 }}>
                  use this →
                </button>
              )}
            </div>
            <div style={{ height: 10 }} />
            <p style={{ fontSize: 16, lineHeight: 1.6, fontStyle: "italic", margin: 0, opacity: usingDraft ? 0.85 : 0.55 }}>
              “{draft}”
            </p>
          </div>

          <div style={{ height: 22 }} />

          <div className="row middle gap-12">
            <span className="mono mono-md" style={{
              color: edited ? "var(--hot)" : "var(--ink)",
              opacity: edited ? 1 : 0.55,
              transition: "0.2s",
            }}>
              {edited ? "● YOUR WORDS" : "○ YOUR TURN"}
            </span>
            {edited && <span className="mono mono-sm" style={{ opacity: 0.5 }}>EDITING FREELY</span>}
          </div>

          <div style={{ height: 10 }} />

          <textarea
            className="textarea"
            value={text}
            onChange={onChange}
            placeholder="rewrite this in your own voice, or start fresh. nothing's been saved yet."
            style={{
              minHeight: 220,
              fontSize: edited ? 19 : 17,
              fontWeight: edited ? 500 : 400,
              fontStyle: edited ? "normal" : "italic",
              opacity: edited ? 1 : 0.75,
              background: edited ? "#fff" : "var(--paper)",
              transition: "0.2s",
              boxShadow: edited ? "3px 3px 0 var(--ink)" : "none",
            }}
          />

          <div style={{ height: 10 }} />
          <div className="row between middle">
            <span className="mono mono-sm" style={{ opacity: 0.45 }}>
              {text.length} CHARS
            </span>
            {!edited && (
              <span className="mono mono-sm" style={{ opacity: 0.5 }}>
                ← edit when ready
              </span>
            )}
          </div>

          <div className="spacer flex1"></div>
        </div>

        {/* ── artifacts column ────────────────── */}
        <div style={{ padding: "32px 32px 32px 28px", background: "var(--cream)" }}>
          <SectionLabel color="var(--accent)">SUPPORTING ARTIFACTS</SectionLabel>
          <div style={{ height: 14 }} />
          <div className="col gap-10">
            {panel.artifacts.map((a, i) => (
              <div key={i} className="col" style={{ padding: 14, background: "var(--paper)", border: "2px solid var(--ink)", borderRadius: 10, boxShadow: "2px 2px 0 var(--ink)" }}>
                <div className="row gap-6 middle">
                  <span className={"chip " + kindChip(a.kind)} style={{ minWidth: 56, justifyContent: "center" }}>{a.kind}</span>
                  <span className={"chip " + sourceChip(a.source).variant}>{sourceChip(a.source).label}</span>
                  <span className="mono mono-sm" style={{ opacity: 0.45, marginLeft: "auto" }}>{a.time}</span>
                </div>
                <div style={{ height: 8 }} />
                <div style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.4 }}>{a.title}</div>
                <div style={{ height: 8 }} />
                <div className="row between middle">
                  <span className="mono mono-sm" style={{ opacity: 0.5 }}>STATUS · {a.status.toUpperCase()}</span>
                  <a href="#" className="mono mono-sm" style={{ color: "var(--hot)", textDecoration: "none" }} onClick={e => e.preventDefault()}>VIEW ORIGINAL ↗</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* action bar */}
      <div className="action-bar">
        <span className="mono mono-sm" style={{ opacity: 0.55 }}>
          {edited ? "WRITING IN YOUR VOICE" : "USING OUR SKETCH"}
        </span>
        <div className="spacer flex1"></div>
        <button className="btn" onClick={onSkip}>
          skip this panel
        </button>
        <button className="btn primary lg" onClick={onLockClick}>
          lock in this panel ✦
        </button>
      </div>
    </div>
  );
}

window.Workbench = Workbench;
window.PanelEditor = PanelEditor;
