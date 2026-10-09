/**
 * App state and the actions on it — the prototype's `state` + main.js, as a store. The map engine and every
 * panel read from here; camera moves go through ./camera.
 */
import { create } from 'zustand';
import { content } from '../data/load';
import { FIRST, LAST, clamp, yearsOf, nearestYear, peakOf, rulerAt } from './model';
import { camera } from './camera';
import type { TerritoryData } from '../engine/territory/TerritoryData';

export type Mode = 'borders' | 'movement' | 'ethnicity';
export type View = 'stage' | 'silsile' | 'kisiler' | 'duello';
export type Speed = 1 | 3 | 10;

type State = {
  year: number;
  scope: string | null;          // selected reign
  mode: Mode;
  dependents: boolean;
  region: string | null;
  person: string | null;
  event: string | null;
  baseline: number | null;
  speed: Speed;
  camera: boolean;
  groups: Set<string>;
  folio: boolean;
  view: View;
  playing: boolean;
  overture: boolean;
  /** How the next year change animates: true = default tide, false = snap, number = tide length (ms). */
  tide: boolean | number;
  caption: { kind: 'event'; id: string } | { kind: 'hint'; title: string; text: string; kicker: string } | null;
  duel: { a: string; b: string };
  info: 'sources' | 'guide' | null;
};

const initial: State = {
  year: 1299, scope: null, mode: 'borders', dependents: true, region: null, person: null, event: null, baseline: null,
  speed: 3, camera: true, groups: new Set(Object.keys(content.groups)), folio: false, view: 'stage', playing: false,
  overture: false, tide: true, caption: null, duel: { a: 'mehmed-ii', b: 'suleyman-i' }, info: null,
};

export const useAtlas = create<State>(() => initial);
const set = (p: Partial<State>) => useAtlas.setState(p);
const get = () => useAtlas.getState();

let territory: TerritoryData | null = null;
export const bindTerritory = (t: TerritoryData) => { territory = t; };

export const selectedSultan = (s = get()) => content.rulers.find(r => r.id === s.scope) || null;
export const activeSultan = (s = get()) => rulerAt(s.year, selectedSultan(s));
export const bounds = (s = get()): [number, number] => { const r = selectedSultan(s); if (!r) return [FIRST, LAST]; const y = yearsOf(r); return [y[0], y.at(-1)!]; };
export const baselineOf = (s = get()) => s.baseline ?? bounds(s)[0];

export const actions = {
  setYear(y: number, { keep = false, tide = true as boolean | number } = {}) {
    if (get().playing) actions.stop();
    let year = clamp(Math.round(+y), FIRST, LAST), scope = get().scope;
    const sel = selectedSultan();
    if (sel && !yearsOf(sel).includes(year)) {
      const [a, b] = bounds();
      if (year < a || year > b) scope = null; else year = nearestYear(year, yearsOf(sel));
    }
    set({ year, scope, tide, ...(keep ? {} : { event: null, person: null }) });
  },
  selectSultan(id: string, { play = false, peak = true } = {}) {
    const s = content.rulers.find(r => r.id === id); if (!s) return;
    if (get().playing) actions.stop();
    const year = peak && territory ? peakOf(territory, s, get().dependents).year : yearsOf(s)[0];
    set({ scope: id, region: null, person: null, event: null, baseline: null, year, tide: true });
    if (s.terms[0][0] < 1413) camera.focusRegion('bursa', 1.2); else camera.fit(900);
    if (play) actions.play(true);
  },
  allHistory() { if (get().playing) actions.stop(); set({ scope: null, region: null, person: null, event: null, baseline: null }); camera.fit(); },
  selectPerson(id: string) {
    const p = content.people.find(x => x.id === id); if (!p) return;
    if (get().playing) actions.stop();
    set({ scope: null, person: id, region: null, event: null, baseline: null, year: p.focus, tide: true, folio: true });
    camera.focusRegion(p.region, 1.6);
  },
  selectEvent(id: string) {
    const e = content.events.find(x => x.id === id); if (!e) return;
    if (get().playing) actions.stop();
    const sel = selectedSultan();
    const patch: Partial<State> = { year: e.year, person: null, region: null, event: id, folio: true, tide: true };
    if (sel && !yearsOf(sel).includes(e.year)) patch.scope = null;
    if (['Fetih', 'Kayıp'].includes(e.type)) { patch.mode = 'movement'; patch.baseline = Math.max(FIRST, e.year - 1); }
    set(patch);
    camera.focusRegion(e.region, 1.8);
  },
  selectRegion(id: string | null) { set({ region: id, person: null, event: null, ...(id ? { folio: true } : {}) }); },
  closeDetail() { set({ region: null, person: null, event: null }); },
  jump(dir: 1 | -1) {
    const [a, b] = bounds(), sel = selectedSultan(), y = get().year;
    const es = content.events.filter(e => e.year >= a && e.year <= b && (!sel || yearsOf(sel).includes(e.year)));
    const e = dir > 0 ? es.find(e => e.year > y) : [...es].reverse().find(e => e.year < y);
    if (e) actions.selectEvent(e.id); else actions.setYear(dir > 0 ? b : a);
  },
  setMode(mode: Mode) { set({ mode, ...(mode !== 'movement' ? { baseline: null } : {}) }); },
  setView(view: View) { if (view !== 'stage' && get().playing) actions.stop(); set({ view }); },
  toggleFolio(on?: boolean) { set({ folio: on ?? !get().folio }); setTimeout(() => camera.fit(700), 40); },
  setSpeed(speed: Speed) { set({ speed }); },
  setCamera(on: boolean) { set({ camera: on }); },
  setDependents(on: boolean) { set({ dependents: on }); },
  toggleGroup(id: string, on: boolean) { const g = new Set(get().groups); if (on) g.add(id); else g.delete(id); set({ groups: g }); },
  resetGroups() { set({ groups: new Set(Object.keys(content.groups)) }); },
  duelWith(id: string) { const d = get().duel; if (d.a === id || d.b === id) return; set({ duel: { a: id, b: d.a }, view: 'duello' }); },
  setDuel(k: 'a' | 'b', id: string) { set({ duel: { ...get().duel, [k]: id } }); },
  openInfo(info: State['info']) { set({ info }); },
  hint(title: string, text: string, kicker: string) { set({ caption: { kind: 'hint', title, text, kicker } }); hideCaptionLater(6500); },
  caption(id: string) { set({ caption: { kind: 'event', id } }); hideCaptionLater(get().speed === 10 ? 1800 : 3600); },
  hideCaption() { set({ caption: null }); },
  play(restart = false) { playback.toggle(restart); },
  stop() { playback.stop(); },
  setOverture(on: boolean) { set({ overture: on }); },
};

let capT = 0;
function hideCaptionLater(ms: number) { clearTimeout(capT); capT = window.setTimeout(() => set({ caption: null }), ms); }

/* ---------- playback with the story camera (from the prototype's dock.js) ---------- */
const YPS: Record<Speed, number> = { 1: 2, 3: 6, 10: 20 };
const TIDE_MS: Record<Speed, number> = { 1: 1400, 3: 900, 10: 420 };
const playback = (() => {
  let raf = 0, last = 0, acc = 0, hold = 0, lastStory = FIRST;
  const tick = (t: number) => {
    if (!get().playing) return;
    const dt = Math.min(120, t - last); last = t;
    if (hold > 0) hold -= dt;
    else {
      acc += (dt * YPS[get().speed]) / 1000;
      while (acc >= 1 && get().playing) { acc -= 1; advance(); }
    }
    if (get().playing) raf = requestAnimationFrame(tick);
  };
  const advance = () => {
    const sel = selectedSultan(), [, b] = bounds(), y0 = get().year;
    let y = y0 + 1;
    if (sel) y = yearsOf(sel).find(v => v > y0) ?? b + 1;
    if (y > b) { set({ year: b }); stop(); return; }
    set({ year: y, tide: TIDE_MS[get().speed] });
    story(y);
  };
  const story = (y: number) => {
    const evs = content.events.filter(e => e.year === y);
    const e = evs.find(e => e.wikipedia) || evs.find(e => ['Fetih', 'Kayıp', 'Savaş', 'Antlaşma'].includes(e.type));
    const s = get();
    if (e) {
      actions.caption(e.id); lastStory = y;
      if (s.camera && s.speed < 10) { camera.focusRegion(e.region, 1.9, 1000); hold = s.speed === 1 ? 1900 : 1250; }
    } else if (s.camera && y - lastStory === 18) camera.fit(1400);
  };
  const stop = () => { cancelAnimationFrame(raf); set({ playing: false }); };
  const toggle = (restart: boolean) => {
    if (get().playing) { stop(); return; }
    const [a, b] = bounds();
    if (restart || get().year >= b) set({ year: a, tide: false });
    set({ playing: true, event: null, person: null, region: null });
    last = performance.now(); acc = 0; hold = 0; lastStory = get().year;
    raf = requestAnimationFrame(tick);
  };
  return { toggle, stop };
})();

if (import.meta.env.DEV) (window as any).store = useAtlas;
