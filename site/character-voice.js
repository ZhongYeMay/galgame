/* Character voice for 夏日未寄.
 *
 * NO window.speechSynthesis, no system/default read-aloud and no imitation
 * of real people. Each fictional heroine has a specific Kokoro Chinese
 * neural voice preset. All synthesis happens on the player's own device.
 *
 * This optional model is large. It is never downloaded until the player
 * clicks VOICE or Preview. If unsupported, dialogue stays silent.
 */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const CONFIG={
    mio:    {voice:'zf_021',speed:0.95,name:'白石 澪',style:'沉静、认真'},
    nagi:   {voice:'zf_070',speed:1.08,name:'橘 凪',style:'明亮、爽朗'},
    shiori: {voice:'zf_083',speed:0.91,name:'月島 栞',style:'温柔、舒缓'}
  };
  const MODEL='onnx-community/Kokoro-82M-v1.1-zh-ONNX';
  const VOICE_PATH='https://huggingface.co/onnx-community/Kokoro-82M-v1.1-zh-ONNX/resolve/main/voices';
  const LIB='https://esm.sh/@uzen/kokoro-js@1.2.4?bundle';
  const previews={
    mio:'「你真的回来了。欢迎回到潮音放送室。」',
    nagi:'「站住！别动。今天的海风，特别适合拍照。」',
    shiori:'「欢迎回来。坐下喝杯热茶，再慢慢说吧。」'
  };

  let enabled=false,engine=null,loading=null,volume=.85;
  let revision=0,player=null,currentUrl=null;
  const isIOS=/iPad|iPhone|iPod/i.test(navigator.userAgent)||
    (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  let voiceAudioContext=null,voiceAudioSource=null,voiceGain=null;
  let audioUnlocked=false,pendingAudio=null;
  function updateUnlockButton(){
    const unlock=$('voiceAudioUnlock');
    if(unlock)unlock.hidden=!isIOS||audioUnlocked;
  }
  function unlockAudio(){
    // Must execute directly from a trusted click/tap: asynchronous TTS
    // generation loses iOS's transient playback authorization.
    if(!isIOS){audioUnlocked=true;return;}
    const AudioContextCtor=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextCtor){notify('此浏览器不支持角色语音播放。');return;}
    try{
      if(!voiceAudioContext){
        voiceAudioContext=new AudioContextCtor();
        voiceGain=voiceAudioContext.createGain();
        voiceGain.gain.value=volume;
        voiceGain.connect(voiceAudioContext.destination);
      }
      // A silent frame, scheduled DURING the click, unlocks Web Audio
      // without switching to robotic speech or audible placeholder voices.
      const silent=voiceAudioContext.createBuffer(1,1,voiceAudioContext.sampleRate);
      const source=voiceAudioContext.createBufferSource();
      source.buffer=silent;source.connect(voiceGain);source.start(0);
      void voiceAudioContext.resume().then(()=>{
        audioUnlocked=voiceAudioContext.state==='running';
        updateUnlockButton();
        if(audioUnlocked&&pendingAudio){
          const queued=pendingAudio;pendingAudio=null;
          void playBlobAudio(queued.blob,queued.revision,queued.who);
        }
      }).catch(()=>{
        audioUnlocked=false;updateUnlockButton();
      });
    }catch(error){
      audioUnlocked=false;updateUnlockButton();
      console.warn('[夏日未寄/VOICE] Safari audio unlock:',error);
    }
  }
  function showUnlock(){
    if(!isIOS)return;
    audioUnlocked=false;
    updateUnlockButton();
    notify('iPhone 浏览器要求手动启用声音，请点击「启用声音」后播放。');
  }
  async function playBlobAudio(blob,ownRevision,who){
    if(isIOS){
      if(!voiceAudioContext||voiceAudioContext.state!=='running'){
        pendingAudio={blob,revision:ownRevision,who};
        showUnlock();return false;
      }
      const buffer=await voiceAudioContext.decodeAudioData(await blob.arrayBuffer());
      if(ownRevision!==revision)return false;
      const source=voiceAudioContext.createBufferSource();
      source.buffer=buffer;
      source.connect(voiceGain);
      voiceAudioSource=source;
      source.onended=()=>{if(ownRevision===revision)stop();};
      source.start(0);
      hasPlayedOnce=true;signal('playing',{who});
      return true;
    }
    currentUrl=URL.createObjectURL(blob);
    player=new Audio(currentUrl);
    player.volume=volume;
    player.preload='auto';
    player.onended=()=>{if(ownRevision===revision)stop();};
    player.onerror=()=>{if(ownRevision===revision){stop();notify('这一句的角色音频无法播放。');}};
    try{await player.play();}
    catch(_){
      if(ownRevision===revision)notify('浏览器拦截了音频播放，请再点击试听。');
      return false;
    }
    if(ownRevision===revision){hasPlayedOnce=true;signal('playing',{who});}
    return true;
  }
  let lastNode='',waitingForVoice=false,hasPlayedOnce=false;
  let lastError='';
  let backendDescription='';
  const listeners=[];
  // Display true per-file download progress. Do not mislabel the last file
  // reaching 100% as the whole neural model being ready.
  const progressState={active:false,percent:null,kind:'',label:'',detail:''};
  let aggregateProgress=false,progressHideTimer=null;
  function percentOf(info){
    if(Number.isFinite(info?.progress))return Math.max(0,Math.min(100,info.progress));
    if(Number.isFinite(info?.loaded)&&Number.isFinite(info?.total)&&info.total>0)
      return Math.max(0,Math.min(100,info.loaded/info.total*100));
    return null;
  }
  function shortFile(name){
    return String(name||'').split('/').pop().split('\\').pop().slice(0,55)||'语音模型文件';
  }
  function progressUpdate(kind,label,percent=null,detail='',active=true){
    progressState.active=active;
    progressState.kind=kind;
    progressState.label=label;
    progressState.percent=Number.isFinite(percent)?percent:null;
    progressState.detail=detail;
    for(const container of document.querySelectorAll('[data-voice-progress]')){
      container.hidden=!active;
      const title=container.querySelector('[data-voice-progress-label]');
      const current=container.querySelector('[data-voice-progress-percent]');
      const line=container.querySelector('[data-voice-progress-fill]');
      const track=container.querySelector('[role=progressbar]');
      const foot=container.querySelector('[data-voice-progress-detail]');
      if(title)title.textContent=label;
      if(current)current.textContent=progressState.percent===null?'':Math.round(progressState.percent)+'%';
      if(foot)foot.textContent=detail;
      if(track){
        track.classList.toggle('indeterminate',progressState.percent===null);
        if(progressState.percent===null)track.removeAttribute('aria-valuenow');
        else track.setAttribute('aria-valuenow',String(Math.round(progressState.percent)));
        track.setAttribute('aria-valuetext',progressState.percent===null?
          label:(kind==='total'?'总下载进度 ':'当前文件 ')+Math.round(progressState.percent)+'%');
      }
      if(line)line.style.width=progressState.percent===null?'38%':progressState.percent+'%';
    }
    signal('progress',{progress:{...progressState}});
  }
  function receiveProgress(info){
    if(!info||typeof info!=='object')return;
    const pct=percentOf(info);
    if(info.status==='progress_total'&&pct!==null){
      aggregateProgress=true;
      progressUpdate('total','模型文件下载中',pct,
        Number.isFinite(info.loaded)&&Number.isFinite(info.total)?
        (info.loaded/1048576).toFixed(1)+' / '+(info.total/1048576).toFixed(1)+' MB':'整体下载进度');
      return;
    }
    if(aggregateProgress)return;
    if(info.status==='progress'&&pct!==null){
      progressUpdate('file','下载：'+shortFile(info.file),pct,
        '当前文件进度（不是整个模型）');
    }else if(info.status==='download'||info.status==='initiate'){
      progressUpdate('initializing','准备：'+shortFile(info.file),null,'正在连接模型资源…');
    }else if(info.status==='done'||info.status==='ready'){
      progressUpdate('initializing','正在准备角色声音',null,'下载完成的文件正在初始化…');
    }
  }
  function createProgress(container,id){
    if(!container)return;
    const panel=document.createElement('section');
    panel.id=id;
    panel.className=id==='voiceLoadOverlay'?'voice-load-overlay':'voice-load-settings';
    panel.dataset.voiceProgress='';
    panel.hidden=!progressState.active;
    panel.setAttribute('aria-label','角色自然声音加载状态');
    const heading=document.createElement('div');
    heading.className='voice-load-heading';
    const label=document.createElement('span');label.dataset.voiceProgressLabel='';
    const pct=document.createElement('strong');pct.dataset.voiceProgressPercent='';
    heading.append(label,pct);
    const bar=document.createElement('div');
    bar.className='voice-load-track indeterminate';
    bar.setAttribute('role','progressbar');
    bar.setAttribute('aria-label','语音模型加载进度');
    bar.setAttribute('aria-valuemin','0');
    bar.setAttribute('aria-valuemax','100');
    const fill=document.createElement('div');fill.className='voice-load-fill';
    fill.dataset.voiceProgressFill='';bar.append(fill);
    const detail=document.createElement('small');detail.dataset.voiceProgressDetail='';
    panel.append(heading,bar,detail);
    container.append(panel);
    return panel;
  }
  function renderProgressState(){
    progressUpdate(progressState.kind,progressState.label,
      progressState.percent,progressState.detail,progressState.active);
  }
  function beginProgress(){
    clearTimeout(progressHideTimer);
    aggregateProgress=false;
    progressUpdate('initializing','正在加载角色声音',null,'检查设备并准备自然语音引擎…');
  }
  function explainError(error){
    const raw=String(error?.message||error||'未知错误');
    if(/out.of.memory|memory.*(alloc|limit)|allocation failed/i.test(raw))
      return '设备内存不足，无法初始化角色语音模型。';
    if(/cache|quota|storage/i.test(raw))
      return '浏览器存储空间不足或缓存失败，请释放站点空间后重试。';
    if(/failed to fetch|network|timeout|http|404|403|cors/i.test(raw))
      return '模型资源下载失败，请检查网络或模型服务可用性。';
    if(/webgpu|adapter/i.test(raw))
      return '设备的 GPU 不支持该语音后端，已尝试兼容模式。';
    return '自然语音引擎初始化失败：'+raw.slice(0,145);
  }
  async function selectVoiceBackend(){
    // navigator.gpu merely existing does NOT mean an adapter is available;
    // older implementation downloaded the GPU model needlessly, then
    // retried a 324 MB fp32 model which failed in low-storage browsers.
    const isMobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if(!isMobile&&navigator.gpu?.requestAdapter){
      try{
        const adapter=await Promise.race([
          navigator.gpu.requestAdapter({powerPreference:'low-power'}),
          new Promise(resolve=>setTimeout(()=>resolve(null),2500))
        ]);
        if(adapter?.features?.has('shader-f16')){
          backendDescription='WebGPU · q4f16（约 166 MB）';
          return {device:'webgpu',dtype:'q4f16'};
        }
      }catch(_){}
    }
    backendDescription='WebAssembly · q8（约 127 MB）';
    return {device:'wasm',dtype:'q8'};
  }
  function endProgress(ok){
    if(ok){
      progressUpdate('ready','角色语音已就绪',100,backendDescription+' · 可以播放自然配音');
    }else{
      progressUpdate('error','声音加载失败',null,lastError||'请检查网络后重试');
    }
    clearTimeout(progressHideTimer);
    // Failure stays visible until the next retry; users should not have
    // to guess what went wrong after the overlay disappears.
    if(ok)progressHideTimer=setTimeout(()=>progressUpdate('', '', null, '', false),3300);
  }

  function signal(type,extra={}) {
    const event={type,enabled,ready:!!engine,loading:!!loading,error:lastError,...extra};
    for(const fn of listeners)try{fn(event)}catch(_){}
    document.dispatchEvent(new CustomEvent('mayos:voice-status',{detail:event}));
  }
  function stop(){
    revision++;
    pendingAudio=null;
    if(voiceAudioSource){
      const src=voiceAudioSource;voiceAudioSource=null;
      src.onended=null;try{src.stop();}catch(_){}
      try{src.disconnect();}catch(_){}
    }
    if(player){player.pause();player.onended=null;player.onerror=null;player.src='';player=null;}
    if(currentUrl){URL.revokeObjectURL(currentUrl);currentUrl=null;}
    signal('stop');
  }
  function notify(text) {
    const toast=$('toast');if(!toast)return;
    toast.textContent=text;toast.hidden=false;
    clearTimeout(notify.timer);notify.timer=setTimeout(()=>toast.hidden=true,4600);
  }
  function clean(text){
    return String(text||'')
      .replace(/[「」『』“”]/g,'')
      .replace(/\s+/g,' ')
      .trim()
      .slice(0,450);
  }
  function voiceForSpeaker(who,route){
    const role=CONFIG[route];
    if(!role||role.name!==who)return null;
    return role;
  }
  async function ensureModel(){
    if(engine)return engine;
    if(loading)return loading;
    lastError='';
    beginProgress();
    loading=(async()=>{
      // Browser-only, no script registered as a system/default voice.
      if(!('WebAssembly' in window))throw new Error('此浏览器不支持神经语音推理。');
      const module=await import(LIB);
      if(typeof module.KokoroTTS?.from_pretrained!=='function')
        throw new Error('角色声音模块未加载成功。');
      const backend=await selectVoiceBackend();
      progressUpdate('initializing','正在初始化神经语音',null,backendDescription);
      const options={
        ...backend,
        voicePath:VOICE_PATH,
        progress_callback:receiveProgress
      };
      try{
        engine=await module.KokoroTTS.from_pretrained(MODEL,options);
      }catch(error){
        if(backend.device!=='webgpu')throw error;
        // A real adapter may still reject a particular driver/runtime.
        // Fall back to 127 MB q8, NEVER the previous 324 MB fp32 download.
        aggregateProgress=false;
        backendDescription='WebAssembly · q8（约 127 MB）';
        progressUpdate('initializing','切换到兼容语音模型',null,backendDescription);
        engine=await module.KokoroTTS.from_pretrained(MODEL,{
          device:'wasm',dtype:'q8',voicePath:VOICE_PATH,
          progress_callback:receiveProgress
        });
      }
      return engine;
    })();
    signal('loading');
    try{
      const result=await loading;
      endProgress(true);
      return result;
    }catch(error){
      lastError=explainError(error);
      console.warn('[夏日未寄/VOICE] 角色语音加载失败:',error);
      endProgress(false);
      signal('error');
      throw error;
    }finally{
      loading=null;signal('loaded');
    }
  }
  async function playText(who,text,route,force=false){
    const info=voiceForSpeaker(who,route);
    stop();
    const ownRevision=revision;
    if(!info||(!enabled&&!force))return false;
    const words=clean(text);
    if(!words)return false;
    try{
      const tts=await ensureModel();
      if(ownRevision!==revision||(!enabled&&!force))return false;
      const output=await tts.generate(words,{
        voice:info.voice,speed:info.speed
      });
      if(ownRevision!==revision||(!enabled&&!force))return false;
      if(!output||typeof output.toBlob!=='function')
        throw new Error('模型未返回可以播放的音频。');
      return await playBlobAudio(output.toBlob(),ownRevision,who);
    }catch(error){
      if(ownRevision!==revision)return false;
      lastError=error instanceof Error?error.message:'自然语音生成失败。';
      signal('error');
      notify('无法生成符合角色设定的自然声音，已保持静音。');
      return false;
    }
  }

  // Original fixed-story narration and the player are never voiced, and
  // other characters cannot accidentally inherit the previous heroine.
  function maybeSpeakCurrentLine(){
    const d=typeof STORY!=='undefined'&&typeof node!=='undefined'?STORY[node]:null;
    if(!d||typeof mode==='undefined'||mode!=='play')return;
    if($('winReply'))return; // AI replies use an explicit event.
    const identity=String(node||'');
    if(identity===lastNode)return;
    lastNode=identity;
    const info=voiceForSpeaker(d.who,d.route);
    if(!info){stop();return;}
    if(enabled)void playText(d.who,d.text,d.route);
  }

  function addControls(){
    const bar=document.querySelector('.top-right');
    if(!bar||$('voiceBtn'))return;
    createProgress($('stage'),'voiceLoadOverlay');
    renderProgressState();
    if(isIOS&&!$('voiceAudioUnlock')){
      const unlock=document.createElement('button');
      unlock.id='voiceAudioUnlock';
      unlock.type='button';
      unlock.textContent='启用声音';
      unlock.setAttribute('aria-label','点击启用 iPhone 角色声音');
      unlock.style.cssText='position:absolute;top:87px;right:425px;z-index:16;'+
        'padding:11px 20px;background:#292744ee;border:1px solid #c6b5eb;'+
        'color:#f9f2ff;letter-spacing:2px;font-size:13px';
      unlock.onclick=unlockAudio;
      $('stage').append(unlock);
    }
    updateUnlockButton();
    const button=document.createElement('button');
    button.id='voiceBtn';
    button.type='button';
    button.textContent='VOICE OFF';
    button.setAttribute('aria-label','开启角色专属自然配音');
    button.onclick=async()=>{
      unlockAudio();
      if(enabled) {
        enabled=false;stop();signal('disabled');
        return;
      }
      enabled=true;signal('enabled');
      notify('正在加载三位角色专属自然语音。首次使用需要下载较大的模型。');
      // This user gesture explicitly authorizes the first voice load.
      try{
        await ensureModel();
        if(!enabled)return;
        const d=(typeof node!=='undefined'&&typeof STORY!=='undefined')?STORY[node]:null;
        if(d&&typeof mode!=='undefined'&&mode==='play')void playText(d.who,d.text,d.route);
        else notify('自然角色语音已就绪，开始剧情或在设置中试听。');
      }catch(_){ enabled=false;signal('disabled'); notify(lastError||'角色声音加载失败，请检查网络。'); }
    };
    bar.insertBefore(button,bar.querySelector('button:last-of-type'));
    listeners.push(state=>{
      button.textContent=state.loading?'VOICE LOAD':enabled?'VOICE ON':'VOICE OFF';
      button.setAttribute('aria-pressed',String(enabled));
      button.title=enabled?'关闭角色自然配音':'开启角色专属自然配音';
    });
  }

  function addSettings(){
    const grid=$('modalBody')?.querySelector('.settings-grid');
    if(!grid||$('voiceSettings'))return;
    const setting=document.createElement('div');
    setting.className='setting';setting.id='voiceSettings';
    const left=document.createElement('div');
    left.textContent='角色自然配音';
    const small=document.createElement('small');
    small.textContent='仅三位女主的专属神经声线；不使用系统机械朗读。首次加载需要联网下载模型。';
    left.append(small);
    const toggle=document.createElement('button');
    toggle.className='toggle-btn';toggle.type='button';
    toggle.textContent=enabled?'已开启':'关闭';
    toggle.addEventListener('click',()=>{
      const btn=$('voiceBtn');if(btn)btn.click();
      toggle.textContent=enabled?'已开启':'关闭';
    });
    setting.append(left,toggle);grid.append(setting);

    const volumeSetting=document.createElement('div');
    volumeSetting.className='setting';
    const volLabel=document.createElement('label');
    volLabel.htmlFor='voiceVolume';
    volLabel.textContent='配音音量';
    const volSub=document.createElement('small');
    volSub.textContent='仅调整角色语音，不影响背景音乐。';
    volLabel.append(volSub);
    const range=document.createElement('input');
    range.type='range';range.id='voiceVolume';
    range.min='0';range.max='100';range.value=String(Math.round(volume*100));
    range.oninput=()=>{
      volume=Number(range.value)/100;
      if(player)player.volume=volume;
      if(voiceGain)voiceGain.gain.value=volume;
    };
    volumeSetting.append(volLabel,range);grid.append(volumeSetting);

    const preview=document.createElement('div');
    preview.className='setting';
    const label=document.createElement('div');
    label.textContent='角色声音试听';
    const info=document.createElement('small');
    info.textContent='澪：沉静认真 · 凪：明亮爽朗 · 栞：温柔舒缓';
    label.append(info);
    const actions=document.createElement('div');
    actions.style.cssText='display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end';
    for(const [id,profile]of Object.entries(CONFIG)){
      const btn=document.createElement('button');
      btn.className='toggle-btn';
      btn.type='button';
      btn.textContent=profile.name.replace(/\s/g,'');
      btn.onclick=()=>{unlockAudio();void playText(profile.name,previews[id],id,true);};
      actions.append(btn);
    }
    preview.append(label,actions);grid.append(preview);

    const status=document.createElement('div');
    status.className='setting';
    status.id='voiceModelStatus';
    status.textContent=engine?'本机神经语音已就绪':lastError||'尚未加载语音模型';
    grid.append(status);
    createProgress($('modalBody'),'voiceLoadSettings');
    renderProgressState();
    const handler=(event)=>{
      if(!status.isConnected){document.removeEventListener('mayos:voice-status',handler);return;}
      status.textContent=event.detail.error||(event.detail.loading?'正在下载并初始化自然语音模型…':
        event.detail.ready?'三位角色神经声线已就绪':'尚未加载语音模型');
      toggle.textContent=enabled?'已开启':'关闭';
    };
    document.addEventListener('mayos:voice-status',handler);
  }

  function install(){
    addControls();
    if(typeof window.openSettings==='function'){
      const originalSettings=window.openSettings;
      window.openSettings=function(...args){
        const ret=originalSettings.apply(this,args);
        addSettings();return ret;
      };
    }
    if(typeof window.render==='function'){
      const originalRender=window.render;
      window.render=function(...args){
        const ret=originalRender.apply(this,args);
        maybeSpeakCurrentLine();
        return ret;
      };
    }
    if(typeof window.goTitle==='function'){
      const originalTitle=window.goTitle;
      window.goTitle=function(...args){
        stop();lastNode='';
        return originalTitle.apply(this,args);
      };
    }
    if(typeof window.showEnding==='function'){
      const originalEnding=window.showEnding;
      window.showEnding=function(...args){
        stop();return originalEnding.apply(this,args);
      };
    }
    window.addEventListener('mayos:ai-exit',()=>{
      stop();lastNode='';
    });
    window.addEventListener('mayos:ai-reply',event=>{
      const detail=event.detail||{};
      if(!CONFIG[detail.route])return;
      if(enabled)void playText(CONFIG[detail.route].name,detail.text,detail.route);
    });
    window.addEventListener('pagehide',()=>{
      stop();audioUnlocked=false;updateUnlockButton();
    });
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden){
        stop();
        if(isIOS){audioUnlocked=false;updateUnlockButton();}
      }
    });
    // Exposed only for non-AI automated tests, not a credential endpoint.
    window.MayosCharacterVoice=Object.freeze({
      getProfiles:()=>Object.fromEntries(Object.entries(CONFIG).map(([id,value])=>
        [id,{name:value.name,voice:value.voice,speed:value.speed}])),
      getStatus:()=>({enabled,ready:!!engine,loading:!!loading,
        audioUnlocked:!isIOS||audioUnlocked,iosAudio:isIOS,
        error:lastError,backend:backendDescription,progress:{...progressState}}),
      preview:(id)=>CONFIG[id]?playText(CONFIG[id].name,previews[id],id,true):Promise.resolve(false),
      stop
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
