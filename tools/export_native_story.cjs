#!/usr/bin/env node
// Evaluate only the project's trusted local story.js in an isolated VM and export
// all original story nodes as data. Never execute downloaded/untrusted scripts.
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../site/story.js'),'utf8');
const ctx=vm.createContext(Object.create(null));
vm.runInContext(source+'\n;globalThis.__nativeExport={STORY,CHARACTERS,ENDINGS};',ctx,{timeout:3000});
const {STORY,CHARACTERS,ENDINGS}=ctx.__nativeExport;
const output={schema:1,source:'site/story.js',characters:CHARACTERS,story:STORY,endings:ENDINGS};
const dest=process.argv[2]||path.join(__dirname,'../native/story.generated.json');
fs.writeFileSync(dest,JSON.stringify(output,null,2)+'\n');
console.log('Exported '+Object.keys(STORY).length+' original story nodes to '+dest);
