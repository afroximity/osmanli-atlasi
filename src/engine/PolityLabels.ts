/**
 * Names of the polities on the map, placed at each territory's visual centre (pole of inaccessibility) and thinned
 * so they never collide. Bigger ground wins the space; the protagonist always gets its name.
 */
import polylabel from 'polylabel';
import type { Map as MLMap } from 'maplibre-gl';
import type { TerritoryData, Piece } from './territory/TerritoryData';

type Anchor = { lngLat: [number, number]; span: number };

export class PolityLabels {
  private el: HTMLDivElement;
  private anchors = new Map<number, Anchor>();
  private pieces: Piece[] = [];
  private nodes = new Map<number, HTMLDivElement>();

  constructor(private map: MLMap, private data: TerritoryData) {
    this.el = document.createElement('div');
    this.el.className = 'polity-labels';
    map.getContainer().appendChild(this.el);
    map.on('move', () => this.layout());
  }

  set(pieces: Piece[]) { this.pieces = pieces; this.layout(); }

  private anchor(geom: number): Anchor {
    let a = this.anchors.get(geom);
    if (!a) {
      const polys = this.data.shape(geom);
      let best = polys[0], bestArea = -1;
      for (const p of polys) { const ar = ringArea(p[0]); if (ar > bestArea) { bestArea = ar; best = p; } }
      const pt = best ? polylabel(best as [number, number][][], 0.05) : [0, 0];
      const xs = best?.[0].map(c => c[0]) ?? [0];
      a = { lngLat: [pt[0], pt[1]], span: Math.max(...xs) - Math.min(...xs) };
      this.anchors.set(geom, a);
    }
    return a;
  }

  private layout() {
    const { map, data } = this;
    const W = map.getContainer().clientWidth, H = map.getContainer().clientHeight;
    const pxPerDeg = (512 * Math.pow(2, map.getZoom())) / 360;
    const placed: DOMRect[] = [];
    const wanted = new Set<number>();
    const order = [...this.pieces].sort((a, b) =>
      Number(b.polity === data.protagonist) - Number(a.polity === data.protagonist) || this.anchor(b.geom).span - this.anchor(a.geom).span);
    for (const p of order) {
      const a = this.anchor(p.geom), mine = p.polity === data.protagonist;
      if (!mine && a.span * pxPerDeg < 70) continue;
      const pt = map.project(a.lngLat);
      if (pt.x < -50 || pt.y < -20 || pt.x > W + 50 || pt.y > H + 20) continue;
      const pol = data.polities[p.polity];
      const text = mine ? 'Osmanlı Devleti' : pol.tr ?? pol.name;
      const w = text.length * (mine ? 11.5 : 6.6) + 12, h = mine ? 22 : 14;
      const box = new DOMRect(pt.x - w / 2, pt.y - h / 2, w, h);
      if (placed.some(r => !(box.right < r.left || box.left > r.right || box.bottom < r.top || box.top > r.bottom))) continue;
      placed.push(box);
      wanted.add(p.geom);
      let n = this.nodes.get(p.geom);
      if (!n) {
        n = document.createElement('div');
        n.className = 'polity-label' + (mine ? ' mine' : p.standing !== 'other' ? ' dependant' : '');
        n.textContent = text;
        this.el.appendChild(n);
        this.nodes.set(p.geom, n);
      }
      n.style.transform = `translate(${pt.x}px, ${pt.y}px) translate(-50%, -50%)`;
    }
    for (const [g, n] of this.nodes) if (!wanted.has(g)) { n.remove(); this.nodes.delete(g); }
  }
}

const ringArea = (r: number[][]) => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(s / 2); };
