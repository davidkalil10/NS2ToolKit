const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {mountStorage,virtualPath}=require('./painel-ftp-storage.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function fixture(t,options={}) {
 const work=await fs.mkdtemp(path.join(os.tmpdir(),'ftp-native-test-'));t.after(()=>fs.rm(work,{recursive:true,force:true}));
 const memory=new Map(),handles=new Map(),calls=[],sd=new Map([['/old.bin',Buffer.from('original')]]),user=new Map([['/info.bin',Buffer.from('internal')]]);
 let next=40,created=0,writes=0;
 const allocate=value=>{const handle=next++;handles.set(handle,value);return {result:0,moves:[handle],handle};};
 const reply=(result=0,number=0)=>{const data=Buffer.alloc(8);data.writeBigUInt64LE(BigInt(number));return {result,data};};
 const a={root:10,s:{base:0x100000,write:async(at,bytes)=>memory.set(at,Buffer.from(bytes)),read:async(at,size)=>memory.get(at).subarray(0,size),close:async h=>handles.delete(h),
  ipc:async(label,handle,command,input,extra)=>{
   calls.push({label,handle,command,input});
   if(handle===10){assert.equal(command,18);return options.noSD?reply(0x202):allocate({kind:'fs',files:sd});}
   const item=handles.get(handle);
   if(item.kind==='dir') {
    assert.equal(command,0);assert.equal(extra.receive[0].size,64*0x310);
    const items=item.done?[]:[...item.files];item.done=true;const bytes=Buffer.alloc(64*0x310);
    items.forEach(([name,value],i)=>{bytes.write(name.slice(1),i*0x310);bytes[i*0x310+0x304]=Buffer.isBuffer(value)?1:0;bytes.writeBigUInt64LE(BigInt(Buffer.isBuffer(value)?value.length:0),i*0x310+0x308);});
    memory.set(extra.receive[0].address,bytes);return reply(0,items.length);
   }
   assert.equal(item.kind,'file');
   if(command===1){writes++;if(options.failWrite)throw Error('Native write timed out');const bytes=memory.get(extra.send[0].address);bytes.copy(item.files.get(item.name),Number(input.readBigUInt64LE(8)));return reply();}
   assert.equal(command,2);return reply();
  }},domain:{oneHandle:r=>r.moves[0],send:async(s,label,handle,packet)=>{
   const command=packet.readUInt32LE(24),text=memory.get(s.base+0x2000).toString().split('\0')[0];
   assert.equal(packet.readUInt32LE(0),4|1<<16);calls.push({label,handle,command});
   if(handle===10){assert.equal(command,11);assert.equal(packet.readUInt32LE(32),30);assert.equal(text,'');return allocate({kind:'fs',files:user});}
   const files=handles.get(handle).files;
   if(files.has(text))return reply(0x402);
   if(command===2){files.set(text,null);return reply();}
   assert.equal(command,0);assert.equal(packet.readUInt32LE(32),0);created++;files.set(text,Buffer.alloc(Number(packet.readBigUInt64LE(40))));return reply();
  }},filesystem:{
   pathMethod:async(s,handle,command,name,input)=>{
    const files=handles.get(handle).files;
    if(command===7)return files.has(name)?reply(0,Buffer.isBuffer(files.get(name))?1:0):reply(0x202);
    if(command===9){assert.equal(name,'/');return allocate({kind:'dir',files,done:false});}
    assert.equal(command,8);assert.equal(input.readUInt32LE(),3);return files.has(name)?allocate({kind:'file',files,name}):reply(0x202);
   },
   openFile:async(s,handle,name)=>{const files=handles.get(handle).files;return files.has(name)?allocate({kind:'file',files,name}):reply(0x202);},
   fileSize:async(s,handle)=>{const item=handles.get(handle);return BigInt(item.files.get(item.name).length);},
   readFile:async(s,handle,offset,size)=>{const item=handles.get(handle);return Buffer.from(item.files.get(item.name).subarray(offset,offset+size));},
   nativeHash:async(s,address,count)=>sha(memory.get(address).subarray(0,count))}};
 return {work,a,options,sd,user,calls,handles,get created(){return created;},get writes(){return writes;}};
}
test('FTP exposes only SD and USER filesystem 30 and closes temporary directory/file handles',async t=>{
 const f=await fixture(t),adapter=await mountStorage(f.a);
 assert.deepEqual(adapter.scopes,['SD','Interno']);assert.equal(f.handles.size,2);
 assert.deepEqual((await adapter.list('/')).map(e=>e.name),['SD','Interno']);
 assert.deepEqual((await adapter.list('/SD')).map(e=>e.name),['old.bin']);
 assert.deepEqual(await adapter.stat('/Interno/info.bin'),{type:'file',size:8});
 const chunks=[];for await(const bytes of adapter.read('/SD/old.bin',2))chunks.push(bytes);
 assert.equal(Buffer.concat(chunks).toString(),'iginal');assert.equal(f.handles.size,2);
 await assert.rejects(adapter.stat('/SYSTEM/secret'),/indisponível/);
});
test('SD can be unavailable without inventing an accessible root',async t=>{
 const f=await fixture(t,{noSD:true}),adapter=await mountStorage(f.a);
 assert.deepEqual(adapter.scopes,['Interno']);assert.equal(adapter.unavailable.length,1);
});
test('FTP rejects all mutations in read-only mode and rejects USER writes even with SD enabled',async t=>{
 const f=await fixture(t),ro=await mountStorage(f.a);
 await assert.rejects(ro.canUpload('/SD/new.nro'),/somente/);await assert.rejects(ro.mkdir('/SD/new'),/somente/);
 const rw=await mountStorage(f.a,{upload:true});await assert.rejects(rw.canUpload('/Interno/new.nro'),/somente/);
 assert.equal(f.created,0);assert.equal(f.writes,0);
});
test('exclusive new SD upload is flushed, re-read and hashed; existing files are never overwritten',async t=>{
 const f=await fixture(t),adapter=await mountStorage(f.a,{upload:true}),bytes=Buffer.alloc(0x22000,7);
 const file=path.join(f.work,'upload.bin'),journal=path.join(f.work,'report.json');await fs.writeFile(file,bytes);
 await adapter.uploadNew('/SD/new.nro',file,sha(bytes),bytes.length,journal);
 assert.deepEqual(f.sd.get('/new.nro'),bytes);assert.equal(f.created,1);assert.equal(f.writes,3);assert.equal(f.handles.size,2);
 assert.equal(JSON.parse(await fs.readFile(journal)).complete,true);
 await assert.rejects(adapter.uploadNew('/SD/old.bin',file,sha(bytes),bytes.length,journal),/Já existe/);
 assert.equal(f.sd.get('/old.bin').toString(),'original');assert.equal(f.created,1);
 await adapter.mkdir('/SD/new-folder');assert.ok(f.sd.has('/new-folder'));
});
test('uncertain upload stops on the first failed write and leaves an incomplete report',async t=>{
 const f=await fixture(t,{failWrite:true}),adapter=await mountStorage(f.a,{upload:true}),bytes=Buffer.alloc(100,3);
 const file=path.join(f.work,'upload.bin'),journal=path.join(f.work,'report.json');await fs.writeFile(file,bytes);
 await assert.rejects(adapter.uploadNew('/SD/new.nro',file,sha(bytes),bytes.length,journal),e=>e.ftpUnsafe&&!e.ftpCode);
 assert.equal(f.writes,1);assert.equal(JSON.parse(await fs.readFile(journal)).complete,false);assert.equal(f.handles.size,2);
});
test('virtual paths never resolve PC paths, NUL, backslashes or line injection',()=>{
 assert.equal(virtualPath('/SD/a','../../Interno'),'/Interno');
 for(const name of ['x\\y','x\0y','x\r\ny'])assert.throws(()=>virtualPath('/',name));
});
async function lifecycle(t) {
 const run=await fs.mkdtemp(path.join(os.tmpdir(),'ftp-lifecycle-'));t.after(()=>fs.rm(run,{recursive:true,force:true}));
 const previous=process.exitCode;t.after(()=>{process.exitCode=previous;});
 await fs.writeFile(path.join(run,'result.json'),JSON.stringify({verified:true,rpc:{state:'listening'}}));
 const events=[],order=[],controller=new AbortController(),a={s:{base:100,handles:new Set(),threads:new Set()},close:async()=>{order.push('attachment');a.s.base=0;}};
 return {run,events,order,controller,a,send:(kind,data)=>{events.push({kind,...data});if(kind==='ftp_ready')controller.abort();}};
}
test('unmount closes server before filesystem resources, releases the lock and keeps the session usable',async t=>{
 const f=await lifecycle(t);
 await require('./painel-ftp.cjs').main([f.run,'read-only'],{send:f.send,signal:f.controller.signal,attach:async()=>f.a,
  mount:async()=>({scopes:['SD'],unavailable:[]}),serve:async()=>({url:'ftp://127.0.0.1:30000/',close:async()=>f.order.push('server')})});
 assert.deepEqual(f.order,['server','attachment']);assert.equal(f.events.at(-1).kind,'complete');
 await assert.rejects(fs.access(path.join(f.run,'painel-operation.lock')));
 await assert.rejects(fs.access(path.join(f.run,'painel-session-invalid.json')));
});
test('a received mounting refusal is reusable only after clean resources and a successful health check',async t=>{
 const f=await lifecycle(t);
 await require('./painel-ftp.cjs').main([f.run,'read-only'],{send:f.send,attach:async()=>f.a,
  mount:async()=>{throw Object.assign(Error('mount refused'),{nativeRefusal:true});},probe:async()=>true});
 assert.equal(f.events.at(-1).kind,'error');assert.equal(f.events.at(-1).requiresRestart,false);
 await assert.rejects(fs.access(path.join(f.run,'painel-session-invalid.json')));
});
test('an upload failure after creation cannot be reclassified as a harmless mounting refusal',async t=>{
 const f=await lifecycle(t);let probed=false;
 await require('./painel-ftp.cjs').main([f.run,'sd-new-files'],{send:(kind,data)=>f.events.push({kind,...data}),attach:async()=>f.a,
  mount:async()=>({scopes:['SD'],unavailable:[]}),probe:async()=>{probed=true;return true;},
  serve:async(adapter,options)=>{queueMicrotask(()=>options.onFatal(Object.assign(Error('partial file write'),{nativeRefusal:true,ftpUnsafe:true})));return {url:'ftp://127.0.0.1:30000/',close:async()=>{}};}});
 assert.equal(probed,false);assert.equal(f.events.at(-1).requiresRestart,true);
 await fs.access(path.join(f.run,'painel-session-invalid.json'));
});
