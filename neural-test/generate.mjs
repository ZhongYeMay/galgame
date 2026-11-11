import { KokoroTTS } from '@uzen/kokoro-js';
import { stat, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const base=path.dirname(fileURLToPath(import.meta.url));
const voiceDir=path.join(base,'voices');
const output=path.join(base,'samples');
await mkdir(output,{recursive:true});
const tts=await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.1-zh-ONNX',{
  device:'cpu',dtype:'fp32',voicePath:voiceDir
});
const clips=[
  ['mio','zf_021',0.95,'欢迎回来。我还以为，你会再晚一点才到。'],
  ['nagi','zf_070',1.08,'站住！别动。今天的海风特别适合拍照。'],
  ['shiori','zf_083',0.91,'坐下喝杯热茶吧，我们慢慢聊。']
];
const result=[];
for(const [role,voice,speed,text]of clips){
  const audio=await tts.generate(text,{voice,speed});
  const file=path.join(output,role+'.wav');
  await audio.save(file);
  const meta=await stat(file);
  if(meta.size<10000)throw Error('Invalid synthesized WAV '+file+' '+meta.size);
  result.push({role,voice,speed,bytes:meta.size});
}
await writeFile(path.join(output,'report.json'),JSON.stringify({status:'pass',model:'Kokoro-82M-v1.1-zh-ONNX',clips:result},null,2));
console.log(JSON.stringify(result,null,2));
