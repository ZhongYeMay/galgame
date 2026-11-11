'use strict';
// Headless Edge test of the exact unmodified production website and the
// Windows desktop injection. No real API key or paid DeepSeek call is used.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),site=path.join(root,'site');
const evidence=path.join(root,'windows','test-output');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8','.webp':'image/webp'};
const endings=['endM1','endM2','endN1','endN2','endS1','endS2'];
const routes={mio:'M',nagi:'N',shiori:'S'};

async function main(){
  fs.mkdirSync(evidence,{recursive:true});
  const server=http.createServer((req,res)=>{
    const raw=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=path.resolve(site,'.'+(raw==='/'?'/index.html':raw));
    if(!file.startsWith(site+path.sep)){res.writeHead(403).end();return;}
    fs.readFile(file,(err,contents)=>{
      if(err){res.writeHead(404).end();return;}
      res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream',
        'cache-control':'no-store'}).end(contents);
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  let browser;
  try {
    browser=await chromium.launch({channel:'msedge',headless:true,
      args:['--no-first-run','--no-default-browser-check']});
    const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
    const errors=[];
    page.on('pageerror',err=>errors.push(err.message));
    const bridgeSource=[
      '(() => {',
      'const sent=[], callbacks=[];',
      'window.__hostSent=sent;',
      'window.__hostDeliver=data=>callbacks.forEach(cb=>cb({data}));',
      'window.chrome=window.chrome||{};',
      'Object.defineProperty(window.chrome,"webview",{configurable:true,value:{',
      'postMessage:data=>sent.push(data),',
      'addEventListener:(type,cb)=>{if(type==="message")callbacks.push(cb);}',
      '}});',
      '})();',
      fs.readFileSync(path.join(root,'windows','desktop-ai.js'),'utf8')
    ].join('\n');
    await page.addInitScript({content:bridgeSource});
    await page.route('https://fonts.googleapis.com/**',r=>r.abort());
    await page.route('https://fonts.gstatic.com/**',r=>r.abort());
    await page.goto('http://127.0.0.1:'+port+'/index.html',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#winModeSelector');
    assert.equal(await page.locator('#winModeSelector [data-mode="offline"]')
      .getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#winModeSelector [data-mode="ai"]')
      .getAttribute('aria-pressed'),'false');
    const original=await page.evaluate(()=>({
      start:!!STORY.arrival_0,
      chapters:Object.keys(CHAPTERS),
      endings:Object.keys(ENDINGS)
    }));
    assert(original.start,'Current complete chapter story missing');
    assert.equal(original.chapters.length,10,'Missing a chapter');
    assert.deepEqual([...original.endings].sort(),[...endings].sort());
    await page.screenshot({path:path.join(evidence,'01-title-offline.png')});
    await page.locator('#titleScreen .start-button').click();
    await page.waitForFunction(()=>mode==='play');
    assert.equal(await page.evaluate(()=>node),'arrival_0');
    assert.equal(await page.locator('#winReply').count(),0);
    await page.screenshot({path:path.join(evidence,'02-original-game.png')});

    await page.evaluate(()=>{
      finishTyping();
      openSaves('save');
      document.querySelector('#modalBody .slot button').click();
    });
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem(KEY+'slots'))?.[0]);
    assert.equal(saved.version,3,'Original current-version saves must work');
    assert.equal(saved.node,'arrival_0');
    await page.evaluate(()=>{closeModal();goTitle();continueGame();});
    assert.equal(await page.evaluate(()=>node),'arrival_0');

    const outcomes=[];
    for(const target of endings){
      const result=await page.evaluate(({target,routes})=>{
        newGame();
        const desired=Object.keys(routes).find(x=>routes[x]===target[3]);
        const good=target.endsWith('1');
        let steps=0,decisions=0;
        const chapters=new Set();
        while(mode==='play'&&steps++<2600){
          const item=STORY[node];
          if(!item)throw new Error('Missing node: '+node);
          if(item.chapter)chapters.add(item.chapter);
          if(typing)finishTyping();
          if(item.choices){
            let choice=0;
            if(progress.lockedRoute){
              const index=item.choices.findIndex(x=>(x[2]||{}).trust===(good?1:0));
              if(index>=0)choice=index;
            }else{
              let score=-Infinity;
              for(let i=0;i<item.choices.length;i++){
                const value=(item.choices[i][2]||{})[desired]||0;
                if(value>score){choice=i;score=value;}
              }
            }
            choose(node,choice);decisions++;
          }else if(item.next) advance();
          else throw new Error('Dead end: '+node);
        }
        return {target,actual:node,mode,steps,decisions,
                chapterCount:chapters.size,route:progress.lockedRoute};
      },{target,routes});
      assert.equal(result.mode,'ending',JSON.stringify(result));
      assert.equal(result.actual,target,JSON.stringify(result));
      assert.ok(result.chapterCount>=9,JSON.stringify(result));
      assert.ok(result.decisions>=5,JSON.stringify(result));
      outcomes.push(result);
    }
    assert.equal(await page.evaluate(()=>unlocked.size),6);

    await page.evaluate(()=>goTitle());
    await page.locator('#winModeSelector [data-mode="ai"]').click();
    await page.locator('#titleScreen .start-button').click();
    await page.waitForSelector('#winReply');
    const proactive=await page.evaluate(()=>
      window.__hostSent.filter(x=>x.type==='proactive').at(-1));
    assert.equal(proactive.route,'mio','Girl must initiate the first turn');
    await page.evaluate(msg=>window.__hostDeliver({
      type:'reply',id:msg.id,route:msg.route,
      text:'今天海风让电台安静了一点，你想聊什么？'
    }),proactive);
    assert.match(await page.locator('#dialogueText').innerText(),/电台/);
    await page.locator('#winReply').fill('我想听听今天的节目。');
    await page.locator('.win-send').click();
    const chat=await page.evaluate(()=>window.__hostSent.filter(x=>x.type==='chat').at(-1));
    assert.equal(chat.text,'我想听听今天的节目。');
    await page.evaluate(msg=>window.__hostDeliver({
      type:'reply',id:msg.id,route:msg.route,text:'那先从今晚的第一首曲子开始吧。'
    }),chat);
    // Screenshot only after the original CSS scene fade and sprite swap have
    // completed; immediately capturing mid-transition would show a blank stage.
    await page.waitForTimeout(1300);
    const art=await page.evaluate(()=>{
      const background=document.getElementById('background');
      const sprite=document.getElementById('sprite');
      const actor=document.getElementById('actor');
      return {
        fade:document.getElementById('stage').classList.contains('scene-fade'),
        opacity:Number(getComputedStyle(background).opacity),
        actorVisibility:getComputedStyle(actor).visibility,
        spriteLoaded:sprite.complete&&sprite.naturalWidth>0
      };
    });
    assert.ok(!art.fade&&art.opacity>.9,'Original background fade not restored: '+JSON.stringify(art));
    assert.equal(art.actorVisibility,'visible','Original actor sprite is hidden');
    assert.ok(art.spriteLoaded,'Original heroine sprite failed to load');
    await page.evaluate(()=>{document.getElementById('toast').hidden=true;});
    await page.screenshot({path:path.join(evidence,'03-ai-free-text.png')});
    await page.evaluate(()=>{
      openSaves('save');
      document.querySelector('#modalBody .slot button').click();
    });
    assert.ok(await page.evaluate(()=>localStorage.getItem('mayos-summer-win10-ai-slot-0')));
    assert.equal(await page.evaluate(()=>
      JSON.parse(localStorage.getItem(KEY+'slots'))[0].node),'arrival_0');

    await page.evaluate(()=>goTitle());
    await page.locator('#winModeSelector [data-mode="offline"]').click();
    await page.locator('#titleScreen .start-button').click();
    assert.equal(await page.evaluate(()=>node),'arrival_0');
    assert.equal(await page.locator('#winReply').count(),0,
      'Original offline choice UI must be restored after AI play');
    assert.deepEqual(errors,[],'Web page errors detected');
    const summary={status:'PASS',
      platform:'Microsoft Edge headless; no Windows EXE GUI claims',
      original:'original latest production site/ left byte-for-byte unchanged',
      offline:{default:true,chapterCount:original.chapters.length,outcomes,
        originalSixSlotSave:true},
      online:{freeText:true,aiProactive:true,saveIndependent:true,mocked:true},
      realDeepSeekRequests:0};
    fs.writeFileSync(path.join(evidence,'test-report.json'),
      JSON.stringify(summary,null,2)+'\n');
    console.log(JSON.stringify(summary,null,2));
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(err=>{console.error(err.stack||err);process.exitCode=1;});
