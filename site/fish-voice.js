/* Optional free Fish Audio AI dialogue speech for web, Windows and Android.
 * BYOK only. Never store the user's Fish key in localStorage or source code.
 * Original fixed-story dialogue uses prerecorded small MP3s independently.
 * Requests go through an explicitly allowlisted Supabase Edge CORS relay.
 */
(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const ENDPOINT='https://uaxnhmaczwjldvjhcysk.supabase.co/functions/v1/mayos-fish-tts';
  const NAMES={mio:'白石 澪',nagi:'橘 凪',shiori:'月島 栞'};
  const VOICES={
    mio:'213197c413fa4f158ca451b093914428',
    nagi:'f583c0abb2e147e781c412b167c86e70',
    shiori:'327fd0ecf9b3447787c4adec65c27e2c'
  };
  // These IDs reference independently listed public Fish Audio voice
  // profiles; their artistic suitability and free-model compatibility are
  // user-selectable rather than asserted as measured facts.
  let key='',enabled=false,lastError='',pending=null,revision=0;
  const cache=new Map();
  function announce(message){
    const el=$('fishVoiceState');
    if(el)el.textContent=message;
    document.dispatchEvent(new CustomEvent('mayos:fish-status',{
      detail:{message,enabled,busy:!!pending,hasKey:!!key,error:lastError}
    }));
  }
  function toast(text){
    const el=$('toast');if(!el)return;
    el.textContent=text;el.hidden=false;
    clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.hidden=true,5000);
  }
  function resetRequest(){
    revision++;
    if(pending){pending.abort();pending=null;}
  }
  function validVoiceId(id){return /^[a-f0-9]{32}$/i.test(id);}
  async function generate(route,text,force=false){
    if(!NAMES[route]||(!enabled&&!force))return false;
    if(!key){announce('请先在 CONFIG 中输入自己的 Fish Audio API Key。');return false;}
    text=String(text||'').replace(/\s+/g,' ').trim();
    if(!text)return false;
    if(text.length>260)text=text.slice(0,260);
    resetRequest();
    const current=revision;
    lastError='';
    let blob=cache.get(route+'\n'+text);
    if(!blob){
      const ctl=new AbortController();pending=ctl;
      announce(NAMES[route]+'：正在通过 Fish 免费模型生成语音…');
      const timer=setTimeout(()=>ctl.abort(),39000);
      try{
        const response=await fetch(ENDPOINT,{
          method:'POST',
          cache:'no-store',
          signal:ctl.signal,
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({key,text,route,voiceId:VOICES[route]})
        });
        if(current!==revision)return false;
        if(!response.ok){
          let err='';
          try{err=(await response.json()).error||'';}catch(_){}
          throw new Error(err||'Fish 语音请求失败（HTTP '+response.status+'）');
        }
        blob=await response.blob();
        if(blob.size<150)throw new Error('语音接口返回的音频文件不完整。');
        cache.set(route+'\n'+text,blob);
        while(cache.size>8)cache.delete(cache.keys().next().value);
      }catch(error){
        if(current===revision){
          lastError=error?.name==='AbortError'?'语音服务器响应超时。':
            String(error?.message||'生成语音失败。');
          announce(lastError);
          toast(lastError+' 已保留文字对白，不会改成机械朗读。');
        }
        return false;
      }finally{clearTimeout(timer);if(current===revision)pending=null;}
    }
    if(current!==revision)return false;
    announce(NAMES[route]+'：音频已就绪，正在播放…');
    try{
      const played=await window.MayosCharacterVoice?.playRemoteAudio?.(blob,NAMES[route]);
      if(played)announce(NAMES[route]+'：已播放自然语音');
      else announce('请点击游戏中的「启用声音」后再试听。');
      return !!played;
    }catch(error){
      lastError=String(error?.message||'音频解码或播放失败。');
      announce(lastError);
      return false;
    }
  }
  function addSettings(){
    if($('fishVoiceSettings'))return;
    const target=$('modalBody')?.querySelector('.settings-grid')||$('modalBody');
    if(!target)return;
    const panel=document.createElement('section');
    panel.id='fishVoiceSettings';panel.className='setting';
    panel.style.cssText='display:block;max-width:100%;border-top:1px solid #bba8d744;padding-top:14px';
    const heading=document.createElement('strong');
    heading.textContent='Fish Audio · 在线自然配音（AI 自由对话）';
    heading.style.cssText='display:block;letter-spacing:1px;margin-bottom:8px';
    const info=document.createElement('small');
    info.textContent='不用下载 127 MB 模型或 GPU。使用你自己的 Fish API Key；台词会发送给 Fish 服务，免费额度与账号资格以其官方规则为准。密钥仅保留在本次页面内存中。';
    info.style.cssText='display:block;line-height:1.6;margin-bottom:10px';
    const label=document.createElement('label');
    label.textContent='Fish API Key（仅本次使用）';
    const field=document.createElement('input');
    field.type='password';field.id='fishApiKey';field.autocomplete='off';
    field.maxLength=500;field.placeholder=key?'已配置，重新输入可更换':'粘贴 Fish API Key';
    field.style.cssText='display:block;width:100%;min-width:0;margin:9px 0 12px;padding:12px;background:#15152c;color:#f9f2ff;border:1px solid #b29fda';
    label.append(field);
    const controls=document.createElement('div');
    controls.style.cssText='display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0';
    function makeButton(text,action){
      const button=document.createElement('button');
      button.type='button';button.textContent=text;
      button.className='toggle-btn';button.onclick=action;controls.append(button);
      return button;
    }
    const toggle=makeButton(enabled?'在线配音 ON':'启用在线配音',()=>{
      if(enabled){enabled=false;resetRequest();announce('在线配音已关闭，固定剧情 MP3 仍可使用。');}
      else {
        if(!key){announce('请先输入 Fish API Key 并点击「保存本次密钥」。');return;}
        window.MayosCharacterVoice?.unlockAudio?.();
        enabled=true;announce('在线 AI 配音已开启。');toast('AI 台词将通过 Fish Audio 生成，不需要下载本机模型。');
      }
      toggle.textContent=enabled?'在线配音 ON':'启用在线配音';
    });
    makeButton('保存本次密钥',()=>{
      const v=field.value.trim();
      if(v.length<18){announce('请输入有效的 Fish API Key。');return;}
      key=v;field.value='';field.placeholder='已配置，重新输入可更换';
      window.MayosCharacterVoice?.unlockAudio?.();
      enabled=true;toggle.textContent='在线配音 ON';
      announce('Fish Key 已在本次页面内存配置。请选择女主试听或进入 AI 对话。');
    });
    makeButton('清除密钥',()=>{
      key='';field.value='';field.placeholder='粘贴 Fish API Key';
      enabled=false;toggle.textContent='启用在线配音';resetRequest();cache.clear();
      announce('Fish Key 已从本次页面内存清除。');
    });
    const voices=document.createElement('div');
    voices.style.cssText='display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:8px';
    for(const [route,name]of Object.entries(NAMES)){
      const wrap=document.createElement('div');
      const voiceLabel=document.createElement('label');
      voiceLabel.textContent=name+' · 声线 ID';
      voiceLabel.style.cssText='display:block;font-size:10px;margin-bottom:6px';
      const field=document.createElement('input');
      field.value=VOICES[route];
      field.maxLength=32;
      field.setAttribute('aria-label',name+' Fish 声线 ID');
      field.style.cssText='width:100%;padding:8px 4px;background:#171629;border:1px solid #a28fc075;color:#eee;font-size:9px';
      field.addEventListener('change',()=>{
        const entered=field.value.trim();
        if(validVoiceId(entered)){VOICES[route]=entered;cache.clear();}
        else{field.value=VOICES[route];announce('声线 ID 必须是 32 位十六进制字符。');}
      });
      const play=document.createElement('button');
      play.type='button';play.className='toggle-btn';
      play.textContent='试听 '+name.replace(/\s/g,'');
      play.style.cssText='margin-top:6px;font-size:10px';
      play.onclick=()=>{
        window.MayosCharacterVoice?.unlockAudio?.();
        const words={mio:'今天的广播还没有结束，我们慢慢说。',nagi:'海边的风真不错！要不要一起去拍照？',shiori:'书店刚泡好了茶，想聊聊今天发生的事吗？'};
        void generate(route,words[route],true);
      };
      wrap.append(voiceLabel,field,play);voices.append(wrap);
    }
    const status=document.createElement('div');status.id='fishVoiceState';
    status.setAttribute('role','status');status.textContent=key?'已配置密钥':'尚未配置 Fish API Key';
    status.style.cssText='margin:12px 0 0;color:#d6c6ef;font-size:12px;line-height:1.5';
    panel.append(heading,info,label,controls,voices,status);
    target.append(panel);
  }
  function install(){
    if(typeof window.openSettings==='function'){
      const previous=window.openSettings;
      window.openSettings=function(...args){
        const ret=previous.apply(this,args);
        addSettings();
        return ret;
      };
    }
    window.addEventListener('mayos:ai-reply',e=>{
      const {route,text} = e.detail||{};
      if(enabled)void generate(route,text);
    });
    window.addEventListener('mayos:ai-exit',()=>resetRequest());
    window.addEventListener('pagehide',()=>{resetRequest();key='';enabled=false;cache.clear();});
    window.MayosFishVoice=Object.freeze({
      isEnabled:()=>enabled,
      getStatus:()=>({enabled,busy:!!pending,hasKey:!!key,error:lastError}),
      preview:(route)=>generate(route,{
        mio:'今天的广播还没有结束，我们慢慢说。',
        nagi:'海边的风真不错！要不要一起去拍照？',
        shiori:'书店刚泡好了茶，想聊聊今天发生的事吗？'
      }[route],true)
    });
  }
  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
