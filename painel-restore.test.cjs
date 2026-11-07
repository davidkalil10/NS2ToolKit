const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const reader = require('./painel-save-reader.cjs');
const restore = require('./painel-save-restore.cjs');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ns2-restore-'));
  t.after(() => fs.rm(root,{recursive:true,force:true}));
  const run = path.join(root,'run'), source = path.join(root,'source'), parent = path.join(root,'jobs');
  await fs.mkdir(run); await fs.mkdir(path.join(source,'data'),{recursive:true});
  const entry = {id:'123',space:1,type:1,rank:0,index:0,title:'0100554023408000',uid:'1'.repeat(32)};
  const old = Buffer.alloc(options.large ? 0x21000 : 8,1), edited = Buffer.alloc(old.length,2), untouched = Buffer.from('keep');
  const live = new Map([['/FireRed_e.sav',old],['/transaction.sav',untouched]]), calls = [];
  const manifest = {format:'ns2toolkit-save-v1',complete:true,dataVerified:true,cleanupConfirmed:true,name:'Synthetic FireRed',archive:entry,directories:[],
    entries:[...live].map(([name,bytes]) => ({path:name,local:'data/'+name.slice(1),size:bytes.length,sha256:sha(bytes)}))};
  await fs.writeFile(path.join(source,'manifest.json'),JSON.stringify(manifest));
  await fs.writeFile(path.join(source,'data/FireRed_e.sav'),edited);
  await fs.writeFile(path.join(source,'data/transaction.sav'),untouched);
  t.mock.method(reader,'inventory',async () => [entry]);
  let writing = 0, attachCount = 0;
  async function attach() {
    attachCount++;
    const objects = new Map(), buffers = new Map(); let next = 20;
    const s = {base:0x100000,bytes:0x80000,threads:new Set(),handles:new Set([10]),
      write:async (at,bytes) => buffers.set(at,Buffer.from(bytes)),
      close:async handle => {if (options.closeFails) throw Error('close failed'); objects.delete(handle); s.handles.delete(handle);},
      ipc:async (label,handle,command,input,extra) => {
        calls.push({label,command,handle});
        if (handle === 10 && [51,53].includes(command)) {
          assert.equal(input.length,0x48); assert.equal(input[0],entry.space);
          assert.equal(input.readBigUInt64LE(8),BigInt('0x'+entry.title));
          assert.equal(input.subarray(16,32).toString('hex'),entry.uid);
          assert.equal(input[0x28],entry.type); assert.equal(input[0x29],entry.rank); assert.equal(input.readUInt16LE(0x2a),entry.index);
          const id = next++; objects.set(id,{kind:'fs',writable:command===51,data:command===51 ? new Map([...live].map(([k,v]) => [k,Buffer.from(v)])) : live});
          s.handles.add(id); return {result:0,moves:[id]};
        }
        const object = objects.get(handle); assert.ok(object,'owned handle');
        if (command === 10 && object.kind === 'fs') {
          if (options.commitFails) return {result:99};
          for (const [name,bytes] of object.data) live.set(name,Buffer.from(bytes));
          if (options.corruptCommitted) live.get('/FireRed_e.sav')[0] ^= 255;
          return {result:0};
        }
        if (object.kind === 'file' && command === 1) {
          writing++;
          const chunk = buffers.get(extra.send[0].address);
          assert.equal(input.length,24); assert.equal(input.readBigUInt64LE(0),0n);
          assert.equal(input.readBigUInt64LE(16),BigInt(chunk.length)); assert.equal(extra.send[0].mode,1);
          chunk.copy(object.fs.data.get(object.name),Number(input.readBigUInt64LE(8)));
          if (options.onWrite) options.onWrite();
          if (options.writeTimeout) throw Error('Write timed out');
          return {result:0};
        }
        if (object.kind === 'file' && command === 2) return {result:0};
        throw Error('unexpected IPC '+command);
      }};
    const open = (save,name) => {
      const filesystem = objects.get(save); if (!filesystem.data.has(name)) return {result:0x202};
      const id = next++; objects.set(id,{kind:'file',fs:filesystem,name}); s.handles.add(id);
      return {result:0,handle:id,moves:[id]};
    };
    return {s,root:10,domain:{oneHandle:reply => reply.moves[0]},filesystem:{
      openFile:async (s,save,name) => open(save,name),
      pathMethod:async (s,save,command,name,input) => {assert.equal(command,8); assert.equal(input.readUInt32LE(),3); return open(save,name);},
      listDirectory:async (s,save,dir) => {assert.equal(dir,'/'); return [...objects.get(save).data].map(([name,bytes])=>({name:name.slice(1),type:1,size:String(bytes.length)}));},
      fileSize:async (s,file) => BigInt(objects.get(file).fs.data.get(objects.get(file).name).length),
      readFile:async (s,file,offset,size) => Buffer.from(objects.get(file).fs.data.get(objects.get(file).name).subarray(offset,offset+size)),
      nativeHash:async (s,buffer,count) => options.badUpload ? '0'.repeat(64) : sha(buffers.get(buffer).subarray(0,count))},
      close:async () => {if (options.closeFails || options.attachmentCloseFails) throw Error('close failed'); objects.clear(); s.handles.clear(); s.base = 0;}};
  }
  const prepare = () => restore.prepare({run,source,parent,selected:['/FireRed_e.sav'],allowEdited:true,attach});
  return {root,run,source,parent,entry,old,edited,untouched,live,calls,options,attach,prepare,get writing(){return writing;},get attachCount(){return attachCount;}};
}
test('edited payload requires acknowledgement and never rewrites the original manifest',async t => {
  const f = await fixture(t), before = await fs.readFile(path.join(f.source,'manifest.json'));
  const info = await restore.inspect(f.source);
  assert.equal(info.files[0].edited,true); assert.equal(info.files[1].edited,false);
  await assert.rejects(restore.prepare({...f,selected:['/FireRed_e.sav'],allowEdited:false}),/Confirme/);
  assert.equal(f.attachCount,0); assert.deepEqual(await fs.readFile(path.join(f.source,'manifest.json')),before);
});
test('restore snapshots live bytes first, commits once, reopens and verifies all files without changing unselected data',async t => {
  const f = await fixture(t), plan = await f.prepare();
  assert.deepEqual(await fs.readFile(path.join(plan.backupFolder,'data/FireRed_e.sav')),f.old);
  const result = await restore.apply({...f,...plan,confirmed:true});
  assert.deepEqual(f.live.get('/FireRed_e.sav'),f.edited); assert.deepEqual(f.live.get('/transaction.sav'),f.untouched);
  assert.equal(f.calls.filter(c=>c.command===10).length,1);
  const report = JSON.parse(await fs.readFile(result.reportPath)); assert.equal(report.complete,true); assert.equal(report.verified,true);
  await assert.rejects(restore.apply({...f,...plan,confirmed:true}),/já foi executado/);
});
test('confirmation, plan hash, payload and original pre-backup integrity are required before attaching for write',async t => {
  const f = await fixture(t), plan = await f.prepare();
  await assert.rejects(restore.apply({...f,...plan,confirmed:false}),/confirmação/);
  await assert.rejects(restore.apply({...f,...plan,planSha256:'0'.repeat(64),confirmed:true}),/plano mudou/);
  await fs.writeFile(path.join(path.dirname(plan.planPath),'payload/0.bin'),f.old);
  await assert.rejects(restore.apply({...f,...plan,confirmed:true}),/divergente/);
  assert.equal(f.attachCount,1); assert.equal(f.writing,0);
});
test('live changes after preparing are refused before any write',async t => {
  const f = await fixture(t), plan = await f.prepare(); f.live.set('/transaction.sav',Buffer.from('diff'));
  await assert.rejects(restore.apply({...f,...plan,confirmed:true}),e => e.restoreRefusal && !e.writesStarted && /mudou/.test(e.message));
  assert.equal(f.writing,0); assert.equal(f.calls.filter(c=>c.command===10).length,0);
});
test('write timeout is never replayed and no commit is attempted',async t => {
  const f = await fixture(t,{writeTimeout:true}), plan = await f.prepare();
  await assert.rejects(restore.apply({...f,...plan,confirmed:true}),e => e.writesStarted && /timed out/.test(e.message));
  assert.equal(f.writing,1); assert.equal(f.calls.filter(c=>c.command===10).length,0);
  assert.deepEqual(await fs.readFile(path.join(plan.backupFolder,'data/FireRed_e.sav')),f.old);
});
test('commit failure and post-commit read mismatch never produce completion',async t => {
  for (const options of [{commitFails:true},{corruptCommitted:true}]) {
    const f = await fixture(t,options), plan = await f.prepare();
    await assert.rejects(restore.apply({...f,...plan,confirmed:true}),e=>e.writesStarted);
    const report = JSON.parse(await fs.readFile(path.join(path.dirname(plan.planPath),'restore-report.json')));
    assert.equal(report.complete,false); assert.equal(report.verified,false);
  }
});
test('cancellation after writing begins finishes one commit and verification instead of interrupting the transaction',async t => {
  let stop = false;
  const f = await fixture(t,{large:true,onWrite:()=>{stop=true;}}), plan = await f.prepare();
  const result = await restore.apply({...f,...plan,confirmed:true,stop:()=>stop});
  assert.equal(f.writing,3); assert.equal(JSON.parse(await fs.readFile(result.reportPath)).complete,true);
});
test('bad upload hash stops before a file write and missing confirmation never attaches',async t => {
  const f = await fixture(t,{badUpload:true}), plan = await f.prepare();
  await assert.rejects(restore.apply({...f,...plan,confirmed:true}),/envio do bloco/);
  assert.equal(f.writing,0); assert.equal(f.calls.filter(c=>c.command===10).length,0);
});
test('backup paths, nested preparation inside source, resized edits and identity mismatch are rejected',async t => {
  const f = await fixture(t);
  await assert.rejects(restore.prepare({...f,parent:path.join(f.source,'.hidden'),selected:['/FireRed_e.sav'],allowEdited:true}),/fora do backup/);
  await fs.writeFile(path.join(f.source,'data/FireRed_e.sav'),Buffer.from('wrong size'));
  await assert.rejects(restore.inspect(f.source),/tamanho original/);
  await fs.writeFile(path.join(f.source,'data/FireRed_e.sav'),f.edited);
  const file = path.join(f.source,'manifest.json'), m = JSON.parse(await fs.readFile(file));
  m.entries[0].local = '../outside'; await fs.writeFile(file,JSON.stringify(m));
  await assert.rejects(restore.inspect(f.source),/Entrada de backup/);
});
test('modified pre-backup data and a different session are refused before native write access',async t => {
  const f = await fixture(t), plan = await f.prepare(), otherRun = path.join(f.root,'other-run'); await fs.mkdir(otherRun);
  await assert.rejects(restore.apply({...f,...plan,run:otherRun,confirmed:true}),/outra sessão/);
  await fs.writeFile(path.join(plan.backupFolder,'data/transaction.sav'),Buffer.from('oops'));
  await assert.rejects(restore.apply({...f,...plan,confirmed:true}),/integridade/);
  assert.equal(f.attachCount,1); assert.equal(f.writing,0);
});
test('source edits after preparing do not replace the frozen and confirmed payload',async t => {
  const f = await fixture(t), plan = await f.prepare();
  await fs.writeFile(path.join(f.source,'data/FireRed_e.sav'),f.old);
  await restore.apply({...f,...plan,confirmed:true});
  assert.deepEqual(f.live.get('/FireRed_e.sav'),f.edited);
});
test('different target user is rejected and failed cleanup never creates a usable prepared plan',async t => {
  const f = await fixture(t);
  t.mock.method(reader,'inventory',async () => [{...f.entry,uid:'2'.repeat(32)}]);
  await assert.rejects(f.prepare(),e=>e.restoreRefusal && /usuário/.test(e.message));
  assert.equal(f.writing,0);
});
test('selected destination from the console must agree with the backup before any attach',async t => {
  const f = await fixture(t);
  await assert.rejects(restore.prepare({...f,selected:['/FireRed_e.sav'],allowEdited:true,targetId:'999'}),/destino selecionado/);
  assert.equal(f.attachCount,0); assert.equal(f.writing,0);
});
test('cleanup failure after committed verified bytes still prevents completion',async t => {
  const f = await fixture(t), plan = await f.prepare(); f.options.attachmentCloseFails = true;
  await assert.rejects(restore.apply({...f,...plan,confirmed:true}),e=>e.writesStarted && e.cleanupErrors.length>0);
  const report = JSON.parse(await fs.readFile(path.join(path.dirname(plan.planPath),'restore-report.json')));
  assert.equal(report.committed,true); assert.equal(report.verified,true); assert.equal(report.cleanupConfirmed,false); assert.equal(report.complete,false);
});
