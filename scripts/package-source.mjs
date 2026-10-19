import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import JSZip from 'jszip';
const zip=new JSZip();
const files=['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json','next-env.d.ts','next.config.ts','vitest.config.ts','playwright.config.ts','.env.example','.gitignore','README.md','启动知间.command'];
for(const dir of ['src','scripts','migrations','tests','docs']){
  for(const name of fs.readdirSync(dir,{recursive:true}))if(fs.statSync(path.join(dir,name)).isFile())files.push(path.posix.join(dir,name));
}
for(const file of files)if(fs.existsSync(file))zip.file(file,file==='next-env.d.ts'?'/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n':fs.readFileSync(file));
const buffer=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
fs.mkdirSync('deliverables',{recursive:true});fs.writeFileSync('deliverables/between-pages-source.zip',buffer);
console.log('Source archive:',path.resolve('deliverables/between-pages-source.zip'));
console.log('SHA-256:',crypto.createHash('sha256').update(buffer).digest('hex'));
console.log('Includes source, docs, migration and tests. Excludes personal data, API keys, node_modules and builds.');
