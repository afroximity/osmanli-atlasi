/** Camera moves the UI asks for, routed to whichever AtlasMap is mounted. */
import type { AtlasMap } from '../engine/AtlasMap';
import type { Region } from '../data/load';

let map: AtlasMap | null = null;
let regions: Region[] = [];
export const bindCamera = (m: AtlasMap | null, rs: Region[]) => { map = m; regions = rs; };
export const atlasMap = () => map;

export const camera = {
  fit(duration = 1000) { map?.fit(duration); },
  /** Frame a region; `mult` loosely mirrors the prototype's zoom factor (bigger = closer). */
  focusRegion(id: string, mult = 2, duration = 1200) {
    const r = regions.find(x => x.id === id);
    if (!r || !map) return;
    const [w, s, e, n] = r.bbox, pad = Math.max(e - w, n - s) * (0.9 / mult);
    map.flyToBounds([w - pad, s - pad, e + pad, n + pad], 4 + mult, duration);
  },
  zoomBy(f: number) { if (map) map.map.easeTo({ zoom: map.map.getZoom() + Math.log2(f), duration: 380 }); },
  stop() { map?.map.stop(); },
};
