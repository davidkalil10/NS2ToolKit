const assert=require('node:assert/strict');
const {virtualStorage}=require('./painel-ftp-virtual.cjs');
const {fileSystemView}=require('./painel-ftp-fs.cjs');
const {createServer}=require('./painel-ftp-server.cjs');
const {gameLabel}=require('./painel-names.cjs');
const title='0100554023408000',other='0100554023409000';
const label=gameLabel('Pokémon FireRed',title),otherLabel=gameLabel('Outro jogo',other);
async function fixture(options={}){
 const calls=[],closes=[],originals=[],physicalWrites=[],data=Buffer.from('save editado'),romData=Buffer.from('ROM contents');
 const entry={id:'42',space:1,type:1,rank:0,index:0,uid:'01'.repeat(16),title,size:'100'};
 let next=100,factoryCount=0;
 const a={root:5,s:{base:1000,ipc:async(name,handle,command,input)=>{calls.push({name,command,input});assert.equal(command,53);return {result:options.saveRefusal?0x202:0,handle:++next};},close:async handle=>closes.push(handle)},domain:{oneHandle:r=>r.handle}};
 const physical={scopes:['SD','Interno'],unavailable:[],list:async()=>[{name:'SD',type:'directory',size:0},{name:'Interno',type:'directory',size:0}],stat:async()=>({type:'directory',size:0}),
  read:async function*(){yield Buffer.from('sd');},canUpload:async p=>physicalWrites.push(p),mkdir:async p=>physicalWrites.push(p),uploadNew:async p=>physicalWrites.push(p)};
 const base={storage:4,version:0,contentTitle:title,contents:[{contentType:1,programIndex:0},{contentType:3,programIndex:0}]};
 const update={storage:4,version:65536,contentTitle:title,contents:[{contentType:1,programIndex:0},{contentType:4,programIndex:0}]};
 const deps={discover:async()=>{calls.push('games');return [{title,name:'Pokémon FireRed'},{title:other,name:'Outro jogo'}];},
  inventory:async()=>{calls.push('saves');return [entry,{...entry,id:'43',uid:'02'.repeat(16)},{...entry,id:'44',type:3,uid:'0'.repeat(32)}];},
  discoverBase:async()=>{calls.push('base');return [base];},discoverUpdates:async()=>[update],discoverDlc:async()=>[],discoverDataPatches:async()=>[],
  resolveContent:async args=>({programIndex:args.content.programIndex,contentType:1,selection:'base',marker:'original'}),
  gameFiles:(attachment,settings)=>{factoryCount++;originals.push(settings.originals);return {
   open:async args=>{calls.push(args);if(args.update)assert.equal(settings.originals.get(0)?.marker,'original');if(options.gameError)throw options.gameError;
    return {handle:++next,kind:args.section==='romfs'?'storage':'filesystem',size:100};},
   read:async(mount,offset,length)=>romData.subarray(offset-8,offset-8+length),close:async mount=>closes.push(mount.handle)};},
  romfs:async()=>[{path:'/folder',type:'directory',size:0},{path:'/folder/game.bin',type:'file',size:romData.length,offset:8}],
  fsView:()=>({stat:async()=>({type:'file',size:data.length}),list:async()=>[{name:'FireRed_e.sav',type:'file',size:data.length}],read:async function*(filename,offset){yield data.subarray(offset);}})};
 const adapter=await virtualStorage(a,physical,{...deps,...options.dependencies});
 return {adapter,a,calls,closes,entry,data,romData,physicalWrites,get factoryCount(){return factoryCount;}};
}

module.exports={fixture,title,label,otherLabel};
if(require.main===module){
 (async()=>{
  const f=await fixture(),server=await createServer(f.adapter,{upload:true,staging:process.argv[2]});
  console.log(JSON.stringify({port:Number(new URL(server.url).port),label}));
  let stopped=false;
  async function stop(){if(stopped)return;stopped=true;await server.close();await f.adapter.close();process.stdin.destroy();}
  process.stdin.on('data',()=>stop().catch(error=>{console.error(error);process.exitCode=1;}));
 })().catch(error=>{console.error(error);process.exitCode=1;});
}
