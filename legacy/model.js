const STATUS_NAMES={direct:'Doğrudan yönetim',vassal:'Bağlı devlet / yerel yönetim',autonomy:'Özerk yönetim',occupied:'Yabancı işgal / nominal egemenlik',national:'Ankara / yeni siyasî düzen',none:'Osmanlı yönetimi dışında'};
function statusAt(region,year){return region.periods.find(([a,b])=>a<=year&&year<b)?.[2]||'none';}
function isOttoman(s,dependents=true){return s==='direct'||(dependents&&(s==='vassal'||s==='autonomy'));}
function sultanYears(s){const ys=[];for(const[a,b]of s.terms)for(let y=a;y<Math.max(a+1,b);y++)ys.push(y);if(s.id==='mehmed-vi')ys.push(1922);return [...new Set(ys)].sort((a,b)=>a-b);}
function rulerAt(year,preferred=null){if(preferred&&sultanYears(preferred).includes(year))return preferred;if(year>=1922)return null;return [...SULTANS].reverse().find(s=>sultanYears(s).includes(year))||null;}
function statsAt(regions,year,dependents=true){const t={direct:0,vassal:0,autonomy:0,occupied:0,national:0,total:0,regions:0};for(const r of regions){const s=statusAt(r,year);if(s!=='none')t[s]+=r.areaKm2;if(isOttoman(s,dependents)){t.total+=r.areaKm2;t.regions++;}}return t;}
function changesBetween(regions,from,to,dependents=true){return regions.map(r=>{const before=statusAt(r,from),after=statusAt(r,to),had=isOttoman(before,dependents),has=isOttoman(after,dependents);return{region:r,before,after,kind:!had&&has?'gain':had&&!has?'loss':had&&has&&before!==after?'authority':'stable'};});}
function groupsAt(r,year){let g=[...r.groups];if(year>=1492&&['istanbul','bursa','thessaloniki','west-anatolia'].includes(r.id))g.push('sephardic');if(year>=1864&&['east-anatolia','north-anatolia','central-anatolia','bursa'].includes(r.id)&&!g.includes('caucasian'))g.push('caucasian');return g;}
function nearestYear(year,years){return years.reduce((best,y)=>Math.abs(y-year)<Math.abs(best-year)?y:best,years[0]);}

Object.assign(window,{STATUS_NAMES,statusAt,isOttoman,sultanYears,rulerAt,statsAt,changesBetween,groupsAt,nearestYear});
