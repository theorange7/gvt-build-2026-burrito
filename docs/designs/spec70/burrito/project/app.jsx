/* app.jsx — router + state machine */

const { useState } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "iaMode": "flat",
  "onboardingStyle": "stepped",
  "promptStyle": "card",
  "skipOnboarding": false
}/*EDITMODE-END*/;

function App() {
  const data = window.BurritoData;
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const [route, setRoute] = useState(t.skipOnboarding ? "dashboard" : "onboarding");
  const [panels, setPanels] = useState(data.panels);
  const [activePanel, setActivePanel] = useState(null);
  const [projectId, setProjectId] = useState(null);
  const [personHandle, setPersonHandle] = useState(null);
  const [sessionScope, setSessionScope] = useState({ scope: "day", label: data.dayLabel });
  const [lastClosed, setLastClosed] = useState(null);

  // ────────── handlers ──────────
  const handleNav = (id) => {
    setLastClosed(null);
    setRoute(id);
  };

  const startSession = (scope) => {
    let label = data.dayLabel;
    if (scope.scope === "range")        label = `${scope.from} → ${scope.to}`;
    else if (scope.scope === "project") label = `about ${scope.label}`;
    else if (scope.scope === "person")  label = `${scope.label}`;
    else if (scope.label)               label = scope.label;
    setSessionScope({ ...scope, label });
    setPanels(data.panels.map(p => ({ ...p })));
    setRoute("workbench");
  };

  const openPanel = (id) => { setActivePanel(id); setRoute("panel"); };

  const lockPanel = (text) => {
    setPanels(panels.map(p => p.id === activePanel ? { ...p, state: "locked", userText: text } : p));
    setRoute("workbench");
  };

  const skipPanel = () => {
    setPanels(panels.map(p => p.id === activePanel ? { ...p, state: "skipped" } : p));
    setRoute("workbench");
  };

  const closeSession = () => {
    setLastClosed(sessionScope.label);
    setRoute("dashboard");
  };

  const openProject = (id) => { setProjectId(id); setRoute("project-detail"); };
  const openPerson  = (h)  => { setPersonHandle(h); setRoute("person-detail"); };

  // ────────── tweaks panel (always available) ──────────
  const tweaksUI = (
    <TweaksPanel title="tweaks">
      <TweakSection label="Information architecture" />
      <TweakRadio
        label="nav model"
        value={t.iaMode}
        options={["flat", "grouped"]}
        onChange={(v) => setTweak("iaMode", v)}
      />
      <TweakSelect
        label="or try timeline-first"
        value={t.iaMode}
        options={[
          { label: "flat — record · projects · people", value: "flat" },
          { label: "grouped — record ▾ (entries / timeline / past)", value: "grouped" },
          { label: "timeline-first — timeline is the main view", value: "timeline-first" },
        ]}
        onChange={(v) => setTweak("iaMode", v)}
      />
      <TweakSection label="Onboarding" />
      <TweakRadio
        label="style"
        value={t.onboardingStyle}
        options={["stepped", "scroll"]}
        onChange={(v) => setTweak("onboardingStyle", v)}
      />
      <TweakToggle
        label="skip on next reload"
        value={t.skipOnboarding}
        onChange={(v) => setTweak("skipOnboarding", v)}
      />
      <TweakButton label="replay onboarding" onClick={() => setRoute("onboarding")} />
      <TweakSection label="Today's prompt" />
      <TweakRadio
        label="style"
        value={t.promptStyle}
        options={["card", "notebook"]}
        onChange={(v) => setTweak("promptStyle", v)}
      />
      <TweakSection label="Jump to" />
      <TweakButton label="dashboard" onClick={() => setRoute("dashboard")} />
      <TweakButton label="workbench" onClick={() => startSession({ scope: "day", label: data.dayLabel })} />
      <TweakButton label="panel editor" onClick={() => { setActivePanel("p1"); setRoute("panel"); }} />
      <TweakButton label="timeline" onClick={() => setRoute("timeline")} />
      <TweakButton label="past sessions" onClick={() => setRoute("sessions")} />
      <TweakButton label="record entries" onClick={() => setRoute("record")} />
    </TweaksPanel>
  );

  // ────────── onboarding takes the whole frame ──────────
  if (route === "onboarding") {
    return (
      <React.Fragment>
        {t.onboardingStyle === "scroll"
          ? <OnboardingScroll onDone={() => setRoute("dashboard")} />
          : <Onboarding onDone={() => setRoute("dashboard")} />}
        {tweaksUI}
      </React.Fragment>
    );
  }

  if (route === "workbench") {
    return (
      <React.Fragment>
        <AppFrame screenLabel="02 Workbench">
          <Workbench
            data={data}
            panels={panels}
            setPanels={setPanels}
            onOpenPanel={openPanel}
            onClose={closeSession}
            onExit={() => setRoute("dashboard")}
            scope={sessionScope}
          />
        </AppFrame>
        {tweaksUI}
      </React.Fragment>
    );
  }

  if (route === "panel") {
    const panel = panels.find(p => p.id === activePanel);
    return (
      <React.Fragment>
        <AppFrame screenLabel="03 Panel editor">
          <PanelEditor
            panel={panel}
            onBack={() => setRoute("workbench")}
            onLock={lockPanel}
            onSkip={skipPanel}
          />
        </AppFrame>
        {tweaksUI}
      </React.Fragment>
    );
  }

  return (
    <React.Fragment>
      <AppFrame screenLabel={"01 " + route}>
        <TopNav route={route} onNav={handleNav} iaMode={t.iaMode} />

        {route === "dashboard" && (
          <Dashboard
            data={data}
            onStartSession={startSession}
            onOpenProject={openProject}
            onOpenPerson={openPerson}
            onOpenRecord={() => setRoute("record")}
            onOpenTimeline={() => setRoute("timeline")}
            lastClosed={lastClosed}
            promptStyle={t.promptStyle}
            iaMode={t.iaMode}
          />
        )}

        {route === "projects" && (
          <ProjectsIndex data={data} onOpen={openProject} />
        )}

        {route === "project-detail" && (
          <ProjectDetail
            data={data}
            projectId={projectId}
            onBack={() => setRoute("projects")}
            onStartSession={startSession}
          />
        )}

        {route === "people" && (
          <PeopleIndex data={data} onOpen={openPerson} />
        )}

        {route === "person-detail" && (
          <PersonDetail
            data={data}
            handle={personHandle}
            onBack={() => setRoute("people")}
            onStartSession={startSession}
          />
        )}

        {route === "record" && (
          <RecordView data={data} onBack={() => setRoute("dashboard")} />
        )}

        {route === "timeline" && (
          <Timeline
            data={data}
            onOpenDay={(d) => startSession({ scope: "day", label: d.day })}
            onStartSession={startSession}
          />
        )}

        {route === "sessions" && (
          <SessionsIndex data={data} onOpenSession={() => setRoute("record")} />
        )}
      </AppFrame>
      {tweaksUI}
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
