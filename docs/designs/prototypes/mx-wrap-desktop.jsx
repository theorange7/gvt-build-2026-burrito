// Maximalist DESKTOP wrap — full-bleed 16:9, 1600x900 design canvas
// Built to be aggressively bigger than the phone version: type that bleeds
// off edges, asymmetric grids, sticker collages, layered numerals.

const MXD_W = 1600;
const MXD_H = 900;

// ---- shared chrome (top + bottom bar that sits on every slide) ----
function MxdChrome({ p, idx, total, slide }) {
  return (
    <>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 48,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 36px', fontFamily: mxMono, fontSize: 12, letterSpacing: '0.22em',
        color: 'inherit', opacity: 0.85, zIndex: 5,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{
            width: 18, height: 18, borderRadius: 5, background: p.hot,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: `1.5px solid currentColor`,
          }} />
          <span style={{ fontWeight: 700 }}>BURRITO</span>
          <span style={{ opacity: 0.5 }}>/</span>
          <span>2026 WRAP</span>
          <span style={{ opacity: 0.5 }}>/</span>
          <span>{slide.chapter || 'CHAPTER'}</span>
        </div>
        <div style={{ display: 'flex', gap: 18 }}>
          <span style={{ opacity: 0.6 }}>desktop · 16:9</span>
          <span style={{ fontWeight: 700 }}>{String(idx + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}</span>
        </div>
      </div>
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 36,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 36px', fontFamily: mxMono, fontSize: 11, letterSpacing: '0.18em',
        color: 'inherit', opacity: 0.7, zIndex: 5,
      }}>
        <span>{slide.foot || '— a year of work, caught quietly.'}</span>
        <span>NOTHING SHARED · YOU CONTROL THE LINK 🔒</span>
      </div>
    </>
  );
}

// ---- ticker strip (re-usable filler that adds maximalist energy) ----
function MxdTicker({ p, text, bg, color, top, bottom, rotate = -2 }) {
  const rep = Array.from({ length: 8 }).map(() => text).join('  ✦  ');
  return (
    <div style={{
      position: 'absolute', left: -80, right: -80,
      top, bottom, transform: `rotate(${rotate}deg)`,
      background: bg, color, borderTop: `2px solid ${p.ink}`, borderBottom: `2px solid ${p.ink}`,
      fontFamily: mxMono, fontSize: 18, letterSpacing: '0.2em', fontWeight: 700,
      padding: '8px 0', whiteSpace: 'nowrap', overflow: 'hidden', zIndex: 2,
    }}>
      {rep}  ✦  {rep}
    </div>
  );
}

// ============================================================
// Slide renderers
// ============================================================

function MxdIntro({ p, slide, idx, total }) {
  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
      background: p.hot, color: p.cream, fontFamily: mxFont,
    }}>
      <MxdChrome p={p} idx={idx} total={total} slide={slide} />

      {/* huge year in the back */}
      <div style={{
        position: 'absolute', top: 60, left: -40, right: -40,
        textAlign: 'center', fontSize: 720, lineHeight: 0.85, fontWeight: 800,
        color: p.lime, opacity: 0.18, fontStyle: 'italic', letterSpacing: '-0.07em',
        pointerEvents: 'none', userSelect: 'none',
      }}>2026</div>

      <MxdTicker p={p} text="YEAR IN REVIEW" bg={p.lime} color={p.ink} top={140} rotate={-3} />
      <MxdTicker p={p} text="A QUIET YEAR. A LOUD WRAP." bg={p.ink} color={p.cream} bottom={130} rotate={2} />

      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center', zIndex: 3,
      }}>
        <div style={{ fontFamily: mxMono, fontSize: 14, letterSpacing: '0.3em', marginBottom: 18 }}>
          ◍ PRESS PLAY · OR ANY KEY TO ADVANCE
        </div>
        <div style={{
          fontSize: 220, lineHeight: 0.82, fontWeight: 800, letterSpacing: '-0.06em',
          color: p.cream, textShadow: `8px 8px 0 ${p.ink}`,
        }}>YOUR YEAR,</div>
        <div style={{
          fontSize: 220, lineHeight: 0.82, fontWeight: 800, letterSpacing: '-0.06em',
          color: p.lime, textShadow: `8px 8px 0 ${p.ink}`, fontStyle: 'italic', marginTop: 8,
        }}>WRAPPED.</div>
        <div style={{
          fontSize: 22, marginTop: 28, maxWidth: 720, lineHeight: 1.45, opacity: 0.95,
        }}>a 60-second look at what you actually shipped, reviewed, wrote, unblocked, and quietly held together.</div>
      </div>
    </div>
  );
}

function MxdStat({ p, slide, idx, total }) {
  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
      background: p.lime, color: p.ink, fontFamily: mxFont,
    }}>
      <MxdChrome p={p} idx={idx} total={total} slide={slide} />

      {/* asymmetric layout — colossal numeral on left, stack of context on right */}
      <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', padding: '0 60px' }}>
        {/* numeral */}
        <div style={{ position: 'relative' }}>
          <div style={{
            position: 'absolute', left: -20, top: -120,
            fontSize: 72, fontWeight: 800, fontFamily: mxMono, letterSpacing: '0.2em',
            color: p.accent, transform: 'rotate(-4deg)',
          }}>YOU CAUGHT</div>
          <div style={{
            fontSize: 720, lineHeight: 0.78, fontWeight: 800, letterSpacing: '-0.08em',
            fontStyle: 'italic', color: p.ink, position: 'relative',
          }}>
            181
            <span style={{
              position: 'absolute', right: -40, top: 60,
              fontSize: 90, fontWeight: 800, color: p.hot,
              transform: 'rotate(12deg)', fontStyle: 'normal',
              border: `4px solid ${p.ink}`, padding: '6px 18px', background: p.cream,
              boxShadow: `8px 8px 0 ${p.ink}`,
            }}>+34 vs '25</span>
          </div>
          <div style={{ fontSize: 36, fontWeight: 800, marginTop: 18, letterSpacing: '-0.02em' }}>
            contributions, all year.
          </div>
        </div>

        {/* right stack */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingLeft: 60 }}>
          {[
            { k: 'shipped', v: '14', sub: 'PRs that broke ground' },
            { k: 'reviewed', v: '142', sub: 'PRs read · 71h saved for others' },
            { k: 'unblocked', v: '12', sub: 'teammates · 4 squads · 28 threads' },
            { k: 'wrote', v: '6', sub: 'docs · including 1 accepted RFC' },
          ].map((row, i) => (
            <div key={row.k} style={{
              display: 'grid', gridTemplateColumns: '180px auto 1fr', gap: 18, alignItems: 'baseline',
              borderBottom: i < 3 ? `2px solid ${p.ink}` : 'none', paddingBottom: 14,
            }}>
              <div style={{ fontFamily: mxMono, fontSize: 18, letterSpacing: '0.2em', color: p.accent, fontWeight: 700 }}>
                {row.k.toUpperCase()}
              </div>
              <div style={{ fontSize: 78, fontWeight: 800, lineHeight: 0.9, fontStyle: 'italic', color: p.hot }}>
                {row.v}
              </div>
              <div style={{ fontSize: 16, color: '#222', lineHeight: 1.35 }}>{row.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MxdFeature({ p, slide, idx, total }) {
  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
      background: p.accent, color: p.cream, fontFamily: mxFont,
    }}>
      <MxdChrome p={p} idx={idx} total={total} slide={slide} />

      {/* gigantic % bleeding off the right */}
      <div style={{
        position: 'absolute', top: -100, right: -180,
        fontSize: 1280, lineHeight: 0.78, fontWeight: 800, letterSpacing: '-0.08em',
        color: p.hot, fontStyle: 'italic', zIndex: 1,
        textShadow: `12px 12px 0 ${p.ink}`,
      }}>40%</div>

      {/* left-side editorial column */}
      <div style={{ position: 'absolute', left: 60, top: 130, width: 700, zIndex: 3 }}>
        <div style={{
          display: 'inline-block', fontFamily: mxMono, fontSize: 13, letterSpacing: '0.25em',
          background: p.lime, color: p.ink, padding: '6px 12px',
          border: `2px solid ${p.ink}`, fontWeight: 700,
        }}>BIGGEST WIN · SHIPPING</div>

        <div style={{
          fontSize: 110, lineHeight: 0.88, fontWeight: 800, letterSpacing: '-0.05em',
          marginTop: 24, color: p.cream,
        }}>
          you cut <span style={{ fontStyle: 'italic', color: p.lime }}>p99 latency</span> by forty percent.
        </div>

        <div style={{ fontSize: 22, lineHeight: 1.45, marginTop: 26, opacity: 0.95, maxWidth: 580 }}>
          payment-rail v2 went out over three weeks. twelve teammates unblocked. three outages avoided in the rollout window. nobody on the customer side noticed — which is the highest praise a migration can get.
        </div>

        <div style={{ marginTop: 28, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {['#shipping', '#leadership', 'github · pr-882', 'github · pr-901', '+ 6 commits'].map((t, i) => (
            <span key={t} style={{
              fontFamily: mxMono, fontSize: 13, padding: '6px 12px', borderRadius: 999,
              background: i < 2 ? p.lime : 'rgba(255,255,255,0.12)',
              color: i < 2 ? p.ink : p.cream,
              border: `1.5px solid ${i < 2 ? p.ink : '#fff5'}`, letterSpacing: '0.05em',
            }}>{t}</span>
          ))}
        </div>
      </div>

      {/* mini sparkline near the % */}
      <div style={{
        position: 'absolute', bottom: 80, right: 80, width: 360, zIndex: 4,
        background: p.cream, color: p.ink, padding: 18, border: `2px solid ${p.ink}`,
        boxShadow: `10px 10px 0 ${p.ink}`,
      }}>
        <div style={{ fontFamily: mxMono, fontSize: 11, letterSpacing: '0.2em', color: p.accent }}>P99 LATENCY · MS</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80, marginTop: 10 }}>
          {[168, 162, 155, 158, 142, 130, 118, 112, 108, 104, 102, 101].map((v, i) => (
            <div key={i} style={{
              flex: 1, height: `${(v / 168) * 80}px`,
              background: i === 11 ? p.hot : (i > 6 ? p.lime : p.ink),
            }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontFamily: mxMono, fontSize: 11 }}>
          <span>168 → 101</span>
          <span style={{ color: p.hot, fontWeight: 700 }}>−40%</span>
        </div>
      </div>
    </div>
  );
}

function MxdCategory({ p, slide, idx, total }) {
  const cats = MX_categoriesFor(p);
  const max = Math.max(...cats.map(c => c.pct));
  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
      background: p.cream, color: p.ink, fontFamily: mxFont,
    }}>
      <MxdChrome p={p} idx={idx} total={total} slide={slide} />

      {/* word "shipping" full bleed */}
      <div style={{
        position: 'absolute', left: 60, top: 130, right: 60, zIndex: 3,
      }}>
        <div style={{ fontFamily: mxMono, fontSize: 14, letterSpacing: '0.25em', color: p.accent, fontWeight: 700 }}>
          ◍ TOP CATEGORY · WEIGHTED
        </div>
        <div style={{
          fontSize: 320, lineHeight: 0.82, fontWeight: 800, letterSpacing: '-0.06em',
          color: p.hot, fontStyle: 'italic', marginTop: 4,
          textShadow: `10px 10px 0 ${p.ink}`,
        }}>shipping.</div>
      </div>

      {/* horizontal stacked bar at bottom */}
      <div style={{
        position: 'absolute', left: 60, right: 60, bottom: 90, zIndex: 4,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.4, maxWidth: 740 }}>
            42% of your weighted impact this year. four others rounded it out.
          </div>
          <div style={{ fontFamily: mxMono, fontSize: 13, letterSpacing: '0.2em', color: '#666' }}>
            100% = total weighted contribution
          </div>
        </div>

        {/* segmented bar */}
        <div style={{
          height: 80, display: 'flex', border: `2.5px solid ${p.ink}`,
          boxShadow: `8px 8px 0 ${p.ink}`,
        }}>
          {cats.map((c) => (
            <div key={c.name} style={{
              flex: c.pct, background: c.color, color: c.pct === max ? p.cream : p.ink,
              padding: '10px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              borderRight: `2.5px solid ${p.ink}`, fontFamily: mxMono, fontSize: 14, fontWeight: 700,
              letterSpacing: '0.1em', overflow: 'hidden',
            }}>
              <div style={{ fontSize: 11 }}>{c.name.toUpperCase()}</div>
              <div style={{ fontSize: 28, fontStyle: 'italic', fontFamily: mxFont, letterSpacing: '-0.02em' }}>{c.pct}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MxdPeople({ p, slide, idx, total }) {
  const names = ['priya','marcus','aisha','jin','sam','noor','dani','kai','ren','tomi','+ 2'];
  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
      background: p.accent2, color: p.ink, fontFamily: mxFont,
    }}>
      <MxdChrome p={p} idx={idx} total={total} slide={slide} />

      {/* huge "12" mark */}
      <div style={{
        position: 'absolute', left: 60, top: 110, zIndex: 3,
      }}>
        <div style={{ fontFamily: mxMono, fontSize: 14, letterSpacing: '0.25em', color: p.accent, fontWeight: 700 }}>
          ◍ YOU MADE OTHERS FASTER
        </div>
        <div style={{
          fontSize: 80, lineHeight: 1, fontWeight: 800, letterSpacing: '-0.03em',
          marginTop: 18, maxWidth: 800,
        }}>
          you helped <span style={{
            fontSize: 220, color: p.hot, fontStyle: 'italic',
            display: 'inline-block', verticalAlign: '-0.1em', lineHeight: 0.8,
            textShadow: `6px 6px 0 ${p.ink}`,
          }}>12</span> teammates ship faster.
        </div>
        <div style={{ fontSize: 22, marginTop: 16, maxWidth: 700, lineHeight: 1.4, color: '#222' }}>
          across four squads, twenty-eight threads worth thanking. ranked by how much friction you took off their day.
        </div>
      </div>

      {/* names as scattered chunky chips */}
      <div style={{
        position: 'absolute', left: 60, bottom: 90, right: 60, zIndex: 4,
        display: 'flex', flexWrap: 'wrap', gap: 14,
      }}>
        {names.map((n, i) => {
          const isTop3 = i < 3;
          return (
            <span key={n} style={{
              padding: '14px 22px',
              background: isTop3 ? p.hot : (i === names.length - 1 ? p.ink : '#fff'),
              color: (isTop3 || i === names.length - 1) ? p.cream : p.ink,
              border: `2.5px solid ${p.ink}`, borderRadius: 999,
              fontFamily: mxFont, fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em',
              transform: `rotate(${(i % 4 - 1.5) * 1.5}deg)`,
              boxShadow: `4px 4px 0 ${p.ink}`,
              fontStyle: isTop3 ? 'italic' : 'normal',
            }}>
              {isTop3 && <span style={{ fontFamily: mxMono, fontSize: 14, marginRight: 8, fontStyle: 'normal' }}>0{i + 1}</span>}
              {n}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function MxdRhythm({ p, slide, idx, total }) {
  const monthly = MX_DATA.monthly;
  const months = MX_DATA.months;
  const max = Math.max(...monthly);
  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
      background: p.ink, color: p.cream, fontFamily: mxFont,
    }}>
      <MxdChrome p={p} idx={idx} total={total} slide={slide} />

      {/* OCT title */}
      <div style={{ position: 'absolute', left: 60, top: 110, zIndex: 3, width: 720 }}>
        <div style={{ fontFamily: mxMono, fontSize: 14, letterSpacing: '0.25em', color: p.lime, fontWeight: 700 }}>
          ◍ YOUR MONTH · YOUR RHYTHM
        </div>
        <div style={{
          fontSize: 360, lineHeight: 0.82, fontWeight: 800, letterSpacing: '-0.07em',
          color: p.hot, fontStyle: 'italic', marginTop: 4,
        }}>OCT.</div>
        <div style={{ fontSize: 28, lineHeight: 1.35, marginTop: 4, opacity: 0.95, maxWidth: 580 }}>
          your busiest month. <strong style={{ color: p.lime, fontWeight: 800 }}>31 contributions</strong> — almost double your monthly average.
        </div>
        <div style={{ fontSize: 18, marginTop: 14, opacity: 0.7, maxWidth: 540, lineHeight: 1.4, fontFamily: mxMono }}>
          three weeks of the payment-rail rollout fell here. you took one weekday off. nobody noticed because nothing broke.
        </div>
      </div>

      {/* full-width bar chart on right */}
      <div style={{
        position: 'absolute', right: 60, top: 130, bottom: 110, width: 700, zIndex: 3,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 480 }}>
          {monthly.map((v, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{
                fontFamily: mxMono, fontSize: 14, color: v === max ? p.hot : '#888',
                fontWeight: v === max ? 800 : 400,
              }}>{v}</div>
              <div style={{
                width: '100%', height: `${(v / max) * 380 + 20}px`,
                background: v === max ? p.hot : (v > max * 0.5 ? p.lime : '#2a2a2a'),
                border: v === max ? `2px solid ${p.lime}` : 'none',
                position: 'relative',
              }}>
                {v === max && <div style={{
                  position: 'absolute', top: -28, left: '50%', transform: 'translateX(-50%) rotate(-4deg)',
                  background: p.lime, color: p.ink, padding: '3px 8px', fontFamily: mxMono, fontSize: 11,
                  letterSpacing: '0.15em', fontWeight: 700, border: `1.5px solid ${p.cream}`, whiteSpace: 'nowrap',
                }}>PEAK</div>}
              </div>
              <div style={{
                fontFamily: mxMono, fontSize: 12, letterSpacing: '0.1em',
                color: v === max ? p.hot : '#888', fontWeight: v === max ? 700 : 400,
              }}>{months[i]}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MxdMoment({ p, slide, idx, total }) {
  // a quote-style "smallest moment that mattered" slide
  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
      background: p.cream, color: p.ink, fontFamily: mxFont,
    }}>
      <MxdChrome p={p} idx={idx} total={total} slide={slide} />

      <MxdTicker p={p} text="THE SMALLEST UNBLOCK · FRIDAY 4:47 PM" bg={p.hot} color={p.cream} top={70} rotate={-2} />

      <div style={{
        position: 'absolute', left: 60, right: 60, top: 220, zIndex: 4,
      }}>
        <div style={{ fontFamily: mxMono, fontSize: 80, color: p.accent, lineHeight: 1, fontWeight: 800 }}>"</div>
        <div style={{
          fontSize: 84, lineHeight: 1.05, fontWeight: 700, letterSpacing: '-0.03em',
          maxWidth: 1200, marginTop: -20, fontStyle: 'italic',
        }}>
          deploy is wedged. anyone around? need a second pair of eyes before i page on-call.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 36 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', background: p.accent2,
            border: `2.5px solid ${p.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 22,
          }}>m</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>marcus · #onboarding-sq</div>
            <div style={{ fontFamily: mxMono, fontSize: 14, color: '#666', letterSpacing: '0.1em', marginTop: 2 }}>
              SEP 22 · 16:47 · YOU REPLIED IN 3 MINUTES
            </div>
          </div>
        </div>

        <div style={{
          marginTop: 36, padding: '22px 28px', background: p.ink, color: p.cream,
          borderLeft: `12px solid ${p.hot}`, maxWidth: 900,
          boxShadow: `8px 8px 0 ${p.lime}`,
        }}>
          <div style={{ fontFamily: mxMono, fontSize: 12, letterSpacing: '0.22em', color: p.lime, marginBottom: 10 }}>
            BURRITO NOTICED
          </div>
          <div style={{ fontSize: 20, lineHeight: 1.4 }}>
            you jumped in on a friday afternoon. the unblock saved a monday rollback for four engineers. small thing. counted.
          </div>
        </div>
      </div>
    </div>
  );
}

function MxdFinal({ p, slide, idx, total }) {
  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
      background: p.lime, color: p.ink, fontFamily: mxFont,
    }}>
      <MxdChrome p={p} idx={idx} total={total} slide={slide} />

      {/* huge "WRAP." background */}
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 720, fontWeight: 800, color: p.hot, opacity: 0.18, fontStyle: 'italic',
        letterSpacing: '-0.07em', zIndex: 1,
      }}>WRAP.</div>

      <MxdTicker p={p} text="EDIT ANY SLIDE · NOTHING LEAVES UNTIL YOU SAY" bg={p.ink} color={p.cream} top={120} rotate={-2} />

      <div style={{
        position: 'absolute', left: 60, right: 60, top: 240, zIndex: 4,
        display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 60, alignItems: 'flex-start',
      }}>
        <div>
          <div style={{ fontFamily: mxMono, fontSize: 14, letterSpacing: '0.25em', color: p.accent, fontWeight: 700 }}>
            WRAPPED.
          </div>
          <div style={{
            fontSize: 180, lineHeight: 0.85, fontWeight: 800, letterSpacing: '-0.05em',
            color: p.ink, marginTop: 10,
          }}>a wrap</div>
          <div style={{
            fontSize: 180, lineHeight: 0.85, fontWeight: 800, letterSpacing: '-0.05em',
            color: p.hot, fontStyle: 'italic', marginTop: 4,
            textShadow: `6px 6px 0 ${p.ink}`,
          }}>worth sharing.</div>
          <div style={{ fontSize: 22, marginTop: 28, maxWidth: 720, lineHeight: 1.45, color: '#222' }}>
            edit anything. share when ready. keep it as a draft. nothing leaves your laptop until you say so.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 30 }}>
          {[
            { label: 'COPY SHARE LINK', icon: '🔗', bg: p.hot, color: p.cream, big: true },
            { label: 'EDIT ANY SLIDE', icon: '✎', bg: '#fff', color: p.ink },
            { label: 'POST TO SLACK · #wins', icon: '#', bg: p.accent, color: p.cream },
            { label: 'SAVE AS DRAFT', icon: '◌', bg: 'transparent', color: '#444', border: '#aaa' },
          ].map((b) => (
            <button key={b.label} style={{
              background: b.bg, color: b.color,
              border: `2.5px solid ${b.border || p.ink}`, padding: b.big ? '22px 24px' : '16px 22px',
              fontFamily: mxFont, fontSize: b.big ? 26 : 18, fontWeight: 800,
              letterSpacing: '-0.01em', cursor: 'pointer', textAlign: 'left',
              boxShadow: b.bg === 'transparent' ? 'none' : `6px 6px 0 ${p.ink}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>{b.label}</span>
              <span style={{ fontFamily: mxMono, fontSize: b.big ? 28 : 20 }}>{b.icon}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- registry ----
const MXD_RENDERERS = {
  intro: MxdIntro,
  stat: MxdStat,
  feature: MxdFeature,
  category: MxdCategory,
  people: MxdPeople,
  rhythm: MxdRhythm,
  moment: MxdMoment,
  final: MxdFinal,
};

// Slide deck for desktop — extends MX_SLIDES with chapter labels + an extra moment slide
const MXD_SLIDES = [
  { kind: 'intro',    chapter: 'OPENER',   foot: '— a year of work, caught quietly.', dur: 5 },
  { kind: 'stat',     chapter: 'TOTALS',   foot: '— 181 things, four tools, one human.', dur: 6 },
  { kind: 'feature',  chapter: 'BIGGEST',  foot: '— shipping · payment-rail v2 · oct.',  dur: 7 },
  { kind: 'category', chapter: 'WEIGHT',   foot: '— what your year was actually about.', dur: 6 },
  { kind: 'people',   chapter: 'OTHERS',   foot: '— the unblocks worth thanking.',       dur: 6 },
  { kind: 'rhythm',   chapter: 'TEMPO',    foot: '— peaks, valleys, one quiet weekday.', dur: 6 },
  { kind: 'moment',   chapter: 'MOMENT',   foot: '— small things that counted.',         dur: 7 },
  { kind: 'final',    chapter: 'WRAPPED',  foot: '— ready when you are.',                dur: 8 },
];

// ============================================================
// Player — full-viewport, scales the 1600x900 canvas to fit
// ============================================================

function MxdWrapDesktop({ p, onClose }) {
  const [idx, setIdx] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const total = MXD_SLIDES.length;
  const slide = MXD_SLIDES[idx];
  const dur = slide.dur || 6;

  const stageRef = React.useRef(null);
  const [scale, setScale] = React.useState(1);

  React.useEffect(() => {
    const fit = () => {
      const padTop = 70;     // room for top bar
      const padBottom = 110; // room for bottom controls
      const padX = 60;
      const w = window.innerWidth - padX * 2;
      const h = window.innerHeight - padTop - padBottom;
      setScale(Math.min(w / MXD_W, h / MXD_H, 1));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const next = React.useCallback(() => setIdx(i => Math.min(total - 1, i + 1)), [total]);
  const prev = React.useCallback(() => setIdx(i => Math.max(0, i - 1)), []);

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
  }, [idx, playing, dur, total]);

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape') onClose();
      else if (e.key.toLowerCase() === 'p') setPlaying(v => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, onClose]);

  const Renderer = MXD_RENDERERS[slide.kind] || MxdIntro;

  return (
    <div data-screen-label="Maximalist · Desktop Wrap" style={{
      position: 'fixed', inset: 0, background: '#0a0a0a',
      zIndex: 70, fontFamily: mxFont, color: p.cream,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* top progress + close */}
      <div style={{
        height: 50, padding: '0 24px', display: 'flex', alignItems: 'center', gap: 14,
        borderBottom: `1px solid #222`, background: '#070707',
      }}>
        <button onClick={onClose} style={{
          fontFamily: mxMono, fontSize: 12, letterSpacing: '0.18em',
          padding: '7px 12px', background: 'transparent', color: '#fff',
          border: `1.5px solid #fff5`, borderRadius: 999, cursor: 'pointer',
        }}>← BACK TO DASHBOARD</button>

        <div style={{ flex: 1, display: 'flex', gap: 4 }}>
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 4, borderRadius: 2, overflow: 'hidden',
              background: 'rgba(255,255,255,0.18)', cursor: 'pointer',
            }} onClick={() => setIdx(i)}>
              <div style={{
                width: i < idx ? '100%' : i === idx ? `${progress * 100}%` : 0,
                height: '100%', background: p.hot,
                transition: i === idx && playing ? 'none' : 'width 0.2s',
              }} />
            </div>
          ))}
        </div>

        <div style={{ fontFamily: mxMono, fontSize: 12, letterSpacing: '0.18em', color: '#888' }}>
          {String(idx + 1).padStart(2, '0')} / {String(total).padStart(2, '0')} · {slide.chapter}
        </div>
      </div>

      {/* stage area */}
      <div ref={stageRef} style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          width: MXD_W, height: MXD_H,
          transform: `scale(${scale})`, transformOrigin: 'center center',
          boxShadow: '0 40px 120px rgba(0,0,0,0.6)',
          border: `1px solid #222`,
          position: 'relative',
        }}>
          <Renderer p={p} slide={slide} idx={idx} total={total} />
        </div>

        {/* nav arrows */}
        <button onClick={prev} disabled={idx === 0} style={{
          position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)',
          width: 56, height: 56, borderRadius: '50%',
          background: idx === 0 ? '#222' : p.cream, color: idx === 0 ? '#666' : p.ink,
          border: `2px solid ${idx === 0 ? '#444' : p.ink}`,
          fontSize: 24, fontWeight: 800, cursor: idx === 0 ? 'default' : 'pointer',
          fontFamily: mxFont, zIndex: 5,
        }}>←</button>
        <button onClick={next} disabled={idx === total - 1} style={{
          position: 'absolute', right: 18, top: '50%', transform: 'translateY(-50%)',
          width: 56, height: 56, borderRadius: '50%',
          background: idx === total - 1 ? '#222' : p.lime, color: idx === total - 1 ? '#666' : p.ink,
          border: `2px solid ${idx === total - 1 ? '#444' : p.ink}`,
          fontSize: 24, fontWeight: 800, cursor: idx === total - 1 ? 'default' : 'pointer',
          fontFamily: mxFont, zIndex: 5,
        }}>→</button>
      </div>

      {/* bottom controls */}
      <div style={{
        height: 60, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderTop: `1px solid #222`, background: '#070707',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setPlaying(v => !v)} style={{
            width: 40, height: 40, borderRadius: '50%', background: p.hot, color: p.cream,
            border: `2px solid ${p.ink}`, fontSize: 14, cursor: 'pointer', fontFamily: mxFont, fontWeight: 800,
          }}>{playing ? '❚❚' : '▶'}</button>
          <div style={{ fontFamily: mxMono, fontSize: 11, color: '#888', letterSpacing: '0.15em' }}>
            ← / → NAVIGATE · P PLAY · ESC EXIT
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, fontFamily: mxMono, fontSize: 11, letterSpacing: '0.15em', color: '#888' }}>
          <span style={{ padding: '6px 10px', borderRadius: 999, background: '#1a1a1a', color: p.lime }}>DESKTOP · 16:9</span>
          <span style={{ padding: '6px 10px', borderRadius: 999, background: '#1a1a1a' }}>{p.label.toUpperCase()}</span>
        </div>
      </div>
    </div>
  );
}

window.MxdWrapDesktop = MxdWrapDesktop;
