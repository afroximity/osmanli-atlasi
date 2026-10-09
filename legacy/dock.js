/* The dock: area ribbon, event marks, the face strip of 36 reigns, era bands, playback + story camera. */
(()=>{const {$,state,esc,pct}=A;
const track=$('track'),rib=$('ribbon');
let ribKey='';
function buildRibbon(){
  const key=String(state.dependents);if(key===ribKey)return;ribKey=key;
  const tot=[];for(let y=1299;y<=1922;y++)tot.push(statsAt(A.regions,y,state.dependents).total);
  const max=Math.max(...tot),X=y=>(y-1299)/623*1000,Y=v=>52-v/max*40;
  let d='M0,'+Y(tot[0]);for(let i=1;i<tot.length;i++)d+='H'+X(1299+i).toFixed(2)+'V'+Y(tot[i]).toFixed(2);d+='H1000';
  let grid='';for(let c=1300;c<=1900;c+=100)grid+=`<line x1="${X(c)}" x2="${X(c)}" y1="0" y2="60" class="rb-grid"></line>`;
  rib.innerHTML=`${grid}<path d="${d}V60H0Z" class="rb-area"></path><path d="${d}" class="rb-line"></path>`;
  $('ticks').innerHTML=[1300,1400,1500,1600,1700,1800,1900].map(c=>`<span style="left:${pct(c)}%">${c}</span>`).join('');
}
function buildMarks(){
  const seen=new Set();
  $('marks').innerHTML=EVENTS.filter(e=>{if(seen.has(e.year))return false;seen.add(e.year);return true;}).map(e=>`<button class="mk ${e.type==='Fetih'?'fetih':e.type==='Kayıp'?'kayip':''}" style="left:${pct(e.year)}%" data-action="event" data-id="${e.id}" aria-label="${esc(e.year+' '+e.title)}" data-tip="${esc(e.year+' · '+e.title)}"></button>`).join('');
}
function buildFaces(){
  let h='';
  for(const s of SULTANS)for(const [a,b] of s.terms){const w=pct(Math.max(b,a+1))-pct(a);h+=`<button class="fc ${w<2.2?'narrow':''}" data-sid="${s.id}" data-action="sultan" data-id="${s.id}" style="left:${pct(a)}%;width:${w}%" aria-label="${esc(s.name+' '+A.reign(s))}">${A.face('sultan',s.id,s.name,'')}${w>=2.2?`<em>${s.order}</em>`:''}</button>`;}
  h+=`<span class="fc fetret" style="left:${pct(1402)}%;width:${pct(1413)-pct(1402)}%" title="Fetret Devri 1402–1413"></span>`;
  $('faces').innerHTML=h;
  $('eras').innerHTML=ERAS.map(e=>`<button class="era" data-action="year" data-year="${e.start}" style="left:${pct(e.start)}%;width:${pct(e.end)-pct(e.start)}%">${e.name}</button>`).join('');
}
A.buildDock=()=>{ribKey='';buildRibbon();buildMarks();buildFaces();};
let lastActive='';
function update(){
  buildRibbon();
  const y=state.year,s=A.activeSultan(),sel=A.selectedSultan();
  $('playhead').style.left=pct(y)+'%';$('ph-year').textContent=y;
  if(state.baseline!==null||state.mode==='movement'){$('basehead').hidden=false;$('basehead').style.left=pct(A.baseline())+'%';}else $('basehead').hidden=true;
  const id=s?.id||'';if(id!==lastActive){lastActive=id;document.querySelectorAll('.fc[data-sid]').forEach(n=>n.classList.toggle('on',n.dataset.sid===id));}
  document.querySelectorAll('.era').forEach(n=>n.classList.toggle('on',+n.dataset.year===A.eraAt(y).start));
  const [a,b]=A.bounds();$('dim-l').style.width=sel?pct(a)+'%':'0';$('dim-r').style.left=sel?pct(Math.max(b,a+1))+'%':'100%';
  $('scope-chip').innerHTML=sel?`<b>${esc(sel.name)}</b> · ${A.reign(sel)} <button data-action="all" aria-label="Tüm tarihe dön">Tüm tarih</button>`:'<b>Tüm Osmanlı tarihi</b> · 1299–1922';
  document.querySelectorAll('[data-action="speed"]').forEach(n=>n.setAttribute('aria-pressed',+n.dataset.speed===state.speed));
  $('cam').checked=state.camera;
  document.getElementById('app').dataset.playing=state.playing?'1':'0';
}
A.on(update);

/* scrub */
let scrub=null;
const yearAt=x=>{const r=track.getBoundingClientRect();return Math.round(1299+A.clamp((x-r.left)/r.width,0,1)*623);};
rib.addEventListener('pointerdown',e=>{scrub=e.pointerId;rib.setPointerCapture(e.pointerId);A.setYear(yearAt(e.clientX));});
rib.addEventListener('pointermove',e=>{if(scrub===e.pointerId)A.setYear(yearAt(e.clientX));});
rib.addEventListener('pointerup',()=>{scrub=null;});
/* hover tip */
const tip=$('dtip');
track.addEventListener('pointerover',e=>{const fc=e.target.closest('.fc[data-sid]'),mk=e.target.closest('.mk');
  if(fc){const s=SULTANS.find(x=>x.id===fc.dataset.sid);tip.innerHTML=`<span class="dtip-face">${A.face('sultan',s.id,s.name,String(s.order))}</span><span><em>${s.order}. padişah</em><b>${esc(s.name)}</b><i>${esc(s.title)} · ${A.reign(s)}</i></span>`;}
  else if(mk){tip.innerHTML=`<span><b>${esc(mk.dataset.tip)}</b></span>`;}
  else{tip.hidden=true;return;}
  const r=track.getBoundingClientRect(),t=(fc||mk).getBoundingClientRect();tip.hidden=false;tip.style.left=A.clamp(t.left+t.width/2-r.left,110,r.width-110)+'px';});
track.addEventListener('pointerleave',()=>{tip.hidden=true;});

/* playback */
let raf=0,last=0,acc=0,hold=0,lastStory=1299;
const YPS={1:2,3:6,10:20};
A.play=(restart=false)=>{
  if(state.playing){A.stop();return;}
  const [a,b]=A.bounds();if(restart||state.year>=b)state.year=a;
  state.playing=true;state.event=null;state.person=null;state.region=null;last=performance.now();acc=0;hold=0;lastStory=state.year;A.render();raf=requestAnimationFrame(tick);
};
A.stop=()=>{state.playing=false;cancelAnimationFrame(raf);A.render();};
function tick(t){if(!state.playing)return;const dt=Math.min(120,t-last);last=t;
  if(hold>0)hold-=dt;else{acc+=dt*YPS[state.speed]/1000;let moved=false;while(acc>=1){acc-=1;moved=advance()||moved;if(!state.playing)break;}if(moved)A.render();}
  if(state.playing)raf=requestAnimationFrame(tick);}
function advance(){
  const sel=A.selectedSultan(),[a,b]=A.bounds();let y=state.year+1;
  if(sel){const ys=sultanYears(sel);y=ys.find(v=>v>state.year)??b+1;}
  if(y>b){state.year=b;A.stop();return true;}
  state.year=y;story(y);return true;
}
function story(y){
  const evs=EVENTS.filter(e=>e.year===y);const e=evs.find(e=>A.img.event[e.id])||evs.find(e=>['Fetih','Kayıp','Savaş','Antlaşma'].includes(e.type));
  if(e){A.caption(e);lastStory=y;if(state.camera&&state.speed<10){A.focusRegion(e.region,1.9,1000);hold=state.speed===1?1900:1250;}}
  else if(state.camera&&y-lastStory===18){A.fit(1400);}
}
let capT=0;
A.caption=e=>{const c=$('caption'),img=A.img.event[e.id];
  c.innerHTML=`${img?`<span class="cap-img"><img src="${esc(img)}" alt=""></span>`:''}<span class="cap-text"><span class="kicker">${e.year} · ${esc(e.type)}</span><b>${esc(e.title)}</b><span class="cap-p">${esc(e.text)}</span></span>`;
  c.dataset.id=e.id;c.classList.add('on');clearTimeout(capT);capT=setTimeout(()=>c.classList.remove('on'),state.speed===10?1800:3600);};
A.hint=(t,p)=>{const c=$('caption');c.innerHTML=`<span class="cap-text"><span class="kicker">1565 · Kanûnî dönemi</span><b>${esc(t)}</b><span class="cap-p">${esc(p)}</span></span>`;delete c.dataset.id;c.classList.add('on');clearTimeout(capT);capT=setTimeout(()=>c.classList.remove('on'),6500);};
A.hideCaption=()=>{clearTimeout(capT);$('caption').classList.remove('on');};
})();
