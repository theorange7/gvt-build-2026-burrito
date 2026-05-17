/* timeline.jsx — alternate views of the same record */

/* ─── extended fixture: 14 days of activity ────────────────────── */
const TIMELINE_DATA = [
  { day: "Tue, May 14", weekday: "TUE", date: "14", sessioned: false, locks: 0, project: null, artifacts: 7, note: null },
  { day: "Mon, May 13", weekday: "MON", date: "13", sessioned: true,  locks: 2, project: "frontend/app", artifacts: 5,
    note: "spent most of the day pairing with sam on the new collaborators sidebar. felt like things clicked around 3pm." },
  { day: "Sun, May 12", weekday: "SUN", date: "12", sessioned: false, locks: 0, project: null, artifacts: 0, note: null, weekend: true },
  { day: "Sat, May 11", weekday: "SAT", date: "11", sessioned: false, locks: 0, project: null, artifacts: 1, note: null, weekend: true },
  { day: "Fri, May 10", weekday: "FRI", date: "10", sessioned: true,  locks: 1, project: "frontend/app", artifacts: 6,
    note: "shipped the redesigned empty state. four MRs landed, two of them were trivial typo fixes from review feedback." },
  { day: "Thu, May 09", weekday: "THU", date: "09", sessioned: true,  locks: 2, project: "platform/api", artifacts: 4,
    note: "paired with priya on a tricky bug in the customer dropdown. ended up reverting twice." },
  { day: "Wed, May 08", weekday: "WED", date: "08", sessioned: false, locks: 0, project: null, artifacts: 3, note: null },
  { day: "Tue, May 07", weekday: "TUE", date: "07", sessioned: true,  locks: 3, project: "frontend/app", artifacts: 8,
    note: "long day. mostly review feedback. the design system stuff finally landed." },
  { day: "Mon, May 06", weekday: "MON", date: "06", sessioned: false, locks: 0, project: null, artifacts: 2, note: null },
];

const SESSIONS_INDEX = [
  { id: "s5", date: "Mon, May 13", scope: "day",     panels: 3, locked: 2, skipped: 1 },
  { id: "s4", date: "Fri, May 10", scope: "day",     panels: 2, locked: 1, skipped: 1 },
  { id: "s3", date: "Thu, May 09", scope: "day",     panels: 3, locked: 2, skipped: 1 },
  { id: "s2", date: "Tue, May 07", scope: "day",     panels: 4, locked: 3, skipped: 1 },
  { id: "s1", date: "Apr 28 → May 02", scope: "range", panels: 5, locked: 4, skipped: 1 },
];

/* ─────────────────────────────────────────────────────────────── */

function Timeline({ data, onOpenDay, onStartSession }) {
  return (
    <div data-screen-label="07 Timeline" style={{ padding: "36px 40px 60px" }}>
      <div className="row between middle" style={{ flexWrap: "wrap", gap: 16 }}>
        <div>
          <SectionLabel color="var(--hot)">TIMELINE · 2026</SectionLabel>
          <div style={{ height: 10 }} />
          <h1 className="display display-xl" style={{ margin: 0 }}>
            scroll back through <span className="hot-block">your days</span>.
          </h1>
          <div style={{ height: 10 }} />
          <p style={{ fontSize: 17, opacity: 0.72, maxWidth: 640, margin: 0 }}>
            every day shows up here. the ones you sealed in a session carry their own words. the rest are just there if you want to come back.
          </p>
        </div>
        <div className="col gap-8">
          <span className="mono mono-sm" style={{ opacity: 0.55 }}>FILTER BY</span>
          <div className="row gap-6">
            <button className="chip hot">ALL</button>
            <button className="chip">SESSIONED</button>
            <button className="chip">FRONTEND/APP</button>
            <button className="chip accent2">@SAM</button>
          </div>
        </div>
      </div>

      <div style={{ height: 36 }} />

      <div style={{ position: "relative", paddingLeft: 96, maxWidth: 980 }}>
        {/* vertical rule */}
        <div style={{
          position: "absolute",
          left: 71, top: 8, bottom: 8,
          width: 2,
          background: "var(--ink)",
        }}></div>

        <div className="col gap-22">
          {TIMELINE_DATA.map((d, i) => (
            <TimelineRow key={i} d={d} onOpen={() => onOpenDay(d)} onStartSession={onStartSession} />
          ))}
        </div>

        <div style={{ marginTop: 22, paddingLeft: 0 }}>
          <span className="mono mono-sm" style={{ opacity: 0.5 }}>← APR · KEEP SCROLLING FOR EARLIER</span>
        </div>
      </div>
    </div>
  );
}

function TimelineRow({ d, onOpen, onStartSession }) {
  return (
    <div style={{ position: "relative" }} className="row gap-22">
      {/* date label, sits left of rule */}
      <div className="col" style={{
        position: "absolute", left: -96, width: 60, alignItems: "flex-end",
        opacity: d.weekend ? 0.4 : 1
      }}>
        <span className="mono mono-sm" style={{ opacity: 0.55 }}>{d.weekday}</span>
        <span className="display" style={{ fontSize: 30, lineHeight: 1, margin: 0 }}>{d.date}</span>
      </div>

      {/* marker on rule */}
      <div style={{
        position: "absolute",
        left: -29, top: 14,
        width: 18, height: 18,
        borderRadius: 999,
        background: d.sessioned ? "var(--hot)" : (d.artifacts === 0 ? "var(--paper)" : "var(--cream)"),
        border: "2px solid var(--ink)",
        boxShadow: d.sessioned ? "2px 2px 0 var(--ink)" : "none",
      }}></div>

      {/* card */}
      {d.sessioned ? (
        <div className="card seal-in" style={{ flex: 1, background: "var(--cream)", padding: 20, cursor: "pointer", position: "relative", transform: "rotate(0)" }} onClick={onOpen}>
          <div className="row between middle">
            <div className="row gap-8 middle">
              <span className="chip hot">● SEALED</span>
              <span className="chip">{d.project}</span>
              <span className="mono mono-sm" style={{ opacity: 0.55 }}>{d.locks} OF {d.locks + 1} LOCKED</span>
            </div>
            <span className="mono mono-sm" style={{ color: "var(--hot)" }}>REVIEW →</span>
          </div>
          <div style={{ height: 12 }} />
          <p style={{ fontSize: 16, margin: 0, lineHeight: 1.55, fontWeight: 500 }}>“{d.note}”</p>
        </div>
      ) : d.artifacts === 0 ? (
        <div style={{ flex: 1, padding: "10px 14px", opacity: 0.45 }}>
          <span className="mono mono-sm">QUIET DAY — NOTHING TO LOOK AT</span>
        </div>
      ) : (
        <div className="card" style={{ flex: 1, background: "var(--paper)", padding: 16 }}>
          <div className="row between middle">
            <span className="mono mono-sm" style={{ opacity: 0.7 }}>{d.artifacts} ARTIFACTS · UNSEALED</span>
            <button className="btn sm" onClick={() => onStartSession({ scope: "day", label: d.day })}>
              sit down with this day →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */

function SessionsIndex({ data, onOpenSession }) {
  return (
    <div data-screen-label="08 Sessions" style={{ padding: "36px 40px 60px" }}>
      <SectionLabel color="var(--accent)">PAST SESSIONS</SectionLabel>
      <div style={{ height: 10 }} />
      <h1 className="display display-xl" style={{ margin: 0 }}>
        every <span className="lime-block">sitting</span>.
      </h1>
      <div style={{ height: 10 }} />
      <p style={{ fontSize: 17, opacity: 0.72, maxWidth: 620, margin: 0 }}>
        each session was a small ritual. here they are, in order.
      </p>

      <div style={{ height: 32 }} />

      <div className="col gap-12" style={{ maxWidth: 880 }}>
        {SESSIONS_INDEX.map((s, i) => (
          <div key={s.id} className="card" style={{
            background: i === 0 ? "var(--cream)" : "var(--paper)",
            padding: 20,
            cursor: "pointer",
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translate(-2px,-2px)"; e.currentTarget.style.boxShadow = "6px 6px 0 var(--ink)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "4px 4px 0 var(--ink)"; }}
          >
            <div className="row between middle">
              <div className="row gap-12 middle">
                <span className="mono mono-md">{s.id.toUpperCase()}</span>
                <span className="display display-sm" style={{ margin: 0 }}>{s.date}</span>
                {s.scope === "range" && <span className="chip accent2">RANGE</span>}
              </div>
              <div className="row gap-8 middle">
                <span className="chip lime">{s.locked} LOCKED</span>
                <span className="chip">{s.skipped} SKIPPED</span>
                <span className="mono mono-sm" style={{ color: "var(--hot)", marginLeft: 8 }}>OPEN →</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

window.Timeline = Timeline;
window.SessionsIndex = SessionsIndex;
