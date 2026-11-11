/* Online AI adapter for the public GitHub Pages edition.
 * The unchanged original game is the default. An API key supplied by the
 * current visitor is kept only in this page session's JS memory.
 * Never place a maintainer's credential or a shared key into a public site.
 */
(() => {
  'use strict';
  const handlers = [];
  const sessions = new Map();
  const validRoutes = new Set(['mio','nagi','shiori']);
  let apiKey = '';
  let busy = false;

  function deliver(data) {
    const copy = Object.freeze({...data});
    for (const fn of handlers) {
      try { fn({data:copy}); } catch (_) {}
    }
  }
  function post(type, id, route, details={}) {
    deliver({type,id,route,...details});
  }
  function keyState() {
    deliver({type:'key-status',ready:!!apiKey});
  }
  function showKeyDialog() {
    // Use the original game's modal system, fonts and buttons.
    modal('连接 DeepSeek','ONLINE / AI CONNECTION');
    const body = document.getElementById('modalBody');
    const note = document.createElement('p');
    note.textContent = '在线对话会消耗你自己的 DeepSeek API 配额。密钥仅保留在当前页面内存中，不会写入本地存档、URL 或公开仓库。离线剧情始终不需要密钥。';
    const box = document.createElement('div');
    box.className = 'setting';
    const label = document.createElement('label');
    label.textContent = 'DeepSeek API Key';
    label.htmlFor = 'webAiKey';
    const input = document.createElement('input');
    input.id = 'webAiKey';
    input.type = 'password';
    input.name = 'webAiKey';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = '请输入你自己的 Key';
    input.maxLength = 400;
    input.style.cssText = 'width:420px;max-width:100%;padding:12px 16px;color:#f8f1ff;background:#161831;border:1px solid #b6a5ea88;outline:none;font-size:15px';
    box.append(label,input);
    const actions = document.createElement('div');
    actions.className = 'end-actions';
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn primary';
    save.textContent = '仅本次使用';
    save.addEventListener('click', () => {
      const entered=input.value.trim();
      input.value='';
      if(entered.length < 18) {
        const warn=document.createElement('p');
        warn.textContent='请输入有效格式的 API Key。';
        warn.setAttribute('role','alert');
        body.append(warn);
        return;
      }
      apiKey=entered;
      closeModal();
      keyState();
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn';
    remove.textContent = '清除本次密钥';
    remove.addEventListener('click', () => {
      apiKey='';
      input.value='';
      closeModal();
      keyState();
    });
    actions.append(save,remove);
    body.append(note,box,actions);
    input.focus();
  }

  function persona(route) {
    const role={
      mio:['白石 澪','25岁，镰仓海边电台的节目制作人，认真温柔，有点别扭','潮音放送室'],
      nagi:['橘 凪','26岁，喜欢旅行摄影的自由摄影师，开朗、有自己的生活','七里滨海边'],
      shiori:['月島 栞','27岁，长谷月灯旧书店主理人，细腻、善于倾听','月灯旧书店']
    }[route];
    return '你是原创全年龄视觉小说《夏日未寄》中的虚构成年人'+role[0]+'。'+role[1]+'。当前场景：'+role[2]+'。'+
      '请用自然中文、必要时少量日语口头语，每轮只说角色自己的1至3句简洁对白。'+
      '女主可以主动开始日常话题，不给玩家列选择题，不替玩家回答，不伪称为现实人物。'+
      '尊重个人边界，避免露骨内容、操控性言论或排他性依赖。';
  }

  async function requestAI(type,route,text) {
    const messages=[];
    if(type==='test-key') {
      messages.push({role:'system',content:'只回复OK。'});
      messages.push({role:'user',content:'OK'});
    } else {
      messages.push({role:'system',content:persona(route)});
      messages.push(...(sessions.get(route)||[]).slice(-12));
      messages.push({role:'user',content:type==='proactive'?
        '请自然地开启新的轻松话题，问玩家一个关于今天或身边景色的小问题。':text});
    }
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),35000);
    try {
      const response=await fetch('https://api.deepseek.com/chat/completions',{
        method:'POST',
        mode:'cors',
        credentials:'omit',
        referrerPolicy:'no-referrer',
        headers:{
          'Authorization':'Bearer '+apiKey,
          'Content-Type':'application/json'
        },
        body:JSON.stringify({
          model:'deepseek-flash',
          stream:false,
          max_tokens:type==='test-key'?8:200,
          temperature:0.9,
          messages
        }),
        signal:controller.signal
      });
      if(!response.ok) {
        if(response.status===401||response.status===403)
          throw new Error('DeepSeek Key 无效、已过期或无访问权限。');
        if(response.status===402)
          throw new Error('DeepSeek 账户余额不足。');
        if(response.status===429)
          throw new Error('请求过于频繁，请稍后再试。');
        throw new Error('DeepSeek 暂时无法提供服务（HTTP '+response.status+'）。');
      }
      const raw=await response.json();
      const answer=raw?.choices?.[0]?.message?.content;
      if(typeof answer!=='string'||!answer.trim())
        throw new Error('DeepSeek 返回了空白对白。');
      return answer.trim().slice(0,1500);
    } finally {
      clearTimeout(timer);
    }
  }

  async function handle(message) {
    if(!message||typeof message!=='object')return;
    const type=String(message.type||'').slice(0,40);
    const id=Number.isSafeInteger(message.id)?message.id:0;
    const route=String(message.route||'').slice(0,20);
    if(type==='key-status'){keyState();return;}
    if(type==='set-key'){showKeyDialog();return;}
    if(type==='fullscreen'){
      try {
        if(!document.fullscreenElement&&document.documentElement.requestFullscreen)
          await document.documentElement.requestFullscreen();
        else if(document.fullscreenElement)await document.exitFullscreen();
      } catch(_){}
      post('fullscreen',id,route);return;
    }
    if(type==='reset'){
      if(busy){post('error',id,route,{message:'请先完成当前对话请求。'});return;}
      if(validRoutes.has(route))sessions.set(route,[]);
      post('reset-ok',id,route);return;
    }
    if(!['chat','proactive','test-key'].includes(type))return;
    if(busy){post('error',id,route,{message:'上一轮仍在生成，请稍后。'});return;}
    if(!apiKey){post('error',id,route,{message:'尚未连接 DeepSeek，请点击「API 设置」临时输入你自己的 Key。'});return;}
    if(type!=='test-key'&&!validRoutes.has(route))return;
    const text=type==='chat'?String(message.text||'').trim().slice(0,800):'';
    if(type==='chat'&&!text){post('error',id,route,{message:'请先填写回答。'});return;}
    busy=true;
    try {
      const answer=await requestAI(type,route,text);
      if(type==='test-key'){post('test-ok',id,route);return;}
      const history=sessions.get(route)||[];
      if(type==='chat')history.push({role:'user',content:text});
      history.push({role:'assistant',content:answer});
      sessions.set(route,history.slice(-12));
      post('reply',id,route,{text:answer});
    } catch(error) {
      let message=error instanceof Error?error.message:'对话请求失败。';
      if(error instanceof TypeError)
        message='无法访问 DeepSeek：请检查网络、浏览器跨域限制或 API 服务状态。';
      if(error?.name==='AbortError')message='请求超时，请检查网络后重试。';
      post('error',id,route,{message});
    } finally {
      busy=false;
    }
  }
  window.__MayosWebAIHost={
    postMessage:message=>{void handle(message);},
    addEventListener:(type,callback)=>{
      if(type==='message'&&typeof callback==='function')handlers.push(callback);
    }
  };
})();

/* Windows-only AI layer. The original site/ HTML, CSS, story and art are unchanged.
 * DeepSeek credentials live only inside the .NET host, never this script. */
(() => {
  'use strict';
  const host=window.__MayosWebAIHost;
  if(!host)return;
  const byId=id=>document.getElementById(id);
  const routes=['mio','nagi','shiori'];
  const prefix='mayos-summer-win10-ai-slot-';
  let route='mio',active=false,turns=[],requestId=0,pending=null,input='',ready=false;
  // Offline is always the default: do not persist a previous online selection.
  let selectedMode='offline';
  let field,sendButton,firstButton,state;
  let originalTitle,originalHistory,originalSaves,originalAuto,originalSkip,originalHide;
  let originalNewGame,originalContinueGame,originalStartRoute;
  const chr=()=>CHARACTERS[route];
  function message(type,details={}) {
    const id=++requestId;
    host.postMessage(Object.assign({type,route,id},details));
    return id;
  }
  function toast(s){
    const t=byId('toast');t.textContent=s;t.hidden=false;
    clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.hidden=true,3800);
  }
  function showLine(who,text){
    byId('speakerName').textContent=who;
    byId('speakerKana').textContent=who==='你'?'YOU / PLAYER':chr().kana;
    byId('dialogueText').textContent=text;
    byId('lineInfo').textContent=String(turns.length).padStart(2,'0')+' / '+chr().kana;
  }
  function status(s){if(state)state.textContent=s;}
  function lock(){
    if(field)field.disabled=pending!==null;
    if(sendButton)sendButton.disabled=pending!==null;
    if(firstButton)firstButton.disabled=pending!==null;
  }
  function style(){
    if(byId('win10Style'))return;
    const el=document.createElement('style');el.id='win10Style';
    el.textContent=[
      '#choiceList.win-ai{left:140px;top:282px;width:550px;gap:0}',
      '.win-mode-toggle{display:flex;align-items:center;gap:12px;border-right:1px solid #b6a5ea44;padding-right:24px}',
      '.win-mode-toggle button{font-family:var(--sans);font-size:10px;letter-spacing:1px;white-space:nowrap;padding:9px 12px;color:#e7d6f2}',
      '.win-mode-toggle button[aria-pressed="true"]{border:1px solid #bda0e288;background:#aa8dd329;color:#fff2ff}',
      '.win-mode-toggle button:focus-visible{outline:2px solid #d5baff;outline-offset:3px}',
      '.win-ai-box{padding:20px 25px;background:linear-gradient(90deg,#22254bf5,#33325ce8);border:1px solid #aa9cdb99;box-shadow:0 5px 25px #10143e66;backdrop-filter:blur(12px)}',
      '.win-ai-box label{display:block;font-family:var(--serif);font-size:12px;letter-spacing:3px;color:#d8c5f7;margin-bottom:11px}',
      '.win-ai-box textarea{width:100%;height:85px;padding:12px 14px;resize:none;background:#151a3dbb;border:1px solid #b6a5ea65;color:#f8f1ff;font-family:var(--serif);font-size:17px;line-height:1.5;outline:none}',
      '.win-ai-box textarea:focus{border-color:#d8bbff;box-shadow:0 0 0 1px #d8bbff44}',
      '.win-ai-box textarea::placeholder{color:#d2c1e17a}',
      '.win-ai-box .win-actions{display:flex;align-items:center;gap:10px;margin-top:12px}',
      '.win-ai-box button{border:1px solid #bba1e388;background:#a68cd424;color:#f4e8ff;padding:10px 15px;font:12px var(--sans);letter-spacing:1px}',
      '.win-ai-box button:hover{background:#b79aee44}',
      '.win-ai-box button:disabled{opacity:.45}',
      '.win-ai-box .win-send{background:#b9a2e0;color:#24203d;font-weight:600}',
      '.win-status{min-height:16px;margin-top:10px;color:#c8bbdb;font-size:11px;letter-spacing:1px}',
      '#dialogueText.win-ai-line{white-space:pre-wrap;max-height:145px;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3}',
      '.win-routes{position:absolute;top:194px;left:140px;display:flex;gap:12px;z-index:4}',
      '.win-routes button{background:#25264be8;border:1px solid #c4b4e366;color:#e7d8fa;padding:9px 15px;font:12px var(--sans);letter-spacing:2px}',
      '.win-routes button.active{background:#b7a1df55;border-color:#e6ccff}'
    ].join('');
    document.head.appendChild(el);
  }
  function prepare(){
    style();byId('winRoutes')?.remove();
    const nav=document.createElement('div');nav.className='win-routes';nav.id='winRoutes';
    routes.forEach((id,i)=>{
      const button=document.createElement('button');button.type='button';
      button.textContent='0'+(i+1)+' / '+CHARACTERS[id].name;
      button.classList.toggle('active',id===route);
      button.addEventListener('click',()=>start(id));nav.append(button);
    });
    byId('playScreen').append(nav);
    const list=byId('choiceList');list.replaceChildren();list.classList.add('win-ai');
    const form=document.createElement('form');form.className='win-ai-box';
    const label=document.createElement('label');label.htmlFor='winReply';
    label.textContent='あなたの返事 / 填写你的回答';
    field=document.createElement('textarea');field.id='winReply';field.maxLength=800;
    field.placeholder='用自己的话回答她，不需要选择固定答案……';
    field.addEventListener('keydown',e=>{
      if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();e.stopPropagation();speak(false);}
    });
    const action=document.createElement('div');action.className='win-actions';
    sendButton=document.createElement('button');sendButton.type='submit';sendButton.className='win-send';sendButton.textContent='寄出回答 →';
    firstButton=document.createElement('button');firstButton.type='button';firstButton.textContent='让她先说';
    firstButton.addEventListener('click',()=>speak(true));
    const key=document.createElement('button');key.type='button';key.textContent='API 设置';
    key.addEventListener('click',()=>message('set-key'));
    const test=document.createElement('button');test.type='button';test.textContent='测试连接';
    test.addEventListener('click',()=>message('test-key'));
    action.append(sendButton,firstButton,key,test);
    state=document.createElement('div');state.className='win-status';state.setAttribute('role','status');
    form.append(label,field,action,state);
    form.addEventListener('submit',e=>{e.preventDefault();speak(false);});
    list.append(form);lock();
  }
  function start(r='mio', options={}){
    if(!routes.includes(r))return;
    if(pending!==null){toast('请先完成当前请求再切换角色。');return;}
    originalTitle();route=r;active=true;turns=[];input='';
    byId('stage').classList.add('playing');
    byId('titleScreen').hidden=true;byId('titleCharacterLabel').hidden=true;
    byId('titleFooter').hidden=true;byId('endingScreen').hidden=true;
    byId('playScreen').hidden=false;byId('restoreUI').hidden=true;
    setScene(chr().bg);setActor(route,0,'still');
    byId('routeEn').textContent=chr().en;byId('routeTitle').textContent=chr().title;
    prepare();byId('dialogueText').classList.add('win-ai-line');
    showLine(chr().name,'');status('由 DeepSeek 生成女主开场白……');
    message('reset');
    if(options.autoStart!==false) speak(true);
    else status('历史记录已恢复。点击「让她先说」继续建立新的 AI 对话。');
  }
  function speak(proactive){
    if(!active||pending!==null)return;
    const text=proactive?'':(field.value||'').trim();
    if(!proactive&&!text){status('请先填写你的回答。');field.focus();return;}
    input=text;pending=message(proactive?'proactive':'chat',proactive?{}:{text});
    lock();status('正在生成本轮对白……');
  }
  function result(msg){
    if(!active||pending!==msg.id||msg.route!==route)return;
    if(typeof msg.text!=='string'||!msg.text.trim()){fail('没有收到有效的女主对白。');return;}
    if(input){turns.push({who:'你',text:input});field.value='';}
    turns.push({who:chr().name,text:msg.text});turns=turns.slice(-80);
    pending=null;input='';
    showLine(chr().name,msg.text);
    setActor(route,turns.length%3,'speak');
    status('可以直接填写下一句 · Shift+Enter 换行');
    lock();field.focus();
  }
  function fail(text){pending=null;lock();status(text+(ready?'':' 点击「API 设置」配置密钥。'));}
  function history(){
    modal('回忆中的对白','DIALOGUE HISTORY / LOG');
    const box=document.createElement('div');
    turns.forEach(t=>{
      const row=document.createElement('div');row.className='log-row';
      const label=document.createElement('strong');label.textContent=t.who;
      const content=document.createElement('p');content.textContent=t.text;
      row.append(label,content);box.append(row);
    });
    byId('modalBody').replaceChildren(box);
  }
  function saves(action){
    modal(action==='save'?'寄存今天的夏天':'继续未写完的对白',
          action==='save'?'SAVE / セーブ':'LOAD / ロード');
    const grid=document.createElement('div');grid.className='slot-grid';
    for(let i=0;i<6;i++){
      let value=null;
      try{value=JSON.parse(localStorage.getItem(prefix+i));}catch{}
      const slot=document.createElement('div');slot.className='slot';
      const num=document.createElement('small');num.className='slot-num';num.textContent='SLOT 0'+(i+1);
      const title=document.createElement('h3');title.textContent=value?.name||'空白的书签';
      const p=document.createElement('p');
      p.textContent=value?'对白 '+(value.turns?.length||0)+' 句 · '+(value.at||''):'尚未记录';
      const button=document.createElement('button');button.className='btn';
      button.textContent=action==='save'?'覆盖存档':'读取存档';
      button.disabled=action==='load'&&!value;
      button.addEventListener('click',()=>{
        if(action==='save'){
          localStorage.setItem(prefix+i,JSON.stringify({
            v:1,route,name:chr().name,turns,at:new Date().toLocaleString('zh-CN')
          }));
          closeModal();toast('已保存到这台 Windows 电脑。');
        }else if(value&&routes.includes(value.route)){
          start(value.route,{autoStart:false});
          turns=Array.isArray(value.turns)?
            value.turns.filter(t=>t&&typeof t.who==='string'&&typeof t.text==='string').slice(-80):[];
          const last=turns.at(-1);if(last)showLine(last.who,last.text);
          closeModal();
          toast('已读取对话记录；AI 上下文从当前角色重新开始。');
        }
      });
      slot.append(num,title,p,button);grid.append(slot);
    }
    byId('modalBody').replaceChildren(grid);
  }
  function leave(){
    active=false;pending=null;input='';
    byId('winRoutes')?.remove();
    byId('choiceList').classList.remove('win-ai');
    byId('dialogueText').classList.remove('win-ai-line');
    originalTitle();
  }

  // The selector belongs to the existing title footer. All original menu
  // buttons, animations, original choices and save keys remain untouched.
  function addModeSelector(){
    const footer=byId('titleFooter');
    const target=footer?.querySelector('div');
    if(!target||byId('winModeSelector'))return;
    style();
    const group=document.createElement('div');
    group.className='win-mode-toggle';group.id='winModeSelector';
    group.setAttribute('role','group');
    group.setAttribute('aria-label','选择游玩模式');
    const buttons=[];
    for(const [name,label] of [['offline','离线 · 完整剧情'],['ai','在线 · AI 自由对话']]){
      const button=document.createElement('button');
      button.type='button';
      button.textContent=label;
      button.dataset.mode=name;
      button.addEventListener('click',()=>{
        if(active){toast('请先返回标题，再切换游玩模式。');return;}
        selectedMode=name;
        updateModeButtons();
      });
      group.append(button);buttons.push(button);
    }
    target.prepend(group);
    function updateModeButtons(){
      for(const button of buttons)
        button.setAttribute('aria-pressed',String(button.dataset.mode===selectedMode));
      footer.dataset.windowsGameMode=selectedMode;
    }
    updateModeButtons();
  }

  function restoreTranscript(saved) {
    turns=Array.isArray(saved.turns)
      ? saved.turns.filter(t=>t&&typeof t.who==='string'&&typeof t.text==='string').slice(-80)
      : [];
    const last=turns.at(-1);
    if(last)showLine(last.who,last.text);
    return turns.length;
  }

  function boot(){
    if(typeof CHARACTERS==='undefined'||!byId('stage'))return;
    originalTitle=window.goTitle;
    originalNewGame=window.newGame;
    originalContinueGame=window.continueGame;
    originalStartRoute=window.startRoute;
    originalHistory=window.openHistory;
    originalSaves=window.openSaves;
    originalAuto=window.toggleAuto;
    originalSkip=window.skipRead;
    originalHide=window.toggleUI;
    addModeSelector();
    window.newGame=()=>{
      if(selectedMode==='offline') return originalNewGame();
      start('mio');
    };
    window.continueGame=()=>{
      if(selectedMode==='offline')return originalContinueGame();
      let saved=null;
      for(let i=0;i<6;i++){
        try{const candidate=JSON.parse(localStorage.getItem(prefix+i));
          if(candidate&&routes.includes(candidate.route) &&
             (!saved || candidate.at>saved.at))saved=candidate;
        }catch{}
      }
      if(saved){
        start(saved.route,{autoStart:false});
        restoreTranscript(saved);
        toast('已恢复 AI 文字记录。继续生成需要 API Key 和网络。');
      }else start('mio');
    };
    if(typeof originalStartRoute==='function')
      window.startRoute=r=>selectedMode==='ai'?start(r):originalStartRoute(r);
    window.goTitle=()=>{
      if(active)leave(); else originalTitle();
    };
    window.openHistory=()=>active?history():originalHistory();
    window.openSaves=a=>active?saves(a):originalSaves(a);
    window.toggleAuto=()=>active?toast('AI 模式请使用「让她先说」生成新台词。'):originalAuto();
    window.skipRead=()=>active?toast('AI 自由对话没有预设台词可以快进。'):originalSkip();
    window.toggleUI=()=>active?field?.focus():originalHide();
    byId('textArea').addEventListener('click',()=>{if(active)field?.focus();},true);
    document.addEventListener('keydown',e=>{
      if(e.key==='F11'){e.preventDefault();message('fullscreen');return;}
      if(!active)return;
      if(e.target?.tagName==='TEXTAREA' &&
         !['Escape','F4','F11'].includes(e.key))return;
      if(e.code==='Space'&&e.target?.tagName!=='TEXTAREA'){
        e.preventDefault();e.stopImmediatePropagation();field?.focus();return;
      }
      if(e.key==='Escape'&&byId('modal').hidden){
        e.preventDefault();e.stopImmediatePropagation();leave();return;
      }
      if(e.key==='F4'){e.preventDefault();speak(true);return;}
      if(['F1','F2','F3'].includes(e.key)){
        e.preventDefault();start(routes[Number(e.key[1])-1]);
      }
    },true);
    host.addEventListener('message',e=>{
      const d=e.data;if(!d||typeof d!=='object')return;
      if(d.type==='key-status'){
        ready=!!d.ready;if(ready)toast('DeepSeek 密钥已在 Windows 本地就绪。');
      }
      if(d.type==='reply')result(d);
      if(d.type==='error'&&d.id===pending)fail(d.message||'连接失败');
      if(d.type==='test-ok')toast('DeepSeek API 测试成功。');
    });
    message('key-status');
  }
  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();

