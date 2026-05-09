// Editorial mobile wrap

function EdSlide({ slide, idx, total }) {
  const chrome = (
    <>
      <div style={{ position: 'absolute', top: 18, left: 22, right: 22, display: 'flex', justifyContent: 'space-between', fontFamily: edFont.sans, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'inherit', opacity: 0.7 }}>
        <span>Burrito · Vol. I</span>
        <span>p. {String(idx + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}</span>
      </div>
      <div style={{ position: 'absolute', top: 36, left: 22, right: 22, borderTop: `1px solid currentColor`, opacity: 0.4 }} />
    </>
  );

  if (slide.kind === 'cover') {
    return (
      <div style={{ width: '100%', height: '100%', background: ED.paper, color: ED.ink, position: 'relative', fontFamily: edFont.body, padding: '60px 30px 30px', boxSizing: 'border-box' }}>
        {chrome}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
          <div style={{ marginTop: 'auto' }}>
            <div style={{ fontFamily: edFont.sans, fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', color: ED.red, textTransform: 'uppercase' }}>{slide.topline}</div>
            <div style={{ fontFamily: edFont.serif, fontSize: 76, fontStyle: 'italic', fontWeight: 500, letterSpacing: '-0.025em', lineHeight: 0.9, marginTop: 10 }}>Burrito.</div>
            <div style={{ borderTop: `2px solid ${ED.ink}`, margin: '14px 0' }} />
            <div style={{ fontFamily: edFont.serif, fontSize: 24, fontStyle: 'italic', lineHeight: 1.2, color: ED.ink }}>{slide.tagline}</div>
            <div style={{ fontFamily: edFont.sans, fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', color: ED.inkSoft, marginTop: 12, textTransform: 'uppercase' }}>{slide.volume}</div>
          </div>
          <div style={{ fontFamily: edFont.sans, fontSize: 9, color: ED.inkSoft, letterSpacing: '0.1em', textAlign: 'center', marginTop: 24 }}>TAP OR → TO READ</div>
        </div>
      </div>
    );
  }
  if (slide.kind === 'figure') {
    return (
      <div style={{ width: '100%', height: '100%', background: ED.paper, color: ED.ink, position: 'relative', fontFamily: edFont.body, padding: '60px 30px 30px', boxSizing: 'border-box' }}>
        {chrome}
        <div style={{ marginTop: 18 }}>
          <div style={{ fontFamily: edFont.sans, fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', color: ED.red, textTransform: 'uppercase' }}>{slide.topline}</div>
          <div style={{ fontFamily: edFont.serif, fontSize: 220, fontWeight: 500, lineHeight: 0.85, letterSpacing: '-0.04em', marginTop: 24, color: ED.ink }}>{slide.big}</div>
          <div style={{ fontFamily: edFont.serif, fontSize: 22, fontStyle: 'italic', marginTop: 8, color: ED.red }}>{slide.cap}</div>
          <div style={{ borderTop: `1px solid ${ED.ink}`, margin: '20px 0' }} />
          <div style={{ fontFamily: edFont.body, fontSize: 14, lineHeight: 1.55, fontStyle: 'italic', color: ED.inkSoft }}>{slide.body}</div>
        </div>
      </div>
    );
  }
  if (slide.kind === 'feature') {
    return (
      <div style={{ width: '100%', height: '100%', background: ED.paper, color: ED.ink, position: 'relative', fontFamily: edFont.body, padding: '60px 28px 28px', boxSizing: 'border-box', overflow: 'hidden' }}>
        {chrome}
        <div style={{ fontFamily: edFont.sans, fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', color: ED.red, textTransform: 'uppercase', marginTop: 12 }}>{slide.tag}</div>
        <h1 style={{ fontFamily: edFont.serif, fontSize: 38, fontWeight: 500, lineHeight: 0.95, letterSpacing: '-0.02em', margin: '8px 0 0', textWrap: 'balance' }}>
          You cut <span style={{ fontStyle: 'italic', color: ED.red }}>p99 latency</span> by <span style={{ fontStyle: 'italic' }}>40%</span> — and barely mentioned it.
        </h1>
        <div style={{ display: 'flex', gap: 14, marginTop: 18, paddingTop: 14, borderTop: `1px solid ${ED.ink}`, borderBottom: `1px solid ${ED.ink}`, paddingBottom: 14 }}>
          {slide.figures.map((f) => (
            <div key={f[0]} style={{ flex: 1 }}>
              <div style={{ fontFamily: edFont.serif, fontSize: 30, fontWeight: 500, lineHeight: 1, color: ED.red }}>{f[0]}</div>
              <div style={{ fontFamily: edFont.sans, fontSize: 9, fontWeight: 600, letterSpacing: '0.14em', color: ED.inkSoft, marginTop: 4, textTransform: 'uppercase' }}>{f[1]}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, fontFamily: edFont.body, fontSize: 13, lineHeight: 1.6 }}>
          <span style={{ float: 'left', fontFamily: edFont.serif, fontSize: 36, lineHeight: 0.85, paddingRight: 6, paddingTop: 3, fontWeight: 500, color: ED.red }}>I</span>
          {slide.body.slice(1)}
        </div>
        <div style={{ marginTop: 16, paddingLeft: 14, borderLeft: `3px solid ${ED.red}`, fontFamily: edFont.serif, fontStyle: 'italic', fontSize: 16, lineHeight: 1.4, color: ED.ink }}>
          {slide.pull}
        </div>
      </div>
    );
  }
  if (slide.kind === 'category') {
    return (
      <div style={{ width: '100%', height: '100%', background: ED.paper, color: ED.ink, position: 'relative', fontFamily: edFont.body, padding: '60px 30px 30px', boxSizing: 'border-box' }}>
        {chrome}
        <div style={{ fontFamily: edFont.sans, fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', color: ED.red, textTransform: 'uppercase', marginTop: 12 }}>{slide.topline}</div>
        <h2 style={{ fontFamily: edFont.serif, fontSize: 44, fontWeight: 500, lineHeight: 0.95, letterSpacing: '-0.02em', margin: '8px 0 6px', textWrap: 'balance', fontStyle: 'italic' }}>{slide.head}</h2>
        <div style={{ fontFamily: edFont.body, fontStyle: 'italic', fontSize: 13, color: ED.inkSoft }}>{slide.body}</div>
        <div style={{ borderTop: `1px solid ${ED.ink}`, margin: '18px 0 8px' }} />
        {slide.breakdown.map((c) => (
          <div key={c.name} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '8px 0', borderBottom: '1px dotted rgba(21,17,13,0.3)' }}>
            <span style={{ flex: 1, fontFamily: edFont.serif, fontSize: 18 }}>{c.name}</span>
            <span style={{ width: 90, height: 3, background: ED.paperDeep }}>
              <div style={{ width: `${c.pct}%`, height: '100%', background: c.color }} />
            </span>
            <span style={{ fontFamily: edFont.mono, fontSize: 11, width: 30, textAlign: 'right', color: ED.inkSoft }}>{c.pct}%</span>
          </div>
        ))}
      </div>
    );
  }
  if (slide.kind === 'people') {
    return (
      <div style={{ width: '100%', height: '100%', background: ED.paperDeep, color: ED.ink, position: 'relative', fontFamily: edFont.body, padding: '60px 30px 30px', boxSizing: 'border-box' }}>
        {chrome}
        <div style={{ fontFamily: edFont.sans, fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', color: ED.red, textTransform: 'uppercase', marginTop: 12 }}>{slide.topline}</div>
        <h2 style={{ fontFamily: edFont.serif, fontSize: 38, fontWeight: 500, lineHeight: 0.95, letterSpacing: '-0.02em', margin: '8px 0 8px', fontStyle: 'italic', textWrap: 'balance' }}>{slide.head}</h2>
        <div style={{ fontFamily: edFont.body, fontStyle: 'italic', fontSize: 13, color: ED.inkSoft, lineHeight: 1.5 }}>{slide.body}</div>
        <div style={{ borderTop: `1px solid ${ED.ink}`, margin: '18px 0' }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {slide.names.map((n) => (
            <span key={n} style={{ fontFamily: edFont.serif, fontSize: 18, fontStyle: 'italic', padding: '4px 10px', border: `1px solid ${ED.ink}`, background: ED.paper }}>{n}</span>
          ))}
        </div>
      </div>
    );
  }
  if (slide.kind === 'rhythm') {
    const max = Math.max(...slide.monthly);
    const months = ['J','F','M','A','M','J','J','A','S','O','N','D'];
    return (
      <div style={{ width: '100%', height: '100%', background: ED.paper, color: ED.ink, position: 'relative', fontFamily: edFont.body, padding: '60px 30px 30px', boxSizing: 'border-box' }}>
        {chrome}
        <div style={{ fontFamily: edFont.sans, fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', color: ED.red, textTransform: 'uppercase', marginTop: 12 }}>{slide.topline}</div>
        <h2 style={{ fontFamily: edFont.serif, fontSize: 38, fontWeight: 500, lineHeight: 0.95, letterSpacing: '-0.02em', margin: '8px 0 8px', textWrap: 'balance' }}>{slide.head}</h2>
        <div style={{ borderTop: `1px solid ${ED.ink}`, margin: '14px 0 14px' }} />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 200, borderBottom: `1px solid ${ED.ink}` }}>
          {slide.monthly.map((v, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: '100%', height: `${(v / max) * 190 + 4}px`, background: v === max ? ED.red : ED.ink }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          {months.map((m, i) => (
            <div key={i} style={{ flex: 1, fontFamily: edFont.mono, fontSize: 9, textAlign: 'center', color: slide.monthly[i] === max ? ED.red : ED.inkSoft, letterSpacing: '0.06em' }}>{m}</div>
          ))}
        </div>
        <div style={{ fontFamily: edFont.body, fontStyle: 'italic', fontSize: 13, color: ED.inkSoft, marginTop: 18, lineHeight: 1.5 }}>{slide.body}</div>
      </div>
    );
  }
  // colophon / final
  return (
    <div style={{ width: '100%', height: '100%', background: ED.ink, color: ED.paper, position: 'relative', fontFamily: edFont.body, padding: '60px 30px 30px', boxSizing: 'border-box' }}>
      {chrome}
      <div style={{ fontFamily: edFont.sans, fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', color: '#E8B4B4', textTransform: 'uppercase', marginTop: 12 }}>{slide.topline}</div>
      <h2 style={{ fontFamily: edFont.serif, fontSize: 44, fontWeight: 500, lineHeight: 0.95, letterSpacing: '-0.02em', margin: '8px 0 12px', fontStyle: 'italic', textWrap: 'balance' }}>{slide.head}</h2>
      <div style={{ borderTop: `1px solid ${ED.paper}`, opacity: 0.4, margin: '14px 0' }} />
      <div style={{ fontFamily: edFont.body, fontSize: 14, lineHeight: 1.6, opacity: 0.9 }}>{slide.body}</div>
      <div style={{ position: 'absolute', bottom: 30, left: 30, right: 30, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button style={{ fontFamily: edFont.serif, fontStyle: 'italic', fontSize: 16, padding: '12px 18px', background: ED.paper, color: ED.ink, border: 'none', cursor: 'pointer', letterSpacing: '0.01em' }}>Compose share link →</button>
        <button style={{ fontFamily: edFont.serif, fontStyle: 'italic', fontSize: 14, padding: '10px 18px', background: 'transparent', color: ED.paper, border: `1px solid ${ED.paper}`, cursor: 'pointer' }}>Edit any page ✎</button>
        <div style={{ fontFamily: edFont.sans, fontSize: 9, letterSpacing: '0.14em', textAlign: 'center', opacity: 0.6, textTransform: 'uppercase', marginTop: 4 }}>Nothing has been shared.</div>
      </div>
    </div>
  );
}

function EdWrapPhone({ onClose }) {
  const [idx, setIdx] = React.useState(0);
  const total = ED_SLIDES.length;
  const next = () => setIdx((i) => Math.min(total - 1, i + 1));
  const prev = () => setIdx((i) => Math.max(0, i - 1));

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(21,17,13,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, gap: 28 }}>
      <button onClick={prev} disabled={idx === 0} style={{ width: 44, height: 44, borderRadius: '50%', background: 'transparent', color: idx === 0 ? '#666' : ED.paper, border: `1px solid ${idx === 0 ? '#444' : ED.paper}`, fontSize: 18, cursor: idx === 0 ? 'default' : 'pointer', fontFamily: edFont.serif }}>←</button>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', gap: 4, width: 320 }}>
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 1.5, background: i <= idx ? ED.red : 'rgba(244,239,230,0.25)' }} />
          ))}
        </div>
        <div onClick={next} style={{ width: 360, height: 720, borderRadius: 44, padding: 10, background: ED.ink, boxShadow: `0 30px 80px rgba(0,0,0,0.6), 0 0 0 1.5px #333 inset`, cursor: 'pointer', position: 'relative' }}>
          <div style={{ width: '100%', height: '100%', borderRadius: 36, overflow: 'hidden', position: 'relative', background: '#000' }}>
            <EdSlide slide={ED_SLIDES[idx]} idx={idx} total={total} />
            <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', width: 110, height: 32, borderRadius: 999, background: '#000', zIndex: 30 }} />
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: `1px solid #ffffff44`, color: ED.paper, fontFamily: edFont.sans, fontSize: 10, padding: '6px 14px', cursor: 'pointer', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Return to dashboard</button>
      </div>
      <button onClick={next} disabled={idx === total - 1} style={{ width: 44, height: 44, borderRadius: '50%', background: 'transparent', color: idx === total - 1 ? '#666' : ED.paper, border: `1px solid ${idx === total - 1 ? '#444' : ED.paper}`, fontSize: 18, cursor: idx === total - 1 ? 'default' : 'pointer', fontFamily: edFont.serif }}>→</button>
    </div>
  );
}

window.EdSlide = EdSlide;
window.EdWrapPhone = EdWrapPhone;
