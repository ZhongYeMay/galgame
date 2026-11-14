/* 夏日未寄 — Original-art 3D projection: precision scene geometry
 * The original 1920x1080 AI-painted artwork is projected onto a modeled
 * world from a reference camera. At that reference view every surface samples
 * the exact pixel from the existing 2D illustration; movement introduces
 * authentic parallax. Every architectural detail is deterministic geometry.
 * Original 2D files are never modified or replaced.
 */
(function(){
'use strict';
const PAL={
 wood:[.28,.20,.34],darkWood:[.18,.14,.29],paper:[.89,.76,.85],
 purple:[.48,.37,.63],floor:[.38,.31,.53],roof:[.29,.30,.49],
 sea:[.39,.33,.75],stone:[.48,.42,.57],wall:[.66,.58,.74],
 glass:[.47,.48,.73],ink:[.20,.19,.32],metal:[.26,.25,.41],
 gold:[.95,.69,.54],green:[.29,.36,.38],bloom:[.83,.46,.78],leaf:[.28,.42,.35],white:[.94,.85,.88]
};
function create(zone) {
 const data=[],colliders=[],interactions=[];
 const c=(a)=>PAL[a]||a;
 function vertex(p,col,n){data.push(p[0],p[1],p[2],col[0],col[1],col[2],n[0],n[1],n[2]);}
 function tri(a,b,d,col,n){const k=c(col);vertex(a,k,n);vertex(b,k,n);vertex(d,k,n);}
 function quad(a,b,d,e,col,n){tri(a,b,d,col,n);tri(a,d,e,col,n);}
 function box(x,y,z,w,h,d,color){
  const l=x-w/2,r=x+w/2,b=y,t=y+h,front=z+d/2,back=z-d/2;
  quad([l,b,front],[r,b,front],[r,t,front],[l,t,front],color,[0,0,1]);
  quad([r,b,back],[l,b,back],[l,t,back],[r,t,back],color,[0,0,-1]);
  quad([l,b,back],[l,b,front],[l,t,front],[l,t,back],color,[-1,0,0]);
  quad([r,b,front],[r,b,back],[r,t,back],[r,t,front],color,[1,0,0]);
  quad([l,t,front],[r,t,front],[r,t,back],[l,t,back],color,[0,1,0]);
  quad([l,b,back],[r,b,back],[r,b,front],[l,b,front],color,[0,-1,0]);
 }
 function column(x,y,z,r,h,color,sides=14){
  const top=[],bottom=[];
  for(let i=0;i<sides;i++){const a=2*Math.PI*i/sides;top.push([x+r*Math.cos(a),y+h,z+r*Math.sin(a)]);bottom.push([x+r*Math.cos(a),y,z+r*Math.sin(a)]);}
  for(let i=0;i<sides;i++)quad(bottom[i],bottom[(i+1)%sides],top[(i+1)%sides],top[i],color,[Math.cos(i*2*Math.PI/sides),0,Math.sin(i*2*Math.PI/sides)]);
  for(let i=1;i<sides-1;i++)tri(top[0],top[i],top[i+1],color,[0,1,0]);
 }
 function beam(a,b,r,col,sides=10){
  const [ax,ay,az]=a,[bx,by,bz]=b,dir=[bx-ax,by-ay,bz-az],length=Math.hypot(...dir)||1;
  const t=dir.map(v=>v/length);
  let ref=Math.abs(t[1])<.9?[0,1,0]:[1,0,0];
  const u=[ref[1]*t[2]-ref[2]*t[1],ref[2]*t[0]-ref[0]*t[2],ref[0]*t[1]-ref[1]*t[0]];
  const un=Math.hypot(...u)||1;for(let i=0;i<3;i++)u[i]/=un;
  const v=[t[1]*u[2]-t[2]*u[1],t[2]*u[0]-t[0]*u[2],t[0]*u[1]-t[1]*u[0]];
  for(let i=0;i<sides;i++){
   const phi=i*2*Math.PI/sides,psi=(i+1)*2*Math.PI/sides;
   const p=(base,angle)=>base.map((q,j)=>q+r*(Math.cos(angle)*u[j]+Math.sin(angle)*v[j]));
   const n=u.map((q,j)=>Math.cos(phi)*q+Math.sin(phi)*v[j]);
   quad(p(a,phi),p(a,psi),p(b,psi),p(b,phi),col,n);
  }
 }
 function plankFloor(x,z,w,d,color,size=.62){
  for(let i=0;i<Math.ceil(d/size);i++){
   const zi=z-d/2+size*(i+.5);
   box(x,.005,zi,w,.025,Math.min(size-.014,d-i*size),color);
   for(let j=0;j<Math.ceil(w/2.1);j++){
     const px=x-w/2+j*2.1+(i%2)*.52;
     if(px<x+w/2-.12)box(px,.03,zi,.021,.008,Math.min(size-.035,d-i*size),'ink');
   }
  }
 }
 function japaneseRoof(x,y,z,w,d,colour='roof'){
  const pitch=1.75,e=.52;
  for(let s of [-1,1]){
   const xx=x+s*(w/2+e),peak=x;
   quad([peak,y+pitch,z-d/2-e],[xx,y,z-d/2-e],[xx,y,z+d/2+e],[peak,y+pitch,z+d/2+e],colour,[s*.55,.9,0]);
   // Individually modeled fine roof ribs/tiles instead of a single flat slab.
   for(let i=0;i<=Math.floor(d/.42);i++){
     const zz=z-d/2-e+i*.42;
     beam([peak,y+pitch+.035,zz],[xx,y+.03,zz],.035,'darkWood',6);
   }
   for(let i=1;i<=Math.floor((w/2+e)/.38);i++){
     const f=i*.38/(w/2+e),xx1=x+s*f*(w/2+e),yy=y+pitch*(1-f);
     beam([xx1,yy+.04,z-d/2-e],[xx1,yy+.04,z+d/2+e],.025,'purple',5);
   }
  }
  beam([x,y+pitch+.04,z-d/2-e],[x,y+pitch+.04,z+d/2+e],.12,'darkWood');
 }
 function woodenHouse(x,z,w,d,h){
  box(x,0,z,w,h,d,'wall');
  for(let i=0;i<Math.ceil(w/1.65);i++){
    const a=x-w/2+i*w/Math.ceil(w/1.65);
    box(a,0,z+d/2+.07,.12,h,.15,'darkWood');
  }
  for(let i=0;i<Math.ceil(d/1.65);i++){
    const zz=z-d/2+i*d/Math.ceil(d/1.65);
    box(x+w/2+.07,0,zz,.15,h,.12,'darkWood');
  }
  for(let y=1.2;y<h-.2;y+=1.35){
    box(x,y,z+d/2+.07,w,.11,.17,'darkWood');
    box(x+w/2+.07,y,z,.17,.11,d,'darkWood');
  }
  japaneseRoof(x,h,z,w,d);
  const front=z+d/2+.12;
  for(let i=0;i<4;i++){
    const xx=x-w*.36+i*w*.24;
    box(xx,.93,front+.10,w*.19,1.65,.11,'glass');
    box(xx,.88,front+.18,w*.19,.11,.11,'darkWood');
    box(xx,2.02,front+.18,w*.19,.11,.11,'darkWood');
    box(xx,1.4,front+.18,.07,1.56,.11,'darkWood');
  }
  box(x,.07,front+.3,1.55,2.6,.12,'wood');
  box(x+.45,1.22,front+.42,.08,.08,.09,'gold');
  colliders.push({x1:x-w/2-.42,x2:x+w/2+.42,z1:z-d/2-.4,z2:z+d/2+.48});
 }
 function railing(x,zStart,zEnd,spacing=2.1){
   for(let z=zStart;z<=zEnd;z+=spacing){
      box(x,0,z,.25,1.28,.25,'stone');
      box(x,1.26,z,.32,.1,.33,'white');
   }
   for(let y of [.48,.95])beam([x,y,zStart],[x,y,zEnd],.055,'metal',8);
 }
 function hydrangea(x,z,r=1){
   // Dense cluster built from tiny overlapping petals and foliage.
   column(x,0,z,.06,.72,'wood',7);
   for(let j=0;j<8;j++){
     const a=j*Math.PI*2/8;
     const xx=x+Math.cos(a)*r*.45,zz=z+Math.sin(a)*r*.46;
     for(let k=0;k<5;k++){
       const p=a+k*1.2566;
       const leafX=xx+Math.cos(p)*r*.48,leafZ=zz+Math.sin(p)*r*.48;
       box(leafX,.24+Math.abs(Math.sin(k*3))*r*.2,leafZ,r*.36,.045,r*.22,'leaf');
     }
   }
   for(let i=0;i<22;i++){
     const a=i*2.39996,fac=Math.sqrt((i+.5)/22),px=x+Math.cos(a)*r*fac*.74,pz=z+Math.sin(a)*r*fac*.7,py=.8+Math.sin(i*1.8)*r*.2;
     for(let p=0;p<5;p++){
       const th=p*Math.PI*2/5;const xx=px+Math.cos(th)*r*.12,zz=pz+Math.sin(th)*r*.12;
       box(xx,py,zz,r*.16,.035,r*.16,p%3===0?'purple':'bloom');
     }
   }
 }
 function tree(x,z,scale=1){
  column(x,0,z,.24*scale,3.5*scale,'wood',12);
  for(let i=0;i<15;i++){
    const a=i*2.39,ys=2.7+(i%5)*.61,rad=1.2+(i%3)*.41;
    beam([x,ys*.63*scale,z],[x+Math.cos(a)*rad*scale,ys*scale,z+Math.sin(a)*rad*scale],.085*scale,'wood',6);
    for(let j=0;j<7;j++){
      const t=a+j*.88,rr=.65*scale;
      box(x+Math.cos(a)*rad*scale+Math.cos(t)*rr,ys*scale+Math.sin(j*1.2)*.16*scale,z+Math.sin(a)*rad*scale+Math.sin(t)*rr,.35*scale,.07,.28*scale,j%2?'leaf':'green');
    }
  }
 }
 function lamp(x,y,z,scale=1){
  column(x,y,z,.06*scale,.5*scale,'metal',12);
  column(x,y+.48*scale,z,.28*scale,.07*scale,'gold',16);
  column(x,y+.55*scale,z,.45*scale,.35*scale,'paper',18);
  column(x,y+.9*scale,z,.49*scale,.09*scale,'metal',18);
 }
 function studio(){
  const bounds={minX:-7.3,maxX:7.3,minZ:-11.3,maxZ:12.4};
  box(0,-.4,-2,15,.35,27,'floor');plankFloor(0,-2,14.4,25.5,'floor',.56);
  box(0,0,-13.5,15,8,.22,'wall');
  box(-7.5,0,-1,.22,8,26,'wall');box(7.5,0,-1,.22,8,26,'wall');
  box(0,7.3,-1,15,.20,26,'darkWood');
  for(let x=-7.1;x<=7.1;x+=3.4)beam([x,7.25,-13.5],[x,7.25,12],.16,'darkWood');
  for(let z=-13;z<13;z+=2.25)beam([-7.4,7.22,z],[7.4,7.22,z],.08,'wood');
  // Original broad seaward window with layered sash, mullions and curtain rails.
  box(0,2.4,-13.38,12.6,4.2,.12,'glass');
  for(let x=-6;x<=6.1;x+=2)box(x,2.35,-13.24,.10,4.35,.17,'darkWood');
  for(let y=2.35;y<=6.6;y+=1.44)box(0,y,-13.24,12.75,.08,.17,'darkWood');
  for(let x of [-6.55,6.55]){
   box(x,2.38,-13.1,.66,4.24,.18,'paper');
   for(let i=0;i<16;i++)box(x+.16*Math.sin(i),2.45+i*.24,-12.98,.20,.035,.06,'purple');
  }
  // Matching left broadcasting desk, analog audio rack and shelf detail.
  box(-4.5,.02,4,6.3,.84,3.7,'wood');
  box(-4.5,.88,4,6.4,.15,3.85,'darkWood');
  box(-4.4,1.05,3.7,3.7,.43,1.9,'metal');
  for(let k=0;k<11;k++){const x=-6.0+k*.3;box(x,1.50,3.7,.05,.025,.40,'white');column(x,1.48,3.5,.04,.11,'gold',8);}
  for(let j=0;j<6;j++)box(-7.0+j*.37,.94,5.65,.24,.08,.41,j%2?'paper':'glass');
  for(let n=0;n<5;n++)box(-6.5+((n%2)*.11),1.7+n*.54,-9.2,1.82,.42,1.1,'wood');
  for(let j=0;j<92;j++){
    const shelf=j%5,order=(j/5)|0;
    box(-6.6+((j%19)*.105),2.18+shelf*.55,-8.58,.07,.25+(j%3)*.08,.18,j%3?'paper':'purple');
  }
  // Radio microphone, pop filter, table lamp and chair: fully spatial.
  column(-3.4,.9,3.7,.12,.9,'metal',12);
  beam([-3.4,1.75,3.7],[-3.65,2.3,3.45],.07,'metal',10);
  column(-3.65,2.1,3.45,.18,.54,'metal',18);
  column(-3.65,2.6,3.45,.28,.12,'paper',18);
  lamp(-6.2,.98,5.12,.9);
  box(-2,.35,7.1,1.7,.42,1.1,'wood');box(-2,1.0,7.5,1.7,1.75,.22,'purple');
  for(let x of [-2.65,-1.35])box(x,0,7.3,.13,1.24,.16,'metal');
  box(5.95,.22,-8,1.9,.82,3.4,'purple');
  for(let i=0;i<2;i++)box(5.95,.58,-8.65+i*1.2,1.92,.13,1.03,'paper');
  for(let i=0;i<34;i++){const x=1+(i%17)*.31,y=1+(i/17|0)*.35;box(x,y,-13.03,.18,.31,.14,i%3?'wood':'purple');}
  lamp(0,5.2,2.2,1.5);
  hydrangea(4.8,-11.3,.48);
  interactions.push({id:'mio',x:3.5,z:-6.9});
  return bounds;
 }
 function bookshop(){
  const bounds={minX:-8,maxX:8,minZ:-11.3,maxZ:12.4};
  box(0,-.4,-2,16,.35,27,'floor');plankFloor(0,-2,15.5,25.5,'wood',.45);
  box(0,0,-13.5,16,8,.15,'wall');box(-8,0,-1,.25,8,25,'wall');
  box(8,0,-1,.25,8,25,'wood');
  box(0,7.35,-1,16,.2,26,'darkWood');
  for(let x=-7.7;x<8;x+=3.15)beam([x,7.1,-13.3],[x,7.1,12],.14,'darkWood');
  for(let z=-13;z<13;z+=2.6)beam([-7.8,7.05,z],[7.8,7.05,z],.12,'wood');
  // Shōji screen, precise mullions, book racks and volume-by-volume spines.
  box(-4.4,2.4,-13.31,6.6,4.2,.13,'glass');
  for(let x=-7.5;x<-1.2;x+=.9)box(x,2.35,-13.17,.06,4.3,.10,'darkWood');
  for(let y=2.4;y<6.8;y+=1.07)box(-4.35,y,-13.16,6.75,.07,.09,'darkWood');
  box(3.2,.2,-13.25,6.1,5.8,.16,'paper');
  for(let x=.3;x<6.4;x+=.94)box(x,.18,-13.10,.12,5.95,.12,'darkWood');
  for(let y=.18;y<6.0;y+=.71)box(3.2,y,-13.09,6.15,.09,.12,'darkWood');
  for(let row=0;row<5;row++){
    const y=.5+row*1.22;
    box(7.1,y,-1.0,.7,.14,19,'darkWood');
    box(6.8,y+.2,-1.1,.10,.95,19,'wood');
    for(let j=0;j<41;j++){
      const z=-10.0+j*.47;
      box(6.70,y+.15,z,.31,.68+(j%4)*.08,.26,j%5===0?'purple':j%3===0?'paper':'wood');
    }
  }
  for(let row=0;row<3;row++){
    const y=.65+row*1.3;
    box(-.2,y,-6.3,4.8,.15,.95,'wood');
    for(let j=0;j<38;j++)box(-2.3+j*.11,y+.15,-6.28,.07,.74+(j%4)*.11,.30,j%3?'paper':'purple');
  }
  box(-3.9,.12,4.3,5.1,.78,3.2,'wood');
  box(-3.9,.9,4.3,5.2,.16,3.3,'darkWood');
  for(let i=0;i<7;i++)box(-5.75+i*.24,1.05,4.8,.21,.16,1.2,i%3?'paper':'purple');
  for(let xx of [-3.2,-2.1]){column(xx,1.05,4.0,.20,.35,'paper',16);column(xx,1.39,4.0,.24,.10,'wood',16);}
  lamp(-6.0,1.1,4.7,1.25);
  box(-2.1,0,6,1.4,1.0,1.2,'wood');box(-2.1,1.1,6.45,1.45,1.6,.13,'wood');
  hydrangea(-6.5,-9.5,.42);
  interactions.push({id:'shiori',x:2.4,z:-6.1});
  return bounds;
 }
 function coast(){
  const bounds={minX:-11,maxX:11,minZ:-31,maxZ:13.2};
  // Ground, shoreline, atmospheric horizon.
  box(0,-.7,-10,24,.7,105,'floor');
  box(11.5,-.77,-11,8.5,.72,106,'sea');
  for(let j=0;j<9;j++){
    const z=-48+j*8.7;
    beam([8.1,-.05,z],[12.8,-.06,z-.7],.044,'white',10);
    beam([9.1,-.03,z+1.3],[13,-.04,z+1.0],.04,'paper',9);
  }
  for(let x=-11;x<11;x+=.82){
     // Individual paved stones and fine scored seams
     box(x,0,0,.028,.008,68,'ink');
  }
  for(let z=-30;z<14;z+=.72)box(0,.012,z,22,.008,.018,'stone');
  // Coastal railway, sleepers, overhead power and detailed crossing signal.
  for(const x of [-4.7,-3.3])beam([x,.12,-50],[x,.12,12],.074,'metal',10);
  for(let z=-50;z<14;z+=.59)box(-4,.0,z,2.9,.1,.17,'wood');
  for(let z=-49;z<13;z+=7.8){
    column(-5.7,0,z,.12,5.9,'metal',12);
    beam([-5.7,5.35,z],[-3.2,5.35,z],.067,'metal',9);
    for(const xx of [-5.4,-3.7])beam([xx,5.28,z],[xx,6.1,z],.035,'darkWood',8);
  }
  for(const x of [-5.6,-3.4])beam([x,6.0,-50],[x,6.0,12],.018,'metal',7);
  column(-2.7,.02,-11,.20,4.5,'gold',12);
  for(let i=0;i<8;i++)box(-2.7,.25+i*.52,-11.02,.42,.26,.42,i%2?'darkWood':'gold');
  // Precise crossing diagonal cross and pair of signals
  beam([-4.0,4.15,-10.8],[-1.15,1.6,-10.8],.16,'gold',8);
  beam([-4.0,1.6,-10.8],[-1.15,4.15,-10.8],.16,'gold',8);
  for(let x of [-3.45,-2]){column(x,2.5,-10.65,.28,.19,'ink',14);column(x,2.5,-10.48,.17,.07,'gold',16);}
  beam([-2.7,1.55,-11],[5.8,1.55,-11],.13,'gold');
  for(let x=-2.3;x<5.8;x+=.7)box(x,1.49,-11.05,.28,.12,.14,'darkWood');
  railing(8,-38,13,1.9);
  japaneseRoof(-8,5.8,-23,7,15,'roof');
  woodenHouse(-10,-22,8,14,6.0);
  tree(-9,-7.5,1.5);
  for(let j=0;j<18;j++){
    const z=-5+(j%9)*1.7,x=-9.2+(j/9|0)*1.2;
    hydrangea(x,z,.4+.16*(j%3));
  }
  // Warning beacon and nearby shop details.
  box(-8.6,0,-12.1,1.05,2.4,.65,'stone');
  column(-8.6,2.48,-12.1,.27,.35,'metal');
  for(let z=-29;z<13;z+=5.1)box(8.1,.08,z,.18,.12,1.2,'paper');
  interactions.push({id:'nagi',x:2.5,z:-4.2});
  return bounds;
 }
 let bounds;
 if(zone==='studio')bounds=studio();
 else if(zone==='bookshop')bounds=bookshop();
 else bounds=coast();
 // Distant panorama plane: ensures reference view is the exact original art.
 // It is a real object in 3D, not an HTML fallback replacing the WebGL scene.
 box(0,-55,-73,210,113,.05,'purple');
 return {vertices:new Float32Array(data),colliders,interactions,bounds,zone,triangles:data.length/27};
}
window.MayosSceneGeometry=Object.freeze({create});
})();