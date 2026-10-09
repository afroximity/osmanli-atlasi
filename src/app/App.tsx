/** The atlas: data loading, contexts, the stage and its panels, keyboard. */
import { useEffect, useState } from 'react';
import { loadAtlas } from '../data/load';
import type { AtlasMap } from '../engine/AtlasMap';
import { DataContext, MapContext, type AtlasData } from './context';
import { useAtlas, actions, bindTerritory } from './store';
import { MapView } from './MapView';
import { Topbar, TitleCard, Lens, MapFoot, Zoom, Caption } from './Stage';
import { Folio } from './Folio';
import { Dock } from './Dock';
import { Overlays, InfoDialog } from './Overlays';
import { Prologue } from './Prologue';

export function App() {
  const [data, setData] = useState<AtlasData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [map, setMap] = useState<AtlasMap | null>(null);
  useEffect(() => { loadAtlas().then(d => { bindTerritory(d.territory); setData(d); }, e => setError(String(e))); }, []);
  const s = useAtlas();

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const st = useAtlas.getState();
      if (!document.body.classList.contains('entered') || st.info) return;
      if ((e.target as Element).closest('input,select,textarea,button,a')) return;
      if (e.key === 'Escape') { if (st.view !== 'stage') actions.setView('stage'); else actions.closeDetail(); return; }
      if (st.view !== 'stage') return;
      if (e.code === 'Space') { e.preventDefault(); actions.play(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); actions.setYear(st.year + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1)); }
      else if (['1', '2', '3'].includes(e.key)) actions.setMode((['borders', 'movement', 'ethnicity'] as const)[+e.key - 1]);
      else if (e.key === 'f' || e.key === 'F') actions.toggleFolio();
    };
    const hide = () => { if (document.hidden && useAtlas.getState().playing) actions.stop(); };
    addEventListener('keydown', key);
    document.addEventListener('visibilitychange', hide);
    return () => { removeEventListener('keydown', key); document.removeEventListener('visibilitychange', hide); };
  }, []);

  if (error) return <div className="splash">Veri yüklenemedi · {error}</div>;
  if (!data) return <div className="splash">Altı yüzyıl yükleniyor…</div>;
  return (
    <DataContext.Provider value={data}>
      <MapContext.Provider value={map}>
        <div className={'app' + (s.overture ? ' overture' : '')} data-view={s.view} data-folio={s.folio ? '1' : '0'} data-playing={s.playing ? '1' : '0'} data-mode={s.mode}>
          <MapView onMap={setMap} />
          <div className="vignette" aria-hidden="true" />
          <Topbar />
          <TitleCard />
          <Lens />
          <MapFoot />
          <Zoom />
          <Caption />
          <Folio />
          <Dock />
          <Overlays />
        </div>
        <InfoDialog />
        <Prologue />
      </MapContext.Provider>
    </DataContext.Provider>
  );
}
