/**
 * Polity territories through time, from Cliopatria (Seshat Global History Databank, CC BY 4.0).
 *
 * Every Cliopatria row is one polity over an inclusive year range. We keep the rows that touch the atlas frame
 * between 1290 and 1925, clip them to the frame and to the shared 1:10m coastline, and write them as one TopoJSON
 * layer so coasts and common borders are stored once. A small index (polities.json) carries names and colors.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CACHE, DATA, OUT, BBOX } from './paths.ts';
import { mapshaper, readJSON, writeJSON, slug, step, WORK } from './lib.ts';
import { LAND } from './basemap.ts';

const YEARS = [1290, 1925];

type Row = { Name: string; FromYear: number; ToYear: number; Type: string; Wikipedia?: string; Wikidata?: string; Area: number };

const bboxOf = (g: GeoJSON.Geometry) => {
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c: any) => typeof c[0] === 'number' ? (b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])]) : c.forEach(walk);
  walk((g as any).coordinates);
  return b;
};
const touches = (b: number[]) => b[2] > BBOX[0] && b[0] < BBOX[2] && b[3] > BBOX[1] && b[1] < BBOX[3];

// muted, map-friendly tints for neighbours; the protagonist's colors live in the engine theme
const TINTS = [[120, 132, 140], [138, 124, 104], [112, 128, 108], [134, 116, 128], [102, 122, 136], [140, 130, 96], [118, 110, 134], [96, 128, 124], [136, 112, 104], [110, 120, 96]];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function buildTerritories() {
  step('territories · Cliopatria');
  const src = readJSON<GeoJSON.FeatureCollection<GeoJSON.Geometry, Row>>(path.join(CACHE, 'cliopatria.geojson'));
  const editorial = readJSON<Record<string, { id?: string; tr?: string; hidden?: boolean; color?: number[] }>>(path.join(DATA, 'polities.json'));

  const rows = src.features.filter(f => {
    const p = f.properties;
    return p.Type === 'POLITY' && !p.Name.startsWith('(') && !editorial[p.Name]?.hidden
      && p.ToYear >= YEARS[0] && p.FromYear <= YEARS[1] && f.geometry && touches(bboxOf(f.geometry));
  });
  const names = [...new Set(rows.map(f => f.properties.Name))];
  const index = new Map(names.map((n, i) => [n, i]));
  console.log(`  ${rows.length} rows · ${names.length} polities`);

  const raw = path.join(WORK, 'clio-region.json'), topo = path.join(WORK, 'territories.topo.json');
  writeJSON(raw, {
    type: 'FeatureCollection',
    features: rows.map(f => ({ type: 'Feature', geometry: f.geometry, properties: { i: index.get(f.properties.Name), f: f.properties.FromYear, t: f.properties.ToYear, a: Math.round(f.properties.Area) } })),
  });
  // clip to the frame and the shared coastline; TopoJSON keeps each shared arc once
  mapshaper('-i', raw, '-clip', `bbox=${BBOX.join(',')}`, '-clip', LAND, '-filter-slivers', 'min-area=4km2',
    '-filter', '!this.isNull', '-o', topo, 'format=topojson', 'quantization=200000');

  const t = readJSON(topo);
  const layer = Object.keys(t.objects)[0];
  t.objects = { territories: t.objects[layer] };
  writeJSON(path.join(OUT, 'territories.topo.json'), t);

  const span = new Map<string, [number, number, number]>();
  for (const f of rows) {
    const p = f.properties, s = span.get(p.Name) || [9999, 0, 0];
    span.set(p.Name, [Math.min(s[0], p.FromYear), Math.max(s[1], p.ToYear), Math.max(s[2], p.Area)]);
  }
  const first = new Map<string, Row>();
  for (const f of rows) if (!first.has(f.properties.Name)) first.set(f.properties.Name, f.properties);
  writeJSON(path.join(OUT, 'polities.json'), names.map(name => {
    const e = editorial[name] || {}, r = first.get(name)!, [from, to, maxArea] = span.get(name)!;
    return {
      id: e.id || slug(name), name, tr: e.tr, from, to, maxArea: Math.round(maxArea),
      tint: e.color || TINTS[hash(name) % TINTS.length],
      wikipedia: r.Wikipedia || undefined, wikidata: r.Wikidata || undefined,
    };
  }));
  writeJSON(path.join(OUT, 'relations.json'), readJSON(path.join(DATA, 'relations.json')).relations);
  fs.rmSync(raw);
}
