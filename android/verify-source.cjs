'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),site=path.join(root,'site');
for(const file of ['index.html','style.css','game.js','story.js'])
  assert(fs.statSync(path.join(site,file)).size>100,'Missing original source '+file);
const names=['studio','coast','bookshop',...['mio','nagi','shiori'].flatMap(x=>[0,1,2].map(i=>x+'-'+i))];
for(const name of names)
  assert(fs.statSync(path.join(site,'assets/retro',name+'.webp')).size>2000,name);
const frame=fs.readFileSync(path.join(site,'index.html'),'utf8');
for(const id of ['titleScreen','playScreen','choiceList','dialogue','modal','endingScreen'])
  assert(frame.includes('id="'+id+'"'),'missing original UI: '+id);
const context=vm.createContext(Object.create(null));
const source=fs.readFileSync(path.join(site,'story.js'),'utf8');
vm.runInContext(source+';globalThis.__game={STORY,CHAPTERS,ENDINGS,CHARACTERS}',context,{timeout:2500});
assert(context.__game.STORY.arrival_0);
assert.equal(Object.keys(context.__game.CHAPTERS).length,10);
assert.equal(Object.keys(context.__game.ENDINGS).length,6);
assert.equal(Object.keys(context.__game.CHARACTERS).length,3);
new Function(fs.readFileSync(path.join(root,'windows/desktop-ai.js'),'utf8'));
new Function(fs.readFileSync(path.join(root,'android/app/src/main/assets/android-bridge.js'),'utf8'));
console.log('FULL original game: '+Object.keys(context.__game.STORY).length+' nodes, 10 chapters, 6 endings, 12 images. Android bridge script valid.');
