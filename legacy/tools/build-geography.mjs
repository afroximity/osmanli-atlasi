/* Rebuilds ../geography.js from the editorial cells of the previous geography and Natural Earth 1:10m.
 *
 *   node build-geography.mjs <adm1.geojson>
 *
 * adm1.geojson: Natural Earth 10m admin-1, clipped + simplified with mapshaper (see README in this folder).
 * Every admin-1 part is matched to the old cells by overlap: mostly-inside parts (and islands) are taken
 * whole, so cell edges follow real coasts and provincial lines; straddling parts are cut by the old cell.
 * Periods, groups, sources and hints are copied unchanged — only geometry, area and centers are rebuilt.
 *
 * Output per region: geom (MultiPolygon, lon/lat), contacts (neighbour id → [lon,lat] on the shared border),
 * center and bounds in atlas units (core.js A.project). */
import fs from 'node:fs';
import * as turf from '@turf/turf';
import polylabel from 'polylabel';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const OUT = new URL('../geography.js', import.meta.url);
const SRC = fs.existsSync(new URL('./geography.v1.js', import.meta.url)) ? new URL('./geography.v1.js', import.meta.url) : OUT;
const win = {}; new Function('window', fs.readFileSync(SRC, 'utf8'))(win);
const OLD = win.GEO;
if (SRC === OUT) fs.writeFileSync(new URL('./geography.v1.js', import.meta.url), fs.readFileSync(OUT, 'utf8'));

/* ---- projections ---- */
const M = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
const oldInv = (x, y) => [x / 16.5 - 12, (2 * Math.atan(Math.exp(M(55) - y / 720)) - Math.PI / 2) * 180 / Math.PI];
// New: true Web Mercator, 16.5 units per degree of longitude, origin at 12°W / 55°N (same as core.js A.project).
const WORLD = 5940, X0 = (168 / 360) * WORLD, Y0 = (1 - M(55) / Math.PI) / 2 * WORLD;
const project = (lon, lat) => [(lon + 180) / 360 * WORLD - X0, (1 - M(lat) / Math.PI) / 2 * WORLD - Y0];

/* ---- old cells → lon/lat polygons ---- */
const ringsOf = d => d.split('M').filter(Boolean).map(s => {
  const pts = s.replace(/Z/g, '').split('L').map(p => oldInv(...p.split(',').map(Number)));
  if (pts[0][0] !== pts.at(-1)[0] || pts[0][1] !== pts.at(-1)[1]) pts.push(pts[0]);
  return pts;
});
const cleanPoly = f => { // normalise self-intersections / ring order through a union with itself
  try { return turf.union(turf.featureCollection([f, f])) || f; } catch { return f; }
};
// small mainland cells are smaller than the provinces around them: they are carved out afterwards
const CARVE = new Set(['istanbul', 'core', 'gallipoli', 'west-thrace', 'thessaloniki', 'belgrade', 'azov']);
// cells whose old box did not describe the place at all are redrawn from a point: fortress districts
const OVERRIDE = { azov: turf.circle([39.42, 47.1], 55, { units: 'kilometers', steps: 96 }) };
// A smooth, deterministic warp of the plane (degrees, ≈ ±15 km). Where an old cell cuts through a province its
// ruler-straight edge becomes an irregular border; every cell is warped by the same field, so shared edges stay shared.
const warp = ([x, y]) => [
  x + .11 * Math.sin(1.7 * y + .4 * x + 1.3) + .045 * Math.sin(4.1 * y - 2.2 * x + .2) + .018 * Math.sin(9.3 * y + 6.1 * x + 2.9),
  y + .09 * Math.sin(1.9 * x - .5 * y + .4) + .04 * Math.sin(3.7 * x + 2.6 * y + 1.7) + .016 * Math.sin(8.7 * x - 5.9 * y + .8)];
const densify = ring => {
  const out = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const [a, b] = [ring[i], ring[i + 1]], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .04));
    for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  out.push(out[0]); return out;
};
const cells = OLD.regions.map(r => {
  if (OVERRIDE[r.id]) { const f = OVERRIDE[r.id]; return { r, f, bbox: turf.bbox(f), area: turf.area(f) }; }
  let rings = ringsOf(r.path).filter(r => r.length >= 4);
  if (!CARVE.has(r.id)) rings = rings.map(ring => densify(ring).map(warp));
  // each subpath is its own polygon (old paths had no holes)
  const f = cleanPoly(turf.multiPolygon(rings.map(r => [r])));
  return { r, f, bbox: turf.bbox(f), area: turf.area(f) };
});

/* ---- admin-1 parts ---- */
const adm = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const parts = [];
for (const a of adm.features) {
  const polys = a.geometry.type === 'Polygon' ? [a.geometry.coordinates] : a.geometry.coordinates;
  for (const p of polys) { const f = turf.polygon(p, a.properties); parts.push({ f, bbox: turf.bbox(f), area: turf.area(f) }); }
}
const hit = (a, b) => !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);
const inter = (a, b) => { try { return turf.intersect(turf.featureCollection([a, b])); } catch { return null; } };

const pieces = cells.map(() => []);
const ISLAND = 15000e6, SHARE = 0.7;

for (const p of parts) {
  const ov = [];
  for (let i = 0; i < cells.length; i++) {
    if (CARVE.has(cells[i].r.id) || !hit(p.bbox, cells[i].bbox)) continue;
    const g = inter(p.f, cells[i].f); if (!g) continue;
    const a = turf.area(g); if (a > 1e6) ov.push({ i, g, a });
  }
  if (!ov.length) continue;
  ov.sort((x, y) => y.a - x.a);
  const best = ov[0];
  if (p.area < ISLAND || best.a / p.area >= SHARE) pieces[best.i].push(p.f);
  else for (const o of ov) pieces[o.i].push(o.g);
}

/* ---- union per cell ---- */
const round = c => [Math.round(c[0] * 1e4) / 1e4, Math.round(c[1] * 1e4) / 1e4];
const geoms = cells.map((c, i) => {
  const ps = pieces[i];
  if (!ps.length && !CARVE.has(c.r.id)) { console.warn('no admin match, keeping old geometry:', c.r.id); return c.f; }
  return ps.length === 0 ? null : ps.length === 1 ? ps[0] : turf.union(turf.featureCollection(ps));
});
// carve: old cell grown by 6 km, cut to the coast, then removed from every other cell
for (let i = 0; i < cells.length; i++) {
  if (!CARVE.has(cells[i].r.id)) continue;
  const grown = turf.buffer(cells[i].f, 6, { units: 'kilometers' });
  const land = parts.filter(p => hit(p.bbox, turf.bbox(grown))).map(p => inter(p.f, grown)).filter(Boolean);
  geoms[i] = land.length > 1 ? turf.union(turf.featureCollection(land)) : land[0];
}
for (let i = 0; i < cells.length; i++) {
  if (CARVE.has(cells[i].r.id)) continue;
  for (let j = 0; j < cells.length; j++) if (CARVE.has(cells[j].r.id) && hit(turf.bbox(geoms[i]), turf.bbox(geoms[j]))) {
    const d = turf.difference(turf.featureCollection([geoms[i], geoms[j]])); if (d) geoms[i] = d;
  }
}
// carved cells overlap each other where their buffers meet: earlier ones win
const order = [...CARVE].map(id => cells.findIndex(c => c.r.id === id));
order.forEach((i, k) => { for (const j of order.slice(0, k)) { const d = turf.difference(turf.featureCollection([geoms[i], geoms[j]])); if (d) geoms[i] = d; } });
// drop specks (< 30 km²) left over by cutting
const polysOf = g => g.geometry.type === 'Polygon' ? [g.geometry.coordinates] : g.geometry.coordinates;
for (let i = 0; i < geoms.length; i++) {
  const keep = polysOf(geoms[i]).filter(p => turf.area(turf.polygon(p)) > 30e6);
  geoms[i] = turf.multiPolygon(keep.length ? keep : polysOf(geoms[i]));
}

/* ---- topology: snap + clean in mapshaper so neighbours share identical edges (the frontier relies on it) ---- */
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-')), a = path.join(tmp, 'in.json'), b = path.join(tmp, 'out.json');
  fs.writeFileSync(a, JSON.stringify(turf.featureCollection(geoms.map((g, i) => ({ ...g, properties: { i } })))));
  execFileSync('npx', ['mapshaper', '-i', a, 'snap', 'snap-interval=0.002', '-clean', 'gap-fill-area=40km2', '-o', b, 'format=geojson', 'precision=0.0001'], { stdio: 'inherit' });
  for (const f of JSON.parse(fs.readFileSync(b, 'utf8')).features) if (f.geometry) geoms[f.properties.i] = turf.feature(f.geometry);
}

/* ---- shared borders → contact points (origin of the spread animation) ---- */
const vkey = c => round(c).join(',');
const vsets = geoms.map(g => { const s = new Map(); for (const p of polysOf(g)) for (const ring of p) for (const c of ring) s.set(vkey(c), c); return s; });
const contacts = geoms.map(() => ({}));
for (let i = 0; i < geoms.length; i++) for (let j = i + 1; j < geoms.length; j++) {
  const shared = [];
  for (const [k, c] of vsets[i]) if (vsets[j].has(k)) shared.push(c);
  if (shared.length < 2) continue;
  const m = shared.reduce((s, c) => [s[0] + c[0] / shared.length, s[1] + c[1] / shared.length], [0, 0]);
  // nearest real border vertex to the mean, so the point sits on the frontier
  const pt = shared.reduce((b, c) => Math.hypot(c[0] - m[0], c[1] - m[1]) < Math.hypot(b[0] - m[0], b[1] - m[1]) ? c : b);
  const xy = pt.map(v => +v.toFixed(3));
  contacts[i][cells[j].r.id] = xy; contacts[j][cells[i].r.id] = xy;
}

/* ---- write ---- */
const r4 = v => Math.round(v * 1e4) / 1e4;
const inside = (pt, g) => turf.booleanPointInPolygon(turf.point(pt), g);

const regions = cells.map((c, i) => {
  const g = geoms[i], r = c.r;
  let ll = oldInv(...r.center);
  if (!inside(ll, g)) { // fall back to the visual center of the largest part
    const big = polysOf(g).sort((a, b) => turf.area(turf.polygon(b)) - turf.area(turf.polygon(a)))[0];
    ll = polylabel(big, 0.01);
  }
  const [x0, y1] = project(...turf.bbox(g).slice(0, 2)), [x1, y0] = project(...turf.bbox(g).slice(2));
  const { path: _, ...meta } = r;
  return { ...meta, geom: polysOf(g).map(p => p.map(ring => ring.map(c => [r4(c[0]), r4(c[1])]))), areaKm2: Math.round(turf.area(g) / 1e6), center: project(...ll).map(v => +v.toFixed(2)),
    bounds: [x0, y0, x1, y1].map(v => +v.toFixed(2)), contacts: contacts[i] };
});

fs.writeFileSync(OUT, 'window.GEO=' + JSON.stringify({ projection: { world: WORLD, lon0: -12, lat0: 55 }, regions }) + ';\n');
const tot = (rs, k) => rs.reduce((s, r) => s + r.areaKm2, 0);
console.log('regions', regions.length, 'old area', tot(OLD.regions), 'new area', tot(regions), 'bytes', fs.statSync(OUT).size);
for (const r of regions) { const o = OLD.regions.find(x => x.id === r.id); console.log(r.id.padEnd(18), String(o.areaKm2).padStart(8), '→', String(r.areaKm2).padStart(8), Object.keys(r.contacts).length + ' neighbours'); }
