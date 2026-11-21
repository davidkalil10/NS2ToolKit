'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {validateConfig,loadConfig}=require('./kaihen-config.cjs');
const {verifyRuntime}=require('./painel-kaihen.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'kaihen-config-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const base=path.join(root,'integrations/kaihen'),payload=path.join(base,'payload');
  const real=await loadConfig(process.cwd()),c=structuredClone(real.config);
  await fs.mkdir(payload,{recursive:true});
  const file=path.join(base,'kaihen-config.json');await fs.writeFile(file,JSON.stringify(c));
  const cfg=await loadConfig(root);
  const m={release:c.release,kaihenCommit:c.kaihenCommit,hostCommit:c.hostCommit,archiveSha256:c.archive.sha256,
    configurationSha256:cfg.configurationSha256,hostFiles:{'host.cjs':sha('host')},payloadFiles:{}};
  await fs.mkdir(path.join(base,'host'));await fs.writeFile(path.join(base,'host/host.cjs'),'host');
  for(const name of ['ro/main','hen/main','game/main','hbmenu.nro','programs/ounceshell.nro']){
    const b=Buffer.alloc(32);b.write(name.endsWith('.nro')?'NRO0':'NSO0',name.endsWith('.nro')?16:0);
    const f=path.join(payload,name);await fs.mkdir(path.dirname(f),{recursive:true});await fs.writeFile(f,b);m.payloadFiles[name]=sha(b);
  }
  await fs.writeFile(path.join(base,'runtime-manifest.json'),JSON.stringify(m));
  return {root,base,payload,c,m,file};
}
test('central configuration agrees with release, cache paths, manifests and source pins',async()=>{
  const {config,paths,configurationSha256}=await loadConfig(process.cwd());
  assert(paths.payload.endsWith('package-'+config.release));assert(paths.archive.endsWith(config.archive.file));
  const runtime=await verifyRuntime(process.cwd());assert.equal(runtime.manifest.configurationSha256,configurationSha256);
  const sources=JSON.parse(await fs.readFile('integrations/kaihen/source-manifest.json','utf8'));
  assert.deepEqual(sources.entries,config.sources);
});
test('future descriptor of the supported profile needs no version edit in application code',async()=>{
  const {config}=await loadConfig(process.cwd()),c=structuredClone(config);
  c.release='20991231.2';c.archive.file='kaiHEN-'+c.release+'.zip';
  c.archive.url='https://github.com/ouncebrew/kaihen/releases/download/'+c.release+'/'+c.archive.file;
  assert.equal(validateConfig(c).release,'20991231.2');
});
test('unknown protocol profile, unsafe sources, missing sources and malformed archive are rejected',async()=>{
  const {config}=await loadConfig(process.cwd());
  for(const edit of [c=>c.compatibility.profile='unreviewed-v2',c=>c.compatibility.bootstrapArgumentBytes=440,
    c=>c.archive.url='https://example.org/other.zip',c=>c.archive.sha256='bad',
    c=>c.sources[0].file='../source.zip',c=>c.sources[0].url+='?changed',
    c=>c.sources.pop(),c=>c.sources.push({...c.sources[0]})]){
    const c=structuredClone(config);edit(c);assert.throws(()=>validateConfig(c),/Configuração kaiHEN inválida/);
  }
});
test('configuration mismatch refuses even an otherwise valid prepared runtime',async t=>{
  const f=await fixture(t);await verifyRuntime(f.root);
  await fs.writeFile(f.file,JSON.stringify({...f.c,localPatches:[...f.c.localPatches,'changed']}));
  await assert.rejects(verifyRuntime(f.root),/Configuração e manifesto/);
});
test('modified payload and host bytes are rejected before any console connection',async t=>{
  const f=await fixture(t);await fs.appendFile(path.join(f.payload,'hbmenu.nro'),'changed');
  await assert.rejects(verifyRuntime(f.root),/Arquivo kaiHEN alterado/);
  const g=await fixture(t);await fs.appendFile(path.join(g.base,'host/host.cjs'),'changed');
  await assert.rejects(verifyRuntime(g.root),/Arquivo kaiHEN alterado/);
});
test('incomplete extraction is refused',async t=>{
  const f=await fixture(t);await fs.unlink(path.join(f.payload,'hen/main'));
  await assert.rejects(verifyRuntime(f.root),/ENOENT/);
});

test('offline preparation rejects a corrupt archive and preserves the prior runtime manifest',async t=>{
  const f=await fixture(t);
  for(const name of ['Preparar-Kaihen.ps1','Ler-Config-Kaihen.ps1','kaihen-config.cjs'])
    await fs.copyFile(name,path.join(f.root,name));
  const cfg=await loadConfig(f.root),prior=await fs.readFile(path.join(f.base,'runtime-manifest.json'));
  await fs.mkdir(path.dirname(cfg.paths.archive),{recursive:true});
  await fs.writeFile(cfg.paths.archive,'incomplete download');
  const childEnv={...process.env};delete childEnv.PSModulePath;
  const child=require('node:child_process').spawnSync('powershell.exe',
    ['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(f.root,'Preparar-Kaihen.ps1'),'-Offline'],
    {encoding:'utf8',timeout:20000,windowsHide:true,env:childEnv});
  assert.notEqual(child.status,0);assert.match(child.stdout+child.stderr,/ZIP kaiHEN difere do hash/);
  assert.deepEqual(await fs.readFile(path.join(f.base,'runtime-manifest.json')),prior);
  await assert.rejects(fs.access(cfg.paths.payload),/ENOENT/);
});
