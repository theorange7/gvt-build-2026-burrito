/* onboarding.jsx — three-screen first run */

function Onboarding({ onDone }) {
  const [step, setStep] = React.useState(0);
  const [name, setName] = React.useState("");
  const [why, setWhy] = React.useState("");

  const next = () => {
    if (step < 2) setStep(step + 1);
    else onDone({ name: name || "alex", why });
  };

  return (
    <div className="app-frame" data-screen-label="00 Onboarding" style={{ position: "relative", minHeight: 720, background: "var(--cream)" }}>
      {/* tiny chrome */}
      <div className="topnav" style={{ background: "var(--cream)", borderBottom: "2px solid var(--ink)" }}>
        <div className="brand">
          <span className="mark">🌯</span>
          <span>burrito.</span>
        </div>
        <div className="spacer"></div>
        <div className="mono mono-sm" style={{ opacity: 0.6 }}>FIRST RUN · {String(step+1).padStart(2,'0')} / 03</div>
      </div>

      {/* ghost numeral */}
      <div className="ghost-numeral" style={{ top: 60, right: -40 }}>{step+1}</div>

      <div style={{ padding: "84px 80px 60px", position: "relative", maxWidth: 880 }}>
        {step === 0 && <ScreenA name={name} setName={setName} />}
        {step === 1 && <ScreenB />}
        {step === 2 && <ScreenC why={why} setWhy={setWhy} />}
      </div>

      <div className="action-bar" style={{ background: "var(--paper)" }}>
        <div className="mono mono-sm" style={{ opacity: 0.5 }}>
          {step === 0 && "01 / 03  ·  WHAT BURRITO IS"}
          {step === 1 && "02 / 03  ·  WHAT THE AI DOES"}
          {step === 2 && "03 / 03  ·  READY"}
        </div>
        <div className="spacer flex1"></div>
        {step > 0 && (
          <button className="btn ghost" onClick={() => setStep(step - 1)}>
            ← back
          </button>
        )}
        <button className="btn primary lg" onClick={next}>
          {step < 2 ? "continue →" : "open burrito →"}
        </button>
      </div>
    </div>
  );
}

function ScreenA({ name, setName }) {
  return (
    <div className="fade-in" key="a" style={{ position: "relative" }}>
      <SectionLabel>WELCOME · 2026</SectionLabel>
      <div style={{ height: 28 }} />
      <h1 className="display display-xl" style={{ margin: 0, maxWidth: 720 }}>
        a place to <span className="hot-block">record</span><br />
        the work you've done.
      </h1>
      <div style={{ height: 28 }} />
      <p style={{ fontSize: 18, lineHeight: 1.55, maxWidth: 580, margin: 0, opacity: 0.85 }}>
        burrito is a recording tool. it watches the artifacts of your work — the MRs, issues, docs, the things you noted by hand — and helps you sit with them, regularly, in your own words.
      </p>
      <div style={{ height: 14 }} />
      <p style={{ fontSize: 18, lineHeight: 1.55, maxWidth: 580, margin: 0, opacity: 0.85 }}>
        a mirror, not a judge. you're the author of what gets written down.
      </p>

      <div style={{ height: 40 }} />

      <div style={{ maxWidth: 380 }}>
        <label className="input-label">YOUR NAME OR HANDLE</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="alex"
          style={{ fontSize: 18 }}
        />
        <div style={{ height: 8 }} />
        <p style={{ fontSize: 13, opacity: 0.55, margin: 0 }}>so we know who's writing.</p>
      </div>
    </div>
  );
}

function ScreenB() {
  return (
    <div className="fade-in" key="b">
      <SectionLabel>HOW THIS WORKS</SectionLabel>
      <div style={{ height: 28 }} />
      <h1 className="display display-lg" style={{ margin: 0, maxWidth: 760 }}>
        we <span className="lime-block">sketch</span>. you write.
      </h1>
      <div style={{ height: 32 }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, maxWidth: 880 }}>
        <div className="card draft" style={{ position: "relative" }}>
          <div className="draft-tag" style={{ marginBottom: 14 }}>✎ what we do</div>
          <p style={{ fontSize: 17, lineHeight: 1.5, margin: 0, fontStyle: "italic", opacity: 0.85 }}>
            we notice patterns in your day. we offer a soft draft framing — three MRs in this repo, two open conversations with priya, a doc you wrote on tuesday morning.
          </p>
          <div style={{ height: 14 }} />
          <p style={{ fontSize: 14, opacity: 0.6, margin: 0 }}>
            consider it a first sketch. nothing is decided.
          </p>
        </div>

        <div className="card" style={{ background: "var(--cream)" }}>
          <div className="chip hot" style={{ marginBottom: 14 }}>your turn</div>
          <p style={{ fontSize: 17, lineHeight: 1.5, margin: 0, fontWeight: 500 }}>
            you read the sketch, change it, throw it out, rewrite it. you lock in the framing that's actually true to what happened.
          </p>
          <div style={{ height: 14 }} />
          <p style={{ fontSize: 14, opacity: 0.65, margin: 0 }}>
            the words that go in your record are <strong>your words</strong>.
          </p>
        </div>
      </div>

      <div style={{ height: 28 }} />
      <p style={{ fontSize: 14, opacity: 0.55, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em", textTransform: "uppercase", margin: 0 }}>
        nothing leaves your machine without you saying so.
      </p>
    </div>
  );
}

function ScreenC({ why, setWhy }) {
  const options = [
    "remember what i did",
    "keep track for reviews",
    "share work with my team",
    "just curious",
  ];
  return (
    <div className="fade-in" key="c">
      <SectionLabel>BEFORE WE BEGIN</SectionLabel>
      <div style={{ height: 28 }} />
      <h1 className="display display-lg" style={{ margin: 0, maxWidth: 720 }}>
        what brings you here?
      </h1>
      <div style={{ height: 14 }} />
      <p style={{ fontSize: 17, opacity: 0.75, maxWidth: 560, margin: 0, lineHeight: 1.5 }}>
        we ask because we want to be useful, not because we'll sort you into anything. you can change this later.
      </p>
      <div style={{ height: 32 }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 640 }}>
        {options.map(o => (
          <button
            key={o}
            className={"btn " + (why === o ? "primary" : "")}
            onClick={() => setWhy(o)}
            style={{ justifyContent: "flex-start", padding: "14px 18px" }}
          >
            {why === o ? "● " : "○ "}{o}
          </button>
        ))}
      </div>

      <div style={{ height: 36 }} />
      <div className="card" style={{ background: "var(--lime)", maxWidth: 640, padding: 20 }}>
        <div className="mono mono-sm" style={{ marginBottom: 8 }}>NEXT</div>
        <div style={{ fontSize: 16, fontWeight: 500 }}>
          connect a source when you're ready. you can also start with manual entries. nothing happens automatically.
        </div>
      </div>
    </div>
  );
}

window.Onboarding = Onboarding;

/* ─────────────────────────────────────────────────────────────── */
/* alternate: a single-page scrollytelling onboarding              */

function OnboardingScroll({ onDone }) {
  const [name, setName] = React.useState("");
  const [why, setWhy]   = React.useState("");
  const options = ["remember what i did", "keep track for reviews", "share work with my team", "just curious"];

  return (
    <div className="app-frame" data-screen-label="00 Onboarding (scroll)" style={{ background: "var(--cream)", minHeight: 720 }}>
      <div className="topnav" style={{ background: "var(--cream)" }}>
        <div className="brand">
          <span className="mark">🌯</span>
          <span>burrito.</span>
        </div>
        <div className="spacer"></div>
        <div className="mono mono-sm" style={{ opacity: 0.6 }}>FIRST RUN · ONE PAGE</div>
      </div>

      <div className="scroll" style={{ maxHeight: "calc(100vh - 180px)" }}>
        <div style={{ padding: "60px 80px 40px", maxWidth: 880, position: "relative" }}>
          <div className="ghost-numeral" style={{ top: 0, right: -30, fontSize: 300 }}>·</div>

          <SectionLabel>WELCOME · 2026</SectionLabel>
          <div style={{ height: 20 }} />
          <h1 className="display display-xl" style={{ margin: 0 }}>
            hi. you've arrived.
          </h1>
          <div style={{ height: 18 }} />
          <p style={{ fontSize: 19, opacity: 0.85, lineHeight: 1.55, maxWidth: 580, margin: 0 }}>
            burrito is a place to <span className="lime-block">record</span> your work — not to be told what's important, but to notice it yourself.
          </p>

          <div style={{ height: 50 }} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div className="card draft">
              <div className="draft-tag" style={{ marginBottom: 12 }}>✎ what we do</div>
              <p style={{ fontSize: 16, margin: 0, lineHeight: 1.55, fontStyle: "italic", opacity: 0.85 }}>
                we notice patterns. we offer a soft sketch — three MRs in this repo, two conversations with priya, a doc you wrote on tuesday.
              </p>
            </div>
            <div className="card">
              <div className="chip hot" style={{ marginBottom: 12 }}>your turn</div>
              <p style={{ fontSize: 16, margin: 0, lineHeight: 1.55, fontWeight: 500 }}>
                you edit, throw out, rewrite. the words that go in your record are <strong>yours</strong>.
              </p>
            </div>
          </div>

          <div style={{ height: 60 }} />

          <h2 className="display display-lg" style={{ margin: 0 }}>before we begin —</h2>
          <div style={{ height: 24 }} />

          <div style={{ maxWidth: 380 }}>
            <label className="input-label">YOUR NAME OR HANDLE</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="alex" style={{ fontSize: 18 }} />
          </div>

          <div style={{ height: 26 }} />

          <label className="input-label">WHAT BRINGS YOU HERE</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxWidth: 600, marginTop: 8 }}>
            {options.map(o => (
              <button key={o} className={"btn " + (why === o ? "primary" : "")} onClick={() => setWhy(o)} style={{ justifyContent: "flex-start", padding: "12px 16px" }}>
                {why === o ? "● " : "○ "}{o}
              </button>
            ))}
          </div>

          <div style={{ height: 50 }} />

          <div className="card" style={{ background: "var(--lime)", maxWidth: 600 }}>
            <SectionLabel color="var(--ink)">READY ENOUGH</SectionLabel>
            <div style={{ height: 10 }} />
            <p style={{ fontSize: 16, margin: 0 }}>
              connect a source when you want. nothing happens automatically. nothing leaves your machine until you say so.
            </p>
          </div>
        </div>
      </div>

      <div className="action-bar">
        <span className="mono mono-sm" style={{ opacity: 0.55 }}>SCROLL UP TO REREAD ANYTIME</span>
        <div className="spacer flex1"></div>
        <button className="btn primary lg" onClick={() => onDone({ name: name || "alex", why })}>
          open burrito →
        </button>
      </div>
    </div>
  );
}

window.OnboardingScroll = OnboardingScroll;
