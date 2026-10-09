/** Overlays: Silsile (36 reigns), Kişiler (40 lifelines), Düello (two reigns side by side), info dialogs. */
import { ArrowLeft, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { content, type Ruler } from '../data/load';
import { useAtlas, actions } from './store';
import { useData } from './context';
import { yearsOf, peakOf, areaAt, changesBetween, eraAt, reign, reignYears, smallArea, areaText, mono } from './model';
import { Face } from './ui/Face';

const Back = () => <button className="btn btn-ghost-d" onClick={() => actions.setView('stage')}><ArrowLeft size={16} strokeWidth={1.5} />Sahneye dön</button>;
const go = (id: string) => { actions.setView('stage'); actions.selectSultan(id); actions.toggleFolio(true); };

/* ---------- Silsile ---------- */
function Silsile() {
  const { territory } = useData();
  const dep = useAtlas(s => s.dependents);
  const gmax = Math.max(...content.rulers.map(s => peakOf(territory, s, dep).area));
  return (
    <div className="sil">
      {content.eras.map(era => {
        const ss = content.rulers.filter(s => eraAt(s.terms[0][0]) === era);
        if (!ss.length) return null;
        return (
          <section key={era.name} className="sil-era">
            <header><span className="kicker">{era.start}–{era.end}</span><h3>{era.name}</h3><span className="sil-count">{ss.length} padişah</span></header>
            <div className="sil-grid">
              {ss.map(s => {
                const pk = peakOf(territory, s, dep);
                return (
                  <button key={s.id} className="sc" onClick={() => go(s.id)}>
                    <span className="sc-face"><Face kind="sultan" id={s.id} label={s.name} mono={String(s.order)} /><em className="sc-n">{s.order}</em></span>
                    <span className="sc-name">{s.name}</span><span className="sc-epi">{s.title}</span><span className="sc-r">{reign(s)}</span>
                    <span className="sc-bar" title={`En geniş alan ${areaText(pk.area)}`}><i style={{ width: (pk.area / gmax * 100).toFixed(1) + '%' }} /></span>
                    <span className="sc-area">{smallArea(pk.area)} km² · {pk.year}</span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ---------- Kişiler ---------- */
const ROLES = ['Devlet', 'Hanedan', 'Askerî', 'Denizcilik', 'Bilim', 'Sanat', 'Kültür', 'Düşünce', 'Dış aktör'];
const L0 = 1240, L1 = 1970;
function Kisiler() {
  const host = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);
  useLayoutEffect(() => {
    const measure = () => { const h = host.current!, cs = getComputedStyle(h); setW(Math.max(600, h.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 170)); };
    measure(); addEventListener('resize', measure); return () => removeEventListener('resize', measure);
  }, []);
  const ppy = w / (L1 - L0), X = (y: number) => (y - L0) * ppy;
  return (
    <div className="lf" ref={host}>
      <div className="lf-chart" style={{ ['--w' as string]: w + 'px' }}>
        <div className="lf-head"><div className="lf-role"><b className="kicker">Saltanatlar</b></div>
          <div className="lf-reigns">{content.rulers.flatMap(s => s.terms.map(([a, b], k) => {
            const ww = X(Math.max(b, a + 1)) - X(a);
            return <span key={s.id + k} className="lf-reign" style={{ left: X(a), width: Math.max(1, ww) }} onClick={() => go(s.id)} title={`${s.name} · ${reign(s)}`}>{ww > 26 && <Face kind="sultan" id={s.id} label={s.name} />}</span>;
          }))}</div>
        </div>
        <div className="lf-grids" style={{ left: 170, width: w }}>{[1300, 1400, 1500, 1600, 1700, 1800, 1900].map(c => <span key={c} className="lf-grid" style={{ left: X(c) }}><em>{c}</em></span>)}</div>
        {ROLES.map(role => {
          const ps = content.people.filter(p => p.role === role).sort((a, b) => a.born - b.born);
          const lanes: number[] = [];
          const items = ps.map(p => {
            const lw = p.name.length * 7.4 + 70, flip = X(p.focus) + 22 + lw > w;
            const start = flip ? Math.min(X(p.born), X(p.focus) - 22 - lw) : X(p.born), end = (flip ? X(p.died) : Math.max(X(p.died), X(p.focus) + 22 + lw)) + 14;
            let li = lanes.findIndex(e => e < start); if (li < 0) { li = lanes.length; lanes.push(0); } lanes[li] = end;
            return (
              <button key={p.id} className="lf-p" onClick={() => { actions.setView('stage'); actions.selectPerson(p.id); }} style={{ left: X(p.born), width: X(p.died) - X(p.born), top: li * 46 }}>
                <span className="lf-bar" />
                <span className="lf-face" style={{ left: X(p.focus) - X(p.born) }}><Face kind="person" id={p.id} label={p.name} mono={mono(p.name)} /></span>
                <span className={'lf-name' + (flip ? ' flip' : '')} style={{ left: X(p.focus) - X(p.born) + (flip ? -22 : 22) }}><b>{p.name}</b><i>{p.born}–{p.died}</i></span>
              </button>
            );
          });
          return <div key={role} className="lf-row"><div className="lf-role"><span>{role}</span><em>{ps.length}</em></div><div className="lf-lanes" style={{ height: Math.max(1, lanes.length) * 46 + 8 }}>{items}</div></div>;
        })}
      </div>
    </div>
  );
}

/* ---------- Düello ---------- */
function Duello() {
  const { territory, regions } = useData();
  const duel = useAtlas(s => s.duel), dep = useAtlas(s => s.dependents);
  const metrics = (s: Ruler) => {
    const ys = yearsOf(s), a = ys[0], b = ys.at(-1)!, ch = changesBetween(regions, a, b, dep), pk = peakOf(territory, s, dep);
    return {
      years: reignYears(s), peak: pk.area, gain: ch.filter(c => c.kind === 'gain').length, loss: ch.filter(c => c.kind === 'loss').length,
      events: content.events.filter(e => s.terms.some(([x, z]) => e.year >= x && e.year <= Math.max(z, x))).length,
      people: content.people.filter(p => p.focus >= a && p.focus <= Math.max(b, s.terms.at(-1)![1])).length,
      series: ys.map(y => areaAt(territory, y, dep).total),
    };
  };
  const sa = content.rulers.find(s => s.id === duel.a)!, sb = content.rulers.find(s => s.id === duel.b)!, ma = metrics(sa), mb = metrics(sb);
  const Side = ({ s, k }: { s: Ruler; k: 'a' | 'b' }) => (
    <div className={'du-side du-' + k}>
      <span className="du-face"><Face kind="sultan" id={s.id} label={s.name} mono={String(s.order)} /></span>
      <label className="du-pick"><span className="kicker">{k === 'a' ? 'Sol köşe' : 'Sağ köşe'}</span>
        <select value={s.id} onChange={e => actions.setDuel(k, e.target.value)}>{content.rulers.map(r => <option key={r.id} value={r.id}>{r.order}. {r.name} · {r.title}</option>)}</select>
      </label>
      <h3>{s.name}</h3><em>{s.title}</em><span className="du-reign">{reign(s)}</span>
      <button className="btn btn-ghost" onClick={() => go(s.id)}>Sahnede aç</button>
    </div>
  );
  const Row = ({ label, va, vb, f }: { label: string; va: number; vb: number; f: (x: number) => string }) => {
    const mx = Math.max(va, vb, 1e-9);
    return <div className="du-row"><span className={'du-v a' + (va > vb ? ' win' : '')}>{f(va)}</span><span className="du-l">{label}</span><span className={'du-v b' + (vb > va ? ' win' : '')}>{f(vb)}</span>
      <span className="du-bar a"><i style={{ width: va / mx * 100 + '%' }} /></span><span /><span className="du-bar b"><i style={{ width: vb / mx * 100 + '%' }} /></span></div>;
  };
  const n = (x: number) => String(x);
  const line = (ser: number[], cls: string) => {
    const max = Math.max(ma.peak, mb.peak, 1);
    if (ser.length < 2) return <circle cx="150" cy={110 - ser[0] / max * 96} r="3" className={cls} />;
    return <path className={cls} d={ser.map((v, i) => `${i ? 'L' : 'M'}${(i / (ser.length - 1) * 300).toFixed(1)},${(110 - v / max * 96).toFixed(1)}`).join('')} />;
  };
  return (
    <div className="du">
      <Side s={sa} k="a" />
      <div className="du-mid"><div className="du-vs">karşı</div>
        <Row label="Saltanat" va={ma.years} vb={mb.years} f={x => (x ? x + ' yıl' : '93 gün')} />
        <Row label="En geniş alan" va={ma.peak} vb={mb.peak} f={smallArea} />
        <Row label="Bölgesel kazanım" va={ma.gain} vb={mb.gain} f={n} />
        <Row label="Bölgesel kayıp" va={ma.loss} vb={mb.loss} f={n} />
        <Row label="Dönüm noktası" va={ma.events} vb={mb.events} f={n} />
        <Row label="Dönemin kişileri" va={ma.people} vb={mb.people} f={n} />
        <figure className="du-chart">
          <svg viewBox="0 0 300 116" preserveAspectRatio="none">{[0, 1, 2, 3].map(i => <line key={i} x1="0" x2="300" y1={14 + i * 32} y2={14 + i * 32} className="du-g" />)}{line(ma.series, 'du-la')}{line(mb.series, 'du-lb')}</svg>
          <figcaption><span>saltanatın başı</span><span>Alan, saltanat süresine göre normalize</span><span>sonu</span></figcaption>
        </figure>
        <p className="du-note">Karşılaştırma yaklaşık sınırlara dayanır; bir padişahın “başarısını” ölçmez, haritadaki net değişimi gösterir.</p>
      </div>
      <Side s={sb} k="b" />
    </div>
  );
}

export function Overlays() {
  const view = useAtlas(s => s.view);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelectorAll('.overlay').forEach(o => (o.scrollTop = 0)); }, [view]);
  return (
    <div ref={ref}>
      <section className="overlay" data-for="silsile" aria-label="Silsile">
        <header className="ov-head"><div><span className="kicker">Silsile · 1299–1922</span><h2 className="ov-title">Otuz altı padişah</h2><p className="ov-sub">Her saltanat, haritadaki en geniş anıyla birlikte. Bir portreye dokun, sahne o saltanata açılsın.</p></div><Back /></header>
        {view === 'silsile' && <Silsile />}
      </section>
      <section className="overlay" data-for="kisiler" aria-label="Kişiler">
        <header className="ov-head"><div><span className="kicker">Kişiler · 1250–1964</span><h2 className="ov-title">Kırk hayat, altı yüzyıl</h2><p className="ov-sub">Çizgi doğumdan ölüme uzanır; portre, haritanın o kişiye odaklandığı yılda durur. Üst şerit saltanatları gösterir.</p></div><Back /></header>
        {view === 'kisiler' && <Kisiler />}
      </section>
      <section className="overlay" data-for="duello" aria-label="Düello">
        <header className="ov-head"><div><span className="kicker">Düello</span><h2 className="ov-title">İki saltanat, yan yana</h2><p className="ov-sub">İki padişahı seç; süre, alan ve haritadaki net değişim karşılaştırılsın.</p></div><Back /></header>
        {view === 'duello' && <Duello />}
      </section>
    </div>
  );
}

/* ---------- info dialogs ---------- */
export function InfoDialog() {
  const { territory, regions } = useData();
  const info = useAtlas(s => s.info);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current!; if (info && !d.open) d.showModal(); if (!info && d.open) d.close(); }, [info]);
  return (
    <dialog className="info" ref={ref} aria-label="Bilgi" onClose={() => actions.openInfo(null)}>
      <button className="i-close" onClick={() => actions.openInfo(null)} aria-label="Kapat"><X size={16} strokeWidth={1.5} /></button>
      <div id="info-body">
        {info === 'sources' && <>
          <span className="kicker">Osmanlı Atlası</span><h2>Kaynaklar ve okuma yolları</h2>
          <div className="i-stats">
            <div><strong>{content.rulers.length}</strong><span>Padişah</span></div><div><strong>{content.people.length}</strong><span>Tarihî kişi</span></div>
            <div><strong>{content.events.length}</strong><span>Dönüm noktası</span></div><div><strong>{territory.polities.length}</strong><span>Devlet</span></div>
          </div>
          {content.sources.filter(s => s.name !== 'Natural Earth').map(s => <div key={s.url} className="i-src"><small>{s.name}</small><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a><p>{s.use}</p></div>)}
          <div className="i-src"><small>Seshat Global History Databank · CC BY 4.0</small><a href="https://github.com/Seshat-Global-History-Databank/cliopatria" target="_blank" rel="noopener noreferrer">Cliopatria — 3400 BCE–2024 CE devlet sınırları</a><p>Osmanlı ve komşularının yıl yıl sınırları. Atlas çerçevesine kırpıldı, 1:10m kıyıya oturtuldu, sadeleştirildi. Bağlılık ilişkileri bu atlasın editoryal katmanıdır.</p></div>
          <div className="i-src"><small>Harita altlığı</small><a href="https://www.naturalearthdata.com" target="_blank" rel="noopener noreferrer">Natural Earth 1:10m</a><p>Kıyılar, göller, nehirler, batimetri ve bölgelerin dayandığı birinci düzey idarî sınırlar. Kamu malı.</p></div>
          <div className="i-src"><small>Rölyef</small><a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener noreferrer">Terrain Tiles · Mapzen / AWS Open Data</a><p>Gölgeli rölyef bu yükseklik karolarından çalışma anında hesaplanır. Harita motoru: <a href="https://maplibre.org" target="_blank" rel="noopener noreferrer">MapLibre GL JS</a>.</p></div>
          <div className="i-src"><small>Wikimedia Commons</small><a href="https://commons.wikimedia.org" target="_blank" rel="noopener noreferrer">Portreler ve olay görselleri</a><p>Görseller, ilgili Wikipedia maddelerinin kapak görsellerinden çalışma anında yüklenir. Çoğu sonradan yapılmış temsilî portredir.</p></div>
          <p className="i-note">Metinler kısa editoryal özetlerdir. {regions.length} editoryal bölge anlatı birimidir; sınır çizmez.</p>
        </>}
        {info === 'guide' && <>
          <span className="kicker">Rehber</span><h2>Atlası nasıl okumalı?</h2>
          <p>Bir padişah seç, zaman şeridini sürükle veya <b>Oynat</b> ile saltanatı izle. Kamera açıkken oynatma büyük olaylarda haritayı o bölgeye taşır. Yeni topraklar eski sınırdan gelgit gibi yayılır; kaybedilenler kalan sınıra doğru çekilir.</p>
          <h3>Üç mercek</h3>
          <ul>
            <li><b>Siyasî sınırlar:</b> doğrudan yönetim, bağlı devletler (taralı), özerk yönetimler ve komşu devletler.</li>
            <li><b>Toprak hareketleri:</b> iki tarihin net farkı — altın kazanım, taralı kızıl kayıp. Bir fetih veya kayıp olayına tıklarsan önceki yıl ile olay yılı karşılaştırılır.</li>
            <li><b>Topluluklar:</b> dil ve kültür topluluklarının bölgesel varlığı. Noktalar nüfus oranı veya çoğunluk sırası değildir.</li>
          </ul>
          <h3>Çizgiler ve alan sayıları</h3>
          <p className="i-call">Sınırlar Seshat Cliopatria veri setinden gelir ve yaklaşıktır. Alan sayıları bu sınırların toplamıdır; Osmanlı arşivlerinden ölçülmüş yüzölçümleri değildir.</p>
          <h3>Klavye</h3>
          <div className="i-keys"><span><kbd>Boşluk</kbd> oynat / duraklat</span><span><kbd>←</kbd><kbd>→</kbd> yıl</span><span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> mercekler</span><span><kbd>F</kbd> dosya</span><span><kbd>Esc</kbd> sahneye dön</span></div>
        </>}
      </div>
    </dialog>
  );
}
