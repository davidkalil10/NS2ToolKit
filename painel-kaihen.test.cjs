'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {Monitor,verifyStartup,verifyRuntime,run}=require('./painel-kaihen.cjs');
const proof=()=>({session:'switch2-test',complete:true,joined:true,operation:10,result:0,channelRestoreResult:0,gateRestoreResult:0,pid:'210'});
test('stage 4 alone is not a verified frontend or HEN launch',()=>{
  const events=[],m=new Monitor((kind,row)=>events.push({kind,...row}));
  m.line('Run folder: C:\\runs\\switch2-test');m.line('4/4 Connecting to the ldr:ro frontend');
  assert.equal(m.frontend,false);assert(!events.some(row=>row.kind==='kaihen_ready'));
  m.line('RO frontend verified. SmileBASIC RPC');assert.equal(m.frontend,true);
});
test('monitor tracks connection before cancel could abort a native operation',()=>{
  const m=new Monitor(()=>{});m.line('Waiting for Switch 2 at 192.0.2.1:39380.');assert.equal(m.connected,false);
  m.line('Connected. Checking the application...');assert.equal(m.connected,true);
});
test('native startup proof requires matching session, joined completion and successful restore',()=>{
  assert.equal(verifyStartup(proof(),'switch2-test').pid,'210');
  for(const patch of [{session:'other'},{complete:false},{joined:false},{result:1},{channelRestoreResult:1},{operation:9},{pid:'0'},{gateRestoreResult:0xea01}])assert.throws(()=>verifyStartup({...proof(),...patch},'switch2-test'));
});
test('receipt-pending gate accepted only with the upstream pending flag',()=>{
  assert.equal(verifyStartup({...proof(),gateRestoreResult:0xea01,gateRestorePending:true},'switch2-test').gateRestorePending,true);
});
test('invalid PC address never starts acquisition',async()=>{
  let calls=0;await assert.rejects(run(process.cwd(),'not-ip',{verify:async()=>{calls++;}}),/IPv4/);assert.equal(calls,0);
});
async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ns2-hen-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const folder=path.join(root,'runs/switch2-test');await fs.mkdir(path.join(folder,'switch2/ro'),{recursive:true});
  const events=[];let release;
  const stopped=new Promise(resolve=>{release=resolve;});
  const initial={verified:true,rpc:{state:'listening'}};
  await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(initial));
  const options={verify:async()=>({base:path.join(root,'integration'),payload:path.join(root,'payload')}),
    acquire:async()=>{console.log('Run folder: '+folder);console.log('Connected. Checking the application...');console.log('RO frontend verified. SmileBASIC RPC');await stopped;throw Error('Expected host disconnect');},
    launch:async(...args)=>{assert.equal(args[3][0].target,'/switch/ounceshell/ounceshell.nro');const file=path.join(folder,'switch2/ro/hen-startup.json');await fs.writeFile(file,JSON.stringify(proof()));return{pid:'210',file};},
    send:(kind,row)=>{events.push({kind,...row});if(kind==='kaihen_ready'||kind==='error'){
      fs.writeFile(path.join(folder,'result.json'),JSON.stringify({...initial,rpc:{state:'closed',reason:'disconnected'},completed:'test',error:'Expected host disconnect',cleanupErrors:[{error:'preserved'}]})).then(release);
    }}};
  return{root,folder,events,options};
}
test('successful HEN proof waits for app closure and preserves host cleanup errors',async t=>{
  const f=await fixture(t);const result=await run(f.root,'192.0.2.1',f.options);
  assert(result.ready);assert.equal(result.hostError,'Expected host disconnect');
  const final=f.events.find(row=>row.kind==='kaihen_closed');assert(final);assert.equal(final.cleanupConfirmed,false);
  assert.equal(result.launcherOpened,false);assert.equal(result.homebrewOpened,false);
  const lock=JSON.parse(await fs.readFile(path.join(f.folder,'painel-operation.lock'),'utf8'));assert.equal(lock.operation,'kaihen');
});
test('invalid native proof never emits ready or launcher success',async t=>{
  const f=await fixture(t);f.options.launch=async()=>{const file=path.join(f.folder,'bad.json');await fs.writeFile(file,JSON.stringify({...proof(),result:4}));return{pid:'210',file};};
  await assert.rejects(run(f.root,'192.0.2.1',f.options),/registro nativo/);
  assert(!f.events.some(row=>row.kind==='kaihen_ready'||row.kind==='kaihen_closed'));
});
test('early acquisition failure cannot start bootstrap',async t=>{
  const f=await fixture(t);let calls=0;
  f.options.acquire=async()=>{throw Error('acquisition failed');};f.options.launch=async()=>{calls++;};
  await assert.rejects(run(f.root,'192.0.2.1',f.options),/acquisition failed/);assert.equal(calls,0);
});
test('Windows memory endpoint is the same validated implementation as the existing engine',async()=>{
  const canonical=s=>s.replace(/\r\n/g,'\n');
  assert.equal(canonical(await fs.readFile('integrations/kaihen/host/engine/switch2/memory/fs-memory-control.cjs','utf8')),canonical(await fs.readFile('engine/switch2/memory/fs-memory-control.cjs','utf8')));
});
test('official cache and host hashes verify without opening a console connection',async()=>{
  const value=await verifyRuntime(process.cwd());const {config}=await require('./kaihen-config.cjs').loadConfig(process.cwd());assert.equal(value.manifest.release,config.release);
});
