'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {uploadFiles,install,sessions,TITLE,FILES,SD}=require('./painel-mods.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ns2-gba-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const run=path.join(root,'switch2-test'),job=path.join(root,'job');await fs.mkdir(run);await fs.mkdir(job);
  const report={files:[]};
  for(const name of FILES){const data=Buffer.from(name),file=path.join(job,'sd-card-root/ns2jb-modloader/contents',TITLE,...name.split('/'));await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,data);report.files.push({path:name,bytes:data.length,sha256:sha(data)});}
  const tree=new Map([['/SD',{type:'directory'}]]),writes=[],reads=[],mkdirs=[];
  function directory(name){if(tree.has(name))return;directory(path.posix.dirname(name));tree.set(name,{type:'directory'});}
  // / is not exposed by the fake because writes must stay below /SD.
  const addFile=(name,data)=>{directory(path.posix.dirname(name));tree.set(name,{type:'file',data:Buffer.from(data)});};
  const adapter={async list(folder){assert(tree.has(folder),'missing directory '+folder);return [...tree].filter(([name])=>name!==folder&&path.posix.dirname(name)===folder).map(([name,row])=>({name:path.posix.basename(name),type:row.type,size:row.data?.length||0}));},
    async mkdir(name){mkdirs.push(name);directory(name);},
    async canUpload(name){const row=tree.get(name);return {existing:!!row,size:row?.data?.length};},
    async *read(name){reads.push(name);yield tree.get(name).data;},
    async uploadNew(name,file,hash,size,journal,{intent}){assert(name.startsWith(SD+'/'));const bytes=await fs.readFile(file);assert.equal(sha(bytes),hash);assert.equal(bytes.length,size);writes.push({name,existing:intent.existing});addFile(name,bytes);await fs.writeFile(journal,JSON.stringify({complete:true}));}};
  return {root,run,job,report,tree,writes,reads,mkdirs,adapter,addFile};
}
test('new mod creates only its SD directories and uploads both verified files',async t=>{
  const f=await fixture(t);await uploadFiles(f.adapter,f.job,f.report,{send:()=>{}});
  assert.equal(f.writes.length,2);assert(f.writes.every(row=>!row.existing));
  assert(f.mkdirs.every(name=>name.startsWith('/SD/ns2jb-modloader')));
});
test('identical mod files are read and skipped instead of overwritten',async t=>{
  const f=await fixture(t);for(const name of FILES)f.addFile(SD+'/'+name,name);
  await uploadFiles(f.adapter,f.job,f.report,{send:()=>{}});assert.equal(f.writes.length,0);assert.equal(f.reads.length,2);
});
test('a different previous mod uses the existing-file backup/overwrite adapter path',async t=>{
  const f=await fixture(t);for(const name of FILES)f.addFile(SD+'/'+name,'previous');
  await uploadFiles(f.adapter,f.job,f.report,{send:()=>{}});assert.equal(f.writes.length,2);assert(f.writes.every(row=>row.existing));
});
test('extra stale mod files refuse before any directory creation or upload',async t=>{
  const f=await fixture(t);f.addFile(SD+'/romfs/unexpected.bin','other');
  await assert.rejects(uploadFiles(f.adapter,f.job,f.report,{send:()=>{}}),/arquivos extras/);assert.equal(f.writes.length,0);assert.equal(f.mkdirs.length,0);
});
test('global IPS patches refuse before mutating the selected game',async t=>{
  const f=await fixture(t);f.addFile('/SD/ns2jb-modloader/exefs_patches/other/abcd.ips','patch');
  await assert.rejects(uploadFiles(f.adapter,f.job,f.report,{send:()=>{}}),/patches globais/);assert.equal(f.writes.length,0);
});
function dependencies(f,overrides={}){
  return {runtime:async()=>{},verify:async()=>f.report,held:async()=>{},attach:async()=>({close:async()=>{}}),mount:async()=>f.adapter,discover:async()=>[{title:TITLE}],health:async()=>true,send:()=>{},load:async()=>{await fs.writeFile(path.join(f.run,'ns2jb-modloader-install.json'),JSON.stringify({status:'ready',titleIds:[TITLE]}));},...overrides};
}
test('successful install closes upload attachment before invoking loader and retains handoff lock',async t=>{
  const f=await fixture(t);let closed=false;
  await install(f.root,f.job,f.run,dependencies(f,{attach:async()=>({close:async()=>{closed=true;}}),load:async args=>{
    assert(closed);assert.equal(f.writes.length,2);assert.deepEqual(args,['--sd','--run-dir',f.run,'--title',TITLE]);
    await fs.writeFile(path.join(f.run,'ns2jb-modloader-install.json'),JSON.stringify({status:'ready',titleIds:[TITLE]}));
  }}));
  await fs.access(path.join(f.run,'painel-operation.lock'));await fs.access(path.join(f.job,'ativacao.json'));
});
test('failed upload never invokes loader and marks uncertain session',async t=>{
  const f=await fixture(t);let called=0;f.adapter.uploadNew=async()=>{throw Error('native timeout');};
  await assert.rejects(install(f.root,f.job,f.run,dependencies(f,{load:async()=>{called++;}})),/native timeout/);
  assert.equal(called,0);await fs.access(path.join(f.run,'painel-session-invalid.json'));
});
test('known extra-file refusal keeps a cleaned, healthy session reusable',async t=>{
  const f=await fixture(t);f.addFile(SD+'/romfs/extra','old');
  await assert.rejects(install(f.root,f.job,f.run,dependencies(f)),e=>e.modRefusal&&e.requiresRestart===false);
  await assert.rejects(fs.access(path.join(f.run,'painel-operation.lock')),{code:'ENOENT'});
  await assert.rejects(fs.access(path.join(f.run,'painel-session-invalid.json')),{code:'ENOENT'});
});
test('busy session is not touched',async t=>{
  const f=await fixture(t);await fs.writeFile(path.join(f.run,'painel-operation.lock'),'ftp');let calls=0;
  await assert.rejects(install(f.root,f.job,f.run,dependencies(f,{attach:async()=>{calls++;}})),/Desmonte o FTP/);
  assert.equal(calls,0);assert.equal(await fs.readFile(path.join(f.run,'painel-operation.lock'),'utf8'),'ftp');
});
test('loader return without READY invalidates instead of claiming activation',async t=>{
  const f=await fixture(t);
  await assert.rejects(install(f.root,f.job,f.run,dependencies(f,{load:async()=>{await fs.writeFile(path.join(f.run,'ns2jb-modloader-install.json'),'{}');}})),/não confirmou READY/);
  await fs.access(path.join(f.run,'painel-session-invalid.json'));
});
test('uncertain upload-session close is never repeated or followed by loader activation',async t=>{
  const f=await fixture(t);let closes=0,loads=0;
  await assert.rejects(install(f.root,f.job,f.run,dependencies(f,{attach:async()=>({close:async()=>{closes++;throw Error('close timeout');}}),load:async()=>{loads++;}})),/close timeout/);
  assert.equal(closes,1);assert.equal(loads,0);await fs.access(path.join(f.run,'painel-session-invalid.json'));
});
async function discoveryFixture(t,ready){
  const f=await fixture(t),http=require('node:http');let requests=0;
  const server=http.createServer((request,response)=>{requests++;response.setHeader('Content-Type','application/json');response.end(JSON.stringify({ready}));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const loader=path.join(f.root,'loader');await fs.mkdir(path.join(loader,'lib'),{recursive:true});
  const original=path.resolve('.runtime/ns2jb-modloader-review');
  await fs.writeFile(path.join(loader,'install.cjs'),'module.exports={verifiedRun:require('+JSON.stringify(path.join(original,'install.cjs'))+').verifiedRun};');
  await fs.writeFile(path.join(loader,'lib/find-session.cjs'),'module.exports=require('+JSON.stringify(path.join(original,'lib/find-session.cjs'))+');');
  async function add(name,{completed=false,busy=false}={}){
    const run=path.join(f.root,'runs',name);await fs.mkdir(path.join(run,'switch2'),{recursive:true});
    await fs.writeFile(path.join(run,'result.json'),JSON.stringify({verified:true,rpc:{state:'listening'},...(completed?{completed:'2026-11-14'}:{})}));
    await fs.writeFile(path.join(run,'connection.json'),JSON.stringify({port:server.address().port,addresses:{session:name}}));
    await fs.writeFile(path.join(run,'switch2/fs-execution-current.json'),JSON.stringify({verified:true,file:'switch2/proof.json'}));
    await fs.writeFile(path.join(run,'switch2/proof.json'),JSON.stringify({verified:true,session:name}));
    if(busy)await fs.writeFile(path.join(run,'painel-operation.lock'),'ftp');
    return run;
  }
  return {...f,add,requests:()=>requests};
}
test('session discovery offers only live qualified idle sessions, not ended or busy runs',async t=>{
  const f=await discoveryFixture(t,true);
  const active=await f.add('switch2-available');await f.add('switch2-ended',{completed:true});await f.add('switch2-busy',{busy:true});
  const found=await sessions(f.root);assert.equal(found.length,1);assert.equal(found[0].path,active);assert.equal(f.requests(),1);
});
test('recorded listening state without a ready live endpoint is not offered',async t=>{
  const f=await discoveryFixture(t,false);await f.add('switch2-stale');assert.deepEqual(await sessions(f.root),[]);assert.equal(f.requests(),1);
});
