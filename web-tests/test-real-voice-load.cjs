'use strict';
const { chromium }=require('playwright-core');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const site=path.resolve(__dirname,'../site');
const contentTypes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp'};
async function main(){
  const report={result:'INCOMPLETE',started:new Date().toISOString(),probes:[],requests:[],console:[],errors:[]};
  const server=http.createServer((req,res)=>{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost/').pathname);
    const p=path.resolve(site,'.'+(pathname==='/'?'/index.html':pathname));
    if(!p.startsWith(site+path.sep)){res.writeHead(403).end();return;}
    fs.readFile(p,(e,data)=>e?res.writeHead(404).end():res.writeHead(200,{'content-type':contentTypes[path.extname(p)]||'application/octet-stream'}).end(data));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-sandbox']});
  const save=()=>{report.finished=new Date().toISOString();fs.mkdirSync(path.resolve(__dirname,'diagnostics'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'diagnostics/live-voice-report.json'),JSON.stringify(report,null,2));};
  try{
    const page=await browser.newPage({viewport:{width:1600,height:900}});
    page.on('pageerror',e=>report.errors.push({type:'pageerror',message:e.message}));
    page.on('console',m=>{if(['error','warning'].includes(m.type()))report.console.push({type:m.type(),message:m.text().slice(0,350)});});
    page.on('requestfailed',r=>{const url=r.url();if(!url.includes('fonts.'))report.requests.push({type:'failed',url:url.slice(0,300),reason:r.failure()?.errorText});});
    page.on('response',r=>{if(/esm.sh|huggingface.co|cdn-lfs|hf.co|jsdelivr/.test(r.url())) report.requests.push({type:'response',status:r.status(),url:r.url().slice(0,300)});});
    await page.route('https://fonts.googleapis.com/**',r=>r.abort());
    await page.route('https://fonts.gstatic.com/**',r=>r.abort());
    await page.goto('http://127.0.0.1:'+server.address().port+'/index.html',{waitUntil:'domcontentloaded',timeout:30000});
    await page.locator('#voiceBtn').waitFor({timeout:15000});
    await page.evaluate(()=>{
      window.__realVoiceEvents=[];
      document.addEventListener('mayos:voice-status',e=>{
        window.__realVoiceEvents.push({type:e.detail.type,
          error:e.detail.error||'',progress:e.detail.progress?.percent});
      });
    });
    report.probes.push({type:'boot',status:'ok'});
    // Diagnostic test executes the real published voice module, real network,
    // real CPU/GPU inference, and actual browser audio (no mocks).
    await page.locator('#voiceBtn').click();
    const start=Date.now();
    while(Date.now()-start<155000){
      const state=await page.evaluate(()=>window.MayosCharacterVoice?.getStatus());
      report.probes.push({atSec:Math.round((Date.now()-start)/1000),voice:state});
      if(state?.ready){report.result='MODEL_READY';break;}
      if(!state?.enabled&&!state?.loading&&state?.progress?.kind==='error'){report.result='VOICE_LOAD_ERROR';break;}
      await page.waitForTimeout(5000);
    }
    if(report.result==='INCOMPLETE')report.result='TIMEOUT';
    if(report.result==='MODEL_READY'){
      try{
        await page.evaluate(()=>openSettings());
        await page.locator('#modalBody').getByRole('button',{name:'白石澪'}).click();
        const mark=Date.now();
        while(Date.now()-mark<80000){
          const state=await page.evaluate(()=>({status:window.MayosCharacterVoice.getStatus(),
            events:window.__realVoiceEvents.slice(-10)}));
          if(state.events.some(x=>x.type==='playing')){report.result='ACTUAL_AUDIO_GENERATED';break;}
          if(state.events.some(x=>x.type==='error'&&x.error)){report.result='VOICE_GENERATION_ERROR';report.voiceError=state.status.error;break;}
          await page.waitForTimeout(4000);
        }
      }catch(error){report.result='VOICE_GENERATION_ERROR';report.voiceError=String(error);}
    }
    report.finalStatus=await page.evaluate(()=>({
      status:window.MayosCharacterVoice.getStatus(),
      events:window.__realVoiceEvents.slice(-24),
      visibleText:document.getElementById('voiceModelStatus')?.textContent
    }));
    try{await page.screenshot({path:path.resolve(__dirname,'diagnostics','live-voice-last.png')});}catch(_){}
    console.log('DIAGNOSIS '+JSON.stringify(report).slice(0,23000));
    save();
  }finally{await browser.close();await new Promise(r=>server.close(r));save();}
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
