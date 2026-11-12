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
    const pageErrors=[];let apiCalls=0,fishCalls=0,modelRequests=0;
    const mp3Requests=[];
    page.on('pageerror',e=>pageErrors.push(e.message));
    page.on('request',r=>{
      if(/\/assets\/voices\/[A-Za-z0-9_]+\.mp3/.test(r.url()))
        mp3Requests.push(r.url());
    });
    await page.route('https://fonts.googleapis.com/**',r=>r.abort());
    await page.route('https://fonts.gstatic.com/**',r=>r.abort());
    // A deterministic voice-model fixture checks identity and lifecycle.
    // The production site still loads the real Kokoro model on demand.
    await page.route('https://esm.sh/@uzen/kokoro-js@1.2.4?bundle',route=>{
      modelRequests++;
      return route.fulfill({
        status:200,contentType:'text/javascript',
        headers:{'access-control-allow-origin':'*'},
        body:[
          'export const KokoroTTS={from_pretrained:async(model,options)=>{',
          '  options.progress_callback?.({status:"download",file:"model.onnx"});',
          '  await new Promise(resolve=>setTimeout(resolve,40));',
          '  options.progress_callback?.({status:"progress",file:"model.onnx",progress:37,loaded:37,total:100});',
          '  await new Promise(resolve=>setTimeout(resolve,750));',
          '  options.progress_callback?.({status:"done",file:"model.onnx"});',
          '  return {generate:async(text,options)=>{',
          '  window.__voiceCalls=window.__voiceCalls||[];',
          '  window.__voiceCalls.push({text,voice:options.voice,speed:options.speed});',
          '  return {toBlob:()=>new Blob([new Uint8Array(44)],{type:"audio/wav"})}',
          '}',
          '}}};'
        ].join('')
      });
    });
    await page.route('https://uaxnhmaczwjldvjhcysk.supabase.co/functions/v1/mayos-fish-tts',route=>{
      fishCalls++;
      const data=route.request().postDataJSON();
      assert.equal(data.key,'fish-e2e-fake-key-no-secret');
      assert.ok(['mio','nagi','shiori'].includes(data.route));
      assert.ok(data.text.length>0&&data.text.length<=260);
      route.fulfill({status:200,contentType:'audio/mpeg',
        headers:{'access-control-allow-origin':'*'},
        body:fs.readFileSync(path.join(site,'assets/voices/studio_return_1.mp3'))});
    });
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
    await page.locator('#startAIStory').waitFor();
    await page.locator('#voiceBtn').waitFor();
    const voiceProfiles=await page.evaluate(()=>window.MayosCharacterVoice.getProfiles());
    assert.deepEqual(Object.keys(voiceProfiles).sort(),['mio','nagi','shiori']);
    assert.equal(new Set(Object.values(voiceProfiles).map(x=>x.voice)).size,3,
      'Three heroines must have three distinct neural voices');
    assert.ok(!fs.readFileSync(path.join(site,'character-voice.js'),'utf8')
      .includes('window.speechSynthesis.speak('),
      'Never fall back to generic browser speech');
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
    // The prominent title AI button is the primary path, not the tiny
    // footer toggle that was invisible on phones.
    await page.locator('#startAIStory').click();
    await page.locator('#winReply').waitFor();
    await page.locator('#webAiKey').waitFor();
    await page.locator('#webAiKey').fill('sk-e2e-fake-not-secret');
    await page.getByRole('button',{name:'仅本次使用'}).click();
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
    // Full fixed story uses 297 prerecordings (~8.85 MB total), downloading
    // only the current sentence; no 127 MB model is requested.
    const manifest=JSON.parse(fs.readFileSync(
      path.join(site,'assets','voices','manifest.json'),'utf8'));
    assert.equal(manifest.totalLines,297);
    await page.evaluate(()=>openSettings());
    await page.locator('#voiceSettings').waitFor();
    await page.locator('#fishVoiceSettings').waitFor();
    for(const id of ['mio','nagi','shiori'])
      await page.evaluate(async id=>window.MayosCharacterVoice.preview(id),id);
    assert.equal(mp3Requests.length,3,'Preview must fetch only three small MP3s');
    assert.equal(modelRequests,0,'Never load Kokoro browser model for fixed dialogue');
    assert.equal(await page.evaluate(()=>MayosCharacterVoice.getStatus().mode),
      'prerecorded-mp3');

    // Fish is optional BYOK, with no credential in git or localStorage.
    await page.locator('#fishApiKey').fill('fish-e2e-fake-key-no-secret');
    await page.getByRole('button',{name:'保存本次密钥'}).click();
    assert.equal(await page.evaluate(()=>MayosFishVoice.getStatus().hasKey),true);
    await page.getByRole('button',{name:'试听 白石澪'}).click();
    await page.waitForFunction(()=>MayosFishVoice.getStatus().busy===false);
    assert.ok(fishCalls>=1,'Optional online voice must request the Fish relay');
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('mayos:ai-reply',{
      detail:{route:'nagi',text:'今天海边的风真舒服。'}
    })));
    await page.waitForFunction(()=>MayosFishVoice.getStatus().busy===false);
    assert.ok(fishCalls>=2,'Native-style AI reply event should trigger speech');
    assert.equal(await page.evaluate(()=>Object.entries(localStorage)
      .some(([k,v])=>v.includes('fish-e2e-fake-key-no-secret'))),false);
    assert.deepEqual(pageErrors,[]);
    // iOS Chrome and Safari both use WebKit's gesture-restricted audio
    // policy. Verify the explicit mobile unlock UI can resume WebAudio
    // through a real trusted tap (rather than programmatic .click()).
    const ios=await browser.newPage({
      userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/133.0.0.0 Mobile/15E148 Safari/604.1',
      viewport:{width:844,height:390},isMobile:true,hasTouch:true
    });
    await ios.route('https://fonts.googleapis.com/**',r=>r.abort());
    await ios.route('https://fonts.gstatic.com/**',r=>r.abort());
    await ios.goto('http://127.0.0.1:'+server.address().port+'/index.html',{waitUntil:'domcontentloaded'});
    await ios.locator('#voiceAudioUnlock').waitFor();
    await ios.evaluate(()=>{mobileEntered=true;fit();});
    await ios.locator('#voiceAudioUnlock').click({force:true});
    await ios.waitForFunction(()=>window.MayosCharacterVoice.getStatus().audioUnlocked,{timeout:10000});
    assert.equal(await ios.evaluate(()=>window.MayosCharacterVoice.getStatus().iosAudio),true);
    await ios.close();
    console.log(JSON.stringify({result:'PASS',original,offlineDefault:true,
      mockOnlineApiCalls:apiCalls,aiSaveIsolation:true,
      keyNotSaved:true,voiceProfiles,mp3Requests:mp3Requests.length,fishCalls,
      modelRequests,iOSAudioUnlockVerified:true,genericBrowserTTS:false,errors:pageErrors}));
  }finally{
    await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
