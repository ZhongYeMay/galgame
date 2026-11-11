'use strict';
/* Browser integration test: original full game + new optional web AI.
 * DeepSeek responses are mocked, so no real user key or token charge.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright-core');
const site=path.resolve(__dirname,'../site');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.webp':'image/webp'};
async function main(){
  const server=http.createServer((req,res)=>{
    let pathname;
    try{pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}
    catch{res.writeHead(400).end();return;}
    const file=path.resolve(site,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(site+path.sep)){res.writeHead(403).end();return;}
    fs.readFile(file,(error,buf)=>{
      if(error){res.writeHead(404).end();return;}
      res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'}).end(buf);
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1600,height:900}});
    const pageErrors=[];let apiCalls=0;
    page.on('pageerror',e=>pageErrors.push(e.message));
    await page.route('https://fonts.googleapis.com/**',r=>r.abort());
    await page.route('https://fonts.gstatic.com/**',r=>r.abort());
    await page.route('https://api.deepseek.com/**',route=>{
      apiCalls++;
      const req=route.request();
      if (req.method() !== 'OPTIONS')
        assert.equal(req.headers()['authorization'],'Bearer sk-e2e-fake-not-secret');
      route.fulfill({status:200,contentType:'application/json',
        headers:{
          'access-control-allow-origin':'*',
          'access-control-allow-headers':'Authorization, Content-Type',
          'access-control-allow-methods':'POST, OPTIONS'
        },
        body:JSON.stringify({choices:[{message:{content:'海风很好，今天想去哪里看看？'}}]})
      });
    });
    await page.goto('http://127.0.0.1:'+server.address().port+'/index.html',
      {waitUntil:'domcontentloaded'});
    await page.locator('#winModeSelector').waitFor();
    assert.equal(await page.locator('#winModeSelector [data-mode=offline]')
      .getAttribute('aria-pressed'),'true');
    const original=await page.evaluate(()=>({start:!!STORY.arrival_0,
      chapters:Object.keys(CHAPTERS).length,endings:Object.keys(ENDINGS).length}));
    assert.deepEqual(original,{start:true,chapters:10,endings:6});
    await page.locator('#titleScreen .start-button').click();
    await page.waitForFunction(()=>mode==='play');
    assert.equal(await page.evaluate(()=>node),'arrival_0');
    assert.equal(await page.locator('#winReply').count(),0);
    assert.equal(apiCalls,0,'Offline original must never invoke DeepSeek');
    await page.evaluate(()=>goTitle());
    await page.locator('#winModeSelector [data-mode=ai]').click();
    await page.locator('#titleScreen .start-button').click();
    await page.locator('#winReply').waitFor();
    await page.locator('.win-actions button').filter({hasText:'API 设置'}).click();
    await page.locator('#webAiKey').fill('sk-e2e-fake-not-secret');
    await page.getByRole('button',{name:'仅本次使用'}).click();
    await page.getByRole('button',{name:'让她先说'}).click();
    await page.waitForFunction(()=>
      document.getElementById('dialogueText').textContent.includes('海风很好'));
    assert.ok(apiCalls>=1,'Online mode must call the AI backend when enabled');
    await page.locator('#winReply').fill('我想去海边。');
    await page.locator('.win-send').click();
    await page.waitForFunction(()=>document.getElementById('winReply').value==='');
    await page.evaluate(()=>openSaves('save'));
    await page.locator('#modalBody .slot button').first().click();
    assert.ok(await page.evaluate(()=>
      localStorage.getItem('mayos-summer-win10-ai-slot-0')));
    const leaked=await page.evaluate(()=>
      Object.entries(localStorage).some(([k,v])=>v.includes('sk-e2e-fake-not-secret')));
    assert.equal(leaked,false,'API key leaked into persistent storage');
    await page.evaluate(()=>goTitle());
    await page.locator('#winModeSelector [data-mode=offline]').click();
    await page.locator('#titleScreen .start-button').click();
    assert.equal(await page.evaluate(()=>node),'arrival_0');
    assert.equal(await page.locator('#winReply').count(),0);
    assert.deepEqual(pageErrors,[]);
    console.log(JSON.stringify({result:'PASS',original,offlineDefault:true,
      mockOnlineApiCalls:apiCalls,aiSaveIsolation:true,
      keyNotSaved:true,errors:pageErrors}));
  }finally{
    await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
