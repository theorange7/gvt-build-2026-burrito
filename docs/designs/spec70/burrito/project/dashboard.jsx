/* dashboard.jsx — main "today" surface */

function Dashboard({ data, onStartSession, onOpenProject, onOpenPerson, onOpenRecord, onOpenTimeline, lastClosed, promptStyle = "card", iaMode = "flat" }) {
  const [rangeOpen, setRangeOpen] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const [from, setFrom] = React.useState("2026-05-10");
  const [to, setTo]     = React.useState("2026-05-14");

  return (
    <div data-screen-label="01 Dashboard">
      <div style={{ padding: "36px 40px 40px", display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 32 }}>
        {/* ── left column ─────────────────────────── */}
        <div className="col gap-24">
          {/* session prompt */}
          {!dismissed && !lastClosed && (
            promptStyle === "notebook" ? (
              <NotebookPrompt
                data={data}
                onStart={() => onStartSession({ scope: "day" })}
                onPickRange={() => setRangeOpen(v => !v)}
                onDismiss={() => setDismissed(true)}
                rangeOpen={rangeOpen}
                from={from} to={to} setFrom={setFrom} setTo={setTo}
                onConfirmRange={() => onStartSession({ scope: "range", from, to })}
                completed={data.completedSessions}
                onOpenRecord={onOpenRecord}
                onOpenTimeline={onOpenTimeline}
              />
            ) : (
              <SessionPrompt
                data={data}
                onStart={() => onStartSession({ scope: "day" })}
                onPickRange={() => setRangeOpen(v => !v)}
                onDismiss={() => setDismissed(true)}
                rangeOpen={rangeOpen}
                from={from} to={to} setFrom={setFrom} setTo={setTo}
                onConfirmRange={() => onStartSession({ scope: "range", from, to })}
                completed={data.completedSessions}
                onOpenRecord={onOpenRecord}
                onOpenTimeline={onOpenTimeline}
              />
            )
          )}

          {lastClosed && (
            <ClosedAcknowledgment onDismiss={onOpenRecord} day={lastClosed} />
          )}

          {/* "today's artifacts" reference (the existing feed, hinted at) */}
          <div>
            <SectionLabel>TODAY · {data.dayLabel.toUpperCase()}</SectionLabel>
            <div style={{ height: 14 }} />
            <ArtifactFeed />
          </div>
        </div>

        {/* ── right column / sidebar ──────────────── */}
        <div className="col gap-24">
          <ProjectsSidebar projects={data.projects} onOpen={onOpenProject} />
          <PeopleSidebar people={data.collaborators} onOpen={onOpenPerson} />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */

function SessionPrompt({ data, onStart, onPickRange, onDismiss, rangeOpen, from, to, setFrom, setTo, onConfirmRange, completed, onOpenRecord, onOpenTimeline }) {
  return (
    <div className="card" style={{ background: "var(--cream)", padding: 28, position: "relative" }}>
      <div className="row between middle" style={{ marginBottom: 18 }}>
        <SectionLabel>TODAY'S SESSION</SectionLabel>
        <button
          onClick={onDismiss}
          className="mono mono-sm"
          style={{ background: "none", border: "none", opacity: 0.45, cursor: "pointer", padding: 4 }}
          title="dismiss for today"
        >
          ✕ NOT TODAY
        </button>
      </div>

      <h2 className="display display-md" style={{ margin: 0, lineHeight: 1.05 }}>
        you had <span className="hot-block">{data.dayArtifactCount} artifacts</span><br />
        on {data.dayLabel.split(",")[0].toLowerCase()}.
      </h2>
      <div style={{ height: 14 }} />
      <p style={{ fontSize: 17, opacity: 0.78, margin: 0, maxWidth: 520 }}>
        when you're ready, we can sit down with them.
      </p>

      <div style={{ height: 22 }} />
      <div className="row gap-12" style={{ flexWrap: "wrap" }}>
        <button className="btn primary lg" onClick={onStart}>
          start a session →
        </button>
        <button className="btn" onClick={onPickRange}>
          start a session for…
        </button>
      </div>

      {rangeOpen && (
        <div className="fade-in" style={{ marginTop: 22, padding: 18, background: "var(--paper)", border: "2px solid var(--ink)", borderRadius: 12 }}>
          <div className="mono mono-sm" style={{ marginBottom: 10, opacity: 0.7 }}>SCOPE THIS SESSION</div>
          <div className="row gap-12" style={{ flexWrap: "wrap" }}>
            <div>
              <label className="input-label">FROM</label>
              <input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="input-label">TO</label>
              <input className="input" type="date" value={to} onChange={e => setTo(e.target.value)} />
            </div>
            <div style={{ alignSelf: "flex-end" }}>
              <button className="btn primary" onClick={onConfirmRange}>open range →</button>
            </div>
          </div>
          <div style={{ height: 14 }} />
          <div className="row gap-8 middle" style={{ flexWrap: "wrap" }}>
            <span className="mono mono-sm" style={{ opacity: 0.5 }}>OR SCOPE BY:</span>
            <button className="chip lime">📁 a project</button>
            <button className="chip accent3">👤 a collaborator</button>
          </div>
        </div>
      )}

      {completed > 0 && (
        <div style={{ marginTop: 22, paddingTop: 16, borderTop: "1.5px dashed rgba(10,10,10,0.18)" }}>
          <button
            onClick={onOpenRecord}
            className="row middle gap-8"
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--ink)" }}
          >
            <span className="mono mono-sm" style={{ opacity: 0.6 }}>YOU HAVE</span>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{completed} completed sessions.</span>
            <span style={{ fontSize: 15, color: "var(--hot)", fontWeight: 700 }}>view →</span>
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */

function ArtifactFeed() {
  const items = [
    { kind: "MR",    title: "fix overflow on long project names",    source: "gitlab", time: "11:52" },
    { kind: "MR",    title: "tighten spacing on collaborator cards", source: "gitlab", time: "10:38" },
    { kind: "MR",    title: "empty state for /projects page",        source: "gitlab", time: "09:14" },
    { kind: "ISSUE", title: "list endpoint needs cursor pagination", source: "linear", time: "14:02" },
    { kind: "MR",    title: "add cursor param to list endpoint",     source: "gitlab", time: "15:47" },
    { kind: "DOC",   title: "incident retro — wednesday outage",     source: "notion", time: "13:30" },
    { kind: "MANUAL",title: "design review for empty states",        source: "manual", time: "16:00" },
  ];
  return (
    <div className="col gap-8">
      {items.map((a, i) => (
        <div key={i} className="row middle gap-12" style={{ padding: "12px 14px", background: "var(--paper)", border: "1.5px solid rgba(10,10,10,0.18)", borderRadius: 10 }}>
          <span className={"chip " + kindChip(a.kind)} style={{ minWidth: 56, justifyContent: "center" }}>{a.kind}</span>
          <span style={{ fontSize: 15, fontWeight: 500, flex: 1 }}>{a.title}</span>
          <span className={"chip " + sourceChip(a.source).variant}>{sourceChip(a.source).label}</span>
          <span className="mono mono-sm" style={{ opacity: 0.5, minWidth: 48, textAlign: "right" }}>{a.time}</span>
        </div>
      ))}
      <button className="btn ghost" style={{ alignSelf: "flex-start", marginTop: 6, padding: 0, opacity: 0.6 }}>
        + ADD CONTRIBUTION MANUALLY
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */

function ProjectsSidebar({ projects, onOpen }) {
  return (
    <div className="card" style={{ background: "var(--paper)", padding: 22 }}>
      <div className="row between middle">
        <SectionLabel color="var(--accent)">YOUR PROJECTS</SectionLabel>
        <span className="mono mono-sm" style={{ opacity: 0.45 }}>{projects.length}</span>
      </div>
      <div style={{ height: 14 }} />
      <div className="col gap-10">
        {projects.map(p => (
          <button
            key={p.id}
            onClick={() => onOpen(p.id)}
            className="col gap-4"
            style={{
              textAlign: "left",
              padding: 14,
              background: "var(--cream)",
              border: "2px solid var(--ink)",
              borderRadius: 10,
              boxShadow: "2px 2px 0 var(--ink)",
              cursor: "pointer",
              transition: "0.1s",
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translate(-1px,-1px)"; e.currentTarget.style.boxShadow = "3px 3px 0 var(--ink)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "2px 2px 0 var(--ink)"; }}
          >
            <div className="row between middle">
              <span style={{ fontSize: 15, fontWeight: 700, fontStyle: "italic", letterSpacing: "-0.02em" }}>{p.label}</span>
              <span className={"chip " + (p.source === "curated" ? "accent3" : "")}>{p.source}</span>
            </div>
            <div className="row gap-8 middle" style={{ marginTop: 2 }}>
              <span className="mono mono-sm" style={{ opacity: 0.55 }}>{p.artifacts} ARTIFACTS</span>
              <span className="mono mono-sm" style={{ opacity: 0.35 }}>·</span>
              <span className="mono mono-sm" style={{ opacity: 0.55 }}>{p.days} DAYS</span>
            </div>
          </button>
        ))}
      </div>
      <div style={{ height: 12 }} />
      <button className="btn ghost sm" style={{ padding: 0, opacity: 0.6 }}>
        + GROUP YOUR OWN
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */

function PeopleSidebar({ people, onOpen }) {
  return (
    <div className="card" style={{ background: "var(--cream)", padding: 22 }}>
      <SectionLabel color="var(--hot)">PEOPLE YOU WORKED WITH MOST</SectionLabel>
      <div style={{ height: 14 }} />
      <div className="col gap-10">
        {people.map(p => (
          <button
            key={p.handle}
            onClick={() => onOpen(p.handle)}
            className="row middle gap-12"
            style={{
              textAlign: "left",
              padding: "10px 12px",
              background: "var(--paper)",
              border: "2px solid var(--ink)",
              borderRadius: 999,
              boxShadow: "2px 2px 0 var(--ink)",
              cursor: "pointer",
              transition: "0.1s",
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translate(-1px,-1px)"; e.currentTarget.style.boxShadow = "3px 3px 0 var(--ink)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "2px 2px 0 var(--ink)"; }}
          >
            <span className="avatar-dot" style={{ background: p.color }}>{p.initials}</span>
            <div className="col" style={{ flex: 1 }}>
              <span style={{ fontSize: 15, fontWeight: 700, fontStyle: "italic" }}>{p.handle}</span>
              <span className="mono mono-sm" style={{ opacity: 0.55, marginTop: 2 }}>{p.overlap} ARTIFACTS TOGETHER</span>
            </div>
            <span className="mono mono-sm" style={{ opacity: 0.45 }}>→</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */

function ClosedAcknowledgment({ onDismiss, day }) {
  return (
    <div className="card seal-in" style={{ background: "var(--lime)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -30, right: -10, fontSize: 200, fontStyle: "italic", fontWeight: 900, opacity: 0.1, lineHeight: 1 }}>✓</div>
      <SectionLabel color="var(--ink)">SAVED TO YOUR RECORD</SectionLabel>
      <div style={{ height: 14 }} />
      <h2 className="display display-md" style={{ margin: 0 }}>
        {day} is in the book.
      </h2>
      <div style={{ height: 10 }} />
      <p style={{ fontSize: 16, margin: 0, opacity: 0.78, maxWidth: 520 }}>
        nice. two panels locked, one skipped. it'll be there when you come back.
      </p>
      <div style={{ height: 18 }} />
      <div className="row gap-12">
        <button className="btn" onClick={onDismiss}>read your record →</button>
        <button className="btn ghost sm" onClick={() => window.location.reload()}>continue</button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* alternate: an "open notebook" presentation of the same prompt    */

function NotebookPrompt({ data, onStart, onPickRange, onDismiss, rangeOpen, from, to, setFrom, setTo, onConfirmRange, completed, onOpenRecord, onOpenTimeline }) {
  return (
    <div style={{
      background: "var(--cream)",
      border: "2px solid var(--ink)",
      borderRadius: 16,
      boxShadow: "6px 6px 0 var(--ink)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* faux notebook ruled spine */}
      <div style={{
        position: "absolute", top: 0, bottom: 0, left: 38,
        width: 2, background: "var(--hot)", opacity: 0.4,
      }}></div>

      <div style={{ padding: "26px 32px 22px 64px" }}>
        <div className="row between middle">
          <span className="mono mono-sm" style={{ opacity: 0.6 }}>{data.dayLabel.toUpperCase()} · OPEN PAGE</span>
          <button onClick={onDismiss} className="mono mono-sm" style={{ background: "none", border: "none", opacity: 0.4, cursor: "pointer", padding: 4 }}>
            ✕ CLOSE PAGE
          </button>
        </div>
        <div style={{ height: 14 }} />
        <p style={{
          fontSize: 26,
          margin: 0,
          lineHeight: 1.35,
          fontFamily: "'Space Grotesk', sans-serif",
          fontStyle: "italic",
          fontWeight: 500,
          letterSpacing: "-0.02em",
        }}>
          you had <strong style={{ background: "var(--hot)", color: "var(--cream)", padding: "0 8px", borderRadius: 4, fontWeight: 800 }}>{data.dayArtifactCount} artifacts</strong> today.
          when you're ready, we can sit down with them.
        </p>

        <div style={{ height: 18 }} />

        <div className="row gap-12 middle" style={{ flexWrap: "wrap" }}>
          <button className="btn primary lg" onClick={onStart}>open today's page →</button>
          <button className="btn ghost sm" onClick={onPickRange} style={{ padding: 0, opacity: 0.7 }}>
            ··· or scope by date / project / person
          </button>
        </div>

        {rangeOpen && (
          <div className="fade-in" style={{ marginTop: 16, padding: 14, background: "var(--paper)", border: "1.5px solid rgba(10,10,10,0.25)", borderRadius: 10 }}>
            <div className="row gap-10 middle" style={{ flexWrap: "wrap" }}>
              <div className="col gap-4">
                <label className="input-label">FROM</label>
                <input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} />
              </div>
              <div className="col gap-4">
                <label className="input-label">TO</label>
                <input className="input" type="date" value={to} onChange={e => setTo(e.target.value)} />
              </div>
              <button className="btn primary" style={{ alignSelf: "flex-end" }} onClick={onConfirmRange}>open range →</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ background: "var(--paper)", borderTop: "1.5px dashed rgba(10,10,10,0.25)", padding: "14px 32px 14px 64px" }}>
        <div className="row between middle" style={{ flexWrap: "wrap", gap: 10 }}>
          <span className="mono mono-sm" style={{ opacity: 0.6 }}>
            {completed} EARLIER PAGES IN YOUR RECORD
          </span>
          <div className="row gap-10">
            <button onClick={onOpenTimeline} className="mono mono-sm" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--hot)", fontWeight: 800 }}>
              TIMELINE →
            </button>
            <button onClick={onOpenRecord} className="mono mono-sm" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--hot)", fontWeight: 800 }}>
              ALL ENTRIES →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

window.Dashboard = Dashboard;