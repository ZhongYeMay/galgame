/* Windows-only AI layer. The original site/ HTML, CSS, story and art are unchanged.
 * DeepSeek credentials live only inside the .NET host, never this script. */
(() => {
  'use strict';
  const host=window.chrome && window.chrome.webview;
  if(!host)return;
  const byId=id=>document.getElementById(id);
  const routes=['mio','nagi','shiori'];
  const prefix='mayos-summer-win10-ai-slot-';
  let route='mio',active=false,turns=[],requestId=0,pending=null,input='',ready=false;
  let field,sendButton,firstButton,state;
  let originalTitle,originalHistory,originalSaves,originalAuto,originalSkip,originalHide;
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
  function start(r='mio'){
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
    message('reset');speak(true);
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
          start(value.route);
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
  function boot(){
    if(typeof CHARACTERS==='undefined'||!byId('stage'))return;
    originalTitle=window.goTitle;
    originalHistory=window.openHistory;
    originalSaves=window.openSaves;
    originalAuto=window.toggleAuto;
    originalSkip=window.skipRead;
    originalHide=window.toggleUI;
    window.newGame=()=>start('mio');
    window.continueGame=()=>{
      let last=null;
      for(let i=0;i<6;i++){
        try{last=JSON.parse(localStorage.getItem(prefix+i));if(last)break;}catch{}
      }
      if(last&&routes.includes(last.route)){start(last.route);toast('可通过 LOAD 读取已有存档。');}
      else start('mio');
    };
    window.startRoute=r=>start(r);
    window.goTitle=leave;
    window.openHistory=()=>active?history():originalHistory();
    window.openSaves=a=>active?saves(a):originalSaves(a);
    window.toggleAuto=()=>active?toast('AI 模式请使用「让她先说」生成新台词。'):originalAuto();
    window.skipRead=()=>active?toast('AI 自由对话没有预设台词可以快进。'):originalSkip();
    window.toggleUI=()=>active?field?.focus():originalHide();
    byId('textArea').addEventListener('click',()=>{if(active)field?.focus();},true);
    document.addEventListener('keydown',e=>{
      if(e.key==='F11'){e.preventDefault();message('fullscreen');return;}
      if(!active)return;
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
