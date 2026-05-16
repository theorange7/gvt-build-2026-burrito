/* shell.jsx — top nav, app frame, mono labels */

const { useState, useEffect, useRef, useMemo } = React;

function TopNav({ route, onNav, iaMode }) {
  // iaMode: 'flat' | 'grouped' | 'timeline-first'
  const [submenu, setSubmenu] = React.useState(false);

  const subItems = [
    { id: "record",   label: "entries" },
    { id: "timeline", label: "timeline" },
    { id: "sessions", label: "past sessions" },
  ];

  let tabs;
  if (iaMode === "grouped") {
    tabs = [
      { id: "dashboard", label: "today" },
      { id: "_record",   label: "record",  hasMenu: true },
      { id: "projects",  label: "projects" },
      { id: "people",    label: "people" },
    ];
  } else if (iaMode === "timeline-first") {
    tabs = [
      { id: "dashboard", label: "today" },
      { id: "timeline",  label: "timeline" },
      { id: "projects",  label: "projects" },
      { id: "people",    label: "people" },
    ];
  } else {
    tabs = [
      { id: "dashboard", label: "today" },
      { id: "record",    label: "your record" },
      { id: "projects",  label: "projects" },
      { id: "people",    label: "people" },
    ];
  }

  const isActive = (id) => {
    if (id === "_record") return ["record","timeline","sessions"].includes(route);
    if (id === "projects") return route === "projects" || route === "project-detail";
    if (id === "people")   return route === "people"   || route === "person-detail";
    return route === id;
  };

  return (
    <div className="topnav">
      <div className="brand">
        <span className="mark">🌯</span>
        <span>burrito.</span>
      </div>
      <div className="tabs">
        {tabs.map(t => (
          <div key={t.id} style={{ position: "relative" }}
               onMouseEnter={() => t.hasMenu && setSubmenu(true)}
               onMouseLeave={() => t.hasMenu && setSubmenu(false)}>
            <button
              className={"tab" + (isActive(t.id) ? " active" : "")}
              onClick={() => {
                if (t.hasMenu) setSubmenu(v => !v);
                else onNav(t.id);
              }}
            >
              {t.label}{t.hasMenu && <span style={{ marginLeft: 6, fontSize: 9, opacity: 0.7 }}>▾</span>}
            </button>
            {t.hasMenu && submenu && (
              <div className="fade-in" style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                left: -10,
                background: "var(--cream)",
                border: "2px solid var(--ink)",
                borderRadius: 12,
                boxShadow: "4px 4px 0 var(--ink)",
                padding: 8,
                minWidth: 180,
                zIndex: 100,
              }}>
                {subItems.map(s => (
                  <button
                    key={s.id}
                    className="tab"
                    onClick={() => { onNav(s.id); setSubmenu(false); }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 12px",
                      borderRadius: 6,
                      opacity: route === s.id ? 1 : 0.7,
                      color: route === s.id ? "var(--hot)" : "var(--ink)",
                      borderBottom: "none",
                      fontWeight: route === s.id ? 700 : 500,
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="spacer"></div>
      <div className="mono mono-sm" style={{ opacity: 0.55 }}>2026 · MAY</div>
      <div className="avatar">AL</div>
    </div>
  );
}

function AppFrame({ children, screenLabel }) {
  return (
    <div className="app-frame" data-screen-label={screenLabel}>
      {children}
    </div>
  );
}

/* a section label with the ○ prefix */
function SectionLabel({ children, color }) {
  return (
    <div className="section-label" style={color ? { } : {}}>
      <span style={{ color: color || "var(--hot)" }}>○</span>
      <span>{children}</span>
    </div>
  );
}

/* artifact source -> chip variant */
function sourceChip(source) {
  const m = {
    gitlab:  { label: "gitlab",  variant: "" },
    github:  { label: "github",  variant: "" },
    linear:  { label: "linear",  variant: "accent2" },
    notion:  { label: "notion",  variant: "lime" },
    manual:  { label: "manual",  variant: "accent3" },
  };
  return m[source] || { label: source, variant: "" };
}

/* artifact kind -> chip variant */
function kindChip(kind) {
  const m = {
    "MR":     "hot",
    "ISSUE":  "accent2",
    "DOC":    "lime",
    "MANUAL": "accent3",
  };
  return m[kind] || "";
}

Object.assign(window, { TopNav, AppFrame, SectionLabel, sourceChip, kindChip });
