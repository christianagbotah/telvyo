import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
const config=JSON.parse(await readFile('hosted-dist/server/wrangler.json','utf8'));
assert.equal(config.assets.binding,'ASSETS');
assert.equal(config.assets.run_worker_first,true,'Authorization must run before static admin assets.');
assert.equal(config.assets.directory,'../client');
assert.equal(config.assets.html_handling,'none');
assert(config.r2_buckets.some(x=>x.binding==='BUCKET'));
const sourceManifest=await readFile('.openai/hosting.json','utf8');
assert.equal(await readFile('hosted-dist/.openai/hosting.json','utf8'),sourceManifest);
async function files(dir){const found=[];for(const e of await readdir(dir,{withFileTypes:true})){if(e.name.startsWith('.'))continue;const p=join(dir,e.name);found.push(...(e.isDirectory()?await files(p):[p]));}return found;}
for(const name of await files('dist')){
 const target=join('hosted-dist/client',name.slice(5));
 if(name==='dist/app.js'){
  const before=await readFile(name,'utf8');const after=await readFile(target,'utf8');
  assert(after.includes('href="/admin"'));assert.equal((after.match(/telco\.mode/g)||[]).length,(before.match(/telco\.mode/g)||[]).length);
 }else assert.deepEqual(await readFile(target),await readFile(name),name);
}
for(const name of await files('admin')) assert.deepEqual(await readFile(join('hosted-dist/client',name)),await readFile(name),name);
assert(!(await files('hosted-dist/client')).some(p=>/\.env|worker\/|node_modules/.test(p)));
console.log('Verified hosted routes, owner-first asset routing, native download bytes, tracker storage keys, admin assets and manifest.');
