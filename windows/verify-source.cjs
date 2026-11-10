'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const site=path.join(root,'site');
const images=['studio','coast','bookshop',...['mio','nagi','shiori'].flatMap(ch=>[0,1,2].map(n=>ch+'-'+n))];
for(const filename of ['index.html','style.css','game.js','story.js'])
  assert.ok(fs.statSync(path.join(site,filename)).size>100,'Missing original: '+filename);
for(const name of images)
  assert.ok(fs.statSync(path.join(site,'assets','retro',name+'.webp')).size>1000,'Missing art '+name);
const html=fs.readFileSync(path.join(site,'index.html'),'utf8');
for(const name of ['titleScreen','playScreen','dialogue','choiceList','modal','endingScreen'])
  assert.ok(html.includes('id="'+name+'"'),'Original UI missing '+name);
const desktop=fs.readFileSync(path.join(root,'windows','desktop-ai.js'),'utf8');
assert.ok(desktop.includes("message('reset')"),'AI should reset before starting');
assert.ok(desktop.includes('speak(true)'),'Heroines must generate the opening line');
assert.ok(desktop.includes("'chat'"),'Free text bridge missing');
assert.ok(!/sk-[a-z0-9_-]{16,}/i.test(desktop),'Hard-coded credential forbidden');
new Function(desktop);
console.log('Original 16:9 interface + 12 images + secure AI desktop script: PASS');
