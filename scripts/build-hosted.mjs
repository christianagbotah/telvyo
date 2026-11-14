import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const stage='.sites-runtime/public-assets';
await rm(stage,{recursive:true,force:true});
await mkdir(stage,{recursive:true});
for(const entry of await readdir('dist',{withFileTypes:true})){
  if(entry.name.startsWith('.') || ['server','client'].includes(entry.name)) continue;
  await cp(`dist/${entry.name}`,`${stage}/${entry.name}`,{recursive:true});
}
await cp('admin',`${stage}/admin`,{recursive:true});
let app=await readFile(`${stage}/app.js`,'utf8');
const anchor='<section class="card settings-card"><h3>Clear numbers. Honest sources.</h3>';
if(!app.includes(anchor)) throw Error('Hosted admin navigation anchor changed.');
app=app.replace(anchor,'<section class="card settings-card"><h3>Administration</h3><p>Manage carrier integration setup and check server configuration.</p><a class="primary-btn" href="/admin" target="_top">Open admin</a></section>'+anchor);
await writeFile(`${stage}/app.js`,app);
const build=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build'],{stdio:'inherit',env:{...process.env,CLOUDFLARE_CF_FETCH_ENABLED:'false',WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:resolve('.sites-runtime/wrangler-logs')}});
if(build.status!==0) process.exit(build.status || 1);
await cp('dist/.openai','hosted-dist/.openai',{recursive:true});
await rm('dist/.openai',{recursive:true,force:true});
console.log('Hosted Worker and assets built. Native web assets remain unchanged.');
