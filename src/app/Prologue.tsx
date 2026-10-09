/**
 * The prologue: a real preload (map, fonts, Wikimedia images) shown as a year counter, then the curtain, then the
 * overture — one camera pull-back from Söğüt while the years step through milestones, each one a tide.
 */
import { useEffect, useRef, useState } from 'react';
import { content } from '../data/load';
import { loadImages, type ImageKind } from '../data/images';
import { useAtlas, actions } from './store';
import { useMap, useData } from './context';
import { HOME } from '../engine/AtlasMap';
import { clamp } from './model';

const W = { fonts: 0.08, geo: 0.12, sultan: 0.42, person: 0.26, event: 0.12 };
type Part = keyof typeof W;
const STEPS = [1305, 1326, 1354, 1362, 1389, 1430, 1453, 1475, 1500, 1520, 1541, 1565];
const STEP_MS = 760;
const SOGUT: [number, number] = [30.18, 40.02];

export function Prologue() {
  const map = useMap();
  const { territory } = useData();
  const [marks, setMarks] = useState<Record<Part, { text: string; ok: boolean }>>({
    geo: { text: '…', ok: false }, fonts: { text: '…', ok: false },
    sultan: { text: `0/${content.rulers.length}`, ok: false }, person: { text: `0/${content.people.length}`, ok: false }, event: { text: '0', ok: false },
  });
  const prog = useRef<Record<Part, number>>({ fonts: 0, geo: 0, sultan: 0, person: 0, event: 0 });
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState(false);
  const yearEl = useRef<HTMLDivElement>(null), fill = useRef<HTMLSpanElement>(null), emblem = useRef<SVGSVGElement>(null), enterBtn = useRef<HTMLButtonElement>(null);
  const mark = (k: Part, text: string, ok = false) => setMarks(m => ({ ...m, [k]: { text, ok } }));

  // preload everything the stage will show
  useEffect(() => {
    const set = (k: Part, v: number) => { prog.current[k] = Math.max(prog.current[k], v); };
    let allDone = false;
    document.fonts.ready.then(() => { set('fonts', 1); mark('fonts', 'hazır', true); });
    const kinds: [ImageKind, number][] = [['sultan', content.rulers.length], ['person', content.people.length], ['event', 0]];
    const jobs = kinds.map(([kind, total]) => loadImages(kind, (n, t, ok) => {
      set(kind, t ? n / t : 1);
      mark(kind, kind === 'event' ? ok + ' görsel' : `${ok}/${total}`, n === t);
    }).then(ok => { set(kind, 1); if (ok < 0) mark(kind, 'çevrimdışı · monogram', true); }));
    Promise.all(jobs).then(() => { allDone = true; });
    const late = setTimeout(() => { for (const k in prog.current) prog.current[k as Part] = 1; allDone = true; }, 11000);

    const t0 = performance.now(), MIN = 3400, rings = [...(emblem.current?.querySelectorAll<SVGElement>('[pathLength]') ?? [])];
    let shown = 0, raf = 0, done = false;
    const frame = (t: number) => {
      const cap = Math.min(1, (t - t0) / MIN), target = (Object.keys(W) as Part[]).reduce((s, k) => s + W[k] * prog.current[k], 0);
      const tg = Math.min(target, allDone ? 1 : 0.985);
      shown += (Math.min(tg, cap) - shown) * 0.09;
      if (allDone && cap >= 1 && shown > 0.996) shown = 1;
      if (yearEl.current) yearEl.current.textContent = String(Math.round(1299 + shown * 623));
      if (fill.current) fill.current.style.transform = `scaleX(${shown})`;
      rings.forEach((el, i) => { el.style.strokeDashoffset = String(1 - clamp(shown * 1.25 - i * 0.08, 0, 1)); });
      if (shown === 1 && !done) { done = true; setReady(true); return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); clearTimeout(late); };
  }, []);

  // the map is ready once MapLibre has its style, sources and first tiles
  useEffect(() => { map?.ready.then(() => { prog.current.geo = 1; mark('geo', 'hazır', true); }); }, [map]);
  // behind the curtain: Söğüt, 1299
  useEffect(() => { map?.ready.then(() => { if (!useAtlas.getState().overture) map.map.jumpTo({ center: SOGUT, zoom: 7.4 }); }); }, [map]);
  useEffect(() => { if (ready) enterBtn.current?.focus({ preventScroll: true }); }, [ready]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Enter' && ready && !open) enter(); };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [ready, open]);

  const stopped = useRef(false);
  const finish = () => {
    if (stopped.current) return;
    stopped.current = true;
    actions.setOverture(false);
    actions.setYear(1565, { tide: false });
    useAtlas.setState({ scope: null, folio: true });
    map?.map.stop();
    setTimeout(() => map?.fit(800), 30);
    actions.hint('Sahne senin', 'Zaman şeridini sürükle, bir yüze dokun ya da Oynat’a bas. Kamera büyük olaylarda haritayı o bölgeye taşır.', '1565 · Kanûnî dönemi');
  };
  const enter = async () => {
    if (open || !map) return;
    setOpen(true);
    document.body.classList.add('entered');
    setTimeout(() => setGone(true), 1900);
    await map.ready;
    await new Promise(r => setTimeout(r, 650));
    actions.setOverture(true);
    const total = STEPS.length * STEP_MS + 700;
    // one unbroken camera move; MapLibre eases it on its own clock
    map.map.fitBounds(HOME, { duration: total, padding: map.padding(), easing: t => 1 - Math.pow(1 - t, 2.4) });
    for (const y of STEPS) {
      if (stopped.current) return;
      actions.setYear(y, { tide: STEP_MS - 40 });
      await new Promise(r => setTimeout(r, STEP_MS));
    }
    await new Promise(r => setTimeout(r, 500));
    finish();
  };

  const overture = useAtlas(s => s.overture);
  return <>
    {overture && <button className="skip" onClick={finish}>Açılışı atla</button>}
    {!gone && (
      <div className={'curtain' + (open ? ' open' : '')}>
        <div className="cur cur-l" /><div className="cur cur-r" />
        <div className="prologue">
          <span className="kicker">Bir keşif atlası</span>
          <h1 className="pro-title">Osmanlı Atlası</h1>
          <div className="emblem-wrap">
            <svg className="emblem" ref={emblem} viewBox="0 0 240 240" aria-hidden="true">
              <circle cx="120" cy="120" r="114" pathLength={1} /><rect x="48" y="48" width="144" height="144" pathLength={1} />
              <rect x="48" y="48" width="144" height="144" transform="rotate(45 120 120)" pathLength={1} /><circle cx="120" cy="120" r="62" pathLength={1} />
            </svg>
            <div className="pro-year" ref={yearEl}>1299</div>
          </div>
          <div className="pro-bar"><span ref={fill} /></div>
          <p className="pro-sub">{ready ? 'Altı yüzyıl hazır.' : 'Altı yüzyıl yükleniyor'}</p>
          <ul className="manifest">
            {([['geo', 'Kıyılar, rölyef ve ' + territory.polities.length + ' devlet'], ['fonts', 'Cormorant Garamond · Lora'], ['sultan', content.rulers.length + ' padişah portresi'], ['person', content.people.length + ' tarihî kişi'], ['event', content.events.length + ' dönüm noktası · gravürler']] as [Part, string][])
              .map(([k, label]) => <li key={k} className={marks[k].ok ? 'ok' : ''}><span>{label}</span><b>{marks[k].text}</b></li>)}
          </ul>
          {ready && <button className="enter" ref={enterBtn} onClick={enter}>Perdeyi aç</button>}
        </div>
      </div>
    )}
  </>;
}
