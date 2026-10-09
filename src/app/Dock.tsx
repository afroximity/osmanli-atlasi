/** The dock: playback controls, area ribbon, turning points, the face strip of 36 reigns, era bands. */
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { content } from '../data/load';
import { useAtlas, actions, activeSultan, selectedSultan, bounds, baselineOf, type Speed } from './store';
import { useData } from './context';
import { FIRST, LAST, SPAN, pct, clamp, areaAt, eraAt, reign } from './model';
import { Face } from './ui/Face';

export function Dock() {
  const { territory } = useData();
  const s = useAtlas();
  const track = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; html: ReactNode } | null>(null);
  const sel = selectedSultan(s), act = activeSultan(s), [a, b] = bounds(s);

  const ribbon = useMemo(() => {
    const tot: number[] = [];
    for (let y = FIRST; y <= LAST; y++) tot.push(areaAt(territory, y, s.dependents).total);
    const max = Math.max(...tot), X = (y: number) => ((y - FIRST) / SPAN) * 1000, Y = (v: number) => 52 - (v / max) * 40;
    let d = 'M0,' + Y(tot[0]);
    for (let i = 1; i < tot.length; i++) d += 'H' + X(FIRST + i).toFixed(2) + 'V' + Y(tot[i]).toFixed(2);
    return d + 'H1000';
  }, [territory, s.dependents]);

  const marks = useMemo(() => {
    const seen = new Set<number>();
    return content.events.filter(e => (seen.has(e.year) ? false : (seen.add(e.year), true)));
  }, []);

  const yearAt = (x: number) => { const r = track.current!.getBoundingClientRect(); return Math.round(FIRST + clamp((x - r.left) / r.width, 0, 1) * SPAN); };
  const scrub = useRef<number | null>(null);
  const showTip = (el: Element, html: ReactNode) => {
    const r = track.current!.getBoundingClientRect(), t = el.getBoundingClientRect();
    setTip({ x: clamp(t.left + t.width / 2 - r.left, 110, r.width - 110), html });
  };

  return (
    <footer className="dock">
      <div className="controls">
        <button className="play" onClick={() => actions.play()} aria-label="Oynat veya duraklat">
          {s.playing ? <Pause size={22} strokeWidth={1.5} /> : <Play size={22} strokeWidth={1.5} style={{ marginLeft: 3 }} />}
        </button>
        <div className="ctl-col">
          <div className="ctl-row">
            <button className="ctl" onClick={() => actions.jump(-1)} aria-label="Önceki dönüm noktası"><SkipBack size={16} strokeWidth={1.5} /></button>
            <button className="ctl" onClick={() => actions.jump(1)} aria-label="Sonraki dönüm noktası"><SkipForward size={16} strokeWidth={1.5} /></button>
            <div className="speed" role="group" aria-label="Hız">
              {([1, 3, 10] as Speed[]).map(v => <button key={v} aria-pressed={s.speed === v} onClick={() => actions.setSpeed(v)}>{v}×</button>)}
            </div>
          </div>
          <label className="chk-d sm"><input type="checkbox" checked={s.camera} onChange={e => actions.setCamera(e.target.checked)} /><span>Kamera olayları izlesin</span></label>
          <div className="scope-chip">
            {sel ? <><b>{sel.name}</b> · {reign(sel)} <button onClick={actions.allHistory} aria-label="Tüm tarihe dön">Tüm tarih</button></> : <><b>Tüm Osmanlı tarihi</b> · 1299–1922</>}
          </div>
        </div>
      </div>
      <div className="track" ref={track} onPointerLeave={() => setTip(null)}>
        <div className="ticks">{[1300, 1400, 1500, 1600, 1700, 1800, 1900].map(c => <span key={c} style={{ left: pct(c) + '%' }}>{c}</span>)}</div>
        <svg className="ribbon" viewBox="0 0 1000 60" preserveAspectRatio="none" aria-label="Alanın zaman içindeki değişimi"
          onPointerDown={e => { scrub.current = e.pointerId; (e.currentTarget as Element).setPointerCapture(e.pointerId); actions.setYear(yearAt(e.clientX), { tide: false }); }}
          onPointerMove={e => { if (scrub.current === e.pointerId) actions.setYear(yearAt(e.clientX), { tide: false }); }}
          onPointerUp={() => { scrub.current = null; }}>
          {[1300, 1400, 1500, 1600, 1700, 1800, 1900].map(c => { const x = ((c - FIRST) / SPAN) * 1000; return <line key={c} x1={x} x2={x} y1="0" y2="60" className="rb-grid" />; })}
          <path d={ribbon + 'V60H0Z'} className="rb-area" /><path d={ribbon} className="rb-line" />
        </svg>
        <div className="marks">
          {marks.map(e => (
            <button key={e.id} className={'mk' + (e.type === 'Fetih' ? ' fetih' : e.type === 'Kayıp' ? ' kayip' : '')} style={{ left: pct(e.year) + '%' }}
              onClick={() => actions.selectEvent(e.id)} aria-label={`${e.year} ${e.title}`}
              onPointerEnter={ev => showTip(ev.currentTarget, <span><b>{e.year} · {e.title}</b></span>)} />
          ))}
        </div>
        <div className="faces">
          {content.rulers.flatMap(r => r.terms.map(([x, z], k) => {
            const w = pct(Math.max(z, x + 1)) - pct(x);
            return (
              <button key={r.id + k} className={'fc' + (w < 2.2 ? ' narrow' : '') + (act?.id === r.id ? ' on' : '')} style={{ left: pct(x) + '%', width: w + '%' }}
                onClick={() => actions.selectSultan(r.id)} aria-label={`${r.name} ${reign(r)}`}
                onPointerEnter={ev => showTip(ev.currentTarget, <>
                  <span className="dtip-face"><Face kind="sultan" id={r.id} label={r.name} mono={String(r.order)} /></span>
                  <span><em>{r.order}. padişah</em><b>{r.name}</b><i>{r.title} · {reign(r)}</i></span></>)}>
                <Face kind="sultan" id={r.id} label={r.name} />{w >= 2.2 && <em>{r.order}</em>}
              </button>
            );
          }))}
          <span className="fc fetret" style={{ left: pct(1402) + '%', width: pct(1413) - pct(1402) + '%' }} title="Fetret Devri 1402–1413" />
        </div>
        <div className="eras">
          {content.eras.map(e => (
            <button key={e.name} className={'era' + (eraAt(s.year).start === e.start ? ' on' : '')} style={{ left: pct(e.start) + '%', width: pct(e.end) - pct(e.start) + '%' }}
              onClick={() => actions.setYear(e.start)}>{e.name}</button>
          ))}
        </div>
        <div className="dim dim-l" style={{ width: sel ? pct(a) + '%' : 0 }} />
        <div className="dim dim-r" style={{ left: sel ? pct(Math.max(b, a + 1)) + '%' : '100%' }} />
        {(s.baseline !== null || s.mode === 'movement') && <div className="basehead" style={{ left: pct(baselineOf(s)) + '%' }} />}
        <div className="playhead" style={{ left: pct(s.year) + '%' }}><span>{s.year}</span></div>
        {tip && <div className="dtip" style={{ left: tip.x }}>{tip.html}</div>}
      </div>
    </footer>
  );
}
