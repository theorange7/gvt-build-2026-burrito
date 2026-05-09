// Maximalist mobile wrap — palette-aware

function MxWrapSlide({ p, slide, idx, total }) {
  const common = (
    <div style={{
      position: 'absolute', top: 18, left: 22, right: 22,
      display: 'flex', justifyContent: 'space-between', fontFamily: mxMono, fontSize: 10, letterSpacing: '0.18em',
      color: 'inherit', opacity: 0.85,
    }}>
      <span>BURRITO · 2026 WRAP</span>
      <span>{String(idx + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}</span>
    </div>
  );

  if (slide.kind === 'intro') {
    return (
      <div style={{
        width: '100%', height: '100%', background: p.hot, color: p.cream, position: 'relative',
        fontFamily: mxFont, padding: '60px 28px 28px', boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      }}>
        {common}
        <div>
          <div style={{ fontSize: 90, opacity: 0.95, lineHeight: 1, marginTop: 8 }}>🌯</div>
        </div>
        <div>
          <div style={{ fontFamily: mxMono, fontSize: 12, letterSpacing: '0.2em', opacity: 0.85 }}>{slide.topline}</div>
          <div style={{
            fontSize: 76, lineHeight: 0.85, fontWeight: 800, letterSpacing: '-0.05em', marginTop: 10, whiteSpace: 'pre-line',
            color: p.lime, textShadow: `4px 4px 0 ${p.ink}`,
          }}>{slide.title}</div>
          <div style={{ fontSize: 14, marginTop: 16, opacity: 0.95, maxWidth: 280, lineHeight: 1.4 }}>{slide.sub}</div>
        </div>
        <div style={{ fontFamily: mxMono, fontSize: 11, opacity: 0.75 }}>tap or → to begin</div>
      </div>
    );
  }
  if (slide.kind === 'stat') {
    return (
      <div style={{
        width: '100%', height: '100%', background: p.lime, color: p.ink, position: 'relative',
        fontFamily: mxFont, padding: '60px 28px 28px', boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
      }}>
        {common}
        <div style={{ fontFamily: mxMono, fontSize: 12, letterSpacing: '0.2em', color: p.accent }}>{slide.topline}</div>
        <div style={{
          fontSize: 220, lineHeight: 0.8, fontWeight: 800, letterSpacing: '-0.06em', marginTop: 4,
          fontStyle: 'italic',
        }}>{slide.big}</div>
        <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, lineHeight: 1 }}>{slide.unit}.</div>
        <div style={{ fontSize: 14, marginTop: 14, opacity: 0.85, maxWidth: 280, lineHeight: 1.45 }}>{slide.sub}</div>
      </div>
    );
  }
  if (slide.kind === 'feature') {
    return (
      <div style={{
        width: '100%', height: '100%', background: p.accent, color: p.cream, position: 'relative',
        fontFamily: mxFont, padding: '60px 28px 28px', boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden',
      }}>
        {common}
        <div style={{
          position: 'absolute', top: -10, right: -40, fontSize: 360, fontWeight: 800, lineHeight: 0.8,
          color: p.hot, opacity: 0.4, fontStyle: 'italic', letterSpacing: '-0.06em',
        }}>{slide.big}</div>
        <div style={{ position: 'relative' }}>
          <div style={{ fontFamily: mxMono, fontSize: 12, letterSpacing: '0.2em', color: p.lime }}>{slide.topline}</div>
          <div style={{
            fontSize: 110, lineHeight: 0.82, fontWeight: 800, letterSpacing: '-0.05em', marginTop: 10,
            color: p.cream, fontStyle: 'italic',
          }}>{slide.big}</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: p.lime }}>{slide.unit}</div>
          <div style={{ fontSize: 14, marginTop: 18, lineHeight: 1.45, maxWidth: 280, opacity: 0.95 }}>{slide.sub}</div>
        </div>
      </div>
    );
  }
  if (slide.kind === 'category') {
    const cats = MX_categoriesFor(p);
    return (
      <div style={{
        width: '100%', height: '100%', background: p.cream, color: p.ink, position: 'relative',
        fontFamily: mxFont, padding: '60px 28px 28px', boxSizing: 'border-box',
      }}>
        {common}
        <div style={{ fontFamily: mxMono, fontSize: 12, letterSpacing: '0.2em', color: p.accent }}>{slide.topline}</div>
        <div style={{
          fontSize: 88, lineHeight: 0.9, fontWeight: 800, letterSpacing: '-0.04em', marginTop: 8,
          color: p.hot, fontStyle: 'italic',
        }}>{slide.big}.</div>
        <div style={{ fontSize: 14, marginTop: 6, color: '#444', maxWidth: 280, lineHeight: 1.4 }}>{slide.sub}</div>
        <div style={{ marginTop: 24 }}>
          {cats.map((c) => (
            <div key={c.name} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>{c.name}</span>
                <span style={{ fontFamily: mxMono, fontSize: 12, color: '#666' }}>{c.pct}%</span>
              </div>
              <div style={{ height: 12, background: '#fff', border: `1.5px solid ${p.ink}`, borderRadius: 4, overflow: 'hidden', marginTop: 3 }}>
                <div style={{ width: `${c.pct}%`, height: '100%', background: c.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (slide.kind === 'people') {
    return (
      <div style={{
        width: '100%', height: '100%', background: p.accent2, color: p.ink, position: 'relative',
        fontFamily: mxFont, padding: '60px 28px 28px', boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column',
      }}>
        {common}
        <div style={{ fontFamily: mxMono, fontSize: 12, letterSpacing: '0.2em', color: p.accent }}>{slide.topline}</div>
        <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.03em', marginTop: 6, maxWidth: 280 }}>
          you helped <span style={{ color: p.hot }}>{slide.big}</span> teammates ship faster.
        </div>
        <div style={{ fontSize: 13, marginTop: 10, color: '#333', maxWidth: 280, lineHeight: 1.45 }}>{slide.sub}</div>
        <div style={{ marginTop: 'auto', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {slide.names.map((n, i) => (
            <span key={n} style={{
              padding: '6px 12px', background: i === slide.names.length - 1 ? p.ink : '#fff', color: i === slide.names.length - 1 ? p.cream : p.ink,
              border: `2px solid ${p.ink}`, borderRadius: 999, fontFamily: mxMono, fontSize: 12, fontWeight: 700,
              transform: `rotate(${(i % 3 - 1) * 1.2}deg)`,
            }}>{n}</span>
          ))}
        </div>
      </div>
    );
  }
  if (slide.kind === 'rhythm') {
    const monthly = MX_DATA.monthly;
    const max = Math.max(...monthly);
    const months = ['J','F','M','A','M','J','J','A','S','O','N','D'];
    return (
      <div style={{
        width: '100%', height: '100%', background: p.ink, color: p.cream, position: 'relative',
        fontFamily: mxFont, padding: '60px 28px 28px', boxSizing: 'border-box',
      }}>
        {common}
        <div style={{ fontFamily: mxMono, fontSize: 12, letterSpacing: '0.2em', color: p.lime }}>{slide.topline}</div>
        <div style={{
          fontSize: 200, lineHeight: 0.85, fontWeight: 800, letterSpacing: '-0.05em',
          color: p.hot, fontStyle: 'italic', marginTop: 6,
        }}>{slide.big}</div>
        <div style={{ fontSize: 16, marginTop: 8, opacity: 0.9, lineHeight: 1.4, maxWidth: 280 }}>{slide.sub}</div>
        <div style={{ marginTop: 24, display: 'flex', alignItems: 'flex-end', gap: 4, height: 100 }}>
          {monthly.map((v, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: '100%', height: `${(v / max) * 80 + 4}px`,
                background: v === max ? p.hot : (v > max * 0.5 ? p.lime : '#444'),
                borderRadius: 2,
              }} />
              <div style={{ fontFamily: mxMono, fontSize: 9, color: v === max ? p.hot : '#aaa' }}>{months[i]}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  // final
  return (
    <div style={{
      width: '100%', height: '100%', background: p.lime, color: p.ink, position: 'relative',
      fontFamily: mxFont, padding: '60px 28px 28px', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    }}>
      {common}
      <div />
      <div>
        <div style={{ fontFamily: mxMono, fontSize: 12, letterSpacing: '0.2em', color: p.accent }}>WRAPPED.</div>
        <div style={{
          fontSize: 64, lineHeight: 0.85, fontWeight: 800, letterSpacing: '-0.04em', marginTop: 10, whiteSpace: 'pre-line',
        }}>{slide.title || 'A WRAP\nWORTH SHARING.'}</div>
        <div style={{ fontSize: 13, marginTop: 14, color: '#222', maxWidth: 280, lineHeight: 1.45 }}>{slide.sub}</div>

        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <MxButton p={p} bg={p.hot} color={p.cream} big>share link 🔗</MxButton>
          <MxButton p={p} bg="#fff" color={p.ink}>edit any slide ✎</MxButton>
          <MxButton p={p} bg="transparent" color="#555" style={{ boxShadow: 'none', border: `2px solid #ccc` }}>save as draft</MxButton>
        </div>
      </div>
      <div style={{ fontFamily: mxMono, fontSize: 10, color: '#444', textAlign: 'center', opacity: 0.7 }}>
        🔒 nothing has been sent. you control the link.
      </div>
    </div>
  );
}

function MxWrapPhone({ p, onClose }) {
  const [idx, setIdx] = React.useState(0);
  const [playing, setPlaying] = React.useState(true);
  const total = MX_SLIDES.length;
  const dur = MX_SLIDES[idx].dur || 5;
  const next = () => setIdx((i) => Math.min(total - 1, i + 1));
  const prev = () => setIdx((i) => Math.max(0, i - 1));

  // auto-advance when playing
  const [progress, setProgress] = React.useState(0);
  React.useEffect(() => {
    setProgress(0);
    if (!playing) return;
    const start = Date.now();
    const id = setInterval(() => {
      const t = (Date.now() - start) / (dur * 1000);
      if (t >= 1) {
        clearInterval(id);
        if (idx < total - 1) setIdx(idx + 1);
        else setPlaying(false);
      } else setProgress(t);
    }, 50);
    return () => clearInterval(id);
  }, [idx, playing]);

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === ' ') { e.preventDefault(); setPlaying(!playing); }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, idx]);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60,
      gap: 28,
    }}>
      <button onClick={prev} disabled={idx === 0} style={{
        width: 48, height: 48, borderRadius: '50%', background: idx === 0 ? '#333' : p.cream,
        color: idx === 0 ? '#666' : p.ink, border: `2px solid ${p.ink}`, fontSize: 22, fontWeight: 800,
        cursor: idx === 0 ? 'default' : 'pointer', fontFamily: mxFont,
      }}>←</button>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        {/* progress segments */}
        <div style={{ display: 'flex', gap: 4, width: 320 }}>
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 3, borderRadius: 2, overflow: 'hidden',
              background: 'rgba(255,255,255,0.25)',
            }}>
              <div style={{
                width: i < idx ? '100%' : i === idx ? `${progress * 100}%` : 0,
                height: '100%', background: p.hot, transition: i === idx ? 'none' : 'width 0.2s',
              }} />
            </div>
          ))}
        </div>
        {/* phone */}
        <div onClick={next} style={{
          width: 360, height: 720, borderRadius: 44, padding: 10, background: p.ink,
          boxShadow: `0 30px 80px rgba(0,0,0,0.5), 0 0 0 1.5px #333 inset`, cursor: 'pointer', position: 'relative',
        }}>
          <div style={{
            width: '100%', height: '100%', borderRadius: 36, overflow: 'hidden', position: 'relative', background: '#000',
          }}>
            <MxWrapSlide p={p} slide={MX_SLIDES[idx]} idx={idx} total={total} />
            {/* dynamic island */}
            <div style={{
              position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
              width: 110, height: 32, borderRadius: 999, background: '#000', zIndex: 30,
            }} />
          </div>
        </div>
        {/* play controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={(e) => { e.stopPropagation(); setPlaying(!playing); }} style={{
            width: 40, height: 40, borderRadius: '50%', background: p.hot, color: p.cream,
            border: `2px solid ${p.ink}`, fontSize: 14, cursor: 'pointer', fontFamily: mxFont, fontWeight: 800,
          }}>{playing ? '❚❚' : '▶'}</button>
          <button onClick={onClose} style={{
            background: 'transparent', border: `1.5px solid #fff5`, color: '#fff', fontFamily: mxMono,
            fontSize: 11, padding: '8px 14px', borderRadius: 999, cursor: 'pointer', letterSpacing: '0.1em',
          }}>← BACK TO DASHBOARD</button>
        </div>
      </div>

      <button onClick={next} disabled={idx === total - 1} style={{
        width: 48, height: 48, borderRadius: '50%', background: idx === total - 1 ? '#333' : p.lime,
        color: idx === total - 1 ? '#666' : p.ink, border: `2px solid ${p.ink}`, fontSize: 22, fontWeight: 800,
        cursor: idx === total - 1 ? 'default' : 'pointer', fontFamily: mxFont,
      }}>→</button>
    </div>
  );
}

window.MxWrapSlide = MxWrapSlide;
window.MxWrapPhone = MxWrapPhone;
