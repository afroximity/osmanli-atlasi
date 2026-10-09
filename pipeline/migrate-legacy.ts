/**
 * One-off: lift the legacy prototype's content out of its window-global scripts into plain JSON under data/.
 * After this has run, data/ is the source of truth and legacy/ is only a reference.
 *
 *   npx tsx pipeline/migrate-legacy.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DATA } from './paths.ts';

const load = (file: string) => {
  const win: Record<string, any> = {};
  new Function('window', fs.readFileSync(path.join(ROOT, file), 'utf8') + '\n;Object.assign(window,{SULTANS,PEOPLE,EVENTS,GROUPS,ERAS,SOURCES})')(win);
  return win;
};
const write = (name: string, value: unknown) => {
  fs.mkdirSync(path.dirname(path.join(DATA, name)), { recursive: true });
  fs.writeFileSync(path.join(DATA, name), JSON.stringify(value, null, 1) + '\n');
  console.log('wrote data/' + name);
};

const { SULTANS, PEOPLE, EVENTS, GROUPS, ERAS, SOURCES } = load('legacy/data.js');
write('content/rulers.json', SULTANS.map(({ id, name, title, terms, bio, order, source }: any) => ({ id, order, name, title, terms, bio, source })));
write('content/people.json', PEOPLE);
write('content/events.json', EVENTS.map(({ id, ...e }: any, i: number) => ({ id: 'e' + String(i).padStart(3, '0'), ...e })));
write('content/groups.json', GROUPS);
write('content/eras.json', ERAS);
write('content/sources.json', SOURCES);

// Editorial cells: the old SVG paths were in a stretched Mercator; store them as lon/lat rings.
const M = (lat: number) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
const inv = (x: number, y: number) => [+(x / 16.5 - 12).toFixed(4), +((2 * Math.atan(Math.exp(M(55) - y / 720)) - Math.PI / 2) * 180 / Math.PI).toFixed(4)];
const geoWin: Record<string, any> = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'legacy/tools/geography.v1.js'), 'utf8'))(geoWin);
write('regions.source.json', geoWin.GEO.regions.map((r: any) => ({
  id: r.id, name: r.name, periods: r.periods, groups: r.groups, source: r.source, hint: r.hint || undefined,
  center: inv(r.center[0], r.center[1]),
  rings: r.path.split('M').filter(Boolean).map((s: string) => s.replace(/Z/g, '').split('L').map(p => inv(...(p.split(',').map(Number) as [number, number])))),
})));
