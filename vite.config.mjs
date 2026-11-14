import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { sites } from '@openai/sites-vite-plugin';
const hosting=JSON.parse(readFileSync(new URL('./.openai/hosting.json',import.meta.url),'utf8'));
export default defineConfig({
  publicDir:'.sites-runtime/public-assets',
  build:{outDir:'hosted-dist',emptyOutDir:true},
  plugins:[sites(),cloudflare({viteEnvironment:{name:'server'},config:{
    name:'telvyo',main:'worker/index.js',compatibility_date:'2026-11-14',compatibility_flags:['nodejs_compat'],
    assets:{binding:'ASSETS',run_worker_first:true,html_handling:'none'},
    r2_buckets:hosting.r2 ? [{binding:hosting.r2,bucket_name:'site-creator-r2'}] : [],
  }})],
});
