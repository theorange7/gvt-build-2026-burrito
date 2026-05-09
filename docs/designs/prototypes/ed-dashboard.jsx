// Editorial dashboard view

function EdDashboardView({ data, onOpen, onWrap, onSettings }) {
  const max = Math.max(...data.monthly);
  return (
    <div style={{
      width: '100%', minHeight: '100%', background: ED.paper,
      fontFamily: edFont.body, color: ED.ink,
    }}>
      {/* masthead */}
      <div style={{ padding: '20px 40px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <EdCaps>Vol. I — In Progress</EdCaps>
          <EdCaps>2 May, 2026 · No. 121</EdCaps>
        </div>
        <EdRule thick={2} style={{ marginTop: 6 }} />
        <div style={{
          textAlign: 'center', fontFamily: edFont.serif, fontSize: 56, fontWeight: 500,
          letterSpacing: '-0.015em', lineHeight: 1, padding: '12px 0 8px', fontStyle: 'italic',
        }}>Burrito.</div>
        <EdRule thick={2} />
        <div style={{
          display: 'flex', justifyContent: 'space-between', padding: '5px 0',
          fontFamily: edFont.sans, fontSize: 10, letterSpacing: '0.04em',
        }}>
          <span>The Personal Annual, kept quietly.</span>
          <span style={{ color: ED.red }}>Today's edition awaits your edit.</span>
          <span><button onClick={onSettings} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 10, fontFamily: edFont.sans, letterSpacing: '0.04em', color: ED.inkSoft }}>Settings</button></span>
        </div>
        <EdRule thick={1} />
      </div>

      <div style={{ padding: '24px 40px', display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 36 }}>
        {/* main column */}
        <div>
          <EdCaps style={{ color: ED.red }}>Lede — Year to Date</EdCaps>
          <h1 style={{
            fontFamily: edFont.serif, fontSize: 56, lineHeight: 0.92, letterSpacing: '-0.025em',
            fontWeight: 500, margin: '8px 0 0', textWrap: 'balance',
          }}>
            <span style={{ fontStyle: 'italic', color: ED.red }}>{data.totals.contributions}</span> contributions, indexed and awaiting your editorial.
          </h1>
          <div style={{
            marginTop: 12, fontFamily: edFont.body, fontSize: 14, lineHeight: 1.65,
            columnCount: 2, columnGap: 22, textWrap: 'pretty',
          }}>
            <span style={{ float: 'left', fontFamily: edFont.serif, fontSize: 48, lineHeight: 0.85, paddingRight: 6, paddingTop: 4, fontWeight: 500 }}>A</span>
            cross four sources — github, jira, slack, confluence — your year reads, so far, as the year of the quiet migration. The figures, recorded by the platform itself, suggest a season of structural work; the kind that does not announce itself in standups but accrues, patiently, in the form of unblocks and rfcs and reviews. The pages that follow are a draft — yours to revise.
          </div>

          <EdRule thick={1} style={{ margin: '20px 0 8px' }} />
          <EdCaps>Figure 1 — Activity by month</EdCaps>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 90, marginTop: 8, borderBottom: `1px solid ${ED.ink}` }}>
            {data.monthly.map((v, i) => {
              const isPeak = v === max;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ width: '100%', height: `${(v / max) * 84 + 4}px`, background: isPeak ? ED.red : ED.ink, position: 'relative' }}>
                    {isPeak && <div style={{ position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)', fontFamily: edFont.mono, fontSize: 10, color: ED.red }}>{v}</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            {data.months.map((m, i) => (
              <div key={i} style={{ flex: 1, fontFamily: edFont.mono, fontSize: 9, textAlign: 'center', color: data.monthly[i] === max ? ED.red : ED.inkSoft, letterSpacing: '0.06em' }}>{m}</div>
            ))}
          </div>

          <EdRule thick={1} style={{ margin: '24px 0 8px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <EdCaps style={{ color: ED.red }}>Recent Dispatches</EdCaps>
            <span style={{ fontFamily: edFont.body, fontStyle: 'italic', fontSize: 11, color: ED.inkSoft }}>read in full →</span>
          </div>
          {data.events.map((e, i) => (
            <button key={e.id} onClick={() => onOpen(e)} style={{
              width: '100%', textAlign: 'left', cursor: 'pointer',
              display: 'flex', alignItems: 'baseline', gap: 14, padding: '12px 0',
              borderBottom: i < data.events.length - 1 ? '1px dotted rgba(21,17,13,0.3)' : 'none',
              background: 'transparent', border: 'none', borderBottom: i < data.events.length - 1 ? '1px dotted rgba(21,17,13,0.3)' : 'none',
              fontFamily: edFont.body, color: ED.ink,
            }}
            onMouseEnter={(ev) => ev.currentTarget.style.background = 'rgba(164,33,33,0.04)'}
            onMouseLeave={(ev) => ev.currentTarget.style.background = 'transparent'}>
              <span style={{ fontFamily: edFont.mono, fontSize: 11, color: ED.inkSoft, width: 60 }}>{e.d}</span>
              <span style={{ flex: 1, fontFamily: edFont.serif, fontSize: 17, fontStyle: i === 0 ? 'italic' : 'normal', lineHeight: 1.25, textWrap: 'pretty' }}>{e.title}</span>
              <span style={{ fontFamily: edFont.sans, fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', color: ED.red, textTransform: 'uppercase' }}>{e.kind}</span>
              <span style={{ fontFamily: edFont.serif, fontSize: 14, color: ED.inkSoft }}>→</span>
            </button>
          ))}
        </div>

        {/* sidebar */}
        <div style={{ borderLeft: `1px solid ${ED.ink}`, paddingLeft: 24 }}>
          <EdCaps style={{ color: ED.red }}>Compose this Issue</EdCaps>
          <h2 style={{
            fontFamily: edFont.serif, fontSize: 30, fontWeight: 500, letterSpacing: '-0.02em',
            margin: '8px 0 0', lineHeight: 1, textWrap: 'balance',
          }}>
            A wrap, in <span style={{ fontStyle: 'italic', color: ED.red }}>seven pages</span>.
          </h2>
          <p style={{ fontFamily: edFont.body, fontStyle: 'italic', fontSize: 13, lineHeight: 1.55, color: ED.inkSoft, margin: '8px 0 0', maxWidth: 280 }}>
            A draft annual, composed in sixty seconds. Read alone first; share if you wish.
          </p>
          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <EdBtn primary onClick={onWrap} style={{ fontSize: 14, padding: '10px 20px' }}>Compose snapshot →</EdBtn>
          </div>

          <EdRule thick={1} style={{ margin: '24px 0 8px' }} />
          <EdCaps>By Category</EdCaps>
          <div style={{ marginTop: 8 }}>
            {data.categories.map((c) => (
              <div key={c.name} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '5px 0', borderBottom: '1px dotted rgba(21,17,13,0.3)' }}>
                <span style={{ flex: 1, fontFamily: edFont.serif, fontSize: 14 }}>{c.name}</span>
                <span style={{ width: 90, height: 3, background: ED.paperDeep }}>
                  <div style={{ width: `${c.pct}%`, height: '100%', background: c.color }} />
                </span>
                <span style={{ fontFamily: edFont.mono, fontSize: 10, color: ED.inkSoft, width: 30, textAlign: 'right' }}>{c.pct}%</span>
              </div>
            ))}
          </div>

          <EdRule thick={1} style={{ margin: '24px 0 8px' }} />
          <EdCaps>In Confidence</EdCaps>
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontFamily: edFont.serif, fontSize: 38, fontWeight: 500, lineHeight: 0.9, color: ED.red }}>{data.totals.unblocks}</span>
              <span style={{ fontFamily: edFont.body, fontStyle: 'italic', fontSize: 13, color: ED.inkSoft }}>teammates unblocked</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <span style={{ fontFamily: edFont.serif, fontSize: 38, fontWeight: 500, lineHeight: 0.9 }}>{data.totals.ships}</span>
              <span style={{ fontFamily: edFont.body, fontStyle: 'italic', fontSize: 13, color: ED.inkSoft }}>ships of consequence</span>
            </div>
          </div>

          <EdRule thick={2} style={{ margin: '24px 0 8px' }} />
          <p style={{ fontFamily: edFont.body, fontStyle: 'italic', fontSize: 12, lineHeight: 1.55, color: ED.inkSoft, margin: 0 }}>
            <span style={{ color: ED.red }}>Editor's note —</span> A mirror, not a judge. Burrito offers a draft; the editorial is yours.
          </p>
        </div>
      </div>
    </div>
  );
}

window.EdDashboardView = EdDashboardView;
