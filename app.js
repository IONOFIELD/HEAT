"use strict";
const APP_V="20261010160033";
/* Self-update: GitHub Pages caches the page for ~10 min; if a newer build is live, reload into it once. */
(async()=>{ try{ const r=await fetch("version.json?t="+Date.now(),{cache:"no-store"}); const j=await r.json(); if(j.v && j.v!==APP_V && sessionStorage.getItem("henrys.upd")!==j.v){ sessionStorage.setItem("henrys.upd",j.v); location.replace(location.pathname+"?u="+j.v); } }catch{} })();
/* works with no signal: keep the app and the map on the phone */
if("serviceWorker" in navigator && location.protocol==="https:") addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
function netPill(){ let p=document.getElementById("netPill"); if(navigator.onLine){ p?.remove(); return; } if(!p){ p=document.createElement("div"); p.id="netPill"; p.className="netpill"; p.setAttribute("role","status"); p.textContent="No signal · everything you log still saves"; document.body.appendChild(p); } }
addEventListener("offline",netPill); addEventListener("online",()=>{ netPill(); if(typeof toast==="function") toast("Back online"); }); netPill();
/* =========================================================================
   HEAT — field sales map for a Henry's rep
   Map: MapLibre GL + OpenFreeMap vector tiles (© OpenStreetMap contributors)
   Search: Photon (komoot) · Nearby finder: Overpass API · Zones: county lines
   Storage: this device (localStorage). Swap Store for Supabase later.
   ========================================================================= */

/* ---------- Henry's wholesale menu ---------- */
const CATS = {preroll:"Pre-Rolls", infused:"Infused", flower:"Flower"};
const BASE_CATALOG = [
  {id:"p1single", cat:"preroll", name:"1G Craft Single", pack:"28 packs/case", price:119, strains:["Green Crack","OG Kush","Strawberry Cheesecake","Grape Ape"]},
  {id:"p05x4", cat:"preroll", name:".5G 4-Pack", pack:"10 packs/case", price:100, strains:["Jack The Ripper","Lavender Haze","Colombian Cookies","Gorilla Diesel","White Widow","Cherry AK","Pluto","Ghost OG","Coast 1:1 CBD:THC"]},
  {id:"pinf4", cat:"infused", name:".5G Infused 4-Pack", pack:"10 packs/case", price:140, strains:["Alaskan Thunder","White Widow","Pluto"]},
  {id:"p05x14", cat:"preroll", name:".5 Gram 14-Pack", pack:"12 packs/case", price:240, strains:["Sour Diesel","Dream Walker","Northern Lights"]},
  {id:"p05x28", cat:"preroll", name:".5 Gram 28-Pack", pack:"8 packs/case", price:296, strains:["Blue Dream","Mac","Cherry AK","King Louis XIII"], sale:{"Cherry AK":148}},
  {id:"p1x14", cat:"preroll", name:"1 Gram 14-Pack", pack:"8 packs/case", price:296, strains:["Maui Wowie","Tangerine Dream","Blueberry","Platinum OG"], sale:{"Blueberry":148}},
  {id:"f35jar", cat:"flower", name:"3.5 Gram Craft Jar", pack:"16 jars/case", price:176, strains:["Watermelon Dream","Oakland Piff","OG Chem","Pluto","Grape Ape"]},
  {id:"f7smalls", cat:"flower", name:"7 Gram Smalls Pouch", pack:"20 packs/case", price:160, strains:["Pink Certz"]},
  {id:"f28smalls", cat:"flower", name:"28 Gram Smalls Pouch", pack:"8 packs/case", price:216, strains:["Pink Certz","Black Cherry Gelato","Donny Burger"]},
  {id:"f7pouch", cat:"flower", name:"7 Gram Pouch", pack:"20 packs/case", price:240, strains:["Chemdawg 91","Blueberry Diesel","White Runtz","Pink Certz","Afghani"]},
];
/* The menu changes. It lives on the device and the rep edits it; this is the Sept 30, 2026 printed menu as a starting point. */
const MENU_KEY="henrys.menu";
let MENU, CATALOG, LINE;
function loadMenu(){ MENU = lsGet(MENU_KEY) || {updatedAt:"2026-09-30T12:00:00.000Z", lines:JSON.parse(JSON.stringify(BASE_CATALOG))};
  MENU.lines.forEach(l=>{ l.sale=l.sale||{}; l.strains=l.strains||[]; });
  CATALOG = MENU.lines.filter(l=>!l.off && l.strains.length); LINE = Object.fromEntries(MENU.lines.map(l=>[l.id,l])); }
function saveMenu(){ MENU.updatedAt=new Date().toISOString(); lsSet(MENU_KEY, MENU); loadMenu(); }
const saleOf=(line,strain)=>LINE[line]?.sale?.[strain];
const STAGES = [["new","New lead"],["visited","Visited"],["sampled","Sampled"],["negotiating","Negotiating"],["verbal","Verbal yes"],["confirmed","Email confirmed"],["ordered","Ordered"],["lost","Fell through"]];
const SNAME = Object.fromEntries(STAGES);
const SORDER = Object.fromEntries(STAGES.map((s,i)=>[s[0],i]));
const TOUCH = {visit:"Visited",sample:"Dropped samples",call:"Call / text",negotiating:"Negotiating",verbal:"Verbal yes",email:"Confirmation email sent",order:"Order placed",lost:"Deal fell through",note:"Note",text:"Message sent"};
const TIERS = ["S","A","B","C","D"];
const HOUSES = ["Rolls","Infused","8ths","Smalls","Ounces","Mixed"];
const LOST_REASONS = ["Price","Went with another brand","Buyer changed / left","Budget or cash timing","Stopped responding","Out of shelf space","Other"];
const REP_DEFAULT = {name:"", phone:""};
/* The rep's own name and contact line are typed in on the device and never leave it. */
const repInfo=()=>({...REP_DEFAULT,...(lsGet("henrys.rep")||{})});
const repFirst=()=>(repInfo().name||"").trim().split(/\s+/)[0]||"";
const repWho=(w="from")=>repFirst()?`it's ${repFirst()} ${w} Henry's`:`it's your rep ${w} Henry's`;
const routeLabel=()=>repFirst()?`${esc(repFirst())}’s route`:"Your route";
const COLORS = {g:"#4ade80", y:"#facc15", r:"#fb7185", n:"#8b84ad"};
const BAY_BBOX = [-123.6, 36.85, -121.2, 38.9];
const SF_BOUNDS = [[-122.515,37.707],[-122.357,37.811]];   // San Francisco proper: default view

/* ---------- utilities ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const DAY = 864e5;
const now = () => Date.now();
const sod = t => { const d=new Date(t); d.setHours(0,0,0,0); return d.getTime(); };
const daysSince = iso => iso ? Math.floor((sod(now()) - sod(Date.parse(iso)))/DAY) : null;
const daysUntil = iso => iso ? Math.round((sod(Date.parse(iso)) - sod(now()))/DAY) : null;
const isoDaysAgo = d => new Date(sod(now()) - d*DAY + 12*3600e3).toISOString();
const isoInDays = d => isoDaysAgo(-d);
const ago = d => d==null ? "never" : d===0 ? "today" : d===1 ? "yesterday" : d+"d ago";
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString(undefined,{month:"short",day:"numeric"}) : "—";
const money = n => "$"+(Math.round(n*100)/100).toLocaleString(undefined,{maximumFractionDigits:2});
const uid = () => "s"+Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4);
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const lsSet = (k,v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const clone = o => JSON.parse(JSON.stringify(o));
function miles(a,b){ if(!a||!b||a.lat==null||b.lat==null) return null; const R=3958.8, r=x=>x*Math.PI/180;
  const dLa=r(b.lat-a.lat), dLo=r(b.lon-a.lon); const h=Math.sin(dLa/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLo/2)**2; return 2*R*Math.asin(Math.sqrt(h)); }
const fmtMi = m => m==null ? "" : m<0.1 ? "here" : m<10 ? m.toFixed(1)+" mi" : Math.round(m)+" mi";

loadMenu();

/* ---------- zones (real county lines) ---------- */
const ZONE_NAMES = {"San Francisco":"San Francisco","San Mateo":"Peninsula · San Mateo","Santa Clara":"South Bay · Santa Clara","Alameda":"East Bay · Alameda","Contra Costa":"Contra Costa","Marin":"Marin","Sonoma":"Sonoma","Napa":"Napa","Solano":"Solano","Santa Cruz":"Santa Cruz","Lake":"Lake County"};
const ZINFO = (window.ZONES?.features||[]).map(f=>{
  const polys = f.geometry.type==="Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  let minX=180,minY=90,maxX=-180,maxY=-90, best=null, bestN=0;
  polys.forEach(p=>{ p[0].forEach(([x,y])=>{minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}); if(p[0].length>bestN){bestN=p[0].length;best=p[0];} });
  let cx=0,cy=0; best.forEach(([x,y])=>{cx+=x;cy+=y;}); cx/=best.length; cy/=best.length;
  const id=f.properties.name;
  return {id, label:ZONE_NAMES[id]||id, polys, bbox:[[minX,minY],[maxX,maxY]], center:[cx,cy]};
});
const ZMAP = Object.fromEntries(ZINFO.map(z=>[z.id,z]));
function inRing(x,y,ring){ let ins=false; for(let i=0,j=ring.length-1;i<ring.length;j=i++){ const [xi,yi]=ring[i],[xj,yj]=ring[j]; if(((yi>y)!==(yj>y)) && (x<(xj-xi)*(y-yi)/(yj-yi)+xi)) ins=!ins; } return ins; }
function zoneOf(lat,lon){ if(lat==null||lon==null) return null;
  for(const z of ZINFO) for(const p of z.polys) if(inRing(lon,lat,p[0])) return z.id;
  // just offshore / on a pier: nearest zone center within ~15 mi
  let best=null,bd=1e9; ZINFO.forEach(z=>{ const d=miles({lat,lon},{lat:z.center[1],lon:z.center[0]}); if(d<bd){bd=d;best=z.id;} }); return bd<25?best:null; }
const zoneLabel = id => ZMAP[id]?.label || "Outside the Bay Area";

/* ---------- storage (this device; swap for Supabase later) ---------- */
const KEY = "henrys.shops.v1";
const Store = {
  all(){ return lsGet(KEY) || []; },
  write(arr){ lsSet(KEY, arr); },
  save(c){ c.updatedAt=new Date().toISOString(); const a=this.all(); const i=a.findIndex(x=>x.id===c.id); if(i>=0) a[i]=c; else a.push(c); this.write(a); },
  remove(id){ this.write(this.all().filter(x=>x.id!==id)); },
};
let shops = Store.all();
function firstRun(){ if(localStorage.getItem("henrys.seeded")) return; if(!Store.all().length && window.HENRYS_RETAILERS) Store.write(window.HENRYS_RETAILERS.map(retailerToShop)); try{localStorage.setItem("henrys.seeded","1");}catch{} shops=Store.all(); }
function refresh(){ shops = Store.all().sort((a,b)=>a.name.localeCompare(b.name)); render(); updateMapData(); }
function saveShop(c){ if(c.lat!=null) c.zone = zoneOf(c.lat,c.lon); Store.save(c); refresh(); }
function removeShop(id){ Store.remove(id); refresh(); }

/* ---------- health: why a store is green / yellow / red ---------- */
const RANK = {g:0,n:0,y:1,r:2};
function health(c, cat="all"){
  if (cat!=="all"){
    const s=c.stock?.[cat]||"none";
    if(s==="ok") return {lv:"g",reasons:[CATS[cat]+" stocked"]};
    if(s==="low") return {lv:"y",reasons:["Low on "+CATS[cat]]};
    if(s==="out") return {lv:"r",reasons:["Out of "+CATS[cat]]};
    return {lv:"n",reasons:["Doesn't carry "+CATS[cat]+" yet"]};
  }
  if((c.stage||"new")==="new" && !(c.touches||[]).length){ const fu0=daysUntil(c.nextFollowUp); return fu0!=null&&fu0<0 ? {lv:"y",reasons:["Not visited yet · follow-up overdue"]} : {lv:"n",reasons:["Not visited yet"]}; }
  const out=[]; const add=(lv,t)=>out.push({lv,t});
  const sd=daysSince(c.stageAt), lc=daysSince(c.lastContact), fu=daysUntil(c.nextFollowUp);
  if(c.stage==="verbal") sd>=2 ? add("r",`Verbal yes ${sd}d ago, no confirmation email`) : add("y","Verbal yes: send confirmation email");
  if(c.stage==="confirmed") sd>=4 ? add("r",`Confirmed ${sd}d ago, still no order`) : add("y","Confirmed: waiting on their order");
  if(c.stage==="negotiating") add("y","Negotiating");
  if(c.stage==="lost") add("y",`Fell through ${ago(sd)}: re-approach`);
  if(fu!=null && fu<0) add(fu<-2?"r":"y",`Follow-up ${-fu}d overdue`); else if(fu===0) add("y","Follow-up due today");
  if(lc==null) add("y","Not visited yet"); else if(lc>=21) add("r",`No contact in ${lc}d`); else if(lc>=10) add("y",`No contact in ${lc}d`);
  for(const k of Object.keys(CATS)){ const s=c.stock?.[k]; if(s==="out") add("r","Out of "+CATS[k]); else if(s==="low") add("y","Low on "+CATS[k]); }
  if(!out.length){ const od=daysSince(c.lastOrderAt); return {lv:"g",reasons:[od!=null?`Ordered ${ago(od)}`:"On track"]}; }
  out.sort((a,b)=>RANK[b.lv]-RANK[a.lv]);
  return {lv:out[0].lv, reasons:out.map(o=>o.t), detail:out};
}
function orderStatus(c){ const od=daysSince(c.lastOrderAt); if(od!=null&&od<=30&&c.stage!=="lost") return "placed"; if(["negotiating","verbal","confirmed"].includes(c.stage)) return "pending"; return "absent"; }
function zoneSummary(zid, cat){
  const list=shops.filter(c=>c.zone===zid); const cnt={g:0,y:0,r:0,n:0}; list.forEach(c=>cnt[health(c,cat).lv]++);
  const scored=cnt.g+cnt.y+cnt.r; let lv="n"; if(scored){ const s=(2*cnt.r+cnt.y)/(2*scored); lv=s<.25?"g":s<=.5?"y":"r"; }
  const ord={placed:0,pending:0,absent:0}; list.forEach(c=>ord[orderStatus(c)]++);
  return {list,cnt,lv,ord};
}

/* ---------- UI state ---------- */
const ui = lsGet("henrys.ui") || {};
let view = "map", cat = ui.cat || "all", query="", pageQuery="";
let sheet = null; // {type, id?, data?}
let selectMode=false, selected=new Set();
let draft = {}, pendingSheet=false, me=null, ghosts=[];
const remember = () => lsSet("henrys.ui",{view,cat,camera: map ? {c:map.getCenter(), z:map.getZoom()} : ui.camera});

/* ---------- map ---------- */
let map=null, mapReady=false;
function recolor(style){
  for(const L of style.layers){
    const id=L.id; const p=L.paint=L.paint||{};
    if(L.type==="background") p["background-color"]="#140f27";
    else if(L.type==="fill"){
      delete p["fill-pattern"];
      if(/water/.test(id)) p["fill-color"]="#1e1949";
      else if(/park|wood|grass/.test(id)){ p["fill-color"]="#16272a"; p["fill-opacity"]=0.75; }
      else if(/building/.test(id)){ p["fill-color"]="#251d44"; p["fill-outline-color"]="#33295c"; p["fill-opacity"]=1; }
      else if(/ice|glacier/.test(id)) p["fill-color"]="#1c1838";
      else if(/residential/.test(id)) { p["fill-color"]="#19132f"; p["fill-opacity"]=1; }
      else p["fill-color"]="#1b1534";
    } else if(L.type==="line"){
      delete p["line-pattern"];
      let c="#3a2f68";
      if(/water/.test(id)) c="#1e1949";
      else if(/motorway/.test(id)) c=/casing/.test(id)?"#140f27":/subtle/.test(id)?"#7a4a26":"#d1813f";
      else if(/major/.test(id)) c=/casing/.test(id)?"#140f27":/subtle/.test(id)?"#3b306b":"#6a58b5";
      else if(/minor|pier/.test(id)) c="#372c63";
      else if(/path/.test(id)) c="#2c2452";
      else if(/rail/.test(id)) c="#3d3560";
      else if(/boundary/.test(id)) c="#6a5fa6";
      else if(/aeroway/.test(id)) c="#2b2349";
      p["line-color"]=c;
    } else if(L.type==="symbol" && !/shield/.test(id)){
      p["text-halo-color"]="#140f27"; p["text-halo-width"]=1.4;
      p["text-color"] = /water/.test(id) ? "#8d86d9" : /highway|road/.test(id) ? "#bdb3ea" : "#efeaff";
    }
  }
  return style;
}
async function initMap(){
  let style="https://tiles.openfreemap.org/styles/positron";
  try { const r=await fetch(style); style=recolor(await r.json()); } catch { /* fall back to stock style */ }
  const cam = ui.camera;
  map = new maplibregl.Map({container:"map", style, center: [-122.436,37.759], zoom: 12, attributionControl:{compact:true}, pixelRatio:Math.min(4,(window.devicePixelRatio||1)*(window.UI_K||1)), maxPitch:0, dragRotate:false, pitchWithRotate:false});
  addEventListener("resize",()=>{ if(!map) return; try{ map.setPixelRatio(Math.min(4,(window.devicePixelRatio||1)*(window.UI_K||1))); }catch{} map.resize(); });
  map.touchZoomRotate.disableRotation();
  map.on("moveend", remember);
  map.on("load", ()=>{
    const firstSym = map.getStyle().layers.find(l=>l.type==="symbol")?.id;
    map.addSource("zones",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
    map.addSource("zlabels",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
    map.addSource("pins",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
    map.addSource("ghosts",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
    map.addSource("me",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
    map.addSource("route",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
    heatKey=""; map.addSource("heat",{type:"image",url:heatField(),coordinates:heatCoords()});
    map.addLayer({id:"heat",type:"raster",source:"heat",paint:{"raster-opacity":["interpolate",["linear"],["zoom"],7,1,11,.8,14,.55,16,.4],"raster-resampling":"linear","raster-fade-duration":0}}, firstSym);
    map.addLayer({id:"zones-fill",type:"fill",source:"zones",paint:{"fill-color":"#000","fill-opacity":0}}, firstSym);
    map.addLayer({id:"zones-line",type:"line",source:"zones",paint:{"line-color":["case",["get","sel"],"#e9e2ff","#c4b5fd"],"line-width":["case",["get","sel"],2.5,.8],"line-opacity":["case",["get","sel"],.9,["interpolate",["linear"],["zoom"],7,.35,13,.12]]}}, firstSym);
    map.addLayer({id:"zones-label",type:"symbol",source:"zlabels",maxzoom:10,layout:{"text-field":["get","label"],"text-font":["Noto Sans Bold"],"text-size":13,"text-max-width":9},paint:{"text-color":"#ffffff","text-halo-color":"#140f27","text-halo-width":1.6}});
    map.addLayer({id:"route-line",type:"line",source:"route",filter:["==",["geometry-type"],"LineString"],layout:{"line-join":"round","line-cap":"round"},paint:{"line-color":"#c4b5fd","line-width":3,"line-opacity":.85,"line-dasharray":[1.5,1.5]}});
    map.addLayer({id:"me-halo",type:"circle",source:"me",paint:{"circle-radius":18,"circle-color":"#60a5fa","circle-opacity":.18}});
    map.addLayer({id:"me-dot",type:"circle",source:"me",paint:{"circle-radius":7,"circle-color":"#3b82f6","circle-stroke-color":"#ffffff","circle-stroke-width":2.5}});
    map.addLayer({id:"ghosts",type:"circle",source:"ghosts",paint:{"circle-radius":["interpolate",["linear"],["zoom"],9,5,15,9],"circle-color":"rgba(255,154,60,.22)","circle-stroke-color":"#ff9a3c","circle-stroke-width":2.5}});
    map.addLayer({id:"ghosts-label",type:"symbol",source:"ghosts",minzoom:12,layout:{"text-field":["get","name"],"text-font":["Noto Sans Regular"],"text-size":12,"text-offset":[0,1.1],"text-anchor":"top","text-max-width":8},paint:{"text-color":"#ffc38a","text-halo-color":"#140f27","text-halo-width":1.4}});
    map.addLayer({id:"pins",type:"circle",source:"pins",paint:{"circle-radius":["interpolate",["linear"],["zoom"],7,5,12,8,16,11],"circle-color":["get","color"],"circle-stroke-color":["case",["get","sel"],"#c4b5fd","#ffffff"],"circle-stroke-width":["case",["get","sel"],4,2]}});
    map.addLayer({id:"pins-label",type:"symbol",source:"pins",minzoom:10.5,layout:{"text-field":["get","name"],"text-font":["Noto Sans Bold"],"text-size":12.5,"text-offset":[0,1.15],"text-anchor":"top","text-max-width":9,"text-optional":true},paint:{"text-color":"#f5f2ff","text-halo-color":"#140f27","text-halo-width":1.6}});
    map.addLayer({id:"route-num",type:"circle",source:"route",filter:["==",["geometry-type"],"Point"],paint:{"circle-radius":11,"circle-color":["case",["get","done"],"#4ade80","#ff9a3c"],"circle-stroke-color":"#140f27","circle-stroke-width":2,"circle-translate":[0,-22]}});
    map.addLayer({id:"route-num-t",type:"symbol",source:"route",filter:["==",["geometry-type"],"Point"],layout:{"text-field":["get","n"],"text-font":["Noto Sans Bold"],"text-size":12,"text-allow-overlap":true,"text-ignore-placement":true},paint:{"text-color":"#140f27","text-translate":[0,-22]}});
    mapReady=true; updateMapData();
    map.fitBounds(SF_BOUNDS,{padding:{top:150,bottom:120,left:16,right:16},duration:0});
  });
  map.on("click", e=>{
    const box=[[e.point.x-12,e.point.y-12],[e.point.x+12,e.point.y+12]];
    const pin = map.queryRenderedFeatures(box,{layers:["pins"]})[0];
    if(pin){ openSheet({type:"quick",id:pin.properties.id}); return; }
    const gh = map.queryRenderedFeatures(box,{layers:["ghosts"]})[0];
    if(gh){ openSheet({type:"candidate",data:ghosts.find(g=>g.osm===gh.properties.osm)}); return; }
    const z = map.queryRenderedFeatures(e.point,{layers:["zones-fill"]})[0];
    if(z && map.getZoom()<12.5){ openSheet({type:"zone",id:z.properties.id}); return; }
    if(sheet) closeSheet();
  });
  ["pins","ghosts","zones-fill"].forEach(l=>{ map.on("mouseenter",l,()=>map.getCanvas().style.cursor="pointer"); map.on("mouseleave",l,()=>map.getCanvas().style.cursor=""); });
}
/* ---------- heat map: each county is tinted by how its stores are doing, and the colors blend where counties meet ---------- */
const HEAT_W=360, HEAT_H=320, HEAT_BLUR=9, HEAT_MAX=.30;
const mercY=la=>Math.log(Math.tan(Math.PI/4+la*Math.PI/360)), hexRgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
let heatKey="";
function boxBlur(src,dst,w,h,r,horiz){ const n=horiz?w:h, m=horiz?h:w, k=2*r+1;
  for(let a=0;a<m;a++){ let acc=[0,0,0,0]; const at=b=>{ const bb=Math.min(n-1,Math.max(0,b)); return (horiz?(a*w+bb):(bb*w+a))*4; };
    for(let b=-r;b<=r;b++){ const o=at(b); for(let c=0;c<4;c++) acc[c]+=src[o+c]; }
    for(let b=0;b<n;b++){ const o=(horiz?(a*w+b):(b*w+a))*4; for(let c=0;c<4;c++) dst[o+c]=acc[c]/k; const add=at(b+r+1), sub=at(b-r); for(let c=0;c<4;c++) acc[c]+=src[add+c]-src[sub+c]; } } }
function heatField(){
  const [W,S,E,N]=BAY_BBOX, yN=mercY(N), yS=mercY(S);
  // each county's tint is the average of its stores' colors, so a mostly-green county with one problem leans green with a hint of red
  const mix=list=>{ const sc=list.map(c=>health(c,cat).lv).filter(l=>l!=="n"); if(!sc.length) return null; const rgb=[0,0,0]; sc.forEach(l=>hexRgb(COLORS[l]).forEach((v,i)=>rgb[i]+=v/sc.length)); return "#"+rgb.map(v=>Math.round(v).toString(16).padStart(2,"0")).join(""); };
  const zc=ZINFO.map(z=>({z, col:mix(shops.filter(c=>c.zone===z.id))}));
  const key=cat+"|"+zc.map(x=>x.col||"-").join("");
  if(key===heatKey) return null; heatKey=key;
  const cv=document.createElement("canvas"); cv.width=HEAT_W; cv.height=HEAT_H; const ctx=cv.getContext("2d");
  const X=lo=>(lo-W)/(E-W)*HEAT_W, Y=la=>(mercY(la)-yN)/(yS-yN)*HEAT_H;
  zc.forEach(({z,col})=>{ if(!col) return; ctx.fillStyle=col; ctx.beginPath(); z.polys.forEach(poly=>poly.forEach(ring=>{ ring.forEach(([lo,la],i)=>i?ctx.lineTo(X(lo),Y(la)):ctx.moveTo(X(lo),Y(la))); ctx.closePath(); })); ctx.fill("evenodd"); });
  // blur with color weighted by coverage, so neighbouring counties fade into each other and the outer edge fades to clear
  const img=ctx.getImageData(0,0,HEAT_W,HEAT_H), d=img.data, n=d.length;
  let A=new Float32Array(n), B=new Float32Array(n);
  for(let o=0;o<n;o+=4){ const a=d[o+3]/255; A[o]=d[o]*a; A[o+1]=d[o+1]*a; A[o+2]=d[o+2]*a; A[o+3]=a; }
  for(let pass=0;pass<3;pass++){ boxBlur(A,B,HEAT_W,HEAT_H,HEAT_BLUR,true); boxBlur(B,A,HEAT_W,HEAT_H,HEAT_BLUR,false); }
  for(let o=0;o<n;o+=4){ const a=A[o+3]; if(a<.003){ d[o+3]=0; continue; } d[o]=A[o]/a; d[o+1]=A[o+1]/a; d[o+2]=A[o+2]/a; d[o+3]=255*HEAT_MAX*Math.min(1,a*1.15); }
  ctx.putImageData(img,0,0); return cv.toDataURL("image/png");
}
const heatCoords=()=>{ const [W,S,E,N]=BAY_BBOX; return [[W,N],[E,N],[E,S],[W,S]]; };
function updateHeat(){ if(!mapReady) return; const url=heatField(); if(!url) return; const src=map.getSource("heat"); if(src) src.updateImage({url, coordinates:heatCoords()}); }
function updateMapData(){
  if(!mapReady) return;
  const selZone = sheet?.type==="zone" ? sheet.id : null, selShop = (sheet?.type==="shop"||sheet?.type==="quick") ? sheet.id : null;
  const zf=[], zl=[];
  ZINFO.forEach(z=>{
    const s=zoneSummary(z.id,cat);
    const color = s.list.length ? COLORS[s.lv] : "#8b84ad";
    z.polys.forEach(p=>zf.push({type:"Feature",properties:{id:z.id,color,sel:z.id===selZone},geometry:{type:"Polygon",coordinates:p}}));
    zl.push({type:"Feature",properties:{label:`${z.label.split(" · ").pop()}${s.list.length?"\n"+s.list.length+" store"+(s.list.length>1?"s":""):""}`},geometry:{type:"Point",coordinates:z.center}});
  });
  map.getSource("zones").setData({type:"FeatureCollection",features:zf}); updateHeat();
  map.getSource("zlabels").setData({type:"FeatureCollection",features:zl});
  map.getSource("pins").setData({type:"FeatureCollection",features:shops.filter(c=>c.lat!=null).map(c=>({type:"Feature",properties:{id:c.id,name:c.name,color:COLORS[health(c,cat).lv],sel:c.id===selShop},geometry:{type:"Point",coordinates:[c.lon,c.lat]}}))});
  map.getSource("ghosts").setData({type:"FeatureCollection",features:ghosts.filter(g=>!onList(g)).map(g=>({type:"Feature",properties:{osm:g.osm,name:g.name},geometry:{type:"Point",coordinates:[g.lon,g.lat]}}))});
  { const r=routeToday(), stops=r?r.ids.map(id=>shops.find(c=>c.id===id)).filter(c=>c&&c.lat!=null):[], F=[];
    if(stops.length){ const line=[...(me&&r.from==="me"?[[me.lon,me.lat]]:[]),...stops.map(c=>[c.lon,c.lat])]; if(line.length>1) F.push({type:"Feature",properties:{},geometry:{type:"LineString",coordinates:line}});
      stops.forEach((c,i)=>F.push({type:"Feature",properties:{n:touchedToday(c)?"✓":String(i+1),done:touchedToday(c)},geometry:{type:"Point",coordinates:[c.lon,c.lat]}})); }
    map.getSource("route").setData({type:"FeatureCollection",features:F}); }
  map.getSource("me").setData({type:"FeatureCollection",features:me?[{type:"Feature",properties:{},geometry:{type:"Point",coordinates:[me.lon,me.lat]}}]:[]});
}
const isWide = () => matchMedia("(min-width:900px)").matches && !(window.UI_K>1);
const viewH = () => innerHeight/(window.UI_K||1);
function flyTo(lon,lat,zoom=15){ if(!map) return; map.flyTo({center:[lon,lat],zoom:Math.max(map.getZoom(),zoom),padding: isWide()?{right:460}:{bottom:Math.round(viewH()*.45)},duration:900}); }
function fitZone(z){ map.fitBounds(z.bbox,{padding: isWide()?{top:60,bottom:60,left:60,right:480}:{top:120,bottom:Math.round(viewH()*.5),left:30,right:30},duration:800}); }
function onList(g){ return shops.some(c=>(c.osm&&c.osm===g.osm) || (c.lat!=null && miles(c,g)<0.03)); }

/* ---------- locate ---------- */
function locate(fly=true){
  if(!navigator.geolocation){ toast("This browser can't share location."); return; }
  $("#btnLocate").classList.add("busy");
  navigator.geolocation.getCurrentPosition(p=>{
    me={lat:p.coords.latitude, lon:p.coords.longitude}; $("#btnLocate").classList.remove("busy");
    updateMapData(); if(fly) map.flyTo({center:[me.lon,me.lat],zoom:Math.max(map.getZoom(),13),duration:900}); render();
  }, err=>{ $("#btnLocate").classList.remove("busy"); toast(err.code===1 ? "Location is off for this site. Turn it on in Settings › Safari › Location." : "Couldn't get your location. Try again outside."); }, {enableHighAccuracy:true, timeout:12000, maximumAge:60000});
}

/* ---------- search: your stores + Photon (OpenStreetMap) ---------- */
let searchCtl=null, searchTimer=null;
function photonUrl(q, limit=8){
  const c = map ? map.getCenter() : {lat:37.77,lng:-122.27};
  return `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=${limit}&lang=en&bbox=${BAY_BBOX.join(",")}&lat=${c.lat.toFixed(4)}&lon=${c.lng.toFixed(4)}`;
}
function photonToPlace(f){
  const p=f.properties, [lon,lat]=f.geometry.coordinates;
  const street=[p.housenumber,p.street].filter(Boolean).join(" ");
  const isShop = p.osm_key==="shop";
  const name = (p.name && p.name!==p.street) ? p.name : "";
  return {name, address:street, city:p.city||p.district||p.county||"", lat, lon, osm: p.osm_type&&p.osm_id ? p.osm_type+"/"+p.osm_id : null,
    cannabis: p.osm_value==="cannabis", kind: isShop ? (p.osm_value||"shop").replace(/_/g," ") : (p.type||"place")};
}
async function runSearch(q){
  const box=$("#results"); q=q.trim();
  if(!q){ box.hidden=true; return; }
  const ql=q.toLowerCase();
  const mine=shops.filter(c=>[c.name,infoOf(c).city,infoOf(c).address,zoneLabel(c.zone)].join(" ").toLowerCase().includes(ql)).slice(0,6);
  let html = mine.length ? `<h4>Your stores</h4>`+mine.map(c=>{const h=health(c,cat);return `<button class="res" data-mine="${c.id}"><span class="ic lv-${h.lv}"><span class="dot"></span></span><span><b>${esc(c.name)}</b><small>${esc([infoOf(c).address,infoOf(c).city].filter(Boolean).join(", ")||zoneLabel(c.zone))}</small></span></button>`;}).join("") : "";
  box.innerHTML = html + (q.length>=3 ? `<h4>Add a new store</h4><div class="res-note">Searching…</div>` : `<div class="res-note">Type 3+ letters to search the map.</div>`);
  box.hidden=false;
  if(q.length<3) return;
  searchCtl?.abort(); searchCtl=new AbortController();
  try{
    const r=await fetch(photonUrl(q),{signal:searchCtl.signal}); const j=await r.json();
    const places=(j.features||[]).map(photonToPlace).sort((a,b)=>(b.cannabis-a.cannabis));
    window._places=places;
    const list = places.length ? places.map((p,i)=>`<button class="res" data-place="${i}"><span class="ic add">+</span><span><b>${esc(p.name||p.address||"Unnamed place")}</b><small>${esc([p.name?p.address:"",p.city].filter(Boolean).join(", "))}${p.cannabis?" · Dispensary":p.kind&&p.name?" · "+esc(p.kind):""}</small></span></button>`).join("") : `<div class="res-note">No map results. Try the street address.</div>`;
    box.innerHTML = html + `<h4>Add a new store</h4>` + list + `<button class="res" data-manual="1"><span class="ic add">✎</span><span><b>Add “${esc(q)}” by hand</b><small>Type the details yourself</small></span></button>`;
  }catch(e){ if(e.name!=="AbortError") box.innerHTML = html + `<div class="res-note">Map search is offline right now. You can still add the store by hand.</div><button class="res" data-manual="1"><span class="ic add">✎</span><span><b>Add “${esc(q)}” by hand</b></span></button>`; }
}
async function geocode(text){
  const r=await fetch(photonUrl(text,1)); const j=await r.json(); const f=j.features?.[0]; return f ? photonToPlace(f) : null;
}

/* ---------- nearby dispensaries (OpenStreetMap via Overpass) ---------- */
async function overpass(q){
  const hosts=["https://overpass-api.de/api/interpreter","https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter"];
  for(let i=0;i<hosts.length;i++){
    try{ const r=await fetch(hosts[i],{method:"POST",body:"data="+encodeURIComponent(q),headers:{"Content-Type":"application/x-www-form-urlencoded"}});
      const t=await r.text(); if(r.ok && t.trim().startsWith("{")) return JSON.parse(t); }catch{}
    await new Promise(r=>setTimeout(r,1200));
  }
  throw new Error("overpass unavailable");
}
async function findNearby(){
  if(map.getZoom()<10){ toast("Zoom in to a city first, then tap Find nearby."); return; }
  const b=map.getBounds(); const bb=[b.getSouth(),b.getWest(),b.getNorth(),b.getEast()].map(n=>n.toFixed(4)).join(",");
  const q=`[out:json][timeout:20];(node["shop"="cannabis"](${bb});way["shop"="cannabis"](${bb}););out center tags 80;`;
  const btn=$("#btnNearby"); btn.classList.add("busy"); btn.querySelector("span").textContent="Searching…";
  try{
    const j=await overpass(q);
    const found=(j.elements||[]).map(e=>{ const t=e.tags||{}; return {osm:e.type+"/"+e.id, name:t.name||t.brand||"Unnamed dispensary", address:[t["addr:housenumber"],t["addr:street"]].filter(Boolean).join(" "), city:t["addr:city"]||"", phone:t.phone||t["contact:phone"]||"", website:t.website||t["contact:website"]||"", lat:e.lat??e.center?.lat, lon:e.lon??e.center?.lon}; }).filter(g=>g.lat!=null);
    const map2=new Map(ghosts.map(g=>[g.osm,g])); found.forEach(g=>map2.set(g.osm,g)); ghosts=[...map2.values()];
    updateMapData();
    const fresh=found.filter(g=>!onList(g));
    openSheet({type:"nearby",data:found});
    toast(found.length ? `${found.length} dispensar${found.length===1?"y":"ies"} here, ${fresh.length} not on your list` : "No dispensaries mapped in this view. Try zooming out a little.");
  }catch{ toast("The dispensary finder is busy. Try again in a minute."); }
  finally{ btn.classList.remove("busy"); btn.querySelector("span").textContent="Find nearby"; }
}

/* ---------- Henry's retailers (preloaded) + undo ---------- */
function retailerToShop(r){ return {...r, preset:true, stage:"new", stageAt:new Date().toISOString(), lastContact:null, touches:[], deal:{items:[]}, stock:{preroll:"none",infused:"none",flower:"none"}, tier:"", house:"", contacts:[], zone:zoneOf(r.lat,r.lon)}; }
function missingRetailers(){ const have=new Set(Store.all().map(c=>c.id)); const names=new Set(Store.all().map(c=>normName(c.name))); return (window.HENRYS_RETAILERS||[]).filter(r=>!have.has(r.id)&&!names.has(normName(r.name))); }
function addRetailers(){ const add=missingRetailers(); if(add.length) Store.write([...Store.all(),...add.map(retailerToShop)]); return add.length; }
const UNDO_KEY="henrys.undo";
function snapshot(label){ lsSet(UNDO_KEY,{label,at:new Date().toISOString(),count:Store.all().length,shops:Store.all()}); }
function undo(){ const u=lsGet(UNDO_KEY); if(!u) return; Store.write(u.shops); localStorage.removeItem(UNDO_KEY); sheet=null; selectMode=false; selected.clear(); draft={}; refresh(); toast("Restored"); }

/* ---------- render ---------- */
const ICON = {
  map:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4zM9 4v14M15 6v14"/></svg>',
  today:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4M8.5 14.5l2.3 2.3L15.5 12"/></svg>',
  pipeline:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="4" width="4.5" height="16" rx="1.5"/><rect x="9.75" y="4" width="4.5" height="11" rx="1.5"/><rect x="16" y="4" width="4.5" height="6.5" rx="1.5"/></svg>',
  stores:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 9.5 5.5 4h13L20 9.5M4 9.5h16M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M5.5 12v8h13v-8M10 20v-4.5h4V20"/></svg>',
};
const VIEWS=[["map","Map"],["today","Today"],["pipeline","Pipeline"],["stores","Stores"]];
function render(){
  const urgent=shops.filter(c=>health(c).lv==="r").length;
  $("#tabbar").innerHTML = VIEWS.map(([k,l])=>`<button data-view="${k}" aria-current="${view===k}">${ICON[k]}${k==="today"&&urgent?`<span class="badge num">${urgent}</span>`:""}<span>${l}</span></button>`).join("");
  const gm=$("#goalMini"); if(gm) gm.innerHTML=goalCard(true);
  $("#chips").innerHTML = [["all","All stores"],...Object.entries(CATS)].map(([k,l])=>`<button class="chip" data-cat="${k}" aria-pressed="${cat===k}">${l}</button>`).join("");
  const page=$("#page");
  if(view==="map"){ page.hidden=true; $("#mapUi").hidden=false; }
  else { $("#mapUi").hidden=true; page.hidden=false; const st=page.scrollTop; page.innerHTML=`<div class="pagein">${({today:viewToday,pipeline:viewPipeline,stores:viewStores,report:viewReport}[view]||viewToday)()}</div>`; page.scrollTop=st; }
  renderWelcome(); renderSheet();
}
function renderWelcome(){
  let w=$("#welcome");
  if(view!=="map" || shops.length || sheet){ w?.remove(); return; }
  if(!w){ w=document.createElement("div"); w.id="welcome"; w.className="welcome glass"; document.body.appendChild(w); }
  w.innerHTML=`<div class="eyebrow"><b>Henry’s</b> · ${routeLabel()}</div><h1>Build your route</h1><p>Search a dispensary by name or address up top, or tap <b>Find nearby</b> to see every dispensary in view and add the ones you cover. Stores turn green, yellow, or red as you log visits and deals.</p>
  <div class="row2"><button class="btn primary" data-act="focus-search">Add a store</button>${lsGet(UNDO_KEY)?`<button class="btn violet" data-act="undo">Restore cleared stores</button>`:""}${missingRetailers().length?`<button class="btn" data-act="add-retailers">Load Henry’s stores (${missingRetailers().length})</button>`:""}</div>`;
}
function head(title, extra=""){ return `<div class="eyebrow"><b>Henry’s</b> · ${routeLabel()}</div><h1>${title}</h1>${extra}`; }
function shopRow(c, catKey="all", right=""){
  const h=health(c,catKey); const d=miles(me,c);
  return `<button class="row lv-${h.lv}" data-open="${c.id}"><span class="dot"></span><span class="t"><b>${esc(c.name)} ${c.tier?`<span class="tier ${c.tier}">${esc(c.tier)}</span>`:""}</b><small>${esc(h.reasons[0])}${h.reasons.length>1?` · +${h.reasons.length-1}`:""}</small></span><span class="rt">${right || [esc(infoOf(c).city||""), d!=null?fmtMi(d):""].filter(Boolean).join("<br>")}</span></button>`;
}

/* ---------- per-store deals and pricing ---------- */
const todayISO=()=>{ const d=new Date(); return new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,10); };
function activeSpecials(c){ const d=todayISO(); return (c.specials||[]).filter(x=>(!x.until||x.until>=d)&&(!x.from||x.from<=d)); }
function lastPaid(c,line,strain){ const pools=[...(c.lastOrder||[]),...(c.priceLog||[])]; const m=pools.find(i=>i.line===line&&i.strain===strain)||pools.find(i=>i.line===line); return m?.price; }
function priceFor(c,line,strain){
  const sp=activeSpecials(c).find(x=>x.line===line&&x.strain===strain) || activeSpecials(c).find(x=>x.line===line&&!x.strain);
  if(sp) return {price:sp.price, src:`Their deal${sp.until?` until ${fmtDate(sp.until+"T12:00")}`:""}${sp.note?` · ${sp.note}`:""}`};
  const lp=lastPaid(c,line,strain); if(lp!=null) return {price:lp, src:"What they last paid"};
  const sale=saleOf(line,strain); if(sale!=null) return {price:sale, src:"Sale price on the menu"};
  return {price:LINE[line]?.price??0, src:"Menu price"};
}
function specialsBlock(c){
  const d=todayISO(), list=(c.specials||[]).slice().sort((a,b)=>(a.until||"9")<(b.until||"9")?-1:1);
  const spl=LINE[draft.spLine]||CATALOG[0];
  const lineOpts=MENU.lines.map(l=>`<option value="${l.id}" ${spl&&spl.id===l.id?"selected":""}>${esc(l.name)}${l.off?" (off menu)":""}</option>`).join("");
  return `<div class="blk"><h2>Their deals</h2>
    ${list.length?list.map(x=>{ const ended=x.until&&x.until<d; return `<div class="sp ${ended?"ended":""}"><div><b>${esc(LINE[x.line]?.name||x.line)}${x.strain?` · ${esc(x.strain)}`:""}</b>
      <small class="num">${money(x.price)}/cs${x.until?` · ${ended?"ended":"until"} ${fmtDate(x.until+"T12:00")}`:" · no end date"}${x.note?` · ${esc(x.note)}`:""}</small></div><button class="iconbtn sm" data-delsp="${(c.specials||[]).indexOf(x)}" aria-label="Remove deal">✕</button></div>`; }).join("")
      :`<p class="sub" style="margin:0 0 8px;font-size:14px">No special pricing yet. Deals you add here fill in automatically when you build an order for this store.</p>`}
    ${draft.spOpen?`<div class="form" style="margin-top:10px">
      <select class="input" id="spLine" aria-label="Product">${lineOpts}</select>
      <select class="input" id="spStrain" aria-label="Strain"><option value="">Every strain</option>${(spl?.strains||[]).map(x=>`<option value="${esc(x)}" ${draft.spStrain===x?"selected":""}>${esc(x)}</option>`).join("")}</select>
      <div class="grid2"><label class="field"><span>Their price / case</span><input id="spPrice" type="number" inputmode="decimal" value="${esc(draft.spPrice??"")}" placeholder="${spl?spl.price:""}"></label><label class="field"><span>Good until</span><input id="spUntil" type="date" value="${esc(draft.spUntil??"")}"></label></div>
      <input class="input" id="spNote" placeholder="Note, e.g. “buy 5 get 1” or “intro price”" value="${esc(draft.spNote??"")}">
      <div class="grid2"><button class="btn primary" data-act="sp-save">Save deal</button><button class="btn" data-act="sp-cancel">Cancel</button></div></div>`
      :`<button class="btn sm" style="margin-top:6px" data-act="sp-open">+ Add a deal for this store</button>`}
  </div>`;
}
function menuSheet(){
  const open=draft.menuOpen;
  return `<div class="sheet-head"><div><div class="eyebrow">Updated ${fmtDate(MENU.updatedAt)}</div><h1>Henry’s menu</h1><div class="sub">Keep this matching the menu you’re showing stores this week.</div></div>${xBtn}</div>
  <div class="sheet-body">
    ${Object.entries(CATS).map(([k,l])=>`<h2 style="margin:16px 4px 8px">${l}</h2><div class="group">${MENU.lines.filter(x=>x.cat===k).map(x=>{ const on=open===x.id; const sales=Object.keys(x.sale||{}).length;
      return `<div class="mline ${x.off?"off":""}"><button class="mhead" data-mline="${x.id}"><span><b>${esc(x.name)}</b><small>${esc(x.pack||"")}${x.pack?" · ":""}${x.strains.length} strain${x.strains.length===1?"":"s"}${sales?` · ${sales} on sale`:""}${x.off?" · not on menu":""}</small></span><span class="num">${money(x.price)}/cs</span></button>
        ${on?`<div class="medit form"><div class="grid2"><label class="field"><span>Price / case</span><input id="m_price" type="number" inputmode="decimal" value="${x.price}"></label><label class="field"><span>Case size</span><input id="m_pack" value="${esc(x.pack||"")}" placeholder="e.g. 10 packs/case"></label></div>
          <div class="mstrains"><div class="mst head"><span>Strain</span><span>Sale $/cs</span><span></span></div>${x.strains.map((st,i)=>`<div class="mst"><span>${esc(st)}</span><input type="number" inputmode="decimal" placeholder="—" data-msale="${i}" value="${x.sale?.[st]??""}" aria-label="Sale price for ${esc(st)}"><button class="iconbtn sm" data-mdel="${i}" aria-label="Remove ${esc(st)}">✕</button></div>`).join("")||`<p class="sub" style="margin:0">No strains yet. Add one below.</p>`}</div>
          <div style="display:flex;gap:6px"><input class="input" id="m_newstrain" placeholder="Add a strain"><button class="btn" data-act="m-addstrain">Add</button></div>
          <div class="grid2"><button class="btn primary" data-act="m-save">Save</button><button class="btn" data-act="m-toggle">${x.off?"Put back on menu":"Take off menu"}</button></div></div>`:""}</div>`; }).join("")}</div>`).join("")}
    <div class="blk"><h2>New product</h2><div class="form"><input class="input" id="m_newname" placeholder="Name, e.g. 14 Gram Pouch"><div class="grid2"><select class="input" id="m_newcat" aria-label="Category">${Object.entries(CATS).map(([k,l])=>`<option value="${k}">${l}</option>`).join("")}</select><input class="input" id="m_newprice" type="number" inputmode="decimal" placeholder="$/case"></div><button class="btn" data-act="m-newline">Add product</button></div></div>
    <button class="btn danger wide" style="margin-top:14px" data-act="m-reset">Reset to the Sept 30 menu</button>
  </div>`;
}

/* ---------- momentum: next moves, cadence, ready messages ---------- */
const ORDER_LINK_DEFAULT="https://app.nabis.com/?nref=wzgjzndt";   // Henry's wholesale link on Nabis (from henrysoriginal.com)
const ACTIVE=["visit","sample","call","text","negotiating","verbal","email","order"];
function settings(){ return {orderLink:ORDER_LINK_DEFAULT, ...(lsGet("henrys.settings")||{})}; }
function allTouches(){ const out=[]; shops.forEach(c=>(c.touches||[]).forEach(t=>out.push({...t,shop:c}))); return out; }
function touchesOnDay(d){ return allTouches().filter(t=>ACTIVE.includes(t.type)&&daysSince(t.at)===d).length; }
function numbers(days=30){
  const T=allTouches().filter(t=>daysSince(t.at)<=days), touches=T.filter(t=>ACTIVE.includes(t.type)&&t.type!=="order").length;
  const orders=T.filter(t=>t.type==="order"&&t.amount>0), sales=orders.reduce((s,o)=>s+o.amount,0);
  const lost={}; T.filter(t=>t.type==="lost").forEach(t=>{ const r=(t.note||"").replace(/^Fell through: /,"").split(" · ")[0]||"Other"; lost[r]=(lost[r]||0)+1; });
  return {touches, orders:orders.length, sales, avg:orders.length?sales/orders.length:0, perTouch:touches?sales/touches:0, lost};
}
function dailyTarget(){ const g=goals(), n=new Date(), dim=new Date(n.getFullYear(),n.getMonth()+1,0).getDate(), left=dim-n.getDate()+1;
  const need=Math.max(0,g.mine-monthSales()), N=numbers(60); return N.perTouch>0 ? Math.max(6,Math.min(25,Math.ceil(need/left/N.perTouch))) : 10; }
function streak(){ const bar=Math.min(dailyTarget(),5); let s=touchesOnDay(0)>=bar?1:0;
  for(let d=1; d<90; d++){ const n=touchesOnDay(d), wd=new Date(Date.now()-d*DAY).getDay(); if(n>=bar) s++; else if(wd===0||wd===6) continue; else break; } return s; }
function orderInterval(c){ const o=(c.touches||[]).filter(t=>t.type==="order").map(t=>Date.parse(t.at)).sort((a,b)=>a-b); if(o.length<2) return 14;
  const g=o.slice(1).map((x,i)=>(x-o[i])/DAY); return Math.max(5,Math.round(g.reduce((a,b)=>a+b,0)/g.length)); }
function reorderIn(c){ return c.lastOrderAt ? orderInterval(c)-daysSince(c.lastOrderAt) : null; }
function firstName(c){ const i=infoOf(c); const p=i.contacts.find(x=>x.name)||{name:i.ownerName}; const f=(p.name||"").trim().split(" ")[0]; return f&&f!=="Buyer"?f:"there"; }
function textNumber(c){ const i=infoOf(c); return (i.contacts.find(x=>x.phone)||{}).phone||i.ownerPhone||i.shopPhone||""; }
function emailAddr(c){ const i=infoOf(c); return (i.contacts.find(x=>x.email)||{}).email||i.ownerEmail||i.shopEmail||""; }
const itemsLine=items=>items.map(i=>`${i.cases} cs ${(LINE[i.line]?.name||"")} ${i.strain.replace(" (sale)","")} @ ${money(i.price)}`).join(", ");
const HOUSE_PITCH={Rolls:".5G 4-Packs", Infused:"Infused 4-Packs", "8ths":"3.5g Craft Jars", Smalls:"Smalls pouches", Ounces:"28g pouches"};
function kindFor(c){ const st=c.stage||"new", low=Object.entries(c.stock||{}).some(([k,v])=>v==="low"||v==="out"), ro=reorderIn(c);
  if(st==="verbal") return "verbal"; if(st==="confirmed") return "confirmed"; if(st==="negotiating") return "negotiating"; if(st==="sampled") return "sample";
  if(st==="ordered") return ro!=null&&ro<=3 ? "reorder" : low ? "restock" : "checkin"; if(st==="lost") return "winback"; if(st==="visited") return low?"restock":"visit"; return "intro"; }
const MSG_KINDS=[["intro","Intro"],["visit","After visit"],["sample","Samples check-in"],["negotiating","Lock the deal"],["verbal","Thanks + link"],["confirmed","Order nudge"],["reorder","Reorder"],["restock","Restock"],["checkin","Check-in"],["winback","Win-back"]];
function message(c,kind){
  const f=firstName(c), i=infoOf(c), city=i.city||"your area", del=c.deliveryDays||i.deliveryDays, link=settings().orderLink, items=c.deal?.items||[], tot=dealTotal(items);
  const pick=HOUSE_PITCH[c.house]||"pre-rolls and flower", sug=suggestItems(c)[0], sugTxt=sug?`a case of ${LINE[sug.line].name} ${sug.strain.replace(" (sale)","")}`:"a few cases";
  const lowCats=Object.entries(c.stock||{}).filter(([k,v])=>v==="low"||v==="out").map(([k])=>CATS[k]).join(" and ")||"product";
  const last=c.lastOrder?.length?itemsLine(c.lastOrder):"your usual";
  return ({
    intro:`Hi ${f}, ${repWho("with")}. I'll be near ${city} this week and would love to drop off samples for your team. What day works best?`,
    visit:`Thanks for the time today, ${f}. Want me to bring by samples of our ${pick} so the team can try them before you decide?`,
    sample:`Hey ${f}, how did the team like the samples? I can hold ${items.length?itemsLine(items):sugTxt} for your ${del||"next"} delivery. Want me to lock it in?`,
    negotiating:`Hey ${f}, here's where we landed: ${items.length?itemsLine(items)+` (${money(tot)} total)`:sugTxt}. Reply YES and I'll send it over so you can place it.`,
    verbal:`Thanks ${f}! Confirmation is on its way. When you're ready, you can place it here: ${link}`,
    confirmed:`Hi ${f}, quick check: were you able to place the Henry's order? Here's the link: ${link} It takes a minute and I'll make sure it lands on your ${del||"next"} delivery.`,
    reorder:`Hi ${f}, it's been about ${daysSince(c.lastOrderAt)??"a few"} days since your last Henry's order (${last}). Want the same again? Reorder here: ${link}`,
    restock:`Hey ${f}, looks like you're getting low on ${lowCats}. Want me to get ${sugTxt} on your ${del||"next"} delivery?`,
    checkin:`Hey ${f}, checking in from Henry's. Anything moving slow on the shelf I can help with, or want to try something new this month?`,
    winback:(()=>{ const sp=activeSpecials(c)[0], sl=CATALOG.flatMap(l=>Object.entries(l.sale||{}).filter(([st])=>l.strains.includes(st)).map(([st,p])=>({l,st,p})))[0];
      return sp?`Hi ${f}, ${repWho()}. I can do ${LINE[sp.line]?.name||""}${sp.strain?" "+sp.strain:""} at ${money(sp.price)}/case for you${sp.until?` through ${fmtDate(sp.until+"T12:00")}`:""}. Worth another look for your shelf?`
        : sl?`Hi ${f}, ${repWho()}. We have ${sl.l.name} ${sl.st} on sale at ${money(sl.p)}/case right now. Worth another look for your shelf?`
        : `Hi ${f}, ${repWho()}. We've got some new strains on the menu this month. Want me to bring samples by?`; })(),
  })[kind];
}
function suggestItems(c){
  const have=new Set((c.deal?.items||[]).map(x=>x.line+"|"+x.strain)), out=[];
  activeSpecials(c).forEach(x=>{ const l=LINE[x.line]; if(l&&!l.off&&l.strains.length) out.push({line:x.line,strain:x.strain||l.strains[0],price:x.price,why:`their deal${x.until?` until ${fmtDate(x.until+"T12:00")}`:""}`}); });
  Object.keys(CATS).forEach(k=>{ const s=c.stock?.[k]||"none"; if(s!=="ok"){ const l=CATALOG.find(x=>x.cat===k && (k!=="preroll"||x.id==="p05x4")) || CATALOG.find(x=>x.cat===k); if(l) out.push({line:l.id,strain:l.strains[0],price:priceFor(c,l.id,l.strains[0]).price,why:s==="none"?`they don't carry ${CATS[k]}`:`${CATS[k]} ${s}`}); } });
  (c.deal?.items||[]).forEach(i=>{ const up={p05x4:"p05x14",p05x14:"p05x28",p1single:"p1x14",f35jar:"f7pouch",f7smalls:"f28smalls"}[i.line]; if(up){ const l=LINE[up]; if(l&&!l.off&&l.strains.length){ const st=l.strains.includes(i.strain)?i.strain:l.strains[0]; out.push({line:up,strain:st,price:priceFor(c,up,st).price,why:"bigger pack, bigger ticket"}); } } });
  CATALOG.forEach(l=>Object.entries(l.sale||{}).forEach(([st,p])=>{ if(l.strains.includes(st)) out.push({line:l.id,strain:st,price:Math.min(p,priceFor(c,l.id,st).price),why:`sale · menu ${money(l.price)}`}); }));
  const seen=new Set(); return out.filter(x=>{ const k=x.line+"|"+x.strain; if(have.has(k)||seen.has(k)) return false; seen.add(k); return true; }).slice(0,4);
}
function nextMoves(){
  const L=[];
  shops.forEach(c=>{ const fu=daysUntil(c.nextFollowUp), st=c.stage||"new", sd=daysSince(c.stageAt)??0, lc=daysSince(c.lastContact), ro=reorderIn(c), low=Object.values(c.stock||{}).some(v=>v==="low"||v==="out");
    let s=0, why="", act="text";
    if(st==="verbal"){ s=100+sd; why=`Verbal yes ${ago(sd)}. Lock it in with the confirmation.`; act="email"; }
    else if(lc===0) return;
    else if(st==="confirmed"){ s=88+sd; why=`Confirmed ${ago(sd)}, no order yet. Nudge them to place it.`; }
    else if(st==="ordered" && ro!=null && ro<=2){ s=82-ro; why=ro<=0?`Due to reorder. They order about every ${orderInterval(c)} days.`:`Reorder due in ${ro} day${ro===1?"":"s"}.`; }
    else if(fu!=null && fu<=0){ s=76-fu; why=fu===0?"Follow-up due today.":`Follow-up ${-fu}d overdue.`; }
    else if(activeSpecials(c).some(x=>x.until && daysUntil(x.until+"T12:00")<=3)){ const x=activeSpecials(c).find(x=>x.until && daysUntil(x.until+"T12:00")<=3), dd=daysUntil(x.until+"T12:00"); s=73; why=`Their ${money(x.price)} deal on ${LINE[x.line]?.name||"product"} ends ${dd<=0?"today":dd===1?"tomorrow":`in ${dd} days`}.`; }
    else if(low && lc!=null){ s=70; why="Getting low on their shelf."; }
    else if(st==="negotiating" && sd>=2){ s=66+sd; why=`Negotiating for ${sd} days. Ask for the yes.`; }
    else if(lc!=null && lc>=10){ s=36+Math.min(20,lc/2); why=`No contact in ${lc} days.`; }
    else if(st==="lost" && sd>=21){ s=34; why="Fell through a while ago. Worth another shot."; }
    else if(st==="new"){ const d=miles(me,c); s=30+(d!=null?Math.max(0,15-d):0); why=d!=null?`Not visited yet · ${fmtMi(d)} away.`:"Not visited yet."; }
    if(s>0) L.push({c,s,why,act,kind:kindFor(c)}); });
  return L.sort((a,b)=>b.s-a.s);
}
function smsHrefBody(num,body){ return `sms:${digits(num)}&body=${encodeURIComponent(body)}`; }
function msgBlock(c,kind,compact){
  const text=message(c,kind), num=textNumber(c), em=emailAddr(c);
  return `<div class="msg" id="msgText">${esc(text)}</div>
    <div class="nx-acts">${num?`<a class="btn primary" href="${smsHrefBody(num,text)}" data-logtext="${c.id}">Text it</a>`:`<button class="btn" data-copy="${esc(text)}">Copy text</button>`}
    ${em?`<a class="btn" href="mailto:${esc(em)}?subject=${encodeURIComponent("Henry's · "+c.name)}&body=${encodeURIComponent(text)}" data-logtext="${c.id}">Email</a>`:""}
    ${num?`<button class="btn" data-copy="${esc(text)}">Copy</button>`:`<button class="btn" data-act="edit-from" data-id="${c.id}">Add phone</button>`}</div>`;
}
function nextUpCard(){
  const L=nextMoves(); if(!L.length) return "";
  const top=L[0], c=top.c;
  const primary = top.act==="email" ? `<div class="msg">They said yes. Send the confirmation with the exact cases and prices so it doesn't slip.</div><div class="nx-acts"><button class="btn primary" data-email-for="${c.id}">Send confirmation</button>${textNumber(c)?`<a class="btn" href="${telHref(textNumber(c))}">Call</a>`:""}</div>` : msgBlock(c,top.kind);
  return `<section class="nextup"><div class="nx-top"><span class="eyebrow">Do this next</span><button class="linkbtn" data-open="${c.id}">Open store</button></div>
    <h2 class="nx-name">${esc(c.name)}</h2><p class="nx-why">${esc(top.why)}</p>${primary}
    ${L.length>1?`<div class="nx-then"><h4>Then</h4>${L.slice(1,4).map(m=>`<button class="nx-row" data-open="${m.c.id}"><b>${esc(m.c.name)}</b><small>${esc(m.why)}</small></button>`).join("")}</div>`:""}</section>`;
}
function ringSvg(n,t){ const p=Math.min(1,n/t), r=17, C=2*Math.PI*r; return `<svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true"><circle cx="22" cy="22" r="${r}" fill="none" stroke="rgb(255 255 255 / .1)" stroke-width="5"/><circle cx="22" cy="22" r="${r}" fill="none" stroke="url(#rg)" stroke-width="5" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C*(1-p)}" transform="rotate(-90 22 22)"/><defs><linearGradient id="rg" x1="0" x2="1"><stop offset="0" stop-color="#a78bfa"/><stop offset="1" stop-color="#ff9a3c"/></linearGradient></defs></svg>`; }
function momentumRow(){
  const n=touchesOnDay(0), t=dailyTarget(), st=streak(), N=numbers(60);
  return `<div class="momentum"><div class="ring">${ringSvg(n,t)}<b class="num">${n}</b></div>
    <div><b>${n>=t?"Today's target hit":`${t-n} more touch${t-n===1?"":"es"} today`}</b><small class="num">${n} of ${t} visits, calls and texts${N.perTouch>0?` · each one ≈ ${money(Math.round(N.perTouch))}`:""}</small></div>
    ${st>1?`<div class="streak num"><b>${st}</b><small>day streak</small></div>`:""}</div>`;
}
function numbersCard(){
  const N=numbers(30); if(!N.touches && !N.orders) return "";
  const lostTop=Object.entries(N.lost).sort((a,b)=>b[1]-a[1])[0];
  return `<section class="section"><div class="section-head"><h2>Last 30 days</h2></div><div class="stats">
    <div class="stat"><b class="num">${N.touches}</b><span>visits, calls and texts</span></div>
    <div class="stat"><b class="num">${N.orders}</b><span>orders</span></div>
    <div class="stat"><b class="num">${N.orders?kfmt(Math.round(N.avg)):"—"}</b><span>average order</span></div>
    <div class="stat"><b class="num">${N.perTouch?money(Math.round(N.perTouch)):"—"}</b><span>earned per touch</span></div></div>
    ${lostTop?`<p class="sub" style="font-size:13.5px;margin:10px 4px 0">Most deals lost to: <b style="color:var(--fg)">${esc(lostTop[0])}</b> (${lostTop[1]})</p>`:""}</section>`;
}

/* ---------- monthly goal ---------- */
function goals(){ return {mine:75000, company:250000, ...(lsGet("henrys.goals")||{})}; }
function monthOrders(){ const n=new Date(), y=n.getFullYear(), m=n.getMonth(); const out=[]; shops.forEach(c=>(c.touches||[]).forEach(t=>{ if(t.type==="order"&&t.amount>0){ const d=new Date(t.at); if(d.getFullYear()===y&&d.getMonth()===m) out.push({...t,shop:c.name,id:c.id}); } })); return out.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)); }
function monthSales(){ return monthOrders().reduce((s,o)=>s+o.amount,0); }
const kfmt=n=> n>=1000 ? "$"+(n/1000).toFixed(n>=100000?0:1).replace(/\.0$/,"")+"K" : money(n);
function goalCard(compact){
  const g=goals(), sold=monthSales(), pct=Math.min(1,sold/g.mine), n=new Date();
  const dim=new Date(n.getFullYear(),n.getMonth()+1,0).getDate(), left=dim-n.getDate()+1, need=Math.max(0,g.mine-sold), perDay=need/left;
  const expected=g.mine*(n.getDate()-1+ (n.getHours()/24))/dim, ahead=sold-expected;
  const month=n.toLocaleDateString(undefined,{month:"long"});
  if(compact) return `<button class="goalmini glass" data-report="1" aria-label="${month} sales ${money(sold)} of ${money(g.mine)}"><span>${month}</span><span class="bar"><i style="width:${(pct*100).toFixed(1)}%"></i></span><b class="num">${kfmt(sold)}<small> / ${kfmt(g.mine)}</small></b><span class="tmini num">${touchesOnDay(0)}/${dailyTarget()}</span></button>`;
  const share=Math.min(1,sold/g.company), mark=Math.min(1,g.mine/g.company);
  return `<section class="goal tappable" data-report="1" role="button" tabindex="0" aria-label="Open full report"><div class="goal-top"><h2>${month} goal</h2><span class="sub num">${left} day${left===1?"":"s"} left · <span style="color:var(--violet-2)">Full report ›</span></span></div>
    <div class="goal-num num"><b>${money(Math.round(sold))}</b><span>of ${money(g.mine)}</span></div>
    <div class="bigbar ${pct>=1?"done":""}"><i style="width:${(pct*100).toFixed(1)}%"></i><em style="left:${Math.min(100,expected/g.mine*100).toFixed(1)}%" title="Where you should be today"></em></div>
    <div class="goal-meta num"><span>${Math.round(pct*100)}% there</span><span>${pct>=1?"Goal hit. Everything now is bonus.":`${money(Math.round(need))} to go · about ${money(Math.ceil(perDay))}/day`}</span></div>
    <div class="goal-meta num" style="margin-top:2px"><span style="color:${ahead>=0?"var(--g)":"var(--y)"}">${ahead>=0?"Ahead of pace by":"Behind pace by"} ${money(Math.abs(Math.round(ahead)))}</span><span>${monthOrders().length} order${monthOrders().length===1?"":"s"}</span></div>
    <div class="co"><div class="goal-meta"><span>Your part of Henry’s ${kfmt(g.company)} month</span><span class="num">${(share*100).toFixed(1)}%</span></div>
      <div class="cobar"><i style="width:${(share*100).toFixed(2)}%"></i><em style="left:${(mark*100).toFixed(1)}%"></em></div>
      <div class="sub" style="font-size:12.5px;margin-top:4px">The marker is your ${kfmt(g.mine)} target, ${Math.round(mark*100)}% of the company goal.</div></div>
  </section>`;
}
function celebrate(msg){
  toast(msg); const c=document.createElement("canvas"); c.className="confetti"; document.body.appendChild(c); const x=c.getContext("2d"); const W=c.width=innerWidth*2, H=c.height=innerHeight*2;
  const P=[...Array(160)].map(()=>({x:W/2,y:H*.35,vx:(Math.random()-.5)*28,vy:-Math.random()*30-8,r:Math.random()*10+6,h:Math.random()*360,a:Math.random()*6}));
  let n=0; (function f(){ x.clearRect(0,0,W,H); P.forEach(p=>{ p.vy+=.9; p.x+=p.vx; p.y+=p.vy; p.a+=.2; x.save(); x.translate(p.x,p.y); x.rotate(p.a); x.fillStyle=`hsl(${p.h},95%,65%)`; x.fillRect(-p.r/2,-p.r/4,p.r,p.r/2); x.restore(); }); if(++n<120) requestAnimationFrame(f); else c.remove(); })();
}
function viewToday(){
  const closing=shops.filter(c=>["verbal","confirmed"].includes(c.stage)).sort((a,b)=>Date.parse(a.stageAt)-Date.parse(b.stageAt));
  const due=shops.filter(c=>{const f=daysUntil(c.nextFollowUp);return f!=null&&f<=0&&!closing.includes(c);});
  const quiet=shops.filter(c=>{const d=daysSince(c.lastContact);return d!=null&&d>=14&&!due.includes(c)&&!closing.includes(c);});
  const fresh=shops.filter(c=>c.lastContact==null&&!due.includes(c)&&!closing.includes(c)).sort((a,b)=>(miles(me,a)??0)-(miles(me,b)??0)||a.name.localeCompare(b.name));
  const stock=shops.filter(c=>Object.values(c.stock||{}).some(s=>s==="out"||s==="low")&&![...closing,...due,...quiet].includes(c));
  let verbals=0,closed=0;
  shops.forEach(c=>{ const t=(c.touches||[]).filter(x=>daysSince(x.at)<=90); const v=t.filter(x=>x.type==="verbal").map(x=>Date.parse(x.at)); if(!v.length) return; verbals++; const f=Math.min(...v); if(t.some(x=>x.type==="order"&&Date.parse(x.at)>=f)) closed++; });
  const rate=verbals?Math.round(100*closed/verbals):null;
  const week=shops.filter(c=>{const d=daysSince(c.lastContact);return d!=null&&d<7;}).length;
  const hr=new Date().getHours(), greet=hr<12?"Good morning":hr<17?"Good afternoon":"Good evening";
  const sec=(t,s,arr,rf,empty)=>`<section class="section"><div class="section-head"><h2>${t}</h2><span class="sub" style="font-size:13px">${s}</span></div><div class="group">${arr.length?arr.map(c=>shopRow(c,"all",rf(c))).join(""):`<div class="empty">${empty}</div>`}</div></section>`;
  if(!shops.length) return head(`${greet}${repFirst()?", "+esc(repFirst()):""}`)+`<p class="sub">No stores yet. Head to the Map tab to add your first one.</p>`;
  return head(`${greet}${repFirst()?", "+esc(repFirst()):""}`, `<p class="sub" style="margin:0">${new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"})}</p>`)+routeCard()+backupCard()+momentumRow()+goalCard()+`
  <div class="stats">
    <div class="stat ${closing.length?"alert":""}"><b>${closing.length}</b><span>deals to close</span></div>
    <div class="stat ${due.length?"alert":""}"><b>${due.length}</b><span>follow-ups due</span></div>
    <div class="stat"><b>${week}<small>/${shops.length}</small></b><span>stores contacted this week</span></div>
    <div class="stat"><b>${rate==null?"—":rate+"%"}</b><span>verbal yes → order (90d)</span></div>
  </div>
  ${(()=>{ const o=monthOrders(); return o.length?`<section class="section"><div class="section-head"><h2>Orders this month</h2><span class="sub" style="font-size:13px">${money(monthSales())}</span></div><div class="group">${o.slice(0,8).map(x=>`<button class="row lv-g" data-open="${x.id}"><span class="dot"></span><span class="t"><b>${esc(x.shop)}</b><small>${fmtDate(x.at)}${x.note?" · "+esc(x.note):""}</small></span><span class="rt num" style="color:var(--g);font-size:15px;font-weight:700">${money(x.amount)}</span></button>`).join("")}</div></section>`:""; })()}
  ${sec("Close these deals","Verbal yes or confirmed, no order yet",closing,c=>`${SNAME[c.stage]}<br>${ago(daysSince(c.stageAt))}`,"No open verbal deals.")}
  ${sec("Follow-ups due","Today or overdue",due,c=>{const f=daysUntil(c.nextFollowUp);return f===0?"Today":`${-f}d late`;},"Nothing due today.")}
  ${sec("Gone quiet","No contact in 14+ days",quiet,c=>`Last contact<br>${ago(daysSince(c.lastContact))}`,"Every store has heard from you in the last two weeks.")}
  ${sec("Not visited yet", me?"Closest first":"Stores to introduce yourself to", fresh, c=>[esc(infoOf(c).city||""), me?fmtMi(miles(me,c)):""].filter(Boolean).join("<br>"), "You’ve visited every store on your list.")}
  ${sec("Stock watch","Low or out on their shelf",stock,c=>Object.entries(c.stock||{}).filter(([k,s])=>s==="out"||s==="low").map(([k,s])=>`${CATS[k]} ${s}`).join("<br>"),"No other stock alerts.")}
  ${numbersCard()}`;
}
function dealTotal(items){ return (items||[]).reduce((s,i)=>s+(+i.cases||0)*(+i.price||0),0); }
const PIPE_ORDER=["verbal","confirmed","negotiating","sampled","visited","ordered","lost","new"]; const pipeOpen=new Set();
function viewPipeline(){
  const secs=PIPE_ORDER.map(k=>[k,SNAME[k]]).map(([k,l])=>{ const arr=shops.filter(c=>(c.stage||"new")===k).sort((a,b)=>Date.parse(a.stageAt||0)-Date.parse(b.stageAt||0));
    const hot=(k==="verbal"||k==="confirmed")&&arr.length, tot=arr.reduce((t,c)=>t+dealTotal(c.deal?.items),0);
    if(!arr.length) return `<div class="stage empty"><span>${l}</span><span class="num">0</span></div>`;
    if(k==="new" && !pipeOpen.has(k)) return `<button class="stage empty more" data-pipe="${k}"><span>${l} · not visited yet</span><span class="num">${arr.length} · Show</span></button>`;
    return `<section class="stage ${hot?"hot":""}"><div class="stage-h"><h3>${l}</h3><span class="num">${arr.length}${tot?` · ${money(tot)}`:""}${k==="new"?` · <button class="linkbtn" data-pipe="new">Hide</button>`:""}</span></div>
      <div class="stage-list">${arr.map(c=>{const h=health(c);const t=dealTotal(c.deal?.items);return `<button class="card lv-${h.lv}" data-open="${c.id}"><b>${esc(c.name)}</b><small class="num">${esc(infoOf(c).city||"")} · in stage ${ago(daysSince(c.stageAt)).replace(" ago","")}${t?` · ${money(t)}`:""}</small>${h.lv!=="g"&&h.lv!=="n"?`<small style="color:var(--fg)">${esc(h.reasons[0])}</small>`:""}</button>`;}).join("")}</div></section>`; }).join("");
  const open=shops.filter(c=>["negotiating","verbal","confirmed"].includes(c.stage)).reduce((t,c)=>t+dealTotal(c.deal?.items),0);
  return head("Deal pipeline", `<p class="sub" style="margin:4px 0 14px">${open?`<b style="color:var(--fg)">${money(open)}</b> in open deals. `:""}Deals leak between <b>Verbal yes</b> and <b>Ordered</b>: a verbal yes turns red after 2 days with no confirmation email, a confirmed deal after 4 days with no order.</p>`)+nextUpCard()+`<div class="board">${secs}</div>`;
}

function viewStores(){
  const q=pageQuery.toLowerCase();
  const arr=shops.filter(c=>{ if(!q) return true; const i=infoOf(c); return [c.name,i.city,i.address,i.ownerName,zoneLabel(c.zone),...i.contacts.map(x=>x.name)].join(" ").toLowerCase().includes(q); }).sort((a,b)=>RANK[health(b).lv]-RANK[health(a).lv]||a.name.localeCompare(b.name));
  const link=lsGet(LINK_KEY);
  const rows = selectMode ? arr.map(c=>`<button class="row sel ${selected.has(c.id)?"on":""}" data-pick="${c.id}"><span class="check" aria-hidden="true"></span><span class="t"><b>${esc(c.name)}</b><small>${esc([infoOf(c).city,zoneLabel(c.zone)].filter(Boolean).join(" · "))}</small></span><span></span></button>`).join("") : arr.map(c=>shopRow(c)).join("");
  return head("Stores", `<p class="sub" style="margin:0 0 14px">${shops.length} on your list</p>`)+`
  <div style="display:flex;gap:8px"><input class="search-page" id="pageSearch" type="search" placeholder="Filter your stores" value="${esc(pageQuery)}" aria-label="Filter stores">
    ${selectMode?`<button class="btn" data-act="sel-done">Done</button>`:`<button class="btn" data-act="sel-start" ${shops.length?"":"disabled"}>Select</button><button class="btn primary" data-act="add-blank">Add</button>`}</div>
  ${selectMode?`<div class="selbar"><button class="btn sm" data-act="sel-all">${selected.size===arr.length&&arr.length?"Clear":"Select all"}</button><span class="sub">${selected.size} selected</span>
    ${draft.confirmBulk?`<span style="display:flex;gap:6px"><button class="btn sm danger" data-act="bulk-yes">Remove ${selected.size}</button><button class="btn sm" data-act="bulk-no">Keep</button></span>`:`<button class="btn sm danger" data-act="bulk-ask" ${selected.size?"":"disabled"}>Remove</button>`}</div>`:""}
  <div class="group" style="margin-top:12px">${rows||`<div class="empty">${shops.length?"No stores match.":"No stores yet."}</div>`}</div>
  <section class="section"><h2 style="margin:0 4px 8px">Client list</h2><div class="group" style="padding:14px">
    ${link?`<p style="margin:0 0 4px"><b>Linked:</b> ${esc(link.file)}</p><p class="sub" style="margin:0 0 12px">${link.rows} rows · linked ${fmtDate(link.linkedAt)}. Unlinking removes the list's info from this device. Stores you've logged visits or deals for stay, with your own notes.</p>
      ${draft.confirmUnlink?`<div class="grid2"><button class="btn danger" data-act="unlink-yes">Unlink now</button><button class="btn" data-act="unlink-no">Keep linked</button></div>`:`<div style="display:flex;gap:8px;flex-wrap:wrap"><label class="btn" for="listFile">Update from file</label><button class="btn danger" data-act="unlink-ask">Unlink list</button></div>`}`
    :`<p class="sub" style="margin:0 0 12px">Link a spreadsheet of clients (Excel or CSV) to fill in owners, phones, emails and addresses, and drop every store on the map. It stays on this device, and you can unlink it any time.</p><label class="btn violet" for="listFile">Link client list</label>`}
    <input id="listFile" type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" hidden>
  </div></section>
  <section class="section"><h2 style="margin:0 4px 8px">Backup</h2><div class="group" style="padding:14px">
    <p class="sub" style="margin:0 0 12px">Stores are saved on this device. Export a backup to move them to your iPad or Mac, then import it there.${lastBackupDays()!=null?` Last backup ${ago(lastBackupDays())}.`:" No backup saved yet."}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="export">Export backup</button><label class="btn" for="importFile">Import backup</label><input id="importFile" type="file" accept="application/json,.json" hidden>
    </div></div></section>
  <section class="section"><h2 style="margin:0 4px 8px">You</h2><div class="group" style="padding:14px"><p class="sub" style="margin:0 0 10px">Used to sign your texts, emails and reports. Saved only on this device.</p><div class="grid2"><label class="field"><span>Your name</span><input id="meName" autocomplete="name" value="${esc(repInfo().name)}"></label><label class="field"><span>Phone / email line</span><input id="mePhone" value="${esc(repInfo().phone)}"></label></div></div></section>
  <section class="section"><h2 style="margin:0 4px 8px">Menu</h2><div class="group" style="padding:14px"><p class="sub" style="margin:0 0 10px">Updated ${fmtDate(MENU.updatedAt)} · ${CATALOG.length} products${CATALOG.some(l=>Object.keys(l.sale||{}).length)?` · ${CATALOG.reduce((n,l)=>n+Object.keys(l.sale||{}).length,0)} on sale`:""}. Prices, strains and sales change, so keep this current.</p><button class="btn wide" data-act="menu-open">Edit menu</button></div></section>
  <section class="section"><h2 style="margin:0 4px 8px">Monthly goals</h2><div class="group" style="padding:14px"><div class="grid2">
    <label class="field"><span>Your goal ($/month)</span><input id="goalMine" type="number" inputmode="numeric" value="${goals().mine}"></label>
    <label class="field"><span>Henry’s goal ($/month)</span><input id="goalCo" type="number" inputmode="numeric" value="${goals().company}"></label></div>
    <label class="field" style="margin-top:10px"><span>Where stores place orders (link in your messages)</span><input id="orderLink" type="url" inputmode="url" autocapitalize="off" value="${esc(settings().orderLink)}"></label>
    <button class="btn wide" style="margin-top:10px" data-act="goals-save">Save</button></div></section>
  <section class="section"><button class="btn wide" data-guide="open">How this app works</button></section>
  <section class="section"><h2 style="margin:0 4px 8px">Start over</h2><div class="group" style="padding:14px">
    <p class="sub" style="margin:0 0 12px">The app starts with the ${(window.HENRYS_RETAILERS||[]).length} Bay Area stores listed as carrying Henry’s. Clear them to build your own list from scratch. You can undo a clear.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
    ${missingRetailers().length?`<button class="btn" data-act="add-retailers">Add Henry’s stores back (${missingRetailers().length})</button>`:""}
    ${lsGet(UNDO_KEY)?`<button class="btn violet" data-act="undo">Undo last ${lsGet(UNDO_KEY).label==="clear"?"clear":"removal"}</button>`:""}
    ${shops.length?(draft.confirmClear?`<span style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn danger" data-act="clear-yes">Clear all ${shops.length}</button><button class="btn" data-act="clear-no">Keep</button></span>`:`<button class="btn danger" data-act="clear-ask">Clear all stores</button>`):""}
    </div></div></section>`;
}

/* ---------- report: full readout for progress reports ---------- */
let rpPeriod = "month", rpBack = "today";
const RP_PERIODS=[["week","This week"],["month","This month"],["last","Last month"],["90","Last 90 days"]];
function rpRange(){
  const n=new Date(), y=n.getFullYear(), m=n.getMonth(), d0=new Date(n); d0.setHours(0,0,0,0);
  if(rpPeriod==="week"){ const s=new Date(d0); s.setDate(s.getDate()-((s.getDay()+6)%7)); return {from:s, to:n, label:`Week of ${s.toLocaleDateString(undefined,{month:"short",day:"numeric"})}`}; }
  if(rpPeriod==="last"){ const s=new Date(y,m-1,1), e=new Date(y,m,1); return {from:s, to:new Date(e-1), label:s.toLocaleDateString(undefined,{month:"long",year:"numeric"})}; }
  if(rpPeriod==="90"){ const s=new Date(d0); s.setDate(s.getDate()-89); return {from:s, to:n, label:"Last 90 days"}; }
  return {from:new Date(y,m,1), to:n, label:n.toLocaleDateString(undefined,{month:"long",year:"numeric"})};
}
const RP_TYPES=[["visit","Visits"],["sample","Sample drops"],["call","Calls"],["text","Texts & emails"],["negotiating","Negotiations"],["verbal","Verbal yeses"],["email","Confirmations sent"],["order","Orders"],["lost","Fell through"]];
function reportData(){
  const R=rpRange(), inR=iso=>{ const t=Date.parse(iso); return t>=R.from.getTime() && t<=R.to.getTime(); };
  const acts=[]; shops.forEach(c=>(c.touches||[]).forEach(t=>{ if(inR(t.at)) acts.push({...t, c}); }));
  acts.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  const byType=Object.fromEntries(RP_TYPES.map(([k])=>[k,0])); acts.forEach(a=>{ if(byType[a.type]!=null) byType[a.type]++; });
  const orders=acts.filter(a=>a.type==="order"&&a.amount>0), sales=orders.reduce((s,o)=>s+o.amount,0);
  const touches=acts.filter(a=>ACTIVE.includes(a.type)&&a.type!=="order").length;
  const contacted=new Set(acts.filter(a=>ACTIVE.includes(a.type)).map(a=>a.c.id));
  const firstVisits=shops.filter(c=>{ const v=(c.touches||[]).filter(t=>ACTIVE.includes(t.type)).map(t=>Date.parse(t.at)); return v.length && inR(new Date(Math.min(...v)).toISOString()); }).length;
  const reached=k=>new Set(acts.filter(a=>a.type===k).map(a=>a.c.id)).size;
  const funnel=[["Contacted",contacted.size],["Sampled",reached("sample")],["Verbal yes",reached("verbal")],["Confirmed",reached("email")],["Ordered",new Set(orders.map(o=>o.c.id)).size]];
  const rows=shops.map(c=>{ const mine=acts.filter(a=>a.c.id===c.id), cnt=k=>mine.filter(a=>a.type===k).length; const sold=mine.filter(a=>a.type==="order").reduce((s,a)=>s+(a.amount||0),0);
    return {c, zone:zoneLabel(c.zone), stage:SNAME[c.stage||"new"], health:health(c), touches:mine.filter(a=>ACTIVE.includes(a.type)&&a.type!=="order").length,
      visit:cnt("visit"), sample:cnt("sample"), call:cnt("call")+cnt("text"), verbal:cnt("verbal"), email:cnt("email"), orders:cnt("order"), sold, open:dealTotal(c.deal?.items),
      last:c.lastContact, lastOrder:c.lastOrderAt, next:c.nextFollowUp}; })
    .sort((a,b)=>b.sold-a.sold||b.touches-a.touches||a.c.name.localeCompare(b.c.name));
  const zones={}; rows.forEach(r=>{ const z=zones[r.zone]||(zones[r.zone]={stores:0,contacted:0,touches:0,sold:0,orders:0}); z.stores++; if(r.touches||r.orders) z.contacted++; z.touches+=r.touches; z.sold+=r.sold; z.orders+=r.orders; });
  const products={}; shops.forEach(c=>(c.priceLog||[]).forEach(p=>{ if(p.at&&inR(p.at)){ const k=(LINE[p.line]?.name||p.line); const e=products[k]||(products[k]={cases:0,dollars:0}); const it=(c.lastOrder||[]).find(i=>i.line===p.line&&i.strain===p.strain); const cs=it?.cases||1; e.cases+=cs; e.dollars+=cs*p.price; } }));
  const lost={}; acts.filter(a=>a.type==="lost").forEach(a=>{ const r=(a.note||"").replace(/^Fell through: /,"").split(" · ")[0]||"Other"; lost[r]=(lost[r]||0)+1; });
  const pipe=["verbal","confirmed","negotiating"].map(k=>{ const arr=shops.filter(c=>c.stage===k); return {k, n:arr.length, v:arr.reduce((s,c)=>s+dealTotal(c.deal?.items),0), names:arr.map(c=>c.name)}; });
  return {R, acts, byType, orders, sales, touches, contacted, firstVisits, funnel, rows, zones, products, lost, pipe};
}
function reportText(D){
  const g=goals(), isMonth=rpPeriod==="month"||rpPeriod==="last", rep={...REP_DEFAULT,...(lsGet("henrys.rep")||{})};
  const L=[];
  L.push(`Henry's · ${rep.name||"Sales rep"} · Sales report`);
  L.push(`${D.R.label} (${fmtDate(D.R.from.toISOString())} – ${fmtDate(D.R.to.toISOString())})`, "");
  L.push(`SALES`);
  L.push(`• ${money(Math.round(D.sales))} from ${D.orders.length} order${D.orders.length===1?"":"s"}${D.orders.length?` · average ${money(Math.round(D.sales/D.orders.length))}`:""}`);
  if(isMonth) L.push(`• ${Math.round(100*D.sales/g.mine)}% of my ${money(g.mine)} monthly goal · ${(100*D.sales/g.company).toFixed(1)}% of Henry's ${money(g.company)}`);
  L.push("", "ACTIVITY");
  RP_TYPES.forEach(([k,l])=>{ if(D.byType[k]) L.push(`• ${l}: ${D.byType[k]}`); });
  L.push(`• Stores contacted: ${D.contacted.size} of ${shops.length} (${shops.length?Math.round(100*D.contacted.size/shops.length):0}%)${D.firstVisits?` · ${D.firstVisits} new`:""}`);
  L.push("", "FUNNEL (stores)");
  L.push("• "+D.funnel.map(([l,n])=>`${l} ${n}`).join(" → "));
  const pipeLines=D.pipe.filter(p=>p.n); if(pipeLines.length){ L.push("", "OPEN PIPELINE"); pipeLines.forEach(p=>L.push(`• ${SNAME[p.k]}: ${p.n}${p.v?` (${money(p.v)})`:""} — ${p.names.join(", ")}`)); }
  const top=D.rows.filter(r=>r.sold>0).slice(0,8); if(top.length){ L.push("", "ORDERS BY STORE"); top.forEach(r=>L.push(`• ${r.c.name}: ${money(r.sold)} (${r.orders} order${r.orders===1?"":"s"})`)); }
  const zs=Object.entries(D.zones).filter(([,z])=>z.touches||z.sold); if(zs.length){ L.push("", "BY ZONE"); zs.sort((a,b)=>b[1].sold-a[1].sold).forEach(([n,z])=>L.push(`• ${n}: ${z.contacted}/${z.stores} stores worked · ${z.touches} touches${z.sold?` · ${money(z.sold)}`:""}`)); }
  const ls=Object.entries(D.lost); if(ls.length){ L.push("", "LOST"); ls.forEach(([r,n])=>L.push(`• ${r}: ${n}`)); }
  const nx=nextMoves().slice(0,5); if(nx.length){ L.push("", "NEXT UP"); nx.forEach(m=>L.push(`• ${m.c.name}: ${m.why}`)); }
  return L.join("\n");
}
const csvCell=v=>{ const s=String(v??""); return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; };
function downloadText(name, text, type){ const f=new File([text],name,{type});
  try{ if(navigator.canShare?.({files:[f]})){ navigator.share({files:[f],title:name}).catch(()=>{}); return; } }catch{}
  const a=document.createElement("a"); a.href=URL.createObjectURL(f); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000); }
function storesCSV(D){ const h=["Store","City","Zone","Stage","Status","Why","Touches","Visits","Samples","Calls/texts","Verbal yes","Confirmations","Orders","Sold ($)","Open deal ($)","Last contact","Last order","Next follow-up","Front desk","Shop email","Owner","Owner phone","Owner email","Buyer","Buyer phone","Buyer email","License","Address"];
  const out=[h.join(",")]; D.rows.forEach(r=>{ const i=infoOf(r.c), b=i.contacts[0]||{};
    out.push([r.c.name,i.city,r.zone,r.stage,({g:"Green",y:"Yellow",r:"Red",n:"Grey"})[r.health.lv],r.health.reasons[0],r.touches,r.visit,r.sample,r.call,r.verbal,r.email,r.orders,r.sold,r.open,r.last?.slice(0,10)||"",r.lastOrder?.slice(0,10)||"",r.next?.slice(0,10)||"",i.shopPhone,i.shopEmail,i.ownerName,i.ownerPhone,i.ownerEmail,b.name,b.phone,b.email,i.license,[i.address,i.city,i.zip].filter(Boolean).join(" ")].map(csvCell).join(",")); });
  return out.join("\n"); }
function activityCSV(D){ const out=["Date,Time,Store,Zone,Action,Amount ($),Note"]; D.acts.forEach(a=>{ const d=new Date(a.at); out.push([d.toLocaleDateString(),d.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}),a.c.name,zoneLabel(a.c.zone),TOUCH[a.type]||a.type,a.amount??"",a.note||""].map(csvCell).join(",")); }); return out.join("\n"); }

function viewReport(){
  const D=reportData(), g=goals(), isMonth=rpPeriod==="month"||rpPeriod==="last", maxT=Math.max(1,...RP_TYPES.map(([k])=>D.byType[k]));
  const pct=Math.min(1,D.sales/g.mine), fmax=Math.max(1,D.funnel[0][1]);
  const lvName={g:"Green",y:"Yellow",r:"Red",n:"Grey"};
  return `<div class="rp-top"><button class="btn sm ghost" data-view="${rpBack}">‹ Back</button></div>`+head("Report",`<p class="sub" style="margin:0">${esc(D.R.label)} · ${fmtDate(D.R.from.toISOString())} – ${fmtDate(D.R.to.toISOString())}</p>`)+`
  <div class="seg rp-seg" role="group" aria-label="Period">${RP_PERIODS.map(([k,l])=>`<button data-rp="${k}" aria-pressed="${rpPeriod===k}">${l}</button>`).join("")}</div>
  <div class="rp-export"><button class="btn primary" data-act="rp-copy">Copy report</button><button class="btn" data-act="rp-email">Email</button><button class="btn" data-act="rp-csv">Spreadsheets</button></div>

  <section class="goal" style="margin-top:14px"><div class="goal-top"><h2>Sales</h2><span class="sub num">${D.orders.length} order${D.orders.length===1?"":"s"}</span></div>
    <div class="goal-num num"><b>${money(Math.round(D.sales))}</b>${isMonth?`<span>of ${money(g.mine)}</span>`:""}</div>
    ${isMonth?`<div class="bigbar ${pct>=1?"done":""}"><i style="width:${(pct*100).toFixed(1)}%"></i></div><div class="goal-meta num"><span>${Math.round(pct*100)}% of your goal</span><span>${(100*D.sales/g.company).toFixed(1)}% of Henry’s ${kfmt(g.company)}</span></div>`:""}
  </section>

  <div class="stats" style="margin-top:12px">
    <div class="stat"><b class="num">${D.touches}</b><span>visits, calls, texts</span></div>
    <div class="stat"><b class="num">${D.contacted.size}<small>/${shops.length}</small></b><span>stores contacted</span></div>
    <div class="stat"><b class="num">${D.orders.length?kfmt(Math.round(D.sales/D.orders.length)):"—"}</b><span>average order</span></div>
    <div class="stat"><b class="num">${D.touches&&D.sales?money(Math.round(D.sales/D.touches)):"—"}</b><span>sales per touch</span></div>
  </div>

  <section class="section"><div class="section-head"><h2>Funnel</h2><span class="sub" style="font-size:13px">stores reaching each step</span></div><div class="group rp-pad">
    ${D.funnel.map(([l,n],i)=>`<div class="fbar"><span>${l}</span><div><i style="width:${(n/fmax*100).toFixed(1)}%;opacity:${1-i*.12}"></i></div><b class="num">${n}</b></div>`).join("")}
  </div></section>

  <section class="section"><div class="section-head"><h2>Activity</h2><span class="sub" style="font-size:13px">${D.acts.length} logged</span></div><div class="group rp-pad">
    ${RP_TYPES.map(([k,l])=>`<div class="fbar"><span>${l}</span><div><i class="${k==="order"?"g":k==="lost"?"r":""}" style="width:${(D.byType[k]/maxT*100).toFixed(1)}%"></i></div><b class="num">${D.byType[k]}</b></div>`).join("")}
  </div></section>

  ${D.pipe.some(p=>p.n)?`<section class="section"><div class="section-head"><h2>Open pipeline</h2><span class="sub" style="font-size:13px">right now</span></div><div class="group">${D.pipe.filter(p=>p.n).map(p=>`<div class="row lv-${p.k==="negotiating"?"y":"r"}" style="cursor:default"><span class="dot"></span><span class="t"><b>${SNAME[p.k]} · ${p.n}</b><small>${esc(p.names.join(", "))}</small></span><span class="rt num">${p.v?money(p.v):""}</span></div>`).join("")}</div></section>`:""}

  <section class="section"><div class="section-head"><h2>By zone</h2></div><div class="tablewrap"><table class="rptable"><thead><tr><th>Zone</th><th>Stores</th><th>Worked</th><th>Touches</th><th>Orders</th><th>Sold</th></tr></thead><tbody>
    ${Object.entries(D.zones).sort((a,b)=>b[1].sold-a[1].sold||b[1].touches-a[1].touches).map(([n,z])=>`<tr><td>${esc(n)}</td><td class="num">${z.stores}</td><td class="num">${z.contacted}</td><td class="num">${z.touches}</td><td class="num">${z.orders}</td><td class="num">${z.sold?money(z.sold):"—"}</td></tr>`).join("")}
  </tbody></table></div></section>

  ${Object.keys(D.products).length?`<section class="section"><div class="section-head"><h2>By product</h2></div><div class="tablewrap"><table class="rptable"><thead><tr><th>Product</th><th>Cases</th><th>Sold</th></tr></thead><tbody>${Object.entries(D.products).sort((a,b)=>b[1].dollars-a[1].dollars).map(([n,p])=>`<tr><td>${esc(n)}</td><td class="num">${p.cases}</td><td class="num">${money(p.dollars)}</td></tr>`).join("")}</tbody></table></div></section>`:""}

  <section class="section"><div class="section-head"><h2>Every store</h2><span class="sub" style="font-size:13px">swipe the table sideways</span></div><div class="tablewrap"><table class="rptable stores"><thead><tr>
    <th>Store</th><th>Status</th><th>Stage</th><th>Touches</th><th>Visits</th><th>Samples</th><th>Calls / texts</th><th>Verbal</th><th>Confirms</th><th>Orders</th><th>Sold</th><th>Open deal</th><th>Last contact</th><th>Next follow-up</th></tr></thead><tbody>
    ${D.rows.map(r=>`<tr data-open="${r.c.id}"><td><b>${esc(r.c.name)}</b><small>${esc(r.zone)}</small></td><td><span class="pill lv-${r.health.lv}">${lvName[r.health.lv]}</span></td><td>${esc(r.stage)}</td>
      <td class="num">${r.touches||"·"}</td><td class="num">${r.visit||"·"}</td><td class="num">${r.sample||"·"}</td><td class="num">${r.call||"·"}</td><td class="num">${r.verbal||"·"}</td><td class="num">${r.email||"·"}</td><td class="num">${r.orders||"·"}</td>
      <td class="num">${r.sold?money(r.sold):"·"}</td><td class="num">${r.open?money(r.open):"·"}</td><td class="num">${r.last?ago(daysSince(r.last)):"never"}</td><td class="num">${r.next?fmtDate(r.next):"—"}</td></tr>`).join("")}
  </tbody></table></div></section>

  ${Object.keys(D.lost).length?`<section class="section"><div class="section-head"><h2>Lost deals</h2></div><div class="group rp-pad">${Object.entries(D.lost).sort((a,b)=>b[1]-a[1]).map(([r,n])=>`<div class="fbar"><span>${esc(r)}</span><div><i class="r" style="width:${(n/Math.max(...Object.values(D.lost))*100).toFixed(1)}%"></i></div><b class="num">${n}</b></div>`).join("")}</div></section>`:""}

  <section class="section"><div class="section-head"><h2>Activity log</h2><span class="sub" style="font-size:13px">newest first</span></div><div class="group">
    ${D.acts.length?D.acts.slice(0,250).map(a=>`<button class="row lv-${a.type==="order"?"g":a.type==="lost"?"r":["verbal","email"].includes(a.type)?"y":"n"}" data-open="${a.c.id}"><span class="dot"></span><span class="t"><b>${esc(TOUCH[a.type]||a.type)} · ${esc(a.c.name)}</b><small>${new Date(a.at).toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}${a.note?" · "+esc(a.note):""}</small></span><span class="rt num" style="${a.amount?"color:var(--g);font-weight:700;font-size:15px":""}">${a.amount?money(a.amount):""}</span></button>`).join(""):`<div class="empty">Nothing logged in this period yet. Every visit, sample drop, text, verbal yes, confirmation and order you log shows up here.</div>`}
  </div></section>

  <section class="section"><div class="section-head"><h2>Report text</h2><span class="sub" style="font-size:13px">ready to paste</span></div><pre class="rptext" id="rpText">${esc(reportText(D))}</pre></section>`;
}

/* ---------- plan my route ---------- */
const ROUTE_KEY="henrys.route";
function routeToday(){ const r=lsGet(ROUTE_KEY); if(!r || r.date!==todayISO()) return null; r.ids=r.ids.filter(id=>shops.some(c=>c.id===id&&c.lat!=null)); return r.ids.length?r:null; }
function touchedToday(c){ return (c.touches||[]).some(t=>ACTIVE.includes(t.type) && daysSince(t.at)===0); }
const apple=(c)=>`https://maps.apple.com/?daddr=${c.lat},${c.lon}&q=${encodeURIComponent(c.name)}`;
const gmPlace=(c)=>{ const i=infoOf(c); return i.address ? [c.name, i.address, i.city||"", "CA"].filter(Boolean).join(", ") : `${c.lat},${c.lon}`; };
function orderStops(start, list){
  // straight-line miles, but moving between counties (on the Bay that usually means a bridge) costs extra,
  // so the route finishes one area before heading to the next
  const zn=new Map(), zOf=p=>{ if(!zn.has(p)) zn.set(p, p.zone ?? (typeof zoneOf==="function" ? zoneOf(p.lat,p.lon) : null)); return zn.get(p); };
  const D=(a,b)=>{ const m=miles(a,b)||0, x=zOf(a)!==zOf(b); return x ? m*1.35+4 : m; }, pts=list.slice(), out=[]; let cur=start;
  if(!cur){ out.push(pts.shift()); cur=out[0]; }
  while(pts.length){ let bi=0,bd=1e9; pts.forEach((p,i)=>{ const d=D(cur,p); if(d<bd){ bd=d; bi=i; } }); cur=pts.splice(bi,1)[0]; out.push(cur); }
  const P=start?[start,...out]:out, n=P.length; let better=true, guard=0;
  while(better && guard++<60){ better=false;
    for(let i=1;i<n-1;i++) for(let k=i+1;k<n;k++){
      const d0=D(P[i-1],P[i])+(k<n-1?D(P[k],P[k+1]):0), d1=D(P[i-1],P[k])+(k<n-1?D(P[i],P[k+1]):0);
      if(d1+1e-9<d0){ P.splice(i,k-i+1,...P.slice(i,k+1).reverse()); better=true; } } }
  return start?P.slice(1):P;
}
function routeSuggest(){
  const moves=nextMoves().filter(m=>m.c.lat!=null);
  const anchor=me || moves[0]?.c; if(!anchor) return [];
  return moves.filter(m=>miles(anchor,m.c)<=15).slice(0,6).map(m=>m.c.id);
}
function openRoute(){ const r=routeToday(); sheet={type:"route"}; draft={ routeSel:new Set(r?r.ids:routeSuggest()), routeEdit:!r }; if(!me) locate(false); render(); }
function buildRoute(){
  const picks=shops.filter(c=>draft.routeSel.has(c.id)&&c.lat!=null); if(!picks.length){ toast("Pick at least one store."); return; }
  const ordered=orderStops(me, picks);
  lsSet(ROUTE_KEY,{date:todayISO(), ids:ordered.map(c=>c.id), from:me?"me":"first"});
  draft.routeEdit=false; renderSheet(); updateMapData(); fitRoute();
}
function fitRoute(){ const r=routeToday(); if(!r||!map) return; const pts=r.ids.map(id=>shops.find(c=>c.id===id)).filter(Boolean); if(me) pts.push(me);
  const lons=pts.map(p=>p.lon), lats=pts.map(p=>p.lat); if(!pts.length) return;
  map.fitBounds([[Math.min(...lons),Math.min(...lats)],[Math.max(...lons),Math.max(...lats)]],{padding: isWide()?{top:80,bottom:80,left:80,right:500}:{top:130,bottom:Math.round(viewH()*.55),left:40,right:40},maxZoom:15,duration:800}); }
function googleLegs(stops){
  const legs=[]; let origin=me?`${me.lat},${me.lon}`:null, rest=stops.slice();
  if(!origin){ origin=gmPlace(rest[0]); rest=rest.slice(1); }
  while(rest.length){ const part=rest.splice(0,10), dest=part.pop();
    const q=new URLSearchParams({api:"1",origin,destination:gmPlace(dest),travelmode:"driving"}); if(part.length) q.set("waypoints",part.map(gmPlace).join("|"));
    legs.push(`https://www.google.com/maps/dir/?${q}`); origin=gmPlace(dest); }
  return legs;
}
function routeSheet(){
  const r=routeToday();
  if(r && !draft.routeEdit){
    const stops=r.ids.map(id=>shops.find(c=>c.id===id)).filter(Boolean), done=stops.filter(touchedToday).length, next=stops.find(c=>!touchedToday(c));
    let prev=me, total=0; const rows=stops.map((c,i)=>{ const d=miles(prev,c); if(d!=null) total+=d; prev=c; const ok=touchedToday(c);
      return `<div class="rstop ${ok?"done":""}"><span class="rnum">${ok?"✓":i+1}</span><button class="rbody" data-open="${c.id}"><b>${esc(c.name)}</b><small>${esc(infoOf(c).city||zoneLabel(c.zone))}${d!=null?` · ${fmtMi(d)}`:""}</small></button><a class="chipbtn" href="${apple(c)}" target="_blank" rel="noopener">Go</a></div>`; }).join("");
    const legs=googleLegs(stops);
    return `<div class="sheet-head"><div><div class="eyebrow">Today’s route</div><h1>${done===stops.length?"Route done":`${stops.length-done} stop${stops.length-done===1?"":"s"} left`}</h1><div class="sub">${stops.length} stores · about ${fmtMi(total)} ${me?"from where you are":"start to finish"}</div></div>${xBtn}</div>
    <div class="sheet-body">
      ${next?`<a class="btn primary wide" href="${apple(next)}" target="_blank" rel="noopener">Next: ${esc(next.name)}</a>`:`<p class="sub" style="margin:0 0 10px">Every stop has been logged today. Nice work.</p>`}
      <div class="group" style="margin-top:12px">${rows}</div>
      <div class="grid2" style="margin-top:12px">${legs.map((u,i)=>`<a class="btn" href="${u}" target="_blank" rel="noopener">Google Maps${legs.length>1?` · part ${i+1}`:""}</a>`).join("")}<button class="btn" data-act="route-cal">Add to calendar</button><button class="btn" data-act="route-edit">Change stops</button><button class="btn" data-act="week-open">Plan the week</button></div>
      <button class="btn danger wide" style="margin-top:10px" data-act="route-clear">Clear today’s route</button>
      <p class="sub" style="font-size:13px;margin-top:10px">A stop checks off when you log anything there today.</p>
    </div>`;
  }
  const sel=draft.routeSel, anchor=me||shops.find(c=>sel.has(c.id))||null, sug=new Set(routeSuggest());
  const pickRow=c=>{ const d=miles(anchor,c), on=sel.has(c.id), mv=nextMoves().find(m=>m.c.id===c.id);
    return `<button class="row sel ${on?"on":""}" data-rpick="${c.id}"><span class="check" aria-hidden="true"></span><span class="t"><b>${esc(c.name)}</b><small>${esc(mv?.why||infoOf(c).city||"")}</small></span><span class="sub num" style="font-size:13px">${d!=null?fmtMi(d):""}</span></button>`; };
  const placed=shops.filter(c=>c.lat!=null), top=placed.filter(c=>sug.has(c.id)||sel.has(c.id)), rest=placed.filter(c=>!top.includes(c)).sort((a,b)=>(miles(anchor,a)??1e9)-(miles(anchor,b)??1e9));
  const shown=draft.routeAll?rest:rest.slice(0,12);
  return `<div class="sheet-head"><div><div class="eyebrow">Plan my route</div><h1>Pick today’s stops</h1><div class="sub">HEAT puts them in the quickest order${me?" from where you are":""}.</div></div>${xBtn}</div>
  <div class="sheet-body">
    ${me?"":`<button class="btn sm" data-act="route-me" style="margin-bottom:10px">Start from my location</button>`}
    <h2 style="margin:6px 4px 8px">Worth hitting today</h2><div class="group">${top.map(pickRow).join("")||`<div class="empty">Nothing urgent. Pick from the stores below.</div>`}</div>
    <h2 style="margin:16px 4px 8px">${me?"Closest to you":"Other stores"}</h2><div class="group">${shown.map(pickRow).join("")}</div>
    ${rest.length>shown.length?`<button class="btn wide" style="margin-top:8px" data-act="route-all">Show all ${rest.length}</button>`:""}
    <button class="btn wide" style="margin-top:12px" data-act="week-open">Plan the whole week instead</button>
    <div class="routebar"><button class="btn primary wide" data-act="route-build" ${sel.size?"":"disabled"}>Build route · ${sel.size} stop${sel.size===1?"":"s"}</button></div>
  </div>`;
}
function routeCard(){
  const r=routeToday();
  if(!r) return `<div class="routepair"><button class="routecta" data-act="route-open"><span><b>Plan my route</b><small>Today’s stores in the quickest order</small></span><span aria-hidden="true">›</span></button><button class="routecta wk" data-act="week-open"><span><b>Plan the week</b><small>Five days, grouped by area</small></span><span aria-hidden="true">›</span></button></div>`;
  const stops=r.ids.map(id=>shops.find(c=>c.id===id)).filter(Boolean), done=stops.filter(touchedToday).length;
  return `<button class="routecta on" data-act="route-open"><span><b>Today’s route · ${done} of ${stops.length} done</b><small>${done<stops.length?`Next: ${esc(stops.find(c=>!touchedToday(c)).name)}`:"Every stop logged"}</small></span><span aria-hidden="true">›</span></button>`;
}

/* ---------- quick log from the map pin ---------- */
const QUICK=[["visit","Visited"],["sample","Samples"],["call","Called"],["text","Texted"]];
function quickSheet(c){
  const h=health(c), d=miles(me,c), mv=nextMoves().find(m=>m.c.id===c.id), today=(c.touches||[]).filter(t=>daysSince(t.at)===0);
  return `<div class="sheet-head"><div><div class="eyebrow">${esc(infoOf(c).city||zoneLabel(c.zone)||"")}${d!=null?" · "+fmtMi(d):""}</div><h1>${esc(c.name)}</h1>
      <div class="qstat"><span class="pill lv-${h.lv}">${esc(SNAME[c.stage||"new"])}</span><span class="sub">${esc(mv?.why||h.reasons?.[0]||"")}</span></div></div>${xBtn}</div>
    <div class="sheet-body">
      <div class="qlog" role="group" aria-label="Log what happened">${QUICK.map(([k,l])=>{ const n=today.filter(t=>t.type===k).length; return `<button class="qbtn ${n?"on":""}" data-qlog="${k}">${n?"✓ ":""}${l}</button>`; }).join("")}</div>
      ${today.length?`<p class="sub" style="font-size:13px;margin:8px 2px 0">Logged today: ${today.map(t=>esc(TOUCH[t.type]||t.type)).join(", ")}</p>`:""}
      <div class="grid2" style="margin-top:12px">${c.lat!=null?`<a class="btn violet" href="${apple(c)}" target="_blank" rel="noopener">Directions</a>`:""}<button class="btn" data-open="${c.id}">Open store ›</button></div>
    </div>`;
}

/* ---------- sheets ---------- */
function openSheet(s){ sheet=s; draft={}; if(s.type==="shop"||s.type==="quick"){ const c=shops.find(x=>x.id===s.id); if(c?.lat!=null && view==="map") flyTo(c.lon,c.lat,Math.max(13,map.getZoom())); } if(s.type==="zone"){ const z=ZMAP[s.id]; if(z) fitZone(z); } $("#results").hidden=true; render(); updateMapData(); }
function closeSheet(){ sheet=null; draft={}; render(); updateMapData(); }
function renderSheet(){
  const host=$("#sheetHost");
  if(!sheet){ host.innerHTML=""; return; }
  const ae=document.activeElement;
  if(host.contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)){ pendingSheet=true; return; }
  pendingSheet=false;
  let body="";
  if(sheet.type==="shop"){ const c=shops.find(x=>x.id===sheet.id); if(!c){ sheet=null; host.innerHTML=""; return; } body = sheet.mode==="email" ? emailSheet(c) : sheet.mode==="edit" ? editSheet(c) : shopSheet(c); }
  else if(sheet.type==="zone") body=zoneSheet(sheet.id);
  else if(sheet.type==="add") body=editSheet(null, sheet.data||{});
  else if(sheet.type==="candidate") body=candidateSheet(sheet.data);
  else if(sheet.type==="nearby") body=nearbySheet(sheet.data);
  else if(sheet.type==="link") body=linkSheet(sheet.data);
  else if(sheet.type==="menu") body=menuSheet();
  else if(sheet.type==="route") body=routeSheet();
  else if(sheet.type==="week") body=weekSheet();
  else if(sheet.type==="quick"){ const c=cur(); if(!c){ sheet=null; host.innerHTML=""; return; } body=quickSheet(c); }
  const prevScroll = host.querySelector(".sheet-body")?.scrollTop||0, wasOpen=!!host.querySelector(".sheet");
  const modal = sheet.type==="add" || sheet.type==="link" || sheet.type==="menu" || sheet.mode==="edit" || sheet.mode==="email" || view!=="map";
  const peek = !modal && !sheet.full;
  host.innerHTML=`<div class="scrim ${modal?"":"light"}" data-close></div><div class="sheet ${wasOpen?"":"enter"} ${peek?"peek":""}" role="dialog" aria-modal="${modal}"><div class="grab" aria-hidden="true"></div>${body}</div>`;
  const b=host.querySelector(".sheet-body"); if(b && wasOpen && !sheet._reset) b.scrollTop=prevScroll; sheet._reset=false;
  bindGrab(host.querySelector(".sheet"));
  const sb=host.querySelector(".sheet.peek .sheet-body"); if(sb) sb.addEventListener("scroll",()=>{ if(sb.scrollTop>40 && sheet && !sheet.full){ sheet.full=true; host.querySelector(".sheet").classList.remove("peek"); } },{passive:true});
}
function bindGrab(el){
  const g=el.querySelector(".grab"); let y0=null, dy=0;
  g.addEventListener("pointerdown",e=>{ y0=e.clientY; dy=0; g.setPointerCapture(e.pointerId); el.style.transition="none"; });
  g.addEventListener("pointermove",e=>{ if(y0==null) return; dy=Math.max(0,e.clientY-y0); el.style.transform=`translateY(${dy}px)`; });
  let raw=0; g.addEventListener("pointermove",e=>{ if(y0!=null) raw=e.clientY-y0; });
  const end=()=>{ if(y0==null) return; y0=null; el.style.transition="";
    if(dy>90){ if(sheet?.full){ sheet.full=false; el.style.transform=""; renderSheet(); } else closeSheet(); }
    else if(raw<-30 || Math.abs(raw)<6){ el.style.transform=""; if(sheet){ sheet.full = raw<-30 ? true : !sheet.full; renderSheet(); } }
    else el.style.transform=""; raw=0; };
  g.addEventListener("pointerup",end); g.addEventListener("pointercancel",end);
}
function _unused(){}
const xBtn = `<button class="iconbtn" data-close aria-label="Close">✕</button>`;
const backBtn = `<button class="iconbtn" data-act="back" aria-label="Back">‹</button>`;

function zoneSheet(zid){
  const z=ZMAP[zid], s=zoneSummary(zid,cat), n=s.list.length||1;
  const byCity={}; s.list.forEach(c=>{ (byCity[infoOf(c).city||"Other"] ||= []).push(c); });
  const sortFn=(a,b)=>RANK[health(b,cat).lv]-RANK[health(a,cat).lv] || ((miles(me,a)??0)-(miles(me,b)??0)) || a.name.localeCompare(b.name);
  const cities=Object.keys(byCity).sort((a,b)=>byCity[b].length-byCity[a].length||a.localeCompare(b));
  return `<div class="sheet-head"><div><div class="eyebrow">Zone${cat!=="all"?" · "+CATS[cat]:""}</div><h1>${esc(z.label)}</h1><div class="sub">${s.list.length} store${s.list.length===1?"":"s"} · ${s.cnt.r} red · ${s.cnt.y} yellow · ${s.cnt.g} green</div></div>${xBtn}</div>
  <div class="sheet-body">
    ${s.list.length?`<div class="ratio" aria-hidden="true"><i style="width:${100*s.ord.placed/n}%;background:var(--g)"></i><i style="width:${100*s.ord.pending/n}%;background:var(--y)"></i><i style="width:${100*s.ord.absent/n}%;background:var(--n)"></i></div>
    <div class="ratio-key num"><span>${s.ord.placed} ordered (30d)</span><span>${s.ord.pending} pending</span><span>${s.ord.absent} no order</span></div>`:""}
    ${cities.map(city=>`<div class="citygrp"><h2>${esc(city)} · ${byCity[city].length}</h2><div class="group">${byCity[city].sort(sortFn).map(c=>shopRow(c,cat)).join("")}</div></div>`).join("") || `<p class="sub" style="margin-top:14px">No stores in this zone yet. Tap <b>Find nearby</b> while zoomed into a city to see its dispensaries.</p>`}
    <div style="display:flex;gap:8px;margin-top:16px"><button class="btn violet" data-act="nearby-zone">Find dispensaries here</button></div>
  </div>`;
}
function candidateSheet(g){
  if(!g) return `<div class="sheet-body"><p class="sub">This place is no longer on the map.</p></div>`;
  return `<div class="sheet-head"><div><div class="eyebrow">Dispensary · not on your list</div><h1>${esc(g.name)}</h1><div class="sub">${esc([g.address,g.city].filter(Boolean).join(", ")||"Address not listed on the map")}</div></div>${xBtn}</div>
  <div class="sheet-body"><div style="display:grid;gap:8px;margin-top:6px"><button class="btn primary wide" data-addghost="${esc(g.osm)}">Add to my stores</button>
  <a class="btn wide" href="https://maps.apple.com/?daddr=${g.lat},${g.lon}&q=${encodeURIComponent(g.name)}" target="_blank" rel="noopener">Directions</a></div>
  ${g.phone?`<p class="sub" style="margin-top:14px">Phone: <span class="copy">${esc(g.phone)}</span></p>`:""}</div>`;
}
function nearbySheet(list){
  const sorted=list.slice().sort((a,b)=>onList(a)-onList(b)||a.name.localeCompare(b.name));
  return `<div class="sheet-head"><div><div class="eyebrow">In this map view</div><h1>${list.length} dispensar${list.length===1?"y":"ies"}</h1><div class="sub">Orange rings on the map are ones you haven’t added.</div></div>${xBtn}</div>
  <div class="sheet-body"><div class="group" style="margin-top:6px">${sorted.map(g=>{ const mine=shops.find(c=>(c.osm&&c.osm===g.osm)||(c.lat!=null&&miles(c,g)<0.03)); return mine ? shopRow(mine,"all","On your list") :
    `<div class="row lv-n" style="cursor:default"><span class="dot" style="--c:var(--pumpkin)"></span><span class="t"><b>${esc(g.name)}</b><small>${esc([g.address,g.city].filter(Boolean).join(", ")||"Address not listed")}</small></span><button class="btn sm primary" data-addghost="${esc(g.osm)}">Add</button></div>`; }).join("")||`<div class="empty">Nothing mapped here.</div>`}</div>
  <p class="sub" style="font-size:13px;margin-top:12px">Dispensary locations come from OpenStreetMap. A store that’s missing can be added by searching its address.</p></div>`;
}
function shopSheet(c){
  const h=health(c), st=c.stage||"new", lost=st==="lost", idx=lost?3:SORDER[st], items=c.deal?.items||[];
  const curLine=(LINE[draft.line]&&!LINE[draft.line].off)?draft.line:CATALOG[0].id, strains=LINE[curLine].strains, curStrain=strains.includes(draft.strain)?draft.strain:strains[0], pf=priceFor(c,curLine,curStrain), price=draft.price??pf.price;
  const d=miles(me,c);
  return `<div class="sheet-head"><div style="min-width:0"><div class="eyebrow">${esc([c.city, zoneLabel(c.zone)].filter((x,i,a)=>x && a.indexOf(x)===i && !(i===1 && zoneLabel(c.zone).split(" · ").pop()===c.city)).join(" · "))}</div><h1>${esc(c.name)}</h1>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;align-items:center"><span class="pill lv-${h.lv}">${SNAME[st]}</span>${c.tier?`<span class="tier ${c.tier}">Tier ${esc(c.tier)}</span>`:""}${c.house?`<span class="tag">${esc(c.house)} house</span>`:""}${c.preset?'<span class="tag" style="color:var(--pumpkin);border-color:rgb(255 154 60 / .45)">Carries Henry’s</span>':""}</div>
    <div class="stepper ${lost?"lost":""}">${STAGES.slice(0,7).map((s,i)=>`<i class="${i<=idx?"on":""}"></i>`).join("")}</div></div>${xBtn}</div>
  <div class="sheet-body">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      ${c.lat!=null?`<a class="btn violet" href="https://maps.apple.com/?daddr=${c.lat},${c.lon}&q=${encodeURIComponent(c.name)}" target="_blank" rel="noopener">Directions${d!=null?" · "+fmtMi(d):""}</a>`:`<button class="btn" data-act="edit">Add location</button>`}
      ${bestPhone(c)?`<a class="btn" href="${telHref(bestPhone(c).num)}">Call ${esc(bestPhone(c).who)}</a>`:`<button class="btn" data-act="edit">Add phone</button>`}
    </div>
    ${glance(c)}
    <div class="blk lv-${h.lv}" style="border-left:3px solid var(--c)"><h2>Status</h2>
      <div class="reasons">${(h.detail||[{lv:h.lv,t:h.reasons[0]}]).map(r=>`<span class="pill lv-${r.lv}">${esc(r.t)}</span>`).join("")}</div>
      <dl class="kv num" style="margin-top:12px"><dt>Last contact</dt><dd>${ago(daysSince(c.lastContact))}</dd><dt>Last order</dt><dd>${c.lastOrderAt?ago(daysSince(c.lastOrderAt)):"none yet"}</dd>
      <dt>Follow up</dt><dd><input type="date" id="fu" class="input" style="min-height:38px;padding:6px 10px;font-size:16px;width:auto" value="${c.nextFollowUp?c.nextFollowUp.slice(0,10):""}">${c.nextFollowUp?` <button class="chipbtn" data-act="fu-cal">Add to calendar</button>`:""}</dd></dl>
    </div>
    <div class="blk"><h2>Log what happened</h2>
      <input class="input" id="touchNote" placeholder="Note (optional): “yes to 3 cs at $165”" value="${esc(draft.note||"")}" style="margin-bottom:10px">
      <div class="actions">
        <button class="btn" data-touch="visit">Visited</button><button class="btn" data-touch="sample">Samples</button><button class="btn" data-touch="call">Call / text</button>
        <button class="btn" data-touch="negotiating">Negotiating</button><button class="btn" data-touch="verbal">Verbal yes</button><button class="btn primary" data-act="email">Confirm</button>
        <button class="btn" data-act="order-ask" style="grid-column:span 2;color:var(--g);border-color:color-mix(in srgb,var(--g) 45%,transparent)">Order placed</button><button class="btn" data-act="lost">Fell through</button>
      </div>
      ${draft.orderOpen?`<div class="orderbox"><label class="field"><span>Order total</span><div class="moneyin"><span>$</span><input id="orderAmt" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(draft.orderAmt ?? (dealTotal(items)||""))}" placeholder="0"></div></label>
        <p class="sub" style="font-size:13px;margin:6px 0 10px">${items.length?"Filled in from the current deal. Change it if the final order was different.":"Enter what they ordered. It counts toward your monthly goal."}</p>
        <div class="grid2"><button class="btn primary" data-act="order-save">Save order</button><button class="btn" data-act="order-cancel">Cancel</button></div></div>`:""}
      ${draft.lostOpen?`<div style="margin-top:12px"><div class="sub" style="margin-bottom:8px">Why did it fall through?</div><div style="display:flex;flex-wrap:wrap;gap:6px">${LOST_REASONS.map(r=>`<button class="btn sm" data-lost="${esc(r)}">${esc(r)}</button>`).join("")}</div></div>`:""}
    </div>
    <div class="blk"><h2>Send a message</h2>
      <div class="kinds">${MSG_KINDS.map(([k,l])=>`<button class="kchip" data-kind="${k}" aria-pressed="${(draft.kind||kindFor(c))===k}">${l}</button>`).join("")}</div>
      ${msgBlock(c, draft.kind||kindFor(c))}
    </div>
    <div class="blk"><h2>Current deal</h2>
      ${items.length?`<table class="items num"><tbody>${items.map((i,k)=>`<tr><td>${esc((LINE[i.line]?.name||i.line)+" · "+i.strain)}<div class="sub" style="font-size:13px">${i.cases} cs × ${money(i.price)}${LINE[i.line]&&i.price<LINE[i.line].price?` · list ${money(LINE[i.line].price)}`:""}</div></td><td class="r">${money(i.cases*i.price)} <button class="iconbtn sm" data-delitem="${k}" aria-label="Remove line">✕</button></td></tr>`).join("")}<tr><td><b>Total</b></td><td class="r"><b>${money(dealTotal(items))}</b></td></tr></tbody></table>`:`<p class="sub" style="margin:0 0 4px">Add what you negotiated and the confirmation email writes itself.</p>`}
      <div class="form" style="margin-top:12px">
        <select class="input" id="addLine" aria-label="Product">${Object.entries(CATS).map(([k,l])=>`<optgroup label="${l}">${CATALOG.filter(x=>x.cat===k).map(x=>`<option value="${x.id}" ${x.id===curLine?"selected":""}>${x.name} · ${money(priceFor(c,x.id,x.strains[0]).price)}/cs</option>`).join("")}</optgroup>`).join("")}</select>
        <select class="input" id="addStrain" aria-label="Strain">${strains.map(s=>`<option value="${esc(s)}" ${s===curStrain?"selected":""}>${esc(s)}${saleOf(curLine,s)!=null?` · sale ${money(saleOf(curLine,s))}`:""}</option>`).join("")}</select>
        <div class="grid2"><label class="field"><span>Cases</span><input id="addCases" type="number" min="1" inputmode="numeric" value="${esc(draft.cases??1)}"></label><label class="field"><span>Price / case</span><input id="addPrice" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(price)}"></label></div>
        <div class="pricesrc">${draft.price!=null?"Your price":esc(pf.src)}${pf.price!==LINE[curLine].price&&draft.price==null?` · menu ${money(LINE[curLine].price)}`:""}</div>
        <button class="btn wide" data-act="additem">Add to deal</button>
      </div>
      ${(()=>{ const sg=suggestItems(c); return sg.length?`<div class="upsell"><h4>Make it bigger</h4>${sg.map(x=>`<button class="upchip" data-addsug="${esc(x.line+"|"+x.strain+"|"+x.price)}"><b>+ ${esc(LINE[x.line].name)} ${esc(x.strain.replace(" (sale)",""))}</b><small>${esc(x.why)} · ${money(x.price)}/cs</small></button>`).join("")}</div>`:""; })()}
      ${c.lastOrder?.length?`<p class="sub" style="font-size:14px;margin:12px 0 0">Last order: ${c.lastOrder.map(i=>`${i.cases} cs ${esc((LINE[i.line]?.name||"")+" "+i.strain)}`).join(", ")}</p>`:""}
    </div>
    ${specialsBlock(c)}
    <div class="blk"><h2>Their shelf</h2>${Object.entries(CATS).map(([k,l])=>`<div class="stockrow"><span>${l}</span><div class="seg" role="group" aria-label="${l}">${[["ok","Stocked"],["low","Low"],["out","Out"],["none","None"]].map(([v,t])=>`<button data-stock="${k}:${v}" aria-pressed="${(c.stock?.[k]||"none")===v}">${t}</button>`).join("")}</div></div>`).join("")}</div>
    <div class="blk"><h2>History</h2><ul class="log">${(c.touches||[]).slice().sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).map(t=>`<li><time class="num">${fmtDate(t.at)}</time><span><b>${TOUCH[t.type]||t.type}</b>${t.amount!=null?` · <span class="num" style="color:var(--g)">${money(t.amount)}</span>`:""}${t.note?` · ${esc(t.note)}`:""}</span></li>`).join("")||`<li><span></span><span class="sub">Nothing logged yet.</span></li>`}</ul></div>
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button class="btn" data-act="edit">Edit store info</button>${view!=="map"&&c.lat!=null?`<button class="btn" data-act="showmap">Show on map</button>`:""}</div>
    ${draft.confirmRemove?`<div class="blk" style="border-color:color-mix(in srgb,var(--r) 50%,transparent)"><p style="margin:0 0 10px">Remove <b>${esc(c.name)}</b> and its history from your stores?</p><div class="grid2"><button class="btn danger" data-act="remove-yes">Remove</button><button class="btn" data-act="remove-no">Keep</button></div></div>`:`<button class="btn danger wide" style="margin-top:12px" data-act="remove-ask">Remove store</button>`}
  </div>`;
}
function buildEmail(c){
  const inf=infoOf(c); const ct=inf.contacts.find(x=>x.email)||(inf.ownerEmail?{name:inf.ownerName,email:inf.ownerEmail}:null)||(inf.shopEmail?{name:"",email:inf.shopEmail}:null)||inf.contacts[0]||{}; const rep={...REP_DEFAULT,...(lsGet("henrys.rep")||{})}; const items=c.deal?.items||[];
  const lines=items.map(i=>`• ${i.cases} case${i.cases==1?"":"s"} — ${(LINE[i.line]?.name||i.line)} · ${i.strain} @ ${money(i.price)}/case = ${money(i.cases*i.price)}`).join("\n");
  const first=(ct.name||"").split(" ")[0]; const hi = first && first!=="Buyer" ? first : "there";
  return {to:ct.email||"", subject:`Henry's — confirming our order for ${c.name}`,
    body:`Hi ${hi},\n\nThanks for your time${daysSince(c.lastContact)===0?" today":""}. Confirming what we agreed on:\n\n${lines||"• (add products to the deal)"}\n\nTotal: ${money(dealTotal(items))}\n\nThese prices are locked for you. Please place the order through the usual ordering channel when you're ready${c.deliveryDays?` so it lands on your ${c.deliveryDays} delivery`:""}. If anything changes on your end, just reply here and I'll adjust.\n\nThanks,\n${rep.name?rep.name+"\n":""}Henry's${rep.phone?"\n"+rep.phone:""}`};
}
function emailSheet(c){
  const e=draft.email||(draft.email=buildEmail(c)); const rep={...REP_DEFAULT,...(lsGet("henrys.rep")||{})};
  return `<div class="sheet-head"><div><div class="eyebrow">${esc(c.name)}</div><h1>Confirmation email</h1></div>${backBtn}</div>
  <div class="sheet-body">
    <p class="sub" style="margin-top:0">Send this the same day as the verbal yes. Exact cases and prices in writing keep the buyer from forgetting or getting undercut.</p>
    <div class="grid2"><label class="field"><span>Your name</span><input id="repName" value="${esc(rep.name)}"></label><label class="field"><span>Phone / email line</span><input id="repPhone" value="${esc(rep.phone)}"></label></div>
    <div class="blk"><div class="locline">To <span class="copy">${esc(e.to||"no email saved")}</span></div><div class="locline" style="margin-top:8px">Subject <span class="copy">${esc(e.subject)}</span></div>
      <textarea class="emailbox" id="emailBody" style="margin-top:12px" aria-label="Email text">${esc(e.body)}</textarea>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px"><a class="btn violet" href="mailto:${encodeURIComponent(e.to)}?subject=${encodeURIComponent(e.subject)}&body=${encodeURIComponent(e.body)}" id="mailLink">Open in Mail</a><button class="btn" data-act="copybody">Copy text</button></div>
    </div>
    <button class="btn primary wide" style="margin-top:14px" data-act="emailsent">I sent it · mark confirmed</button>
  </div>`;
}
function editSheet(c, pre={}){
  const v=c||{tier:"B",house:"Rolls",...pre}; const ct=(v.contacts||[]).concat([{},{}]).slice(0,2);
  const lat=draft.lat!==undefined?draft.lat:v.lat, lon=draft.lon!==undefined?draft.lon:v.lon;
  const f=(id,l,val,a="")=>`<label class="field"><span>${l}</span><input id="${id}" value="${esc(draft[id]??val??"")}" ${a}></label>`;
  const tel='type="tel" inputmode="tel" autocomplete="off"', mail='type="email" inputmode="email" autocapitalize="off" autocomplete="off"';
  return `<div class="sheet-head"><div><div class="eyebrow">${c?"Edit":"New store"}</div><h1>${c?esc(c.name):"Add a store"}</h1></div>${c?backBtn:xBtn}</div>
  <form class="sheet-body form" id="editForm" novalidate>
    ${f("e_name","Dispensary name",v.name,'autocomplete="off" required')}
    <div class="blk" style="margin-top:0"><h2>Location</h2><div class="form">
      ${f("e_address","Street address",v.address,'autocomplete="off"')}
      <div class="grid2">${f("e_city","City",v.city)}${f("e_zip","ZIP",v.zip,'inputmode="numeric"')}</div>
      <button type="button" class="btn" data-act="geocode">${lat!=null?"Re-locate on map":"Find on map"}</button>
      <div class="locline">${lat!=null?`<span class="dot" style="--c:var(--g)"></span>On the map · ${esc(zoneLabel(zoneOf(lat,lon)))}`:`<span class="dot" style="--c:var(--n)"></span>Not on the map yet. Enter the address and tap Find on map.`}</div>
    </div></div>
    <div class="blk" style="margin-top:0"><h2>Shop</h2><div class="form">
      <div class="grid2">${f("e_shopPhone","Front desk phone",v.shopPhone,tel)}${f("e_shopEmail","Shop email",v.shopEmail,mail)}</div>
      <div class="grid2">${f("e_website","Website",v.website,'inputmode="url" autocapitalize="off"')}${f("e_hours","Hours",v.hours,'placeholder="9am–9pm daily"')}</div>
      ${f("e_license","License #",v.license,'autocapitalize="characters"')}
    </div></div>
    <div class="blk" style="margin-top:0"><h2>Owner</h2><div class="form">
      ${f("e_ownerName","Owner name",v.ownerName)}
      <div class="grid2">${f("e_ownerPhone","Owner phone",v.ownerPhone,tel)}${f("e_ownerEmail","Owner email",v.ownerEmail,mail)}</div>
    </div></div>
    ${ct.map((x,i)=>`<div class="blk" style="margin-top:0"><h2>Contact ${i+1}</h2><div class="form"><div class="grid2">${f("e_cn"+i,"Name",x.name)}<label class="field"><span>Role</span><select id="e_cr${i}">${["Buyer","Manager","Purchasing","Front desk","Budtender lead","Other"].map(r=>`<option ${((draft["e_cr"+i]??x.role)||(i===0?"Buyer":"Manager"))===r?"selected":""}>${r}</option>`).join("")}</select></label></div><div class="grid2">${f("e_cp"+i,"Phone",x.phone,tel)}${f("e_ce"+i,"Email",x.email,mail)}</div></div></div>`).join("")}
    <div class="blk" style="margin-top:0"><h2>Account</h2><div class="form">
      <div class="grid2"><label class="field"><span>Tier (S best → D)</span><select id="e_tier"><option value="">Not set</option>${TIERS.map(t=>`<option ${(draft.e_tier??v.tier)===t?"selected":""}>${t}</option>`).join("")}</select></label>
      <label class="field"><span>House (orders most)</span><select id="e_house"><option value="">Not set</option>${HOUSES.map(t=>`<option ${(draft.e_house??v.house)===t?"selected":""}>${t}</option>`).join("")}</select></label></div>
      <div class="grid2">${f("e_staff","Staff size",v.staff,'inputmode="numeric"')}${f("e_delivery","Delivery days",v.deliveryDays,'placeholder="Tue / Thu"')}</div>
      ${f("e_samples","Sample policy",v.samplePolicy)}
      <label class="field"><span>Notes</span><textarea id="e_notes">${esc(draft.e_notes??v.notes??"")}</textarea></label>
    </div></div>
    <button class="btn primary wide" type="submit">${c?"Save changes":"Add store"}</button>
    ${c?`<button type="button" class="btn ghost wide" data-act="back">Cancel</button>`:""}
  </form>`;
}

/* ---------- store info rundown ---------- */
const INFO_KEYS=["address","city","zip","shopPhone","shopEmail","website","hours","license","ownerName","ownerPhone","ownerEmail","staff","deliveryDays","samplePolicy"];
function infoOf(c){ const L=c.linked||{}; const o={}; INFO_KEYS.forEach(k=>o[k]=c[k]||L[k]||""); o.contacts=[...(c.contacts||[]),...(L.contacts||[])].filter(x=>x&&(x.name||x.phone||x.email)); return o; }
const digits=p=>String(p||"").replace(/[^0-9+]/g,"");
const telHref=p=>"tel:"+digits(p), smsHref=p=>"sms:"+digits(p);
function bestPhone(c){ const i=infoOf(c); const b=i.contacts.find(x=>x.phone); if(b) return {num:b.phone, who:(b.name||b.role||"buyer").split(" ")[0]}; if(i.ownerPhone) return {num:i.ownerPhone,who:"owner"}; if(i.shopPhone) return {num:i.shopPhone,who:"store"}; return null; }
function glance(c){
  const i=infoOf(c), rows=[];
  const row=(l,v,a="")=>rows.push(`<div class="gl-row"><div class="gl-l">${l}</div><div class="gl-v">${v}</div><div class="gl-a">${a}</div></div>`);
  const ph=n=>`<a class="chipbtn" href="${telHref(n)}">Call</a><a class="chipbtn" href="${smsHref(n)}">Text</a>`;
  const em=e=>`<a class="chipbtn" href="mailto:${esc(e)}">Email</a><button class="chipbtn" data-copy="${esc(e)}">Copy</button>`;
  const addr=[i.address,[i.city,i.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  if(addr) row("Address",esc(addr), c.lat!=null?`<a class="chipbtn" href="https://maps.apple.com/?daddr=${c.lat},${c.lon}&q=${encodeURIComponent(c.name)}" target="_blank" rel="noopener">Go</a><button class="chipbtn" data-copy="${esc(addr)}">Copy</button>`:`<button class="chipbtn" data-copy="${esc(addr)}">Copy</button>`);
  if(i.shopPhone) row("Front desk",`<span class="num">${esc(i.shopPhone)}</span>`,ph(i.shopPhone));
  if(i.shopEmail) row("Shop email",esc(i.shopEmail),em(i.shopEmail));
  if(i.ownerName||i.ownerPhone||i.ownerEmail){
    row("Owner",`<b>${esc(i.ownerName||"Owner")}</b>`);
    if(i.ownerPhone) row("",`<span class="num">${esc(i.ownerPhone)}</span>`,ph(i.ownerPhone));
    if(i.ownerEmail) row("",esc(i.ownerEmail),em(i.ownerEmail));
  }
  i.contacts.forEach(x=>{ row(esc(x.role||"Contact"),`<b>${esc(x.name||"—")}</b>`); if(x.phone) row("",`<span class="num">${esc(x.phone)}</span>`,ph(x.phone)); if(x.email) row("",esc(x.email),em(x.email)); });
  if(i.website){ const u=/^https?:/.test(i.website)?i.website:"https://"+i.website; row("Website",esc(i.website.replace(/^https?:\/\/(www\.)?/,"").replace(/\/$/,"")),`<a class="chipbtn" href="${esc(u)}" target="_blank" rel="noopener">Open</a>`); }
  if(c.weedmaps) row("Menu","Weedmaps listing",`<a class="chipbtn" href="${esc(c.weedmaps)}" target="_blank" rel="noopener">Open</a>`);
  if(i.hours) row("Hours",esc(i.hours));
  if(i.license) row("License",`<span class="num">${esc(i.license)}</span>`);
  if(i.deliveryDays) row("Delivery",esc(i.deliveryDays));
  if(i.staff) row("Staff",esc(i.staff));
  if(i.samplePolicy) row("Samples",esc(i.samplePolicy));
  if(c.notes||c.linked?.notes) row("Notes",esc(c.notes||c.linked.notes));
  const linked = c.linked ? `<div class="sub" style="font-size:13px;margin-top:10px">Some details come from your linked client list.</div>` : "";
  const sparse = rows.length<3 ? `<button class="btn sm" style="margin-top:10px" data-act="edit">Add phone, email, owner…</button>` : "";
  return `<div class="blk glance"><h2>Store info</h2>${rows.join("")||`<p class="sub" style="margin:0">No contact info yet.</p>`}${sparse}${linked}</div>`;
}

/* ---------- linked client list (stays on this device) ---------- */
const LINK_KEY="henrys.link";
const LINK_FIELDS=[["name","Store name",/^(store|shop|dispensary|account|business|client|company|retailer|location)?\s*(name)?$|dba|doing business/],["address","Street address",/address|street|addr/],["city","City",/city|town/],["zip","ZIP",/zip|postal/],
 ["shopPhone","Front desk phone",/^(store|shop|main|front|business|office)?\s*(desk)?\s*(phone|tel|number)/],["shopEmail","Shop email",/^(store|shop|main|business|general|info)?\s*e-?mail/],["ownerName","Owner name",/owner(?!.*(phone|mail|cell|tel))/],["ownerPhone","Owner phone",/owner.*(phone|cell|tel|mobile)/],["ownerEmail","Owner email",/owner.*mail/],
 ["buyerName","Buyer name",/(buyer|purchas|contact)(?!.*(phone|mail|cell|tel))/],["buyerPhone","Buyer phone",/(buyer|purchas|contact).*(phone|cell|tel|mobile)/],["buyerEmail","Buyer email",/(buyer|purchas|contact).*mail/],["website","Website",/web|url|site/],["license","License #",/licen/],["hours","Hours",/hour/],["tier","Tier",/tier|rank|grade/],["notes","Notes",/note|comment/]];
const normName=s=>String(s||"").toLowerCase().replace(/&/g,"and").replace(/[^a-z0-9]/g,"");
function loadXLSX(){ if(window.XLSX) return Promise.resolve(); return new Promise((ok,bad)=>{ const sc=document.createElement("script"); sc.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; sc.onload=ok; sc.onerror=()=>bad(new Error("xlsx")); document.head.appendChild(sc); }); }
async function readListFile(f){
  await loadXLSX(); const wb=XLSX.read(await f.arrayBuffer(),{type:"array"}); const ws=wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:""}).map(r=>r.map(x=>String(x??"").trim()));
  const hi=rows.findIndex(r=>r.filter(Boolean).length>=2); if(hi<0) throw new Error("empty");
  const headers=rows[hi].map((h,i)=>h||`Column ${i+1}`); const data=rows.slice(hi+1).filter(r=>r.some(Boolean));
  const map={}; const used=new Set();
  LINK_FIELDS.forEach(([k,,re])=>{ const idx=headers.findIndex((h,i)=>!used.has(i) && re.test(h.toLowerCase().replace(/[_#.]/g," ").replace(/\s+/g," ").trim())); if(idx>=0){ map[k]=idx; used.add(idx); } });
  if(map.name==null){ const idx=headers.findIndex((h,i)=>!used.has(i)&&/name/i.test(h)); if(idx>=0) map.name=idx; }
  return {file:f.name, headers, data, map};
}
function linkSheet(L){
  const sample=k=>{ const i=L.map[k]; if(i==null||i==="") return ""; const v=L.data.find(r=>r[i])?.[i]; return v?esc(v).slice(0,40):""; };
  return `<div class="sheet-head"><div><div class="eyebrow">Link client list</div><h1>${esc(L.file)}</h1><div class="sub">${L.data.length} rows found. Check which column is which.</div></div>${xBtn}</div>
  <div class="sheet-body"><div class="blk" style="margin-top:0">
    ${LINK_FIELDS.map(([k,l])=>`<div class="mapfield"><label for="lm_${k}">${l}${k==="name"?" *":""}</label><select id="lm_${k}" class="input"><option value="">Not in list</option>${L.headers.map((h,i)=>`<option value="${i}" ${L.map[k]===i?"selected":""}>${esc(h)}</option>`).join("")}</select>${sample(k)?`<small>e.g. ${sample(k)}</small>`:""}</div>`).join("")}
  </div>
  <p class="sub" style="font-size:14px">The list stays on this device and is never uploaded. Only street addresses are sent to the map service to place pins. Stores already on your list are matched by name and keep your notes and history.</p>
  <button class="btn primary wide" data-act="link-go" ${L.map.name==null?"disabled":""}>Link ${L.data.length} stores</button></div>`;
}
async function applyLink(L){
  const g=(r,k)=>{ const i=L.map[k]; return i==null||i===""?"":(r[+i]||"").trim(); };
  const all=Store.all(); const byName=new Map(all.map(c=>[normName(c.name),c]));
  let added=0, matched=0;
  L.data.forEach(r=>{
    const name=g(r,"name"); if(!name) return;
    const linked={address:g(r,"address"),city:g(r,"city"),zip:g(r,"zip"),shopPhone:g(r,"shopPhone"),shopEmail:g(r,"shopEmail"),ownerName:g(r,"ownerName"),ownerPhone:g(r,"ownerPhone"),ownerEmail:g(r,"ownerEmail"),website:g(r,"website"),license:g(r,"license"),hours:g(r,"hours"),notes:g(r,"notes"),
      contacts:(g(r,"buyerName")||g(r,"buyerPhone")||g(r,"buyerEmail"))?[{name:g(r,"buyerName"),role:"Buyer",phone:g(r,"buyerPhone"),email:g(r,"buyerEmail")}]:[]};
    Object.keys(linked).forEach(k=>{ if(linked[k]===""||(Array.isArray(linked[k])&&!linked[k].length)) delete linked[k]; });
    const ex=byName.get(normName(name));
    if(ex){ ex.linked=linked; matched++; }
    else { const tier=g(r,"tier").toUpperCase(); const c={id:uid(),name,fromList:true,stage:"new",stageAt:new Date().toISOString(),lastContact:null,touches:[],deal:{items:[]},stock:{preroll:"none",infused:"none",flower:"none"},lat:null,lon:null,tier:TIERS.includes(tier)?tier:"B",house:"Rolls",linked};
      all.push(c); byName.set(normName(name),c); added++; }
  });
  Store.write(all); lsSet(LINK_KEY,{file:L.file,linkedAt:new Date().toISOString(),rows:L.data.length}); refresh();
  toast(`Linked: ${added} new stores, ${matched} matched`);
  locateLinked();
}
let locating=false;
async function locateLinked(){
  if(locating) return; locating=true;
  const todo=Store.all().filter(c=>c.lat==null && (c.linked?.address||c.address));
  let n=0, found=0;
  for(const c0 of todo){
    if(!lsGet(LINK_KEY) && c0.fromList) break; n++;
    const c=Store.all().find(x=>x.id===c0.id); if(!c) continue; const i=infoOf(c);
    try{ const p=await geocode([i.address,i.city||"",i.zip||"","CA"].filter(Boolean).join(", ")); if(p){ c.lat=p.lat; c.lon=p.lon; if(!c.city&&!i.city&&p.city) c.city=p.city; c.zone=zoneOf(p.lat,p.lon); Store.save(c); found++; } }catch{}
    if(n%5===0||n===todo.length){ refresh(); toast(`Placing stores on the map: ${n} of ${todo.length}`); }
    await new Promise(r=>setTimeout(r,700));
  }
  locating=false; if(todo.length){ refresh(); toast(`${found} of ${todo.length} stores placed on the map`); }
}
function unlinkList(){
  let removed=0, kept=0;
  const next=[]; Store.all().forEach(c=>{
    if(c.fromList && !(c.touches||[]).length && (c.stage||"new")==="new" && !(c.deal?.items||[]).length){ removed++; return; }
    if(c.linked||c.fromList){ delete c.linked; delete c.fromList; kept++; }
    next.push(c);
  });
  Store.write(next); localStorage.removeItem(LINK_KEY); refresh();
  toast(`Unlinked. Removed ${removed} untouched stores; ${kept} you've worked stay with your own notes.`);
}

/* ---------- actions ---------- */
const cur=()=>shops.find(x=>x.id===sheet?.id);
function logTouch(type,note="",amount,id){
  const base=id?shops.find(x=>x.id===id):cur(); if(!base) return; const c=clone(base); const t=new Date().toISOString();
  const tch={at:t,type,note}; if(amount!=null) tch.amount=amount; c.touches=[tch,...(c.touches||[])].slice(0,60); c.lastContact=t;
  const setStage=s=>{ if(c.stage!==s){ c.stage=s; c.stageAt=t; } }; const st=SORDER[c.stage||"new"]; const reopen=c.stage==="lost"||c.stage==="ordered";
  const CAD={visit:2,sample:3,call:3,text:3,negotiating:2,lost:21}; if(CAD[type]!=null) c.nextFollowUp=isoInDays(CAD[type]);
  if(type==="visit"&&(st<1||reopen)) setStage("visited");
  if(type==="sample"&&(st<2||reopen)) setStage("sampled");
  if(type==="negotiating") setStage("negotiating");
  if(type==="verbal"){ setStage("verbal"); c.nextFollowUp=isoInDays(1); }
  if(type==="email"){ setStage("confirmed"); c.nextFollowUp=isoInDays(2); }
  if(type==="order"){ setStage("ordered"); c.lastOrderAt=t; if(c.deal?.items?.length){ c.priceLog=[...c.deal.items.map(i=>({line:i.line,strain:i.strain,price:i.price,at:t})),...(c.priceLog||[])].slice(0,30); c.lastOrder=c.deal.items; c.stock=c.stock||{}; c.deal.items.forEach(i=>{const k=LINE[i.line]?.cat; if(k) c.stock[k]="ok";}); c.deal={items:[]}; } }
  if(type==="lost") setStage("lost");
  draft.note=""; draft.lostOpen=false; saveShop(c);
  if(type==="order"){ const ri=orderInterval(c); c.nextFollowUp=isoInDays(Math.max(3,ri-3)); saveShop(c); }
  if(ACTIVE.includes(type) && type!=="order"){ const n=touchesOnDay(0), t=dailyTarget(); toast(n===t?`Logged · that's ${t} today. Target hit.`:`Logged: ${TOUCH[type]||type} · ${n} of ${t} today`); }
  else if(type!=="order") toast("Logged: "+(TOUCH[type]||type));
}
function readForm(){ const g=id=>($("#"+id)?.value||"").trim();
  const o={name:g("e_name"),address:g("e_address"),city:g("e_city"),zip:g("e_zip"),shopPhone:g("e_shopPhone"),shopEmail:g("e_shopEmail"),website:g("e_website"),hours:g("e_hours"),license:g("e_license"),ownerName:g("e_ownerName"),ownerPhone:g("e_ownerPhone"),ownerEmail:g("e_ownerEmail"),
  tier:g("e_tier"),house:g("e_house"),staff:g("e_staff"),deliveryDays:g("e_delivery"),samplePolicy:g("e_samples"),notes:g("e_notes"),
  contacts:[0,1].map(i=>({name:g("e_cn"+i),role:g("e_cr"+i),phone:g("e_cp"+i),email:g("e_ce"+i)})).filter(x=>x.name||x.phone||x.email)};
  return o; }
function snapshotForm(){ document.querySelectorAll("#editForm input,#editForm select,#editForm textarea").forEach(el=>{ if(el.id) draft[el.id]=el.value; }); }
function addFromGhost(osm){ const g=ghosts.find(x=>x.osm===osm); if(!g) return; sheet={type:"add",data:{name:g.name,address:g.address,city:g.city,lat:g.lat,lon:g.lon,osm:g.osm,contacts:g.phone?[{name:"",role:"Store",phone:g.phone,email:""}]:[]}}; draft={}; render(); }

document.addEventListener("click", async ev=>{
  const t=ev.target.closest("button,a,[data-close],label,[data-open],[data-report]"); if(!t) return;
  const d=t.dataset;
  if(d.report){ rpBack = view==="report" ? rpBack : view; view="report"; $("#results").hidden=true; sheet=null; render(); $("#page").scrollTop=0; return; }
  if(d.rp){ rpPeriod=d.rp; render(); return; }
  if(d.view){ const same=view===d.view; view=d.view; remember(); $("#results").hidden=true; document.activeElement?.blur?.(); if(sheet){ sheet=null; draft={}; } if(!same){ selectMode=false; selected.clear(); } render(); updateMapData(); if(same) $("#page").scrollTo({top:0,behavior:"smooth"}); if(view==="map") setTimeout(()=>map?.resize(),0); return; }
  if(d.cat){ cat=d.cat; remember(); render(); updateMapData(); return; }
  if(d.qlog){ const id=sheet?.id; if(id) logTouch(d.qlog,"",undefined,id); return; }
  if(d.wcal!=null){ weekToCalendar(+d.wcal); return; }
  if(d.wroute!=null){ const w=weekPlan(), dd=w?.days[+d.wroute]; if(dd){ lsSet(ROUTE_KEY,{date:dd.date, ids:dd.ids, from:"first"}); sheet={type:"route"}; draft={routeSel:new Set(dd.ids)}; render(); updateMapData(); if(view==="map") fitRoute(); toast("Today’s route is set"); } return; }
  if(d.rpick){ draft.routeSel.has(d.rpick)?draft.routeSel.delete(d.rpick):draft.routeSel.add(d.rpick); renderSheet(); return; }
  if(d.mline){ draft.menuOpen = draft.menuOpen===d.mline ? null : d.mline; render(); return; }
  if(d.mdel!=null){ const L=LINE[draft.menuOpen]; const st=L.strains[+d.mdel]; L.strains.splice(+d.mdel,1); delete L.sale[st]; saveMenu(); render(); return; }
  if(d.delsp!=null){ const c=clone(cur()); c.specials.splice(+d.delsp,1); saveShop(c); toast("Deal removed"); return; }
  if(d.kind){ draft.kind=d.kind; render(); return; }
  if(d.addsug){ const [line,strain,price]=d.addsug.split("|"); const c=clone(cur()); c.deal=c.deal||{items:[]}; c.deal.items.push({line,strain,cases:1,price:+price}); if(["new","visited","sampled"].includes(c.stage||"new")){ c.stage="negotiating"; c.stageAt=new Date().toISOString(); } saveShop(c); toast(`Added 1 case · deal now ${money(dealTotal(c.deal.items))}`); return; }
  if(d.emailFor){ openSheet({type:"shop",id:d.emailFor}); sheet.mode="email"; render(); return; }
  if(t.dataset.logtext){ const id=t.dataset.logtext, how=t.textContent.trim()==="Email"?"email":"text"; setTimeout(()=>logTouch("text","Sent a follow-up "+how,undefined,id),400); return; }
  if(d.pipe){ pipeOpen.has(d.pipe)?pipeOpen.delete(d.pipe):pipeOpen.add(d.pipe); render(); return; }
  if(d.open){ openSheet({type:"shop",id:d.open}); return; }
  if(d.mine){ $("#search").blur(); openSheet({type:"shop",id:d.mine}); return; }
  if(d.place!=null){ const p=window._places[+d.place]; $("#search").value=""; $("#searchClear").hidden=true; $("#search").blur(); $("#results").hidden=true; sheet={type:"add",data:p}; draft={}; flyTo(p.lon,p.lat,15); render(); return; }
  if(d.manual){ const q=$("#search").value.trim(); $("#results").hidden=true; $("#search").blur(); sheet={type:"add",data:{name:q}}; draft={}; render(); return; }
  if("close" in d){ closeSheet(); return; }
  if(d.copy){ copy(d.copy); return; }
  if(d.addghost){ addFromGhost(d.addghost); return; }
  if(d.touch){ logTouch(d.touch, draft.note||""); return; }
  if(d.lost){ logTouch("lost","Fell through: "+d.lost+(draft.note?` · ${draft.note}`:"")); return; }
  if(d.stock){ const [k,v]=d.stock.split(":"); const c=clone(cur()); c.stock={...(c.stock||{}),[k]:v}; saveShop(c); return; }
  if(d.pick){ selected.has(d.pick)?selected.delete(d.pick):selected.add(d.pick); draft.confirmBulk=false; render(); return; }
  if(d.delitem!=null){ const c=clone(cur()); c.deal.items.splice(+d.delitem,1); saveShop(c); return; }
  const a=d.act; if(!a) return;
  if(a==="focus-search"){ $("#search").focus(); }
  if(a==="add-retailers"){ const n=addRetailers(); refresh(); toast(n?`Added ${n} Henry’s store${n===1?"":"s"}`:"All Henry’s stores are already on your list"); }
  if(a==="undo") undo();
  if(a==="clear-ask"){ draft.confirmClear=true; render(); }
  if(a==="clear-no"){ draft.confirmClear=false; render(); }
  if(a==="clear-yes"){ const n=Store.all().length; snapshot("clear"); Store.write([]); draft={}; selectMode=false; selected.clear(); refresh(); toast(`Cleared ${n} stores`,{label:"Undo",fn:undo}); }
  if(a==="add-blank"){ sheet={type:"add",data:{}}; draft={}; render(); }
  if(a==="back"){ if(sheet.type==="shop"){ sheet.mode=null; draft={}; sheet._reset=true; render(); } }
  if(a==="edit"){ sheet.mode="edit"; draft={}; sheet._reset=true; render(); }
  if(a==="email"){ sheet.mode="email"; draft={}; sheet._reset=true; render(); }
  if(a==="showmap"){ const c=cur(); view="map"; render(); setTimeout(()=>{ map.resize(); flyTo(c.lon,c.lat,15); updateMapData(); },0); }
  if(a==="rp-copy"){ copy(reportText(reportData())); }
  if(a==="rp-email"){ const D=reportData(); location.href=`mailto:?subject=${encodeURIComponent(`Henry's sales report · ${D.R.label}`)}&body=${encodeURIComponent(reportText(D))}`; }
  if(a==="rp-csv"){ const D=reportData(), tag=D.R.label.replace(/[^A-Za-z0-9]+/g,"-").toLowerCase();
    const f1=new File([storesCSV(D)],`henrys-stores-${tag}.csv`,{type:"text/csv"}), f2=new File([activityCSV(D)],`henrys-activity-${tag}.csv`,{type:"text/csv"});
    try{ if(navigator.canShare?.({files:[f1,f2]})){ await navigator.share({files:[f1,f2],title:"Henry's report"}); return; } }catch(e){ if(e.name==="AbortError") return; }
    [f1,f2].forEach((f,i)=>setTimeout(()=>{ const a=document.createElement("a"); a.href=URL.createObjectURL(f); a.download=f.name; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000); },i*400)); toast("Saved 2 spreadsheets"); }
  if(a==="fu-cal"){ const c=cur(); if(c) addFollowUpToCalendar(c); return; }
  if(a==="route-open"){ openRoute(); if(view==="map") fitRoute(); return; }
  if(a==="route-cal"){ routeToCalendar(); return; }
  if(a==="week-open"){ sheet={type:"week"}; draft={}; render(); return; }
  if(a==="week-replan"){ localStorage.removeItem(WEEK_KEY); planWeek(); renderSheet(); toast("Week re-planned"); return; }
  if(a==="week-cal"){ weekToCalendar(); return; }
  if(a==="route-build"){ buildRoute(); return; }
  if(a==="route-edit"){ const r=routeToday(); draft.routeSel=new Set(r?r.ids:[]); draft.routeEdit=true; renderSheet(); return; }
  if(a==="route-clear"){ localStorage.removeItem(ROUTE_KEY); closeSheet(); toast("Route cleared"); return; }
  if(a==="route-me"){ locate(false); return; }
  if(a==="route-all"){ draft.routeAll=true; renderSheet(); return; }
  if(a==="menu-open"){ sheet={type:"menu"}; draft={}; render(); }
  if(a==="sp-open"){ draft.spOpen=true; draft.spLine=draft.spLine||CATALOG[0].id; render(); }
  if(a==="sp-cancel"){ draft.spOpen=false; render(); }
  if(a==="sp-save"){ const line=$("#spLine").value, strain=$("#spStrain").value, price=parseFloat($("#spPrice").value), until=$("#spUntil").value, note=$("#spNote").value.trim();
    if(!(price>0)){ toast("Enter their price per case."); return; }
    const c=clone(cur()); c.specials=[...(c.specials||[]),{line,strain,price,until,note,from:todayISO()}];
    draft={}; document.activeElement?.blur(); pendingSheet=false; saveShop(c); toast("Deal saved for "+c.name); }
  if(a==="m-save"||a==="m-addstrain"||a==="m-toggle"){ const L=LINE[draft.menuOpen]; if(!L) return;
    const pr=parseFloat($("#m_price")?.value); if(pr>0) L.price=pr; const pk=$("#m_pack")?.value.trim(); if(pk!=null) L.pack=pk;
    document.querySelectorAll("[data-msale]").forEach(el=>{ const st=L.strains[+el.dataset.msale], v=parseFloat(el.value); if(v>0) L.sale[st]=v; else delete L.sale[st]; });
    if(a==="m-addstrain"){ const n=($("#m_newstrain")?.value||"").trim(); if(n && !L.strains.includes(n)) L.strains.push(n); }
    if(a==="m-toggle") L.off=!L.off;
    document.activeElement?.blur(); pendingSheet=false; saveMenu(); if(a==="m-save") draft.menuOpen=null; render();
    toast(a==="m-addstrain"?"Strain added":a==="m-toggle"?(L.off?"Taken off the menu":"Back on the menu"):"Menu updated"); }
  if(a==="m-newline"){ const n=($("#m_newname").value||"").trim(), p=parseFloat($("#m_newprice").value); if(!n||!(p>0)){ toast("Add a name and a price per case."); return; }
    MENU.lines.push({id:"m"+Date.now().toString(36),cat:$("#m_newcat").value,name:n,pack:"",price:p,strains:[],sale:{}}); saveMenu(); draft.menuOpen=MENU.lines[MENU.lines.length-1].id;
    document.activeElement?.blur(); pendingSheet=false; render(); toast("Product added. Now add its strains."); }
  if(a==="m-reset"){ if(draft.confirmReset){ localStorage.removeItem(MENU_KEY); loadMenu(); draft={}; render(); toast("Menu reset to Sept 30"); } else { draft.confirmReset=true; t.textContent="Tap again to reset the menu"; } }
  if(a==="order-ask"){ draft.orderOpen=true; draft.lostOpen=false; render(); setTimeout(()=>$("#orderAmt")?.focus(),50); }
  if(a==="order-cancel"){ draft.orderOpen=false; draft.orderAmt=undefined; render(); }
  if(a==="order-save"){ const v=parseFloat(($("#orderAmt")?.value||"").replace(/[^0-9.]/g,"")); if(!(v>0)){ toast("Enter the order total first."); return; }
    const before=monthSales(); draft.orderOpen=false; draft.orderAmt=undefined; document.activeElement?.blur(); pendingSheet=false;
    snapshot("order"); logTouch("order", draft.note||"", Math.round(v*100)/100);
    const g=goals(), after=monthSales();
    if(before<g.mine && after>=g.mine) celebrate(`Goal hit! ${money(after)} this month`); else toast(`Order saved · ${money(after)} of ${money(g.mine)} this month`,{label:"Undo",fn:undo}); }
  if(a==="goals-save"){ const m=parseFloat($("#goalMine").value), co=parseFloat($("#goalCo").value), ol=($("#orderLink")?.value||"").trim(); if(m>0&&co>0){ lsSet("henrys.goals",{mine:m,company:co}); lsSet("henrys.settings",{...settings(),orderLink:ol||ORDER_LINK_DEFAULT}); toast("Saved"); render(); } else toast("Enter both goals as numbers."); }
  if(a==="edit-from"){ openSheet({type:"shop",id:t.dataset.id}); sheet.mode="edit"; render(); }
  if(a==="lost"){ draft.lostOpen=!draft.lostOpen; render(); }
  if(a==="nearby-zone"){ const z=ZMAP[sheet.id]; closeSheet(); if(z){ map.fitBounds(z.bbox,{padding:20,duration:0}); if(map.getZoom()<10) map.setZoom(10); setTimeout(findNearby,50); } }
  if(a==="additem"){ const line=$("#addLine").value,strain=$("#addStrain").value,cases=Math.max(1,parseInt($("#addCases").value)||1),price=parseFloat($("#addPrice").value);
    const c=clone(cur()); c.deal=c.deal||{items:[]}; c.deal.items.push({line,strain,cases,price:isNaN(price)?priceFor(c,line,strain).price:price});
    if(["new","visited","sampled"].includes(c.stage||"new")){ c.stage="negotiating"; c.stageAt=new Date().toISOString(); }
    draft.cases=1; draft.price=undefined; document.activeElement?.blur(); pendingSheet=false; saveShop(c); toast("Added to deal"); }
  if(a==="copybody") copy($("#emailBody").value);
  if(a==="emailsent"){ sheet.mode=null; draft={}; logTouch("email","Confirmation email sent"); }
  if(a==="geocode"){ snapshotForm(); const addr=[draft.e_address,draft.e_city].filter(Boolean).join(", ") || draft.e_name; if(!addr){ toast("Type the address first."); return; }
    t.disabled=true; t.textContent="Finding…";
    try{ const p=await geocode(addr); if(p){ draft.lat=p.lat; draft.lon=p.lon; if(!draft.e_city&&p.city) draft.e_city=p.city; if(view==="map") flyTo(p.lon,p.lat,15); toast("Found it · "+zoneLabel(zoneOf(p.lat,p.lon))); } else toast("Couldn't find that address. Check the street and city."); }
    catch{ toast("Map search is offline right now. Try again shortly."); }
    pendingSheet=false; document.activeElement?.blur(); render(); }
  if(a==="remove-ask"){ draft.confirmRemove=true; render(); }
  if(a==="remove-no"){ draft.confirmRemove=false; render(); }
  if(a==="remove-yes"){ const id=sheet.id, n=cur()?.name; sheet=null; draft={}; snapshot("remove"); removeShop(id); toast(`Removed ${n}`,{label:"Undo",fn:undo}); }
  if(a==="sel-start"){ selectMode=true; selected.clear(); draft={}; render(); }
  if(a==="sel-done"){ selectMode=false; selected.clear(); draft={}; render(); }
  if(a==="sel-all"){ const vis=[...document.querySelectorAll("[data-pick]")].map(e=>e.dataset.pick); if(selected.size===vis.length) selected.clear(); else vis.forEach(id=>selected.add(id)); draft.confirmBulk=false; render(); }
  if(a==="bulk-ask"){ draft.confirmBulk=true; render(); }
  if(a==="bulk-no"){ draft.confirmBulk=false; render(); }
  if(a==="bulk-yes"){ const n=selected.size; snapshot("remove"); Store.write(Store.all().filter(c=>!selected.has(c.id))); selected.clear(); selectMode=false; draft={}; refresh(); toast(`Removed ${n} store${n===1?"":"s"}`,{label:"Undo",fn:undo}); }
  if(a==="unlink-ask"){ draft.confirmUnlink=true; render(); }
  if(a==="unlink-no"){ draft.confirmUnlink=false; render(); }
  if(a==="unlink-yes"){ draft={}; snapshot("unlink"); unlinkList(); }
  if(a==="link-go"){ const L=sheet.data; LINK_FIELDS.forEach(([k])=>{ const v=$("#lm_"+k)?.value; L.map[k]= v===""||v==null ? null : +v; }); if(L.map.name==null){ toast("Pick the column with store names."); return; } sheet=null; draft={}; render(); await applyLink(L); }
  if(a==="export") exportBackup();
  });
document.addEventListener("submit", ev=>{
  if(ev.target.id!=="editForm") return; ev.preventDefault();
  const vals=readForm(); if(!vals.name){ toast("Add the dispensary name first."); $("#e_name").focus(); return; }
  const isNew=sheet.type==="add";
  const base=isNew ? {id:uid(),stage:"new",stageAt:new Date().toISOString(),lastContact:null,touches:[],deal:{items:[]},stock:{preroll:"none",infused:"none",flower:"none"},lat:sheet.data?.lat??null,lon:sheet.data?.lon??null,osm:sheet.data?.osm||null} : clone(cur());
  Object.assign(base,vals); if(draft.lat!==undefined){ base.lat=draft.lat; base.lon=draft.lon; }
  document.activeElement?.blur(); pendingSheet=false; draft={};
  saveShop(base); sheet={type:"shop",id:base.id}; render(); updateMapData();
  if(base.lat!=null && view==="map") flyTo(base.lon,base.lat,14);
  toast(isNew?`Added ${base.name}`:"Saved");
});
document.addEventListener("input", ev=>{
  const id=ev.target.id;
  if(id==="orderAmt") draft.orderAmt=ev.target.value;
  if(["spPrice","spUntil","spNote"].includes(id)) draft[id]=ev.target.value;
  if(id==="search"){ $("#searchClear").hidden=!ev.target.value; clearTimeout(searchTimer); searchTimer=setTimeout(()=>runSearch(ev.target.value),280); }
  if(id==="pageSearch"){ pageQuery=ev.target.value; const pos=ev.target.selectionStart; render(); const s=$("#pageSearch"); s.focus(); s.setSelectionRange(pos,pos); }
  if(id==="touchNote") draft.note=ev.target.value;
  if(id==="addCases") draft.cases=ev.target.value;
  if(id==="addPrice") draft.price=ev.target.value;
  if(id==="emailBody"&&draft.email){ draft.email.body=ev.target.value; const m=$("#mailLink"); if(m) m.href=`mailto:${encodeURIComponent(draft.email.to)}?subject=${encodeURIComponent(draft.email.subject)}&body=${encodeURIComponent(draft.email.body)}`; }
  if(id==="repName"||id==="repPhone") lsSet("henrys.rep",{name:$("#repName").value.trim(),phone:$("#repPhone").value.trim()});
  if(id==="guideName"){ lsSet("henrys.rep",{...repInfo(),name:ev.target.value.trim()}); const h=$("#guideBody h1"); if(h) h.textContent=repFirst()?`Hey ${repFirst()}`:"Hey there"; }
  if(id==="meName"||id==="mePhone") lsSet("henrys.rep",{name:$("#meName").value.trim(),phone:$("#mePhone").value.trim()});
  if(ev.target.closest("#editForm")) draft[id]=ev.target.value;
});
document.addEventListener("change", async ev=>{
  const id=ev.target.id;
  if(id==="dayStart"){ const s=settings(); s.dayStart=ev.target.value||"10:00"; lsSet("henrys.settings",s); const w=lsGet(WEEK_KEY); if(w){ w.start=s.dayStart; lsSet(WEEK_KEY,w); } ev.target.blur(); pendingSheet=false; renderSheet(); }
  if(id==="spLine"){ draft.spLine=ev.target.value; draft.spStrain=""; ev.target.blur(); pendingSheet=false; renderSheet(); }
  if(id==="spStrain") draft.spStrain=ev.target.value;
  if(id==="addLine"){ draft.line=ev.target.value; draft.strain=undefined; draft.price=undefined; ev.target.blur(); pendingSheet=false; renderSheet(); }
  if(id==="addStrain"){ draft.strain=ev.target.value; draft.price=undefined; ev.target.blur(); pendingSheet=false; renderSheet(); }
  if(id==="repName"||id==="repPhone"){ const c=cur(); if(c){ draft.email={...draft.email,body:buildEmail(c).body}; const b=$("#emailBody"); if(b) b.value=draft.email.body; } }
  if(id==="fu"){ const c=clone(cur()); c.nextFollowUp=ev.target.value?new Date(ev.target.value+"T12:00:00").toISOString():null; ev.target.blur(); pendingSheet=false; saveShop(c); toast(ev.target.value?`Follow-up set for ${fmtDate(c.nextFollowUp)}`:"Follow-up cleared"); }
  if(id==="listFile"){ const f=ev.target.files?.[0]; ev.target.value=""; if(f){ try{ toast("Reading list…"); const L=await readListFile(f); sheet={type:"link",data:L}; draft={}; render(); }catch(e){ toast(e.message==="xlsx"?"Couldn't load the spreadsheet reader. Check your connection.":"Couldn't read that file. Save it as .xlsx or .csv and try again."); } } }
  if(id==="lm_name" && sheet?.type==="link"){ const b=document.querySelector('[data-act="link-go"]'); if(b) b.disabled=!ev.target.value; }
  if(id==="importFile"){ const f=ev.target.files?.[0]; if(f) importBackup(f); ev.target.value=""; }
});
document.addEventListener("focusout", ()=>setTimeout(()=>{ if(pendingSheet && !document.querySelector("#sheetHost :focus")) renderSheet(); },0));
document.addEventListener("keydown", e=>{ if((e.key==="Enter"||e.key===" ") && e.target.dataset?.report){ e.preventDefault(); e.target.click(); }
  if(e.key==="Escape"){ if(!$("#results").hidden){ $("#results").hidden=true; return; } if(sheet) closeSheet(); } });
$("#search").addEventListener("focus", e=>{ if(e.target.value) runSearch(e.target.value); });
$("#search").addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); clearTimeout(searchTimer); runSearch(e.target.value); } });
$("#searchClear").addEventListener("click", ()=>{ const s=$("#search"); s.value=""; $("#searchClear").hidden=true; $("#results").hidden=true; s.focus(); });
$("#btnLocate").addEventListener("click", ()=>locate(true));
$("#btnNearby").addEventListener("click", findNearby);
$("#btnRoute").addEventListener("click", ()=>{ openRoute(); fitRoute(); });
document.addEventListener("pointerdown", e=>{ if(!e.target.closest(".topbar")) $("#results").hidden=true; });


/* ---------- startup guide ---------- */
const GUIDE=[
  // close-up of the unicorn's face
  ["Hey",`This is your sales map for Henry’s. It starts with ${(window.HENRYS_RETAILERS||[]).length} stores that carry Henry’s. Let’s start up close and zoom out.`],
  // head and body: one store
  ["One store","Tap any dot to open a store. You’ll see its phone, email, address and hours, with buttons to call, text or get directions."],
  // whole unicorn: one visit
  ["Log the visit","After a visit, tap what happened: <b>Visited</b>, <b>Samples</b>, <b>Verbal yes</b> or <b>Order placed</b>. Got a yes? Tap <b>Confirm</b> and send the email that day."],
  // a dot in Oakland: your day
  ["Your day","The <b>Today</b> tab shows who to see next and which deals need closing. Tap <b>Find nearby</b> to spot dispensaries around you."],
  // the Bay: your territory
  ["Your territory","Each area is colored by how its stores are doing: <b class='gc g'>green</b> good, <b class='gc y'>yellow</b> check in, <b class='gc r'>red</b> needs you, <b class='gc n'>grey</b> not visited. Tap an area to see its stores."],
  // Earth: grow it
  ["Grow it","Type a store’s name in the search bar to add it. Open a store and tap <b>Remove store</b> to drop it. You can always undo."],
  // galaxy: the big picture
  ["Go get ’em","Every yellow and red dot is a deal waiting to happen. Turn the map green."],
];
let guideStep=0, uni=null;
function openGuide(){
  guideStep=0; let g=$("#guide"); if(!g){ g=document.createElement("div"); g.id="guide"; document.body.appendChild(g); }
  g.innerHTML=`<div class="guide-card" role="dialog" aria-modal="true" aria-label="How it works">
    <div id="uniWrap"><canvas id="uniCanvas" aria-label="A cartoon unicorn galloping while smoking a joint, zooming out to the Bay, Earth and a galaxy"></canvas><div id="uniCap"></div></div><div class="uni-id" id="uniId"></div>
    <div id="guideBody"></div></div>`;
  uni?.stop(); if(window.startUnicorn){ uni=window.startUnicorn($("#uniCanvas")); $("#uniId").textContent=`Unicorn #${String(uni.seed%100000).padStart(5,"0")}`; }
  renderGuide();
}
function renderGuide(){
  const [t,b]=GUIDE[guideStep], last=guideStep===GUIDE.length-1;
  uni?.setStep?.(guideStep, GUIDE.length);
  const cap=["","","Along the Bay","Somewhere in San Francisco","The Bay Area","Earth","The galaxy"][guideStep]||""; const ce=$("#uniCap"); if(ce){ ce.textContent=cap; ce.classList.toggle("on",!!cap); }
  $("#guideBody").innerHTML=`<h1>${guideStep===0?(repFirst()?`Hey ${esc(repFirst())}`:"Hey there"):t}</h1><p>${b}</p>${guideStep===0?`<label class="field" style="margin:10px 0 2px"><span>Your first name</span><input id="guideName" autocomplete="given-name" value="${esc(repInfo().name||"")}" placeholder="Stays on this device"></label>`:""}
    <div class="gdots">${GUIDE.map((_,i)=>`<i class="${i===guideStep?"on":""}"></i>`).join("")}</div>
    <div class="gbtns">${guideStep?`<button class="btn" data-guide="back">Back</button>`:`<button class="btn ghost" data-guide="skip">Skip</button>`}<button class="btn primary" data-guide="${last?"done":"next"}">${last?"Let’s go":"Next"}</button></div>`;
}
function closeGuide(){ uni?.stop(); uni=null; $("#guide")?.remove(); lsSet("henrys.guided",1); backupNag(); }
document.addEventListener("click",e=>{ const b=e.target.closest("[data-guide]"); if(!b) return; const a=b.dataset.guide;
  if(a==="next"){ guideStep=Math.min(GUIDE.length-1,guideStep+1); renderGuide(); }
  if(a==="back"){ guideStep=Math.max(0,guideStep-1); renderGuide(); }
  if(a==="skip"||a==="done") closeGuide();
  if(a==="open") openGuide(); });
document.addEventListener("keydown",e=>{ if(!$("#guide")) return; if(e.key==="ArrowRight") document.querySelector('[data-guide="next"],[data-guide="done"]')?.click(); if(e.key==="ArrowLeft") document.querySelector('[data-guide="back"]')?.click(); if(e.key==="Escape") closeGuide(); });

/* ---------- backup ---------- */
async function exportBackup(){
  const extra={}; ["henrys.goals","henrys.settings","henrys.menu","henrys.rep"].forEach(k=>{ const v=lsGet(k); if(v!=null) extra[k]=v; });
  const data=JSON.stringify({app:"heat",version:2,exportedAt:new Date().toISOString(),shops:Store.all(),settings:extra},null,1);
  const name=`heat-backup-${new Date().toISOString().slice(0,10)}.json`; const file=new File([data],name,{type:"application/json"});
  try{ if(navigator.canShare?.({files:[file]})){ await navigator.share({files:[file],title:"HEAT backup"}); lsSet("henrys.backupAt",new Date().toISOString()); render(); toast("Backup saved"); return; } }catch(e){ if(e.name==="AbortError") return; }
  const a=document.createElement("a"); a.href=URL.createObjectURL(file); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000); lsSet("henrys.backupAt",new Date().toISOString()); render(); toast("Backup saved to Downloads");
}
async function importBackup(f){
  try{ const j=JSON.parse(await f.text()); const inc=Array.isArray(j)?j:j.shops; if(!Array.isArray(inc)) throw 0;
    const byId=new Map(Store.all().map(c=>[c.id,c])); let added=0,updated=0;
    inc.forEach(c=>{ if(!c?.id||!c.name) return; const ex=byId.get(c.id); if(!ex){ byId.set(c.id,c); added++; } else if(Date.parse(c.updatedAt||0)>Date.parse(ex.updatedAt||0)){ byId.set(c.id,c); updated++; } });
    if(j.settings&&typeof j.settings==="object") Object.entries(j.settings).forEach(([k,v])=>{ if(/^henrys\.(goals|settings|menu|rep)$/.test(k)) lsSet(k,v); });
    Store.write([...byId.values()]); if(j.settings?.["henrys.menu"]) loadMenu(); refresh(); toast(`Imported: ${added} new, ${updated} updated`);
  }catch{ toast("That file isn't a HEAT backup."); }
}

/* ---------- backup reminder ---------- */
function lastBackupDays(){ const b=lsGet("henrys.backupAt"); return b?daysSince(b):null; }
function backupDue(){
  const firsts=shops.flatMap(c=>(c.touches||[]).map(t=>Date.parse(t.at))); if(!firsts.length) return false;
  const b=lastBackupDays(); if(b!=null) return b>=7;
  return (Date.now()-Math.min(...firsts))/864e5>=3;
}
function backupCard(){ if(!backupDue()) return ""; const b=lastBackupDays();
  return `<div class="bkcard"><div><b>Back up your stores</b><small>${b==null?"You haven’t saved a backup yet.":`Last backup ${ago(b)}.`} Everything lives on this phone, so a backup keeps it safe.</small></div><button class="btn sm" data-act="export">Save backup</button></div>`; }
function backupNag(){ if(!backupDue() || lsGet("henrys.backupNag")===todayISO()) return; lsSet("henrys.backupNag",todayISO());
  setTimeout(()=>toast("Time to save a backup of your stores",{label:"Save",fn:exportBackup}),900); }

/* ---------- follow-ups on the calendar ---------- */
function icsEsc(s){ return String(s||"").replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/([,;])/g,"\\$1"); }
const icsTime=d=>`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}T${String(d.getHours()).padStart(2,"0")}${String(d.getMinutes()).padStart(2,"0")}00`;
function makeICS(events){
  const stamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d+/,"");
  const L=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//HEAT//EN","CALSCALE:GREGORIAN"];
  events.forEach(e=>{ L.push("BEGIN:VEVENT",`UID:${e.uid}@heat`,`DTSTAMP:${stamp}`,`DTSTART:${icsTime(e.start)}`,`DTEND:${icsTime(e.end)}`,`SUMMARY:${icsEsc(e.title)}`);
    if(e.location) L.push(`LOCATION:${icsEsc(e.location)}`); if(e.desc) L.push(`DESCRIPTION:${icsEsc(e.desc)}`);
    if(e.alarm!==false) L.push("BEGIN:VALARM",`TRIGGER:-PT${e.alarm||15}M`,"ACTION:DISPLAY",`DESCRIPTION:${icsEsc(e.title)}`,"END:VALARM");
    L.push("END:VEVENT"); });
  L.push("END:VCALENDAR"); return L.join("\r\n");
}
function downloadICS(ics,name){
  const url=URL.createObjectURL(new Blob([ics],{type:"text/calendar"})), a=document.createElement("a"); a.href=url;
  if(!/iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator.maxTouchPoints>1 && /Macintosh/.test(navigator.userAgent))) a.download=name+".ics";
  document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },4000);
}
function storeEvent(c,start,mins,title,extra){
  const i=infoOf(c), ph=bestPhone(c)||i.shopPhone||"", mv=nextMoves().find(m=>m.c.id===c.id);
  const desc=[`${SNAME[c.stage||"new"]}${mv?" · "+mv.why:""}`, ph?`Call: ${ph}`:"", extra||"", c.notes||""].filter(Boolean).join("\n");
  return {uid:`${c.id}-${icsTime(start)}`, start, end:new Date(start.getTime()+mins*6e4), title, location:i.address?[c.name,i.address,i.city].filter(Boolean).join(", "):c.name, desc};
}
function followUpICS(c){
  if(!c.nextFollowUp) return null; const d=new Date(c.nextFollowUp.slice(0,10)+"T10:00:00");
  return makeICS([{...storeEvent(c,d,30,"Follow up: "+c.name), alarm:30}]);
}
function addFollowUpToCalendar(c){
  const ics=followUpICS(c); if(!ics){ toast("Pick a follow-up date first."); return; }
  downloadICS(ics,`follow-up-${normName(c.name).slice(0,24)}`);
}

/* ---------- scheduling a day or a week ---------- */
const STOP_MIN=40, MPH=22;
function driveMin(a,b){ const m=miles(a,b); return m==null?0:Math.max(5,Math.round(m*1.3/MPH*60/5)*5); }
function scheduleDay(dateISO, ids, startHHMM, from){
  const [h,m]=(startHHMM||"10:00").split(":").map(Number); let t=new Date(`${dateISO}T00:00:00`); t.setHours(h,m||0,0,0);
  let prev=from||null; return ids.map(id=>shops.find(c=>c.id===id)).filter(Boolean).map(c=>{ if(prev) t=new Date(t.getTime()+driveMin(prev,c)*6e4); const at=new Date(t); t=new Date(t.getTime()+STOP_MIN*6e4); prev=c; return {c,at}; });
}
const hhmm=d=>d.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"});
function dayEvents(sched){ return sched.map((s,i)=>storeEvent(s.c,s.at,STOP_MIN,`HEAT ${i+1}/${sched.length}: ${s.c.name}`)); }
function routeToCalendar(){
  const r=routeToday(); if(!r){ toast("Build a route first."); return; }
  const sched=scheduleDay(r.date, r.ids, settings().dayStart||"10:00", r.from==="me"?me:null);
  downloadICS(makeICS(dayEvents(sched)), `heat-route-${r.date}`); toast(`${sched.length} stops sent to your calendar`);
}
const WEEK_KEY="henrys.week", DAY_CAP=6;
function weekdaysFrom(d0){ const out=[]; const d=new Date(d0); d.setHours(12,0,0,0); while(out.length<5){ const wd=d.getDay(); if(wd!==0&&wd!==6) out.push(new Date(d)); d.setDate(d.getDate()+1); } return out; }
const isoDay=d=>{ const x=new Date(d.getTime()-d.getTimezoneOffset()*6e4); return x.toISOString().slice(0,10); };
function planWeek(){
  const days=weekdaysFrom(new Date()).map(d=>({date:isoDay(d), ids:[]})), byDate=new Map(days.map(d=>[d.date,d]));
  const placed=shops.filter(c=>c.lat!=null), used=new Set();
  // follow-ups land on their own day (weekends roll to Monday)
  placed.forEach(c=>{ if(!c.nextFollowUp) return; let d=new Date(c.nextFollowUp.slice(0,10)+"T12:00:00"); if(d<new Date(days[0].date+"T00:00:00")) d=new Date(days[0].date+"T12:00:00");
    while(d.getDay()===0||d.getDay()===6) d.setDate(d.getDate()+1); const slot=byDate.get(isoDay(d)); if(slot && slot.ids.length<DAY_CAP){ slot.ids.push(c.id); used.add(c.id); } });
  // everything else worth a stop, grouped by area so each day stays in one part of the Bay
  const moves=nextMoves().filter(m=>m.c.lat!=null && !used.has(m.c.id)).slice(0, DAY_CAP*5);
  const zones=new Map(); moves.forEach(m=>{ const z=m.c.zone||"other"; if(!zones.has(z)) zones.set(z,{s:0,list:[]}); const g=zones.get(z); g.s+=m.s; g.list.push(m.c); });
  [...zones.values()].sort((a,b)=>b.s-a.s).forEach(g=>{ let list=g.list.slice();
    while(list.length){ const zoneOfDay=d=>{ const f=d.ids.map(id=>shops.find(c=>c.id===id)).find(Boolean); return f?(f.zone||"other"):null; };
      const z=list[0].zone||"other";
      const mid=pts=>({lat:pts.reduce((s,c)=>s+c.lat,0)/pts.length, lon:pts.reduce((s,c)=>s+c.lon,0)/pts.length}), gc=mid(list);
      const open=days.filter(d=>d.ids.length<DAY_CAP), stopsOf=d=>d.ids.map(id=>shops.find(c=>c.id===id)).filter(Boolean);
      const slot=open.find(d=>zoneOfDay(d)===z) || open.find(d=>!d.ids.length) || open.sort((a,b)=>miles(gc,mid(stopsOf(a)))-miles(gc,mid(stopsOf(b))))[0];
      if(!slot) return; const take=list.splice(0, DAY_CAP-slot.ids.length); slot.ids.push(...take.map(c=>c.id)); } });
  days.forEach(d=>{ const stops=d.ids.map(id=>shops.find(c=>c.id===id)).filter(Boolean); d.ids=orderStops(null, stops).map(c=>c.id); });
  const w={made:new Date().toISOString(), start:settings().dayStart||"10:00", days}; lsSet(WEEK_KEY,w); return w;
}
function weekPlan(){ const w=lsGet(WEEK_KEY); if(!w) return null; const today=todayISO(); w.days=w.days.filter(d=>d.date>=today); return w.days.length?w:null; }
function weekToCalendar(dayIdx){
  const w=weekPlan(); if(!w) return; const ds=dayIdx==null?w.days:[w.days[dayIdx]];
  const ev=ds.flatMap(d=>dayEvents(scheduleDay(d.date,d.ids,w.start))); if(!ev.length){ toast("Nothing planned to send."); return; }
  downloadICS(makeICS(ev), dayIdx==null?`heat-week-${w.days[0].date}`:`heat-${ds[0].date}`); toast(`${ev.length} stop${ev.length===1?"":"s"} sent to your calendar`);
}
function weekSheet(){
  const w=weekPlan()||planWeek(), today=todayISO();
  const dayName=iso=>new Date(iso+"T12:00:00").toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"});
  const blocks=w.days.map((d,i)=>{ const sched=scheduleDay(d.date,d.ids,w.start); const area=[...new Set(sched.map(s=>zoneLabel(s.c.zone).split(" · ").pop()))].slice(0,2).join(" + ");
    return `<section class="wday"><div class="wday-h"><div><b>${d.date===today?"Today · ":""}${dayName(d.date)}</b><small>${sched.length?`${sched.length} stop${sched.length===1?"":"s"} · ${esc(area)}`:"Open day"}</small></div>
      ${sched.length?`<div class="wday-a">${d.date===today?`<button class="chipbtn" data-wroute="${i}">Make today’s route</button>`:""}<button class="chipbtn" data-wcal="${i}">Calendar</button></div>`:""}</div>
      ${sched.map(s=>`<button class="wstop" data-open="${s.c.id}"><span class="num">${hhmm(s.at)}</span><span><b>${esc(s.c.name)}</b><small>${esc(nextMoves().find(m=>m.c.id===s.c.id)?.why||infoOf(s.c).city||"")}</small></span></button>`).join("")}</section>`; }).join("");
  return `<div class="sheet-head"><div><div class="eyebrow">Plan the week</div><h1>Your week</h1><div class="sub">Follow-ups land on their day. Everything else is grouped by area so each day stays in one part of the Bay.</div></div>${xBtn}</div>
  <div class="sheet-body">
    <div class="grid2" style="margin-bottom:12px"><label class="field"><span>Day starts at</span><input id="dayStart" type="time" value="${esc(w.start)}"></label><button class="btn" data-act="week-replan" style="align-self:end">Re-plan</button></div>
    ${blocks}
    <div class="routebar"><button class="btn primary wide" data-act="week-cal">Add the whole week to my calendar</button></div>
  </div>`;
}

/* ---------- misc ---------- */
async function copy(text){ try{ await navigator.clipboard.writeText(text); toast("Copied"); }catch{ toast("Long-press the text to copy it."); } }
let toastT, toastFn=null; function toast(m,act){ const h=$("#toastHost"); toastFn=act?.fn||null; h.innerHTML=`<div class="toast" role="status"><span>${esc(m)}</span>${act?`<button class="toast-act" data-toastact>${esc(act.label)}</button>`:""}</div>`; clearTimeout(toastT); toastT=setTimeout(()=>{h.innerHTML="";toastFn=null;}, act?7000:2600); }
document.addEventListener("click",e=>{ if(e.target.closest("[data-toastact]") && toastFn){ const f=toastFn; toastFn=null; $("#toastHost").innerHTML=""; f(); } });

firstRun(); shops=Store.all().sort((a,b)=>a.name.localeCompare(b.name));
render();
initMap();
setTimeout(openGuide,400);   // the guide opens every time the app starts
if(navigator.permissions?.query) navigator.permissions.query({name:"geolocation"}).then(p=>{ if(p.state==="granted") locate(false); }).catch(()=>{});
