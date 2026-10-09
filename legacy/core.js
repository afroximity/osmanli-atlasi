/* Shared state + helpers. Data comes from data.js / model.js / geography.js (repo dist, unchanged). */
(()=>{
const A=window.A={};
A.$=id=>document.getElementById(id);
A.esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=new Intl.NumberFormat('tr-TR',{maximumFractionDigits:1});
A.fmt=fmt;
A.smallArea=x=>x>=1e6?fmt.format(x/1e6)+' milyon':x>=1000?fmt.format(Math.round(x/1000))+' bin':x===0?'0':'<1 bin';
A.area=x=>'≈ '+A.smallArea(x)+' km²';
A.areaParts=x=>x>=1e6?[fmt.format(Math.round(x/1e5)/10),'milyon km²']:x>=1000?[fmt.format(Math.round(x/1000)),'bin km²']:[x?'<1':'0','km²'];
A.reign=s=>s.terms.map(([a,b])=>a===b?String(a):a+'–'+b).join(' / ');
A.reignYears=s=>s.terms.reduce((n,[a,b])=>n+(b-a),0);
/* Web Mercator scaled to 16.5 units per degree of longitude, origin 12°W / 55°N — tools/build-geography.mjs writes cells in the same space. */
const MERC=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360)),WORLD=5940,X0=168/360*WORLD,Y0=(1-MERC(55)/Math.PI)/2*WORLD;
A.WORLD=WORLD;
A.project=(lon,lat)=>[(lon+180)/360*WORLD-X0,(1-MERC(lat)/Math.PI)/2*WORLD-Y0];
A.unproject=(x,y)=>[(x+X0)/WORLD*360-180,(2*Math.atan(Math.exp((1-2*(y+Y0)/WORLD)*Math.PI))-Math.PI/2)*180/Math.PI];
A.regions=GEO.regions;
A.regionById=id=>A.regions.find(r=>r.id===id);
A.eraAt=y=>ERAS.find(e=>e.start<=y&&y<e.end)||ERAS.at(-1);
A.pct=y=>(y-1299)/623*100;
A.clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
A.state={year:1299,scope:null,mode:'borders',dependents:true,region:null,person:null,event:null,baseline:null,speed:3,camera:true,groups:new Set(Object.keys(GROUPS)),folio:true,view:'stage',playing:false};
A.selectedSultan=()=>SULTANS.find(s=>s.id===A.state.scope)||null;
A.activeSultan=()=>rulerAt(A.state.year,A.selectedSultan());
A.bounds=()=>{const s=A.selectedSultan();if(!s)return[1299,1922];const y=sultanYears(s);return[y[0],y.at(-1)];};
A.baseline=()=>A.state.baseline??A.bounds()[0];
const peakCache={};
A.peak=s=>{const k=s.id+A.state.dependents;if(peakCache[k])return peakCache[k];let best=sultanYears(s)[0],max=-1;for(const y of sultanYears(s)){const a=statsAt(A.regions,y,A.state.dependents).total;if(a>=max){max=a;best=y;}}return peakCache[k]={year:best,area:max};};
A.subs=[];A.on=f=>A.subs.push(f);A.render=()=>{for(const f of A.subs)f();};
A.img={sultan:{},person:{},event:{}};
A.mono=name=>name.replace(/^(I{1,3}V?|V?I{1,3})\.\s*/,'').split(' ').slice(0,2).map(w=>w[0]).join('');
A.face=(kind,id,label,mono='')=>{const u=A.img[kind][id];return u?`<img class="face" src="${A.esc(u)}" alt="${A.esc(label)}" draggable="false">`:`<span class="face face-mono" aria-hidden="true">${A.esc(mono)}</span>`;};
A.icons=()=>{try{window.lucide&&lucide.createIcons({attrs:{'stroke-width':1.5}});}catch(e){}};
A.STATUS_SHORT={direct:'Doğrudan yönetim',vassal:'Bağlı',autonomy:'Özerk',occupied:'İşgal / nominal',national:'Ankara',none:'Dışında'};

/* Wikipedia article titles — the loader asks the Wikipedia API for each article's lead image at runtime. */
A.WIKI={
 sultan:{'osman-i':'Osman I',orhan:'Orhan','murad-i':'Murad I','bayezid-i':'Bayezid I','mehmed-i':'Mehmed I','murad-ii':'Murad II','mehmed-ii':'Mehmed II','bayezid-ii':'Bayezid II','selim-i':'Selim I','suleyman-i':'Suleiman the Magnificent','selim-ii':'Selim II','murad-iii':'Murad III','mehmed-iii':'Mehmed III','ahmed-i':'Ahmed I','mustafa-i':'Mustafa I','osman-ii':'Osman II','murad-iv':'Murad IV',ibrahim:'Ibrahim of the Ottoman Empire','mehmed-iv':'Mehmed IV','suleyman-ii':'Suleiman II','ahmed-ii':'Ahmed II','mustafa-ii':'Mustafa II','ahmed-iii':'Ahmed III','mahmud-i':'Mahmud I','osman-iii':'Osman III','mustafa-iii':'Mustafa III','abdulhamid-i':'Abdul Hamid I','selim-iii':'Selim III','mustafa-iv':'Mustafa IV','mahmud-ii':'Mahmud II',abdulmecid:'Abdulmejid I',abdulaziz:'Abdulaziz','murad-v':'Murad V','abdulhamid-ii':'Abdul Hamid II','mehmed-v':'Mehmed V','mehmed-vi':'Mehmed VI'},
 person:{edebali:'Sheikh Edebali',mihal:'Köse Mihal',lala:'Lala Şahin Pasha',timur:'Timur',bedreddin:'Sheikh Bedreddin','candarlı':'Çandarlı Halil Pasha the Younger',aksem:'Akshamsaddin',kuscu:'Ali Qushji',cem:'Cem Sultan',kemalreis:'Kemal Reis',pirireis:'Piri Reis',barbaros:'Hayreddin Barbarossa',ibrahimpasa:'Pargalı Ibrahim Pasha',hurrem:'Hurrem Sultan',sinan:'Mimar Sinan',mihrimah:'Mihrimah Sultan',sokollu:'Sokollu Mehmed Pasha',turgut:'Turgut Reis',fuzuli:'Fuzûlî',taki:"Taqi ad-Din Muhammad ibn Ma'ruf",safiye:'Safiye Sultan',kosem:'Kösem Sultan',turhan:'Turhan Sultan',evliya:'Evliya Çelebi',katip:'Kâtip Çelebi',koprulu:'Köprülü Mehmed Pasha',fazil:'Köprülü Fazıl Ahmed Pasha',karamustafa:'Merzifonlu Kara Mustafa Pasha',muteferrika:'Ibrahim Muteferrika',nedim:'Ahmed Nedîm Efendi',alemdar:'Alemdar Mustafa Pasha',mehmetali:'Muhammad Ali of Egypt',resit:'Mustafa Reşid Pasha',mithat:'Midhat Pasha',namik:'Namık Kemal',osmanhamdi:'Osman Hamdi Bey',enver:'Enver Pasha',talat:'Talaat Pasha',halide:'Halide Edib Adıvar',kemal:'Mustafa Kemal Atatürk'},
 event:{'I. Kosova Muharebesi':'Battle of Kosovo','Niğbolu Muharebesi':'Battle of Nicopolis','Ankara ve Fetret Devri':'Battle of Ankara','Varna Muharebesi':'Battle of Varna','İstanbul’un fethi':'Fall of Constantinople','Çaldıran Muharebesi':'Battle of Chaldiran','Mercidâbık ve Suriye':'Battle of Marj Dabiq','Mısır ve Hicaz':'Battle of Ridaniya','Belgrad’ın alınması':'Siege of Belgrade (1521)','Rodos’un alınması':'Siege of Rhodes (1522)','Mohaç Muharebesi':'Battle of Mohács','Viyana kuşatması':'Siege of Vienna (1529)','Preveze Deniz Muharebesi':'Battle of Preveza','Süleymaniye ve Habeş eyaleti':'Süleymaniye Mosque','Zigetvar ve Kanûnî’nin ölümü':'Siege of Szigetvár','İnebahtı Deniz Muharebesi':'Battle of Lepanto','Kıbrıs’ın alınması':'Ottoman conquest of Cyprus','Kandiye ve Girit':'Siege of Candia','II. Viyana kuşatması':'Battle of Vienna','Karlofça Antlaşması':'Treaty of Karlowitz','Çeşme Deniz Muharebesi':'Battle of Chesma','Küçük Kaynarca':'Treaty of Küçük Kaynarca','Yeniçeri Ocağı’nın kaldırılması':'Auspicious Incident','Navarin Deniz Muharebesi':'Battle of Navarino','Tanzimat Fermanı':'Edict of Gülhane','Kanûn-ı Esâsî':'Ottoman constitution of 1876','Berlin Antlaşması':'Congress of Berlin','II. Meşrutiyet ve kopuşlar':'Young Turk Revolution','Saltanatın kaldırılması':'Abolition of the Ottoman sultanate','Müteferrika’nın ilk baskıları':'Ibrahim Muteferrika','Edirne’nin alınması':'Edirne','Bursa’nın alınması':'Bursa'}
};
})();
