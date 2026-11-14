/* 夏日未寄 — WebGL1 self-contained 3D exploration engine.
 * No third-party engine/CDN is needed, making the map usable in an offline
 * WebView2/Android WebView bundle after those app packages are rebuilt.
 */
(() => {
'use strict';
const $=id=>document.getElementById(id);
const canvas=$('world');
const built=window.MayosAIWorld?.build();
if(!built){$('hint').textContent='3D 模型数据缺失，请重新加载';return;}
const gl=canvas.getContext('webgl',{alpha:false,antialias:true,depth:true,powerPreference:'low-power'});
if(!gl){$('hint').textContent='当前设备未启用 WebGL，请检查 GPU / 浏览器设置';return;}
const vertSource=`
attribute vec3 aPosition;
attribute vec3 aColor;
uniform mat4 uProjection, uView;
uniform vec3 uEye;
varying vec3 vColor;
varying float vDistance;
void main(){
  gl_Position=uProjection*uView*vec4(aPosition,1.0);
  vColor=aColor;
  vDistance=distance(aPosition.xz,uEye.xz);
}`;
const fragSource=`
precision mediump float;
varying vec3 vColor;
varying float vDistance;
void main(){
  float fog=clamp((vDistance-42.0)/105.0,0.0,0.76);
  gl_FragColor=vec4(mix(vColor,vec3(0.62,0.68,0.79),fog),1.0);
}`;
function makeShader(kind,source){
 const shader=gl.createShader(kind);gl.shaderSource(shader,source);gl.compileShader(shader);
 if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader)||'shader compile failed');
 return shader;
}
let program;
try{
 program=gl.createProgram();
 gl.attachShader(program,makeShader(gl.VERTEX_SHADER,vertSource));
 gl.attachShader(program,makeShader(gl.FRAGMENT_SHADER,fragSource));
 gl.linkProgram(program);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)||'shader link failed');
}catch(error){$('hint').textContent='图形引擎初始化失败：'+String(error.message).slice(0,90);return;}
gl.useProgram(program);
const buffer=gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
gl.bufferData(gl.ARRAY_BUFFER,built.vertices,gl.STATIC_DRAW);
for(const [name,offset] of [['aPosition',0],['aColor',12]]){
 const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);
 gl.vertexAttribPointer(loc,3,gl.FLOAT,false,24,offset);
}
const uProjection=gl.getUniformLocation(program,'uProjection');
const uView=gl.getUniformLocation(program,'uView');
const uEye=gl.getUniformLocation(program,'uEye');
gl.enable(gl.DEPTH_TEST);
gl.depthFunc(gl.LEQUAL);
gl.clearColor(.62,.69,.82,1);

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const norm=(v)=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
function projection(fov,ratio,near,far){
 const f=1/Math.tan(fov/2),r=1/(near-far);
 return new Float32Array([f/ratio,0,0,0,0,f,0,0,0,0,(far+near)*r,-1,0,0,2*far*near*r,0]);
}
function view(eye,at){
 const z=norm(eye.map((e,i)=>e-at[i])),x=norm(cross([0,1,0],z)),y=cross(z,x);
 return new Float32Array([
  x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,
  -dot(x,eye),-dot(y,eye),-dot(z,eye),1
 ]);
}
let projectionMatrix=projection(Math.PI/3,1,.08,190);
function resize(){
 const ratio=Math.min(1.75,window.devicePixelRatio||1);
 const width=Math.max(1,Math.floor(canvas.clientWidth*ratio)),height=Math.max(1,Math.floor(canvas.clientHeight*ratio));
 if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;gl.viewport(0,0,width,height);}
 projectionMatrix=projection(Math.PI/3,width/height,.08,190);
}
resize();window.addEventListener('resize',resize,{passive:true});

const world=built.bounds,player={x:-17,z:31,yaw:0,pitch:-.08};
const held=new Set();let paused=false,last=0,lastPlace='',lastNearby=null,toastTimer=null;
const roles={
 nagi:{name:'橘 凪',kana:'TACHIBANA NAGI',occupation:'摄影师',scene:'七里滨的海边',intro:'你走近了正在拍照的橘凪。'},
 mio:{name:'白石 澪',kana:'SHIRAISHI MIO',occupation:'电台节目制作人',scene:'潮音放送室',intro:'你在放送室门口遇见了白石澪。'},
 shiori:{name:'月島 栞',kana:'TSUKISHIMA SHIORI',occupation:'旧书店主理人',scene:'月灯古书店',intro:'月島栞正站在书店门口。'}
};
function nearNpc(){
 let best=null,d=Infinity;
 for(const npc of built.npcs){
  const dist=Math.hypot(player.x-npc.x,player.z-npc.z);
  if(dist<4.4&&dist<d){best=npc;d=dist;}
 }
 return best;
}
function obstructed(x,z){
 if(x<world.minX||x>world.maxX||z<world.minZ||z>world.maxZ||x< -23.6)return true;
 return built.obstacles.some(o=>x>o.x1-.6&&x<o.x2+.6&&z>o.z1-.6&&z<o.z2+.6);
}
function move(dx,dz){
 if(!obstructed(player.x+dx,player.z))player.x+=dx;
 if(!obstructed(player.x,player.z+dz))player.z+=dz;
}
function setView(deltaX,deltaY){
 player.yaw+=deltaX*.004;
 player.pitch=clamp(player.pitch-deltaY*.003,-.83,.83);
}
function toast(msg){
 $('toast').textContent=msg;$('toast').hidden=false;clearTimeout(toastTimer);
 toastTimer=setTimeout(()=>$('toast').hidden=true,3500);
}
function hud(){
 const nearest=nearNpc();
 if(lastNearby?.id!==nearest?.id){lastNearby=nearest;$('touchTalk').disabled=!nearest;}
 $('hint').innerHTML=nearest?
   '<strong>E / 交谈 · '+roles[nearest.id].name+'</strong>':
   (window.matchMedia('(pointer:coarse)').matches?
    '左侧摇杆移动 · 右侧滑动视角':'WASD 移动 · 按住拖动视角 · E 交谈');
 let place=built.places[0],dist=Infinity;
 for(const p of built.places){const d=Math.hypot(player.x-p.x,player.z-p.z);if(d<dist){place=p;dist=d;}}
 if(place.name!==lastPlace){lastPlace=place.name;$('locationName').textContent=place.name;$('locationDesc').textContent=place.desc;}
}
function miniMap(){
 const ctx=$('map').getContext('2d');if(!ctx)return;
 const size=296,convX=x=>(x+70)/140*size,convZ=z=>(z+70)/140*size;
 ctx.clearRect(0,0,size,size);
 ctx.fillStyle='#6f92a5';ctx.fillRect(0,0,85,size);
 ctx.fillStyle='#cbb6a0';ctx.fillRect(85,0,19,size);
 ctx.fillStyle='#829685';ctx.fillRect(104,0,size-104,size);
 ctx.fillStyle='#9b9293';ctx.fillRect(convX(-10),0,15,size);
 ctx.fillRect(convX(16),0,13,size);
 ctx.fillRect(convX(-23),0,9,size);
 ctx.fillRect(convX(11),convZ(-17),70,13);
 ctx.fillRect(convX(30),convZ(14),56,10);
 ctx.strokeStyle='#e4dbcc';ctx.lineWidth=2;ctx.strokeRect(2,2,292,292);
 for(const npc of built.npcs){
  const x=convX(npc.x),y=convZ(npc.z);
  ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fillStyle='#ebd0f1';ctx.fill();
  ctx.lineWidth=1.5;ctx.strokeStyle='#39354e';ctx.stroke();
 }
 const x=convX(player.x),y=convZ(player.z),a=player.yaw;
 ctx.beginPath();ctx.moveTo(x+Math.sin(a)*11,y-Math.cos(a)*11);
 ctx.lineTo(x+Math.cos(a)*6-Math.sin(a)*5,y+Math.sin(a)*6+Math.cos(a)*5);
 ctx.lineTo(x-Math.cos(a)*6-Math.sin(a)*5,y-Math.sin(a)*6+Math.cos(a)*5);
 ctx.closePath();ctx.fillStyle='#fff8ee';ctx.fill();
 ctx.lineWidth=2;ctx.strokeStyle='#323149';ctx.stroke();
}
function frame(now){
 const dt=last?Math.min((now-last)/1000,.06):0;last=now;
 if(!paused){
  let front=0,side=0;
  if(held.has('KeyW')||held.has('ArrowUp'))front++;
  if(held.has('KeyS')||held.has('ArrowDown'))front--;
  if(held.has('KeyD')||held.has('ArrowRight'))side++;
  if(held.has('KeyA')||held.has('ArrowLeft'))side--;
  front+=-stick.y;side+=stick.x;
  const length=Math.hypot(front,side);
  if(length>.02){
   const speed=(held.has('ShiftLeft')?8.1:5.1)*dt/Math.max(1,length);
   const dx=Math.sin(player.yaw)*front+Math.cos(player.yaw)*side;
   const dz=-Math.cos(player.yaw)*front+Math.sin(player.yaw)*side;
   const beforeX=player.x,beforeZ=player.z;
   move(dx*speed,dz*speed);
   if(Math.hypot(beforeX-player.x,beforeZ-player.z)<.0001&&now-lastWall>1500){
     lastWall=now;toast('这里是世界边界或建筑物，请沿道路探索。');
   }
  }
 }
 const eye=[player.x,1.72,player.z];
 const look=[eye[0]+Math.sin(player.yaw)*Math.cos(player.pitch),eye[1]+Math.sin(player.pitch),eye[2]-Math.cos(player.yaw)*Math.cos(player.pitch)];
 gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 gl.uniformMatrix4fv(uProjection,false,projectionMatrix);
 gl.uniformMatrix4fv(uView,false,view(eye,look));
 gl.uniform3f(uEye,eye[0],eye[1],eye[2]);
 gl.drawArrays(gl.TRIANGLES,0,built.vertices.length/6);
 if(now-hudAt>170){hud();miniMap();hudAt=now;}
 requestAnimationFrame(frame);
}
let hudAt=0,lastWall=0;
requestAnimationFrame(frame);

const stick={x:0,y:0};
let drag=null,joyPointer=null;
canvas.addEventListener('pointerdown',e=>{
 if(paused||e.button!==0)return;
 drag={id:e.pointerId,x:e.clientX,y:e.clientY};
 canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove',e=>{
 if(!drag||drag.id!==e.pointerId||paused)return;
 setView(e.clientX-drag.x,e.clientY-drag.y);
 drag.x=e.clientX;drag.y=e.clientY;
});
canvas.addEventListener('pointerup',e=>{if(drag?.id===e.pointerId)drag=null;});
canvas.addEventListener('pointercancel',()=>{drag=null;});
const joy=$('joystick');
function resetStick(){stick.x=0;stick.y=0;$('stick').style.transform='';joyPointer=null;}
function setStick(e){
 const r=joy.getBoundingClientRect(),dx=(e.clientX-(r.left+r.width/2))/(r.width*.40),dy=(e.clientY-(r.top+r.height/2))/(r.height*.40);
 const n=Math.max(1,Math.hypot(dx,dy));
 stick.x=dx/n;stick.y=dy/n;
 $('stick').style.transform='translate('+(stick.x*32)+'px,'+(stick.y*32)+'px)';
}
joy.addEventListener('pointerdown',e=>{if(paused)return;e.preventDefault();joyPointer=e.pointerId;joy.setPointerCapture(e.pointerId);setStick(e);});
joy.addEventListener('pointermove',e=>{if(joyPointer===e.pointerId){e.preventDefault();setStick(e);}});
joy.addEventListener('pointerup',resetStick);joy.addEventListener('pointercancel',resetStick);
function isEditing(){return ['INPUT','TEXTAREA'].includes(document.activeElement?.tagName);}
window.addEventListener('keydown',e=>{
 if(e.code==='Escape'){
  if(!$('about').hidden){$('about').hidden=true;paused=false;}
  else if(!$('talk').hidden)closeTalk();
  return;
 }
 if(paused||isEditing())return;
 if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft'].includes(e.code)){e.preventDefault();held.add(e.code);}
 if(e.code==='KeyE'){e.preventDefault();openTalk();}
});
window.addEventListener('keyup',e=>held.delete(e.code));
window.addEventListener('blur',()=>held.clear());
document.addEventListener('visibilitychange',()=>{if(document.hidden){held.clear();resetStick();}});
$('touchTalk').addEventListener('click',openTalk);
$('guideButton').addEventListener('click',()=>{paused=true;held.clear();$('about').hidden=false;});
$('closeGuide').addEventListener('click',()=>{$('about').hidden=true;paused=false;});
$('closeTalk').addEventListener('click',closeTalk);

let active=null,pending=false,requestId=0,apiKey='',currentRequest=null;
const sessions=new Map();
function setStatus(s){$('aiStatus').textContent=s;}
function closeTalk(){
 $('talk').hidden=true;paused=false;active=null;currentRequest=null;
 $('chatInput').value='';$('keyPanel').hidden=true;held.clear();
}
function openTalk(){
 if(paused)return;
 const near=nearNpc();if(!near){toast('请走近澪、凪或栞后再交谈。');return;}
 active=near.id;paused=true;held.clear();resetStick();
 $('talk').hidden=false;$('npcName').textContent=roles[active].name;
 $('npcKana').textContent=roles[active].kana;
 $('portrait').src='assets/retro/'+active+'-0.webp';$('portrait').alt=roles[active].name;
 $('reply').textContent=roles[active].intro+' 可自由输入回答，也可以让她先说。';
 setStatus('请连接自己的 DeepSeek Key；原版剧情及固定配音仍在原版模式。');
 $('chatInput').focus();
}
function lock(b){pending=b;$('send').disabled=b;$('openTalk').disabled=b;$('chatInput').disabled=b;}
function addResult(text){
 $('reply').textContent=text;
 if(active)window.dispatchEvent(new CustomEvent('mayos:3d-ai-line',{detail:{route:active,text}}));
}
function persona(route){
 const r=roles[route];
 return '你是原创全年龄视觉小说《夏日未寄》中的虚构成年角色'+r.name+'，职业是'+r.occupation+'，现在位于'+r.scene+'。'+
 '你正在镰仓与成年玩家角色在现实场景内面对面交谈。请用自然中文回答，一次只输出1至3句角色对白。'+
 '可主动开启生活话题，不列选择题，不替玩家回答，不伪称是真人。尊重边界，不写露骨或操控性内容。';
}
function nativeHost(){
 if(window.chrome?.webview?.postMessage)return window.chrome.webview;
 if(window.MayosNative?.postMessage)return window.MayosNative;
 return null;
}
function askNative(host,type,route,text){
 return new Promise((resolve,reject)=>{
  const id=++requestId;const request={id,route,type,text};
  const timer=setTimeout(()=>{cleanup();reject(Error('本机 AI 服务连接超时。'));},35000);
  function receive(event){
   let response=event?.data??event;
   if(typeof response==='string'){try{response=JSON.parse(response);}catch{return;}}
   if(response?.id!==id||response.route!==route)return;
   if(response.type==='reply'){cleanup();resolve(String(response.text||''));}
   else if(response.type==='error'){cleanup();reject(Error(String(response.message||'AI 服务错误')));}
  }
  function cleanup(){
   clearTimeout(timer);
   host.removeEventListener?.('message',receive);
   window.removeEventListener('message',receive);
   document.removeEventListener('mayos-native-message',receive);
  }
  host.addEventListener?.('message',receive);
  window.addEventListener('message',receive);
  document.addEventListener('mayos-native-message',receive);
  try {
   const payload=window.chrome?.webview===host?request:JSON.stringify(request);
   host.postMessage(payload);
  }catch(e){cleanup();reject(e);}
 });
}
async function askWeb(type,route,text){
 if(!apiKey)throw Error('请点击「AI 连接」，输入你自己的 DeepSeek API Key。');
 const turns=sessions.get(route)||[];
 const messages=[{role:'system',content:persona(route)},...turns.slice(-12),
  {role:'user',content:type==='proactive'?'请结合眼前的镰仓景色主动开启一个自然话题。':text}];
 const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),32000);
 try{
  const response=await fetch('https://api.deepseek.com/chat/completions',{
   method:'POST',mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',
   headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},
   body:JSON.stringify({model:'deepseek-flash',messages,max_tokens:200,temperature:.8,stream:false}),
   signal:ctl.signal
  });
  if(!response.ok)throw Error('DeepSeek API 错误，HTTP '+response.status);
  const json=await response.json();
  const reply=String(json?.choices?.[0]?.message?.content||'').trim();
  if(!reply)throw Error('AI 返回了空白对白。');
  return reply.slice(0,1000);
 }finally{clearTimeout(timer);}
}
async function speak(proactive){
 if(!active||pending)return;
 const route=active,text=$('chatInput').value.trim();
 if(!proactive&&!text){setStatus('先输入你想说的话。');return;}
 const host=nativeHost();
 if(!host&&!apiKey){$('keyPanel').hidden=false;setStatus('请配置你自己的 DeepSeek API Key。');return;}
 lock(true);setStatus('正在生成角色对白…');
 if(!proactive)$('chatInput').value='';
 try{
  const response=host?await askNative(host,proactive?'proactive':'chat',route,text):await askWeb(proactive?'proactive':'chat',route,text);
  if(active!==route)return;
  addResult(response);
  const turns=sessions.get(route)||[];
  if(!proactive)turns.push({role:'user',content:text});
  turns.push({role:'assistant',content:response});
  sessions.set(route,turns.slice(-12));
  setStatus('对白已生成 · 可以继续自由输入');
 }catch(err){
  if(active===route){setStatus(String(err?.message||'对话失败，请稍后重试。').slice(0,170));if(!proactive)$('chatInput').value=text;}
 }finally{lock(false);}
}
$('chatForm').addEventListener('submit',e=>{e.preventDefault();void speak(false);});
$('openTalk').addEventListener('click',()=>void speak(true));
$('chatInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void speak(false);}});
$('setupKey').addEventListener('click',()=>{$('keyPanel').hidden=!$('keyPanel').hidden;});
$('saveKey').addEventListener('click',()=>{
 const input=$('apiKey');const key=input.value.trim();
 if(key.length<18){setStatus('请填写有效的 API Key。');return;}
 apiKey=key;input.value='';$('keyPanel').hidden=true;setStatus('本次页面已连接 Key；不会保存到存档或磁盘。');
});
$('clearKey').addEventListener('click',()=>{apiKey='';$('apiKey').value='';setStatus('本次 API Key 已清除。');});
window.addEventListener('pagehide',()=>{apiKey='';$('apiKey').value='';});
})();