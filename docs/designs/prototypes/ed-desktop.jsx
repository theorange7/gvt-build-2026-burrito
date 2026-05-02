// Editorial desktop dashboard

function EdRule({ thick = 1, color = ED.rule, style }) {
  return <div style={{ borderTop: `${thick}px solid ${color}`, ...style }} />;
}
function EdCaps({ children, style }) {
  return <span style={{ fontFamily: edFont.sans, fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', ...style }}>{children}</span>;
}
function EdBtn({ children, primary = false, onClick, style }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{
      fontFamily: edFont.serif, fontStyle: 'italic', fontSize: 14, padding: '8px 18px',
      background: primary ? ED.ink : 'transparent', color: primary ? ED.paper : ED.ink,
      border: `1px solid ${ED.ink}`, cursor: 'pointer', letterSpacing: '0.01em',
      opacity: hover ? 0.85 : 1, transition: 'opacity 0.12s', ...style,
    }}>{children}</button>
  );
}

function EdOnboarding({ onClose, connected, setConnected }) {
  const tools = [
    { id: 'github', name: 'GitHub', sub: 'Pull requests, reviews, commits' },
    { id: 'jira', name: 'Jira', sub: 'Tickets, sprints, comments' },
    { id: 'slack', name: 'Slack', sub: 'Threads, decisions, mentions' },
    { id: 'confluence', name: 'Confluence', sub: 'Documents, requests for comment' },
  ];
  const count = Object.values(connected).filter(Boolean).length;
  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, background: 'rgba(21,17,13,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 600, background: ED.paper, padding: '28px 36px', fontFamily: edFont.body, color: ED.ink,
        boxShadow: '0 24px 60px rgba(0,0,0,0.35)', border: `1px solid ${ED.ink}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <EdCaps style={{ color: ED.red }}>Issue №0 — Establishing Sources</EdCaps>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', color: ED.ink }}>✕</button>
        </div>
        <EdRule thick={2} style={{ marginTop: 6 }} />
        <h2 style={{
          fontFamily: edFont.serif, fontSize: 38, lineHeight: 1, letterSpacing: '-0.02em',
          fontWeight: 500, margin: '14px 0 0', textWrap: 'balance',
        }}>
          Where shall we <span style={{ fontStyle: 'italic', color: ED.red }}>look</span> for your year?
        </h2>
        <p style={{ fontSize: 13, lineHeight: 1.55, marginTop: 8, color: ED.inkSoft, fontStyle: 'italic', maxWidth: 460 }}>
          Burrito reads only what you authorise. Each source is opt-in, revocable, and visible to you alone.
        </p>

        <EdRule thick={1} style={{ marginTop: 18 }} />
        {tools.map((t, i) => {
          const on = connected[t.id];
          return (
            <div key={t.id} onClick={() => setConnected({ ...connected, [t.id]: !on })} style={{
              display: 'flex', alignItems: 'baseline', gap: 14, padding: '12px 0',
              borderBottom: i < 3 ? '1px dotted rgba(21,17,13,0.3)' : 'none', cursor: 'pointer',
            }}>
              <span style={{ fontFamily: edFont.mono, fontSize: 11, color: ED.inkSoft, width: 26 }}>0{i + 1}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: edFont.serif, fontSize: 18, fontWeight: 500 }}>{t.name}</div>
                <div style={{ fontSize: 12, fontStyle: 'italic', color: ED.inkSoft }}>{t.sub}</div>
              </div>
              <span style={{
                fontFamily: edFont.sans, fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
                color: on ? ED.red : ED.ink, padding: '4px 10px',
                border: `1px solid ${on ? ED.red : ED.ink}`,
                background: on ? 'rgba(164,33,33,0.06)' : 'transparent',
              }}>{on ? '● SUBSCRIBED' : '+ SUBSCRIBE'}</span>
            </div>
          );
        })}

        <EdRule thick={1} style={{ marginTop: 6 }} />
        <div style={{
          marginTop: 14, padding: '10px 14px', background: ED.paperDeep,
          fontFamily: edFont.body, fontSize: 12, lineHeight: 1.55, fontStyle: 'italic',
        }}>
          A note on intent — Burrito is a recording tool first. The narrative is a draft. You edit. You own it. No one else reads it without you sharing a link.
        </div>

        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <EdCaps style={{ color: ED.inkSoft }}>{count} of 4 sources</EdCaps>
          <EdBtn primary={count > 0} onClick={count > 0 ? onClose : undefined}>
            {count > 0 ? 'Begin volume I →' : 'Subscribe to one'}
          </EdBtn>
        </div>
      </div>
    </div>
  );
}

function EdDetail({ event, onClose }) {
  if (!event) return null;
  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, background: 'rgba(21,17,13,0.55)',
      display: 'flex', justifyContent: 'flex-end', zIndex: 40,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 480, height: '100%', background: ED.paper, padding: 32,
        fontFamily: edFont.body, color: ED.ink, overflow: 'auto', boxSizing: 'border-box',
        borderLeft: `1px solid ${ED.ink}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <EdCaps style={{ color: ED.red }}>Dispatch · {event.kind}</EdCaps>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', color: ED.ink }}>✕</button>
        </div>
        <EdRule thick={2} style={{ marginTop: 6 }} />
        <EdCaps style={{ display: 'block', marginTop: 14, color: ED.inkSoft }}>{event.d}</EdCaps>
        <h2 style={{
          fontFamily: edFont.serif, fontSize: 36, lineHeight: 0.95, letterSpacing: '-0.025em',
          fontWeight: 500, margin: '6px 0 0', textWrap: 'balance', fontStyle: 'italic',
        }}>{event.title}</h2>

        <EdRule thick={1} style={{ marginTop: 16 }} />

        <div style={{ marginTop: 14, fontSize: 14, lineHeight: 1.65 }}>
          <span style={{ float: 'left', fontFamily: edFont.serif, fontSize: 44, lineHeight: 0.85, paddingRight: 6, paddingTop: 3, fontWeight: 500, color: ED.red }}>
            {event.detail.body.charAt(0)}
          </span>
          {event.detail.body.slice(1)}
        </div>

        <EdRule thick={1} style={{ marginTop: 18 }} />
        <EdCaps style={{ display: 'block', color: ED.inkSoft, marginTop: 10 }}>Source</EdCaps>
        <div style={{ fontFamily: edFont.mono, fontSize: 12, marginTop: 4, color: ED.ink }}>{event.detail.source}</div>

        <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {event.detail.refs.map((r) => (
            <span key={r} style={{
              fontFamily: edFont.sans, fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
              padding: '4px 9px', border: `1px solid ${ED.ink}`, background: ED.paperLight, textTransform: 'uppercase',
            }}>{r}</span>
          ))}
        </div>

        <EdCaps style={{ display: 'block', color: ED.inkSoft, marginTop: 18 }}>Editorial Weight</EdCaps>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
          <div style={{ flex: 1, height: 2, background: ED.paperDeep }}>
            <div style={{ width: `${event.detail.weight * 100}%`, height: '100%', background: ED.red }} />
          </div>
          <span style={{ fontFamily: edFont.mono, fontSize: 12 }}>{(event.detail.weight * 100).toFixed(0)}</span>
        </div>
        <div style={{ fontFamily: edFont.body, fontStyle: 'italic', fontSize: 11, color: ED.inkSoft, marginTop: 4 }}>
          A draft signal — adjust before the wrap is composed.
        </div>

        <div style={{ marginTop: 24, display: 'flex', gap: 8 }}>
          <EdBtn primary>Edit ✎</EdBtn>
          <EdBtn>Recategorise</EdBtn>
          <EdBtn style={{ color: ED.inkSoft }}>Omit</EdBtn>
        </div>
      </div>
    </div>
  );
}

window.EdRule = EdRule;
window.EdCaps = EdCaps;
window.EdBtn = EdBtn;
window.EdOnboarding = EdOnboarding;
window.EdDetail = EdDetail;
