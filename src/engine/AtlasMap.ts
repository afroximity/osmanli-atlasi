/**
 * The atlas map: MapLibre for the physical base and the camera, TerritoryLayer for political ground.
 * Framework-free; the UI talks to it through setYear / camera methods and the hover / pick callbacks.
 */
import { Map as MLMap, LngLatBounds, setWorkerUrl, type LngLatLike } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { basemapStyle, TERRITORY_BEFORE } from './basemap';
import { TerritoryLayer } from './territory/TerritoryLayer';
import { PolityLabels } from './PolityLabels';
import type { TerritoryData, Piece, Mesh } from './territory/TerritoryData';

// MapLibre's worker is a separate module; bundlers need its URL spelled out
setWorkerUrl(workerUrl);

export type Hover = { piece: Piece | null; lngLat: [number, number]; point: [number, number] };
/** The frame the atlas opens on and fits back to. [west, south, east, north] */
export const HOME: [number, number, number, number] = [-9, 12, 58, 50];

export class AtlasMap {
  readonly map: MLMap;
  readonly territory: TerritoryLayer;
  readonly ready: Promise<void>;
  readonly labels: PolityLabels;
  private year = 1299;
  onHover?: (h: Hover) => void;
  onPick?: (h: Hover) => void;

  constructor(container: HTMLElement, readonly data: TerritoryData, land: Mesh, opts: { basemap: string; padding?: () => { top: number; bottom: number; left: number; right: number } }) {
    this.padding = opts.padding ?? (() => ({ top: 0, bottom: 0, left: 0, right: 0 }));
    this.map = new MLMap({
      container, style: basemapStyle(opts.basemap), attributionControl: false, renderWorldCopies: false,
      dragRotate: false, pitchWithRotate: false, touchPitch: false, keyboard: false, fadeDuration: 0,
      bounds: HOME, fitBoundsOptions: { padding: this.padding() }, minZoom: 2, maxZoom: 11, maxBounds: [[-40, -10], [90, 70]],
    });
    this.map.touchZoomRotate.disableRotation();
    this.territory = new TerritoryLayer(data, land);
    this.labels = new PolityLabels(this.map, data);
    this.ready = new Promise(resolve => this.map.once('load', () => {
      this.map.addLayer(this.territory, TERRITORY_BEFORE);
      this.territory.setYear(this.year);
      this.labels.set(this.territory.pieces());
      resolve();
    }));
    const info = (e: { lngLat: { lng: number; lat: number }; point: { x: number; y: number } }): Hover => ({
      piece: this.data.pick(this.territory.pieces(), e.lngLat.lng, e.lngLat.lat), lngLat: [e.lngLat.lng, e.lngLat.lat], point: [e.point.x, e.point.y],
    });
    this.map.on('mousemove', e => this.onHover?.(info(e)));
    this.map.on('click', e => this.onPick?.(info(e)));
  }
  /** Screen insets the UI covers; camera fits keep the map inside them. */
  readonly padding: () => { top: number; bottom: number; left: number; right: number };

  /** Show a year; `duration` > 0 animates the change as a tide. */
  setYear(year: number, duration = 0) {
    this.year = year;
    if (!this.map.getLayer(this.territory.id)) return;
    this.territory.setYear(year, duration);
    this.labels.set(this.territory.pieces());
  }

  /** Renderer display options (dependants, baseline comparison, muted fill). */
  setOptions(o: Parameters<TerritoryLayer['setOptions']>[0]) { this.ready.then(() => this.territory.setOptions(o)); }

  /** Editorial regions as an outline layer above the territories, for hover and selection. */
  setRegions(fc: GeoJSON.FeatureCollection) {
    this.ready.then(() => {
      const m = this.map;
      m.addSource('regions', { type: 'geojson', data: fc, promoteId: 'id' });
      m.addLayer({ id: 'region-line', type: 'line', source: 'regions', layout: { 'line-join': 'round' },
        paint: { 'line-color': ['case', ['boolean', ['feature-state', 'sel'], false], '#f6dcac', '#facb8d'],
          'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 2.2, 1.4],
          'line-opacity': ['case', ['boolean', ['feature-state', 'sel'], false], 1, ['boolean', ['feature-state', 'hover'], false], 0.8, 0] } });
    });
  }
  private flags = { sel: null as string | null, hover: null as string | null };
  highlightRegion(kind: 'sel' | 'hover', id: string | null) {
    this.ready.then(() => {
      const prev = this.flags[kind];
      if (prev === id) return;
      if (prev) this.map.setFeatureState({ source: 'regions', id: prev }, { [kind]: false });
      if (id) this.map.setFeatureState({ source: 'regions', id }, { [kind]: true });
      this.flags[kind] = id;
    });
  }

  fit(duration = 1200) { this.map.fitBounds(HOME, { padding: this.padding(), duration }); }
  flyTo(center: LngLatLike, zoom: number, duration = 1400) { this.map.flyTo({ center, zoom, duration, padding: this.padding(), essential: true }); }
  flyToBounds(b: [number, number, number, number], maxZoom = 7, duration = 1400) {
    this.map.fitBounds(new LngLatBounds([b[0], b[1]], [b[2], b[3]]), { padding: this.padding(), maxZoom, duration });
  }
  destroy() { this.map.remove(); }
}
