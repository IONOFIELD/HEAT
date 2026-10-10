/* Procedural galloping unicorn with a joint. A new random seed each time decides coat,
   mane, horn, eyes, accessory, joint and smoke. setStep(k,n) pulls the camera back from
   a face close-up (k=0) to the whole unicorn running through the night (k=n-1). */
(function(){
  function rng(seed){ let s=(seed>>>0)||7; return ()=>{ s^=s<<13; s>>>=0; s^=s>>>17; s^=s<<5; s>>>=0; return (s%1000003)/1000003; }; }
  window.startUnicorn = function(canvas, seedIn){
    const seed = seedIn ?? Math.floor(Math.random()*4294967295);
    const R=rng(seed), pick=a=>a[Math.floor(R()*a.length)], rnd=(a,b)=>a+R()*(b-a);
    const main=canvas.getContext("2d"); let ctx=main;
    const layer=()=>{ const c=document.createElement("canvas"); return {c, x:c.getContext("2d")}; };
    const LA=layer(), LG=layer(), LX=layer();
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const TAU=Math.PI*2;

    /* ---- the dice ---- */
    const COATS=[["#fdfbff","#e4dbf7"],["#f4eaff","#d6c2fb"],["#ffeaf5","#f4c4dc"],["#e8fff7","#b9ecd9"],["#fff7e2","#f1d9a3"],["#eaf2ff","#c2d4fb"],["#2b2149","#191230"],["#f2f2f2","#cfcfd8"]];
    const coat=pick(COATS), dark=coat[0]==="#2b2149";
    const line = dark ? "rgba(196,181,253,.8)" : "rgba(38,22,72,.6)";
    const shade = dark ? "#221a3c" : coat[1];
    const maneMode=pick(["rainbow","rainbow","rainbow","cosmic","pumpkin","pastel","neon","sunset","ocean"]);
    const hue0=rnd(0,360), spread=rnd(200,340), strands=5+Math.floor(R()*4), maneLen=rnd(.85,1.2), curl=rnd(.6,1.5);
    const horn=pick(["gold","silver","opal","rose","galaxy"]);
    const eye=pick(["stoned","stoned","stoned","closed","star","heart","spiral"]);
    const acc=pick(["none","none","shades","earring","chain","flower","shades","bandana"]);
    const hoofCol=pick(["#f5c542","#3a2a5c","#c084fc","#ff9a3c","#e5e7eb"]);
    const jointA=rnd(-.42,.04), jointL=rnd(30,44), smoke=pick(["white","white","rainbow","lilac","mint"]);
    const blush=R()<.8, freckles=R()<.3, lashes=2+Math.floor(R()*3);
    const speed=rnd(.0016,.0024), tailLen=rnd(.9,1.3), hillHue=pick([265,280,250,300,20]);
    const sky=[...Array(60)].map(()=>({x:rnd(-600,600),y:rnd(-330,-40),s:rnd(.6,2),p:rnd(0,TAU)}));
    const hills=[...Array(3)].map((_,i)=>({a:rnd(10,26),f:rnd(.004,.01),o:rnd(0,TAU),y:60+i*26,sp:.25+i*.3}));

    function maneColor(i,t){
      const f=strands>1?i/(strands-1):0, drift=still?0:t/70;
      switch(maneMode){
        case "cosmic": return `hsl(${245+f*80+Math.sin(t/800+i)*8},85%,${55+f*12}%)`;
        case "pumpkin": return i%2 ? `hsl(${270+f*20},70%,58%)` : `hsl(${22+f*16},96%,56%)`;
        case "pastel": return `hsl(${(hue0+f*spread+drift)%360},90%,80%)`;
        case "neon": return `hsl(${(hue0+f*spread+drift*1.5)%360},100%,60%)`;
        case "sunset": return `hsl(${(330+f*70)%360},95%,${60+f*8}%)`;
        case "ocean": return `hsl(${170+f*70},85%,${55+f*12}%)`;
        default: return `hsl(${(hue0+f*spread+drift)%360},92%,64%)`;
      }
    }
    // head drawn in its own 250x225 box, then placed on the body
    const HEAD=new Path2D("M60,225 C57,170 67,125 93,87 C103,71 117,59 133,57 C151,55 163,65 173,79 C187,99 203,115 215,127 C225,139 221,157 205,161 C193,164 179,159 169,155 C157,151 149,151 145,157 C139,177 141,201 147,225 Z");
    const EAR=new Path2D("M112,66 C107,47 111,34 118,24 C125,35 131,50 129,66 Z");
    const EAR_IN=new Path2D("M115,62 C112,49 114,40 118,33 C122,41 125,51 124,62 Z");
    const HS=.8, HX=-18, HY=-190;                         // head box -> world
    const toWorld=(x,y)=>({x:HX+x*HS, y:HY+y*HS});

    /* ---- powers-of-ten camera: Z goes 0 (face) .. 6 (galaxy) ---- */
    let step=0, steps=7, Z=0;
    const sm=(a,b,x)=>{ const u=Math.min(1,Math.max(0,(x-a)/(b-a))); return u*u*(3-2*u); };
    function keyLerp(keys, z, log){ // keys: [[z,v],...]
      if(z<=keys[0][0]) return keys[0][1]; for(let i=1;i<keys.length;i++){ const [z1,v1]=keys[i], [z0,v0]=keys[i-1]; if(z<=z1){ const u=(z-z0)/(z1-z0); return log? Math.exp(Math.log(v0)+(Math.log(v1)-Math.log(v0))*u) : v0+(v1-v0)*(u*u*(3-2*u)); } }
      return keys[keys.length-1][1]; }
    const KA_vw=[[0,95],[1,265],[2,2900],[3,9000],[3.7,26000]], KA_cx=[[0,166],[1,112],[2,900],[3,0]], KA_cy=[[0,-72],[1,-100],[2,-760],[3,-30]];
    const KG_R=[[3,1/0.0006],[4,1/0.034],[5,.26],[5.6,.012],[6,.004]];   // globe radius in canvas widths
    const KX_G=[[5.2,80],[6,.43]];                                         // galaxy radius in canvas widths
    const LON0=-122.435*Math.PI/180, LAT0=37.762*Math.PI/180, sL=Math.sin(LAT0), cL=Math.cos(LAT0);
    const deg=Math.PI/180;
    function proj(lon,lat,R){ const l=lon*deg-LON0, p=lat*deg; const cp=Math.cos(p); const cosc=sL*Math.sin(p)+cL*cp*Math.cos(l);
      let x=R*cp*Math.sin(l), y=-R*(cL*Math.sin(p)-sL*cp*Math.cos(l)); if(cosc<0){ const m=Math.hypot(x,y)||1; x=x/m*R; y=y/m*R; } return [x,y,cosc>=0]; }
    // galaxy particles
    const arms=2+Math.floor(R()*3), twist=rnd(3.6,5.4), GAL=[...Array(1500)].map((_,i)=>{ const arm=i%arms, r=Math.pow(R(),.6), a=arm*TAU/arms+r*twist+(R()-.5)*(.9-r*.5), rr=r+(R()-.5)*.06;
      const core=r<.16; return {x:Math.cos(a)*rr, y:Math.sin(a)*rr*.62, s:rnd(.5,1.7)*(core?1.3:1), c: core?`hsla(45,100%,${82+R()*14}%,.95)`:`hsla(${(hue0+r*140+arm*35)%360},${70+R()*25}%,${66+R()*22}%,${.55+R()*.4})`}; });
    const SKY=[...Array(22)].map((_,i)=>({x:2580+i*52+rnd(-8,8), w:rnd(40,70), h:rnd(140,430), lit:[...Array(14)].map(()=>[R(),R()])}));
    const bridgeHue=rnd(8,18), towerLights=R()<.5;
    const FIELD=[...Array(140)].map(()=>({x:R(),y:R(),s:rnd(.4,1.4),p:rnd(0,TAU)}));

    const puffs=[], dust=[]; let t0=performance.now(), lastSpawn=0, lastDust=0, nextExhale=t0+rnd(1800,3500), blinkAt=t0+rnd(1500,4000), raf=0, puffBoost=0, lastNow=t0;
    function fit(){ const dpr=Math.min(3,window.devicePixelRatio||1); const r=canvas.getBoundingClientRect(); canvas.width=Math.max(1,r.width*dpr); canvas.height=Math.max(1,r.height*dpr); }
    fit();
    function spark(x,y,s,col){ ctx.fillStyle=col; ctx.beginPath(); ctx.moveTo(x,y-s); ctx.quadraticCurveTo(x,y,x+s,y); ctx.quadraticCurveTo(x,y,x,y+s); ctx.quadraticCurveTo(x,y,x-s,y); ctx.quadraticCurveTo(x,y,x,y-s); ctx.fill(); }

    /* ---------- scenery ---------- */
    /* ---------- Bay Area landscape (parallax, loops) ---------- */
    const LP=9200, LS=1.8;
    function bump(x0,x1,peak,base,col){ ctx.fillStyle=col; ctx.beginPath(); ctx.moveTo(x0,base); ctx.bezierCurveTo(x0+(x1-x0)*.3,base-peak*1.1,x0+(x1-x0)*.6,base-peak*1.05,x1,base); ctx.closePath(); ctx.fill(); }
    function landmarks(o,t){
      const sil="hsl(255,32%,15%)", sil2="hsl(258,30%,20%)", win="rgba(255,214,140,.85)";
      // Marin headlands + Golden Gate
      bump(o-400,o+520,430,0,sil2);
      const gg=sil; ctx.strokeStyle=gg; ctx.fillStyle=gg;
      [o+520,o+1420].forEach(x=>{ ctx.fillRect(x-18,-560,14,560); ctx.fillRect(x+4,-560,14,560); [-520,-400,-280].forEach(y=>ctx.fillRect(x-18,y,36,10)); });
      ctx.fillRect(o+120,-138,1700,14);
      ctx.lineWidth=5; ctx.beginPath(); ctx.moveTo(o+120,-130); ctx.quadraticCurveTo(o+330,-420,o+520,-556); ctx.quadraticCurveTo(o+970,-60,o+1420,-556); ctx.quadraticCurveTo(o+1620,-420,o+1820,-130); ctx.stroke();
      ctx.lineWidth=1.5; for(let x=o+560;x<o+1400;x+=45){ const u=(x-(o+520))/900, cy=-556+(1-Math.pow(1-2*Math.abs(u-.5),1)*0)*0; const yc=-556+ (1-(2*u-1)**2)*496; ctx.beginPath(); ctx.moveTo(x,yc); ctx.lineTo(x,-130); ctx.stroke(); }
      { ctx.fillStyle="#ff5a5a"; [o+520,o+1420].forEach(x=>{ ctx.beginPath(); ctx.arc(x,-566,6,0,TAU); ctx.fill(); }); }
      // SF: Sutro Tower on its hill, then downtown
      bump(o+1850,o+2600,300,0,sil2);
      ctx.strokeStyle=sil; ctx.lineWidth=7; const sx=o+2210;
      ctx.beginPath(); ctx.moveTo(sx-34,-250); ctx.lineTo(sx-6,-640); ctx.moveTo(sx+34,-250); ctx.lineTo(sx+6,-640); ctx.moveTo(sx,-250); ctx.lineTo(sx,-640); ctx.stroke();
      ctx.lineWidth=4; [-430,-560].forEach(y=>{ ctx.beginPath(); ctx.moveTo(sx-26,y); ctx.lineTo(sx+26,y); ctx.stroke(); });
      ctx.fillStyle="#ff4d4d"; [-660,-640].forEach((y,i)=>{ ctx.beginPath(); ctx.arc(sx+(i?-6:6),y,5,0,TAU); ctx.fill(); });
      SKY.forEach(b=>{ ctx.fillStyle=sil; ctx.fillRect(o+b.x,-b.h,b.w,b.h); ctx.fillStyle=win; b.lit.forEach(([u,v])=>ctx.fillRect(o+b.x+4+u*(b.w-12),-b.h+8+v*(b.h-16),5,7)); });
      ctx.fillStyle=sil; ctx.beginPath(); ctx.moveTo(o+2960,0); ctx.lineTo(o+3010,-540); ctx.lineTo(o+3060,0); ctx.fill(); ctx.fillRect(o+3007,-600,6,70);   // Transamerica
      ctx.fillStyle="hsl(255,30%,19%)"; ctx.beginPath(); ctx.moveTo(o+3300,0); ctx.lineTo(o+3300,-640); ctx.quadraticCurveTo(o+3355,-740,o+3410,-640); ctx.lineTo(o+3410,0); ctx.fill();  // Salesforce
      ctx.fillStyle=`hsla(${(hue0+t/40)%360},90%,70%,.75)`; ctx.fillRect(o+3304,-690,102,22);   // its light crown
      // Bay Bridge
      ctx.strokeStyle=sil; ctx.fillStyle=sil; ctx.fillRect(o+3800,-118,2500,10);
      [o+4250,o+5000,o+5750].forEach(x=>{ ctx.fillRect(x-8,-380,16,380); });
      ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(o+3850,-115); [o+4250,o+5000,o+5750].forEach((x,i,a)=>{ ctx.quadraticCurveTo(x-(i?375:200),-140,x,-378); }); ctx.quadraticCurveTo(o+6000,-140,o+6250,-115); ctx.stroke();
      ctx.fillStyle="#fff"; for(let x=o+3850;x<o+6250;x+=70){ const d=Math.min(...[o+4250,o+5000,o+5750].map(c=>Math.abs(x-c))); const y=-115-Math.max(0,263*(1-d/375)**2); ctx.beginPath(); ctx.arc(x,y,3.2,0,TAU); ctx.fill(); }
      // Oakland: port cranes and hills
      bump(o+6200,o+9200,330,0,sil2);
      ctx.strokeStyle="hsl(255,30%,26%)"; ctx.lineWidth=8; [o+6450,o+6800,o+7150].forEach(x=>{ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,-260); ctx.moveTo(x+90,0); ctx.lineTo(x+90,-260); ctx.moveTo(x-60,-250); ctx.lineTo(x+260,-250); ctx.moveTo(x+90,-260); ctx.lineTo(x+30,-330); ctx.stroke(); ctx.fillStyle="#ff5a5a"; ctx.beginPath(); ctx.arc(x+30,-334,5,0,TAU); ctx.fill(); });
    }
    function scenery(t, run, vw, cx){
      const L=cx-vw/2-60, Rr=cx+vw/2+60, la=sm(500,1300,vw);
      if(vw<1800) sky.forEach(s=>{ for(let k=Math.floor((L+600)/1200)-1;k<=Math.ceil((Rr+600)/1200);k++){ const x=((s.x - run*.05)%1200+1800)%1200-600+k*1200; if(x<L||x>Rr) continue;
        ctx.globalAlpha=(still?.8:.35+.65*Math.abs(Math.sin(t/900+s.p)))*(1-la*.5); ctx.fillStyle="#e9e2ff"; ctx.beginPath(); ctx.arc(x,s.y,s.s,0,TAU); ctx.fill(); } });
      ctx.globalAlpha=1;
      if(la>0){
        ctx.globalAlpha=la;
        // far: Mt Diablo and the East Bay ridge
        const fo=-(run*.12)%14000; for(let k=Math.floor((L-fo)/14000)-1;k<=Math.ceil((Rr-fo)/14000);k++){ const o=fo+k*14000; bump(o+2000,o+9000,980,0,"hsl(262,28%,23%)"); bump(o+8000,o+15000,620,0,"hsl(262,26%,21%)"); }
        // water
        const wg=ctx.createLinearGradient(0,-10,0,125); wg.addColorStop(0,"hsl(250,45%,22%)"); wg.addColorStop(1,"hsl(245,50%,13%)"); ctx.fillStyle=wg; ctx.fillRect(L,-2,Rr-L,124);
        ctx.strokeStyle="rgba(200,190,255,.18)"; ctx.lineWidth=Math.max(1.5,vw/700); for(let k=0;k<40;k++){ const y=6+(k%8)*14, x=((k*397 - run*.6)%3000+4500)%3000-1500+cx; ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+60+(k%5)*30,y); ctx.stroke(); }
        // mid: the landmarks
        const P=LP*LS, mo=-(run*.38)%P; for(let k=Math.floor((L-mo)/P)-1;k<=Math.ceil((Rr-mo)/P);k++){ ctx.save(); ctx.translate(mo+k*P-1600,0); ctx.scale(LS,LS); landmarks(0,t); ctx.restore(); }
        ctx.globalAlpha=1;
      }
      // near shore the unicorn runs on
      ctx.fillStyle=`hsla(${hillHue},40%,14%,1)`; ctx.fillRect(L,120,Rr-L,vw*3);
      ctx.fillStyle=`hsla(${hillHue},45%,22%,1)`; ctx.fillRect(L,117,Rr-L,8);
      if(vw<1600){ ctx.strokeStyle=`hsla(${hillHue},60%,40%,.6)`; ctx.lineWidth=2; for(let k=0;k<26;k++){ const x=((k*60 - run)%1560+2340)%1560-780; ctx.beginPath(); ctx.moveTo(x,128+(k%3)*8); ctx.lineTo(x+18,128+(k%3)*8); ctx.stroke(); } }
    }

    /* ---------- legs & tail ---------- */
    const LEGS=[ // hip x,y, phase, front?, near?
      {x:-66,y:14,ph:.0, front:false, near:false},
      {x:46, y:18,ph:.55,front:true, near:false},
      {x:-56,y:18,ph:.22,front:false, near:true},
      {x:58, y:20,ph:.78,front:true, near:true}];
    function legPose(L,p){
      const s=still?.3:p+L.ph, c=Math.cos(TAU*s), sn=Math.sin(TAU*s);
      const a1 = L.front ? .62*sn : .55*sn, a2 = L.front ? -1.25*Math.max(0,c) : .95*Math.max(0,-c);
      return {a1,a2};
    }
    function drawLeg(L,p,bob){
      const {a1,a2}=legPose(L,p); const hx=L.x, hy=L.y+bob;
      const kx=hx+Math.sin(a1)*46, ky=hy+Math.cos(a1)*46;
      const fx=kx+Math.sin(a1+a2)*48, fy=ky+Math.cos(a1+a2)*48;
      const col=L.near?coat[0]:shade;
      ctx.lineCap="round"; ctx.lineJoin="round";
      ctx.strokeStyle=line; ctx.lineWidth=19; ctx.beginPath(); ctx.moveTo(hx,hy-8); ctx.lineTo(kx,ky); ctx.stroke();
      ctx.lineWidth=15; ctx.beginPath(); ctx.moveTo(kx,ky); ctx.lineTo(fx,fy); ctx.stroke();
      ctx.strokeStyle=col; ctx.lineWidth=15; ctx.beginPath(); ctx.moveTo(hx,hy-8); ctx.lineTo(kx,ky); ctx.stroke();
      ctx.lineWidth=11; ctx.beginPath(); ctx.moveTo(kx,ky); ctx.lineTo(fx,fy); ctx.stroke();
      ctx.save(); ctx.translate(fx,fy); ctx.rotate(-(a1+a2)); ctx.fillStyle=hoofCol; ctx.strokeStyle=line; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.roundRect?ctx.roundRect(-7,0,14,10,3):ctx.rect(-7,0,14,10); ctx.fill(); ctx.stroke(); ctx.restore();
      return {x:fx,y:fy+8};
    }
    function tail(t,bob){
      const bx=-96, by=-18+bob;
      for(let i=0;i<strands;i++){
        const w=still?0:Math.sin(t/260+i*.9)*10, w2=still?0:Math.sin(t/330+i)*14;
        ctx.strokeStyle=maneColor(i,t); ctx.lineCap="round"; ctx.lineWidth=13-i*.6;
        ctx.beginPath(); ctx.moveTo(bx,by+i*3);
        ctx.bezierCurveTo(bx-30, by-14+i*4+w, bx-60*tailLen, by+10+i*6-w, bx-92*tailLen, by+28+i*8+w2); ctx.stroke();
      }
    }

    /* ---------- head (box coords) ---------- */
    function maneBase(t){
      const w=still?0:Math.sin(t/300)*4*curl;
      const g=ctx.createLinearGradient(0,55,0,215); for(let i=0;i<strands;i++) g.addColorStop(i/(strands-1||1), maneColor(i,t));
      ctx.fillStyle=g; ctx.beginPath();
      ctx.moveTo(116,56); ctx.bezierCurveTo(96,64,80,92,70,128); ctx.bezierCurveTo(60,160,50+w,190,44+w,215);
      ctx.lineTo(70,215); ctx.bezierCurveTo(70,190,74,150,86,112); ctx.bezierCurveTo(94,90,104,76,118,66); ctx.closePath(); ctx.fill();
    }
    function mane(t, back){
      for(let i=0;i<strands;i++){
        if((i%2===0)!==back) continue;
        const u=i/(strands-1||1); const sx=104-u*40, sy=62+u*118;
        const wav=still?0:Math.sin(t/240+i*1.3)*6*curl, wav2=still?0:Math.sin(t/200+i)*10*curl;   // whips in the wind
        const ex=sx-34*maneLen+wav2, ey=sy+34*maneLen;
        ctx.strokeStyle=maneColor(i,t); ctx.lineCap="round"; ctx.lineWidth=(back?21:17)-u*4;
        ctx.beginPath(); ctx.moveTo(sx+6,sy-2); ctx.bezierCurveTo(sx-14+wav,sy+6, sx-16-wav,sy+24, ex,ey); ctx.stroke();
        ctx.lineWidth=5; ctx.strokeStyle="rgba(255,255,255,.28)";
        ctx.beginPath(); ctx.moveTo(sx+4,sy); ctx.bezierCurveTo(sx-12+wav,sy+8, sx-14-wav,sy+22, ex+3,ey-4); ctx.stroke();
      }
    }
    function hornDraw(t){
      const H={gold:["#fff1b8","#e7b53c","#fff6d6"],silver:["#ffffff","#b8bdd0","#eef0f8"],rose:["#ffe1ea","#f08aa8","#fff0f5"],opal:[`hsl(${(t/20)%360},90%,85%)`,`hsl(${(t/20+120)%360},90%,80%)`,`hsl(${(t/20+240)%360},90%,88%)`],galaxy:["#c4b5fd","#4c1d95","#f0abfc"]}[horn];
      const g=ctx.createLinearGradient(130,60,168,2); g.addColorStop(0,H[0]); g.addColorStop(.5,H[1]); g.addColorStop(1,H[2]);
      ctx.fillStyle=g; ctx.strokeStyle=line; ctx.lineWidth=1.6;
      ctx.beginPath(); ctx.moveTo(129,60); ctx.lineTo(168,3); ctx.lineTo(148,62); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle="rgba(255,255,255,.75)"; ctx.lineWidth=1.4;
      for(let k=1;k<6;k++){ const f=k/6; ctx.beginPath(); ctx.moveTo(129+39*f,60-57*f+2); ctx.lineTo(148+20*f,62-59*f-3); ctx.stroke(); }
      if(horn==="galaxy") for(let k=0;k<5;k++) spark(140+k*4,48-k*9,1.6,"#fff");
    }
    function eyeDraw(t,now){
      const x=162,y=90; ctx.save(); ctx.translate(x,y); ctx.scale(1.3,1.3); ctx.translate(-x,-y);
      const ink=dark?"#efe9ff":"#21143f"; ctx.strokeStyle=ink; ctx.fillStyle=ink; ctx.lineWidth=2.2; ctx.lineCap="round";
      const blinking=!still && now>blinkAt && now<blinkAt+160;
      if(eye==="closed"||blinking){ ctx.beginPath(); ctx.arc(x,y-2,7,0.15*Math.PI,0.85*Math.PI); ctx.stroke(); }
      else if(eye==="star") spark(x,y,7,`hsl(${(hue0+t/20)%360},95%,60%)`);
      else if(eye==="heart"){ ctx.fillStyle="#ff4f8b"; ctx.beginPath(); ctx.moveTo(x,y+5); ctx.bezierCurveTo(x-9,y-2,x-4,y-9,x,y-4); ctx.bezierCurveTo(x+4,y-9,x+9,y-2,x,y+5); ctx.fill(); }
      else if(eye==="spiral"){ ctx.lineWidth=1.5; ctx.beginPath(); for(let a=0;a<12;a+=.3){ const r=a*.6; ctx.lineTo(x+Math.cos(a+t/300)*r,y+Math.sin(a+t/300)*r); } ctx.stroke(); }
      else { // stoned: pink-rimmed, heavy lids, wandering pupil
        ctx.fillStyle="#fff1f4"; ctx.beginPath(); ctx.ellipse(x,y+1,7.5,5.2,0,0,TAU); ctx.fill();
        ctx.strokeStyle="rgba(240,80,110,.55)"; ctx.lineWidth=.8; [[-5,2,-2,1],[5,3,2,1.5],[-4,4,-1,2.5]].forEach(([a,b,c,d])=>{ctx.beginPath();ctx.moveTo(x+a,y+b);ctx.lineTo(x+c,y+d);ctx.stroke();});
        const px=x+1+(still?0:Math.sin(t/1400)*1.5); ctx.fillStyle=ink; ctx.beginPath(); ctx.ellipse(px,y+2,3.6,3.8,0,0,TAU); ctx.fill();
        ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(px+1.2,y+1,1,0,TAU); ctx.fill();
        const lid=still?.62:.58+.06*Math.sin(t/1700);                   // droopy lid
        ctx.fillStyle=coat[0]; ctx.fillRect(x-10,y-7,20,7+10*lid-4.5);
        ctx.strokeStyle=ink; ctx.lineWidth=2.2; ctx.beginPath(); ctx.moveTo(x-8.5,y-4.5+10*lid-1); ctx.quadraticCurveTo(x,y-5.5+10*lid-1,x+8.5,y-4.5+10*lid-1); ctx.stroke();
        ctx.strokeStyle="rgba(240,100,140,.5)"; ctx.lineWidth=1.2; ctx.beginPath(); ctx.moveTo(x-7,y+6.5); ctx.quadraticCurveTo(x,y+8,x+7,y+6); ctx.stroke(); // under-eye
      }
      ctx.strokeStyle=ink; ctx.lineWidth=1.8; for(let k=0;k<lashes;k++){ const lx=x-5+k*5; ctx.beginPath(); ctx.moveTo(lx,y-1); ctx.lineTo(lx-2,y-6); ctx.stroke(); }
      ctx.restore();
    }
    function accessory(t){
      ctx.save(); ctx.strokeStyle=line; ctx.lineWidth=1.5;
      if(acc==="shades"){
        ctx.fillStyle="rgba(18,12,34,.92)"; ctx.beginPath(); ctx.roundRect?ctx.roundRect(147,80,32,16,7):ctx.rect(147,80,32,16); ctx.fill();
        const g=ctx.createLinearGradient(147,80,179,96); g.addColorStop(0,"#ff8ad8"); g.addColorStop(.5,"#7ad7ff"); g.addColorStop(1,"#fff07a");
        ctx.strokeStyle=g; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(152,85); ctx.lineTo(159,85); ctx.stroke();
        ctx.strokeStyle="#120c22"; ctx.lineWidth=2.5; ctx.beginPath(); ctx.moveTo(147,86); ctx.lineTo(126,76); ctx.stroke();
      } else if(acc==="earring"){ ctx.strokeStyle="#f5c542"; ctx.lineWidth=2.4; ctx.beginPath(); ctx.arc(124,72,5,0,TAU); ctx.stroke(); }
      else if(acc==="chain"){ ctx.strokeStyle="#f5c542"; ctx.lineWidth=3; ctx.setLineDash([3,2]); ctx.beginPath(); ctx.moveTo(72,168); ctx.quadraticCurveTo(108,190,146,176); ctx.stroke(); ctx.setLineDash([]); spark(109,184,6,"#f5c542"); }
      else if(acc==="flower"){ const c=`hsl(${hue0},90%,70%)`; for(let k=0;k<5;k++){ const a=k*1.2566+t/2000; ctx.fillStyle=c; ctx.beginPath(); ctx.arc(108+Math.cos(a)*5,70+Math.sin(a)*5,4,0,TAU); ctx.fill(); } ctx.fillStyle="#ffd84d"; ctx.beginPath(); ctx.arc(108,70,3,0,TAU); ctx.fill(); }
      else if(acc==="bandana"){ ctx.fillStyle=`hsl(${(hue0+180)%360},75%,55%)`; ctx.beginPath(); ctx.moveTo(74,158); ctx.quadraticCurveTo(108,176,146,166); ctx.lineTo(142,186); ctx.quadraticCurveTo(104,198,70,180); ctx.closePath(); ctx.fill(); ctx.fillStyle="rgba(255,255,255,.6)"; for(let k=0;k<6;k++){ ctx.beginPath(); ctx.arc(82+k*11,174+Math.sin(k)*3,1.5,0,TAU); ctx.fill(); } }
      ctx.restore();
    }
    function joint(t){
      const mx=207,my=153, ang=jointA+(still?0:Math.sin(t/300)*.05);
      ctx.save(); ctx.translate(mx,my); ctx.rotate(ang);
      ctx.fillStyle="#d9a066"; ctx.fillRect(-3,-2.6,9,5.2);
      const grd=ctx.createLinearGradient(0,-3,0,3); grd.addColorStop(0,"#ffffff"); grd.addColorStop(1,"#e6e0d4");
      ctx.fillStyle=grd; ctx.beginPath(); ctx.moveTo(6,-2.6); ctx.lineTo(jointL,-3.6); ctx.lineTo(jointL,3.6); ctx.lineTo(6,2.6); ctx.closePath(); ctx.fill();
      ctx.strokeStyle="rgba(120,100,80,.35)"; ctx.lineWidth=.8; ctx.stroke();
      ctx.fillStyle="#8a8580"; ctx.fillRect(jointL,-3.6,3,7.2);
      const lit=still?1:sm(1000,1600,t); const glow=lit*(still?1:(.75+.25*Math.sin(t/160)+(puffBoost>0?.4:0)))+.001;
      const eg=ctx.createRadialGradient(jointL+4,0,0,jointL+4,0,9*glow); eg.addColorStop(0,"rgba(255,220,120,1)"); eg.addColorStop(.35,"rgba(255,110,30,.9)"); eg.addColorStop(1,"rgba(255,80,0,0)");
      ctx.fillStyle=eg; ctx.beginPath(); ctx.arc(jointL+4,0,9*glow,0,TAU); ctx.fill();
      ctx.restore();
      return {x:mx+Math.cos(ang)*(jointL+5), y:my+Math.sin(ang)*(jointL+5)};
    }
    const BODY=new Path2D(); BODY.ellipse(-2,0,102,46,0,0,TAU);
    function smokeColor(p,a){
      if(smoke==="rainbow") return `hsla(${(p.h+p.life/12)%360},90%,82%,${a})`;
      if(smoke==="lilac") return `hsla(270,80%,88%,${a})`;
      if(smoke==="mint") return `hsla(160,70%,86%,${a})`;
      return `rgba(240,236,255,${a})`;
    }

    function frame(now){
      const t=now-t0, dt=Math.min(50,now-lastNow); lastNow=now;
      const target=steps>1?step*6/(steps-1):6; Z = still? target : Z+(target-Z)*Math.min(1,dt/420);
      const cw=canvas.width, ch=canvas.height;
      [LA,LG,LX].forEach(L=>{ if(L.c.width!==cw||L.c.height!==ch){ L.c.width=cw; L.c.height=ch; } });
      main.setTransform(1,0,0,1,0,0); main.clearRect(0,0,cw,ch);
      const aA=1-sm(3.05,3.5,Z), aG=sm(2.95,3.4,Z)*(1-sm(5.45,5.8,Z)), aX=sm(5.3,5.75,Z);
      if(aX>0){ ctx=LX.x; galaxy(t,cw,ch); main.globalAlpha=aX; main.drawImage(LX.c,0,0); }
      if(aG>0){ ctx=LG.x; globe(t,cw,ch); main.globalAlpha=aG; main.drawImage(LG.c,0,0); }
      if(aA>0){ ctx=LA.x; unicornScene(now,t,dt,cw,ch); main.globalAlpha=aA; main.drawImage(LA.c,0,0); }
      main.globalAlpha=1; ctx=main;
      if(!still) raf=requestAnimationFrame(frame);
    }
    function globe(t,cw,ch){
      ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,cw,ch); ctx.translate(cw/2,ch/2);
      const Rg=keyLerp(KG_R,Z,true)*cw, big=Rg>cw*1.5;
      // stars behind the planet once it's small
      const sa=sm(4.3,4.9,Z); if(sa>0){ FIELD.forEach(f=>{ ctx.globalAlpha=sa*(.4+.6*Math.abs(Math.sin(t/900+f.p))); ctx.fillStyle="#eae4ff"; ctx.fillRect(f.x*cw-cw/2,f.y*ch-ch/2,f.s*cw/400,f.s*cw/400); }); ctx.globalAlpha=1; }
      // ocean
      if(big){ ctx.fillStyle="#1b2a6b"; ctx.fillRect(-cw/2,-ch/2,cw,ch); }
      else { const og=ctx.createRadialGradient(-Rg*.35,-Rg*.35,Rg*.1,0,0,Rg); og.addColorStop(0,"#3d5fd0"); og.addColorStop(1,"#141d55"); ctx.fillStyle=og; ctx.beginPath(); ctx.arc(0,0,Rg,0,TAU); ctx.fill(); }
      ctx.save(); if(!big){ ctx.beginPath(); ctx.arc(0,0,Rg,0,TAU); ctx.clip(); }
      const land=(rings,col)=>{ ctx.fillStyle=col; ctx.beginPath(); rings.forEach(r=>{ let any=false; r.forEach(([lo,la],i)=>{ const [x,y,v]=proj(lo,la,Rg); if(v) any=true; i?ctx.lineTo(x,y):ctx.moveTo(x,y); }); if(!any) return; ctx.closePath(); }); ctx.fill("evenodd"); };
      const E=window.EARTH||{bay:[],world:[]};
      const wA=sm(4.0,4.5,Z), bA=1-sm(4.3,4.7,Z);
      if(wA>0){ ctx.globalAlpha=wA; land(E.world,"#3d8a6a"); }
      if(bA>0){ ctx.globalAlpha=bA; land(E.bay,"#3f8f6c");
        const zl=sm(3.4,3.8,Z)*(1-sm(4.3,4.6,Z)); if(zl>0 && window.ZONES){ ctx.globalAlpha=zl*.5; ctx.strokeStyle="#c4b5fd"; ctx.lineWidth=1; window.ZONES.features.forEach(f=>{ const P=f.geometry.type==="Polygon"?[f.geometry.coordinates]:f.geometry.coordinates; P.forEach(p=>{ ctx.beginPath(); p[0].forEach(([lo,la],i)=>{ const [x,y]=proj(lo,la,Rg); i?ctx.lineTo(x,y):ctx.moveTo(x,y); }); ctx.stroke(); }); }); }
        const sd=sm(3.3,3.8,Z)*(1-sm(4.4,4.8,Z)); if(sd>0 && window.HENRYS_RETAILERS){ ctx.globalAlpha=sd; window.HENRYS_RETAILERS.forEach(r=>{ const [x,y,v]=proj(r.lon,r.lat,Rg); if(!v) return; ctx.fillStyle="#ff9a3c"; ctx.beginPath(); ctx.arc(x,y,Math.max(1.6,cw/180),0,TAU); ctx.fill(); }); } }
      ctx.globalAlpha=1;
      if(!big){ // night side + graticule
        const gr=sm(4.5,5,Z); if(gr>0){ ctx.globalAlpha=gr*.18; ctx.strokeStyle="#c9d6ff"; ctx.lineWidth=.6; for(let lo=-180;lo<180;lo+=30){ ctx.beginPath(); for(let la=-80;la<=80;la+=5){ const [x,y,v]=proj(lo,la,Rg); v?ctx.lineTo(x,y):ctx.moveTo(x,y);} ctx.stroke(); } for(let la=-60;la<=60;la+=30){ ctx.beginPath(); for(let lo=-180;lo<=180;lo+=5){ const [x,y,v]=proj(lo,la,Rg); v?ctx.lineTo(x,y):ctx.moveTo(x,y);} ctx.stroke(); } ctx.globalAlpha=1; }
        const sh=ctx.createLinearGradient(-Rg,-Rg*.3,Rg,Rg*.3); sh.addColorStop(0,"rgba(0,0,20,0)"); sh.addColorStop(.62,"rgba(0,0,20,0)"); sh.addColorStop(1,"rgba(5,0,25,.6)"); ctx.fillStyle=sh; ctx.fillRect(-Rg,-Rg,Rg*2,Rg*2); }
      ctx.restore();
      if(!big){ const ag=ctx.createRadialGradient(0,0,Rg*.96,0,0,Rg*1.14); ag.addColorStop(0,"rgba(120,170,255,.55)"); ag.addColorStop(1,"rgba(120,170,255,0)"); ctx.fillStyle=ag; ctx.beginPath(); ctx.arc(0,0,Rg*1.14,0,TAU); ctx.fill(); }
      // the unicorn, as a dot
      const pulse=still?1:1+.35*Math.sin(t/260), dr=cw/110;
      ctx.fillStyle="rgba(255,120,200,.35)"; ctx.beginPath(); ctx.arc(0,0,dr*2.4*pulse,0,TAU); ctx.fill();
      ctx.fillStyle="#ff8ad8"; ctx.beginPath(); ctx.arc(0,0,dr,0,TAU); ctx.fill(); ctx.strokeStyle="#fff"; ctx.lineWidth=cw/300; ctx.stroke();
    }
    function galaxy(t,cw,ch){
      ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,cw,ch);
      FIELD.forEach(f=>{ ctx.globalAlpha=.4+.6*Math.abs(Math.sin(t/900+f.p)); ctx.fillStyle="#eae4ff"; ctx.fillRect(f.x*cw,f.y*ch,f.s*cw/400,f.s*cw/400); }); ctx.globalAlpha=1;
      const G=keyLerp(KX_G,Z,true)*cw, pan=sm(5.5,6,Z), rot=still?0:t*.00002;
      const sun={x:.56,y:.1}; const sx=Math.cos(rot)*sun.x-Math.sin(rot)*sun.y*1, sy=(Math.sin(rot)*sun.x+Math.cos(rot)*sun.y)*1;
      const gx=cw/2 - sx*G*(1-pan), gy=ch/2 - sy*G*(1-pan);
      const core=ctx.createRadialGradient(gx,gy,0,gx,gy,G*.45); core.addColorStop(0,"rgba(255,236,190,.9)"); core.addColorStop(.25,`hsla(${hue0},80%,70%,.25)`); core.addColorStop(1,"rgba(0,0,0,0)");
      ctx.fillStyle=core; ctx.beginPath(); ctx.ellipse(gx,gy,G*.45,G*.3,0,0,TAU); ctx.fill();
      const cr=Math.cos(rot), srr=Math.sin(rot), ps=Math.max(.8,G/260);
      GAL.forEach(q=>{ const x=gx+(q.x*cr-q.y/.62*srr)*G, y=gy+(q.x*srr+q.y/.62*cr)*.62*G; if(x<-5||y<-5||x>cw+5||y>ch+5) return; ctx.fillStyle=q.c; ctx.fillRect(x,y,q.s*ps,q.s*ps); });
      // you are here
      const hx=gx+sx*G, hy=gy+sy*.62/.62*G; const yah=sm(5.8,6,Z);
      ctx.fillStyle="#ff8ad8"; ctx.beginPath(); ctx.arc(hx,hy,cw/150,0,TAU); ctx.fill();
      if(yah>0){ ctx.globalAlpha=yah; ctx.strokeStyle="#ff8ad8"; ctx.lineWidth=cw/400; ctx.beginPath(); ctx.arc(hx,hy,cw/40,0,TAU); ctx.stroke();
        ctx.fillStyle="#fff"; ctx.font=`600 ${Math.round(cw/26)}px -apple-system,system-ui,sans-serif`; ctx.fillText("you are here",hx+cw/32,hy-cw/40); ctx.globalAlpha=1; }
    }
    function unicornScene(now,t,dt,cw,ch){
      const vw=keyLerp(KA_vw,Z,true), cx=keyLerp(KA_cx,Math.min(Z,3)), cy=keyLerp(KA_cy,Math.min(Z,3)), sc=cw/vw;
      ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,cw,ch);
      const mx=cw*.82, my=ch*.2, mr=cw*.045; ctx.fillStyle=`hsla(${hillHue},60%,86%,.9)`; ctx.beginPath(); ctx.arc(mx,my,mr,0,TAU); ctx.fill(); ctx.fillStyle="rgba(15,11,30,.28)"; ctx.beginPath(); ctx.arc(mx+mr*.35,my-mr*.2,mr*.85,0,TAU); ctx.fill();
      const fa=sm(900,3200,vw); if(fa>0){ FIELD.forEach(f=>{ ctx.globalAlpha=fa*(.4+.6*Math.abs(Math.sin(t/900+f.p))); ctx.fillStyle="#eae4ff"; ctx.fillRect(f.x*cw,f.y*ch,f.s*cw/400,f.s*cw/400); }); ctx.globalAlpha=1; }
      ctx.setTransform(sc,0,0,sc,cw/2-cx*sc,ch/2-cy*sc);
      const cam={vw,cx,cy};

      const p=still?0:t*speed, run=still?0:t*.22;
      const bob=still?0:-6*Math.abs(Math.sin(TAU*p)), tilt=still?0:.035*Math.sin(TAU*p);
      scenery(t,run,vw,cx);

      // back of the unicorn
      const feet=[];
      LEGS.filter(L=>!L.near).forEach(L=>feet.push(drawLeg(L,p,bob)));
      tail(t,bob);
      LEGS.filter(L=>L.near).forEach(L=>feet.push(drawLeg(L,p,bob)));

      ctx.save(); ctx.translate(0,bob); ctx.rotate(tilt);
      // head box transform helpers
      const headIn=()=>{ ctx.save(); ctx.translate(HX,HY); ctx.scale(HS,HS); };
      headIn(); maneBase(t); mane(t,true); ctx.restore();
      // one clean outline around body + neck: stroke both, then fill both
      ctx.strokeStyle=line; ctx.lineWidth=4; ctx.stroke(BODY); headIn(); ctx.lineWidth=4/HS; ctx.stroke(HEAD); ctx.restore();
      const bg=ctx.createLinearGradient(-60,-60,60,60); bg.addColorStop(0,coat[0]); bg.addColorStop(1,coat[1]);
      ctx.fillStyle=bg; ctx.fill(BODY);
      headIn();
      const g=ctx.createLinearGradient(80,60,200,200); g.addColorStop(0,coat[0]); g.addColorStop(1,coat[1]); ctx.fillStyle=g; ctx.fill(HEAD);
      ctx.fillStyle=coat[0]; ctx.strokeStyle=line; ctx.lineWidth=2; ctx.fill(EAR); ctx.stroke(EAR); ctx.fillStyle="#f7a8c8"; ctx.fill(EAR_IN);
      mane(t,false);
      ctx.strokeStyle=maneColor(0,t); ctx.lineWidth=9; ctx.lineCap="round"; const fw=still?0:Math.sin(t/250)*3;
      ctx.beginPath(); ctx.moveTo(118,60); ctx.quadraticCurveTo(134+fw,62,140+fw,80); ctx.stroke();
      ctx.strokeStyle=maneColor(Math.min(2,strands-1),t); ctx.lineWidth=6; ctx.beginPath(); ctx.moveTo(122,58); ctx.quadraticCurveTo(146+fw,58,150+fw,72); ctx.stroke();
      hornDraw(t);
      if(blush){ ctx.fillStyle="rgba(255,120,170,.38)"; ctx.beginPath(); ctx.ellipse(178,116,9,5,-.4,0,TAU); ctx.fill(); }
      if(freckles){ ctx.fillStyle="rgba(160,90,60,.5)"; [[172,110],[177,113],[182,109]].forEach(([x,y])=>{ctx.beginPath();ctx.arc(x,y,1.1,0,TAU);ctx.fill();}); }
      eyeDraw(t,now);
      ctx.fillStyle=dark?"#c4b5fd":"#3a2560"; ctx.beginPath(); ctx.ellipse(209,137,2.6,3.6,.5,0,TAU); ctx.fill();
      ctx.strokeStyle=line; ctx.lineWidth=2; ctx.lineCap="round"; ctx.beginPath(); ctx.moveTo(206,153); ctx.quadraticCurveTo(196,157,186,151); ctx.stroke();
      accessory(t);
      const tipBox=joint(t);
      ctx.restore(); ctx.restore();
      // joint tip in world space (account for bob/tilt)
      const tw=toWorld(tipBox.x,tipBox.y); const tip={x:tw.x*Math.cos(tilt)-tw.y*Math.sin(tilt), y:tw.x*Math.sin(tilt)+tw.y*Math.cos(tilt)+bob};
      const mw=toWorld(213,150);

      if(!still){
        const lighter=t<2600; if(lighter){ const a=1-sm(1900,2600,t), dy=sm(1700,2600,t)*40, fl=t<1750;
          ctx.save(); ctx.globalAlpha=a; ctx.translate(tip.x+1,tip.y+9+dy); ctx.rotate(.12); ctx.scale(.42,.42);
          ctx.fillStyle=`hsl(${(hue0+90)%360},80%,55%)`; ctx.beginPath(); ctx.roundRect?ctx.roundRect(-6,6,12,30,4):ctx.rect(-6,6,12,30); ctx.fill();
          ctx.fillStyle="#cfd3dc"; ctx.fillRect(-6,0,12,7); ctx.fillStyle="#555"; ctx.fillRect(-3,-2,6,3);
          if(fl){ const f=1+.25*Math.sin(t/40); const fg=ctx.createRadialGradient(0,-8,0,0,-8,9*f); fg.addColorStop(0,"rgba(255,255,220,1)"); fg.addColorStop(.4,"rgba(255,180,60,.9)"); fg.addColorStop(1,"rgba(255,90,20,0)");
            ctx.fillStyle=fg; ctx.beginPath(); ctx.moveTo(0,-20*f); ctx.quadraticCurveTo(6,-8,0,-1); ctx.quadraticCurveTo(-6,-8,0,-20*f); ctx.fill(); ctx.beginPath(); ctx.arc(0,-8,9*f,0,TAU); ctx.fill(); }
          ctx.restore(); }
        if(t>1300 && now-lastSpawn>90){ lastSpawn=now; puffs.push({x:tip.x,y:tip.y,vx:-.07+rnd(-.01,.01),vy:-.018+rnd(-.006,.004),r:rnd(2,3.4),life:0,max:rnd(2200,3400),h:rnd(0,360),w:rnd(0,TAU)}); }
        if(t>2200 && now>nextExhale){ for(let q=0;q<9;q++) puffs.push({x:mw.x,y:mw.y+rnd(-3,3),vx:rnd(-.02,.03),vy:rnd(-.03,.0),r:rnd(4,7),big:true,life:0,max:rnd(1800,2600),h:rnd(0,360),w:rnd(0,TAU)}); puffBoost=600; nextExhale=now+rnd(3200,6000); blinkAt=now+rnd(400,2500); }
        if(puffBoost>0) puffBoost-=dt;
        if(now-lastDust>140){ lastDust=now; feet.forEach(f=>{ if(f.y>118) dust.push({x:f.x,y:126,vx:-.12+rnd(-.02,.02),vy:-rnd(.01,.04),life:0,max:rnd(500,900),h:(hue0+rnd(0,120))%360}); }); }
        for(let i=dust.length-1;i>=0;i--){ const d=dust[i]; d.life+=dt; if(d.life>d.max){dust.splice(i,1);continue;} d.x+=d.vx*dt; d.y+=d.vy*dt; ctx.globalAlpha=1-d.life/d.max; spark(d.x,d.y,3+3*(d.life/d.max),`hsl(${d.h},95%,75%)`); }
        ctx.globalAlpha=1;
        for(let i=puffs.length-1;i>=0;i--){ const q=puffs[i]; q.life+=dt; if(q.life>q.max){ puffs.splice(i,1); continue; }
          const f=q.life/q.max; q.x+=q.vx*dt+Math.sin(q.w+q.life/380)*.1; q.y+=q.vy*dt; if(q.big){ q.vx-=.00004*dt; }
          const r=q.r*(1+f*(q.big?3.4:2.8)), a=(1-f)*(q.big?.45:.36);
          const rg=ctx.createRadialGradient(q.x,q.y,0,q.x,q.y,r); rg.addColorStop(0,smokeColor(q,a)); rg.addColorStop(1,smokeColor(q,0));
          ctx.fillStyle=rg; ctx.beginPath(); ctx.arc(q.x,q.y,r,0,TAU); ctx.fill(); }
      } else {
        for(let q=0;q<6;q++){ const r=3+q*2.2; ctx.fillStyle=smokeColor({h:hue0+q*40,life:0},.28); ctx.beginPath(); ctx.arc(tip.x-q*6,tip.y-q*8,r,0,TAU); ctx.fill(); }
      }
      // as the unicorn shrinks to a dot, keep a glowing marker on it
      const da=sm(2600,5200,vw); if(da>0){ const r=5/sc; ctx.globalAlpha=da; ctx.fillStyle="rgba(255,120,200,.35)"; ctx.beginPath(); ctx.arc(0,-30,r*2.6*(still?1:1+.35*Math.sin(t/260)),0,TAU); ctx.fill(); ctx.fillStyle="#ff8ad8"; ctx.beginPath(); ctx.arc(0,-30,r,0,TAU); ctx.fill(); ctx.globalAlpha=1; }
    }
    const ro = window.ResizeObserver ? new ResizeObserver(()=>{ fit(); if(still) frame(performance.now()); }) : null; ro?.observe(canvas);
    raf=requestAnimationFrame(frame);
    return { seed, traits:{maneMode,horn,eye,acc,smoke},
      setStep(k,n){ step=k; steps=n||steps; if(still) requestAnimationFrame(frame); },
      stop(){ cancelAnimationFrame(raf); ro?.disconnect(); } };
  };
})();
