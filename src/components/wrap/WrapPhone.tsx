'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

interface MxPalette {
  hot: string; lime: string; ink: string; cream: string; paper: string;
  accent: string; accent2: string; accent3: string; [key: string]: unknown;
}

interface WrapPhoneProps {
  p: MxPalette;
  onClose: () => void;
  // Optional wrap data — if not provided, uses mock data
  wrapData?: {
    contributions: number;
    peakMonth: string;
    peakCount: number;
    monthly: number[];
    bigWin: { pct: string; unit: string; body: string };
    topCategory: string;
    topCategoryPct: number;
    categories: { name: string; pct: number; color: string }[];
    teammates: string[];
    teammateCount: number;
  };
}

const SLIDE_KINDS = ['intro','stat','feature','category','people','rhythm','final'] as const;
type SlideKind = typeof SLIDE_KINDS[number];
const DURATIONS: Record<SlideKind, number> = { intro:4, stat:5, feature:7, category:6, people:6, rhythm:5, final:6 };

const MOCK = {
  contributions: 181,
  peakMonth: 'OCT',
  peakCount: 31,
  monthly: [4,8,6,14,22,18,12,9,27,31,19,11],
  bigWin: { pct: '40%', unit: 'p99 latency drop', body: 'you led the payment-rail v2 migration. twelve teammates unblocked. three outages avoided.' },
  topCategory: 'shipping',
  topCategoryPct: 42,
  categories: [
    { name: 'shipping', pct: 42, color: '' }, // color filled from p.hot
    { name: 'reviews', pct: 21, color: '' },  // p.lime
    { name: 'strategy', pct: 17, color: '' }, // p.accent
    { name: 'people', pct: 12, color: '' },   // p.accent2
    { name: 'craft', pct: 8, color: '' },     // p.accent3
  ],
  teammates: ['priya','marcus','aisha','jin','sam','noor','+ 6'],
  teammateCount: 12,
};

const MONTHS_SHORT = ['J','F','M','A','M','J','J','A','S','O','N','D'];

export function WrapPhone({ p, onClose, wrapData }: WrapPhoneProps) {
  const data = wrapData ?? MOCK;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const total = SLIDE_KINDS.length;
  const kind = SLIDE_KINDS[idx];
  const dur = DURATIONS[kind];

  // Resolve category colors from palette
  const catColors = [p.hot, p.lime, p.accent, p.accent2, p.accent3];
  const cats = data.categories.map((c, i) => ({
    ...c,
    color: c.color || catColors[i] || p.hot,
  }));

  const monthly = data.monthly;
  const maxMonthly = Math.max(...monthly);

  const next = useCallback(() => setIdx(i => Math.min(total - 1, i + 1)), [total]);
  const prev = useCallback(() => setIdx(i => Math.max(0, i - 1)), []);

  // Reset progress when slide changes
  useEffect(() => {
    setProgress(0);
  }, [idx]);

  // Auto-advance
  useEffect(() => {
    if (!playing) return;
    const start = Date.now();
    const id = setInterval(() => {
      const t = (Date.now() - start) / (dur * 1000);
      if (t >= 1) {
        clearInterval(id);
        if (idx < total - 1) setIdx(idx + 1);
        else setPlaying(false);
      } else {
        setProgress(t);
      }
    }, 50);
    return () => clearInterval(id);
  }, [idx, playing, dur, total]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === ' ') { e.preventDefault(); setPlaying(v => !v); }
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [next, prev, onClose]);

  const mxMono = '"JetBrains Mono", ui-monospace, monospace';
  const mxFont = '"Space Grotesk", system-ui, sans-serif';

  function renderSlide() {
    const common = (
      <div style={{
        position: 'absolute' as const, top: 18, left: 22, right: 22,
        display: 'flex', justifyContent: 'space-between',
        fontFamily: mxMono, fontSize: 10, letterSpacing: '0.18em',
        color: 'inherit', opacity: 0.85,
      }}>
        <span>BURRITO · 2026 WRAP</span>
        <span>{String(idx+1).padStart(2,'0')} / {String(total).padStart(2,'0')}</span>
      </div>
    );

    if (kind === 'intro') return (
      <div style={{ width:'100%',height:'100%',background:p.hot,color:p.cream,position:'relative',fontFamily:mxFont,padding:'60px 28px 28px',boxSizing:'border-box',display:'flex',flexDirection:'column',justifyContent:'space-between' }}>
        {common}
        <div><div style={{fontSize:90,lineHeight:1,marginTop:8}}>🌯</div></div>
        <div>
          <div style={{fontFamily:mxMono,fontSize:12,letterSpacing:'0.2em',opacity:0.85}}>2026</div>
          <div style={{fontSize:76,lineHeight:0.85,fontWeight:800,letterSpacing:'-0.05em',marginTop:10,whiteSpace:'pre-line',color:p.lime,textShadow:`4px 4px 0 ${p.ink}`}}>{'YOUR YEAR,\nWRAPPED.'}</div>
          <div style={{fontSize:14,marginTop:16,opacity:0.95,maxWidth:280,lineHeight:1.4}}>a 60-second look at what you actually did.</div>
        </div>
        <div style={{fontFamily:mxMono,fontSize:11,opacity:0.75}}>tap or → to begin</div>
      </div>
    );

    if (kind === 'stat') return (
      <div style={{ width:'100%',height:'100%',background:p.lime,color:p.ink,position:'relative',fontFamily:mxFont,padding:'60px 28px 28px',boxSizing:'border-box',display:'flex',flexDirection:'column',justifyContent:'center' }}>
        {common}
        <div style={{fontFamily:mxMono,fontSize:12,letterSpacing:'0.2em',color:p.accent}}>YOU CAUGHT</div>
        <div style={{fontSize:180,lineHeight:0.8,fontWeight:800,letterSpacing:'-0.06em',marginTop:4,fontStyle:'italic'}}>{data.contributions}</div>
        <div style={{fontSize:28,fontWeight:700,marginTop:8,lineHeight:1}}>contributions.</div>
        <div style={{fontSize:14,marginTop:14,opacity:0.85,maxWidth:280,lineHeight:1.45}}>across four tools, all year.</div>
      </div>
    );

    if (kind === 'feature') return (
      <div style={{ width:'100%',height:'100%',background:p.accent,color:p.cream,position:'relative',fontFamily:mxFont,padding:'60px 28px 28px',boxSizing:'border-box',display:'flex',flexDirection:'column',justifyContent:'center',overflow:'hidden' }}>
        {common}
        <div style={{position:'absolute',top:-10,right:-40,fontSize:360,fontWeight:800,lineHeight:0.8,color:p.hot,opacity:0.4,fontStyle:'italic',letterSpacing:'-0.06em',pointerEvents:'none'}}>{data.bigWin.pct}</div>
        <div style={{position:'relative'}}>
          <div style={{fontFamily:mxMono,fontSize:12,letterSpacing:'0.2em',color:p.lime}}>BIGGEST WIN</div>
          <div style={{fontSize:110,lineHeight:0.82,fontWeight:800,letterSpacing:'-0.05em',marginTop:10,color:p.cream,fontStyle:'italic'}}>{data.bigWin.pct}</div>
          <div style={{fontSize:22,fontWeight:700,marginTop:6,color:p.lime}}>{data.bigWin.unit}</div>
          <div style={{fontSize:14,marginTop:18,lineHeight:1.45,maxWidth:280,opacity:0.95}}>{data.bigWin.body}</div>
        </div>
      </div>
    );

    if (kind === 'category') return (
      <div style={{ width:'100%',height:'100%',background:p.cream,color:p.ink,position:'relative',fontFamily:mxFont,padding:'60px 28px 28px',boxSizing:'border-box' }}>
        {common}
        <div style={{fontFamily:mxMono,fontSize:12,letterSpacing:'0.2em',color:p.accent}}>YOUR TOP CATEGORY</div>
        <div style={{fontSize:88,lineHeight:0.9,fontWeight:800,letterSpacing:'-0.04em',marginTop:8,color:p.hot,fontStyle:'italic'}}>{data.topCategory}.</div>
        <div style={{fontSize:14,marginTop:6,color:'#444',maxWidth:280,lineHeight:1.4}}>{data.topCategoryPct}% of your weighted impact this year.</div>
        <div style={{marginTop:24}}>
          {cats.map(c => (
            <div key={c.name} style={{marginBottom:10}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
                <span style={{fontSize:16,fontWeight:700}}>{c.name}</span>
                <span style={{fontFamily:mxMono,fontSize:12,color:'#666'}}>{c.pct}%</span>
              </div>
              <div style={{height:12,background:'#fff',border:`1.5px solid ${p.ink}`,borderRadius:4,overflow:'hidden',marginTop:3}}>
                <div style={{width:`${c.pct}%`,height:'100%',background:c.color}} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );

    if (kind === 'people') return (
      <div style={{ width:'100%',height:'100%',background:p.accent2,color:p.ink,position:'relative',fontFamily:mxFont,padding:'60px 28px 28px',boxSizing:'border-box',display:'flex',flexDirection:'column' }}>
        {common}
        <div style={{fontFamily:mxMono,fontSize:12,letterSpacing:'0.2em',color:p.accent}}>YOU MADE OTHERS FASTER</div>
        <div style={{fontSize:32,fontWeight:800,lineHeight:1,letterSpacing:'-0.03em',marginTop:6,maxWidth:280}}>
          you helped <span style={{color:p.hot}}>{data.teammateCount}</span> teammates ship faster.
        </div>
        <div style={{fontSize:13,marginTop:10,color:'#333',maxWidth:280,lineHeight:1.45}}>across 4 squads. 28 messages worth thanking, ranked.</div>
        <div style={{marginTop:'auto',display:'flex',flexWrap:'wrap',gap:8}}>
          {data.teammates.map((n,i) => (
            <span key={n} style={{
              padding:'6px 12px',
              background:i===data.teammates.length-1?p.ink:'#fff',
              color:i===data.teammates.length-1?p.cream:p.ink,
              border:`2px solid ${p.ink}`,borderRadius:999,
              fontFamily:mxMono,fontSize:12,fontWeight:700,
              transform:`rotate(${(i%3-1)*1.2}deg)`,
            }}>{n}</span>
          ))}
        </div>
      </div>
    );

    if (kind === 'rhythm') return (
      <div style={{ width:'100%',height:'100%',background:p.ink,color:p.cream,position:'relative',fontFamily:mxFont,padding:'60px 28px 28px',boxSizing:'border-box' }}>
        {common}
        <div style={{fontFamily:mxMono,fontSize:12,letterSpacing:'0.2em',color:p.lime}}>YOUR MONTH</div>
        <div style={{fontSize:200,lineHeight:0.85,fontWeight:800,letterSpacing:'-0.05em',color:p.hot,fontStyle:'italic',marginTop:6}}>{data.peakMonth}</div>
        <div style={{fontSize:16,marginTop:8,opacity:0.9,lineHeight:1.4,maxWidth:280}}>your busiest month — {data.peakCount} contributions.</div>
        <div style={{marginTop:24,display:'flex',alignItems:'flex-end',gap:4,height:100}}>
          {monthly.map((v,i) => (
            <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
              <div style={{width:'100%',height:`${(v/maxMonthly)*80+4}px`,background:v===maxMonthly?p.hot:(v>maxMonthly*0.5?p.lime:'#444'),borderRadius:2}} />
              <div style={{fontFamily:mxMono,fontSize:9,color:v===maxMonthly?p.hot:'#aaa'}}>{MONTHS_SHORT[i]}</div>
            </div>
          ))}
        </div>
      </div>
    );

    // final
    return (
      <div style={{ width:'100%',height:'100%',background:p.lime,color:p.ink,position:'relative',fontFamily:mxFont,padding:'60px 28px 28px',boxSizing:'border-box',display:'flex',flexDirection:'column',justifyContent:'space-between' }}>
        {common}
        <div />
        <div>
          <div style={{fontFamily:mxMono,fontSize:12,letterSpacing:'0.2em',color:p.accent}}>WRAPPED.</div>
          <div style={{fontSize:64,lineHeight:0.85,fontWeight:800,letterSpacing:'-0.04em',marginTop:10,whiteSpace:'pre-line'}}>{'A WRAP\nWORTH SHARING.'}</div>
          <div style={{fontSize:13,marginTop:14,color:'#222',maxWidth:280,lineHeight:1.45}}>edit anything. share when ready. nothing leaves until you say.</div>
          <div style={{marginTop:22,display:'flex',flexDirection:'column',gap:10}}>
            {[
              { label:'share link 🔗', bg:p.hot, color:p.cream, border: undefined },
              { label:'edit any slide ✎', bg:'#fff', color:p.ink, border: undefined },
              { label:'save as draft', bg:'transparent', color:'#555', border:'#ccc' },
            ].map(btn => (
              <button key={btn.label} style={{
                background:btn.bg,color:btn.color,
                border:`2px solid ${btn.border ?? p.ink}`,
                padding:'12px 22px',fontFamily:mxFont,fontSize:16,fontWeight:800,
                letterSpacing:'-0.01em',cursor:'pointer',borderRadius:999,
                boxShadow:btn.bg==='transparent'?'none':`4px 4px 0 ${p.ink}`,
              }}>{btn.label}</button>
            ))}
          </div>
        </div>
        <div style={{fontFamily:mxMono,fontSize:10,color:'#444',textAlign:'center',opacity:0.7}}>
          🔒 nothing has been sent. you control the link.
        </div>
      </div>
    );
  }

  const navBtnBase: React.CSSProperties = {
    width:48,height:48,borderRadius:'50%',border:`2px solid ${p.ink}`,
    fontSize:22,fontWeight:800,cursor:'pointer',fontFamily:mxFont,
  };

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:60,gap:28 }}>
      {/* prev */}
      <button onClick={prev} disabled={idx===0} style={{ ...navBtnBase, background:idx===0?'#333':p.cream, color:idx===0?'#666':p.ink, cursor:idx===0?'default':'pointer' }}>←</button>

      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:14}}>
        {/* progress segments */}
        <div style={{display:'flex',gap:4,width:320}}>
          {Array.from({length:total}).map((_,i) => (
            <div key={i} style={{flex:1,height:3,borderRadius:2,overflow:'hidden',background:'rgba(255,255,255,0.25)'}}>
              <div style={{
                width: i<idx?'100%': i===idx?`${progress*100}%`:'0%',
                height:'100%',background:p.hot,
                transition: i===idx?'none':'width 0.2s',
              }} />
            </div>
          ))}
        </div>

        {/* phone frame */}
        <div onClick={next} style={{
          width:360,height:720,borderRadius:44,padding:10,
          background:p.ink,boxShadow:'0 30px 80px rgba(0,0,0,0.5)',
          cursor:'pointer',position:'relative',
        }}>
          <div style={{width:'100%',height:'100%',borderRadius:36,overflow:'hidden',position:'relative',background:'#000'}}>
            {renderSlide()}
            {/* dynamic island */}
            <div style={{position:'absolute',top:14,left:'50%',transform:'translateX(-50%)',width:110,height:32,borderRadius:999,background:'#000',zIndex:30}} />
          </div>
        </div>

        {/* controls */}
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <button onClick={() => setPlaying(v=>!v)} style={{
            width:40,height:40,borderRadius:'50%',background:p.hot,color:p.cream,
            border:`2px solid ${p.ink}`,fontSize:14,cursor:'pointer',fontFamily:mxFont,fontWeight:800,
          }}>{playing?'❚❚':'▶'}</button>
          <button onClick={onClose} style={{
            background:'transparent',border:'1.5px solid rgba(255,255,255,0.3)',
            color:'#fff',fontFamily:mxMono,fontSize:11,padding:'8px 14px',
            borderRadius:999,cursor:'pointer',letterSpacing:'0.1em',
          }}>← BACK TO DASHBOARD</button>
        </div>
      </div>

      {/* next */}
      <button onClick={next} disabled={idx===total-1} style={{ ...navBtnBase, background:idx===total-1?'#333':p.lime, color:idx===total-1?'#666':p.ink, cursor:idx===total-1?'default':'pointer' }}>→</button>
    </div>
  );
}
