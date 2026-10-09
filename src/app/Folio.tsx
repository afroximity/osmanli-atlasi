/** The folio: a paper dossier for the current reign, a person, a region or an event. */
import { ArrowLeft, ArrowUpRight, Crown, Play, Swords, X } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { content, type AtlasEvent, type Person, type Region, type Ruler } from '../data/load';
import { useImages, type ImageKind } from '../data/images';
import { useAtlas, actions, activeSultan } from './store';
import { useData, regionById } from './context';
import { STATUS_NAMES, statusAt, groupsAt, yearsOf, changesBetween, peakOf, areaAt, areaText, reign, reignYears, rulerAt, pct, clamp, mono, type Status } from './model';
import { Face } from './ui/Face';

const Src = ({ url, label = 'Kaynağı oku' }: { url: string; label?: string }) =>
  <a className="f-src" href={url} target="_blank" rel="noopener noreferrer">{label}<ArrowUpRight size={12} /></a>;

function Plate({ kind, id, label, mono: m, cap, wide }: { kind: ImageKind; id: string; label: string; mono: string; cap?: string; wide?: boolean }) {
  const u = useImages(s => s[kind][id]);
  if (!u) return wide ? null : <figure className="f-plate f-plate-mono"><span>{m}</span></figure>;
  return <figure className={'f-plate' + (wide ? ' f-plate-wide' : '')}><img src={u} alt={label} /><figcaption>{cap || 'Görsel · Wikimedia Commons'}</figcaption></figure>;
}

function EvList({ evs, title }: { evs: AtlasEvent[]; title: string }) {
  const sel = useAtlas(s => s.event);
  if (!evs.length) return null;
  return (
    <section className="f-sec"><h3>{title}</h3>
      {evs.map(e => (
        <button key={e.id} className={'ev' + (sel === e.id ? ' on' : '')} onClick={() => actions.selectEvent(e.id)}>
          <span className="ev-y">{e.year}</span><span><span className="ev-t">{e.title}</span><span className="ev-k">{e.type}</span></span>
        </button>
      ))}
    </section>
  );
}

function People({ ps }: { ps: Person[] }) {
  if (!ps.length) return null;
  return (
    <section className="f-sec"><h3>Dönemin insanları</h3>
      <div className="f-people">{ps.map(p => (
        <button key={p.id} className="f-person" onClick={() => actions.selectPerson(p.id)}>
          <span className="f-av"><Face kind="person" id={p.id} label={p.name} mono={mono(p.name)} /></span>
          <span><b>{p.name}</b><i>{p.role} · {p.focus}</i></span>
        </button>
      ))}</div>
    </section>
  );
}

function ReignChart({ s }: { s: Ruler }) {
  const { territory } = useData();
  const year = useAtlas(x => x.year), dep = useAtlas(x => x.dependents);
  const ys = yearsOf(s), a = ys[0], b = ys.at(-1)!;
  if (a === b) return null;
  const v = ys.map(y => areaAt(territory, y, dep).total), max = Math.max(1, ...v);
  const pts = ys.map((y, i) => [((y - a) / (b - a)) * 300, 58 - (v[i] / max) * 46]);
  let d = 'M' + pts[0].join(',');
  for (let i = 1; i < pts.length; i++) d += 'H' + pts[i][0].toFixed(1) + 'V' + pts[i][1].toFixed(1);
  const cx = ((clamp(year, a, b) - a) / (b - a)) * 300;
  return <>
    <svg className="f-chart" viewBox="0 0 300 70" preserveAspectRatio="none" aria-label="Saltanat boyunca alan">
      <path d={d + 'V60H0Z'} className="fa" /><path d={d} className="fl" /><line x1={cx} x2={cx} y1="0" y2="60" className="fc-cur" />
    </svg>
    <div className="f-axis"><span>{a}</span><span>{b}</span></div>
  </>;
}

function SultanPanel({ s }: { s: Ruler }) {
  const { territory, regions } = useData();
  const scope = useAtlas(x => x.scope), dep = useAtlas(x => x.dependents);
  const ys = yearsOf(s), a = ys[0], b = ys.at(-1)!;
  const ch = changesBetween(regions, a, b, dep), g = ch.filter(c => c.kind === 'gain').length, l = ch.filter(c => c.kind === 'loss').length;
  const pk = peakOf(territory, s, dep), yrs = reignYears(s);
  const evs = content.events.filter(e => s.terms.some(([x, z]) => e.year >= x && e.year <= Math.max(z, x)));
  const ps = content.people.filter(p => p.focus >= a && p.focus <= Math.max(b, s.terms.at(-1)![1]));
  return <>
    <Plate kind="sultan" id={s.id} label={s.name} mono={String(s.order)} cap="Portre · Wikimedia Commons" />
    <h2 className="f-h">{s.name}</h2><div className="f-epi">{s.title}</div>
    <div className="f-meta">{reign(s)}{s.terms.length > 1 ? ' · iki ayrı saltanat' : ''}</div>
    <p className="f-bio">{s.bio}</p>
    <div className="f-stats">
      <div><strong>{yrs || '93'}</strong><span>{yrs ? 'yıl tahtta' : 'gün tahtta'}</span></div>
      <div><strong className="gain">+{g}</strong><span>bölgesel kazanım</span></div>
      <div><strong className="loss">−{l}</strong><span>bölgesel kayıp</span></div>
    </div>
    <div className="f-row">
      {scope === s.id ? <>
        <button className="btn btn-primary" onClick={() => actions.selectSultan(s.id, { play: true, peak: false })}><Play />Saltanatı oynat</button>
        <button className="btn btn-secondary" onClick={() => actions.selectSultan(s.id)}>En geniş an · {pk.year}</button>
      </> : <>
        <button className="btn btn-primary" onClick={() => actions.selectSultan(s.id)}><Crown />Bu saltanata odaklan</button>
        <button className="btn btn-secondary" onClick={() => actions.duelWith(s.id)}><Swords />Düelloya al</button>
      </>}
    </div>
    <section className="f-sec"><h3>Saltanatın alan hareketi</h3><ReignChart s={s} />
      <p className="f-note">En geniş görünüm {pk.year}: {areaText(pk.area)}. Cliopatria sınırlarının yaklaşık alanı; arşiv yüzölçümü değildir.</p></section>
    <EvList evs={evs} title="Saltanat kronolojisi" /><People ps={ps} />
    <div className="f-foot"><Src url={s.source} label="TDV İslâm Ansiklopedisi maddesi" /></div>
  </>;
}

function PersonPanel({ p }: { p: Person }) {
  const s = rulerAt(p.focus), evs = content.events.filter(e => Math.abs(e.year - p.focus) <= 15);
  return <>
    <Plate kind="person" id={p.id} label={p.name} mono={mono(p.name)} />
    <h2 className="f-h">{p.name}</h2><div className="f-epi">{p.role}</div>
    <div className="f-meta">{p.born}–{p.died} · harita odağı {p.focus}</div>
    <p className="f-bio">{p.bio}</p>
    <p className="f-note">Harita işareti kişinin ilişkili olduğu bölgeyi gösterir; kesin doğum yeri veya seyahat rotası değildir.</p>
    {s && <div className="f-row"><button className="btn btn-primary" onClick={() => actions.selectSultan(s.id)}><Crown />{s.name} · {reign(s)}</button></div>}
    <EvList evs={evs} title="Tarihî bağlam" />
    <div className="f-foot"><Src url={p.source} label="Biyografiyi oku" /></div>
  </>;
}

function RegionPanel({ r }: { r: Region }) {
  const year = useAtlas(x => x.year);
  const st = statusAt(r, year), gs = groupsAt(r, year), evs = content.events.filter(e => e.region === r.id);
  return <>
    <h2 className="f-h">{r.name}</h2><div className={'f-pill ' + st}>{STATUS_NAMES[st]}</div>
    <section className="f-sec"><h3>Altı yüzyılda yönetim</h3>
      <div className="f-sribbon">
        {r.periods.map(([a, b, s]) => <span key={a} className={'sr ' + s} style={{ left: pct(a) + '%', width: pct(Math.min(b, 1922)) - pct(a) + '%' }} title={`${a}–${Math.min(b, 1922)} · ${STATUS_NAMES[s as Status]}`} />)}
        <span className="sr-now" style={{ left: pct(year) + '%' }} />
      </div>
      <div className="f-axis"><span>1299</span><span>1600</span><span>1922</span></div>
      {r.periods.map(([a, b, s]) => <div key={a} className="f-era"><time>{a}–{Math.min(b, 1922)}</time><span>{STATUS_NAMES[s as Status]}</span></div>)}
    </section>
    <p className="f-bio">{r.hint || 'Bölgesel hücre, kademeli fetih ve idarî değişimleri seçilmiş dönüm noktalarıyla özetler.'}</p>
    <p className="f-note">Bölgenin alanı {areaText(r.areaKm2)}. Tarihî eyaletin ölçülmüş yüzölçümü değildir.</p>
    <section className="f-sec"><h3>Dil ve kültür toplulukları</h3>
      <div className="f-chips">{gs.map(id => <span key={id} className="f-chip"><i style={{ background: content.groups[id].color }} />{content.groups[id].name}</span>)}</div>
      <p className="f-note">Bölgesel tarihî varlık özeti; liste çoğunluk sırası veya nüfus oranı değildir. Dinî cemaat, dil ve etnik kimlik ayrı kavramlardır.</p>
    </section>
    <EvList evs={evs} title="Bu sahanın dönüm noktaları" />
    <div className="f-foot"><Src url={r.source} label="Bölgenin tarihini oku" /></div>
  </>;
}

function EventPanel({ e }: { e: AtlasEvent }) {
  const { regions } = useData();
  const s = rulerAt(e.year), r = regionById(regions, e.region);
  return <>
    <Plate kind="event" id={e.id} label={e.title} mono="" wide cap="Temsilî görsel · Wikimedia Commons" />
    <div className="f-bigyear">{e.year}</div><h2 className="f-h f-h-sm">{e.title}</h2><div className="f-meta">{r?.name}</div>
    <p className="f-bio">{e.text}</p>
    {['Fetih', 'Kayıp'].includes(e.type) && <p className="f-note">Harita “toprak hareketleri” merceğinde {Math.max(1299, e.year - 1)} ile {e.year} farkını gösteriyor.</p>}
    <div className="f-row">
      {s && <button className="btn btn-secondary" onClick={() => actions.selectSultan(s.id)}><span className="f-mini"><Face kind="sultan" id={s.id} label={s.name} mono={String(s.order)} /></span>{s.name}</button>}
      {r && <button className="btn btn-ghost" onClick={() => actions.selectRegion(r.id)}>Bölge dosyası</button>}
    </div>
    <div className="f-foot"><Src url={e.source} /></div>
  </>;
}

const Fetret = () => <>
  <figure className="f-plate f-plate-mono"><span>·</span></figure>
  <h2 className="f-h">Fetret Devri</h2><div className="f-epi">Bir taht, birden çok iddia</div>
  <p className="f-bio">Ankara yenilgisinin ardından Bayezid’in oğulları arasında mücadele başladı. Haritadaki topraklar hanedanın toplam varlığını temsil eder; tek bir hükümdarın birleşik denetimini göstermez.</p>
  <div className="f-row"><button className="btn btn-primary" onClick={() => actions.selectSultan('mehmed-i')}>Çelebi Mehmed ile devam et</button></div>
  <EvList evs={content.events.filter(e => e.year >= 1397 && e.year <= 1421)} title="Geçiş dönemi" />
</>;
const Ending = () => <>
  <div className="f-bigyear">1922</div><h2 className="f-h">Saltanatın kaldırılması</h2><div className="f-epi">1 Kasım 1922</div>
  <p className="f-bio">Osmanlı saltanatı sona erdi. Alanın sıfıra inmesi, Anadolu’nun kaybolması anlamına gelmez; Ankara’daki yeni siyasî düzen sahneye çıkıyor.</p>
  <div className="f-row"><button className="btn btn-primary" onClick={() => actions.selectSultan('mehmed-vi')}>VI. Mehmed dönemine dön</button></div>
  <EvList evs={content.events.filter(e => e.year >= 1918)} title="Son yıllar" />
</>;

export function Folio() {
  const { regions } = useData();
  const st = useAtlas();
  const body = useRef<HTMLDivElement>(null);
  const r = regionById(regions, st.region), p = content.people.find(x => x.id === st.person), e = content.events.find(x => x.id === st.event), s = activeSultan(st);
  let kicker: string, html: ReactNode;
  if (r) { kicker = 'BÖLGE DOSYASI · ' + st.year; html = <RegionPanel r={r} />; }
  else if (e) { kicker = 'DÖNÜM NOKTASI · ' + e.type.toLocaleUpperCase('tr'); html = <EventPanel e={e} />; }
  else if (p) { kicker = 'TARİHÎ KİŞİ · ' + p.role.toLocaleUpperCase('tr'); html = <PersonPanel p={p} />; }
  else if (s) { kicker = s.order + '. PADİŞAH · ' + (st.scope === s.id ? 'SEÇİLİ SALTANAT' : 'TAHTTA'); html = <SultanPanel s={s} />; }
  else if (st.year >= 1922) { kicker = 'BİR DÖNEMİN SONU'; html = <Ending />; }
  else { kicker = '1402–1413'; html = <Fetret />; }
  const key = r?.id || e?.id || p?.id || s?.id || String(st.year >= 1922);
  return (
    <aside className="folio" aria-label="Dosya">
      <div className="folio-bar">
        {(r || p || e) && <button className="f-back" onClick={actions.closeDetail} aria-label="Dönem dosyasına dön"><ArrowLeft size={16} strokeWidth={1.5} /></button>}
        <span className="kicker">{kicker}</span>
        <button className="f-close" onClick={() => actions.toggleFolio(false)} aria-label="Dosyayı kapat"><X size={16} strokeWidth={1.5} /></button>
      </div>
      <div className="folio-body" ref={body} key={key}>{html}</div>
    </aside>
  );
}
