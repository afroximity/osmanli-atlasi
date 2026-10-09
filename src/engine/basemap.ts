/** The physical map: sea, land, relief, water. Political ground is drawn by TerritoryLayer between land and relief. */
import type { StyleSpecification, LineLayerSpecification } from 'maplibre-gl';

const DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const PALETTE = { sea: '#191714', land: '#363027', ink: '#5f5241', river: '#56605a', grat: '#efe9df' };

type Offset = NonNullable<LineLayerSpecification['paint']>['line-offset'];
const coast = (id: string, offset: Offset, opacity: number, width = 0.8): LineLayerSpecification => ({
  id, type: 'line', source: 'land', paint: { 'line-color': PALETTE.ink, 'line-width': width, 'line-opacity': opacity, 'line-offset': offset },
});

/** Layer the territory renderer is inserted before. */
export const TERRITORY_BEFORE = 'relief';

/** `base`: absolute URL of the folder holding land / lakes / rivers / bathymetry GeoJSON. */
export function basemapStyle(base: string): StyleSpecification {
  const graticule: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      ...[-20, -10, 0, 10, 20, 30, 40, 50, 60, 70].map(x => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: [[x, 0], [x, 62]] } })),
      ...[10, 20, 30, 40, 50, 60].map(y => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: Array.from({ length: 11 }, (_, i) => [-25 + i * 10, y]) } })),
    ],
  };
  return {
    version: 8,
    sources: {
      land: { type: 'geojson', data: `${base}/land.json`, tolerance: 0.2 },
      bathy: { type: 'geojson', data: `${base}/bathymetry.json` },
      lakes: { type: 'geojson', data: `${base}/lakes.json` },
      rivers: { type: 'geojson', data: `${base}/rivers.json` },
      grat: { type: 'geojson', data: graticule },
      dem: { type: 'raster-dem', tiles: [DEM], encoding: 'terrarium', tileSize: 256, maxzoom: 10, attribution: 'Terrain Tiles · Mapzen / AWS Open Data' },
    },
    layers: [
      { id: 'sea', type: 'background', paint: { 'background-color': PALETTE.sea } },
      { id: 'grat', type: 'line', source: 'grat', paint: { 'line-color': PALETTE.grat, 'line-opacity': 0.05, 'line-width': 1 } },
      // engraved water-lines along the coast, as on copperplate charts
      coast('wl-3', ['interpolate', ['linear'], ['zoom'], 3, -9, 8, -15], 0.07),
      coast('wl-2', ['interpolate', ['linear'], ['zoom'], 3, -5.5, 8, -9], 0.13),
      coast('wl-1', ['interpolate', ['linear'], ['zoom'], 3, -2.6, 8, -4], 0.22),
      { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': PALETTE.land } },
      {
        id: 'relief', type: 'hillshade', source: 'dem',
        paint: {
          'hillshade-exaggeration': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 8, 0.45],
          'hillshade-shadow-color': 'rgba(10,8,6,0.9)', 'hillshade-highlight-color': 'rgba(196,172,128,0.5)',
          'hillshade-accent-color': 'rgba(20,16,12,0.45)', 'hillshade-illumination-direction': 315,
        },
      },
      { id: 'deep', type: 'fill', source: 'bathy', paint: { 'fill-color': ['step', ['get', 'depth'], '#191612', 1000, '#161310', 2000, '#13110e'], 'fill-opacity': 0.86 } },
      { id: 'lakes', type: 'fill', source: 'lakes', paint: { 'fill-color': PALETTE.sea } },
      { id: 'lakes-edge', type: 'line', source: 'lakes', paint: { 'line-color': PALETTE.ink, 'line-width': 0.6 } },
      {
        id: 'rivers', type: 'line', source: 'rivers', filter: ['<=', ['get', 'scalerank'], ['step', ['zoom'], 5, 4, 7, 5.5, 9]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': PALETTE.river, 'line-opacity': 0.8,
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, ['interpolate', ['linear'], ['get', 'scalerank'], 1, 1.1, 9, 0.35], 8, ['interpolate', ['linear'], ['get', 'scalerank'], 1, 2.6, 9, 0.8]],
        },
      },
      coast('coast', 0, 0.95, 0.9),
    ],
  };
}
