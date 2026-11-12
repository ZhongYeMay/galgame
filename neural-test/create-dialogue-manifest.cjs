'use strict';
// Checks every original spoken scene and produces the authoritative small manifest.
// Run only after all three sets of generated MP3s have been merged.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'site','story.js'),'utf8');
const context=vm.createContext({});
vm.runInContext(source+'\n;globalThis.allStory=STORY',context,{timeout:5000});
const voices={mio:'白石 澪',nagi:'橘 凪',shiori:'月島 栞'};
const output=path.join(root,'site','assets','voices');fs.mkdirSync(output,{recursive:true});
const lines={};let total=0,bytes=0;
for(const [id,item] of Object.entries(context.allStory)){
  if(item.who!==voices[item.route]||typeof item.text!=='string')continue;
  if(!/^[a-zA-Z0-9_]+$/.test(id))throw Error('Unsafe id: '+id);
  const file=path.join(output,id+'.mp3');
  if(!fs.existsSync(file))throw Error('Missing pre-recorded heroine speech: '+id);
  const stat=fs.statSync(file);
  if(stat.size<2000||stat.size>500000)throw Error('Invalid audio length: '+id);
  lines[id]=item.route;total++;bytes+=stat.size;
}
if(total<250)throw Error('Unexpectedly few voice lines: '+total);
const manifest={version:1,format:'mp3',mode:'pre-generated original character voices',
  totalLines:total,totalBytes:bytes,lines};
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest));
console.log(JSON.stringify({totalLines:total,totalMegabytes:+(bytes/1048576).toFixed(2)}));
