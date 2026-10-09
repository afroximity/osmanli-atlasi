/** Stage chrome around the map: top bar, title card, lens + metric, legend and note, zoom, event caption. */
import { BookOpen, Minus, Plus, Scan } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { content } from '../data/load';
import { useImages } from '../data/images';
import { useAtlas, actions, activeSultan, baselineOf, type Mode, type View } from './store';
import { useData } from './context';
import { camera } from './camera';
import { areaAt, areaParts, smallArea, eraAt, reign, regionCount, changesBetween } from './model';
import { Face } from './ui/Face';

export function Star({ className = 'star' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" /><rect x="5" y="5" width="14" height="14" transform="rotate(45 12 12)" /></svg>;
}

const VIEWS: [View, string][] = [['stage', 'Sahne'], ['silsile', 'Silsile'], ['kisiler', 'Kişiler'], ['duello', 'Düello']];

export function Topbar() {
  const view = useAtlas(s => s.view), folio = useAtlas(s => s.folio);
  return (
    <header className="topbar" id="topbar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); actions.setView('stage'); actions.allHistory(); }} aria-label="Osmanlı Atlası, başa dön">
        <Star /><span className="brand-name">Osmanlı Atlası</span><span className="brand-years">1299 — 1922</span>
      </a>
      <nav className="modes" aria-label="Görünüm">
        {VIEWS.map(([v, n]) => <button key={v} aria-pressed={view === v} onClick={() => actions.setView(v)}>{n}</button>)}
      </nav>
      <div className="top-actions">
        <button onClick={() => actions.openInfo('sources')}>Kaynaklar</button>
        <button onClick={() => actions.openInfo('guide')}>Rehber</button>
        <button className="icon-btn" aria-pressed={folio} onClick={() => actions.toggleFolio()} aria-label="Dosyayı aç veya kapat"><BookOpen size={16} strokeWidth={1.5} /></button>
      </div>
    </header>
  );
}

export function TitleCard() {
  const year = useAtlas(s => s.year);
  useAtlas(s => s.scope);
  const s = activeSultan(), era = eraAt(year);
  const fetret = year >= 1402 && year < 1413 && !s;
  const face = useRef<HTMLButtonElement>(null);
  useEffect(() => { const n = face.current; if (!n) return; n.classList.remove('swap'); void n.offsetWidth; n.classList.add('swap'); }, [s?.id]);
  return (
    <section className="titlecard" aria-live="polite">
      <button className="tc-face" ref={face} onClick={() => { if (s) { actions.closeDetail(); actions.toggleFolio(true); } }} aria-label="Tahttaki padişahın dosyası">
        {s ? <Face kind="sultan" id={s.id} label={s.name} mono={String(s.order)} /> : <span className="face face-mono">·</span>}
      </button>
      <div className="tc-text">
        <div className="kicker">{fetret ? 'Fetret · 1402–1413' : s ? `${s.order}. padişah · ${reign(s)}` : year >= 1922 ? 'Saltanatın sonu' : ''}</div>
        <div className="tc-year">{year}</div>
        <div className="tc-name"><span>{s ? s.name : year >= 1922 ? '1 Kasım 1922' : 'Fetret Devri'}</span><em>{s ? s.title : year >= 1922 ? 'saltanatın kaldırılması' : 'bir taht, birden çok iddia'}</em></div>
        <div className="tc-era">{era.name}</div>
      </div>
    </section>
  );
}

const MODES: [Mode, string][] = [['borders', 'Siyasî sınırlar'], ['movement', 'Toprak hareketleri'], ['ethnicity', 'Topluluklar']];

export function Lens() {
  const { territory } = useData();
  const mode = useAtlas(s => s.mode), year = useAtlas(s => s.year), dependents = useAtlas(s => s.dependents);
  const a = areaAt(territory, year, dependents), [num, unit] = areaParts(a.total);
  return (
    <section className="lens">
      <div className="seg-d" role="group" aria-label="Harita merceği">
        {MODES.map(([m, n]) => <button key={m} aria-pressed={mode === m} onClick={() => actions.setMode(m)}>{n}</button>)}
      </div>
      <div className="metric"><span className="metric-approx">≈</span><span className="metric-num">{num}</span><span className="metric-unit">{unit}</span></div>
      <div className="metric-label">Osmanlı ve bağlılarının alanı<br /><span>merkez {smallArea(a.direct)}{dependents ? ` · bağlı/özerk ${smallArea(a.dependent)}` : ''}</span></div>
      <label className="chk-d"><input type="checkbox" checked={dependents} onChange={e => actions.setDependents(e.target.checked)} /><span>Bağlı ve özerk bölgeler</span></label>
    </section>
  );
}

export function MapFoot() {
  const { regions } = useData();
  const s = useAtlas();
  const y = s.year, base = baselineOf(s);
  let lg: [string, string][];
  if (s.mode === 'movement') lg = [['gain', 'Kazanım'], ['loss', 'Kayıp'], ['stable', 'Devam eden saha']];
  else if (s.mode === 'ethnicity') lg = [['ethnic', 'Osmanlı egemenlik sahası']];
  else lg = [['direct', 'Doğrudan'], ...(s.dependents ? [['vassal', 'Bağlı'], ['autonomy', 'Özerk']] as [string, string][] : []), ['neighbour', 'Komşu devletler']];
  const ch = s.mode === 'movement' ? changesBetween(regions, base, y, s.dependents) : [];
  const gain = ch.filter(c => c.kind === 'gain').length, loss = ch.filter(c => c.kind === 'loss').length;
  return (
    <div className="mapfoot">
      {s.mode === 'ethnicity' && (
        <div className="groups">
          <div className="grp-head"><span>Dil ve kültür toplulukları</span><button onClick={actions.resetGroups}>Tümü</button></div>
          <div className="grp-list">
            {Object.entries(content.groups).map(([id, g]) => (
              <label key={id} className="grp"><input type="checkbox" checked={s.groups.has(id)} onChange={e => actions.toggleGroup(id, e.target.checked)} /><i style={{ background: g.color }} />{g.name}</label>
            ))}
          </div>
        </div>
      )}
      <div className="note">
        {s.mode === 'movement' ? <><b>{base} → {y}</b> · {gain} bölgesel kazanım, {loss} kayıp</>
          : s.mode === 'ethnicity' ? (y >= 1915
            ? <><b>{y}: demografik kırılma</b> · İçi boş Ermeni noktaları tarihî varlığı gösterir; soykırım ve zorunlu göç sonrası dağılım yeniden kurulmaz.</>
            : <><b>{y} bağlamı</b> · Bölgesel varlık özeti; yüzdeler ve homojen alanlar çizilmez.</>)
          : <><b>{regionCount(regions, y, s.dependents)} tarihî saha</b> · sınırlar Cliopatria’dan, yaklaşıktır</>}
      </div>
      <div className="legend">{lg.map(([c, n]) => <span key={c} className="lg"><i className={'sw ' + c} />{n}</span>)}</div>
    </div>
  );
}

export function Zoom() {
  return (
    <div className="zoom" role="group" aria-label="Harita görünümü">
      <button onClick={() => camera.zoomBy(1.35)} aria-label="Yakınlaştır"><Plus size={16} strokeWidth={1.5} /></button>
      <button onClick={() => camera.zoomBy(1 / 1.35)} aria-label="Uzaklaştır"><Minus size={16} strokeWidth={1.5} /></button>
      <button onClick={() => camera.fit()} aria-label="Tamamını göster"><Scan size={16} strokeWidth={1.5} /></button>
    </div>
  );
}

export function Caption() {
  const c = useAtlas(s => s.caption);
  const imgs = useImages(s => s.event);
  const e = c?.kind === 'event' ? content.events.find(x => x.id === c.id) : null;
  const img = e ? imgs[e.id] : null;
  return (
    <section className={'caption' + (c ? ' on' : '')} aria-live="polite" onClick={() => e && actions.selectEvent(e.id)}>
      {img && <span className="cap-img"><img src={img} alt="" /></span>}
      {c && (
        <span className="cap-text">
          <span className="kicker">{e ? `${e.year} · ${e.type}` : c.kind === 'hint' ? c.kicker : ''}</span>
          <b>{e ? e.title : c.kind === 'hint' ? c.title : ''}</b>
          <span className="cap-p">{e ? e.text : c.kind === 'hint' ? c.text : ''}</span>
        </span>
      )}
    </section>
  );
}
