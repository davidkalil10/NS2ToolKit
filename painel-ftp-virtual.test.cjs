const test=require('node:test');
const assert=require('node:assert/strict');
const {fileSystemView}=require('./painel-ftp-fs.cjs');
const {fixture,title,label,otherLabel}=require('./test-ftp-virtual-fixture.cjs');
test('virtual roots and names are lazy and never mount every title',async()=>{
 const f=await fixture();assert.deepEqual((await f.adapter.list('/')).map(e=>e.name),['SD','Interno','Jogos','Saves']);assert.equal(f.calls.length,0);
 assert.equal((await f.adapter.list('/Jogos'))[0].name,label);assert.deepEqual(f.calls,['games']);
 assert.equal((await f.adapter.list('/Jogos/'+label))[0].name,'Base');assert.ok(f.calls.includes('base'));assert.equal(f.calls.some(c=>c.command===53||c.section),false);
 await f.adapter.list('/Jogos/'+otherLabel);assert.equal(f.factoryCount,1,'one loader helper across games');await f.adapter.close();
});
test('save archives stay distinct by user and archive; command 53 is read-only and closes on switch',async()=>{
 const f=await fixture(),root='/Saves/'+label;
 const entries=await f.adapter.list(root);assert.equal(entries.length,3);assert.equal(new Set(entries.map(e=>e.name)).size,3);
 const path=root+'/'+entries[1].name;const rows=await f.adapter.list(path);assert.equal(rows[0].name,'FireRed_e.sav');
 const request=f.calls.find(c=>c.command===53);assert.equal(request.input[0],1);assert.equal(request.input.readBigUInt64LE(8),BigInt('0x'+title));assert.equal(request.input.subarray(16,32).toString('hex'),'02'.repeat(16));
 const chunks=[];for await(const b of f.adapter.read(path+'/FireRed_e.sav',5))chunks.push(b);assert.deepEqual(Buffer.concat(chunks),f.data.subarray(5));
 await f.adapter.list(root+'/'+entries[2].name);assert.equal(f.closes.length,1);await f.adapter.close();assert.equal(f.closes.length,2);
});
test('RomFS browsing reads the selected file offsets and primes update original without opening base',async()=>{
 const f=await fixture(),base='/Jogos/'+label+'/Atualizações/65536/programa 0/romfs';
 assert.deepEqual((await f.adapter.list(base)).map(e=>e.name),['folder']);
 const pieces=[];for await(const b of f.adapter.read(base+'/folder/game.bin',4))pieces.push(b);
 assert.deepEqual(Buffer.concat(pieces),f.romData.subarray(4));assert.equal(f.calls.filter(c=>c.section).length,1);assert.ok(f.calls.find(c=>c.section).update);
 const stat=await f.adapter.stat(base+'/folder/game.bin');assert.equal(stat.size,f.romData.length);
 await f.adapter.list('/Jogos/'+label+'/Base/programa 0/control');assert.equal(f.closes.length,1);await f.adapter.close();assert.equal(f.closes.length,2);
});
test('all virtual mutations are rejected even with SD uploads available',async()=>{
 const f=await fixture();for(const p of ['/Saves/new','/Jogos/new','/sAvEs/new']){
  await assert.rejects(f.adapter.canUpload(p),e=>e.ftpCode===550);
  await assert.rejects(f.adapter.mkdir(p),e=>e.ftpCode===550);
  await assert.rejects(f.adapter.uploadNew(p),e=>e.ftpCode===550);
 }
 assert.equal(f.physicalWrites.length,0);await f.adapter.canUpload('/SD/new');assert.equal(f.physicalWrites.length,1);
});
test('known refusal is local; transport and cleanup failures remain fatal',async()=>{
 const f=await fixture({gameError:Object.assign(Error('CodeFS refused'),{nativeResult:{canonical:0x408}})});
 await assert.rejects(f.adapter.list('/Jogos/'+label+'/Base/programa 0/exefs'),e=>e.ftpCode===550);
 assert.equal((await f.adapter.list('/'))[0].name,'SD');
 const transport=await fixture({gameError:Error('RPC timeout')});
 await assert.rejects(transport.adapter.list('/Jogos/'+label+'/Base/programa 0/exefs'),e=>!e.ftpCode&&/timeout/.test(e.message));
 const cleanup=await fixture({gameError:new AggregateError([Error('refused'),Error('close failed')],'cleanup failed')});
 await assert.rejects(cleanup.adapter.list('/Jogos/'+label+'/Base/programa 0/exefs'),e=>e instanceof AggregateError&&!e.ftpCode);
});
test('patched manual refusal does not open it or stop other sections',async()=>{
 const f=await fixture();await assert.rejects(f.adapter.list('/Jogos/'+label+'/Atualizações/65536/programa 0/manual'),e=>e.ftpCode===550);
 assert.equal(f.calls.some(c=>c.section==='manual'),false);await f.adapter.list('/Jogos/'+label+'/Base/programa 0/romfs');await f.adapter.close();
});
test('missing installed license is prepared once with the existing backup helper, without retry loops',async()=>{
 let attempts=0,prepared=0;
 const f=await fixture({dependencies:{prepareLicense:async args=>{prepared++;assert.equal(args.title,title);assert.equal(args.source.contentPath,'@test');},
  gameFiles:()=>({open:async()=>{attempts++;if(attempts===1)throw Object.assign(Error('license missing'),{nativeResult:{canonical:0x7d802},source:{contentPath:'@test'}});return {kind:'filesystem',handle:88};},close:async()=>{}})}});
 await f.adapter.list('/Jogos/'+label+'/Base/programa 0/exefs');assert.equal(attempts,2);assert.equal(prepared,1);await f.adapter.close();
 let failedAttempts=0,failedPrepared=0;
 const bad=await fixture({dependencies:{prepareLicense:async()=>{failedPrepared++;},gameFiles:()=>({open:async()=>{failedAttempts++;throw Object.assign(Error('license still missing'),{nativeResult:{canonical:0x7d802},source:{contentPath:'@test'}});},close:async()=>{}})}});
 await assert.rejects(bad.adapter.list('/Jogos/'+label+'/Base/programa 0/exefs'),e=>e.ftpCode===550);
 assert.equal(failedAttempts,2);assert.equal(failedPrepared,1);
});
test('read-only filesystem view closes file handles on resumed download and iterator cancellation',async()=>{
 const closed=[],bytes=Buffer.alloc(0x40010,3);const a={s:{close:async h=>closed.push(h)},filesystem:{openFile:async()=>({result:0,handle:9}),fileSize:async()=>bytes.length,readFile:async(s,h,off,len)=>bytes.subarray(off,off+len)}};
 const view=fileSystemView(a,8),chunks=[];for await(const b of view.read('/file',7))chunks.push(b);assert.deepEqual(Buffer.concat(chunks),bytes.subarray(7));assert.deepEqual(closed,[9]);
 for await(const b of view.read('/file'))break;assert.deepEqual(closed,[9,9]);
});
test('backend catalog lifecycle closes the virtual adapter before attachment cleanup',async t=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const run=await fs.mkdtemp(path.join(os.tmpdir(),'ftp-virtual-life-'));t.after(()=>fs.rm(run,{recursive:true,force:true}));
 await fs.writeFile(path.join(run,'result.json'),JSON.stringify({verified:true,rpc:{state:'listening'}}));
 const controller=new AbortController(),order=[],a={s:{base:1,handles:new Set(),threads:new Set()},close:async()=>{order.push('attachment');a.s.base=0;}};
 await require('./painel-ftp.cjs').main([run,'read-only','catalog'],{signal:controller.signal,attach:async()=>a,mount:async()=>({}),
  browse:async()=>({scopes:['Jogos','Saves'],unavailable:[],close:async()=>order.push('virtual')}),
  serve:async()=>({url:'ftp://127.0.0.1:12345/',close:async()=>order.push('server')}),send:kind=>{if(kind==='ftp_ready')controller.abort();}});
 assert.deepEqual(order,['server','virtual','attachment']);await assert.rejects(fs.access(path.join(run,'painel-operation.lock')));
});
