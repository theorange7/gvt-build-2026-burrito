/* explore.jsx — projects/collaborators detail pages + record */

function ProjectsIndex({ data, onOpen }) {
  return (
    <div data-screen-label="04 Projects" style={{ padding: "36px 40px 60px" }}>
      <div className="row between middle" style={{ flexWrap: "wrap", gap: 16 }}>
        <div>
          <SectionLabel color="var(--accent)">PROJECTS · THINGS YOU'VE WORKED ON</SectionLabel>
          <div style={{ height: 12 }} />
          <h1 className="display display-xl" style={{ margin: 0 }}>your work, in <span className="hot-block">groups</span>.</h1>
          <div style={{ height: 12 }} />
          <p style={{ fontSize: 17, opacity: 0.7, maxWidth: 640, margin: 0 }}>
            we suggested these from the repos you commit to. rename, merge, or make your own — they're just a way to see your work without the day-by-day blur.
          </p>
        </div>
        <button className="btn">+ group your own</button>
      </div>

      <div style={{ height: 32 }} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 22 }}>
        {data.projects.map(p => (
          <button
            key={p.id}
            onClick={() => onOpen(p.id)}
            className="card"
            style={{
              background: p.source === "curated" ? "var(--accent3)" : "var(--cream)",
              padding: 24,
              textAlign: "left",
              cursor: "pointer",
              border: "2px solid var(--ink)",
              transition: "0.12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translate(-2px,-2px)"; e.currentTarget.style.boxShadow = "6px 6px 0 var(--ink)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "4px 4px 0 var(--ink)"; }}
          >
            <div className="row between middle">
              <span className="mono mono-sm" style={{ opacity: 0.6 }}>{p.source === "curated" ? "GROUPED BY YOU" : "SUGGESTED FROM REPO"}</span>
              <span className="chip">{p.status}</span>
            </div>
            <div style={{ height: 14 }} />
            <h2 className="display display-md" style={{ margin: 0, lineHeight: 1.05 }}>{p.label}</h2>
            <div style={{ height: 12 }} />
            <p style={{ fontSize: 15, opacity: 0.78, margin: 0, lineHeight: 1.5 }}>{p.blurb}</p>
            <div style={{ height: 18 }} />
            <div className="row gap-10 middle" style={{ borderTop: "1.5px dashed rgba(10,10,10,0.18)", paddingTop: 14 }}>
              <div className="col">
                <span className="display" style={{ fontSize: 32, lineHeight: 0.95 }}>{p.artifacts}</span>
                <span className="mono mono-sm" style={{ opacity: 0.55 }}>ARTIFACTS</span>
              </div>
              <div className="col" style={{ marginLeft: 14 }}>
                <span className="display" style={{ fontSize: 32, lineHeight: 0.95 }}>{p.days}</span>
                <span className="mono mono-sm" style={{ opacity: 0.55 }}>DAYS TOUCHED</span>
              </div>
              <div className="spacer flex1"></div>
              <span className="mono mono-sm" style={{ color: "var(--hot)" }}>OPEN →</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */

function ProjectDetail({ data, projectId, onBack, onStartSession }) {
  const p = data.projects.find(x => x.id === projectId) || data.projects[0];
  const monthLabels = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  // a generic rhythm fixture
  const rhythm = [4,7,3,9,18,5,0,0,0,0,0,0];

  const records = data.record.filter(r => r.title === p.label).concat(data.record.filter(r => r.title === p.label).length === 0 ? data.record.slice(0,2) : []);

  return (
    <div data-screen-label="04 Project detail" style={{ padding: "30px 40px 60px", position: "relative" }}>
      <button onClick={onBack} className="btn ghost sm" style={{ padding: 0, opacity: 0.7 }}>← all projects</button>

      <div style={{ height: 18 }} />

      <div style={{ position: "relative" }}>
        <div className="ghost-numeral" style={{ top: -50, right: -10, fontSize: 260 }}>{String(p.artifacts).slice(0,2)}</div>

        <div className="row gap-10 middle">
          <span className="mono mono-md">{p.source === "curated" ? "/ GROUPED BY YOU" : "/ SUGGESTED FROM REPO"}</span>
          <span className="chip">{p.status}</span>
        </div>
        <div style={{ height: 14 }} />
        <h1 className="display" style={{ fontSize: 96, margin: 0, lineHeight: 0.92 }}>{p.label}</h1>
        <div style={{ height: 16 }} />
        <p style={{ fontSize: 18, opacity: 0.78, maxWidth: 620, margin: 0, lineHeight: 1.5 }}>{p.blurb}</p>
      </div>

      <div style={{ height: 30 }} />

      <div className="row gap-12" style={{ flexWrap: "wrap" }}>
        <button className="btn primary lg" onClick={() => onStartSession({ scope: "project", label: p.label })}>
          start a session about {p.label} →
        </button>
        <button className="btn">make a wrap about this</button>
        <button className="btn ghost sm">rename</button>
        <button className="btn ghost sm">merge into…</button>
      </div>

      <div style={{ height: 36 }} />

      {/* stat band */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <Stat n={p.artifacts} label="ARTIFACTS THIS YEAR" />
        <Stat n={p.days}       label="DAYS YOU TOUCHED IT" />
        <Stat n="3"            label="PEOPLE ALSO HERE" />
        <Stat n="11"           label="LOCKED PANELS" />
      </div>

      <div style={{ height: 36 }} />

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 28 }}>
        {/* record entries grouped to this project */}
        <div className="card" style={{ background: "var(--cream)" }}>
          <SectionLabel color="var(--hot)">FROM YOUR RECORD · {p.label.toUpperCase()}</SectionLabel>
          <div style={{ height: 14 }} />
          <div className="col gap-12">
            {records.slice(0,3).map((r,i) => (
              <div key={i} style={{ padding: 14, background: "var(--paper)", border: "1.5px solid rgba(10,10,10,0.2)", borderRadius: 10 }}>
                <div className="row gap-8 middle">
                  <span className="mono mono-sm" style={{ opacity: 0.6 }}>{r.day.toUpperCase()}</span>
                  <span className="chip">{r.count} ARTIFACTS</span>
                </div>
                <div style={{ height: 8 }} />
                <p style={{ fontSize: 15, margin: 0, lineHeight: 1.5 }}>“{r.text}”</p>
              </div>
            ))}
          </div>
        </div>

        {/* rhythm + collaborators */}
        <div className="col gap-22">
          <div className="card" style={{ background: "var(--paper)" }}>
            <SectionLabel color="var(--accent)">YEAR RHYTHM</SectionLabel>
            <div style={{ height: 16 }} />
            <div className="row" style={{ gap: 6, alignItems: "flex-end", height: 80 }}>
              {rhythm.map((v,i) => (
                <div key={i} className="col" style={{ flex: 1, alignItems: "center", gap: 4 }}>
                  <div style={{
                    width: "100%",
                    height: v === 0 ? 4 : `${Math.max(8, v * 4)}px`,
                    background: v === 0 ? "rgba(10,10,10,0.1)" : (i === 4 ? "var(--hot)" : "var(--ink)"),
                    border: v === 0 ? "none" : "2px solid var(--ink)",
                    borderRadius: 4,
                  }}></div>
                  <span className="mono" style={{ fontSize: 8, letterSpacing: "0.1em", opacity: v === 0 ? 0.3 : 0.7 }}>{monthLabels[i]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ background: "var(--cream)" }}>
            <SectionLabel color="var(--hot)">ALSO HERE</SectionLabel>
            <div style={{ height: 14 }} />
            <div className="col gap-8">
              {data.collaborators.slice(0,3).map(c => (
                <div key={c.handle} className="row gap-10 middle">
                  <span className="avatar-dot" style={{ background: c.color }}>{c.initials}</span>
                  <span style={{ fontSize: 15, fontWeight: 600, fontStyle: "italic" }}>{c.handle}</span>
                  <span className="mono mono-sm" style={{ opacity: 0.5, marginLeft: "auto" }}>{Math.round(c.overlap * 0.7)} ARTIFACTS</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ n, label }) {
  return (
    <div className="card" style={{ background: "var(--paper)", padding: 16 }}>
      <span className="display" style={{ fontSize: 48, lineHeight: 0.95, display: "block" }}>{n}</span>
      <div style={{ height: 6 }} />
      <span className="mono mono-sm" style={{ opacity: 0.6 }}>{label}</span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */

function PeopleIndex({ data, onOpen }) {
  return (
    <div data-screen-label="05 People" style={{ padding: "36px 40px 60px" }}>
      <SectionLabel color="var(--hot)">PEOPLE · WHO YOU WORKED WITH</SectionLabel>
      <div style={{ height: 12 }} />
      <h1 className="display display-xl" style={{ margin: 0 }}>people you worked <span className="lime-block">with most</span>.</h1>
      <div style={{ height: 12 }} />
      <p style={{ fontSize: 17, opacity: 0.72, maxWidth: 620, margin: 0 }}>
        not "top collaborators" — just the people whose names showed up alongside yours. start a session about a shared stretch, or browse what you did together.
      </p>

      <div style={{ height: 32 }} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 22 }}>
        {data.collaborators.map(c => (
          <button
            key={c.handle}
            onClick={() => onOpen(c.handle)}
            className="card"
            style={{ textAlign: "left", padding: 24, background: "var(--cream)", cursor: "pointer", transition: "0.12s" }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translate(-2px,-2px)"; e.currentTarget.style.boxShadow = "6px 6px 0 var(--ink)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "4px 4px 0 var(--ink)"; }}
          >
            <div className="row gap-14 middle">
              <span className="avatar-dot lg" style={{ background: c.color }}>{c.initials}</span>
              <div className="col">
                <span className="display display-sm" style={{ margin: 0 }}>{c.handle}</span>
                <span className="mono mono-sm" style={{ opacity: 0.6, marginTop: 4 }}>{c.overlap} ARTIFACTS TOGETHER</span>
              </div>
            </div>
            <div style={{ height: 18 }} />
            <p style={{ fontSize: 14, opacity: 0.7, margin: 0, lineHeight: 1.5 }}>
              you've overlapped on {Math.round(c.overlap * 0.6)} merge requests and {Math.round(c.overlap * 0.3)} issues this year. mostly in frontend/app.
            </p>
            <div style={{ height: 16 }} />
            <span className="mono mono-sm" style={{ color: "var(--hot)" }}>OPEN →</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PersonDetail({ data, handle, onBack, onStartSession }) {
  const c = data.collaborators.find(x => x.handle === handle) || data.collaborators[0];
  return (
    <div data-screen-label="05 Person detail" style={{ padding: "30px 40px 60px", position: "relative" }}>
      <button onClick={onBack} className="btn ghost sm" style={{ padding: 0, opacity: 0.7 }}>← all people</button>
      <div style={{ height: 18 }} />

      <div className="row gap-22 middle" style={{ flexWrap: "wrap" }}>
        <span className="avatar-dot lg" style={{ background: c.color, width: 96, height: 96, fontSize: 28 }}>{c.initials}</span>
        <div className="col">
          <span className="mono mono-md" style={{ opacity: 0.6 }}>/ PEOPLE</span>
          <div style={{ height: 6 }} />
          <h1 className="display" style={{ fontSize: 84, margin: 0, lineHeight: 0.92 }}>{c.handle}</h1>
        </div>
      </div>
      <div style={{ height: 12 }} />
      <p style={{ fontSize: 17, opacity: 0.72, maxWidth: 620, margin: 0 }}>
        you've worked alongside {c.handle} on {c.overlap} artifacts this year, mostly through reviews and shared issues.
      </p>

      <div style={{ height: 28 }} />
      <div className="row gap-12" style={{ flexWrap: "wrap" }}>
        <button className="btn primary lg" onClick={() => onStartSession({ scope: "person", label: `with ${c.handle}` })}>
          start a session with {c.handle} →
        </button>
        <button className="btn">make a wrap together</button>
      </div>

      <div style={{ height: 36 }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <Stat n={c.overlap} label="SHARED ARTIFACTS" />
        <Stat n={Math.round(c.overlap * 0.4)} label="REVIEWS YOU EXCHANGED" />
        <Stat n="2" label="PROJECTS IN COMMON" />
      </div>

      <div style={{ height: 32 }} />

      <div className="card" style={{ background: "var(--paper)" }}>
        <SectionLabel color="var(--accent)">WHEN YOU OVERLAPPED</SectionLabel>
        <div style={{ height: 14 }} />
        <div className="col gap-10">
          {[
            { day: "TUE, MAY 14", text: "you and " + c.handle + " worked on the cursor pagination thing. quick context-switch." },
            { day: "MON, MAY 13", text: "review back and forth on the empty states MR." },
            { day: "THU, MAY 09", text: "you paired on a tricky bug in the customer dropdown. ended up reverting twice." },
          ].map((r, i) => (
            <div key={i} className="row gap-14 middle" style={{ padding: 14, background: "var(--cream)", border: "1.5px solid rgba(10,10,10,0.18)", borderRadius: 10 }}>
              <span className="mono mono-sm" style={{ opacity: 0.6, minWidth: 110 }}>{r.day}</span>
              <span style={{ fontSize: 15, opacity: 0.85, flex: 1 }}>{r.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */

function RecordView({ data, onBack }) {
  return (
    <div data-screen-label="06 Record" style={{ padding: "36px 40px 60px" }}>
      <SectionLabel color="var(--hot)">YOUR RECORD · 2026</SectionLabel>
      <div style={{ height: 12 }} />
      <h1 className="display display-xl" style={{ margin: 0 }}>your <span className="hot-block">record</span>.</h1>
      <div style={{ height: 12 }} />
      <p style={{ fontSize: 17, opacity: 0.72, maxWidth: 620, margin: 0 }}>
        everything you've sealed in a session, in your own words. nothing here is from us.
      </p>

      <div style={{ height: 32 }} />

      <div className="col gap-22" style={{ maxWidth: 760 }}>
        {data.record.map((r, i) => (
          <div key={i} className="card" style={{ background: i === 0 ? "var(--lime)" : "var(--cream)" }}>
            <div className="row gap-10 middle">
              <span className="mono mono-md">{r.day.toUpperCase()}</span>
              <span className="chip">{r.title}</span>
              <span className="chip">{r.count} ARTIFACTS</span>
            </div>
            <div style={{ height: 12 }} />
            <p style={{ fontSize: 19, fontWeight: 500, margin: 0, lineHeight: 1.5 }}>
              “{r.text}”
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

window.ProjectsIndex = ProjectsIndex;
window.ProjectDetail = ProjectDetail;
window.PeopleIndex   = PeopleIndex;
window.PersonDetail  = PersonDetail;
window.RecordView    = RecordView;
