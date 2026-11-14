"""Create source downloads, excluding secrets and generated hosting/native output."""
from pathlib import Path
import subprocess, zipfile, shutil
root=Path(__file__).resolve().parents[1]
paths=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=root).decode().split('\0')
selected=[]
for rel in sorted(set(paths)):
    if not rel: continue
    p=root/rel
    if not p.is_file(): continue
    if any(part in {'.git','node_modules','build','.gradle','.kotlin','.sites-runtime','hosted-dist','.wrangler','.cloudflare'} for part in p.relative_to(root).parts): continue
    if '.openai' in p.relative_to(root).parts and rel != '.openai/hosting.json': continue
    if p.suffix in {'.apk','.zip','.log','.jks','.keystore','.p12','.p8','.mobileprovision'} or p.name=='local.properties': continue
    if p.name.startswith('.env') and p.name!='.env.example': continue
    if p.name.startswith('.dev.vars'): continue
    if 'assets/public/' in rel or '/App/public/' in rel: continue
    selected.append((p,rel))
output=root/'dist/telvyo-source.zip'
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
    for p,rel in selected: z.write(p,'telvyo/'+rel)
with zipfile.ZipFile(output) as z:
    assert z.testzip() is None
shutil.copyfile(output,root/'dist/telco-source.zip')
print(f'Source archive verified: {len(selected)} files, {output.stat().st_size} bytes.')
