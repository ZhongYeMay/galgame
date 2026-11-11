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
  let lastNode='',waitingForVoice=false,hasPlayedOnce=false;
  let lastError='';
  const listeners=[];

  function signal(type,extra={}) {
    const event={type,enabled,ready:!!engine,loading:!!loading,error:lastError,...extra};
    for(const fn of listeners)try{fn(event)}catch(_){}
    document.dispatchEvent(new CustomEvent('mayos:voice-status',{detail:event}));
  }
  function stop(){
    revision++;
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
    loading=(async()=>{
      // Browser-only, no script registered as a system/default voice.
      if(!('WebAssembly' in window))throw new Error('此浏览器不支持神经语音推理。');
      const module=await import(LIB);
      if(typeof module.KokoroTTS?.from_pretrained!=='function')
        throw new Error('角色声音模块未加载成功。');
      const device=navigator.gpu?'webgpu':'wasm';
      const options={
        device,
        dtype:device==='webgpu'?'q4f16':'fp32',
        voicePath:VOICE_PATH
      };
      try{
        engine=await module.KokoroTTS.from_pretrained(MODEL,options);
      }catch(error){
        if(device!=='webgpu')throw error;
        // GPU drivers differ by browser; WebAssembly uses the same voices.
        engine=await module.KokoroTTS.from_pretrained(MODEL,{
          device:'wasm',dtype:'fp32',voicePath:VOICE_PATH
        });
      }
      return engine;
    })();
    signal('loading');
    try{
      return await loading;
    }catch(error){
      lastError='自然语音模型不可用，请检查网络或设备性能。';
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
      currentUrl=URL.createObjectURL(output.toBlob());
      player=new Audio(currentUrl);
      player.volume=volume;
      player.preload='auto';
      player.onended=()=>{if(ownRevision===revision)stop();};
      player.onerror=()=>{if(ownRevision===revision){stop();notify('这一句的角色音频无法播放。');}};
      try{
        await player.play();
      }catch(error){
        if(ownRevision===revision)notify('浏览器拦截了自动播放，请再次点击「试听」或画面中的 VOICE 按钮。');
        return false;
      }
      if(ownRevision===revision){hasPlayedOnce=true;signal('playing',{who});}
      return true;
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
    const button=document.createElement('button');
    button.id='voiceBtn';
    button.type='button';
    button.textContent='VOICE OFF';
    button.setAttribute('aria-label','开启角色专属自然配音');
    button.onclick=async()=>{
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
      }catch(_){ enabled=false;signal('disabled'); }
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
      btn.onclick=()=>{void playText(profile.name,previews[id],id,true);};
      actions.append(btn);
    }
    preview.append(label,actions);grid.append(preview);

    const status=document.createElement('div');
    status.className='setting';
    status.id='voiceModelStatus';
    status.textContent=engine?'本机神经语音已就绪':lastError||'尚未加载语音模型';
    grid.append(status);
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
    window.addEventListener('mayos:ai-reply',event=>{
      const detail=event.detail||{};
      if(!CONFIG[detail.route])return;
      if(enabled)void playText(CONFIG[detail.route].name,detail.text,detail.route);
    });
    window.addEventListener('pagehide',stop);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
    // Exposed only for non-AI automated tests, not a credential endpoint.
    window.MayosCharacterVoice=Object.freeze({
      getProfiles:()=>Object.fromEntries(Object.entries(CONFIG).map(([id,value])=>
        [id,{name:value.name,voice:value.voice,speed:value.speed}])),
      getStatus:()=>({enabled,ready:!!engine,loading:!!loading}),
      preview:(id)=>CONFIG[id]?playText(CONFIG[id].name,previews[id],id,true):Promise.resolve(false),
      stop
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
