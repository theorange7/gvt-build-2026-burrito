// Maximalist desktop dashboard — palette-aware

function MxDashboardView({ p, palettes, paletteId, setPaletteId, onOpen, onWrap, onSettings, onArchive, onView }) {
  const data = MX_DATA;
  const events = MX_eventsFor(p);
  const categories = MX_categoriesFor(p);
  const max = Math.max(...data.monthly);

  return (
    <div style={{ width: '100%', minHeight: '100%', background: p.paper, fontFamily: mxFont, color: p.ink }}>
      {/* top nav */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 28px', borderBottom: `2px solid ${p.ink}`, background: p.cream,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em' }}>
          <span style={{
            width: 28, height: 28, borderRadius: 8, background: p.hot,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
          }}>🌯</span>
          burrito.
        </div>
        <div style={{ display: 'flex', gap: 24, fontSize: 12, fontFamily: mxMono, color: '#444' }}>
          <span style={{ color: p.ink, fontWeight: 700, borderBottom: `2px solid ${p.hot}`, paddingBottom: 2 }}>timeline</span>
          <span style={{ cursor: 'pointer' }} onClick={onArchive}>archive</span>
          <span style={{ cursor: 'pointer' }} onClick={onSettings}>settings</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <MxPaletteSwitcher p={p} palettes={palettes} currentId={paletteId} onPick={setPaletteId} />
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: p.accent, color: p.cream,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13,
            border: `2px solid ${p.ink}`,
          }}>YO</div>
        </div>
      </div>

      <div style={{ padding: '24px 28px', display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, maxWidth: 1280, margin: '0 auto' }}>
        {/* hero column */}
        <div>
          <div style={{ fontFamily: mxMono, fontSize: 11, letterSpacing: '0.18em', color: p.accent, marginBottom: 8 }}>
            ◍ 2026 · MAY · IN PROGRESS
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 110, lineHeight: 0.85, fontWeight: 800, letterSpacing: '-0.05em' }}>{data.totals.contributions}</div>
            <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1, color: '#333' }}>
              contributions caught<br />
              <span style={{ color: '#888', fontWeight: 500, fontSize: 14 }}>this year, automatically.</span>
            </div>
          </div>

          {/* timeline */}
          <div style={{
            marginTop: 16, padding: 16, background: p.cream,
            border: `2px solid ${p.ink}`, borderRadius: 14, boxShadow: `4px 4px 0 ${p.ink}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontFamily: mxMono, fontSize: 10, letterSpacing: '0.18em', color: '#666' }}>YEAR RHYTHM</div>
              <div style={{ fontFamily: mxMono, fontSize: 10, color: '#666' }}>
                <span style={{ color: p.hot }}>■</span> peak  <span style={{ color: p.accent }}>■</span> high  <span style={{ color: p.ink }}>■</span> base
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 90 }}>
              {data.monthly.map((v, i) => {
                const isPeak = v === max;
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{
                      width: '100%', height: `${(v / max) * 70 + 6}px`,
                      background: isPeak ? p.hot : (v > max * 0.5 ? p.accent : p.ink),
                      borderRadius: 3, position: 'relative',
                    }}>
                      {isPeak && (
                        <div style={{
                          position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%) rotate(-2deg)',
                          fontFamily: mxMono, fontSize: 10, fontWeight: 800, color: p.hot,
                        }}>{v}</div>
                      )}
                    </div>
                    <div style={{ fontFamily: mxMono, fontSize: 9, color: isPeak ? p.hot : '#666', fontWeight: isPeak ? 700 : 400 }}>
                      {data.months[i]}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* events list */}
          <div style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontFamily: mxMono, fontSize: 11, letterSpacing: '0.18em', color: '#666' }}>RECENT</div>
              <div style={{ fontFamily: mxMono, fontSize: 11, color: '#888' }}>tap any to expand →</div>
            </div>
            {events.map((e) => (
              <button key={e.id} onClick={() => onOpen(e)} style={{
                width: '100%', textAlign: 'left', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                background: '#fff', border: `2px solid ${p.ink}`, borderRadius: 12,
                marginBottom: 8, fontFamily: mxFont, color: p.ink,
                boxShadow: `3px 3px 0 ${p.ink}`, transition: 'transform 0.08s',
              }}
              onMouseEnter={(ev) => ev.currentTarget.style.transform = 'translate(-1px,-1px)'}
              onMouseLeave={(ev) => ev.currentTarget.style.transform = 'translate(0,0)'}>
                <div style={{ width: 56, fontFamily: mxMono, fontSize: 11, fontWeight: 700, color: '#666' }}>{e.m}</div>
                <MxBadge p={p} bg={e.color}>{e.kind}</MxBadge>
                <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{e.title}</div>
                <div style={{ fontFamily: mxMono, fontSize: 10, color: '#888' }}>#{e.tag}</div>
                <div style={{ fontSize: 14, color: '#888' }}>→</div>
              </button>
            ))}
          </div>
        </div>

        {/* sidebar */}
        <div>
          {/* big wrap CTA */}
          <div style={{
            background: p.hot, color: p.cream, borderRadius: 16, padding: 20,
            border: `2px solid ${p.ink}`, boxShadow: `5px 5px 0 ${p.ink}`,
          }}>
            <div style={{ fontFamily: mxMono, fontSize: 10, letterSpacing: '0.18em', opacity: 0.9 }}>READY ENOUGH</div>
            <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 0.95, marginTop: 6, letterSpacing: '-0.03em' }}>
              wrap your<br />year so far.
            </div>
            <div style={{ fontSize: 12, marginTop: 8, opacity: 0.9, lineHeight: 1.4 }}>
              7 highlight slides. ready in 60 seconds. nothing leaves until you share a link.
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <MxButton p={p} bg={p.lime} color={p.ink} onClick={() => onWrap('phone')} big>WRAP IT 🌯 →</MxButton>
              <MxButton p={p} bg="#fff" color={p.ink} onClick={() => onWrap('desktop')}>watch full-screen ▶</MxButton>
            </div>
          </div>

          {/* category breakdown */}
          <div style={{
            marginTop: 16, padding: 16, background: p.cream,
            border: `2px solid ${p.ink}`, borderRadius: 14, boxShadow: `4px 4px 0 ${p.ink}`,
          }}>
            <div style={{ fontFamily: mxMono, fontSize: 10, letterSpacing: '0.18em', color: '#666', marginBottom: 10 }}>BY CATEGORY</div>
            {categories.map((c) => (
              <div key={c.name} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span style={{ fontWeight: 600 }}>{c.name}</span>
                  <span style={{ fontFamily: mxMono, color: '#666' }}>{c.pct}%</span>
                </div>
                <div style={{ height: 8, background: '#fff', border: `1.5px solid ${p.ink}`, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${c.pct}%`, height: '100%', background: c.color }} />
                </div>
              </div>
            ))}
          </div>

          {/* small stats */}
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ padding: 14, background: p.lime, border: `2px solid ${p.ink}`, borderRadius: 12, boxShadow: `3px 3px 0 ${p.ink}` }}>
              <div style={{ fontFamily: mxMono, fontSize: 9, letterSpacing: '0.16em', color: '#333' }}>UNBLOCKS</div>
              <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1, marginTop: 2 }}>{data.totals.unblocks}</div>
              <div style={{ fontSize: 11, color: '#333', marginTop: 2 }}>teammates</div>
            </div>
            <div style={{ padding: 14, background: p.accent, color: p.cream, border: `2px solid ${p.ink}`, borderRadius: 12, boxShadow: `3px 3px 0 ${p.ink}` }}>
              <div style={{ fontFamily: mxMono, fontSize: 9, letterSpacing: '0.16em', opacity: 0.85 }}>SHIPS</div>
              <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1, marginTop: 2 }}>{data.totals.ships}</div>
              <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>this year</div>
            </div>
          </div>

          <div style={{ marginTop: 16, fontFamily: mxMono, fontSize: 11, color: '#666', lineHeight: 1.5, padding: '0 4px' }}>
            🪞 a mirror, not a judge. burrito drafts. you edit. you own it.
          </div>
        </div>
      </div>
    </div>
  );
}

window.MxDashboardView = MxDashboardView;
