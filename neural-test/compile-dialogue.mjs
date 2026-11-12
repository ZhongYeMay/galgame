// Generate lightweight high-quality CHARACTER audio for existing fixed-story lines.
// No speechSynthesis or API keys. A single small MP3 is served per line.
import {KokoroTTS} from '@uzen/kokoro-js';
import {readFile, mkdir, mkdtemp, rm, stat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const character=process.argv[2];
const voices={mio:{name:'白石 澪',voice:'zf_021',speed:.95},
  nagi:{name:'橘 凪',voice:'zf_070',speed:1.08},
  shiori:{name:'月島 栞',voice:'zf_083',speed:.91}};
if(!voices[character])throw Error('Specify a route: mio, nagi, shiori');
const source=await readFile(path.join(root,'site','story.js'),'utf8');
const ctx=vm.createContext({});
vm.runInContext(source+'\n;globalThis.allStory=STORY;',ctx,{timeout:5000});
const scenes=Object.entries(ctx.allStory).filter(([id,item])=>
  item.who===voices[character].name&&item.route===character&&
  typeof item.text==='string'&&/^[a-zA-Z0-9_]+$/.test(id));
const out=path.join(root,'site','assets','voices');
await mkdir(out,{recursive:true});
const temp=await mkdtemp(path.join(os.tmpdir(),'mayos-voice-'));
const provider=voices[character];
const tts=await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.1-zh-ONNX',{
  device:'cpu',dtype:'q8',voicePath:path.join(root,'neural-test','voices')});
let done=0,bytes=0;
try {
  for(const [id,item]of scenes){
    const file=path.join(out,id+'.mp3');
    const wav=path.join(temp,'temp.wav');
    const words=item.text.replace(/[「」『』“”]/g,'').replace(/\s+/g,' ').trim();
    const audio=await tts.generate(words,{voice:provider.voice,speed:provider.speed});
    await audio.save(wav);
    execFileSync('ffmpeg',['-loglevel','error','-y','-i',wav,
      '-ar','24000','-ac','1','-codec:a','libmp3lame','-b:a','40k',file],
      {timeout:30000});
    const metadata=await stat(file);
    if(metadata.size<2000)throw Error('Encoded MP3 too small: '+id);
    done++;bytes+=metadata.size;
    if(done%10===0)console.log(character,done,'/',scenes.length,
      (bytes/1048576).toFixed(1)+' MB');
  }
}finally{await rm(temp,{recursive:true,force:true})}
console.log(JSON.stringify({character,expected:scenes.length,done,
  totalMegabytes:+(bytes/1048576).toFixed(2)}));
if(done!==scenes.length)process.exitCode=1;
