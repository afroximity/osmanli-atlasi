/**
 * Editorial regions: the atlas's own narrative units (where an event happened, whom a person is tied to, which
 * communities lived there, and the editors' status periods). They no longer draw borders — Cliopatria does — but
 * they are what you click, read about and fly to, so they still get real coasts and natural edges.
 *
 * Each source cell (data/regions.source.json, lon/lat rings) is matched to Natural Earth admin-1 parts: parts mostly
 * inside a cell, and islands, are taken whole; straddling parts are cut by the cell. Cut lines are bent by one smooth
 * warp of the plane so they read as borders, not ruler lines. Small cells are carved out of their neighbours.
 */
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import * as turf from '@turf/turf';
import polylabel from 'polylabel';
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';
import { DATA, OUT } from './paths.ts';
import { mapshaper, readJSON, writeJSON, step } from './lib.ts';
import { ADM1 } from './basemap.ts';

type Source = { id: string; name: string; periods: [number, number, string][]; groups: string[]; source: string; hint?: string; center: Position; rings: Position[][] };
type Poly = Feature<Polygon | MultiPolygon>;

const CARVE = new Set(['istanbul', 'core', 'gallipoli', 'west-thrace', 'thessaloniki', 'belgrade', 'azov']);
// cells whose old box did not describe the place at all are redrawn from a point (fortress districts)
const OVERRIDE: Record<string, Poly> = { azov: turf.circle([39.42, 47.1], 55, { units: 'kilometers', steps: 96 }) };
const ISLAND = 15000e6, SHARE = 0.7;

// smooth deterministic warp (degrees, ≈ ±15 km); the same field bends every cell, so shared edges stay shared
const warp = ([x, y]: Position): Position => [
  x + .11 * Math.sin(1.7 * y + .4 * x + 1.3) + .045 * Math.sin(4.1 * y - 2.2 * x + .2) + .018 * Math.sin(9.3 * y + 6.1 * x + 2.9),
  y + .09 * Math.sin(1.9 * x - .5 * y + .4) + .04 * Math.sin(3.7 * x + 2.6 * y + 1.7) + .016 * Math.sin(8.7 * x - 5.9 * y + .8)];
const densify = (ring: Position[]) => {
  const out: Position[] = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .04));
    for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  out.push(out[0]);
  return out;
};
const closed = (r: Position[]) => (r[0][0] === r.at(-1)![0] && r[0][1] === r.at(-1)![1] ? r : [...r, r[0]]);
const polysOf = (g: Poly): Position[][][] => g.geometry.type === 'Polygon' ? [g.geometry.coordinates] : g.geometry.coordinates;
const inter = (a: Poly, b: Poly) => { try { return turf.intersect(turf.featureCollection([a, b])) as Poly | null; } catch { return null; } };
const union = (ps: Poly[]) => ps.length === 1 ? ps[0] : turf.union(turf.featureCollection(ps)) as Poly;
const hit = (a: number[], b: number[]) => !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);

export function buildRegions() {
  step('regions · editorial cells on 1:10m admin-1');
  const src = readJSON<Source[]>(path.join(DATA, 'regions.source.json'));
  const cells = src.map(r => {
    let f: Poly;
    if (OVERRIDE[r.id]) f = OVERRIDE[r.id];
    else {
      let rings = r.rings.map(closed).filter(x => x.length >= 4);
      if (!CARVE.has(r.id)) rings = rings.map(x => densify(x).map(warp));
      const raw = turf.multiPolygon(rings.map(x => [x]));
      try { f = (turf.union(turf.featureCollection([raw, raw])) as Poly) || raw; } catch { f = raw; }
    }
    return { r, f, bbox: turf.bbox(f) };
  });

  const parts = readJSON<GeoJSON.FeatureCollection<Polygon | MultiPolygon>>(ADM1).features.flatMap(a =>
    (a.geometry.type === 'Polygon' ? [a.geometry.coordinates] : a.geometry.coordinates).map(p => {
      const f = turf.polygon(p) as Poly;
      return { f, bbox: turf.bbox(f), area: turf.area(f) };
    }));

  const pieces: Poly[][] = cells.map(() => []);
  for (const p of parts) {
    const ov: { i: number; g: Poly; a: number }[] = [];
    cells.forEach((c, i) => {
      if (CARVE.has(c.r.id) || !hit(p.bbox, c.bbox)) return;
      const g = inter(p.f, c.f); if (!g) return;
      const a = turf.area(g); if (a > 1e6) ov.push({ i, g, a });
    });
    if (!ov.length) continue;
    ov.sort((x, y) => y.a - x.a);
    if (p.area < ISLAND || ov[0].a / p.area >= SHARE) pieces[ov[0].i].push(p.f);
    else for (const o of ov) pieces[o.i].push(o.g);
  }
  const geoms: (Poly | null)[] = cells.map((c, i) => pieces[i].length ? union(pieces[i]) : CARVE.has(c.r.id) ? null : c.f);

  // carve: the small cell grown by 6 km and cut to the coast, then removed from everything else
  cells.forEach((c, i) => {
    if (!CARVE.has(c.r.id)) return;
    const grown = turf.buffer(c.f, 6, { units: 'kilometers' }) as Poly;
    geoms[i] = union(parts.filter(p => hit(p.bbox, turf.bbox(grown))).map(p => inter(p.f, grown)).filter(Boolean) as Poly[]);
  });
  const carved = cells.map((c, i) => CARVE.has(c.r.id) ? i : -1).filter(i => i >= 0);
  cells.forEach((c, i) => {
    if (CARVE.has(c.r.id)) return;
    for (const j of carved) if (hit(turf.bbox(geoms[i]!), turf.bbox(geoms[j]!))) {
      const d = turf.difference(turf.featureCollection([geoms[i]!, geoms[j]!])) as Poly | null; if (d) geoms[i] = d;
    }
  });
  carved.forEach((i, k) => { for (const j of carved.slice(0, k)) { const d = turf.difference(turf.featureCollection([geoms[i]!, geoms[j]!])) as Poly | null; if (d) geoms[i] = d; } });

  // snap + clean so neighbours share identical edges
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-')), a = path.join(tmp, 'in.json'), b = path.join(tmp, 'out.json');
  fs.writeFileSync(a, JSON.stringify(turf.featureCollection(geoms.map((g, i) => ({ ...g!, properties: { i } })))));
  mapshaper('-i', a, 'snap', 'snap-interval=0.002', '-clean', 'gap-fill-area=40km2', '-o', b, 'format=geojson', 'precision=0.0001');
  for (const f of readJSON<GeoJSON.FeatureCollection<Polygon | MultiPolygon>>(b).features) if (f.geometry) geoms[f.properties!.i] = f as Poly;

  const out = cells.map((c, i) => {
    const g = geoms[i]!;
    const keep = polysOf(g).filter(p => turf.area(turf.polygon(p)) > 30e6);
    const geom = turf.multiPolygon(keep.length ? keep : polysOf(g));
    let center = c.r.center;
    if (!turf.booleanPointInPolygon(turf.point(center), geom)) {
      const big = polysOf(geom).sort((x, y) => turf.area(turf.polygon(y)) - turf.area(turf.polygon(x)))[0];
      center = polylabel(big as [number, number][][], 0.01);
    }
    const { rings: _, center: __, ...meta } = c.r;
    return {
      ...meta, center: center.map(v => +v.toFixed(3)), bbox: turf.bbox(geom).map(v => +v.toFixed(3)),
      areaKm2: Math.round(turf.area(geom) / 1e6),
      geometry: { type: 'MultiPolygon', coordinates: geom.geometry.coordinates.map(p => p.map(r => r.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]))) },
    };
  });
  writeJSON(path.join(OUT, 'regions.json'), out);
}
