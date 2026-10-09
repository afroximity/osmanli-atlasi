/**
 * The map and everything pinned to it: the engine, place names, the focus marker, community boxes, the tooltip.
 * Screen-space overlays re-project on every camera frame.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AtlasMap } from '../engine/AtlasMap';
import { content, dataUrl, type Region } from '../data/load';
import { useAtlas, actions, baselineOf } from './store';
import { useData, regionById } from './context';
import { bindCamera } from './camera';
import { STATUS_NAMES, statusAt, isOttoman, groupsAt } from './model';

const SEAS: [string, number, number, number][] = [['Karadeniz', 34, 43.4, 0], ['Akdeniz', 18, 35.2, 0], ['Kızıldeniz', 37.4, 21.8, -58], ['Hazar', 51, 41.5, -80], ['Basra Körfezi', 51.2, 26.9, -36], ['Adriyatik', 15.6, 43, -38], ['Ege', 25.1, 38.6, -70]];
const CITIES: [string, number, number, string, 1 | 2][] = [['İstanbul', 28.98, 41.01, 'istanbul', 1], ['Edirne', 26.56, 41.67, 'thrace', 2], ['Bursa', 29.06, 40.18, 'bursa', 2], ['Selânik', 22.94, 40.64, 'thessaloniki', 2], ['Budin', 19.05, 47.5, 'hungary', 1], ['Belgrad', 20.45, 44.79, 'belgrade', 2], ['Şam', 36.3, 33.51, 'syria', 1], ['Bağdat', 44.37, 33.31, 'iraq', 1], ['Kahire', 31.24, 30.04, 'egypt', 1], ['Mekke', 39.82, 21.42, 'hejaz', 1], ['Trablus', 13.19, 32.88, 'tripoli', 1], ['Cezayir', 3.06, 36.75, 'algeria', 1], ['Tebriz', 46.29, 38.08, 'azerbaijan', 2], ['Kefe', 35.38, 45.03, 'crimea', 2]];

function inRing(ring: number[][], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const regionAt = (rs: Region[], lng: number, lat: number) => {
  const hits = rs.filter(r => lng >= r.bbox[0] && lng <= r.bbox[2] && lat >= r.bbox[1] && lat <= r.bbox[3]
    && r.geometry.coordinates.some(p => inRing(p[0], lng, lat) && !p.slice(1).some(h => inRing(h, lng, lat))));
  return hits.sort((a, b) => a.areaKm2 - b.areaKm2)[0] || null;
};

export function MapView({ onMap }: { onMap: (m: AtlasMap) => void }) {
  const data = useData();
  const host = useRef<HTMLDivElement>(null);
  const [atlas, setAtlas] = useState<AtlasMap | null>(null);
  const [, setFrame] = useState(0);
  const [tip, setTip] = useState<{ x: number; y: number; html: ReactNode } | null>(null);
  const s = useAtlas();

  useEffect(() => {
    const folioW = () => (useAtlas.getState().folio ? document.querySelector('.folio')?.clientWidth ?? 0 : 0);
    const m = new AtlasMap(host.current!, data.territory, data.land, {
      basemap: dataUrl('base'),
      padding: () => ({ top: 80, bottom: (document.querySelector('.dock')?.clientHeight ?? 176) + 30, left: 40, right: folioW() + 40 }),
    });
    m.setRegions({ type: 'FeatureCollection', features: data.regions.map(r => ({ type: 'Feature', properties: { id: r.id }, geometry: r.geometry })) });
    let raf = 0;
    m.map.on('move', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setFrame(f => f + 1)); });
    m.onHover = h => {
      const r = regionAt(data.regions, h.lngLat[0], h.lngLat[1]);
      m.highlightRegion('hover', r && !m.map.isMoving() ? r.id : null);
      m.map.getCanvas().style.cursor = r ? 'pointer' : '';
      const p = h.piece && data.territory.polities[h.piece.polity];
      if (!r && !p) { setTip(null); return; }
      const y = useAtlas.getState().year;
      setTip({
        x: h.point[0], y: h.point[1],
        html: <>{r && <><b>{r.name}</b><span>{y} · {STATUS_NAMES[statusAt(r, y)]}</span></>}
          {p && <span className="tip-polity">{p.tr ?? p.name}{h.piece!.standing === 'vassal' ? ' · Osmanlı’ya bağlı' : h.piece!.standing === 'autonomy' ? ' · özerk' : ''}</span>}</>,
      });
    };
    m.onPick = h => { const r = regionAt(data.regions, h.lngLat[0], h.lngLat[1]); if (r) actions.selectRegion(r.id); };
    m.map.getContainer().addEventListener('mouseleave', () => { setTip(null); m.highlightRegion('hover', null); });
    m.map.on('dragstart', () => setTip(null));
    bindCamera(m, data.regions);
    setAtlas(m);
    onMap(m);
    if (import.meta.env.DEV) (window as any).atlas = m;
    return () => { bindCamera(null, []); m.destroy(); };
  }, [data]);

  // year → engine, with the tide the store asked for
  useEffect(() => {
    if (!atlas) return;
    const ms = typeof s.tide === 'number' ? s.tide : s.tide ? 1300 : 0;
    atlas.ready.then(() => atlas.setYear(s.year, ms));
  }, [atlas, s.year]);
  const compare = s.mode === 'movement' ? baselineOf() : null;
  useEffect(() => {
    atlas?.setOptions({ dependents: s.dependents, compare, muted: s.mode === 'ethnicity' });
  }, [atlas, s.dependents, s.mode, compare]);
  useEffect(() => { atlas?.highlightRegion('sel', s.region); }, [atlas, s.region]);

  const map = atlas?.map;
  const at = (lng: number, lat: number) => { const p = map!.project([lng, lat]); return `translate(${p.x}px, ${p.y}px)`; };
  const zoom = map?.getZoom() ?? 4;

  // focus marker: the selected region, person or event
  const person = content.people.find(p => p.id === s.person), event = content.events.find(e => e.id === s.event);
  const focusR = regionById(data.regions, s.region || person?.region || event?.region);
  const focusLabel = person ? person.name : event ? `${event.year} · ${event.title}` : focusR?.name;

  return (
    <>
      <div className="basemap" ref={host} role="img" aria-label="Kronolojik Osmanlı haritası" />
      {map && (
        <div className="map-overlay">
          {SEAS.map(([t, lng, lat, ang]) => <span key={t} className="lbl-sea" style={{ transform: at(lng, lat) + ` translate(-50%,-50%) rotate(${ang}deg)` }}>{t}</span>)}
          {CITIES.map(([name, lng, lat, id, tier]) => {
            const r = regionById(data.regions, id), on = r && isOttoman(statusAt(r, s.year), s.dependents);
            if ((tier === 2 && zoom < 4.6) || (s.mode === 'ethnicity' && tier === 2)) return null;
            return (
              <span key={name} className={'city' + (on ? '' : ' off')} style={{ transform: at(lng, lat) }}>
                <i /><em>{name === 'İstanbul' && s.year < 1453 ? 'Konstantiniyye' : name}</em>
              </span>
            );
          })}
          {s.mode === 'ethnicity' && data.regions.filter(r => r.areaKm2 > 17000 && isOttoman(statusAt(r, s.year), s.dependents)).map(r => {
            const gs = groupsAt(r, s.year).filter(g => s.groups.has(g));
            if (!gs.length) return null;
            const nm = r.name.split('–')[0].replace(' çevresi', '').replace(' sahası', '');
            return (
              <button key={r.id} className={'eth' + (zoom < 4.4 ? ' compact' : '')} style={{ transform: at(r.center[0], r.center[1]) }} onClick={() => actions.selectRegion(r.id)} aria-label={r.name}>
                <span className="eth-dots">{gs.map(g => {
                  const hollow = s.year >= 1915 && g === 'armenian', c = content.groups[g].color;
                  return <i key={g} style={{ background: hollow ? 'none' : c, boxShadow: hollow ? `inset 0 0 0 1.4px ${c}` : undefined }} />;
                })}</span>
                <span className="eth-name">{nm.length > 15 ? nm.slice(0, 14) + '…' : nm}</span>
              </button>
            );
          })}
          {focusR && (
            <div className="focus" style={{ transform: at(focusR.center[0], focusR.center[1]) }}>
              <i className="ring pulse" /><i className="ring" /><i className="dot" /><i className="stem" />
              <em className={map.project(focusR.center as [number, number]).x > map.getContainer().clientWidth * 0.62 ? 'left' : ''}>
                {focusLabel && focusLabel.length > 46 ? focusLabel.slice(0, 45) + '…' : focusLabel}
              </em>
            </div>
          )}
        </div>
      )}
      {tip && <div className="tip" style={{ transform: `translate(${Math.min(innerWidth - 260, tip.x + 16)}px, ${tip.y + 16}px)` }}>{tip.html}</div>}
    </>
  );
}
