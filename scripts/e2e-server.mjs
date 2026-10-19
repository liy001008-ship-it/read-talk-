import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
// Test an exact source snapshot with a production server. No personal data or
// credentials are copied, and the live checkout's generated files are untouched.
const root=process.cwd();
const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'between-pages-app-'));
for(const file of ['src','migrations','package.json','pnpm-lock.yaml','next.config.ts','tsconfig.json','next-env.d.ts']){
  const from=path.join(root,file);if(fs.existsSync(from))fs.cpSync(from,path.join(workspace,file),{recursive:true});
}
fs.symlinkSync(path.join(root,'node_modules'),path.join(workspace,'node_modules'),'dir');
const env={...process.env,NEXT_DIST_DIR:'.next',NEXT_TELEMETRY_DISABLED:'1',DATA_DIR:process.env.DATA_DIR||path.join(workspace,'data'),OPENAI_API_KEY:''};
const next=path.join(root,'node_modules/next/dist/bin/next');
const buildId=path.join(root,'.next','BUILD_ID');
if(!fs.existsSync(buildId))throw new Error('Please run npm run build before npm run test:e2e.');
const builtAt=fs.statSync(buildId).mtimeMs;
for(const entry of ['src','migrations','next.config.ts','package.json']){
  const from=path.join(root,entry);const candidates=fs.statSync(from).isDirectory()?fs.readdirSync(from,{recursive:true}).map(f=>path.join(from,f)):[from];
  if(candidates.some(f=>fs.statSync(f).isFile()&&fs.statSync(f).mtimeMs>builtAt))throw new Error('Application sources changed after the last build. Please run npm run build first.');
}
// Reuse the verified production build, excluding development and compiler caches.
fs.cpSync(path.join(root,'.next'),path.join(workspace,'.next'),{recursive:true,filter:src=>{const rel=path.relative(path.join(root,'.next'),src);return !['dev','cache','diagnostics'].some(d=>rel===d||rel.startsWith(d+path.sep));}});
console.log('Starting isolated production test snapshot:',workspace);
const server=spawn(process.execPath,[next,'start','--hostname','127.0.0.1','--port','3100'],{cwd:workspace,env,stdio:'inherit'});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.kill(signal));
server.on('exit',code=>process.exit(code||0));
