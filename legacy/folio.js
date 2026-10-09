/* The folio: a paper dossier for the current reign, a person, a region or an event. */
(()=>{const {$,state,esc}=A;
const src=(url,label='Kaynağı oku')=>`<a class="f-src" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}<i data-lucide="arrow-up-right"></i></a>`;
const plate=(kind,id,label,mono,cap)=>{const u=A.img[kind][id];return u?`<figure class="f-plate"><img src="${esc(u)}" alt="${esc(label)}"><figcaption>${cap||'Görsel · Wikimedia Commons'}</figcaption></figure>`:`<figure class="f-plate f-plate-mono"><span>${esc(mono)}</span></figure>`;};
const evRow=e=>`<button class="ev ${state.event===e.id?'on':''}" data-action="event" data-id="${e.id}"><span class="ev-y">${e.year}</span><span><span class="ev-t">${esc(e.title)}</span><span class="ev-k">${esc(e.type)}</span></span></button>`;
const evList=(evs,title)=>evs.length?`<section class="f-sec"><h3>${title}</h3>${evs.map(evRow).join('')}</section>`:'';
const people=ps=>ps.length?`<section class="f-sec"><h3>Dönemin insanları</h3><div class="f-people">${ps.map(p=>`<button class="f-person" data-action="person" data-id="${p.id}"><span class="f-av">${A.face('person',p.id,p.name,A.mono(p.name))}</span><span><b>${esc(p.name)}</b><i>${esc(p.role)} · ${p.focus}</i></span></button>`).join('')}</div></section>`:'';
function chart(s){const ys=sultanYears(s),a=ys[0],b=ys.at(-1),v=ys.map(y=>statsAt(A.regions,y,state.dependents).total),max=Math.max(1,...v);
  if(a===b)return '';const pts=ys.map((y,i)=>[(y-a)/(b-a)*300,58-v[i]/max*46]);let d='M'+pts[0].join(',');for(let i=1;i<pts.length;i++)d+='H'+pts[i][0].toFixed(1)+'V'+pts[i][1].toFixed(1);
  const cx=(A.clamp(state.year,a,b)-a)/(b-a)*300;
  return `<svg class="f-chart" viewBox="0 0 300 70" preserveAspectRatio="none" aria-label="Saltanat boyunca alan"><path d="${d}V60H0Z" class="fa"></path><path d="${d}" class="fl"></path><line x1="${cx}" x2="${cx}" y1="0" y2="60" class="fc-cur"></line></svg><div class="f-axis"><span>${a}</span><span>${b}</span></div>`;}
function sultanPanel(s){
  const ys=sultanYears(s),a=ys[0],b=ys.at(-1),ch=changesBetween(A.regions,a,b,state.dependents),g=ch.filter(c=>c.kind==='gain').length,l=ch.filter(c=>c.kind==='loss').length,pk=A.peak(s),yrs=A.reignYears(s);
  const evs=EVENTS.filter(e=>s.terms.some(([x,z])=>e.year>=x&&e.year<=Math.max(z,x)));
  const ps=PEOPLE.filter(p=>p.focus>=a&&p.focus<=Math.max(b,s.terms.at(-1)[1]));
  return {kicker:s.order+'. PADİŞAH · '+(state.scope===s.id?'SEÇİLİ SALTANAT':'TAHTTA'),html:`${plate('sultan',s.id,s.name,String(s.order),'Portre · Wikimedia Commons')}
  <h2 class="f-h">${esc(s.name)}</h2><div class="f-epi">${esc(s.title)}</div><div class="f-meta">${A.reign(s)}${s.terms.length>1?' · iki ayrı saltanat':''}</div>
  <p class="f-bio">${esc(s.bio)}</p>
  <div class="f-stats"><div><strong>${yrs||'93'}</strong><span>${yrs?'yıl tahtta':'gün tahtta'}</span></div><div><strong class="gain">+${g}</strong><span>bölgesel kazanım</span></div><div><strong class="loss">−${l}</strong><span>bölgesel kayıp</span></div></div>
  <div class="f-row">${state.scope===s.id?`<button class="btn btn-primary" data-action="period-play" data-id="${s.id}"><i data-lucide="play"></i>Saltanatı oynat</button><button class="btn btn-secondary" data-action="peak" data-id="${s.id}">En geniş an · ${pk.year}</button>`:`<button class="btn btn-primary" data-action="sultan" data-id="${s.id}"><i data-lucide="crown"></i>Bu saltanata odaklan</button><button class="btn btn-secondary" data-action="duel-with" data-id="${s.id}"><i data-lucide="swords"></i>Düelloya al</button>`}</div>
  <section class="f-sec"><h3>Saltanatın alan hareketi</h3>${chart(s)}<p class="f-note">En geniş modellenen görünüm ${pk.year}: ${A.area(pk.area)}. Çizilen hücrelerin yaklaşık alanı; arşiv yüzölçümü değildir.</p></section>
  ${evList(evs,'Saltanat kronolojisi')}${people(ps)}<div class="f-foot">${src(s.source,'TDV İslâm Ansiklopedisi maddesi')}</div>`};
}
function personPanel(p){const s=rulerAt(p.focus),evs=EVENTS.filter(e=>Math.abs(e.year-p.focus)<=15);
  return {kicker:'TARİHÎ KİŞİ · '+p.role.toLocaleUpperCase('tr'),html:`${plate('person',p.id,p.name,A.mono(p.name))}<h2 class="f-h">${esc(p.name)}</h2><div class="f-epi">${esc(p.role)}</div><div class="f-meta">${p.born}–${p.died} · harita odağı ${p.focus}</div><p class="f-bio">${esc(p.bio)}</p><p class="f-note">Harita işareti kişinin ilişkili olduğu bölgeyi gösterir; kesin doğum yeri veya seyahat rotası değildir.</p>${s?`<div class="f-row"><button class="btn btn-primary" data-action="sultan" data-id="${s.id}"><i data-lucide="crown"></i>${esc(s.name)} · ${A.reign(s)}</button></div>`:''}${evList(evs,'Tarihî bağlam')}<div class="f-foot">${src(p.source,'Biyografiyi oku')}</div>`};}
function ribbon(r){const segs=r.periods.map(([a,b,s])=>`<span class="sr ${s}" style="left:${A.pct(a)}%;width:${A.pct(Math.min(b,1922))-A.pct(a)}%" title="${a}–${Math.min(b,1922)} · ${STATUS_NAMES[s]}"></span>`).join('');
  return `<div class="f-sribbon">${segs}<span class="sr-now" style="left:${A.pct(state.year)}%"></span></div><div class="f-axis"><span>1299</span><span>1600</span><span>1922</span></div>`;}
function regionPanel(r){const s=statusAt(r,state.year),gs=groupsAt(r,state.year),evs=EVENTS.filter(e=>e.region===r.id);
  return {kicker:'BÖLGE DOSYASI · '+state.year,html:`<h2 class="f-h">${esc(r.name)}</h2><div class="f-pill ${s}">${STATUS_NAMES[s]}</div>
  <section class="f-sec"><h3>Altı yüzyılda yönetim</h3>${ribbon(r)}${r.periods.map(([a,b,st])=>`<div class="f-era"><time>${a}–${Math.min(b,1922)}</time><span>${STATUS_NAMES[st]}</span></div>`).join('')}</section>
  <p class="f-bio">${esc(r.hint||'Bölgesel hücre, kademeli fetih ve idarî değişimleri seçilmiş dönüm noktalarıyla özetler.')}</p><p class="f-note">Çizilen hücrenin alanı ${A.area(r.areaKm2)}. Tarihî eyaletin ölçülmüş yüzölçümü değildir.</p>
  <section class="f-sec"><h3>Dil ve kültür toplulukları</h3><div class="f-chips">${gs.map(id=>`<span class="f-chip"><i style="background:${GROUPS[id].color}"></i>${GROUPS[id].name}</span>`).join('')}</div><p class="f-note">Bölgesel tarihî varlık özeti; liste çoğunluk sırası veya nüfus oranı değildir. Dinî cemaat, dil ve etnik kimlik ayrı kavramlardır.</p></section>
  ${evList(evs,'Bu sahanın dönüm noktaları')}<div class="f-foot">${src(r.source,'Bölgenin tarihini oku')}</div>`};}
function eventPanel(e){const s=rulerAt(e.year),r=A.regionById(e.region),img=A.img.event[e.id];
  return {kicker:'DÖNÜM NOKTASI · '+e.type.toLocaleUpperCase('tr'),html:`${img?`<figure class="f-plate f-plate-wide"><img src="${esc(img)}" alt=""><figcaption>Temsilî görsel · Wikimedia Commons</figcaption></figure>`:''}<div class="f-bigyear">${e.year}</div><h2 class="f-h f-h-sm">${esc(e.title)}</h2><div class="f-meta">${r?esc(r.name):''}</div><p class="f-bio">${esc(e.text)}</p>${['Fetih','Kayıp'].includes(e.type)?`<p class="f-note">Harita “toprak hareketleri” merceğinde ${Math.max(1299,e.year-1)} ile ${e.year} farkını gösteriyor.</p>`:''}<div class="f-row">${s?`<button class="btn btn-secondary" data-action="sultan" data-id="${s.id}"><span class="f-mini">${A.face('sultan',s.id,s.name,String(s.order))}</span>${esc(s.name)}</button>`:''}${r?`<button class="btn btn-ghost" data-action="region" data-id="${r.id}">Bölge dosyası</button>`:''}</div><div class="f-foot">${src(e.source)}</div>`};}
function fetret(){return {kicker:'1402–1413',html:`<figure class="f-plate f-plate-mono"><span>·</span></figure><h2 class="f-h">Fetret Devri</h2><div class="f-epi">Bir taht, birden çok iddia</div><p class="f-bio">Ankara yenilgisinin ardından Bayezid’in oğulları arasında mücadele başladı. Haritadaki Rumeli ve çekirdek sahalar, hanedanın toplam varlığını temsil eder; tek bir hükümdarın birleşik denetimini göstermez.</p><div class="f-row"><button class="btn btn-primary" data-action="sultan" data-id="mehmed-i">Çelebi Mehmed ile devam et</button></div>${evList(EVENTS.filter(e=>e.year>=1397&&e.year<=1421),'Geçiş dönemi')}`};}
function ending(){return {kicker:'BİR DÖNEMİN SONU',html:`<div class="f-bigyear">1922</div><h2 class="f-h">Saltanatın kaldırılması</h2><div class="f-epi">1 Kasım 1922</div><p class="f-bio">Osmanlı saltanatı sona erdi. Haritada Ankara yönetimi ve devam eden yabancı işgal ayrı gösterilir. Alanın sıfıra inmesi, Anadolu’nun kaybolması anlamına gelmez.</p><div class="f-row"><button class="btn btn-primary" data-action="sultan" data-id="mehmed-vi">VI. Mehmed dönemine dön</button></div>${evList(EVENTS.filter(e=>e.year>=1918),'Son yıllar')}`};}
let key='';
function update(){
  const r=A.regionById(state.region),p=PEOPLE.find(x=>x.id===state.person),e=EVENTS.find(x=>x.id===state.event),s=A.activeSultan();
  const k=[r?.id,r?state.year:'',p?.id,e?.id,s?.id,state.scope,state.dependents,s&&!r&&!p&&!e&&state.scope===s?.id?Math.floor(state.year/2):'',state.year>=1922,state.year>=1402&&state.year<1413].join('|');
  if(k===key)return;key=k;
  const o=r?regionPanel(r):e?eventPanel(e):p?personPanel(p):s?sultanPanel(s):state.year>=1922?ending():fetret();
  $('folio-kicker').textContent=o.kicker;$('folio-back').hidden=!(r||p||e);
  const b=$('folio-body'),keep=(r||p||e)?0:b.scrollTop;b.innerHTML=o.html;b.scrollTop=keep;A.icons();
}
A.on(update);A.folioRefresh=()=>{key='';update();};
})();
