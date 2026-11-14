/* 夏日未寄 — 镰仓 3D 模型集
 * AI-authored procedural low-poly meshes. Every building, prop, tree and character
 * is generated as real triangle geometry (not CSS, billboard scenery or 2D art).
 * Fixed, deterministic map; no external model API or runtime downloads required.
 */
(function () {
'use strict';
function build() {
  const vertices=[], obstacles=[], places=[], npcs=[];
  const C={
    sand:[.83,.73,.59],sandLight:[.92,.82,.66],ground:[.42,.58,.47],
    grass:[.44,.61,.49],asphalt:[.44,.44,.49],path:[.69,.62,.63],
    sea:[.29,.53,.70],sea2:[.36,.63,.76],foam:[.80,.88,.87],
    wood:[.57,.39,.34],wood2:[.69,.51,.39],beam:[.36,.28,.32],
    paper:[.89,.85,.76],wall:[.82,.76,.72],wall2:[.75,.72,.79],
    roof:[.36,.38,.52],roof2:[.48,.36,.49],brick:[.67,.52,.51],
    glass:[.43,.61,.72],leaf:[.36,.53,.41],leaf2:[.48,.62,.45],
    bloom:[.77,.58,.67],stone:[.56,.57,.61],lamp:[.99,.87,.65],
    white:[.90,.86,.84],dark:[.24,.28,.35],ink:[.26,.24,.33]
  };
  const tint=(col,fac)=>col.map(v=>Math.min(1,v*fac));
  function vert(p,col){vertices.push(p[0],p[1],p[2],col[0],col[1],col[2]);}
  function tri(a,b,c,col,shade=1){const color=tint(col,shade);vert(a,color);vert(b,color);vert(c,color);}
  function quad(a,b,c,d,col,shade=1){tri(a,b,c,col,shade);tri(a,c,d,col,shade);}
  function box(x,y,z,w,h,d,col) {
    const l=x-w/2,r=x+w/2,b=y,t=y+h,n=z-d/2,f=z+d/2;
    quad([l,b,f],[r,b,f],[r,t,f],[l,t,f],col,.94);
    quad([r,b,n],[l,b,n],[l,t,n],[r,t,n],col,.77);
    quad([l,b,n],[l,b,f],[l,t,f],[l,t,n],col,.72);
    quad([r,b,f],[r,b,n],[r,t,n],[r,t,f],col,.86);
    quad([l,t,f],[r,t,f],[r,t,n],[l,t,n],col,1.12);
    quad([l,b,n],[r,b,n],[r,b,f],[l,b,f],col,.65);
  }
  function cylinder(x,y,z,r,h,col,sides=8,r2=r) {
    const top=[],bottom=[];
    for(let i=0;i<sides;i++){const a=i*Math.PI*2/sides;top.push([x+Math.cos(a)*r2,y+h,z+Math.sin(a)*r2]);bottom.push([x+Math.cos(a)*r,y,z+Math.sin(a)*r]);}
    for(let i=0;i<sides;i++){const j=(i+1)%sides;quad(bottom[i],bottom[j],top[j],top[i],col,.83+(.16*Math.cos(i*Math.PI*2/sides)));}
    for(let i=1;i<sides-1;i++)tri(top[0],top[i],top[i+1],col,1.08);
  }
  function octa(x,y,z,rx,ry,rz,col){
    const top=[x,y+ry,z],bottom=[x,y-ry,z],p=[[x+rx,y,z],[x,y,z+rz],[x-rx,y,z],[x,y,z-rz]];
    for(let i=0;i<4;i++){tri(top,p[i],p[(i+1)%4],col,1.07-i*.07);tri(bottom,p[(i+1)%4],p[i],col,.75+i*.04);}
  }
  function roof(x,y,z,w,d,h,color){
    const l=x-w/2-.45,r=x+w/2+.45,n=z-d/2-.5,f=z+d/2+.5,m=y+h;
    quad([l,y,n],[x,m,n],[x,m,f],[l,y,f],color,.86);
    quad([x,m,n],[r,y,n],[r,y,f],[x,m,f],color,1.08);
    tri([l,y,f],[r,y,f],[x,m,f],C.beam,.78);
    tri([r,y,n],[l,y,n],[x,m,n],C.beam,.68);
  }
  function steps(x,z,w=2.8){for(let i=0;i<3;i++)box(x,.05+i*.13,z+i*.55,w,.12,1,C.stone);}
  function tree(x,z,scale=1){
    cylinder(x,0,z,.23*scale,3.2*scale,C.wood,7,.18*scale);
    octa(x,4.6*scale,z,2.0*scale,2.6*scale,1.65*scale,C.leaf);
    octa(x-.65*scale,3.45*scale,z+.65*scale,1.2*scale,1.5*scale,1.25*scale,C.leaf2);
  }
  function shrub(x,z,s=1){octa(x,.62*s,z,1.1*s,.75*s,.95*s,C.leaf2);}
  function lantern(x,z){
    cylinder(x,0,z,.13,4.6,C.beam,7);box(x,4.45,z,.62,.68,.62,C.lamp);
    box(x,5.1,z,.85,.17,.85,C.dark);
  }
  function sign(x,y,z,w,h,color){box(x,y,z,w,h,.12,color);}
  function windows(x,y,z,width,count=3){
    for(let i=0;i<count;i++){
      const a=x+(i-(count-1)/2)*(width/count);
      sign(a,y,z,width/count*.62,1.4,C.beam);
      sign(a,y+.11,z+.08,width/count*.52,1.15,C.glass);
      box(a,y+.11,z+.14,.055,1.18,.05,C.paper);
      box(a,y+.17,z+.14,width/count*.55,.06,.05,C.paper);
    }
  }
  function building(x,z,w,d,h,color,roofColor,kind){
    box(x,.08,z,w,h,d,color);roof(x,h+.08,z,w,d,2.2,roofColor);
    const front=z+d/2+.17;
    box(x,.08,front-.1,2.45,2.75,.20,C.beam);
    box(x,.08,front+.04,1.91,2.34,.11,C.wood2);
    box(x+.61,1.35,front+.1,.10,.13,.11,C.lamp);
    windows(x,2.45,front,w,Math.min(4,Math.max(2,Math.round(w/3.7))));
    steps(x,front+1.15);
    box(x,.2,z-d/2-.14,w*.68,1.15,.12,C.beam);
    obstacles.push({x1:x-w/2-.1,x2:x+w/2+.1,z1:z-d/2-.1,z2:z+d/2+.15});
    if(kind==='studio'){
      box(x,4.85,front+.22,w*.74,.85,.14,C.wood2);
      for(let i=0;i<5;i++)box(x-w*.30+i*w*.15,5.02,front+.33,.08,.48,.05,C.paper);
      cylinder(x+w*.31,h+2.25,z-d*.15,.12,4,C.stone,8);
      box(x+w*.31,h+6,z-d*.15,.85,.28,.85,C.dark);
      places.push({x,z:front+4,name:'潮音放送室',desc:'白石澪主持夏日节目的地方'});
    }else if(kind==='bookshop'){
      box(x,2.74,front+.7,w*.82,.24,1.6,C.roof2);
      for(let i=0;i<8;i++)box(x-w*.36+i*w*.102,2.62,front+1.3,.08,.21,.10,C.paper);
      places.push({x,z:front+4,name:'月灯古书店',desc:'月島栞守护着旧书与夏日回忆'});
    }else{
      places.push({x,z:front+3,name:'海街住宅',desc:'盛夏的镰仓街巷'});
    }
  }
  function rail(x,z){
    for(const offset of [-.96,.96]){
      box(x+offset,.15,z,.16,.12,90,C.beam);
    }
    for(let zz=-44;zz<46;zz+=2.7)box(x,.07,zz,3.2,.15,.38,C.wood2);
    for(const xx of [-4.5,4.5]){
      box(x+xx,0,z, .17,4.1,.17,C.beam);
      box(x+xx,3.9,z,1.6,.12,.19,C.beam);
      box(x+xx,4.2,z,.7,.65,.10,C.lamp);
    }
    places.push({x,z,name:'七里滨道口',desc:'电车经过的海街道口'});
  }
  function bench(x,z){box(x,.78,z,2.3,.18,.55,C.wood2);box(x,1.20,z-.20,2.3,.80,.14,C.wood);for(const off of [-.85,.85])box(x+off,0,z,.12,1,.12,C.beam);}
  function npc(id,x,z,body,hair,shirt){
    cylinder(x,.04,z,.34,.88,body,9,.27);
    box(x,1,z,.9,1.1,.58,shirt);
    cylinder(x,1.93,z,.37,.55,C.sandLight,10,.38);
    octa(x,2.50,z,.51,.22,.49,hair);
    box(x,1.55,z+.33,.1,.08,.05,C.dark);
    npcs.push({id,x,z});
  }
  // Distinct fixed regions: blue ocean to the west; sand, waterfront, rail and town.
  box(-53,-.39,0,36,.21,137,C.sea);
  box(-35,-.34,0,5,.12,137,C.sea2);
  box(-28.2,-.27,0,13,.22,137,C.sand);
  box(18,-.30,0,93,.22,137,C.grass);
  box(-24.2,-.10,0,2.8,.16,113,C.paper);
  box(-18,-.08,0,5,.15,120,C.path);
  box(-7,-.08,0,6.8,.17,120,C.asphalt);
  box(17,-.08,0,6,.16,111,C.path);
  box(31,-.08,15,25,.17,4,C.path);
  box(13,-.07,-15,43,.16,4.8,C.path);
  box(37,-.09,25,4.8,.19,37,C.path);
  for(let z=-56;z<58;z+=9)box(-7,.025,z,.13,.05,3,C.paper);
  for(let z=-58;z<59;z+=5.7){
    const wave=z*.48;
    box(-38,-.18,z,.44,.055,1.8,C.foam);
    box(-47+Math.sin(wave)*2,-.18,z+2,.20,.05,1.5,C.sea2);
  }
  rail(-7,0);
  building(20,-25,14,12,6.2,C.wall,C.roof,'studio');
  building(41,25,15,13,5.6,C.brick,C.roof2,'bookshop');
  building(41,-32,11,10,5.0,C.wall2,C.roof2,'house');
  building(42,-9,10,9,4.3,C.paper,C.roof,'house');
  building(2,42,12,9,4.7,C.wall2,C.roof,'house');
  building(25,44,10,8,4.4,C.wall,C.roof2,'house');
  box(-9,.01,0,12,.12,10,C.stone);
  bench(-20,-5);bench(-20,25);bench(17,6);bench(35,8);
  for(let i=0;i<12;i++){
    const z=-53+i*9.5;
    cylinder(-24,0,z,.18,1.1,C.wood,6);
    cylinder(-24,1.05,z,.22,.21,C.wood2,6);
  }
  for(let i=0;i<15;i++){
    const z=-57+i*8;
    if(i%2===0)lantern(10,z);
    else shrub(9,z,1);
  }
  for(const [x,z,s] of [[59,-53,1],[57,-40,1.15],[59,-18,1],[60,2,.9],[60,23,1.1],[59,44,1.2],[50,57,.95],[21,57,1.2],[5,59,.9],[27,10,1], [51,8,.8],[-1,-50,.8]]){
    tree(x,z,s);
  }
  for(const [x,z,s] of [[27,-39,1],[10,-34,.9],[32,-8,.75],[49,39,.9],[48,14,.8],[20,35,.8],[1,30,.7]])shrub(x,z,s);
  for(let i=0;i<55;i++){
    const x=-22+(i*37%75),z=-58+(i*41%114);
    if(x>-12&&x<47&&z>-42&&z<46&&i%4===0)continue;
    const color=i%3===0?C.bloom:C.leaf2;
    cylinder(x,.0,z,.08,.33,color,5,.13);
  }
  // Characters use original palette silhouettes; original 2D portraits are shown in talk overlay.
  npc('nagi',-18,17,C.wood,[.23,.21,.28],[.75,.57,.62]);
  npc('mio',19,-14,C.wood,[.32,.23,.23],[.59,.61,.78]);
  npc('shiori',36,36,C.wood,[.31,.26,.35],[.65,.58,.68]);
  places.push({x:-17,z:17,name:'七里滨 · 海边步道',desc:'向西是海，向东是电台与小镇'});
  places.push({x:0,z:0,name:'海街平交道',desc:'沿着铁轨走进熟悉的夏天'});
  // Boundary stones make the finite play region visually legible.
  for(let k=-64;k<=64;k+=8){box(-33,.0,k,.7,.8,.7,C.stone);box(64,.0,k,.7,.8,.7,C.stone);}
  return {vertices:new Float32Array(vertices),obstacles,npcs,places,bounds:{minX:-31,maxX:63,minZ:-63,maxZ:63},seaX:-25,triangleCount:vertices.length/18};
}
window.MayosAIWorld=Object.freeze({build});
})();