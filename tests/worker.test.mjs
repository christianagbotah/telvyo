import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
const owner = {'oai-authenticated-user-id':'site-user-1','oai-authenticated-user-email':'owner@example.test'};
const env = {ADMIN_OWNER_EMAIL:'owner@example.test',ASSETS:{fetch:async r=>new Response(new URL(r.url).pathname,{headers:{'content-type':'text/plain','cache-control':'public'}})}};
test('owner admin routes are protected including asset requests and aliases',async()=>{
 for(const path of ['/admin','/admin/','/admin/admin.js','/admin/index.html','/admin%2Fadmin.js']){
  const denied=await worker.fetch(new Request('https://telvyo.test'+path),env);
  assert.equal(denied.status,401,path); assert.match(await denied.text(),/signin-with-chatgpt/);
  const wrong=await worker.fetch(new Request('https://telvyo.test'+path,{headers:{...owner,'oai-authenticated-user-email':'other@example.test'}}),env);
  assert.equal(wrong.status,403,path);
 }
});
test('admin owner receives protected page with uncached responses and CSP',async()=>{
 const response=await worker.fetch(new Request('https://telvyo.test/admin',{headers:owner}),env);
 assert.equal(response.status,200); assert.equal(await response.text(),'/admin/index.html');
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.match(response.headers.get('content-security-policy'),/script-src 'self'/);
});
test('tracker and download assets keep their routes',async()=>{
 for(const [path,expected] of [['/','/index.html'],['/app.js','/app.js'],['/telvyo-android-preview.apk','/telvyo-android-preview.apk'],['/telco-source.zip','/telco-source.zip']]){
  const response=await worker.fetch(new Request('https://telvyo.test'+path),env);
  assert.equal(await response.text(),expected);
 }
});
test('missing asset binding fails safely and unsupported page writes are rejected',async()=>{
 const missing=await worker.fetch(new Request('https://telvyo.test/'),{});
 assert.equal(missing.status,503);
 const post=await worker.fetch(new Request('https://telvyo.test/admin',{method:'POST',headers:owner}),env);
 assert.equal(post.status,405);
});

test('public pages and downloads receive security headers without changing their caching',async()=>{
 for(const path of ['/','/app.js','/telvyo-android-preview.apk']){
  const response=await worker.fetch(new Request('https://telvyo.test'+path),env);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'public');
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.match(response.headers.get('content-security-policy'),/default-src 'self'/);
  assert.match(response.headers.get('permissions-policy'),/geolocation=\(\)/);
 }
 const admin=await worker.fetch(new Request('https://telvyo.test/admin/index.html',{headers:owner}),env);
 assert.equal(admin.headers.get('cache-control'),'no-store');
 assert.equal(admin.headers.get('referrer-policy'),'no-referrer');
});
test('HEAD returns security headers with no content body',async()=>{
 const res=await worker.fetch(new Request('https://telvyo.test/app.js',{method:'HEAD'}),env);
 assert.equal(res.status,200);
 assert.equal(await res.text(),'');
 assert.equal(res.headers.get('x-content-type-options'),'nosniff');
});
