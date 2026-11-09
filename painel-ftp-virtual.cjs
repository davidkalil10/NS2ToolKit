const {virtualPath,denied}=require('./painel-ftp-storage.cjs');
const {fileSystemView}=require('./painel-ftp-fs.cjs');
const {gameLabel}=require('./painel-names.cjs');
const saves=require('./painel-save-reader.cjs');
const content=require('./tools/OunceCake/engine/content.cjs');
const {build}=require('./tools/ns2-savekit/tools/lib/save-attr.cjs');
const {resultError}=require('./tools/OunceCake/engine/protocol.cjs');
const {createGameFiles,readRomfs}=require('./compat/ouncecake/mounts.cjs');
const {prepareInstalledLicense}=require('./compat/ouncecake/program.cjs');
const directory=name=>({name,type:'directory',size:0});
const key=value=>value.normalize('NFC').toLowerCase();
const sections=[['meta'],['romfs','exefs','logo'],['romfs'],['control'],['manual'],['legal']];
async function virtualStorage(a,physical,{stop=()=>false,send=()=>{},discover=content.discoverGames,inventory=saves.inventory,
  discoverBase=content.discoverBase,discoverUpdates=content.discoverUpdates,discoverDlc=content.discoverDlc,
  discoverDataPatches=content.discoverDataPatches,resolveContent=content.resolveContent,gameFiles=createGameFiles,
  prepareLicense=prepareInstalledLicense,romfs=readRomfs,fsView=fileSystemView}={}){
  let games,archives,active,sharedFiles,closed=false;
  const originalPrograms=new Map(),originalDocuments=new Map();
  const catalogs=new Map();
  const preparedLicenses=new Set();
  function cancelled(){if(closed||stop())throw Object.assign(Error('FTP encerrado.'),{ftpStop:true});}
  async function closeActive(){const old=active;active=null;if(old)await old.close();}
  async function knownFailure(operation){
    try{return await operation();}catch(error){
      // Only explicit, cleaned-up native refusals are recoverable. Transport and
      // AggregateError cleanup failures must reach the FTP session supervisor.
      if(error.nativeResult&&[0x202,0x408,0x7d202,0x7d802].includes(error.nativeResult.canonical)){
        send('status',{message:'Conteúdo indisponível: '+error.message});throw denied(error.message);
      }
      throw error;
    }
  }
  async function gameInventory(){
    cancelled();if(games)return games;
    send('status',{message:'Lendo nomes dos jogos...'});
    const rows=await knownFailure(()=>discover({...a,shouldStop:stop})),seen=new Set();
    games=rows.map(row=>{
      const title=String(row.title).toLowerCase(),name=gameLabel(row.name,title);
      if(seen.has(key(name)))throw Error('Identidade de jogo duplicada.');seen.add(key(name));return {...row,title,label:name};
    });return games;
  }
  async function saveInventory(){
    cancelled();if(archives)return archives;
    const byTitle=new Map((await gameInventory()).map(g=>[g.title,g]));
    send('status',{message:'Consultando saves de usuário...'});
    const rows=(await knownFailure(()=>inventory(a,stop))).filter(saves.supported);
    archives=rows.map(row=>({...row,gameLabel:byTitle.get(row.title)?.label||gameLabel(null,row.title),
      label:(row.type===3?'Compartilhado':row.uid==='0'.repeat(32)?'Usuário comum':'Usuário '+row.uid)+' - '+(row.rank?'Secundário':'Principal')+' - índice '+row.index+' [save '+row.id+']'}));
    if(new Set(archives.map(row=>key(row.gameLabel+'/'+row.label))).size!==archives.length)throw Error('Identidade de save duplicada.');
    return archives;
  }
  async function gameCatalog(game){
    cancelled();if(catalogs.has(game.title))return catalogs.get(game.title);
    send('status',{message:'Consultando conteúdo de '+game.label+'...'});
    const options={...a,title:game.title},bases=await knownFailure(()=>discoverBase(options));cancelled();
    const updates=await knownFailure(()=>discoverUpdates(options));cancelled();
    const dlcs=await knownFailure(()=>discoverDlc(options));cancelled();
    const patches=await knownFailure(()=>discoverDataPatches(options));cancelled();
    const nodes=new Map([['',{path:'',kind:'directory'}]]),originals=originalPrograms,originalManuals=originalDocuments;
    const files=sharedFiles ||= gameFiles(a,{experimentalProgram1:true,originals,originalManuals});
    function add(path,descriptor){
      const folded=key(path);let node=nodes.get(folded);
      if(descriptor){if(node?.descriptor)node.descriptor.candidates.push(...descriptor.candidates);else nodes.set(folded,{path,kind:'section',descriptor});}
      else if(!node)nodes.set(folded,{path,kind:'directory'});
      const parent=path.includes('/')?path.slice(0,path.lastIndexOf('/')):'';
      if(path)add(parent);
    }
    function addRecords(prefix,record,field){
      for(const item of record.contents){
        if(item.contentType===6)continue;
        const types=sections[item.contentType];if(!types)throw Error('Tipo de conteúdo não suportado: '+item.contentType);
        const collision=record.contents.some(c=>c.programIndex===item.programIndex&&[1,2].includes(c.contentType)&&c.contentType!==item.contentType)&&[1,2].includes(item.contentType);
        for(const section of types){
          const path=prefix+'/programa '+item.programIndex+(collision?(item.contentType===1?'/program':'/data'):'')+'/'+section;
          add(path,{section,candidates:[{title:game.title,storage:record.storage,[field]:record,content:item}]});
        }
      }
    }
    for(const row of bases)addRecords('Base',row,'base');
    for(const row of updates)addRecords('Atualizações/'+row.version,row,'update');
    for(const row of dlcs)addRecords('DLC/'+row.contentTitle+'/'+row.version+'/Base',row,'dlc');
    for(const row of patches){
      const originals=dlcs.filter(d=>d.contentTitle===row.dataTitle&&(!d.dataPatchTitle||d.dataPatchTitle===row.contentTitle));
      if(!originals.length){send('status',{message:'Atualização de DLC sem base disponível: '+row.contentTitle});continue;}
      for(const original of originals)addRecords('DLC/'+original.contentTitle+'/'+original.version+'/Atualizações/'+row.version,{...row,original},'dataPatch');
    }
    const result={nodes,files,bases,originals,originalManuals};catalogs.set(game.title,result);return result;
  }
  async function resolve(filename){
    cancelled();const normalized=virtualPath('/',filename),parts=normalized.split('/').filter(Boolean),root=key(parts.shift()||'');
    if(!root)return {kind:'root'};
    if(!['jogos','saves'].includes(root))return {kind:'physical',path:normalized};
    if(!parts.length)return {kind:root};
    const label=parts.shift();
    if(root==='saves'){
      const entries=(await saveInventory()).filter(row=>key(row.gameLabel)===key(label));if(!entries.length)throw denied('Jogo sem save disponível.');
      if(!parts.length)return {kind:'save-game',entries};
      const archiveLabel=parts.shift(),archive=entries.find(row=>key(row.label)===key(archiveLabel));if(!archive)throw denied('Save não encontrado.');
      return {kind:'save',archive,path:'/'+parts.join('/')};
    }
    const game=(await gameInventory()).find(row=>key(row.label)===key(label));if(!game)throw denied('Jogo não encontrado.');
    if(!parts.length)return {kind:'game',game};
    const catalog=await gameCatalog(game),relative=parts.join('/');
    for(let i=parts.length;i>=1;i--){
      const node=catalog.nodes.get(key(parts.slice(0,i).join('/')));
      if(node?.kind==='section')return {kind:'section',game,catalog,node,path:'/'+parts.slice(i).join('/')};
    }
    const node=catalog.nodes.get(key(relative));if(node)return {kind:'game-folder',catalog,node};
    throw denied('Seção não encontrada.');
  }
  async function mountSave(entry){
    const id='save:'+entry.id;if(active?.id===id)return active;
    await closeActive();cancelled();
    send('status',{message:'Abrindo save somente leitura...'});
    const input=build({space:entry.space,referenceId:BigInt('0x'+entry.title),uid:Buffer.from(entry.uid,'hex'),type:entry.type,rank:entry.rank,index:entry.index});
    const opened=await knownFailure(async()=>{const reply=await a.s.ipc('FTP abrir save somente leitura',a.root,53,input);if(reply.result)throw resultError('Abrir save somente leitura',reply.result);return reply;});
    const handle=a.domain.oneHandle(opened);active={id,view:fsView(a,handle,{stop,send}),close:()=>a.s.close(handle)};return active;
  }
  async function mountSection(item){
    const {catalog,node,game}=item,id='game:'+game.title+'/'+node.path;
    if(active?.id===id)return active;
    await closeActive();cancelled();
    catalog.originals.clear();catalog.originalManuals.clear();
    send('status',{message:'Abrindo '+game.label+'/'+node.path+'...'});
    let last;
    for(const candidate of node.descriptor.candidates){
      try {
        // Resolve original paths without opening unrelated base sections first.
        if(candidate.update&&candidate.content.contentType===1){
          const base=catalog.bases.find(b=>b.contents.some(c=>c.contentType===1&&c.programIndex===candidate.content.programIndex));
          if(base){const entry=base.contents.find(c=>c.contentType===1&&c.programIndex===candidate.content.programIndex);
            const source=await resolveContent({...a,title:game.title,storage:base.storage,base,content:entry});catalog.originals.set(entry.programIndex,source);}
        }
        // Patched manuals are deliberately not opened in this first browsing
        // version; known problematic manual paths must not block other sections.
        if(candidate.update&&node.descriptor.section==='manual')throw denied('Manual da atualização não disponível neste modo.');
        const mount=await knownFailure(async()=>{
          const args={...candidate,section:node.descriptor.section};
          try{return await catalog.files.open(args);}catch(error){
            const source=error.source,sourceKey=game.title+':'+source?.contentPath;
            if(error.nativeResult?.canonical!==0x7d802||!source?.contentPath||preparedLicenses.has(sourceKey))throw error;
            cancelled();preparedLicenses.add(sourceKey);
            send('status',{message:'Preparando acesso ao conteúdo licenciado, como no backup de jogos...'});
            await prepareLicense({...a,title:game.title,source});cancelled();
            return catalog.files.open(args);
          }
        });
        active={id,mount,close:()=>catalog.files.close(mount)};
        if(mount.kind==='filesystem')active.view=fsView(a,mount.handle,{stop,send});
        else {
          const entries=await romfs(async(offset,length)=>{cancelled();return catalog.files.read(mount,offset,length);},mount.size);
          const nodes=new Map([['/',{path:'/',type:'directory',size:0}]]);
          for(const entry of entries){if(nodes.has(entry.path)||/[\0\r\n]/.test(entry.path))throw Error('RomFS com caminhos inválidos.');nodes.set(entry.path,entry);}
          active.nodes=nodes;active.files=catalog.files;
        }
        return active;
      }catch(error){if(active)await closeActive();if(error.ftpCode!==550)throw error;last=error;}
    }
    throw last||denied('Seção indisponível.');
  }
  function childRows(nodes,parent){
    const prefix=parent===''?'':parent==='/'?'/':parent+'/';
    return [...nodes.values()].filter(row=>row.path!==parent&&row.path.startsWith(prefix)&&!row.path.slice(prefix.length).includes('/'))
      .map(row=>({name:row.path.slice(prefix.length),type:row.type||'directory',size:row.size||0}));
  }
  async function resolvedView(item){if(item.kind==='save')return mountSave(item.archive);return mountSection(item);}
  async function stat(filename){
    const item=await resolve(filename);if(item.kind==='physical')return physical.stat(item.path);
    if(!['save','section'].includes(item.kind))return {type:'directory',size:0};
    // CWD into a section root is cheap; LIST/RETR performs the actual mount.
    if(item.path==='/')return {type:'directory',size:0};
    return knownFailure(async()=>{const view=await resolvedView(item);if(view.view)return view.view.stat(item.path);const node=view.nodes.get(item.path);if(!node)throw denied('Arquivo não encontrado.');return {type:node.type,size:node.size};});
  }
  async function list(filename){
    const item=await resolve(filename);
    if(item.kind==='root')return [...await physical.list('/'),directory('Jogos'),directory('Saves')];
    if(item.kind==='physical')return physical.list(item.path);
    if(item.kind==='jogos')return (await gameInventory()).map(row=>directory(row.label));
    if(item.kind==='saves')return [...new Set((await saveInventory()).map(row=>row.gameLabel))].map(directory);
    if(item.kind==='save-game')return item.entries.map(row=>directory(row.label));
    if(item.kind==='game'||item.kind==='game-folder'){
      const catalog=item.catalog||await gameCatalog(item.game),parent=item.node?.path||'';
      return childRows(catalog.nodes,parent);
    }
    return knownFailure(async()=>{const view=await resolvedView(item);if(view.view)return view.view.list(item.path);const node=view.nodes.get(item.path);if(node?.type!=='directory')throw denied('Não é pasta.');return childRows(view.nodes,item.path);});
  }
  async function* read(filename,offset=0){
    const item=await resolve(filename);if(item.kind==='physical'){yield* physical.read(item.path,offset);return;}
    if(!['save','section'].includes(item.kind))throw denied('Não é arquivo.');
    const view=await knownFailure(()=>resolvedView(item));if(view.view){yield* view.view.read(item.path,offset);return;}
    const node=view.nodes.get(item.path);if(node?.type!=='file'||!Number.isSafeInteger(offset)||offset<0||offset>node.size)throw denied('Arquivo ou offset inválido.');
    while(offset<node.size){cancelled();const wanted=Math.min(0x40000,node.size-offset),bytes=await view.files.read(view.mount,node.offset+offset,wanted);
      if(bytes.length!==wanted)throw Error('Leitura RomFS incompleta.');offset+=bytes.length;send('transfer',{direction:'download',file:filename,done:offset,total:node.size});yield bytes;}
  }
  function assertPhysical(filename){const root=key(virtualPath('/',filename).split('/')[1]||'');if(['jogos','saves'].includes(root))throw denied('Jogos e saves são somente leitura.');}
  return {stat,list,read,scopes:[...physical.scopes,'Jogos','Saves'],unavailable:physical.unavailable,
    canUpload:async filename=>{assertPhysical(filename);return physical.canUpload(filename);},
    mkdir:async filename=>{assertPhysical(filename);return physical.mkdir(filename);},
    uploadNew:async(filename,...args)=>{assertPhysical(filename);return physical.uploadNew(filename,...args);},
    close:async()=>{closed=true;await closeActive();if(physical.close)await physical.close();}};
}
module.exports={virtualStorage};
