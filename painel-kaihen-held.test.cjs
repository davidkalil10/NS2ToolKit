'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {activateHeld,preflight,frontend,waitForClose,workspace}=require('./painel-kaihen-held.cjs');
const {lockSession,requireHeldSession}=require('./painel-session.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ns2-hen-held-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const run=path.join(root,'runs/switch2-test'),ro=path.join(run,'switch2/ro');await fs.mkdir(ro,{recursive:true});
 const json=async(file,value)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(value));};
 const state={verified:true,started:'same-boot',rpc:{state:'listening'}};
 await json(path.join(run,'result.json'),state);
 const proof={verified:true,restored:true,session:'switch2-test',file:path.join(run,'switch2/fs-proof.json')};
 await json(path.join(run,'switch2/fs-execution-current.json'),proof);
 await json(proof.file,{verified:true,session:'switch2-test',trials:[{verified:true,restored:true},{verified:true,restored:true}]});
 await json(path.join(ro,'current-execution.json'),{verified:true,session:'switch2-test',pid:'80',programId:'0400000000000037'});
 const native={session:'switch2-test',toolkitCapabilities:['kaihen-transition-v1'],worker:{joined:true},notifiers:[12]};
 const events=[],calls=[],folder=path.join(run,'clone');await fs.mkdir(folder);
 const options={verify:async()=>({base:root,payload:path.join(root,'payload'),manifest:{}}),probe:async()=>true,info:async()=>native,
  prepare:async()=>folder,promote:async()=>{calls.push('promote');return{pid:'90'};},
  tools:async()=>({start:async()=>{calls.push('start');const file=path.join(folder,'hen.json');
   await json(file,{session:'switch2-test',complete:true,joined:true,operation:10,result:0,channelRestoreResult:0,gateRestoreResult:0,pid:'210'});return{file,pid:'210'};}}),
  wait:async()=>{calls.push('closed');return{rpc:{state:'closed',reason:'disconnected'},error:'host cleanup preserved',cleanupErrors:[{error:'preserved'}]};},
  send:(kind,row)=>events.push({kind,...row})};
 return{root,run,ro,state,native,events,calls,options,json,folder};
}
test('held activation never reacquires, preserves guided order and permanently retires the backup session',async t=>{
 const f=await fixture(t),result=await activateHeld(f.root,f.run,f.options);
 assert.deepEqual(f.calls,['promote','start','closed']);assert.equal(result.ready,true);
 const kinds=f.events.map(e=>e.kind);assert(kinds.indexOf('kaihen_connected')<kinds.indexOf('kaihen_loading'));
 assert(kinds.indexOf('kaihen_ready')<kinds.indexOf('kaihen_closed'));assert(!kinds.includes('kaihen_waiting'));
 assert.match(f.events.find(e=>e.kind==='kaihen_ready').message,/feche SmileBASIC.*SEM REINICIAR/);
 assert.match(f.events.find(e=>e.kind==='kaihen_closed').message,/segurando R/);
 assert.equal(f.events.find(e=>e.kind==='kaihen_closed').cleanupConfirmed,false);
 assert.equal(result.hostError,'host cleanup preserved');assert.equal(result.launcherOpened,false);
 await assert.rejects(requireHeldSession(f.run),/sessão teve/);
 assert.equal(JSON.parse(await fs.readFile(path.join(f.run,'painel-operation.lock'))).operation,'kaihen-transition');
});
test('old sessions refuse transition before mutation and remain available for backups',async t=>{
 const f=await fixture(t);delete f.native.toolkitCapabilities;
 await assert.rejects(activateHeld(f.root,f.run,f.options),e=>!e.requiresRestart&&/versão anterior/.test(e.message));
 assert.deepEqual(f.calls,[]);await requireHeldSession(f.run);
 await assert.rejects(fs.access(path.join(f.run,'painel-operation.lock')),/ENOENT/);
});

test('native FS proof uses per-trial restoration, and incomplete trials refuse before native requests',async t=>{
 const f=await fixture(t);
 await preflight(f.run,f.options.probe,f.options.info);
 const file=path.join(f.run,'switch2/fs-proof.json');
 for(const trials of [[{verified:true,restored:true}],
   [{verified:true,restored:true},{verified:true,restored:false}],
   [{verified:true,restored:true},{verified:false,restored:true}]]){
  await f.json(file,{verified:true,restored:true,session:'switch2-test',trials});
  let probed=false;
  await assert.rejects(preflight(f.run,async()=>{probed=true;return true;},f.options.info),/prova nativa/);
  assert.equal(probed,false);
 }
});
test('concurrent FTP/backup lock prevents even preflight native requests',async t=>{
 const f=await fixture(t),unlock=await lockSession(f.run,'ftp');let probes=0;
 f.options.probe=async()=>{probes++;};
 try{await assert.rejects(activateHeld(f.root,f.run,f.options),/Outra operação/);assert.equal(probes,0);assert.deepEqual(f.calls,[]);}
 finally{await unlock();}
});
test('missing or mismatched FS proof and installed mods refuse before promotion',async t=>{
 const f=await fixture(t);
 await f.json(path.join(f.run,'switch2/fs-proof.json'),{verified:true,restored:true,session:'another-boot'});
 await assert.rejects(activateHeld(f.root,f.run,f.options),/prova nativa/);assert.deepEqual(f.calls,[]);
 await f.json(path.join(f.run,'ns2jb-modloader-install.json'),{});
 await assert.rejects(preflight(f.run,f.options.probe,f.options.info),/loader de mods/);
});
test('uncertain promotion never retries, never starts HEN and leaves the session blocked',async t=>{
 const f=await fixture(t);f.options.promote=async()=>{f.calls.push('promote');throw Error('native timed out');};
 await assert.rejects(activateHeld(f.root,f.run,f.options),e=>e.requiresRestart&&/timed out/.test(e.message));
 assert.deepEqual(f.calls,['promote']);assert(!f.events.some(e=>e.kind==='kaihen_ready'||e.kind==='kaihen_closed'));
 await assert.rejects(requireHeldSession(f.run),/sessão teve/);
});
test('invalid bootstrap proof cannot tell the user to close SmileBASIC for successful handoff',async t=>{
 const f=await fixture(t);f.options.tools=async()=>({start:async()=>{const file=path.join(f.folder,'bad.json');await f.json(file,{complete:false});return{file,pid:'210'};}});
 await assert.rejects(activateHeld(f.root,f.run,f.options),/registro nativo/);
 assert(!f.events.some(e=>e.kind==='kaihen_ready'||e.kind==='kaihen_closed'));
});
test('closure confirmation waits for a final disconnected report from the same host',async t=>{
 const f=await fixture(t);
 await f.json(path.join(f.run,'result.json'),{...f.state,completed:'done',rpc:{state:'closed',reason:'disconnected'}});
 assert.equal((await waitForClose(f.run,'same-boot')).rpc.reason,'disconnected');
 await assert.rejects(waitForClose(f.run,'different-boot'),/identidade/);
 await f.json(path.join(f.run,'result.json'),{...f.state,completed:'done',rpc:{state:'closed',reason:'SIGINT'}});
 await assert.rejects(waitForClose(f.run,'same-boot'),/inesperada/);
});
test('frontend uses the verified previous RO PID and checks remote package bytes before launching',async t=>{
 const f=await fixture(t),payload=path.join(f.root,'payload');await fs.mkdir(path.join(payload,'ro'),{recursive:true});
 await fs.writeFile(path.join(payload,'ro/main'),Buffer.from('NSO0-test'));
 const policy=path.join(f.ro,'switch2-test-code-0400000000000037/main.npdm');await fs.mkdir(path.dirname(policy));await fs.writeFile(policy,'policy');
 const report=path.join(f.run,'report.json');await f.json(report,{session:'switch2-test',ownedRoot:{clones:[7]}});
 await f.json(path.join(f.run,'switch2/current-acquisition.json'),{report});
 const order=[],tools={memory:{request:async r=>{order.push(r.command);return r.command==='root-native-package-open'?{result:0,entries:[{name:'main',sha256:sha(Buffer.from('NSO0-test'))},{name:'main.npdm',sha256:sha(Buffer.from('policy'))}]}:{};}},
  build:async()=>order.push('build'),bind:async()=>order.push('bind'),gate:async()=>({verified:true,restored:true}),
  launch:async()=>({imageAccepted:true,restored:true,pid:'90',file:'launch'}),
  runtime:{activate:async(file,pid)=>{assert.equal(pid,'80');return{pid:'90',originalPid:pid};},handoff:async()=>order.push('handoff')},ready:async()=>({ready:true})};
 const result=await frontend({run:f.run,folder:f.folder,payload,previous:{pid:'80'},tools,send:()=>{}});
 assert.equal(result.previousPid,'80');assert(order.indexOf('root-native-package-open')<order.indexOf('bind'));
 tools.memory.request=async()=>({result:0,entries:[]});
 await assert.rejects(frontend({run:f.run,folder:f.folder,payload,previous:{pid:'80'},tools,send:()=>{}}),/releitura/);
});
test('lock can retain an exclusive handoff marker while closing its file handle',async t=>{
 const f=await fixture(t),unlock=await lockSession(f.run,'test');await unlock.retain();
 assert.equal(JSON.parse(await fs.readFile(path.join(f.run,'painel-operation.lock'))).operation,'test');
 await assert.rejects(lockSession(f.run,'again'),/Outra operação/);
});

test('transition tooling is isolated from live endpoint code and copies matching proof records only',async t=>{
 const f=await fixture(t),config=await require('./painel-kaihen.cjs').verifyRuntime(process.cwd());
 const suffixes=['-layout.json','-loader-root-copy.json','-bound-sessions.json','-filesystem-types.json','-gate-event.json','-sm-proof.json','-notifier-proof.json'];
 for(const suffix of suffixes)await f.json(path.join(f.ro,'switch2-test'+suffix),{session:'switch2-test',report:'original-report'});
 await f.json(path.join(f.run,'connection.json'),{port:1,addresses:{session:'switch2-test'}});
 await f.json(path.join(f.run,'switch2/current-acquisition.json'),{report:'original-report'});
 const original=Buffer.from('live endpoint must remain unchanged');await fs.writeFile(path.join(f.ro,'control.cjs'),original);
 const folder=await workspace(f.run,config.base,config.manifest);
 assert.deepEqual(await fs.readFile(path.join(f.ro,'control.cjs')),original);
 assert.equal(JSON.parse(await fs.readFile(path.join(folder,'switch2/ro/switch2-test-layout.json'))).report,'original-report');
 assert.equal(typeof require(path.join(folder,'switch2/ro/test-gate.cjs')).main,'function');
 await f.json(path.join(f.ro,'switch2-test-layout.json'),{session:'another-boot'});
 await assert.rejects(workspace(f.run,config.base,config.manifest),/outra sessão/);
});
