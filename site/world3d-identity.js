/* 夏日未寄 · 原画一致性 3D 探索引擎
 * Keeps the ORIGINAL game scene paintings, character PNG/WebP art, original
 * style.css UI and original voice adapters. An AI-authored depth mesh projects
 * each unchanged painted image into genuine WebGL 3D space.
 *
 * This is an image-based 3D exploration prototype, NOT a claim that unseen
 * building interiors or full-angle character meshes have been reconstructed.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('worldCanvas');
  const status = $('worldStatus');
  const stage = $('stage');
  const originalBackground = $('background');
  const scenes = Object.freeze({
    coast: {
      title: '七里ヶ浜 · 海边道口', chapter: '海风寄来的信',
      info: '海边步道、旧平交道与电车。原画中的道路已具备有限深度。',
      npc: 'nagi', npcDepth: 5.5, x: -0.65,
      boundaries: {x: 2.5, back: 1.5, forward: -2.5},
      prompt: '沿着海滨步道靠近凪，就能开始自由交谈。'
    },
    studio: {
      title: '鎌倉 · 潮音放送室', chapter: '没有收信人的声音',
      info: '录音台、磁带机、木质地板和朝海的窗户，沿用原版放送室原画。',
      npc: 'mio', npcDepth: 5.8, x: 0.5,
      boundaries: {x: 1.8, back: 0.65, forward: -2.2},
      prompt: '靠近窗边的澪，与她谈谈今天的广播。'
    },
    bookshop: {
      title: '長谷 · 月灯古书店', chapter: '书页间的月光',
      info: '书架、木桌、灯光与窗外晚霞，沿用原版古书店原画。',
      npc: 'shiori', npcDepth: 5.6, x: 0.4,
      boundaries: {x: 1.75, back: 0.65, forward: -2.15},
      prompt: '走近书店里的栞，自由地开始一段对话。'
    }
  });
  const characters = Object.freeze({
    mio: {name: '白石 澪', kana: 'SHIRAISHI MIO', occupation: '镰仓海边电台的节目制作人'},
    nagi: {name: '橘 凪', kana: 'TACHIBANA NAGI', occupation: '回乡拍摄的自由摄影师'},
    shiori: {name: '月島 栞', kana: 'TSUKISHIMA SHIORI', occupation: '月灯古书店主理人'}
  });
  const sceneKeys = Object.keys(scenes);
  let current = 'coast';
  let player = {x: 0, z: 0, yaw: 0, pitch: 0};
  let talking = false, pending = false, key = '', messageNumber = 0, activeRequest = null;
  let lastFrame = 0, prevHint = '', notificationTimer = 0, voiceGesture = false;
  const held = new Set(), histories = Object.create(null), joystick = {x: 0, y: 0};
  let drag = null, touchId = null, unlocked = false;
  const pointerFine = () => !matchMedia('(pointer:coarse)').matches;

  function say(text, duration = 3400) {
    status.textContent = String(text);
    status.hidden = false;
    clearTimeout(notificationTimer);
    notificationTimer = setTimeout(() => {status.hidden = true;}, duration);
  }
  function clamp(v, a, b) {return Math.max(a, Math.min(b, v));}
  function smoothstep(a, b, v) {
    const x = clamp((v - a) / (b - a), 0, 1);
    return x*x*(3-2*x);
  }
  function distanceToCharacter() {
    const s = scenes[current];
    return Math.hypot(player.x - s.x, player.z + s.npcDepth);
  }
  function interactable() {return distanceToCharacter() < 4.35;}
  function updateHint() {
    const text = talking ? '' : interactable()
      ? 'E / 交谈 · ' + characters[scenes[current].npc].name
      : (pointerFine() ? 'WASD 移动 · 拖动转动镜头' : '左侧摇杆移动 · 右侧滑动视角');
    if (text === prevHint) return;
    prevHint = text;
    $('hudHint').innerHTML = text + '<span class="sub">原版美术 · 固定场景 · 靠近人物后自由输入</span>';
    $('mobileInteract').disabled = !interactable();
  }
  function updateFit() {
    const w = innerWidth, h = innerHeight;
    const portraitMobile = !pointerFine() && w < h;
    const rotated = portraitMobile && unlocked;
    const scale = Math.min((rotated ? h : w) / 1600, (rotated ? w : h) / 900);
    stage.style.setProperty('--scale', scale);
    stage.classList.toggle('rotated', rotated);
    if (!unlocked && portraitMobile) {
      $('mobileGate').hidden = false;
    } else {
      $('mobileGate').hidden = true;
    }
  }
  window.addEventListener('resize', updateFit);
  window.addEventListener('orientationchange', updateFit);
  window.visualViewport?.addEventListener('resize', updateFit);
  updateFit();
  $('enterMobileBtn').onclick = async () => {
    unlocked = true;
    try {
      await document.documentElement.requestFullscreen?.();
      try {await screen.orientation.lock('landscape');} catch (_) {}
    } catch (_) {}
    updateFit();
  };
  async function fullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (_) {
      say('当前浏览器不允许自动全屏，请使用浏览器全屏功能。');
    }
  }
  $('fullButton').onclick = fullscreen;
  $('exitButton').onclick = $('backToStory').onclick = $('returnStoryBtn').onclick =
    () => { location.href = './'; };

  // Original WebP paintings are the texture source; no screenshots, alternate
  // character drawings, fake asset model renders, or low-poly blocks are used.
  const gl = canvas.getContext('webgl', {
    alpha: true, antialias: true, depth: true, premultipliedAlpha: false,
    powerPreference: 'default'
  });
  let program = null, meshBuffer = null, imageTexture = null, characterTexture = null;
  let meshCount = 0, positions = null, geometry = null, textureReady = false, spriteReady = false;
  let uniforms = null, attrPosition = -1, attrUV = -1;
  const aspect = 1600 / 900, fov = Math.PI / 3;
  const ident = (a = 0) => new Float32Array(a ? a : 16);
  function shader(type, text) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, text);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) || 'shader error');
    }
    return sh;
  }
  function normalize(v) {
    const n = Math.hypot(...v) || 1;
    return v.map(x => x/n);
  }
  function dot(a, b) {return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
  function cross(a, b) {
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  }
  function projection() {
    const near = .08, far = 130, f = 1 / Math.tan(fov/2), r = 1/(near-far);
    return new Float32Array([
      f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*r,-1,
      0,0,2*far*near*r,0
    ]);
  }
  function view(eye, target) {
    const z = normalize(eye.map((v, i) => v-target[i]));
    const x = normalize(cross([0,1,0], z)), y = cross(z,x);
    return new Float32Array([
      x[0],y[0],z[0],0, x[1],y[1],z[1],0,
      x[2],y[2],z[2],0, -dot(x,eye),-dot(y,eye),-dot(z,eye),1
    ]);
  }
  if (gl) {
    try {
      program = gl.createProgram();
      gl.attachShader(program, shader(gl.VERTEX_SHADER, [
        'attribute vec3 aPosition;', 'attribute vec2 aUV;',
        'uniform mat4 uProjection;', 'uniform mat4 uView;',
        'varying vec3 vProjectiveUV;',
        'void main() { float d=max(0.1,-aPosition.z); vProjectiveUV=vec3(aUV*d,d); gl_Position=uProjection*uView*vec4(aPosition,1.0); }'
      ].join('\n')));
      gl.attachShader(program, shader(gl.FRAGMENT_SHADER, [
        'precision mediump float;', 'uniform sampler2D uTexture;',
        'varying vec3 vProjectiveUV;', 'void main() {',
        'vec2 uv=vProjectiveUV.xy/max(vProjectiveUV.z,0.001);', 'vec4 color=texture2D(uTexture,uv);',
        'if (color.a<0.08) discard;', 'gl_FragColor=color;', '}'
      ].join('\n')));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program,gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || 'link error');
      }
      gl.useProgram(program);
      attrPosition = gl.getAttribLocation(program, 'aPosition');
      attrUV = gl.getAttribLocation(program, 'aUV');
      uniforms = {
        proj: gl.getUniformLocation(program,'uProjection'),
        view: gl.getUniformLocation(program,'uView'),
        tex: gl.getUniformLocation(program,'uTexture')
      };
      meshBuffer=gl.createBuffer();
      imageTexture=gl.createTexture();
      characterTexture=gl.createTexture();
      gl.enableVertexAttribArray(attrPosition);
      gl.enableVertexAttribArray(attrUV);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0,0,0,0);
    } catch (error) {
      program = null;
      say('3D 图形驱动不可用；已保留原版 2D 场景图。'+error.message,6000);
    }
  } else {
    say('当前 WebView 不支持 WebGL。仍可查看原版场景和角色立绘。',6500);
  }
  function newTexture() {
    const tex=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    return tex;
  }
  function upload(image, texture) {
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  }
  // A manually art-directed image-depth mesh. The original artwork remains
  // visually pixel-aligned at the authored camera position. Motion changes
  // the view using perspective-correct textured triangles rather than zoom.
  function depth(u, v, name) {
    if (name === 'coast') {
      const ground = smoothstep(.40,.80,v);
      let d = 75*(1-ground) + (3.5+17*(1-v))*ground;
      const house = (1-smoothstep(.22,.40,u))*(1-smoothstep(.36,.69,v));
      d = d*(1-house)+Math.min(d,6.8)*house;
      const rail = smoothstep(.18,.35,u)*(1-smoothstep(.54,.80,u))*smoothstep(.37,.66,v);
      d = d*(1-.50*rail)+7.5*.50*rail;
      return clamp(d,3.4,75);
    }
    const base = name === 'studio' ? 14 : 13;
    const floor = smoothstep(.43,.76,v);
    let d = base*(1-floor)+(2.9+5.3*(1-v))*floor;
    const nearLeft = (1-smoothstep(.28,.53,u))*smoothstep(.43,.68,v);
    d = d*(1-nearLeft)+Math.min(d,4.5)*nearLeft;
    const nearRight = smoothstep(.70,.92,u)*smoothstep(.34,.65,v);
    d = d*(1-nearRight)+Math.min(d,5.3)*nearRight;
    return clamp(d,2.9,base);
  }
  function buildMesh(name) {
    // Subdivide ORIGINAL pixels densely to retain their gradients, reflections,
    // railings, furniture, and delicate outlines. No crude box replacement.
    const nx = 156, ny = 88, a = [];
    const tan = Math.tan(fov/2);
    function vertex(u,v) {
      const d=depth(u,v,name);
      a.push((u*2-1)*d*tan*aspect,(1-v*2)*d*tan+1.66,-d,u,1-v);
    }
    for (let y=0;y<ny;y++) for (let x=0;x<nx;x++) {
      const u=x/nx, v=y/ny, u2=(x+1)/nx, v2=(y+1)/ny;
      vertex(u,v);vertex(u,v2);vertex(u2,v2);
      vertex(u,v);vertex(u2,v2);vertex(u2,v);
    }
    return new Float32Array(a);
  }
  let assetGeneration=0;
  function switchScene(name) {
    if (!scenes[name]) return;
    closeTalk(false);
    current=name;
    player={x:0,z:0,yaw:0,pitch:0};
    const scene=scenes[name], generation=++assetGeneration;
    $('sceneLabel').textContent=scene.title;
    $('chapterName').textContent=scene.chapter;
    $('description').textContent=scene.info;
    $('sceneTransitions').hidden=true;
    $('placesButton').setAttribute('aria-expanded','false');
    $('background').style.backgroundImage='url("assets/retro/'+name+'.webp")';
    document.querySelectorAll('#sceneTransitions [data-zone]').forEach(btn => {
      btn.classList.toggle('active',btn.dataset.zone===name);
      btn.setAttribute('aria-pressed',String(btn.dataset.zone===name));
    });
    prevHint='';
    updateHint();
    textureReady=false;spriteReady=false;
    if (!program) return;
    const next=buildMesh(name);
    geometry=next;
    gl.bindBuffer(gl.ARRAY_BUFFER,meshBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,geometry,gl.STATIC_DRAW);
    meshCount=geometry.length/5;
    const sceneImage=new Image();
    sceneImage.onload=()=> {
      if (generation!==assetGeneration)return;
      try {upload(sceneImage,imageTexture);textureReady=true;} catch(error) {say('原版场景贴图无法载入：'+error.message);}
    };
    sceneImage.onerror=()=> {
      if (generation===assetGeneration)say('场景原画加载失败，保留 2D 回退画面。');
    };
    sceneImage.src='assets/retro/'+name+'.webp';
    const spriteImage=new Image();
    spriteImage.onload=()=>{
      if (generation!==assetGeneration)return;
      try {upload(spriteImage,characterTexture);spriteReady=true;}catch(error){say('人物原画贴图加载失败：'+error.message);}
    };
    spriteImage.src='assets/retro/'+scene.npc+'-0.webp';
  }
  function togglePlaces(force) {
    const menu=$('sceneTransitions');
    const open=typeof force==='boolean'?force:menu.hidden;
    menu.hidden=!open;
    $('placesButton').setAttribute('aria-expanded',String(open));
  }
  $('placesButton').onclick=()=>togglePlaces();
  for (const button of document.querySelectorAll('[data-zone]')) {
    button.addEventListener('click', () => switchScene(button.dataset.zone));
  }
  function setupAttrib(buffer) {
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.vertexAttribPointer(attrPosition,3,gl.FLOAT,false,20,0);
    gl.vertexAttribPointer(attrUV,2,gl.FLOAT,false,20,12);
  }
  const billboardBuffer=program?gl.createBuffer():null;
  function drawBillboard() {
    if (!spriteReady || talking) return;
    const s=scenes[current], z=-s.npcDepth, x=s.x, w=1.85, h=3.7;
    // The 2D character painting is shown as a spatial vertical billboard;
    // the same character sprite is used again in the original dialogue UI.
    const data=new Float32Array([
      x-w/2,0,z,0,0, x+w/2,0,z,1,0, x+w/2,h,z,1,1,
      x-w/2,0,z,0,0, x+w/2,h,z,1,1, x-w/2,h,z,0,1
    ]);
    gl.bindBuffer(gl.ARRAY_BUFFER,billboardBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
    setupAttrib(billboardBuffer);
    gl.bindTexture(gl.TEXTURE_2D,characterTexture);
    // Alpha character art should appear over scenery, like the 2D version.
    gl.disable(gl.DEPTH_TEST);
    gl.drawArrays(gl.TRIANGLES,0,6);
    gl.enable(gl.DEPTH_TEST);
  }
  function render() {
    if (!program || !textureReady) return;
    gl.viewport(0,0,canvas.width,canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);
    const eye=[player.x,1.66,player.z];
    const forward=[
      Math.sin(player.yaw)*Math.cos(player.pitch),
      Math.sin(player.pitch),
      -Math.cos(player.yaw)*Math.cos(player.pitch)
    ];
    const target=eye.map((v,i)=>v+forward[i]);
    gl.uniformMatrix4fv(uniforms.proj,false,projection());
    gl.uniformMatrix4fv(uniforms.view,false,view(eye,target));
    gl.uniform1i(uniforms.tex,0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,imageTexture);
    setupAttrib(meshBuffer);
    gl.drawArrays(gl.TRIANGLES,0,meshCount);
    drawBillboard();
  }
  function move(dt) {
    if (talking || !$('mobileGate').hidden) return;
    const f=(held.has('KeyW')||held.has('ArrowUp')?1:0)-(held.has('KeyS')||held.has('ArrowDown')?1:0)-joystick.y;
    const s=(held.has('KeyD')||held.has('ArrowRight')?1:0)-(held.has('KeyA')||held.has('ArrowLeft')?1:0)+joystick.x;
    const len=Math.hypot(f,s);
    if (len<.05) return;
    const speed=(held.has('ShiftLeft')?2.3:1.40)*dt/Math.max(1,len);
    const dx=(f*Math.sin(player.yaw)+s*Math.cos(player.yaw))*speed;
    const dz=(-f*Math.cos(player.yaw)+s*Math.sin(player.yaw))*speed;
    const boundary=scenes[current].boundaries;
    const x=clamp(player.x+dx,-boundary.x,boundary.x);
    const z=clamp(player.z+dz,boundary.forward,boundary.back);
    if (x===player.x&&z===player.z) return;
    player.x=x;player.z=z;
  }
  function frame(now) {
    const dt=lastFrame?Math.min(.055,(now-lastFrame)/1000):0;
    lastFrame=now;
    move(dt);
    updateHint();
    render();
    requestAnimationFrame(frame);
  }
  switchScene('coast');
  requestAnimationFrame(frame);

  function rotate(dx,dy) {
    if(talking)return;
    player.yaw=clamp(player.yaw+dx*.0028,-.65,.65);
    player.pitch=clamp(player.pitch-dy*.0028,-.28,.28);
  }
  function localDrag(e) {
    // Stage uses transform:scale for original 1600x900 coordinate system;
    // normalize pointer movement to stage coordinates.
    const scale=parseFloat(getComputedStyle(stage).getPropertyValue('--scale'))||1;
    return {dx:e.movementX/scale,dy:e.movementY/scale};
  }
  canvas.addEventListener('pointerdown',e=>{
    if(talking || e.button!==0)return;
    drag={id:e.pointerId,x:e.clientX,y:e.clientY};
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{
    if(!drag||e.pointerId!==drag.id)return;
    const scale=parseFloat(getComputedStyle(stage).getPropertyValue('--scale'))||1;
    rotate((e.clientX-drag.x)/scale,(e.clientY-drag.y)/scale);
    drag.x=e.clientX;drag.y=e.clientY;
  });
  canvas.addEventListener('pointerup',e=>{if(drag?.id===e.pointerId)drag=null;});
  canvas.addEventListener('pointercancel',()=>{drag=null;});
  const pad=$('mobilePad');
  function resetPad() {
    touchId=null;joystick.x=joystick.y=0;$('mobileStick').style.transform='';
  }
  function movePad(e) {
    const rect=pad.getBoundingClientRect();
    const x=(e.clientX-rect.left-rect.width/2)/(rect.width*.42);
    const y=(e.clientY-rect.top-rect.height/2)/(rect.height*.42);
    const k=Math.max(1,Math.hypot(x,y));
    joystick.x=x/k;joystick.y=y/k;
    $('mobileStick').style.transform='translate('+(joystick.x*34)+'px,'+(joystick.y*34)+'px)';
  }
  pad.addEventListener('pointerdown',e=>{
    if(talking)return;
    e.preventDefault();touchId=e.pointerId;
    pad.setPointerCapture(e.pointerId);movePad(e);
  });
  pad.addEventListener('pointermove',e=>{
    if(e.pointerId===touchId){e.preventDefault();movePad(e);}
  });
  pad.addEventListener('pointerup',resetPad);
  pad.addEventListener('pointercancel',resetPad);
  function editing() {return ['TEXTAREA','INPUT'].includes(document.activeElement?.tagName);}
  window.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&talking){e.preventDefault();closeTalk();return;}
    if(e.key==='Escape'&&!$('sceneTransitions').hidden){e.preventDefault();togglePlaces(false);return;}
    if(talking||editing())return;
    if(e.code==='KeyM'){e.preventDefault();togglePlaces();return;}
    if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft'].includes(e.code)){
      e.preventDefault();held.add(e.code);
    }
    if(e.code==='KeyE'){e.preventDefault();openTalk();}
  });
  window.addEventListener('keyup',e=>held.delete(e.code));
  window.addEventListener('blur',()=>{held.clear();resetPad();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){held.clear();resetPad();}});
  $('mobileInteract').addEventListener('click',openTalk);

  function setChatStatus(t) {$('chatStatus').textContent=String(t);}
  function lock(b) {
    pending=b;
    $('sendBtn').disabled=b;
    $('firstBtn').disabled=b;
    $('replyInput').disabled=b;
  }
  function displayLine(text, who) {
    $('speakerName').textContent=who||characters[scenes[current].npc].name;
    $('speakerKana').textContent=who==='你'?'YOU / PLAYER':characters[scenes[current].npc].kana;
    $('dialogueText').textContent=text;
    const turns=histories[scenes[current].npc]||[];
    $('lineInfo').textContent=String(turns.length+1).padStart(2,'0')+' / FREE TALK';
  }
  function openTalk() {
    if(talking)return;
    if(!interactable()){say('走近角色才能交谈。');return;}
    talking=true;held.clear();resetPad();
    $('playerPanel').hidden=false;
    const id=scenes[current].npc,person=characters[id];
    $('sprite').src='assets/retro/'+id+'-0.webp';
    $('sprite').alt=person.name;
    displayLine('你在这里遇到了'+person.name+'。你可以自己输入想说的话，也可以请她主动开口。',person.name);
    setChatStatus('AI 自由对话：需要连接 DeepSeek。未连接时不会生成假台词。');
    $('replyInput').focus();
    updateHint();
  }
  function closeTalk(notify=true) {
    if(!talking)return;
    talking=false;held.clear();resetPad();
    $('playerPanel').hidden=true;
    $('keyButtons').hidden=true;
    $('replyInput').value='';
    window.dispatchEvent(new Event('mayos:ai-exit'));
    updateHint();
    if(notify)say('已结束交谈，返回自由探索。',1900);
  }
  $('leaveTalkBtn').onclick=()=>closeTalk();
  $('clearChatBtn').onclick=()=>{
    histories[scenes[current].npc]=[];
    displayLine('新的话题已经开始。',characters[scenes[current].npc].name);
    setChatStatus('对话上下文已清空，可以请她主动开口。');
  };
  $('keyBtn').onclick=()=>{
    const native=window.chrome?.webview || window.MayosNative;
    if(native?.postMessage){
      try {native.postMessage(window.chrome?.webview===native?{type:'set-key',id:++messageNumber,route:scenes[current].npc}:
        JSON.stringify({type:'set-key',id:++messageNumber,route:scenes[current].npc}));}
      catch(error) {setChatStatus('打开原生密钥设置失败：'+error.message);}
    } else {
      $('keyButtons').hidden=!$('keyButtons').hidden;
    }
  };
  $('keySaveBtn').onclick=()=>{
    const value=$('keyInput').value.trim();
    $('keyInput').value='';
    if(value.length<18){setChatStatus('请填写有效的 DeepSeek API Key。');return;}
    key=value;
    $('keyButtons').hidden=true;
    setChatStatus('DeepSeek 已配置。本次浏览器内存使用，不保存到存档、网址或日志。');
  };
  $('keyClearBtn').onclick=()=>{
    key='';$('keyInput').value='';
    setChatStatus('当前页面内存中的 DeepSeek Key 已清除。');
  };
  function characterPrompt(route) {
    const s=scenes[current],r=characters[route];
    return '你是原创全年龄游戏《夏日未寄》中的虚构成年女性'+r.name+'，'+r.occupation+'。'+
      '地点：'+s.title+'。请保持原版人物背景、性格和场景，不凭空改变她的身份、服装或地点。'+
      '只输出角色自己的1到3句自然中文对白，可以主动发起日常话题，不要预设选项，不替玩家作答。'+
      '避免露骨、强迫、情感操控和排他依赖。';
  }
  async function webReply(type,route,userText) {
    if(!key)throw new Error('尚未配置 DeepSeek Key，请点击「AI 连接」。');
    const previous=histories[route]||[];
    const messages=[
      {role:'system',content:characterPrompt(route)},
      ...previous.slice(-12),
      {role:'user',content:type==='proactive'
        ? '请自然地根据眼前场景开始一个轻松话题，让我可以自由回应。' : userText}
    ];
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),35000);
    try {
      const response=await fetch('https://api.deepseek.com/chat/completions',{
        method:'POST',mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},
        body:JSON.stringify({model:'deepseek-flash',max_tokens:240,temperature:.85,
          stream:false,messages}),
        signal:controller.signal
      });
      if(!response.ok)throw new Error('AI 接口请求失败（HTTP '+response.status+'）。');
      const json=await response.json(), answer=json?.choices?.[0]?.message?.content;
      if(typeof answer!=='string'||!answer.trim())throw new Error('AI 返回了空白对白。');
      return answer.trim().slice(0,1200);
    } finally {clearTimeout(timer);}
  }
  function nativeReply(host,type,route,text) {
    return new Promise((resolve,reject)=>{
      const id=++messageNumber;
      const timeout=setTimeout(()=>{cleanup();reject(new Error('原生 AI 服务没有响应。'));},35000);
      const req={type,route,text,id};
      function handler(event) {
        let data=event?.data??event;
        if(typeof data==='string'){try{data=JSON.parse(data);}catch(_){return;}}
        if(data?.id!==id||data.route!==route)return;
        if(data.type==='reply'){cleanup();resolve(String(data.text||''));}
        else if(data.type==='error'){cleanup();reject(new Error(data.message||'AI 服务出错'));}
      }
      function cleanup() {
        clearTimeout(timeout);
        host.removeEventListener?.('message',handler);
        window.removeEventListener('message',handler);
        document.removeEventListener('mayos-native-message',handler);
      }
      host.addEventListener?.('message',handler);
      window.addEventListener('message',handler);
      document.addEventListener('mayos-native-message',handler);
      try {
        host.postMessage(window.chrome?.webview===host?req:JSON.stringify(req));
      }catch(error){cleanup();reject(error);}
    });
  }
  async function speak(proactive=false) {
    if(pending||!talking)return;
    const text=$('replyInput').value.trim(), route=scenes[current].npc;
    if(!proactive&&!text){setChatStatus('请输入自己的回答。');return;}
    const host=window.chrome?.webview || window.MayosNative;
    if(!host?.postMessage&&!key) {
      $('keyButtons').hidden=false;
      setChatStatus('连接 DeepSeek 后，才能生成真实 AI 对白。');
      return;
    }
    lock(true);
    setChatStatus('正在生成女主对白…');
    if(!proactive)$('replyInput').value='';
    try {
      const reply=host?.postMessage
        ? await nativeReply(host,proactive?'proactive':'chat',route,text)
        : await webReply(proactive?'proactive':'chat',route,text);
      if(!talking||scenes[current].npc!==route)return;
      displayLine(reply,characters[route].name);
      const turns=histories[route]||[];
      if(!proactive)turns.push({role:'user',content:text});
      turns.push({role:'assistant',content:reply});
      histories[route]=turns.slice(-12);
      setChatStatus('生成完成。继续自由输入，或让她主动说话。');
      window.dispatchEvent(new CustomEvent('mayos:ai-reply',{detail:{route,text:reply}}));
    } catch (error) {
      if(!talking||scenes[current].npc!==route)return;
      if(!proactive)$('replyInput').value=text;
      setChatStatus(error?.name==='AbortError'
        ? 'AI 请求超时，请检查网络。'
        : String(error?.message||'AI 对话失败。').slice(0,200));
    } finally {lock(false);}
  }
  $('sendBtn').onclick=()=>void speak(false);
  $('firstBtn').onclick=()=>void speak(true);
  $('replyInput').addEventListener('keydown',e=>{
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void speak(false);}
  });
  window.addEventListener('pagehide',()=>{
    key='';$('keyInput').value='';histories.mio=histories.nagi=histories.shiori=[];
  });

  // Hooks for the *original* voice UI and configuration panel are installed
  // in site/character-voice.js and site/fish-voice.js, preserving its controls.
  window.openSettings = function() {
    $('modal').hidden=false;
    $('modalTitle').textContent='夏天的偏好';
    $('modalEn').textContent='CONFIGURATION / 環境設定';
    $('modalBody').replaceChildren();
    const section=document.createElement('div');
    section.className='settings-grid';
    $('modalBody').append(section);
    const voice=document.createElement('div');
    voice.className='setting';
    voice.innerHTML='<div>原版美术投影<small>使用 2D 原画生成固定范围的 3D 深度网格，未生成全角度高精度 GLB</small></div>';
    section.append(voice);
  };
  window.closeModal = ()=>{$('modal').hidden=true;};
  $('configButton').onclick=()=>window.openSettings();
  $('closeModalButton').onclick=()=>window.closeModal();
  $('modal').addEventListener('click',e=>{if(e.target===$('modal'))window.closeModal();});
  window.Mayos3DWorld=Object.freeze({
    getState:()=>({scene:current,position:{...player},interactable:interactable(),
      mode:'original-art-depth-projection',triangles:156*88*2,
      imageSource:'site/assets/retro/*.webp'}),
    selectScene: name=>switchScene(name)
  });
})();
