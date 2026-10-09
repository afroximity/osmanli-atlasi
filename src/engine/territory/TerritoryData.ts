/**
 * The territorial timeline: which polity holds which ground in a given year, and in what standing toward the
 * protagonist. Geometry is decoded lazily from one TopoJSON (shared arcs) and cached as mercator triangle meshes.
 */
import earcut, { flatten } from 'earcut';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { MultiPolygon, Polygon, Position } from 'geojson';

export type Polity = { id: string; name: string; tr?: string; from: number; to: number; maxArea: number; tint: [number, number, number]; wikipedia?: string; wikidata?: string };
export type Relation = { polity: string; kind: Standing; from: number; to: number; source?: string };
/** How a piece of ground stands toward the protagonist. */
export type Standing = 'direct' | 'vassal' | 'autonomy' | 'other';

export type Piece = { geom: number; polity: number; standing: Standing };
export type Mesh = { vertices: Float32Array; bbox: [number, number, number, number] };

/** i: polity index · f/t: first and last year (inclusive) · a: area in km² (Cliopatria) */
type SnapshotProps = { i: number; f: number; t: number; a: number };

export const mercX = (lon: number) => (lon + 180) / 360;
export const mercY = (lat: number) => (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;

export class TerritoryData {
  readonly polities: Polity[];
  readonly protagonist: number;
  private snaps: (SnapshotProps & { g: number })[];
  private relations: Map<number, Relation[]>;
  private geoms: GeometryCollection<SnapshotProps>['geometries'];
  private meshes = new Map<number, Mesh>();
  private shapes = new Map<number, Position[][][]>();

  constructor(private topo: Topology, polities: Polity[], relations: Relation[], protagonistId = 'ottoman') {
    this.polities = polities;
    this.protagonist = polities.findIndex(p => p.id === protagonistId);
    const byName = new Map(polities.map((p, i) => [p.name, i]));
    this.relations = new Map();
    for (const r of relations) {
      const i = byName.get(r.polity);
      if (i === undefined) continue;
      this.relations.set(i, [...(this.relations.get(i) || []), r]);
    }
    this.geoms = (topo.objects.territories as GeometryCollection<SnapshotProps>).geometries;
    this.snaps = this.geoms.map((g, k) => ({ ...(g.properties as SnapshotProps), g: k }));
  }

  standingOf(polity: number, year: number): Standing {
    if (polity === this.protagonist) return 'direct';
    const r = this.relations.get(polity)?.find(r => r.from <= year && year <= r.to);
    return r ? r.kind : 'other';
  }

  /** Pieces held in a year, in paint order: neighbours, then dependants, then the protagonist on top. */
  at(year: number): Piece[] {
    const rank: Record<Standing, number> = { other: 0, autonomy: 1, vassal: 1, direct: 2 };
    return this.snaps
      .filter(s => s.f <= year && year <= s.t)
      .map(s => ({ geom: s.g, polity: s.i, standing: this.standingOf(s.i, year) }))
      .sort((a, b) => rank[a.standing] - rank[b.standing] || this.polities[b.polity].maxArea - this.polities[a.polity].maxArea);
  }

  /** Area held by the protagonist and its dependants, km², by standing. */
  areaAt(year: number) {
    const out = { direct: 0, vassal: 0, autonomy: 0 };
    for (const s of this.snaps) if (s.f <= year && year <= s.t) {
      const st = this.standingOf(s.i, year);
      if (st !== 'other') out[st] += s.a || 0;
    }
    return out;
  }

  /** Years in which anything on the map changes — snapshot or relation boundaries. */
  changeYears(): number[] {
    const ys = new Set<number>();
    for (const s of this.snaps) { ys.add(s.f); ys.add(s.t + 1); }
    for (const rs of this.relations.values()) for (const r of rs) { ys.add(r.from); ys.add(r.to + 1); }
    return [...ys].sort((a, b) => a - b);
  }

  /** Lon/lat polygons of one snapshot (decoded once). */
  shape(geom: number): Position[][][] {
    let s = this.shapes.get(geom);
    if (!s) {
      const g = (feature(this.topo, this.geoms[geom] as any) as any).geometry as Polygon | MultiPolygon | null;
      s = !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      this.shapes.set(geom, s);
    }
    return s;
  }

  /** Triangles in web-mercator [0,1] space, ready for a vertex buffer. */
  mesh(geom: number): Mesh {
    let m = this.meshes.get(geom);
    if (!m) { m = meshOf(this.shape(geom)); this.meshes.set(geom, m); }
    return m;
  }

  /** The topmost piece under a lon/lat point. */
  pick(pieces: Piece[], lon: number, lat: number): Piece | null {
    for (let k = pieces.length - 1; k >= 0; k--) {
      const p = pieces[k], m = this.mesh(p.geom), x = mercX(lon), y = mercY(lat);
      if (x < m.bbox[0] || x > m.bbox[2] || y < m.bbox[1] || y > m.bbox[3]) continue;
      if (this.shape(p.geom).some(poly => inPolygon(poly, lon, lat))) return p;
    }
    return null;
  }
}

/** Triangulate lon/lat polygons into web-mercator [0,1] triangles. */
export function meshOf(polys: Position[][][]): Mesh {
  const out: number[] = [];
  const bbox: [number, number, number, number] = [1, 1, 0, 0];
  for (const poly of polys) {
    const merc = poly.map(ring => ring.map(([x, y]) => [mercX(x), mercY(Math.max(-85, Math.min(85, y)))]));
    const { vertices, holes, dimensions } = flatten(merc);
    for (const i of earcut(vertices, holes, dimensions)) {
      const x = vertices[i * 2], y = vertices[i * 2 + 1];
      out.push(x, y);
      if (x < bbox[0]) bbox[0] = x; if (y < bbox[1]) bbox[1] = y; if (x > bbox[2]) bbox[2] = x; if (y > bbox[3]) bbox[3] = y;
    }
  }
  return { vertices: new Float32Array(out), bbox };
}

function inRing(ring: Position[], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inPolygon = (poly: Position[][], x: number, y: number) => inRing(poly[0], x, y) && !poly.slice(1).some(h => inRing(h, x, y));
