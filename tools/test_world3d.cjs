/* Offline regression tests for the AI-authored Kamakura 3D scene. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const site=path.join(__dirname,'..','site');
const models=fs.readFileSync(path.join(site,'world3d-models.js'),'utf8');
const engine=fs.readFileSync(path.join(site,'world3d.js'),'utf8');
const html=fs.readFileSync(path.join(site,'world3d.html'),'utf8');
new vm.Script(engine,{filename:'world3d.js'});
const context={window:{}};
vm.runInNewContext(models,context,{filename:'world3d-models.js'});
assert.equal(typeof context.window.MayosAIWorld.build,'function');
const result=context.window.MayosAIWorld.build();
assert.equal(result.vertices.length%18,0,'triangle vertices are multiples of 18 floats');
assert.ok(result.triangleCount>1000,'scene has 3D triangle meshes');
assert.ok(Array.from(result.vertices).every(Number.isFinite),'all model vertices are finite');
assert.ok(result.npcs.length===3,'all heroines have world positions');
assert.deepEqual([...result.npcs.map(n=>n.id)].sort(),['mio','nagi','shiori']);
assert.ok(result.obstacles.length>=3,'building colliders are present');
assert.ok(result.bounds.minX<result.bounds.maxX&&result.bounds.minZ<result.bounds.maxZ);
assert.ok(result.places.some(p=>p.name.includes('放送室')));
assert.ok(result.places.some(p=>p.name.includes('书店')));
assert.ok(html.includes('src="world3d-models.js"')&&html.includes('src="world3d.js"'));
assert.ok(!engine.includes('cdn.jsdelivr.net')&&!engine.includes('unpkg.com'),'renderer can load offline');
assert.ok(fs.readFileSync(path.join(site,'index.html'),'utf8').includes('world3d.html'));
const copy=context.window.MayosAIWorld.build();
assert.deepEqual(Array.from(result.vertices),Array.from(copy.vertices),'3D world is deterministic');
console.log('3D world OK: '+result.triangleCount+' triangles, '+result.npcs.length+' NPCs, '+result.obstacles.length+' colliders.');

/* Fidelity lock: real 2D assets and the original UI are mandatory. */
const refinedPath=path.join(site,'world3d-identity.js');
const refined=fs.readFileSync(refinedPath,'utf8');
new vm.Script(refined,{filename:'world3d-identity.js'});
assert.match(html,/href="style\.css[^"]*"/,'3D mode must share original 2D CSS');
assert.match(html,/id="playerPanel"/,'3D mode must use the original dialogue layout');
assert.match(html,/id="sprite"/,'3D mode must reuse original character sprites');
assert.match(html,/src="world3d-identity\.js"/,'original-art renderer must be loaded');
assert.match(html,/src="character-voice\.js[^"]*"/,'original character voice adapter reused');
assert.match(html,/src="fish-voice\.js[^"]*"/,'existing Fish Audio mode reused');
assert.doesNotMatch(html,/src="world3d-models\.js"/,'do not show old blocky placeholder assets');
assert.match(refined,/assets\/retro\/[^']*name\+'\.webp'/,'original painted scene textures');
assert.match(refined,/mode:'original-art-depth-projection'/,'3D re-projection must be clearly described');

/* Browser initialization regression: minimal mocked WebGL, event DOM, image
 * decoding and requestAnimationFrame. This tests actual top-level behavior and
 * one render call, not just static JS syntax. Real GPU QA is separate. */
function fakeWebGL(){
  const calls={draws:0};
  const ctx=new Proxy({}, {get(_target,key){
    if(key==='getShaderParameter'||key==='getProgramParameter')return ()=>true;
    if(key==='getAttribLocation')return (_p,name)=>name==='aPosition'?0:1;
    if(['createShader','createProgram','createBuffer','createTexture'].includes(key))
      return ()=>({});
    if(key==='drawArrays')return ()=>{calls.draws++;};
    if(key==='getUniformLocation')return ()=>({});
    return ()=>undefined;
  }});
  return {ctx,calls};
}
const {ctx,calls}=fakeWebGL();
const elements=new Map(),frames=[];
function element(id){
  if(!elements.has(id))elements.set(id,{
    id,hidden:['playerPanel','modal','keyButtons','mobileGate'].includes(id),
    dataset:{},value:'',src:'',textContent:'',width:1600,height:900,
    style:{setProperty(){},transform:''},
    classList:{toggle(){}},setAttribute(){},addEventListener(){},
    setPointerCapture(){},focus(){},replaceChildren(){},append(){},
    getContext(){return ctx}
  });
  return elements.get(id);
}
const documentMock={
  getElementById:element,querySelectorAll:()=>[],addEventListener(){},
  documentElement:{requestFullscreen:async()=>{}}
};
const windowMock={addEventListener(){},visualViewport:null,chrome:null,MayosNative:null};
class FakeImage {
  set src(value){this._src=value;if(typeof this.onload==='function')this.onload();}
  get src(){return this._src;}
}
const browser={
  window:windowMock,document:documentMock,Image:FakeImage,innerWidth:1600,innerHeight:900,
  matchMedia:()=>({matches:false}),
  requestAnimationFrame:fn=>(frames.push(fn),frames.length),
  setTimeout:()=>1,clearTimeout(){},
  screen:{orientation:{lock:async()=>{}}},
  location:{href:''},getComputedStyle:()=>({getPropertyValue:()=>1}),
  fetch:()=>{throw Error('automated renderer test must never use network');},
  Event:class Event{},CustomEvent:class CustomEvent{},AbortController:class AbortController{}
};
vm.runInNewContext(refined,browser,{filename:'world3d-identity.js',timeout:5000});
assert.equal(typeof windowMock.Mayos3DWorld?.getState,'function');
assert.equal(windowMock.Mayos3DWorld.getState().scene,'coast');
windowMock.Mayos3DWorld.selectScene('studio');
assert.equal(windowMock.Mayos3DWorld.getState().scene,'studio');
windowMock.Mayos3DWorld.selectScene('bookshop');
assert.equal(windowMock.Mayos3DWorld.getState().scene,'bookshop');
assert.equal(windowMock.Mayos3DWorld.getState().triangles,27456);
assert.ok(frames.length>=1,'render loop starts');
frames[0](1000);
assert.ok(calls.draws>=1,'GPU draw commands submitted');
console.log('2D art fidelity OK: original textures/UI/voices used; 3D initialization and frame submission pass.');
