'use strict';
// GBA overlays only; preserves the console's installed game and its saves.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');
const {emit, closeAttachment} = require('./painel-progress.cjs');
const {requireHeldSession, invalidateSession} = require('./painel-session.cjs');
const {verifyHeldHealth} = require('./painel-recovery.cjs');
const {attachGame} = require('./tools/OunceCake/engine/session.cjs');
const {discoverGames} = require('./tools/OunceCake/engine/content.cjs');
const {mountStorage} = require('./painel-ftp-storage.cjs');
const {verifyRemoteLayout} = require('./tools/mod-teste/patch-loader.cjs');
const TITLE = '0100554023408000';
const FILES = ['romfs/FireRed_e.gba','exefs/main'];
const SD = '/SD/ns2jb-modloader/contents/'+TITLE;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = async file => JSON.parse(await fs.readFile(file,'utf8'));
const refuse = message => Object.assign(Error(message), {modRefusal:true});

async function verifyRuntime(root) {
  const manifest = await json(path.join(root,'mods-runtime.json'));
  if (manifest.loaderRevision !== '9395c91e9f5bb6c01df242fdbf7db194cf94b3c6' || manifest.patch !== 'remote-posix-paths-v1') throw Error('Pacote de runtime incompatível.');
  for (const [name, expected] of Object.entries(manifest.files)) {
    if (name.includes('\\') || name.split('/').some(part => !part || part==='..' || part==='.') || path.isAbsolute(name)) throw Error('Manifesto de runtime inválido.');
    const file=path.join(root,...name.split('/'));
    if(hash(await fs.readFile(file))!==expected)throw Error('Arquivo da distribuição alterado: '+name);
  }
  require(path.join(root,'loader/lib/native/artifacts.cjs')).artifacts();
}
async function verifyJob(root, job, {allowPending=false}={}) {
  job=path.resolve(job);
  const report=await json(path.join(job,'mod.json'));
  if(report.format!=='ns2toolkit-gba-mod-v1'||report.titleId!==TITLE||(!allowPending&&!report.ready)||!report.inputFilesVerified||report.files?.length!==2)throw Error('Prepare novamente este NUP pelo assistente de mods.');
  if(new Set(report.files.map(row=>row.path)).size!==2)throw Error('Arquivos repetidos no plano.');
  for(const row of report.files){
    if(!FILES.includes(row.path)||!Number.isSafeInteger(row.bytes)||row.bytes<=0||row.bytes>64*1024*1024||!/^[a-f0-9]{64}$/.test(row.sha256))throw Error('Plano de mod inválido.');
    const file=path.join(job,'sd-card-root/ns2jb-modloader/contents',TITLE,...row.path.split('/'));
    let current=file;
    for(;;){if((await fs.lstat(current)).isSymbolicLink())throw Error('A preparação contém um atalho.');if(current===path.parse(current).root)break;current=path.dirname(current);}
    const bytes=await fs.readFile(file);
    if(bytes.length!==row.bytes||hash(bytes)!==row.sha256)throw Error('Arquivo preparado mudou: '+row.path);
    if(row.path.startsWith('romfs/')){
      const sum=bytes.subarray(0xA0,0xBE).reduce((a,b)=>a+b,0)+0x19;
      if(bytes.length<0xC0||bytes.length>32*1024*1024||(bytes.length&(bytes.length-1))||bytes[0xB2]!==0x96||bytes[0xBE]||bytes[0xBF]||(sum&255))throw Error('Cabeçalho GBA inválido.');
    }else {
      if(bytes.length<256)throw Error('Executável incompleto.');
      let decoded=0;for(let i=0;i<3;i++){decoded+=bytes.readUInt32LE(24+i*16);if(decoded>64*1024*1024)throw Error('Executável excede o limite GBA desta ferramenta.');}
      require(path.join(root,'loader/lib/exefs.cjs')).decodeNso(bytes);
    }
  }
  const collection=require(path.join(root,'loader/lib/mods.cjs')).collectMods(path.join(job,'sd-card-root/ns2jb-modloader'));
  verifyRemoteLayout(path.join(root,'loader'),collection);
  return report;
}
async function sessions(root, extraRoot) {
  const config=await json(path.join(root,'mods-config.json')).catch(e=>{if(e.code==='ENOENT')return{};throw e;});
  const roots=[root,...(config.assistantRoots||[]),...(extraRoot?[extraRoot]:[])], runs=new Set();
  for(const base of roots){
    const folder=path.basename(base)==='runs'?base:path.join(base,'runs');
    for(const row of await fs.readdir(folder,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return[];throw e;}))if(row.isDirectory()&&/^switch2-[A-Za-z0-9]+$/.test(row.name))runs.add(path.resolve(folder,row.name));
  }
  const result=[];
  const queue=[...runs];
  await Promise.all(Array.from({length:Math.min(8,queue.length)},async()=>{while(queue.length){const run=queue.shift();try{
    await requireHeldSession(run);
    const state=await json(path.join(run,'result.json'));if(state.completed)continue;
    try{await fs.access(path.join(run,'painel-operation.lock'));continue;}catch(e){if(e.code!=='ENOENT')throw e;}
    require(path.join(root,'loader/install.cjs')).verifiedRun(run);
    const connection=await json(path.join(run,'connection.json'));
    if(connection.addresses?.session!==path.basename(run)||!Number.isInteger(connection.port)||connection.port<1||connection.port>65535)continue;
    await require(path.join(root,'loader/lib/find-session.cjs')).status(connection.port);
    result.push({path:run,name:path.basename(run),started:state.started||''});
  }catch{/* Ended, busy and unqualified sessions are not offered. */}}}));
  return result.sort((a,b)=>b.started.localeCompare(a.started));
}
async function prepare(root, source, output, send=emit) {
  await verifyRuntime(root);
  const python=path.join(root,'runtime/python/python.exe');
  let folder;
  await new Promise((resolve,reject)=>{
    const child=spawn(python,['-u',path.join(root,'painel-mod-preparar.py'),source,output],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    let pending='',errors='';
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stdout.on('data',part=>{pending+=part;let end;while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end).trim();pending=pending.slice(end+1);if(!line.startsWith('PANEL:'))continue;try{const event=JSON.parse(line.slice(6));if(event.kind==='prepared_input')folder=event.path;else {if(event.kind==='error'&&!errors)errors=event.summary;send(event.kind,event);}}catch(error){errors+=error.message;}}});
    child.stderr.on('data',part=>{errors=(errors+part).slice(-16000);});
    child.on('error',reject);child.on('close',code=>code===0&&folder?resolve():reject(Error(errors||'Não foi possível preparar o NUP; confira os detalhes acima.')));
  });
  const report=await verifyJob(root,folder,{allowPending:true});report.ready=true;
  await fs.writeFile(path.join(folder,'mod.json'),JSON.stringify(report,null,2));
  send('mod_prepared',{path:folder,report});return folder;
}
async function listMaybe(adapter, folder) {
  const parent=path.posix.dirname(folder),name=path.posix.basename(folder);
  const row=(await adapter.list(parent)).find(row=>row.name.toLowerCase()===name.toLowerCase());
  if(!row)return null;
  if(row.type!=='directory')throw refuse('Há um arquivo no lugar da pasta de mods: '+folder);
  return adapter.list(folder);
}
async function uploadFiles(adapter, job, report, {send=emit}={}) {
  // Check for stale/extra mod files before changing anything.
  let namespace=null, contents=null, target=null;
  namespace=await listMaybe(adapter,'/SD/ns2jb-modloader');
  if(namespace){
    if(namespace.some(row=>row.name.toLowerCase()==='exefs_patches')&&(await adapter.list('/SD/ns2jb-modloader/exefs_patches')).length)throw refuse('Existem patches globais no SD. Separe-os antes deste teste GBA.');
    contents=await listMaybe(adapter,'/SD/ns2jb-modloader/contents');
    if(contents){
      if(contents.some(row=>row.name.toLowerCase()==='exefs_patches')&&(await adapter.list('/SD/ns2jb-modloader/contents/exefs_patches')).length)throw refuse('Existem patches globais na pasta contents do SD.');
      target=await listMaybe(adapter,SD);
    }
  }
  if(target){
    for(const row of target){
      const section=row.name.toLowerCase();
      if(!['romfs','exefs'].includes(section)||row.type!=='directory')throw refuse('Há outros arquivos no mod do FireRed no SD. Separe-os antes de substituir este mod.');
      for(const entry of await adapter.list(SD+'/'+row.name))if(entry.type!=='file'||!FILES.includes(section+'/'+entry.name))throw refuse('O mod anterior contém arquivos extras. Nenhum arquivo foi substituído.');
    }
  }
  async function directory(folder){if(await listMaybe(adapter,folder)===null)await adapter.mkdir(folder);}
  for(const dir of ['/SD/ns2jb-modloader','/SD/ns2jb-modloader/contents',SD,SD+'/romfs',SD+'/exefs'])await directory(dir);
  for(const row of report.files){
    const remote=SD+'/'+row.path, local=path.join(job,'sd-card-root/ns2jb-modloader/contents',TITLE,...row.path.split('/'));
    const intent=await adapter.canUpload(remote);
    if(intent.existing&&intent.size===row.bytes){
      const digest=crypto.createHash('sha256');let count=0;
      for await(const bytes of adapter.read(remote)){digest.update(bytes);count+=bytes.length;}
      if(count===row.bytes&&digest.digest('hex')===row.sha256){send('status',{message:'Já está conferido no SD: '+row.path});continue;}
    }
    send('status',{message:'Enviando e verificando: '+row.path});
    await adapter.uploadNew(remote,local,row.sha256,row.bytes,path.join(job,'envio-'+path.posix.basename(row.path)+'.json'),{intent});
  }
}
async function install(root, job, run, {verify=verifyJob, runtime=verifyRuntime, held=requireHeldSession,
  attach=attachGame, mount=mountStorage, discover=discoverGames, health=verifyHeldHealth, load, send=emit}={}) {
  root=path.resolve(root);job=path.resolve(job);run=path.resolve(run);
  await runtime(root);const report=await verify(root,job);await held(run);
  const installer=load?null:require(path.join(root,'loader/install.cjs'));
  if(installer)installer.verifiedRun(run);
  for(const name of ['ns2jb-modloader-install.json','painel-session-invalid.json']){
    try{await fs.access(path.join(run,name));}catch(e){if(e.code==='ENOENT')continue;throw e;}
    throw Error('Reinicie o console e inicie uma nova conexão 4/4 antes de ativar outro mod.');
  }
  const lockFile=path.join(run,'painel-operation.lock');let lock;
  try{lock=await fs.open(lockFile,'wx');}catch(e){if(e.code==='EEXIST')throw Error('Desmonte o FTP e aguarde os outros módulos terminarem.');throw e;}
  let attachment,nativeStarted=false,retain=false,closed=false;
  try{
    await lock.writeFile(JSON.stringify({pid:process.pid,operation:'gba-mod-install',job,at:new Date().toISOString()}));
    await health(run);
    send('status',{message:'Abrindo o SD e conferindo o jogo base...'});
    attachment=await attach(run);
    const games=await discover({...attachment,shouldStop:()=>false});
    if(!games.some(game=>String(game.title).toUpperCase()===TITLE))throw refuse('O FireRed precisa estar instalado ou disponível no console.');
    const adapter=await mount(attachment,{upload:true,overwrite:true,backupRoot:path.join(job,'copias-anteriores-sd'),send});
    await uploadFiles(adapter,job,report,{send});
    const closing=attachment;attachment=null;
    await closeAttachment(closing);closed=true;
    await health(run);
    send('status',{message:'Arquivos conferidos no SD. Ativando o mod; aguarde...'});
    nativeStarted=true;
    await (load||installer.main)(['--sd','--run-dir',run,'--title',TITLE]);
    const result=await json(path.join(run,'ns2jb-modloader-install.json'));
    if(result.status!=='ready'||!result.titleIds?.some(id=>id.toUpperCase()===TITLE))throw Error('O loader não confirmou READY para o FireRed.');
    retain=true;
    await fs.writeFile(path.join(job,'ativacao.json'),JSON.stringify({at:new Date().toISOString(),session:path.basename(run),ready:true,gameLaunchVerified:false},null,2)).catch(error=>send('status',{message:'Mod ativado; não foi possível salvar o relatório local: '+error.message}));
    send('mod_ready',{message:'Mod ativado. No assistente principal, encerre a conexão e aguarde a limpeza. Depois feche SmileBASIC SEM REINICIAR e abra FireRed. Mantenha o SD inserido.'});
    return result;
  }catch(error){
    let cleanupError;
    if(attachment)try{const closing=attachment;attachment=null;await closeAttachment(closing);closed=true;}catch(e){cleanupError=e;}
    let reusable=false;
    if(!nativeStarted&&error.modRefusal&&closed&&!cleanupError)try{reusable=await health(run)===true;}catch{}
    retain=!reusable;
    if(retain)await invalidateSession(run,error.message).catch(()=>{});
    error.requiresRestart=!reusable;
    if(cleanupError)error.message+='; limpeza: '+cleanupError.message;
    throw error;
  }finally{
    await lock.close();if(!retain)await fs.unlink(lockFile);
  }
}
async function main([command,...args]) {
  const root=__dirname;
  if(command==='sessions')emit('mod_sessions',{sessions:await sessions(root,args[0])});
  else if(command==='prepare'&&args.length===2)await prepare(root,...args);
  else if(command==='install'&&args.length===2)await install(root,...args);
  else throw Error('Comando inválido do assistente de mods.');
}
module.exports={TITLE,FILES,SD,verifyRuntime,verifyJob,sessions,prepare,uploadFiles,install};
if(require.main===module)main(process.argv.slice(2)).catch(error=>{emit('error',{summary:error.message,requiresRestart:error.requiresRestart===true});process.exitCode=1;});
