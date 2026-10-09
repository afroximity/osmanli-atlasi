/* The stage: one MapLibre canvas draws everything geographic — sea, land, the 58 cells, their patterns, the
   frontier, the spread animation (a custom WebGL layer) and the relief, which sits above the cells so held ground
   keeps its mountains. Only screen-space labels live in the SVG overlay. */
(()=>{const {$,state,esc}=A;
const lbl=$('labels'),scr=$('screen'),NS='http://www.w3.org/2000/svg';
const cam=A.cam={k:1,tx:0,ty:0};let W=1,H=1,anim=null;
const BB=(()=>{let b=[1e9,1e9,-1e9,-1e9];for(const r of A.regions){const q=r.bounds;b=[Math.min(b[0],q[0]),Math.min(b[1],q[1]),Math.max(b[2],q[2]),Math.max(b[3],q[3])];}return b;})();
const el=(tag,attrs={},parent)=>{const n=document.createElementNS(NS,tag);for(const k in attrs)n.setAttribute(k,attrs[k]);parent&&parent.appendChild(n);return n;};

/* ---------- palette: CSS tokens resolved to rgb so WebGL can use them ---------- */
const cv=document.createElement('canvas');cv.width=cv.height=1;const cx=cv.getContext('2d',{willReadFrequently:true});
const rgb=css=>{cx.clearRect(0,0,1,1);cx.fillStyle='#000';cx.fillStyle=css;cx.fillRect(0,0,1,1);const d=cx.getImageData(0,0,1,1).data;return[d[0],d[1],d[2]];};
const tok=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const hex=c=>'#'+c.map(v=>v.toString(16).padStart(2,'0')).join('');
const P={crimson:rgb(tok('--crimson')),crimsonHi:rgb(tok('--crimson-hi')),gold:rgb(tok('--gold')),goldHi:rgb(tok('--gold-hi')),gold3:rgb(tok('--color-accent-300')),teal:rgb(tok('--teal')),violet:rgb(tok('--violet'))};
// cell classes → [color, opacity]; patterned classes get their pattern layer on top of this base
const CLS={direct:[P.crimson,.86],vassal:[P.crimson,.2],autonomy:[P.crimson,.46],occupied:[[91,84,75],.25],national:[P.teal,.72],
  gain:[P.gold,.86],loss:[P.crimson,.14],authority:[P.violet,.76],stable:[P.crimson,.34],ethnic:[[59,52,43],.95],none:[[0,0,0],0]};
const st=(k,d)=>['coalesce',['feature-state',k],d];
const byCls=(i,fb)=>['match',st('cls','none'),...Object.entries(CLS).flatMap(([c,v])=>[c,i===0?hex(v[0]):v[1]]),fb];
const hidden=['boolean',st('hide',false)];

/* ---------- patterns, drawn once on canvas: they stay crisp and screen-sized at any zoom ---------- */
function stripes(color,alpha,w,gap,dir,bg){const s=gap*2,c=document.createElement('canvas');c.width=c.height=s*2;const g=c.getContext('2d');g.scale(2,2);
  if(bg){g.fillStyle=bg;g.fillRect(0,0,s,s);}g.strokeStyle=`rgba(${color},${alpha})`;g.lineWidth=w;g.lineCap='square';
  // 45° stripes; the tile is two periods wide so the pattern wraps seamlessly
  for(let o=-s;o<=s*2;o+=gap){g.beginPath();if(dir>0){g.moveTo(o,s);g.lineTo(o+s,0);}else{g.moveTo(o,0);g.lineTo(o+s,s);}g.stroke();}
  return g.getImageData(0,0,s*2,s*2);}

/* ---------- basemap + cells ---------- */
const zOf=k=>Math.log2(k*A.WORLD/512),kOf=z=>512*Math.pow(2,z)/A.WORLD;
const DEM='https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const INK='#5f5241',SEA='#191714',LAND='#363027';
const coast=(id,off,op,w=.8)=>({id,type:'line',source:'land',paint:{'line-color':INK,'line-width':w,'line-opacity':op,'line-offset':off}});
const cellsFC={type:'FeatureCollection',features:A.regions.map(r=>({type:'Feature',properties:{id:r.id},geometry:{type:'MultiPolygon',coordinates:r.geom}}))};
const grat={type:'FeatureCollection',features:[...[-10,0,10,20,30,40,50,60].map(x=>({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[[x,8],[x,56]]}})),
  ...[10,20,30,40,50].map(y=>({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[-14,-4,6,16,26,36,46,56,63].map(x=>[x,y])}}))]};
const patLayer=(cls,img)=>({id:'pat-'+cls,type:'fill',source:'cells',paint:{'fill-pattern':img,'fill-opacity':['case',['all',['==',st('cls','none'),cls],['!',hidden]],1,0]}});
const edge=(id,classes,dash,w,color)=>({id,type:'line',source:'cells',layout:{'line-join':'round'},paint:{'line-color':color,'line-width':w,...(dash?{'line-dasharray':dash}:{}),
  'line-opacity':['match',st('cls','none'),...classes.flatMap(([c,o])=>[c,o]),0]}});
const STYLE={version:8,
  sources:{
    land:{type:'geojson',data:'assets/land.json',tolerance:.2},
    bathy:{type:'geojson',data:'assets/bathymetry.json'},
    lakes:{type:'geojson',data:'assets/lakes.json'},
    rivers:{type:'geojson',data:'assets/rivers.json'},
    grat:{type:'geojson',data:grat},
    cells:{type:'geojson',data:cellsFC,promoteId:'id',tolerance:.25},
    frontier:{type:'geojson',data:{type:'FeatureCollection',features:[]},tolerance:.25},
    dem:{type:'raster-dem',tiles:[DEM],encoding:'terrarium',tileSize:256,maxzoom:10}
  },
  layers:[
    {id:'sea',type:'background',paint:{'background-color':SEA}},
    {id:'grat',type:'line',source:'grat',paint:{'line-color':'#efe9df','line-opacity':.05,'line-width':1}},
    // engraved water-lines along the coast, as on copperplate charts
    coast('wl-3',['interpolate',['linear'],['zoom'],3,-9,8,-15],.07),coast('wl-2',['interpolate',['linear'],['zoom'],3,-5.5,8,-9],.13),coast('wl-1',['interpolate',['linear'],['zoom'],3,-2.6,8,-4],.22),
    {id:'land',type:'fill',source:'land',paint:{'fill-color':LAND}},
    {id:'cells',type:'fill',source:'cells',paint:{'fill-color':byCls(0,'#000'),'fill-opacity':['case',hidden,0,byCls(1,0)]}},
    patLayer('vassal','pat-vassal'),patLayer('occupied','pat-occ'),patLayer('loss','pat-loss'),
    // the spread layer (custom WebGL) is inserted here, under the relief
    {id:'relief',type:'hillshade',source:'dem',paint:{'hillshade-exaggeration':['interpolate',['linear'],['zoom'],3,.6,8,.45],'hillshade-shadow-color':'rgba(10,8,6,.9)','hillshade-highlight-color':'rgba(196,172,128,.5)','hillshade-accent-color':'rgba(20,16,12,.45)','hillshade-illumination-direction':315}},
    {id:'deep',type:'fill',source:'bathy',paint:{'fill-color':['step',['get','depth'],'#191612',1000,'#161310',2000,'#13110e'],'fill-opacity':.86}},
    {id:'lakes',type:'fill',source:'lakes',paint:{'fill-color':SEA}},
    {id:'lakes-edge',type:'line',source:'lakes',paint:{'line-color':INK,'line-width':.6}},
    {id:'rivers',type:'line',source:'rivers',filter:['<=',['get','scalerank'],['step',['zoom'],5,4,7,5.5,9]],layout:{'line-cap':'round','line-join':'round'},
      paint:{'line-color':'#56605a','line-opacity':.8,'line-width':['interpolate',['linear'],['zoom'],3,['interpolate',['linear'],['get','scalerank'],1,1.1,9,.35],8,['interpolate',['linear'],['get','scalerank'],1,2.6,9,.8]]}},
    coast('coast',0,.95,.9),
    // cell borders: faint inside held ground, dashed where rule is indirect
    edge('edge-solid',[['direct',.12],['stable',.1],['gain',.45],['authority',.4],['national',.4],['ethnic',.18]],null,.7,hex(P.goldHi)),
    edge('edge-dash',[['vassal',.55],['occupied',.5]],[3,3],.8,['match',st('cls','none'),'occupied','#9a9286',hex(P.goldHi)]),
    edge('edge-dot',[['autonomy',.6]],[1,3],1.1,hex(P.goldHi)),
    edge('edge-loss',[['loss',.8]],[3,2],1.1,hex(P.crimsonHi)),
    {id:'fr-shade',type:'line',source:'frontier',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#0b0806','line-opacity':.55,'line-width':4.5,'line-blur':2}},
    {id:'fr-line',type:'line',source:'frontier',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':hex(P.goldHi),'line-opacity':.9,'line-width':1.25}},
    {id:'cell-hl',type:'line',source:'cells',layout:{'line-join':'round'},paint:{'line-color':['case',['boolean',st('sel',false)],'#f6dcac',hex(P.gold3)],
      'line-width':['case',['boolean',st('sel',false)],2.2,1.6],'line-opacity':['case',['boolean',st('sel',false)],1,['boolean',st('hover',false)],1,0]}}
  ]};
const map=A.map=new maplibregl.Map({container:'basemap',style:STYLE,attributionControl:false,renderWorldCopies:false,dragRotate:false,pitchWithRotate:false,touchPitch:false,keyboard:false,fadeDuration:0,center:[30,40],zoom:4,minZoom:1,maxZoom:12});
map.touchZoomRotate.disableRotation();
map.addImage('pat-vassal',stripes(P.crimsonHi.join(','),.9,2.6,7,1,`rgba(${P.crimson},.22)`),{pixelRatio:2});
map.addImage('pat-occ',stripes('154,146,134',.75,1.3,6,-1,'rgba(91,84,75,.25)'),{pixelRatio:2});
map.addImage('pat-loss',stripes(P.crimsonHi.join(','),.85,1.6,6,1,`rgba(${P.crimson},.14)`),{pixelRatio:2});
let ready=false;const pending=[];A.mapReady=f=>ready?f():pending.push(f);
map.on('load',()=>{map.addLayer(spreadLayer,'relief');ready=true;pending.splice(0).forEach(f=>f());});

/* ---------- camera: A.cam is in atlas units; MapLibre is the only renderer, so it is the source of truth ---------- */
let pushing=false;
function pull(){const c=map.getCenter(),[x,y]=A.project(c.lng,c.lat),k=kOf(map.getZoom());cam.k=k;cam.tx=W/2-x*k;cam.ty=H/2-y*k;apply();}
map.on('move',()=>{if(!pushing)pull();});
map.on('movestart',e=>{if(e.originalEvent)A.stopFly();});
map.on('dragstart',()=>{A.dragged=true;tipEl.hidden=true;});
map.on('dragend',()=>setTimeout(()=>{A.dragged=false;},0));

A.free=()=>{const dock=$('dock').offsetHeight,fol=state.folio?$('folio').offsetWidth:0,top=$('topbar').offsetHeight;return{x:24,y:top+20,w:W-fol-48,h:H-top-dock-40};};
// on phones the folio can cover the whole stage: never fit into less than a sliver
A.fitCam=()=>{const f=A.free(),bw=BB[2]-BB[0],bh=BB[3]-BB[1],k=Math.min(Math.max(f.w,W*.5)/bw,Math.max(f.h,H*.3)/bh)*.98;return{k,tx:f.x+f.w/2-(BB[0]+BB[2])/2*k,ty:f.y+f.h/2-(BB[1]+BB[3])/2*k+10};};
A.fitK=()=>A.fitCam().k;
A.camAt=(x,y,k)=>{const f=A.free();return{k,tx:f.x+f.w/2-x*k,ty:f.y+f.h/2-y*k};};
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
A.flyTo=(to,dur=1100)=>{const from={...cam},t0=performance.now();anim={from,to,t0,dur};requestAnimationFrame(step);};
function step(t){if(!anim)return;const p=Math.min(1,(t-anim.t0)/anim.dur),e=ease(p),{from,to}=anim;
  const lk=Math.log(from.k)+(Math.log(to.k)-Math.log(from.k))*e,k=Math.exp(lk);
  // keep the screen-center path smooth while zoom changes geometrically
  const fc=[(W/2-from.tx)/from.k,(H/2-from.ty)/from.k],tc=[(W/2-to.tx)/to.k,(H/2-to.ty)/to.k],c=[fc[0]+(tc[0]-fc[0])*e,fc[1]+(tc[1]-fc[1])*e];
  A.setCam({k,tx:W/2-c[0]*k,ty:H/2-c[1]*k});if(p<1)requestAnimationFrame(step);else anim=null;}
A.stopFly=()=>{anim=null;};
A.fit=(dur=1000)=>A.flyTo(A.fitCam(),dur);
A.focusRegion=(id,mult=2.1,dur=1200)=>{const r=A.regionById(id);if(!r)return;const b=r.bounds,size=Math.max(b[2]-b[0],b[3]-b[1]),fk=A.fitK(),k=A.clamp(Math.min(fk*mult,(A.free().h*.45)/Math.max(size,30)),fk*1.2,fk*5);A.flyTo(A.camAt(r.center[0],r.center[1],k),dur);};
// push the camera to MapLibre, then read back what it accepted (zoom limits)
A.setCam=c=>{Object.assign(cam,c);const [lng,lat]=A.unproject((W/2-cam.tx)/cam.k,(H/2-cam.ty)/cam.k);pushing=true;map.jumpTo({center:[lng,lat],zoom:zOf(cam.k)});pushing=false;pull();};

function resize(){const c=map.getContainer();W=c.clientWidth||innerWidth;H=c.clientHeight||innerHeight;lbl.setAttribute('viewBox',`0 0 ${W} ${H}`);
  const fk=A.fitK();if(fk>0){map.setMaxZoom(A.clamp(zOf(fk*10),0,22));map.setMinZoom(A.clamp(zOf(fk*.7),-2,map.getMaxZoom()));}}

/* ---------- screen-space labels (SVG overlay) ---------- */
const labels=[];let cityNodes=[],focusNode,ethG,tipEl=$('tip');
function build(){
  resize();
  for(const [t,lon,lat,ang] of [['Karadeniz',34,43.4,0],['Akdeniz',18,35.2,0],['Kızıldeniz',37.4,21.8,-58],['Hazar',51,41.5,-80],['Basra Körfezi',51.2,26.9,-36],['Adriyatik',15.6,43,-38],['Ege',25.1,38.6,-70]]){const [x,y]=A.project(lon,lat);const n=el('text',{class:'lbl-sea'},scr);n.textContent=t;labels.push({n,x,y,ang});}
  for(const [t,lon,lat] of [['ANADOLU',33.5,38.6],['RUMELİ',23.2,43.2],['MAĞRİB',6,30.6],['ARABİSTAN',46,22],['İRAN',54,32.5],['MISIR',29,25.2],['AVRUPA',10,48.5]]){const [x,y]=A.project(lon,lat);const n=el('text',{class:'lbl-land'},scr);n.textContent=t;labels.push({n,x,y,ang:0});}
  const cities=[['İstanbul',28.98,41.01,'istanbul',1],['Edirne',26.56,41.67,'thrace',2],['Bursa',29.06,40.18,'bursa',2],['Selânik',22.94,40.64,'thessaloniki',2],['Budin',19.05,47.5,'hungary',1],['Belgrad',20.45,44.79,'belgrade',2],['Şam',36.3,33.51,'syria',1],['Bağdat',44.37,33.31,'iraq',1],['Kahire',31.24,30.04,'egypt',1],['Mekke',39.82,21.42,'hejaz',1],['Trablus',13.19,32.88,'tripoli',1],['Cezayir',3.06,36.75,'algeria',1],['Tebriz',46.29,38.08,'azerbaijan',2],['Kefe',35.38,45.03,'crimea',2]];
  cityNodes=cities.map(([name,lon,lat,id,tier])=>{const [x,y]=A.project(lon,lat);const g=el('g',{class:'city'},scr);el('circle',{r:3.2},g);const t=el('text',{x:7,y:-6},g);t.textContent=name;return{g,t,x,y,id,tier,name};});
  ethG=el('g',{id:'eth'},scr);
  focusNode=el('g',{class:'focus'},scr);
  // keyboard and screen-reader access to the cells, which are pixels on a canvas
  $('region-list').innerHTML=A.regions.map(r=>`<button data-action="region" data-id="${r.id}" tabindex="-1">${esc(r.name)}</button>`).join('');
  A.setCam(A.fitCam());
}
function apply(){
  if(!ethG)return;
  const fk=A.fitK?A.fitK():1,zoomed=cam.k/fk;
  for(const l of labels){l.n.setAttribute('transform',`translate(${l.x*cam.k+cam.tx},${l.y*cam.k+cam.ty}) rotate(${l.ang})`);}
  for(const c of cityNodes){c.g.setAttribute('transform',`translate(${c.x*cam.k+cam.tx},${c.y*cam.k+cam.ty})`);c.g.style.display=(c.tier===2&&zoomed<1.6)||(state.mode==='ethnicity'&&c.tier===2)?'none':'';}
  ethG.classList.toggle('compact',zoomed<1.45);for(const n of ethG.children){n.setAttribute('transform',`translate(${n.dataset.x*cam.k+cam.tx},${n.dataset.y*cam.k+cam.ty})`);}
  const f=focusNode.dataset;if(f.x)focusNode.setAttribute('transform',`translate(${f.x*cam.k+cam.tx},${f.y*cam.k+cam.ty})`);
}
A.applyCam=apply;

/* ---------- cell state lives in MapLibre feature-state: changing it never re-tiles ---------- */
const cls={};
const setState=(id,s)=>A.mapReady(()=>map.setFeatureState({source:'cells',id},s));

/* ---------- frontier: edges shared by two held cells cancel out, what remains is the outer border ---------- */
const segs={};
for(const r of A.regions){const out=segs[r.id]=[];for(const poly of r.geom)for(const ring of poly)for(let i=1;i<ring.length;i++){const a=ring[i-1],b=ring[i],ka=a.join(),kb=b.join();if(ka!==kb)out.push([a,b,ka<kb?ka+'|'+kb:kb+'|'+ka]);}}
let frKey='';
function drawFrontier(owned){
  const key=[...owned].filter(([,v])=>v).map(([k])=>k).join();if(key===frKey)return;frKey=key;
  const n=new Map();for(const [id,v] of owned)if(v)for(const s of segs[id])n.set(s[2],(n.get(s[2])||0)+1);
  const lines=[];let cur=null,last=null;
  for(const [id,v] of owned)if(v)for(const [a,b,k] of segs[id])if(n.get(k)===1){if(cur&&last===a)cur.push(b);else{cur=[a,b];lines.push(cur);}last=b;}
  const data={type:'Feature',properties:{},geometry:{type:'MultiLineString',coordinates:lines}};
  A.mapReady(()=>map.getSource('frontier').setData(data));
}

/* ---------- spread: new ground floods in from the shared frontier, lost ground ebbs back to it ----------
   A custom WebGL layer under the relief. Each wave draws one cell's triangles; the fragment shader keeps the part
   within a growing (or shrinking) radius of the origin, with a ragged ink edge and a faint warm rim. */
const MC=(lng,lat)=>{const m=maplibregl.MercatorCoordinate.fromLngLat({lng,lat});return[m.x,m.y];};
const tris={};
function trianglesOf(r){if(tris[r.id])return tris[r.id];const out=[];
  for(const poly of r.geom){const flat=[],holes=[];poly.forEach((ring,i)=>{if(i)holes.push(flat.length/2);for(const c of ring){const m=MC(c[0],c[1]);flat.push(m[0],m[1]);}});
    const idx=earcut.default(flat,holes.length?holes:null,2);for(const i of idx)out.push(flat[i*2],flat[i*2+1]);}
  return tris[r.id]=new Float32Array(out);}
const KM=1/40075;// mercator units per km at the equator — only used to size the edge noise
const waves=A._waves=new Map(),still=matchMedia('(prefers-reduced-motion: reduce)');
const spreadLayer={id:'spread',type:'custom',renderingMode:'2d',
  onAdd(_m,gl){
    const vs=`attribute vec2 a;uniform mat4 m;varying vec2 p;void main(){p=a;gl_Position=m*vec4(a,0.,1.);}`;
    const fs=`precision highp float;varying vec2 p;uniform vec2 o;uniform float r,e,rim;uniform vec4 c;
      float h(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}
      float n(vec2 q){vec2 i=floor(q),f=fract(q);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
      void main(){vec2 q=(p-o)/${(25*KM).toFixed(9)};float g=n(q)*.65+n(q*2.7)*.35;
        float d=distance(p,o)+(g-.5)*e*2.;float a=1.-smoothstep(r-e*.4,r,d);
        float band=exp(-pow((d-r)/(e*.8),2.))*rim;
        gl_FragColor=vec4(c.rgb*c.a*a+vec3(1.,.82,.55)*band*.2,c.a*a+band*.2);}`;
    const sh=(t,s)=>{const x=gl.createShader(t);gl.shaderSource(x,s);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS))console.error(gl.getShaderInfoLog(x));return x;};
    const pr=this.pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,vs));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(pr);
    this.loc=Object.fromEntries(['m','o','r','e','rim','c'].map(k=>[k,gl.getUniformLocation(pr,k)]));this.loc.a=gl.getAttribLocation(pr,'a');
    this.buf=gl.createBuffer();this.vao=gl.createVertexArray?gl.createVertexArray():null;
  },
  render(gl,args){
    if(!waves.size)return;const L=this.loc,now=performance.now();
    // draw from our own vertex array so MapLibre's bound VAO is never modified
    if(gl.bindVertexArray)gl.bindVertexArray(this.vao);
    gl.useProgram(this.pr);gl.uniformMatrix4fv(L.m,false,args.defaultProjectionData.mainMatrix);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.buf);gl.enableVertexAttribArray(L.a);gl.vertexAttribPointer(L.a,2,gl.FLOAT,false,0,0);
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    for(const w of [...waves.values()]){const p=Math.min(1,(now-w.t0)/w.dur),e=w.gain?1-Math.pow(1-p,3):ease(p);
      gl.uniform2f(L.o,w.o[0],w.o[1]);gl.uniform1f(L.r,Math.max(1e-9,w.R*(w.gain?e:1-e)));gl.uniform1f(L.e,Math.min(w.R*.07,45*KM));
      gl.uniform1f(L.rim,Math.sin(Math.PI*p));gl.uniform4f(L.c,w.c[0]/255,w.c[1]/255,w.c[2]/255,w.a);
      gl.bufferData(gl.ARRAY_BUFFER,w.tri,gl.DYNAMIC_DRAW);gl.drawArrays(gl.TRIANGLES,0,w.tri.length/2);
      if(p>=1)w.done();}
    gl.disableVertexAttribArray(L.a);if(gl.bindVertexArray)gl.bindVertexArray(null);
    map.triggerRepaint();
  }};
function spreadDur(){if($('app').classList.contains('overture'))return 1300;return state.playing?({1:1700,3:1150,10:620}[state.speed]||1100):1400;}
function wave(r,o,gain,oldCls,newCls){
  waves.get(r.id)?.done();
  const tri=trianglesOf(r),om=MC(o[0],o[1]);let R=0;for(let i=0;i<tri.length;i+=2)R=Math.max(R,Math.hypot(tri[i]-om[0],tri[i+1]-om[1]));
  const [c,a]=CLS[gain?newCls:oldCls]||CLS.direct;
  const w={tri,o:om,R:R*1.06,gain,c,a:Math.max(a,.3),t0:performance.now(),dur:spreadDur()*(gain?1:.8),
    done(){clearTimeout(w.timer);waves.delete(r.id);if(gain)setState(r.id,{hide:false});}};
  // if frames stop (hidden tab), the wave still ends and the cell is never left hidden
  w.timer=setTimeout(()=>waves.get(r.id)===w&&w.done(),w.dur+250);
  if(gain)setState(r.id,{hide:true});
  waves.set(r.id,w);A.mapReady(()=>map.triggerRepaint());
}
let prevOwned=null,prevYear=null;
function spread(changes,prevCls){
  const owned=new Map(changes.map(c=>[c.region.id,isOttoman(c.after,state.dependents)]));
  const live=ready&&prevOwned&&!still.matches&&state.view==='stage'&&Math.abs(state.year-prevYear)<=80;
  if(live)for(const c of changes){const r=c.region,was=prevOwned.get(r.id),is=owned.get(r.id);if(was===is)continue;
    // gains grow from neighbours that were already ours; losses shrink back toward those that remain
    const ref=is?prevOwned:owned,pts=Object.entries(r.contacts||{}).filter(([n])=>ref.get(n)).map(([,p])=>p);
    const o=pts.length?pts.reduce((a,p)=>[a[0]+p[0]/pts.length,a[1]+p[1]/pts.length],[0,0]):A.unproject(...r.center);
    wave(r,o,is,prevCls[r.id],cls[r.id]);}
  prevOwned=owned;prevYear=state.year;drawFrontier(owned);
}

/* ---------- per-render ---------- */
let lastSultan=null,lastSel=null;
function update(){
  const y=state.year,changes=changesBetween(A.regions,A.baseline(),y,state.dependents),stats=statsAt(A.regions,y,state.dependents),prevCls={};
  for(const c of changes){const r=c.region,s=c.after;let k=s;prevCls[r.id]=cls[r.id]||'none';
    if(!state.dependents&&(s==='vassal'||s==='autonomy'))k='none';
    if(state.mode==='movement')k=c.kind==='stable'?(isOttoman(s,state.dependents)?'stable':(s==='none'?'none':s)):c.kind;
    if(state.mode==='ethnicity'&&isOttoman(s,state.dependents))k='ethnic';
    if(k!==cls[r.id]){cls[r.id]=k;setState(r.id,{cls:k});}
    const b=document.querySelector(`#region-list [data-id="${r.id}"]`);b.tabIndex=k==='none'?-1:0;b.setAttribute('aria-label',r.name+', '+STATUS_NAMES[s]);}
  if(lastSel!==state.region){if(lastSel)setState(lastSel,{sel:false});if(state.region)setState(state.region,{sel:true});lastSel=state.region;}
  spread(changes,prevCls);
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
  $('dep').checked=state.dependents;$('groups').hidden=state.mode!=='ethnicity';$('app').dataset.mode=state.mode;
  A.mapReady(()=>map.setPaintProperty('fr-line','line-opacity',state.mode==='ethnicity'?.45:.9));
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

/* ---------- interaction: MapLibre pans, zooms and hit-tests ---------- */
A.dragged=false;
const byArea=new Map(A.regions.map(r=>[r.id,r.areaKm2]));
const cellAt=pt=>{if(!ready)return null;const fs=map.queryRenderedFeatures(pt,{layers:['cells']});if(!fs.length)return null;
  return fs.map(f=>f.properties.id).sort((a,b)=>byArea.get(a)-byArea.get(b))[0];};
let hover=null;
const setHover=id=>{if(hover===id)return;if(hover)setState(hover,{hover:false});if(id&&cls[id]!=='none')setState(id,{hover:true});hover=id;};
map.on('mousemove',e=>{const id=cellAt(e.point);setHover(id);
  map.getCanvas().style.cursor=id&&cls[id]!=='none'?'pointer':'';
  const r=id&&A.regionById(id),o=e.originalEvent;if(!r||A.dragged){tipEl.hidden=true;return;}
  const s=statusAt(r,state.year);tipEl.innerHTML=`<b>${esc(r.name)}</b><span>${state.year} · ${STATUS_NAMES[s]}</span>`;tipEl.hidden=false;
  tipEl.style.transform=`translate(${Math.min(innerWidth-260,o.clientX+16)}px,${o.clientY+16}px)`;
});
map.getContainer().addEventListener('mouseleave',()=>{tipEl.hidden=true;setHover(null);});
map.on('click',e=>{const id=cellAt(e.point);if(id)document.querySelector(`#region-list [data-id="${id}"]`).click();});
$('region-list').addEventListener('focusin',e=>setHover(e.target.dataset.id));
$('region-list').addEventListener('focusout',()=>setHover(null));
A.zoomBy=(f,cx=W/2,cy=H/2)=>{A.stopFly();const fk=A.fitK(),k=A.clamp(cam.k*f,fk*.7,fk*8),r=k/cam.k;A.flyTo({k,tx:cx-(cx-cam.tx)*r,ty:cy-(cy-cam.ty)*r},380);};
map.on('resize',()=>{const before=A.fitK();resize();const after=A.fitCam();if(Math.abs(cam.k-before)<1e-3)A.setCam(after);else pull();});

build();A.on(update);
})();
