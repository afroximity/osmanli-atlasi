/* The stage: map, camera, screen-space labels, title card, lens panel, legend. */
(()=>{const {$,state,esc}=A;
const svg=$('map'),world=$('world'),scr=$('screen'),NS='http://www.w3.org/2000/svg';
const cam=A.cam={k:1,tx:0,ty:0};let W=1,H=1,anim=null;
const BB=(()=>{let b=[1e9,1e9,-1e9,-1e9];for(const r of A.regions){const q=r.bounds;b=[Math.min(b[0],q[0]),Math.min(b[1],q[1]),Math.max(b[2],q[2]),Math.max(b[3],q[3])];}return b;})();
const el=(tag,attrs={},parent)=>{const n=document.createElementNS(NS,tag);for(const k in attrs)n.setAttribute(k,attrs[k]);parent&&parent.appendChild(n);return n;};

A.free=()=>{const dock=$('dock').offsetHeight,fol=state.folio?$('folio').offsetWidth:0,top=$('topbar').offsetHeight;return{x:24,y:top+20,w:W-fol-48,h:H-top-dock-40};};
A.fitCam=()=>{const f=A.free(),bw=BB[2]-BB[0],bh=BB[3]-BB[1],k=Math.min(f.w/bw,f.h/bh)*.98;return{k,tx:f.x+f.w/2-(BB[0]+BB[2])/2*k,ty:f.y+f.h/2-(BB[1]+BB[3])/2*k+10};};
A.fitK=()=>A.fitCam().k;
A.camAt=(x,y,k)=>{const f=A.free();return{k,tx:f.x+f.w/2-x*k,ty:f.y+f.h/2-y*k};};
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
A.flyTo=(to,dur=1100)=>{const from={...cam},t0=performance.now();anim={from,to,t0,dur};requestAnimationFrame(step);};
function step(t){if(!anim)return;const p=Math.min(1,(t-anim.t0)/anim.dur),e=ease(p),{from,to}=anim;
  const lk=Math.log(from.k)+(Math.log(to.k)-Math.log(from.k))*e;cam.k=Math.exp(lk);
  // keep the screen-center path smooth while zoom changes geometrically
  const fc=[(W/2-from.tx)/from.k,(H/2-from.ty)/from.k],tc=[(W/2-to.tx)/to.k,(H/2-to.ty)/to.k],c=[fc[0]+(tc[0]-fc[0])*e,fc[1]+(tc[1]-fc[1])*e];
  cam.tx=W/2-c[0]*cam.k;cam.ty=H/2-c[1]*cam.k;apply();if(p<1)requestAnimationFrame(step);else anim=null;}
A.stopFly=()=>{anim=null;};
A.fit=(dur=1000)=>A.flyTo(A.fitCam(),dur);
A.focusRegion=(id,mult=2.1,dur=1200)=>{const r=A.regionById(id);if(!r)return;const b=r.bounds,size=Math.max(b[2]-b[0],b[3]-b[1]),fk=A.fitK(),k=A.clamp(Math.min(fk*mult,(A.free().h*.45)/Math.max(size,30)),fk*1.2,fk*5);A.flyTo(A.camAt(r.center[0],r.center[1],k),dur);};
A.setCam=c=>{Object.assign(cam,c);apply();};

function resize(){W=svg.clientWidth||innerWidth;H=svg.clientHeight||innerHeight;svg.setAttribute('viewBox',`0 0 ${W} ${H}`);}

/* ---------- build ---------- */
const labels=[];let cityNodes=[],focusNode,ethG,tipEl=$('tip');
function build(){
  resize();
  const g=$('graticule');let d='';for(let lon=-10;lon<=60;lon+=10){const x=(lon+12)*16.5;d+=`M${x},${A.project(0,56)[1]}V${A.project(0,8)[1]}`;}for(let lat=10;lat<=55;lat+=10){const y=A.project(0,lat)[1];d+=`M${A.project(-14,0)[0]},${y}H${A.project(63,0)[0]}`;}el('path',{d,class:'grat'},g);
  $('land').setAttribute('d',GEO.land);
  $('regions').innerHTML=A.regions.map(r=>`<path id="rg-${r.id}" d="${r.path}" class="rg none" data-action="region" data-id="${r.id}" tabindex="-1"></path>`).join('');
  for(const [t,lon,lat,ang] of [['Karadeniz',34,43.4,0],['Akdeniz',18,35.2,0],['Kızıldeniz',37.4,21.8,-58],['Hazar',51,41.5,-80],['Basra Körfezi',51.2,26.9,-36],['Adriyatik',15.6,43,-38],['Ege',25.1,38.6,-70]]){const [x,y]=A.project(lon,lat);const n=el('text',{class:'lbl-sea'},scr);n.textContent=t;labels.push({n,x,y,ang});}
  for(const [t,lon,lat] of [['ANADOLU',33.5,38.6],['RUMELİ',23.2,43.2],['MAĞRİB',6,30.6],['ARABİSTAN',46,22],['İRAN',54,32.5],['MISIR',29,25.2],['AVRUPA',10,48.5]]){const [x,y]=A.project(lon,lat);const n=el('text',{class:'lbl-land'},scr);n.textContent=t;labels.push({n,x,y,ang:0});}
  const cities=[['İstanbul',28.98,41.01,'istanbul',1],['Edirne',26.56,41.67,'thrace',2],['Bursa',29.06,40.18,'bursa',2],['Selânik',22.94,40.64,'thessaloniki',2],['Budin',19.05,47.5,'hungary',1],['Belgrad',20.45,44.79,'belgrade',2],['Şam',36.3,33.51,'syria',1],['Bağdat',44.37,33.31,'iraq',1],['Kahire',31.24,30.04,'egypt',1],['Mekke',39.82,21.42,'hejaz',1],['Trablus',13.19,32.88,'tripoli',1],['Cezayir',3.06,36.75,'algeria',1],['Tebriz',46.29,38.08,'azerbaijan',2],['Kefe',35.38,45.03,'crimea',2]];
  cityNodes=cities.map(([name,lon,lat,id,tier])=>{const [x,y]=A.project(lon,lat);const g=el('g',{class:'city'},scr);el('circle',{r:3.2},g);const t=el('text',{x:7,y:-6},g);t.textContent=name;return{g,t,x,y,id,tier,name};});
  ethG=el('g',{id:'eth'},scr);
  focusNode=el('g',{class:'focus'},scr);
  Object.assign(cam,A.fitCam());apply();
}
function apply(){
  world.setAttribute('transform',`translate(${cam.tx},${cam.ty}) scale(${cam.k})`);
  const fk=A.fitK?A.fitK():1,zoomed=cam.k/fk;
  for(const l of labels){l.n.setAttribute('transform',`translate(${l.x*cam.k+cam.tx},${l.y*cam.k+cam.ty}) rotate(${l.ang})`);}
  for(const c of cityNodes){c.g.setAttribute('transform',`translate(${c.x*cam.k+cam.tx},${c.y*cam.k+cam.ty})`);c.g.style.display=(c.tier===2&&zoomed<1.6)||(state.mode==='ethnicity'&&c.tier===2)?'none':'';}
  ethG.classList.toggle('compact',zoomed<1.45);for(const n of ethG.children){n.setAttribute('transform',`translate(${n.dataset.x*cam.k+cam.tx},${n.dataset.y*cam.k+cam.ty})`);}
  const f=focusNode.dataset;if(f.x)focusNode.setAttribute('transform',`translate(${f.x*cam.k+cam.tx},${f.y*cam.k+cam.ty})`);
}
A.applyCam=apply;

/* ---------- per-render ---------- */
let lastSultan=null;
function update(){
  const y=state.year,changes=changesBetween(A.regions,A.baseline(),y,state.dependents),stats=statsAt(A.regions,y,state.dependents);
  for(const c of changes){const r=c.region,n=$('rg-'+r.id),s=c.after;let cls=s;
    if(!state.dependents&&(s==='vassal'||s==='autonomy'))cls='none';
    if(state.mode==='movement')cls=c.kind==='stable'?(isOttoman(s,state.dependents)?'stable':(s==='none'?'none':s)):c.kind;
    if(state.mode==='ethnicity'&&isOttoman(s,state.dependents))cls='ethnic';
    n.setAttribute('class','rg '+cls+(state.region===r.id?' sel':''));n.setAttribute('tabindex',cls==='none'?'-1':'0');n.setAttribute('aria-label',r.name+', '+STATUS_NAMES[s]);}
  for(const c of cityNodes){const r=A.regionById(c.id),on=r&&isOttoman(statusAt(r,y),state.dependents);c.g.setAttribute('class','city'+(on?'':' off'));c.t.textContent=c.name==='İstanbul'&&y<1453?'Konstantiniyye':c.name;}
  // title card
  const s=A.activeSultan(),era=A.eraAt(y);
  $('tc-year').textContent=y;
  $('tc-kicker').textContent=y>=1402&&y<1413&&!s?'Fetret · 1402–1413':s?s.order+'. padişah · '+A.reign(s):y>=1922?'Saltanatın sonu':'';$('tc-era').textContent=era.name;
  $('tc-name').textContent=s?s.name:y>=1922?'1 Kasım 1922':'Fetret Devri';$('tc-epithet').textContent=s?s.title:y>=1922?'saltanatın kaldırılması':'bir taht, birden çok iddia';
  const sid=s?.id||'none';if(sid!==lastSultan){lastSultan=sid;$('tc-face').innerHTML=s?A.face('sultan',s.id,s.name,String(s.order)):'<span class="face face-mono">·</span>';$('tc-face').dataset.id=s?.id||'';$('tc-face').classList.remove('swap');void $('tc-face').offsetWidth;$('tc-face').classList.add('swap');}
  // lens + metric
  document.querySelectorAll('[data-action="mode"]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.mode===state.mode));
  const [num,unit]=A.areaParts(stats.total);$('m-num').textContent=num;$('m-unit').textContent=unit;
  $('m-break').textContent='merkez '+A.smallArea(stats.direct)+(state.dependents?' · bağlı/özerk '+A.smallArea(stats.vassal+stats.autonomy):'');
  $('dep').checked=state.dependents;$('groups').hidden=state.mode!=='ethnicity';document.getElementById('app').dataset.mode=state.mode;
  // legend + note
  let lg;if(state.mode==='movement')lg=[['gain','Kazanım'],['loss','Kayıp'],['authority','Yönetim değişimi'],['stable','Devam eden saha']];
  else if(state.mode==='ethnicity')lg=[['ethnic','Osmanlı egemenlik sahası'],['occupied','İşgal / nominal']];
  else lg=[['direct','Doğrudan'],...(state.dependents?[['vassal','Bağlı'],['autonomy','Özerk']]:[]),['occupied','İşgal']];
  if(y>=1920)lg.push(['national','Ankara']);
  $('legend').innerHTML=lg.map(([c,n])=>`<span class="lg"><i class="sw ${c}"></i>${n}</span>`).join('');
  const gain=changes.filter(c=>c.kind==='gain').length,loss=changes.filter(c=>c.kind==='loss').length;
  $('note').innerHTML=state.mode==='movement'?`<b>${A.baseline()} → ${y}</b> · ${gain} bölgesel kazanım, ${loss} kayıp`:state.mode==='ethnicity'?(y>=1915?`<b>${y}: demografik kırılma</b> · İçi boş Ermeni noktaları tarihî varlığı gösterir; soykırım ve zorunlu göç sonrası dağılım yeniden kurulmaz.`:`<b>${y} bağlamı</b> · Bölgesel varlık özeti; yüzdeler ve homojen alanlar çizilmez.`):y>=1920?'İstanbul ve Ankara’nın fiilî yönetimi ayrı gösterilir. İşgal sahaları alan toplamına dahil değildir.':`<b>${stats.regions} tarihî saha</b> · sınırlar yaklaşık, fetihler dönüm noktalarında değişir`;
  drawEthnic();drawFocus();apply();
}
let ethKey='';
function drawEthnic(){
  const key=state.mode==='ethnicity'?[state.year,state.dependents,[...state.groups].join()].join('|'):'off';if(key===ethKey)return;ethKey=key;
  if(state.mode!=='ethnicity'){ethG.innerHTML='';return;}
  const disp=A.regions.filter(r=>r.areaKm2>17000&&isOttoman(statusAt(r,state.year),state.dependents));
  ethG.innerHTML=disp.map(r=>{const gs=groupsAt(r,state.year).filter(g=>state.groups.has(g));if(!gs.length)return '';const w=Math.max(64,gs.length*11+16),nm=r.name.split('–')[0].replace(' çevresi','').replace(' sahası','');
    return `<g class="eth" data-x="${r.center[0]}" data-y="${r.center[1]}" data-action="region" data-id="${r.id}" role="button" tabindex="0" aria-label="${esc(r.name)}"><rect x="${-w/2}" y="-19" width="${w}" height="34" rx="2"></rect>${gs.map((g,i)=>{const hollow=state.year>=1915&&g==='armenian';return `<circle cx="${(i-(gs.length-1)/2)*11}" cy="-8" r="3.8" fill="${hollow?'none':GROUPS[g].color}" stroke="${GROUPS[g].color}" stroke-width="${hollow?1.4:0}"></circle>`;}).join('')}<text y="9" text-anchor="middle">${esc(nm.length>15?nm.slice(0,14)+'…':nm)}</text></g>`;}).join('');
}
A.drawGroups=()=>{$('groups').innerHTML=`<div class="grp-head"><span>Dil ve kültür toplulukları</span><button data-action="groups-reset">Tümü</button></div><div class="grp-list">${Object.entries(GROUPS).map(([id,g])=>`<label class="grp"><input type="checkbox" data-group="${id}" ${state.groups.has(id)?'checked':''}><i style="background:${g.color}"></i>${g.name}</label>`).join('')}</div>`;};
function drawFocus(){
  const p=PEOPLE.find(p=>p.id===state.person),e=EVENTS.find(e=>e.id===state.event),r=A.regionById(state.region||p?.region||e?.region);
  if(!r){focusNode.innerHTML='';delete focusNode.dataset.x;return;}
  const label=p?p.name:e?e.year+' · '+e.title:r.name,[x,y]=r.center,right=x*cam.k+cam.tx>W*.62;
  focusNode.dataset.x=x;focusNode.dataset.y=y;
  focusNode.innerHTML=`<circle class="ring pulse" r="16"></circle><circle class="ring" r="9"></circle><circle class="dot" r="3"></circle><line x1="0" y1="-9" x2="0" y2="-34" class="stem"></line><text x="${right?-8:8}" y="-38" text-anchor="${right?'end':'start'}">${esc(label.length>46?label.slice(0,45)+'…':label)}</text>`;
}

/* ---------- interaction ---------- */
let drag=null;A.dragged=false;
svg.addEventListener('pointerdown',e=>{if(e.button!==0)return;A.stopFly();drag={id:e.pointerId,x:e.clientX,y:e.clientY,tx:cam.tx,ty:cam.ty};A.dragged=false;});
svg.addEventListener('pointermove',e=>{
  if(drag&&drag.id===e.pointerId){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!A.dragged&&Math.abs(dx)+Math.abs(dy)>5){A.dragged=true;svg.classList.add('dragging');svg.setPointerCapture?.(e.pointerId);}if(A.dragged){cam.tx=drag.tx+dx;cam.ty=drag.ty+dy;apply();tipEl.hidden=true;}return;}
  const n=e.target.closest('[data-id]'),r=n&&A.regionById(n.dataset.id);if(!r){tipEl.hidden=true;return;}
  const s=statusAt(r,state.year);tipEl.innerHTML=`<b>${esc(r.name)}</b><span>${state.year} · ${STATUS_NAMES[s]}</span>`;tipEl.hidden=false;
  tipEl.style.transform=`translate(${Math.min(innerWidth-260,e.clientX+16)}px,${e.clientY+16}px)`;
});
const end=()=>{drag=null;svg.classList.remove('dragging');setTimeout(()=>{A.dragged=false;},0);};
svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);svg.addEventListener('pointerleave',()=>{tipEl.hidden=true;});
A.zoomBy=(f,cx=W/2,cy=H/2)=>{A.stopFly();const fk=A.fitK(),k=A.clamp(cam.k*f,fk*.7,fk*8),r=k/cam.k;cam.tx=cx-(cx-cam.tx)*r;cam.ty=cy-(cy-cam.ty)*r;cam.k=k;apply();};
svg.addEventListener('wheel',e=>{e.preventDefault();const b=svg.getBoundingClientRect();A.zoomBy(Math.exp(-e.deltaY*.0015),e.clientX-b.left,e.clientY-b.top);},{passive:false});
addEventListener('resize',()=>{const before=A.fitK();resize();const after=A.fitCam();if(Math.abs(cam.k-before)<1e-3)Object.assign(cam,after);apply();});

build();A.on(update);
})();
