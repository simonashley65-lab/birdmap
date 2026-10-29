/* Birdmap — live coastal sightings (BirdGuides snapshot + eBird API) */
(function(){
'use strict';
const API_KEY = 'd284b324-362a-488a-828a-b272c6574a23';
const API = 'https://api.ebird.org/v2';
const GRADES = ['Mega','Rare','Scarce','Local','Common'];
const GC = {Mega:'var(--mega)',Rare:'var(--rare)',Scarce:'var(--scarce)',Local:'var(--local)',Common:'var(--common)'};
const $ = id => document.getElementById(id);
const esc = s => String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function fmt(dt){ const d=new Date(dt); if(isNaN(d)) return dt||''; const p=n=>String(n).padStart(2,'0'); return `${p(d.getDate())}/${p(d.getMonth()+1)} ${p(d.getHours())}:${p(d.getMinutes())}`; }
function toast(msg, ms=3500){ const t=$('toast'); t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true, ms); }
const FAMNAME = {'Ducks, Geese, and Waterfowl':'Wildfowl','Pheasants, Grouse, and Allies':'Gamebirds','New World Quail':'Gamebirds','Pigeons and Doves':'Pigeons & doves','Rails, Gallinules, and Coots':'Rails','Cranes':'Cranes','Grebes':'Grebes','Oystercatchers':'Waders','Stilts and Avocets':'Waders','Plovers and Lapwings':'Waders','Sandpipers and Allies':'Waders','Thick-knees':'Waders','Skuas and Jaegers':'Skuas','Auks, Murres, and Puffins':'Auks','Gulls, Terns, and Skimmers':'Gulls & terns','Loons':'Divers','Northern Storm-Petrels':'Petrels & shearwaters','Southern Storm-Petrels':'Petrels & shearwaters','Shearwaters and Petrels':'Petrels & shearwaters','Boobies and Gannets':'Gannet & cormorants','Cormorants and Shags':'Gannet & cormorants','Ibises and Spoonbills':'Herons, ibises & storks','Herons, Egrets, and Bitterns':'Herons, ibises & storks','Storks':'Herons, ibises & storks','Osprey':'Raptors','Hawks, Eagles, and Kites':'Raptors','Barn-Owls':'Owls','Owls':'Owls','Hoopoes':'Hoopoe to woodpeckers','Kingfishers':'Hoopoe to woodpeckers','Bee-eaters':'Hoopoe to woodpeckers','Woodpeckers':'Hoopoe to woodpeckers','Falcons and Caracaras':'Falcons','Shrikes':'Shrikes','Crows, Jays, and Magpies':'Crows','Tits, Chickadees, and Titmice':'Tits','Penduline-Tits':'Tits','Bearded Reedling':'Tits','Larks':'Larks','Swallows':'Swallows & martins','Cettia Bush Warblers and Allies':'Warblers','Long-tailed Tits':'Tits','Leaf Warblers':'Warblers','Reed Warblers and Allies':'Warblers','Grassbirds and Allies':'Warblers','Sylviid Warblers and Allies':'Warblers','Kinglets':'Crests','Wrens':'Wren to treecreeper','Nuthatches':'Wren to treecreeper','Treecreepers':'Wren to treecreeper','Starlings':'Starlings','Thrushes and Allies':'Thrushes','Old World Flycatchers':'Chats & flycatchers','Dippers':'Dipper','Waxwings':'Waxwing','Accentors':'Dunnock','Old World Sparrows':'Sparrows','Wagtails and Pipits':'Wagtails & pipits','Finches, Euphonias, and Allies':'Finches','Longspurs and Snow Buntings':'Buntings','Old World Buntings':'Buntings','New World Sparrows':'Buntings','Swifts':'Swifts','Cuckoos':'Cuckoos','Nightjars and Allies':'Nightjars'};

// ---------- state ----------
let TAX={}, BYSCI={}, REGIONS=[], REG=null, YEAR=new Set(), YEAR_META={}, LIFE=new Set();
let bgRecords=[], ebRecords=[], ebFull={}, SPECIES=[], order={}, gradeOf={}, nameOf={}, seenOf={}, liferOf={};
let nowMs=Date.now();
const state={hours:36, src:'all', grades:new Set(GRADES), q:'', sel:null, seen:'all', view:'species', area:null, skipped:new Set()};
const lsKey=()=>'birdmap:'+REG.id;
function loadPrefs(){ if(REG.defaultSeen) state.seen=REG.defaultSeen; try{ const s=JSON.parse(localStorage.getItem(lsKey())||'{}'); if(s.hours===36||s.hours===168) state.hours=s.hours; if(s.src) state.src=s.src; if(['all','unseen','seen','lifer'].includes(s.seen)) state.seen=s.seen; state.skipped=new Set(JSON.parse(localStorage.getItem(lsKey()+':skip')||'[]')); }catch(e){} }
function savePrefs(){ try{ localStorage.setItem(lsKey(),JSON.stringify({hours:state.hours,src:state.src,seen:state.seen})); localStorage.setItem(lsKey()+':skip',JSON.stringify([...state.skipped])); }catch(e){} }

// ---------- data loading ----------
async function getJSON(url){ const r=await fetch(url,{cache:'no-cache'}); if(!r.ok) throw new Error(url+' '+r.status); return r.json(); }
async function ebird(path, params={}){
  const u=new URL(API+path); Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v)); u.searchParams.set('sppLocale','en_UK');
  const r=await fetch(u,{headers:{'X-eBirdApiToken':API_KEY}}); if(!r.ok) throw new Error('eBird '+r.status); return r.json();
}
function inBox(lat,lon){ if(lat==null) return true; const b=REG.bbox; return lat>=b[0]&&lat<=b[1]&&lon>=b[2]&&lon<=b[3]; }
const hasPos=r=>r.lat!=null&&r.lon!=null;
const excludeRe=()=>REG.exclude?new RegExp(REG.exclude,'i'):null;
function ebToRec(o){ return {src:'EB', key:o.speciesCode, name:o.comName, exo:o.exoticCategory||'', site:o.locName, lat:o.lat, lon:o.lng, dt:o.obsDt.replace(' ','T'), obs:'', notes:(o.userDisplayName?'Checklist by '+o.userDisplayName:'')+(o.obsValid===false?' · not yet reviewed':'')+(o.exoticCategory==='X'?' · escape':''), flags:o.obsValid===false&&o.obsReviewed===false?'Unconfirmed':'', url:'https://ebird.org/checklist/'+o.subId, count:o.howMany?String(o.howMany):'', id:o.subId+'|'+o.speciesCode+'|'+o.locId};
}
// eBird codes missing from the bundled taxonomy (subspecies groups, slashes, spuhs…) are looked up live; subspecies
// fold under their parent species (key parent|name) so year-list / lifer status comes from the species.
async function resolveCodes(recs){
  const lookup=async codes=>{ const tx=await ebird('/ref/taxonomy/ebird',{species:codes.join(','),fmt:'json',locale:'en_UK'});
    tx.forEach(t=>{ TAX[t.speciesCode]={c:t.speciesCode,n:t.comName,s:t.sciName,o:t.taxonOrder,f:t.familyComName,cat:t.category,parent:t.reportAs&&t.reportAs!==t.speciesCode?t.reportAs:''}; BYSCI[t.sciName.toLowerCase()]=BYSCI[t.sciName.toLowerCase()]||TAX[t.speciesCode]; }); };
  const todo=[...new Set(recs.map(r=>r.key).filter(c=>!c.includes('|')&&!TAX[c]))];
  if(todo.length){
    try{ await lookup(todo);
      const parents=[...new Set(todo.map(c=>TAX[c]&&TAX[c].parent).filter(p=>p&&!TAX[p]))]; if(parents.length) await lookup(parents);
    }catch(e){ console.warn('taxonomy lookup failed',e); }
    todo.forEach(c=>{ if(!TAX[c]){ const r=recs.find(x=>x.key===c); TAX[c]={c,n:r?r.name:c,o:99999,f:'Other',cat:'unknown'}; } });
  }
  recs.forEach(r=>{ const t=TAX[r.key]; if(t&&t.parent&&TAX[t.parent]&&(t.cat==='issf'||t.cat==='form')) r.key=t.parent+'|'+t.n; });
  return recs;
}
function countable(code, recs){ const t=TAX[code]||{}; if(t.cat&&t.cat!=='species') return false; if(/\bsp\.?$| sp$|\/|hybrid|domestic|\(domestic/i.test(t.n||'')) return false; const eb=recs.filter(r=>r.src==='EB'); if(eb.length&&eb.every(r=>r.exo==='X'||r.exo==='P')) return false; return true; }
function keep(r){ const ex=excludeRe(); return inBox(r.lat,r.lon) && !(ex&&ex.test(r.site)); }
function backDays(){ return state.hours>48?7:2; }
let liveCache={};   // key: back -> {recent:[], notable:[]}
async function loadLive(force){
  const back=backDays(); const ck=REG.id+':'+back;
  setLive('busy','Fetching eBird…');
  try{
    if(force||!liveCache[ck]){
      const recent=[], notable=[];
      for(const rc of REG.ebird){
        const [a,b]=await Promise.all([REG.notableOnly?Promise.resolve([]):ebird(`/data/obs/${rc}/recent`,{back,includeProvisional:true}), ebird(`/data/obs/${rc}/recent/notable`,{back,detail:'full'})]);
        recent.push(...a); notable.push(...b);
      }
      liveCache[ck]={recent,notable,at:Date.now()}; ebFull={};
    }
    const {recent,notable,at}=liveCache[ck];
    const seen={}; const out=[];
    notable.map(ebToRec).concat(recent.map(ebToRec)).forEach(r=>{ if(!keep(r)) return; if(seen[r.id]) return; seen[r.id]=1; out.push(r); });
    // species for which we only hold the latest record (from /recent) need a per-species fetch before mapping
    await resolveCodes(out);
    ebRecords=out; nowMs=Math.max(Date.now(), ...out.map(r=>Date.parse(r.dt)).filter(Boolean));
    setLive('ok',`eBird live ${fmt(new Date(at).toISOString())}`);
  }catch(e){ console.error(e); setLive('err','eBird unavailable — showing BirdGuides only'); ebRecords=[]; }
}
async function ensureFull(codes, onProgress){
  const back=backDays(); const todo=codes.filter(c=>!c.includes('|') && !ebFull[c+':'+back]);
  if(!todo.length || REG.notableOnly) return;   // notable feed already carries every record
  let done=0; const queue=todo.slice(); const workers=[];
  const run=async()=>{ while(queue.length){ const c=queue.shift(); try{ const rs=[]; for(const rc of REG.ebird){ rs.push(...await ebird(`/data/obs/${rc}/recent/${c}`,{back,includeProvisional:true})); } ebFull[c+':'+back]=await resolveCodes(rs.map(ebToRec).filter(keep)); }catch(e){ ebFull[c+':'+back]=[]; } done++; onProgress&&onProgress(done,todo.length); } };
  for(let i=0;i<5;i++) workers.push(run()); await Promise.all(workers);
  mergeFull();
}
function mergeFull(){ const back=backDays(); const ids=new Set(ebRecords.map(r=>r.id)); Object.entries(ebFull).forEach(([k,rs])=>{ if(!k.endsWith(':'+back)) return; rs.forEach(r=>{ if(!ids.has(r.id)){ ids.add(r.id); ebRecords.push(r); } }); }); }
function setLive(cls,txt){ $('livedot').className='dotlive '+(cls==='ok'?'':cls); $('livetext').textContent=txt+(REG&&REG.bg?` · BirdGuides ${fmt(bgAsOf())}`:''); bgStaleCheck(); }
// Warn when the newest BirdGuides report held is more than a day old
function bgStaleCheck(){
  const bar=$('bgstale'); if(!bar||!REG) return;
  const ageH=(Date.now()-Date.parse(bgAsOf()))/3600e3;
  if(ageH>24){ bar.hidden=false; bar.innerHTML=`BirdGuides reports are ${ageH<48?Math.round(ageH)+' hours':Math.round(ageH/24)+' days'} old — open the BirdGuides sightings page and run <b>bgx</b> to top up. <a href="help.html">How</a>`; }
  else bar.hidden=true;
}
function bgAsOf(){ let a=REG.bg.asOf; try{ const imp=JSON.parse(localStorage.getItem(lsKey()+':bg')||'null'); if(imp&&imp.asOf>a) a=imp.asOf; }catch(e){} return a; }

// BirdGuides: snapshot + any phone import, de-duplicated by sighting id
function loadBG(){
  const grades=Object.assign({},REG.bg.grades); let recs=REG.bg.records.slice();
  try{ const imp=JSON.parse(localStorage.getItem(lsKey()+':bg')||'null'); if(imp&&imp.records){ const ids=new Set(recs.map(r=>r.id)); imp.records.forEach(r=>{ if(!ids.has(r.id)){ ids.add(r.id); recs.push(r); } }); Object.assign(grades, imp.grades||{}); } }catch(e){}
  REG._grades=grades;
  bgRecords=recs.map(r=>Object.assign({src:'BG',count:''},r));
}
// Import from the BirdGuides bookmarklet: #bg=<json>
function importBG(payload){
  // Feed every stretch that has reports in the page; returns per-region counts
  const yr=new Date().getFullYear(); const unknownSites={}; const unknownSp={}; const result={};
  const SCIFIX={'hydrobates leucorhoa':'hydrobates leucorhous'}; const SPFIX={'large shearwater sp':'lrgshe1','large auk sp':'alcid1','barolo-type shearwater':'barshe2','subalpine warbler sp':'subwar1'};
  const matchedAny=new Set();
  const anySite=n=>{ for(const reg of REGIONS){ if(reg.bgSites&&reg.bgSites[n]) return reg.bgSites[n]; } return [null,null]; };
  REGIONS.forEach(reg=>{
    const sites=reg.national?new Proxy({},{get:(_,n)=>anySite(n)}):(reg.bgSites||{}); const recs=[];
    (payload.records||[]).forEach((r,i)=>{
      if(!reg.national && !sites[r.si]) return; if(!reg.national) matchedAny.add(i);
      const parts=(r.g||'').split('-'); const sci=(parts[0]+' '+(parts[1]||'')).toLowerCase(); let t=BYSCI[SCIFIX[sci]||sci]||TAX[SPFIX[(r.sp||'').toLowerCase()]]; if(!t){ if(!reg.national){ unknownSp[r.sp]=1; return; } t=TAX['x-'+r.g]||(TAX['x-'+r.g]={c:'x-'+r.g,n:r.sp,s:sci,o:99998,f:'Other',cat:'species'}); }
      const isSub=parts.length>2 && !/^(sp|type)$/.test(parts[2]); const key=t.c+(isSub?'|'+r.sp:'');
      const [tm,dm]=r.t.split(' '); const [dd,mm]=dm.split('/');
      recs.push({id:r.id,key,name:r.sp,site:r.si,lat:sites[r.si][0],lon:sites[r.si][1],dt:`${yr}-${mm}-${dd}T${tm}`,obs:r.o||'',notes:r.n||'',flags:r.f||'',url:`https://www.birdguides.com/sightings/${r.g}/${r.id}/`});
    });
    if(!recs.length){ result[reg.id]={added:0,matched:0}; return; }
    const k='birdmap:'+reg.id+':bg';
    let store={asOf:'',records:[],grades:{}};
    try{ store=Object.assign(store,JSON.parse(localStorage.getItem(k)||'{}')); }catch(e){}
    const ids=new Set(store.records.map(r=>r.id)); let added=0; recs.forEach(r=>{ if(!ids.has(r.id)){ store.records.push(r); added++; } if(r.flags==='Mega') store.grades[r.key]='Mega'; });
    const newest=recs.reduce((m,r)=>r.dt>m?r.dt:m,''); if(newest>(store.asOf||'')) store.asOf=newest;
    const cut=Date.now()-10*864e5; store.records=store.records.filter(r=>Date.parse(r.dt)>=cut);
    try{ localStorage.setItem(k,JSON.stringify(store)); }catch(e){ toast('Import too large to store'); }
    result[reg.id]={added,matched:recs.length};
  });
  (payload.records||[]).forEach((r,i)=>{ if(!matchedAny.has(i)) unknownSites[r.si]=(unknownSites[r.si]||0)+1; });
  const parts=REGIONS.filter(r=>result[r.id]&&result[r.id].matched).map(r=>`${r.h1}: ${result[r.id].added} new of ${result[r.id].matched}`);
  const us=Object.entries(unknownSites); let msg='BirdGuides import — '+(parts.length?parts.join(' · '):'nothing matched');
  if(us.length) msg+=REGIONS.some(r=>r.national)?` · ${us.reduce((a,[,n])=>a+n,0)} outside the stretches (England & Wales only)`:` · ${us.reduce((a,[,n])=>a+n,0)} skipped elsewhere`;
  if(Object.keys(unknownSp).length) msg+=` · unmatched: ${Object.keys(unknownSp).join(', ')}`;
  toast(msg, 9000); console.log(msg, unknownSites, unknownSp);
  return result;
}
function importLife(scis){ const codes=new Set(LIFE); let n=0; scis.forEach(s=>{ const t=BYSCI[s.toLowerCase()]; if(t&&!codes.has(t.c)){ codes.add(t.c); n++; } }); try{ localStorage.setItem('birdmap:lifelist',JSON.stringify({asOf:new Date().toISOString(),codes:[...codes]})); }catch(e){} LIFE=codes; toast(`UK life list updated: ${n} new, ${codes.size} total`,6000); }
function importYear(scis){ const codes=new Set(YEAR); let n=0; scis.forEach(s=>{ const t=BYSCI[s.toLowerCase()]; if(t&&!codes.has(t.c)){ codes.add(t.c); n++; } }); try{ localStorage.setItem('birdmap:yearlist',JSON.stringify({asOf:new Date().toISOString(),codes:[...codes]})); }catch(e){} YEAR=codes; toast(`Year list updated: ${n} new, ${codes.size} total`,6000); }

// ---------- species table ----------
function buildSpecies(){
  const all=bgRecords.concat(ebRecords);
  const keys=[...new Set(all.map(r=>r.key))];
  gradeOf={}; nameOf={}; seenOf={}; liferOf={};
  SPECIES=keys.map(k=>{ const code=k.split('|')[0]; const sub=k.includes('|'); const t=TAX[code]||{n:code,o:99999,f:'Other'};
    const recs=all.filter(r=>r.key===k);
    const name= sub ? k.split('|')[1] : ((TAX[code]&&TAX[code].n)||recs[0].name||code);
    const rarity=REG._grades[k]||REG._grades[code]||'Common';
    const seen=YEAR.has(code);
    const lifer=LIFE.size>0 && !LIFE.has(code) && countable(code,recs);
    gradeOf[k]=rarity; nameOf[k]=name; seenOf[k]=seen; liferOf[k]=lifer;
    return {key:k, code, name, rarity, seen, lifer, o:(t.o||99999)+(sub?0.5:0), fam:FAMNAME[t.f]||t.f||'Other'};
  }).sort((a,b)=>a.o-b.o);
  order=Object.fromEntries(SPECIES.map((s,i)=>[s.key,i]));
}

// ---------- map ----------
let map, markers, labels, HOME, landLayer=[];
function initMap(){
  map=L.map('map',{zoomSnap:.5}); map.attributionControl.setPrefix('');
  const osm=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,opacity:.9,attribution:'© OpenStreetMap contributors · sightings © BirdGuides &amp; eBird'});
  const esri=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',{maxZoom:18,opacity:.9,attribution:'Tiles © Esri · sightings © BirdGuides &amp; eBird'});
  let errs=0, swapped=false;
  osm.on('tileerror',()=>{ errs++; const n=$('mapnote'); if(!navigator.onLine){ n.textContent='Offline — showing the coastline only.'; n.hidden=false; if(tilesOk){ tilesOk=false; styleLand(); } return; } if(errs>=4&&!swapped){ swapped=true; map.removeLayer(osm); esri.addTo(map); } });
  const ok=()=>{ $('mapnote').hidden=true; if(!tilesOk){ tilesOk=true; styleLand(); } };
  osm.on('tileload',ok); esri.on('tileload',ok);
  osm.addTo(map); markers=L.layerGroup().addTo(map); labels=L.layerGroup().addTo(map);
  map.on('zoomend',()=>{ const z=map.getZoom(); labels.getLayers().forEach(l=>l.getElement()&&(l.getElement().style.display=z>=10?'':'none')); });
}
function getCSS(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function setRegionMap(){
  landLayer.forEach(l=>map.removeLayer(l)); landLayer=[]; labels.clearLayers();
  // Coastline polygon: solid fill only when tiles are unavailable (offline); otherwise a faint outline over the real map
  const land=L.polygon(REG.land.map(p=>[p[1],p[0]]),{interactive:false}).addTo(map); landLayer.push(land);
  REG.islands.forEach(i=>{ const l=L.polygon(i.map(p=>[p[1],p[0]]),{interactive:false}).addTo(map); landLayer.push(l); });
  styleLand();
  REG.labels.forEach(([n,la,lo])=>L.marker([la,lo],{icon:L.divIcon({className:'sitelabel',html:n,iconAnchor:[-6,-6]}),interactive:false,keyboard:false}).addTo(labels));
  HOME=L.latLngBounds(REG.home); map.fitBounds(HOME);
}
let tilesOk=false;
function styleLand(){ const st=tilesOk?{color:getCSS('--accent'),weight:1,opacity:.25,fillOpacity:0}:{color:'transparent',fillColor:getCSS('--land'),fillOpacity:1}; landLayer.forEach(l=>l.setStyle(st)); }
function drawMarkers(recs, single){
  markers.clearLayers(); const g={};
  const unplaced=recs.filter(r=>!hasPos(r)).length; recs=recs.filter(hasPos);
  const n0=$('mapnote'); if(unplaced){ n0.textContent=`${unplaced} report${unplaced===1?'':'s'} at sites without map coordinates — see the list`; n0.hidden=false; } else if(/without map/.test(n0.textContent)) n0.hidden=true;
  recs.forEach(r=>{ const k=r.lat.toFixed(4)+','+r.lon.toFixed(4); (g[k]=g[k]||{lat:r.lat,lon:r.lon,rs:[],sites:new Set()}).rs.push(r); g[k].sites.add(r.site); });
  Object.values(g).forEach(gr=>{
    gr.rs.sort((a,b)=>b.dt.localeCompare(a.dt));
    const top=GRADES.find(G=>gr.rs.some(r=>gradeOf[r.key]===G))||'Common';
    const n=single?gr.rs.length:new Set(gr.rs.map(r=>r.key)).size;
    const size=Math.max(22,Math.min(44,16+5*Math.sqrt(n)));
    const hasLifer=gr.rs.some(r=>liferOf[r.key]);
    const icon=L.divIcon({className:'',html:`<div class="mk ${hasLifer?'lifer':''}" style="--c:${GC[top]};width:${size}px;height:${size}px">${n}</div>`,iconSize:[size,size],iconAnchor:[size/2,size/2]});
    const m=L.marker([gr.lat,gr.lon],{icon}).addTo(markers); const siteName=[...gr.sites][0];
    m.bindPopup(()=>{ let h=`<div class="pp"><h3>${esc(siteName)}</h3>`;
      if(single){ gr.rs.forEach(r=>{ h+=`<div class="row"><div class="when">${fmt(r.dt)}${r.obs?' · seen '+esc(r.obs):''} · ${r.src==='BG'?'BirdGuides':'eBird'}${r.count?' · '+esc(r.count):''}</div>${r.notes?'<div>'+esc(r.notes)+'</div>':''}${r.flags?'<div class="when">'+esc(r.flags)+'</div>':''}</div>`; }); }
      else { const by={}; gr.rs.forEach(r=>{(by[r.key]=by[r.key]||[]).push(r);}); Object.keys(by).sort((a,b)=>order[a]-order[b]).sort((a,b)=>GRADES.indexOf(gradeOf[a])-GRADES.indexOf(gradeOf[b])).forEach(k=>{ const rs=by[k]; h+=`<div class="row"><span class="sw" style="background:${GC[gradeOf[k]]}"></span><b>${liferOf[k]?'<span class="star">★</span>':''}${esc(nameOf[k])}</b> <span class="when">${rs.length} · last ${fmt(rs[0].dt)}</span></div>`; }); }
      return h+'</div>'; },{maxWidth:320});
  });
}

// ---------- rendering ----------
function inWindow(r){ return (nowMs-Date.parse(r.dt))<=state.hours*3600e3; }
function visible(r){ return inWindow(r) && (state.src==='all'||r.src===state.src); }
function currentBySp(){ const by={}; bgRecords.concat(ebRecords).filter(visible).forEach(r=>{(by[r.key]=by[r.key]||[]).push(r);}); return by; }
function seenOk(seen,lifer){ return state.seen==='all' || (state.seen==='lifer' ? !!lifer : (state.seen==='seen')===!!seen); }
function shownSpecies(by){ const q=state.q.toLowerCase(); return SPECIES.filter(s=>by[s.key]&&state.grades.has(s.rarity)&&seenOk(s.seen,s.lifer)&&(!q||s.name.toLowerCase().includes(q))); }
function render(){
  const by=currentBySp(); const shown=shownSpecies(by);
  $('nsp').textContent=shown.length; $('tabcount').textContent='('+shown.length+')';
  $('nrec').textContent=shown.reduce((a,s)=>a+by[s.key].length,0);
  let html='',lastFam=null;
  shown.forEach(s=>{ if(s.fam!==lastFam){ html+=`<div class="fam">${esc(s.fam)}</div>`; lastFam=s.fam; }
    const rs=by[s.key].slice().sort((a,b)=>b.dt.localeCompare(a.dt)); const bg=rs.filter(r=>r.src==='BG').length, eb=rs.length-bg;
    html+=`<button class="sp" role="option" data-sp="${esc(s.key)}" aria-pressed="${state.sel===s.key}" style="--c:${GC[s.rarity]}" title="${s.rarity}">
      <span class="dot"></span><span class="name ${s.rarity==='Mega'?'mega':''}">${s.lifer?'<span class="star" title="Would be a UK lifer">★</span>':''}${esc(s.name)}${s.seen?'<span class="tick" title="On your year list">2026</span>':''}</span>
      <span class="meta">${bg?`<i>${bg}</i> BG`:''}${bg&&eb?' · ':''}${eb?`<i class="live">${eb}</i> eB`:''}</span>
      <span class="last">last ${fmt(rs[0].dt)} · ${esc(rs[0].site.replace(/--.*$/,''))}</span></button>`; });
  $('list').innerHTML=html||'<div class="empty">Nothing matches these filters.</div>';
  const sites=state.view==='sites';
  $('list').hidden=sites; $('lh-species').hidden=sites; $('sites').hidden=!sites; $('lh-sites').hidden=!sites;
  if(sites) renderSites(shown,by); else updateMap(by);
}
async function updateMap(by){
  const detail=$('detail');
  if(state.sel){
    if(!state.sel.includes('|') && !ebFull[state.sel+':'+backDays()] && REG.ebird.length){ $('prog').hidden=false; $('prog').textContent='Fetching all eBird locations…'; await ensureFull([state.sel]); $('prog').hidden=true; by=currentBySp(); }
    const rs=(by[state.sel]||[]).slice().sort((a,b)=>b.dt.localeCompare(a.dt));
    drawMarkers(rs,true); detail.hidden=false; const g=gradeOf[state.sel];
    $('ddot').style.setProperty('--c',GC[g]); $('dgrade').style.setProperty('--c',GC[g]); $('dgrade').textContent=g+(liferOf[state.sel]?' · UK lifer':''); $('dname').textContent=(liferOf[state.sel]?'★ ':'')+nameOf[state.sel];
    $('selnote').textContent=`${rs.length} record${rs.length===1?'':'s'} mapped`;
    const chip=$('selchip'); chip.hidden=false; chip.style.setProperty('--c',GC[g]); $('chipname').textContent=`${nameOf[state.sel]} · ${rs.length}`;
    $('recs').innerHTML=rs.length?rs.map(r=>`<div class="rec"><div><div class="when">${fmt(r.dt)}</div><div class="src">${r.src==='BG'?'BirdGuides':'eBird'}</div></div>
      <div class="site"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.site)}</a>${r.count?' <span class="when">× '+esc(r.count)+'</span>':''}${r.obs?' <span class="when">seen '+esc(r.obs)+'</span>':''}${r.flags?'<span class="flag">'+esc(r.flags)+'</span>':''}</div>
      ${r.notes?`<div class="note">${esc(r.notes)}</div>`:''}</div>`).join(''):'<div class="empty">No records in this window.</div>';
    const pos=rs.filter(hasPos); if(pos.length){ map.fitBounds(L.latLngBounds(pos.map(r=>[r.lat,r.lon])).pad(.4),{maxZoom:13}); }
  } else {
    const all=[].concat(...Object.keys(by).filter(k=>state.grades.has(gradeOf[k])&&seenOk(seenOf[k],liferOf[k])).map(k=>by[k]));
    drawMarkers(all,false); detail.hidden=true; $('selnote').textContent='Tap a species to map it'; $('selchip').hidden=true;
  }
}
const areaOf=site=>{ for(const [n,src] of REG.areas){ if(new RegExp(src,'i').test(site)) return n; } return site.replace(/--.*$/,''); };
async function renderSites(shown,by){
  // make sure every shown species has all its eBird locations (not just the latest)
  const need=shown.map(s=>s.key).filter(k=>!k.includes('|')&&!ebFull[k+':'+backDays()]);
  if(need.length&&REG.ebird.length){ const p=$('prog'); p.hidden=false; p.textContent=`Fetching eBird locations for ${need.length} species…`; await ensureFull(need,(d,n)=>p.textContent=`Fetching eBird locations… ${d}/${n}`); p.hidden=true; by=currentBySp(); }
  const fresh=nowMs-36*3600e3; const areas={};
  shown.forEach(s=>{ (by[s.key]||[]).forEach(r=>{ const a=areaOf(r.site); const A=areas[a]=areas[a]||{name:a,sp:{},recs:[]}; A.recs.push(r); const S=A.sp[s.key]=A.sp[s.key]||{n:0,last:'',g:s.rarity}; S.n++; if(r.dt>S.last) S.last=r.dt; }); });
  const rows=Object.values(areas).map(A=>{ const keys=Object.keys(A.sp); return {...A,count:keys.length,freshCount:keys.filter(k=>Date.parse(A.sp[k].last)>=fresh).length,keys}; });
  rows.sort((a,b)=>(state.skipped.has(a.name)-state.skipped.has(b.name))||(b.count-a.count)||(b.freshCount-a.freshCount));
  $('siteshint').textContent=state.seen==='unseen'?'Ranked by species you still need in this window':(state.seen==='seen'?'Ranked by species already on your list':'Ranked by species reported in this window');
  $('gapsbtn').hidden=state.seen==='unseen'; let rank=0;
  $('sites').innerHTML=rows.length?rows.map(A=>{ const sk=state.skipped.has(A.name); if(!sk) rank++;
    const chips=A.keys.sort((x,y)=>(GRADES.indexOf(A.sp[x].g)-GRADES.indexOf(A.sp[y].g))||(A.sp[y].n-A.sp[x].n)).map(k=>`<span class="${Date.parse(A.sp[k].last)>=fresh?'fresh':''}" title="${A.sp[k].n} report${A.sp[k].n===1?'':'s'}, last ${fmt(A.sp[k].last)}"><span class="sw" style="background:${GC[A.sp[k].g]}"></span>${liferOf[k]?'<span class="star">★</span>':''}${esc(nameOf[k])}</span>`).join('');
    return `<button class="area ${sk?'skipped':''}" type="button" data-area="${esc(A.name)}" aria-pressed="${state.area===A.name}"><span class="rank">${sk?'–':rank}</span><span class="aname">${esc(A.name)}</span><span class="score"><b>${A.count}</b> species<br>${A.freshCount} in last 36 h</span><span class="chips">${chips}</span><span class="skip">${sk?'Skipped · <u data-unskip="1">include again</u>':'<u data-skip="1">Skip this site</u>'}</span></button>`; }).join(''):'<div class="empty">Nothing matches these filters.</div>';
  const detail=$('detail'); $('selchip').hidden=true; const sel=rows.find(r=>r.name===state.area);
  if(sel){ drawMarkers(sel.recs,false); detail.hidden=false; $('ddot').style.setProperty('--c','var(--accent)'); $('dgrade').style.setProperty('--c','var(--muted)'); $('dgrade').textContent=`${sel.count} species`; $('dname').textContent=sel.name;
    $('recs').innerHTML=sel.keys.map(k=>`<div class="rec"><div><div class="when">${fmt(sel.sp[k].last)}</div><div class="src">${sel.sp[k].n} report${sel.sp[k].n===1?'':'s'}</div></div><div class="site"><span class="sw" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${GC[sel.sp[k].g]};margin-right:5px"></span><span class="sp-name">${liferOf[k]?'<span class="star">★</span>':''}${esc(nameOf[k])}</span></div></div>`).join('');
    const pos=sel.recs.filter(hasPos); if(pos.length) map.fitBounds(L.latLngBounds(pos.map(r=>[r.lat,r.lon])).pad(.5),{maxZoom:13}); const chip=$('selchip'); chip.hidden=false; chip.style.setProperty('--c','var(--accent)'); $('chipname').textContent=`${sel.name} · ${sel.count}`; }
  else { drawMarkers([].concat(...rows.filter(A=>!state.skipped.has(A.name)).map(A=>A.recs)),false); detail.hidden=true; }
}

// ---------- UI wiring ----------
const narrow=()=>window.matchMedia('(max-width:820px), (max-height:520px)').matches;
function setPane(p){ document.body.dataset.pane=p; [...$('panetabs').children].forEach(b=>b.setAttribute('aria-pressed',b.dataset.pane===p&&(!b.dataset.view||b.dataset.view===state.view))); if(p==='map') setTimeout(()=>map.invalidateSize(),50); }
function setView(v){ state.view=v; [...$('viewseg').children].forEach(c=>c.setAttribute('aria-pressed',c.dataset.v===v)); if(v==='sites'){ state.sel=null; if(state.seen==='all'){ state.seen='unseen'; segSync('seen','v'); savePrefs(); } } else { state.area=null; map.fitBounds(HOME); } render(); }
function segSync(id,attr){ [...$(id).children].forEach(c=>c.setAttribute('aria-pressed',String(c.dataset[attr])===String(state[id==='win'?'hours':id==='src'?'src':'seen']))); }
function wire(){
  $('panetabs').addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; if(b.dataset.view&&b.dataset.view!==state.view) setView(b.dataset.view); setPane(b.dataset.pane); });
  $('viewseg').addEventListener('click',e=>{ const b=e.target.closest('button'); if(b) setView(b.dataset.v); });
  $('filtbtn').addEventListener('click',()=>{ const h=document.querySelector('header'); const open=!h.classList.contains('open'); h.classList.toggle('open',open); $('filtbtn').setAttribute('aria-expanded',open); setTimeout(()=>map.invalidateSize(),50); });
  window.addEventListener('resize',()=>{ if(!narrow()) document.body.dataset.pane='map'; setTimeout(()=>map.invalidateSize(),50); });
  $('chiplist').addEventListener('click',()=>setPane('list'));
  $('chipclear').addEventListener('click',()=>{ state.sel=null; state.area=null; render(); map.fitBounds(HOME); });
  $('dclose').addEventListener('click',()=>{ state.sel=null; state.area=null; render(); map.fitBounds(HOME); if(narrow()) setPane('list'); });
  $('list').addEventListener('click',e=>{ const b=e.target.closest('.sp'); if(!b) return; const k=b.dataset.sp; state.sel=state.sel===k?null:k; state.area=null; render(); if(state.sel&&narrow()) setPane('map'); });
  $('sites').addEventListener('click',e=>{ const u=e.target.closest('u'); const b=e.target.closest('.area'); if(!b) return; const a=b.dataset.area;
    if(u&&u.dataset.skip){ state.skipped.add(a); if(state.area===a) state.area=null; savePrefs(); render(); return; }
    if(u&&u.dataset.unskip){ state.skipped.delete(a); savePrefs(); render(); return; }
    state.area=state.area===a?null:a; render(); if(state.area&&narrow()) setPane('map'); });
  $('gapsbtn').addEventListener('click',()=>{ state.seen='unseen'; segSync('seen','v'); savePrefs(); render(); });
  $('win').addEventListener('click',async e=>{ const b=e.target.closest('button'); if(!b) return; state.hours=Number(b.dataset.h); segSync('win','h'); savePrefs(); await loadLive(false); buildSpecies(); render(); });
  $('src').addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; state.src=b.dataset.s; segSync('src','s'); savePrefs(); render(); });
  $('seen').addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; state.seen=b.dataset.v; segSync('seen','v'); savePrefs(); render(); });
  $('rar').innerHTML=GRADES.map(g=>`<button class="pill" type="button" data-g="${g}" aria-pressed="true" style="--c:${GC[g]}"><span class="dot"></span>${g}</button>`).join('');
  $('rar').addEventListener('click',e=>{ const b=e.target.closest('.pill'); if(!b) return; const g=b.dataset.g; if(state.grades.has(g)) state.grades.delete(g); else state.grades.add(g); b.setAttribute('aria-pressed',state.grades.has(g)); render(); });
  $('q').addEventListener('input',e=>{ state.q=e.target.value.trim(); render(); });
  $('refreshbtn').addEventListener('click',async()=>{ await loadLive(true); buildSpecies(); render(); toast('eBird refreshed'); });
  $('region').addEventListener('change',e=>switchRegion(e.target.value));
  window.addEventListener('hashchange',handleHash);
  document.addEventListener('visibilitychange',async()=>{ if(document.visibilityState==='visible' && liveCache[REG.id+':'+backDays()] && Date.now()-liveCache[REG.id+':'+backDays()].at>15*60e3){ await loadLive(true); buildSpecies(); render(); } });
}
function handleHash(){
  const h=location.hash.slice(1); if(!h) return; const m=h.match(/^(bg|yl|r)=(.*)$/s); if(!m) return;
  history.replaceState(null,'',location.pathname+location.search);
  try{
    if(m[1]==='bg'){ const p=JSON.parse(decodeURIComponent(m[2])); const res=importBG(p);
      // stay on the current stretch if it got reports; otherwise go to the stretch that did
      const cur=res[REG.id]&&res[REG.id].matched; const best=REGIONS.filter(r=>!r.national&&res[r.id]&&res[r.id].matched).sort((a,b)=>res[b.id].matched-res[a.id].matched)[0];
      if(!cur && best && best.id!==REG.id){ switchRegion(best.id); } else { loadBG(); buildSpecies(); render(); } }
    else if(m[1]==='yl'){ importYear(decodeURIComponent(m[2]).split('|')); buildSpecies(); render(); }
    else if(m[1]==='ll'){ importLife(decodeURIComponent(m[2]).split('|')); buildSpecies(); render(); }
    else if(m[1]==='r'){ switchRegion(m[2]); }
  }catch(e){ console.error(e); toast('Import failed: '+e.message,6000); }
}
async function switchRegion(id){
  REG=REGIONS.find(r=>r.id===id)||REGIONS[0]; try{ localStorage.setItem('birdmap:region',REG.id); }catch(e){}
  $('region').value=REG.id; document.title=REG.title; $('h1text').textContent=REG.h1; $('subtitle').textContent=REG.subtitle+' · BirdGuides & eBird · checked against Simon\'s 2026 UK year list';
  state.sel=null; state.area=null; loadPrefs(); segSync('win','h'); segSync('src','s'); segSync('seen','v');
  setRegionMap(); loadBG(); ebRecords=[]; buildSpecies(); render();
  await loadLive(false); buildSpecies(); render();
}
async function boot(){
  initMap(); wire();
  const [tax,regions,yl,ll]=await Promise.all([getJSON('data/taxonomy.json'),getJSON('data/regions.json'),getJSON('data/yearlist.json'),getJSON('data/lifelist.json').catch(()=>({asOf:'',codes:[]}))]);
  LIFE=new Set(ll.codes); try{ const o=JSON.parse(localStorage.getItem('birdmap:lifelist')||'null'); if(o&&o.asOf>ll.asOf) LIFE=new Set(o.codes); }catch(e){}
  tax.forEach(t=>{ TAX[t.c]=t; BYSCI[t.s.toLowerCase()]=t; }); REGIONS=regions; YEAR_META=yl; YEAR=new Set(yl.codes);
  try{ const o=JSON.parse(localStorage.getItem('birdmap:yearlist')||'null'); if(o&&o.asOf>yl.asOf) YEAR=new Set(o.codes); }catch(e){}
  $('region').innerHTML=REGIONS.map(r=>`<option value="${r.id}">${esc(r.h1)}</option>`).join('');
  let id=null; try{ id=localStorage.getItem('birdmap:region'); }catch(e){}
  const hm=location.hash.match(/^#r=(\w+)/); if(hm) id=hm[1];
  await switchRegion(id||REGIONS[0].id);
  handleHash();
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js').catch(()=>{}); }
}
boot().catch(e=>{ console.error(e); setLive('err','Failed to load: '+e.message); });
})();
