/**
 * The editorial model, ported from the prototype: regions with status periods, reigns, peaks.
 * Areas shown to the reader come from the territory timeline (Cliopatria); counts of regional gains and losses,
 * region dossiers and communities come from the editorial regions.
 */
import { content, type Ruler, type Region } from '../data/load';
import type { TerritoryData } from '../engine/territory/TerritoryData';

export type Status = 'direct' | 'vassal' | 'autonomy' | 'occupied' | 'national' | 'none';
export const STATUS_NAMES: Record<Status, string> = {
  direct: 'Doğrudan yönetim', vassal: 'Bağlı devlet / yerel yönetim', autonomy: 'Özerk yönetim',
  occupied: 'Yabancı işgal / nominal egemenlik', national: 'Ankara / yeni siyasî düzen', none: 'Osmanlı yönetimi dışında',
};

export const FIRST = 1299, LAST = 1922, SPAN = LAST - FIRST;
export const pct = (y: number) => ((y - FIRST) / SPAN) * 100;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export const statusAt = (r: Region, year: number): Status => (r.periods.find(([a, b]) => a <= year && year < b)?.[2] as Status) || 'none';
export const isOttoman = (s: Status, dependents = true) => s === 'direct' || (dependents && (s === 'vassal' || s === 'autonomy'));

export function sultanYears(s: Ruler) {
  const ys = new Set<number>();
  for (const [a, b] of s.terms) for (let y = a; y < Math.max(a + 1, b); y++) ys.add(y);
  if (s.id === 'mehmed-vi') ys.add(1922);
  return [...ys].sort((a, b) => a - b);
}
const yearsCache = new Map<string, number[]>();
export const yearsOf = (s: Ruler) => { let y = yearsCache.get(s.id); if (!y) yearsCache.set(s.id, (y = sultanYears(s))); return y; };

export function rulerAt(year: number, preferred: Ruler | null = null) {
  if (preferred && yearsOf(preferred).includes(year)) return preferred;
  if (year >= 1922) return null;
  return [...content.rulers].reverse().find(s => yearsOf(s).includes(year)) || null;
}
export const nearestYear = (year: number, years: number[]) => years.reduce((best, y) => (Math.abs(y - year) < Math.abs(best - year) ? y : best), years[0]);
export const eraAt = (y: number) => content.eras.find(e => e.start <= y && y < e.end) || content.eras.at(-1)!;
export const reign = (s: Ruler) => s.terms.map(([a, b]) => (a === b ? String(a) : a + '–' + b)).join(' / ');
export const reignYears = (s: Ruler) => s.terms.reduce((n, [a, b]) => n + (b - a), 0);

export function changesBetween(regions: Region[], from: number, to: number, dependents = true) {
  return regions.map(region => {
    const before = statusAt(region, from), after = statusAt(region, to), had = isOttoman(before, dependents), has = isOttoman(after, dependents);
    return { region, before, after, kind: !had && has ? 'gain' : had && !has ? 'loss' : had && has && before !== after ? 'authority' : 'stable' } as const;
  });
}
export const regionCount = (regions: Region[], year: number, dependents = true) => regions.filter(r => isOttoman(statusAt(r, year), dependents)).length;

export function groupsAt(r: Region, year: number) {
  const g = [...r.groups];
  if (year >= 1492 && ['istanbul', 'bursa', 'thessaloniki', 'west-anatolia'].includes(r.id)) g.push('sephardic');
  if (year >= 1864 && ['east-anatolia', 'north-anatolia', 'central-anatolia', 'bursa'].includes(r.id) && !g.includes('caucasian')) g.push('caucasian');
  return g;
}

/** Area held in a year (Cliopatria), with or without dependants. */
export function areaAt(t: TerritoryData, year: number, dependents = true) {
  const a = t.areaAt(year);
  return { direct: a.direct, dependent: a.vassal + a.autonomy, total: a.direct + (dependents ? a.vassal + a.autonomy : 0) };
}
const peakCache = new Map<string, { year: number; area: number }>();
export function peakOf(t: TerritoryData, s: Ruler, dependents = true) {
  const k = s.id + dependents;
  let p = peakCache.get(k);
  if (!p) {
    p = { year: yearsOf(s)[0], area: -1 };
    for (const y of yearsOf(s)) { const a = areaAt(t, y, dependents).total; if (a >= p.area) p = { year: y, area: a }; }
    peakCache.set(k, p);
  }
  return p;
}

const fmt = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
export const smallArea = (x: number) => (x >= 1e6 ? fmt.format(x / 1e6) + ' milyon' : x >= 1000 ? fmt.format(Math.round(x / 1000)) + ' bin' : x === 0 ? '0' : '<1 bin');
export const areaText = (x: number) => '≈ ' + smallArea(x) + ' km²';
export const areaParts = (x: number): [string, string] =>
  x >= 1e6 ? [fmt.format(Math.round(x / 1e5) / 10), 'milyon km²'] : x >= 1000 ? [fmt.format(Math.round(x / 1000)), 'bin km²'] : [x ? '<1' : '0', 'km²'];
export const mono = (name: string) => name.replace(/^(I{1,3}V?|V?I{1,3})\.\s*/, '').split(' ').slice(0, 2).map(w => w[0]).join('');
