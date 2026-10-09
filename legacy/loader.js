/* Prologue: real preload of fonts, geography and Wikimedia lead images, shown as a year counter. */
(()=>{const {$}=A;
const W={fonts:.08,geo:.12,sultan:.42,person:.26,event:.12};
const prog={fonts:0,geo:0,sultan:0,person:0,event:0};
const lines=[
 ['geo','Kıyılar, rölyef ve '+GEO.regions.length+' bölgesel hücre','Natural Earth 1:10m'],
 ['fonts','Cormorant Garamond · Lora','yazı'],
 ['sultan',SULTANS.length+' padişah portresi','0/'+SULTANS.length],
 ['person',PEOPLE.length+' tarihî kişi','0/'+PEOPLE.length],
 ['event',EVENTS.length+' dönüm noktası · gravürler','0']
];
$('manifest').innerHTML=lines.map(([k,a,b])=>`<li id="mf-${k}"><span>${a}</span><b>${b}</b></li>`).join('');
const mark=(k,txt,ok)=>{const li=$('mf-'+k);if(!li)return;li.querySelector('b').textContent=txt;if(ok)li.classList.add('ok');};
const set=(k,v)=>{prog[k]=Math.max(prog[k],v);};
const target=()=>Object.keys(W).reduce((s,k)=>s+W[k]*prog[k],0);

async function wiki(kind,size){
  const map=A.WIKI[kind],titles=[...new Set(Object.values(map))];
  const url='https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=thumbnail&pithumbsize='+size+'&redirects=1&format=json&origin=*&titles='+encodeURIComponent(titles.join('|'));
  const ctl=new AbortController();const to=setTimeout(()=>ctl.abort(),7000);
  const j=await fetch(url,{signal:ctl.signal}).then(r=>r.json());clearTimeout(to);
  const q=j.query||{},alias={};
  for(const n of q.normalized||[])alias[n.from]=n.to;
  for(const n of q.redirects||[])alias[n.from]=n.to;
  const byTitle={};for(const p of Object.values(q.pages||{}))if(p.thumbnail)byTitle[p.title]=p.thumbnail.source;
  const resolve=t=>{let x=t,i=0;while(alias[x]&&i++<4)x=alias[x];return byTitle[x];};
  const out={};for(const [id,t] of Object.entries(map)){const u=resolve(t);if(u)out[id]=u;}
  return out;
}
const preload=(u)=>new Promise(r=>{const i=new Image();i.onload=()=>r(true);i.onerror=()=>r(false);i.src=u;});
async function loadKind(kind,size,total){
  try{
    const res=await wiki(kind,size);let ids=Object.keys(res);
    if(kind==='event'){const ev={};for(const e of EVENTS)if(res[e.title])ev[e.id]=res[e.title];Object.keys(res).length;ids=Object.keys(ev);Object.keys(res).forEach(k=>delete res[k]);Object.assign(res,ev);}
    const tot=Math.max(1,ids.length);let n=0,ok=0;
    await Promise.all(ids.map(async id=>{const good=await preload(res[id]);n++;if(good){ok++;A.img[kind][id]=res[id];}set(kind,n/tot);mark(kind,(kind==='event'?ok+' görsel':ok+'/'+total),n===tot);}));
    mark(kind,(kind==='event'?ok+' görsel':ok+'/'+total),true);
  }catch(e){mark(kind,'çevrimdışı · monogram',true);}
  set(kind,1);
}
// the map counts as loaded once MapLibre has its style, sources and first tiles
A.mapReady(()=>{set('geo',1);mark('geo','hazır',true);});
(document.fonts?document.fonts.ready:Promise.resolve()).then(()=>{set('fonts',1);mark('fonts','hazır',true);});
const jobs=[loadKind('sultan',520,SULTANS.length),loadKind('person',360,PEOPLE.length),loadKind('event',720,0)];
let allDone=false;Promise.all(jobs).then(()=>{allDone=true;});
setTimeout(()=>{for(const k in prog)prog[k]=1;allDone=true;},11000);

const t0=performance.now(),MIN=3400;let shown=0,ready=false;
const ring=[...document.querySelectorAll('#emblem [pathLength]')];
function frame(t){
  if(!$('pro-year'))return;// the curtain is already gone
  const cap=Math.min(1,(t-t0)/MIN),tg=Math.min(target(),allDone?1:.985);
  shown+=(Math.min(tg,cap)-shown)*.09;if(allDone&&cap>=1&&shown>.996)shown=1;
  const y=Math.round(1299+shown*623);$('pro-year').textContent=y;$('pro-fill').style.transform=`scaleX(${shown})`;
  ring.forEach((el,i)=>{const local=A.clamp(shown*1.25-i*.08,0,1);el.style.strokeDashoffset=1-local;});
  if(shown===1&&!ready){ready=true;document.body.classList.add('loaded');$('enter').hidden=false;$('enter').focus({preventScroll:true});$('pro-sub').textContent='Altı yüzyıl hazır.';A.render&&A.prime&&A.prime();}
  if(!ready)requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
A.loaderReady=()=>ready;
})();
