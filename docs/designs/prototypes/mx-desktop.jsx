// Maximalist desktop — palette-aware shared components

function MxBadge({ p, children, bg, color }) {
  return (
    <span style={{
      fontFamily: mxMono, fontSize: 10, fontWeight: 800, padding: '3px 8px',
      borderRadius: 4, background: bg || p.lime, color: color || p.ink, letterSpacing: '0.05em',
      border: `1.5px solid ${p.ink}`, display: 'inline-block', whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

function MxButton({ p, children, bg, color, onClick, big = false, style }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: mxFont, fontWeight: 800, fontSize: big ? 16 : 13,
        padding: big ? '12px 22px' : '8px 14px', borderRadius: 999,
        background: bg || p.ink, color: color || p.cream, border: `2px solid ${p.ink}`, cursor: 'pointer',
        boxShadow: hover ? `2px 2px 0 ${p.ink}` : `4px 4px 0 ${p.ink}`,
        transform: hover ? 'translate(2px,2px)' : 'translate(0,0)',
        transition: 'all 0.08s', letterSpacing: '0.01em', ...style,
      }}>{children}</button>
  );
}

// Palette switcher — top-bar pill that expands
function MxPaletteSwitcher({ p, palettes, currentId, onPick }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px 5px 5px',
        background: '#fff', border: `2px solid ${p.ink}`, borderRadius: 999,
        cursor: 'pointer', fontFamily: mxMono, fontSize: 11, color: p.ink,
        boxShadow: `2px 2px 0 ${p.ink}`,
      }}>
        <span style={{ display: 'flex', gap: 2 }}>
          {p.swatch.map((c, i) => (
            <span key={i} style={{ width: 12, height: 18, background: c, borderRadius: 2, border: `1px solid ${p.ink}` }} />
          ))}
        </span>
        <span style={{ fontWeight: 700 }}>{p.label}</span>
        <span style={{ fontSize: 9 }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 30,
          background: p.cream, border: `2px solid ${p.ink}`, borderRadius: 12,
          boxShadow: `5px 5px 0 ${p.ink}`, padding: 10, width: 240,
        }}>
          <div style={{ fontFamily: mxMono, fontSize: 10, letterSpacing: '0.16em', color: '#666', padding: '4px 6px 8px' }}>
            CHOOSE A PALETTE
          </div>
          {Object.values(palettes).map((pp) => (
            <button key={pp.id} onClick={() => { onPick(pp.id); setOpen(false); }} style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 8px',
              background: pp.id === currentId ? '#fff' : 'transparent', border: 'none', cursor: 'pointer',
              fontFamily: mxFont, color: p.ink, textAlign: 'left', borderRadius: 8, marginBottom: 2,
            }}>
              <span style={{ display: 'flex', gap: 2 }}>
                {pp.swatch.map((c, i) => (
                  <span key={i} style={{ width: 14, height: 22, background: c, borderRadius: 3, border: `1.5px solid ${p.ink}` }} />
                ))}
              </span>
              <span style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{pp.label}</div>
                <div style={{ fontSize: 10, color: '#666', fontFamily: mxMono }}>{pp.sub}</div>
              </span>
              {pp.id === currentId && <span style={{ fontSize: 14 }}>●</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Onboarding overlay (Connect tools)
function MxOnboarding({ p, onClose, connected, setConnected }) {
  const tools = [
    { id: 'github', name: 'GitHub', glyph: '⌂', dot: p.lime, sub: 'PRs · reviews · commits' },
    { id: 'jira', name: 'Jira', glyph: '◆', dot: p.accent2, sub: 'tickets · sprints' },
    { id: 'slack', name: 'Slack', glyph: '#', dot: p.accent, sub: 'threads · decisions' },
    { id: 'confluence', name: 'Confluence', glyph: '¶', dot: p.hot, sub: 'docs · rfcs' },
  ];
  const count = Object.values(connected).filter(Boolean).length;
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(10,10,10,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, backdropFilter: 'blur(2px)',
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 560, background: p.cream, border: `2px solid ${p.ink}`, borderRadius: 18,
        boxShadow: `8px 8px 0 ${p.ink}`, padding: 26, fontFamily: mxFont, color: p.ink,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: mxMono, fontSize: 11, color: p.accent, letterSpacing: '0.18em' }}>◍ STEP 01 / 02</div>
            <h2 style={{ margin: '8px 0 4px', fontSize: 36, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>
              connect your <span style={{
                background: p.hot, color: p.cream, padding: '0 10px',
                display: 'inline-block', transform: 'rotate(-1.5deg)', borderRadius: 6,
              }}>tools</span>.
            </h2>
            <div style={{ fontSize: 13, color: '#444', marginTop: 6 }}>
              we watch the work you've already done. nothing manual.
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 22, cursor: 'pointer', color: p.ink, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 18 }}>
          {tools.map((t) => {
            const isOn = connected[t.id];
            return (
              <div key={t.id} onClick={() => setConnected({ ...connected, [t.id]: !isOn })} style={{
                border: `2px solid ${p.ink}`, borderRadius: 12, padding: '12px 14px',
                background: isOn ? t.dot : '#fff', display: 'flex', alignItems: 'center', gap: 10,
                cursor: 'pointer', boxShadow: `3px 3px 0 ${p.ink}`,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, background: isOn ? '#fff' : t.dot,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 800, border: `2px solid ${p.ink}`,
                }}>{t.glyph}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                  <div style={{ fontSize: 10, color: isOn ? p.ink : '#666', fontFamily: mxMono }}>
                    {isOn ? '● connected' : t.sub}
                  </div>
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 800, padding: '4px 8px', borderRadius: 999,
                  background: isOn ? p.ink : 'transparent', color: isOn ? p.cream : p.ink,
                  border: `1.5px solid ${p.ink}`, fontFamily: mxMono,
                }}>{isOn ? 'ON' : '+ LINK'}</div>
              </div>
            );
          })}
        </div>

        <div style={{
          marginTop: 18, padding: '10px 14px', borderRadius: 10, background: p.lime,
          border: `2px solid ${p.ink}`, fontFamily: mxMono, fontSize: 11, lineHeight: 1.5,
        }}>
          🔒 your data stays yours. wraps are private until you share a link.
        </div>

        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: mxMono, fontSize: 11, color: '#555' }}>{count} / 4 connected</div>
          <MxButton p={p} bg={count > 0 ? p.hot : '#ddd'} color={count > 0 ? p.cream : '#888'} onClick={count > 0 ? onClose : undefined}>
            {count > 0 ? 'continue →' : 'pick at least one'}
          </MxButton>
        </div>
      </div>
    </div>
  );
}

// Detail drawer
function MxDetail({ p, event, onClose }) {
  if (!event) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(10,10,10,0.55)',
      display: 'flex', justifyContent: 'flex-end', zIndex: 40,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 460, height: '100%', background: p.cream,
        borderLeft: `2px solid ${p.ink}`, padding: 28, fontFamily: mxFont, color: p.ink,
        overflow: 'auto', boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <MxBadge p={p} bg={event.color}>{event.kind}</MxBadge>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ fontFamily: mxMono, fontSize: 11, color: '#666', marginTop: 16, letterSpacing: '0.1em' }}>
          {event.m} · #{event.tag}
        </div>
        <h2 style={{ fontSize: 38, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.03em', margin: '6px 0 0', textWrap: 'balance' }}>
          {event.title}
        </h2>

        <div style={{
          marginTop: 18, padding: 14, background: '#fff', border: `2px solid ${p.ink}`,
          borderRadius: 12, boxShadow: `3px 3px 0 ${p.ink}`,
        }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{ fontFamily: mxMono, fontSize: 10, color: '#666', letterSpacing: '0.1em' }}>SOURCE</span>
            <MxBadge p={p} bg={p.cream}>{event.detail.source}</MxBadge>
            {event.detail.refs.map((r) => (
              <span key={r} style={{ fontFamily: mxMono, fontSize: 11, color: p.accent, fontWeight: 600 }}>{r}</span>
            ))}
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.5, color: '#222' }}>{event.detail.body}</div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={{ fontFamily: mxMono, fontSize: 10, color: '#666', letterSpacing: '0.18em', marginBottom: 6 }}>IMPORTANCE</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, height: 14, background: p.paper, border: `2px solid ${p.ink}`, borderRadius: 7, overflow: 'hidden' }}>
              <div style={{ width: `${event.detail.weight * 100}%`, height: '100%', background: p.hot }} />
            </div>
            <div style={{ fontFamily: mxMono, fontSize: 13, fontWeight: 700 }}>{(event.detail.weight * 100).toFixed(0)}</div>
          </div>
          <div style={{ fontFamily: mxMono, fontSize: 10, color: '#666', marginTop: 4 }}>
            you can adjust this — burrito drafts, you decide.
          </div>
        </div>

        <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
          <MxButton p={p} bg={p.lime} color={p.ink}>edit ✎</MxButton>
          <MxButton p={p} bg="#fff" color={p.ink}>change tag</MxButton>
          <MxButton p={p} bg="#fff" color="#888">hide</MxButton>
        </div>
      </div>
    </div>
  );
}

window.MxBadge = MxBadge;
window.MxButton = MxButton;
window.MxPaletteSwitcher = MxPaletteSwitcher;
window.MxOnboarding = MxOnboarding;
window.MxDetail = MxDetail;
