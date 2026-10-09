/* Wiring: selection logic (ported from the repo's app.js), actions, keyboard, the curtain and the overture. */
(()=>{const {$,state}=A;const app=$('app');
A.setYear=(y,{keep=false}={})=>{if(state.playing)A.stop();y=A.clamp(Math.round(+y),1299,1922);const sel=A.selectedSultan();if(sel&&!sultanYears(sel).includes(y)){const [a,b]=A.bounds();if(y<a||y>b){state.scope=null;}else y=nearestYear(y,sultanYears(sel));}state.year=y;if(!keep){state.event=null;state.person=null;}A.render();};
A.selectSultan=(id,{play=false,peak=true}={})=>{const s=SULTANS.find(s=>s.id===id);if(!s)return;if(state.playing)A.stop();state.scope=id;state.region=state.person=state.event=null;state.baseline=null;
  state.year=peak?A.peak(s).year:sultanYears(s)[0];A.render();
  if(s.terms[0][0]<1413){const [x,y]=A.project(29.5,40.4);A.flyTo(A.camAt(x,y,A.fitK()*2.6));}else A.fit(900);
  if(play)A.play(true);};
A.allHistory=()=>{if(state.playing)A.stop();state.scope=null;state.region=state.person=state.event=null;state.baseline=null;A.render();A.fit();};
A.selectPerson=id=>{const p=PEOPLE.find(p=>p.id===id);if(!p)return;if(state.playing)A.stop();state.scope=null;state.person=id;state.region=state.event=null;state.baseline=null;state.year=p.focus;A.render();A.focusRegion(p.region,1.6);openFolio();};
A.selectEvent=id=>{const e=EVENTS.find(e=>e.id===id);if(!e)return;if(state.playing)A.stop();const sel=A.selectedSultan();if(sel&&!sultanYears(sel).includes(e.year))state.scope=null;state.year=e.year;state.person=state.region=null;state.event=id;
  if(['Fetih','Kayıp'].includes(e.type)){state.mode='movement';state.baseline=Math.max(1299,e.year-1);}A.render();A.focusRegion(e.region,1.8);openFolio();};
A.jump=dir=>{const [a,b]=A.bounds(),sel=A.selectedSultan();const es=EVENTS.filter(e=>e.year>=a&&e.year<=b&&(!sel||sultanYears(sel).includes(e.year)));const e=dir>0?es.find(e=>e.year>state.year):[...es].reverse().find(e=>e.year<state.year);if(e)A.selectEvent(e.id);else A.setYear(dir>0?b:a);};
function openFolio(){if(!state.folio){state.folio=true;app.dataset.folio='1';$('folio-toggle').setAttribute('aria-pressed','true');}}
A.setView=v=>{state.view=v;app.dataset.view=v;document.querySelectorAll('[data-action="view"]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===v));
  if(v!=='stage'&&state.playing)A.stop();
  if(v==='silsile')A.buildSilsile();if(v==='kisiler')requestAnimationFrame(A.buildPeople);if(v==='duello')A.buildDuel();
  const ov=document.querySelector('.overlay[data-for="'+v+'"]');if(ov)ov.scrollTop=0;};

const actions={
 enter:()=>A.enter(),home:()=>{A.setView('stage');A.allHistory();},view:b=>A.setView(b.dataset.view),
 sultan:b=>A.selectSultan(b.dataset.id),'sultan-go':b=>{A.setView('stage');A.selectSultan(b.dataset.id);openFolio();},'person-go':b=>{A.setView('stage');A.selectPerson(b.dataset.id);},
 'active-sultan':()=>{const s=A.activeSultan();if(s){state.region=state.person=state.event=null;openFolio();A.render();}},
 person:b=>A.selectPerson(b.dataset.id),event:b=>A.selectEvent(b.dataset.id),
 region:b=>{if(A.dragged)return;state.region=b.dataset.id;state.person=null;state.event=null;openFolio();A.render();},
 mode:b=>{state.mode=b.dataset.mode;if(state.mode!=='movement')state.baseline=null;A.render();},
 all:()=>A.allHistory(),play:()=>A.play(),'period-play':b=>A.selectSultan(b.dataset.id,{play:true,peak:false}),peak:b=>A.selectSultan(b.dataset.id),
 prev:()=>A.jump(-1),next:()=>A.jump(1),year:b=>A.setYear(+b.dataset.year),speed:b=>{state.speed=+b.dataset.speed;A.render();},
 'close-detail':()=>{state.region=state.person=state.event=null;A.render();},
 folio:()=>{state.folio=!state.folio;app.dataset.folio=state.folio?'1':'0';$('folio-toggle').setAttribute('aria-pressed',state.folio);setTimeout(()=>A.fit(700),40);},
 'zoom-in':()=>A.zoomBy(1.35),'zoom-out':()=>A.zoomBy(1/1.35),fit:()=>A.fit(),
 'groups-reset':()=>{state.groups=new Set(Object.keys(GROUPS));A.drawGroups();A.render();},
 'duel-with':b=>{A.duelWith(b.dataset.id);A.setView('duello');},
 caption:()=>{const id=$('caption').dataset.id;if(id)A.selectEvent(id);},
 sources:()=>A.openInfo('sources'),guide:()=>A.openInfo('guide'),'close-info':()=>$('info').close(),skip:()=>A.skipOverture()
};
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b||b.disabled)return;const f=actions[b.dataset.action];if(f){if(b.tagName==='A')e.preventDefault();f(b);}});
document.addEventListener('change',e=>{
  if(e.target.id==='dep'){state.dependents=e.target.checked;A.render();}
  else if(e.target.id==='cam'){state.camera=e.target.checked;}
  else if(e.target.dataset.group){e.target.checked?state.groups.add(e.target.dataset.group):state.groups.delete(e.target.dataset.group);A.render();}
});
document.addEventListener('keydown',e=>{
  if(!booted){if(e.key==='Enter'&&A.loaderReady())A.enter();return;}
  if($('info').open)return;
  if(e.target.matches('svg [role="button"],svg [data-action]')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));return;}
  if(e.target.closest('input,select,textarea,button,a'))return;
  if(e.key==='Escape'){if(state.view!=='stage')A.setView('stage');else actions['close-detail']();return;}
  if(state.view!=='stage')return;
  if(e.code==='Space'){e.preventDefault();A.play();}
  else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();A.setYear(state.year+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?10:1));}
  else if(['1','2','3'].includes(e.key)){state.mode=['borders','movement','ethnicity'][+e.key-1];if(state.mode!=='movement')state.baseline=null;A.render();}
  else if(e.key==='f'||e.key==='F')actions.folio();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.playing)A.stop();});

/* ---------- curtain + overture ---------- */
let booted=false,ov=null;
A.prime=()=>{A.buildDock();A.folioRefresh();const s=A.activeSultan();$('tc-face').innerHTML=s?A.face('sultan',s.id,s.name,String(s.order)):'';};
A.enter=()=>{if(booted)return;booted=true;$('curtain').classList.add('open');document.body.classList.add('entered');setTimeout(()=>{$('curtain').remove();},1900);setTimeout(overture,650);};
function overture(){
  const start={...A.cam},end=A.fitCam(),t0=performance.now(),D=8200,STEPS=[1299,1326,1354,1365,1389,1430,1453,1475,1517,1526,1541,1565];
  app.classList.add('overture');$('skip').hidden=false;
  ov=t=>{if(!ov)return;const p=Math.min(1,(t-t0)/D),e=p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;
    // the sweep steps through milestones rather than every year, so each conquest has time to spread
    const y=STEPS[Math.min(STEPS.length-1,Math.floor(p*STEPS.length*1.08))];if(y!==state.year){state.year=y;A.render();}
    const lk=Math.log(start.k)+(Math.log(end.k)-Math.log(start.k))*Math.min(1,e*1.15);const k=Math.exp(lk),q=Math.min(1,e*1.15);
    const sc=[(innerWidth/2-start.tx)/start.k,(innerHeight/2-start.ty)/start.k],ec=[(innerWidth/2-end.tx)/end.k,(innerHeight/2-end.ty)/end.k];
    A.setCam({k,tx:innerWidth/2-(sc[0]+(ec[0]-sc[0])*q)*k,ty:innerHeight/2-(sc[1]+(ec[1]-sc[1])*q)*k});
    if(p<1&&ov)requestAnimationFrame(ov);else finish();};
  requestAnimationFrame(ov);
}
function finish(){if(!ov)return;ov=null;app.classList.remove('overture');$('skip').hidden=true;state.scope=null;state.year=1565;state.folio=true;app.dataset.folio='1';$('folio-toggle').setAttribute('aria-pressed','true');A.render();A.fit(800);A.hint('Sahne senin','Zaman şeridini sürükle, bir yüze dokun ya da Oynat’a bas. Kamera büyük olaylarda haritayı o bölgeye taşır.');}
A.skipOverture=()=>finish();

/* ---------- initial state behind the curtain: Söğüt, 1299 ---------- */
A.drawGroups();A.buildDock();
state.folio=false;app.dataset.folio='0';
A.render();
const core=A.regionById('core');A.setCam(A.camAt(core.center[0],core.center[1],A.fitK()*5.5));
A.icons();
})();
