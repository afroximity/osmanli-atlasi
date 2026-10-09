/** Runtime data: built geodata from public/data, editorial content bundled from data/content. */
import type { Topology } from 'topojson-specification';
import { TerritoryData, meshOf, type Polity, type Relation } from '../engine/territory/TerritoryData';
import rulers from '../../data/content/rulers.json';
import people from '../../data/content/people.json';
import events from '../../data/content/events.json';
import eras from '../../data/content/eras.json';
import groups from '../../data/content/groups.json';
import sources from '../../data/content/sources.json';

export type Ruler = { id: string; order: number; name: string; title: string; terms: [number, number][]; bio: string; source: string; wikipedia?: string };
export type Person = { id: string; name: string; role: string; born: number; died: number; focus: number; region: string; bio: string; source: string; wikipedia?: string };
export type Era = { start: number; end: number; name: string };
export type AtlasEvent = { id: string; year: number; title: string; type: string; region: string; text: string; source: string; wikipedia?: string };
export type Region = { id: string; name: string; periods: [number, number, string][]; groups: string[]; source: string; hint?: string; center: [number, number]; bbox: [number, number, number, number]; areaKm2: number; geometry: GeoJSON.MultiPolygon };

export const content = {
  rulers: rulers as Ruler[],
  people: people as Person[],
  events: events as AtlasEvent[],
  eras: eras as Era[],
  groups: groups as Record<string, { name: string; color: string }>,
  sources: sources as { name: string; title: string; url: string; use: string }[],
};

/** Absolute URL of a built data file, wherever the app is hosted (root or a sub-path like GitHub Pages). */
export const dataUrl = (path: string) => new URL(import.meta.env.BASE_URL + 'data/' + path, location.href).href;

const get = <T,>(url: string) => fetch(url).then(r => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json() as Promise<T>; });

export async function loadAtlas(onProgress?: (part: string) => void) {
  const [topo, polities, relations, regions, land] = await Promise.all([
    get<Topology>(dataUrl('territories.topo.json')).then(x => (onProgress?.('territories'), x)),
    get<Polity[]>(dataUrl('polities.json')),
    get<Relation[]>(dataUrl('relations.json')),
    get<Region[]>(dataUrl('regions.json')).then(x => (onProgress?.('regions'), x)),
    get<GeoJSON.GeoJSON>(dataUrl('base/land.json')),
  ]);
  return { territory: new TerritoryData(topo, polities, relations), regions, land: meshOf(polygonsOf(land)) };
}

/** Every polygon in any GeoJSON object, as lon/lat rings. */
function polygonsOf(g: GeoJSON.GeoJSON): GeoJSON.Position[][][] {
  switch (g.type) {
    case 'FeatureCollection': return g.features.flatMap(polygonsOf);
    case 'Feature': return g.geometry ? polygonsOf(g.geometry) : [];
    case 'GeometryCollection': return g.geometries.flatMap(polygonsOf);
    case 'Polygon': return [g.coordinates];
    case 'MultiPolygon': return g.coordinates;
    default: return [];
  }
}
