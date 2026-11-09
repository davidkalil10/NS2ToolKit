const path=require('node:path');
const fs=require('node:fs/promises');
const {runControlled}=require('./painel-runner.cjs');
const {emit,failureDetails,closeAttachment,Progress}=require('./painel-progress.cjs');
const {requireHeldSession,lockSession,invalidateSession}=require('./painel-session.cjs');
const {verifyHeldHealth}=require('./painel-recovery.cjs');
const {attachGame}=require('./tools/OunceCake/engine/session.cjs');
const {mountStorage}=require('./painel-ftp-storage.cjs');
const {createServer}=require('./painel-ftp-server.cjs');
const {virtualStorage}=require('./painel-ftp-virtual.cjs');
async function main([run,writeFlag,browseFlag,backupRoot],{send=emit,attach=attachGame,mount=mountStorage,browse=virtualStorage,serve=createServer,probe=verifyHeldHealth,signal}={}) {
  let a,server,adapter,unlock,failure,nativeTouched=false,stopped=false,release;
  const wait=new Promise(resolve=>{release=resolve;});
  const stop=()=>{stopped=true;release();};
  const progress=new Progress(send);progress.start();
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
  signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
  try {
    if(writeFlag&&!['read-only','sd-new-files','sd-overwrite'].includes(writeFlag))throw Error('Modo FTP inválido.');
    if(browseFlag&&!['catalog','storage'].includes(browseFlag))throw Error('Navegação FTP inválida.');
    run=await requireHeldSession(run);unlock=await lockSession(run,'ftp');
    const overwrite=writeFlag==='sd-overwrite',upload=overwrite||writeFlag==='sd-new-files';
    if(overwrite){if(!backupRoot||!path.isAbsolute(backupRoot))throw Error('Selecione uma pasta absoluta para os backups do FTP no PC.');backupRoot=path.resolve(backupRoot);await fs.mkdir(backupRoot,{recursive:true});await fs.access(backupRoot);}
    progress.begin('ftp_mount','Abrindo SD e armazenamento interno USER...');
    nativeTouched=true;a=await attach(run);
    adapter=await mount(a,{upload,overwrite,backupRoot,stop:()=>stopped,send});
    if(browseFlag==='catalog')adapter=await browse(a,adapter,{stop:()=>stopped,send});
    if(stopped)return;
    server=await serve(adapter,{upload,overwrite,staging:path.join(run,'ftp-uploads'),send,onFatal:error=>{failure ||= error;stop();}});
    progress.begin('ftp_active','FTP montado. Navegue pelo Explorer; desmonte ao terminar.');
    send('ftp_ready',{url:server.url,scopes:adapter.scopes,unavailable:adapter.unavailable,upload,overwrite});
    await wait;
  }catch(error){if(!error.ftpStop||!stopped)failure=error;}
  finally {
    progress.begin('ftp_cleanup','Desmontando FTP e fechando os arquivos do console...');
    try{if(server)await server.close();}catch(error){failure ||= error;}
    try{if(adapter?.close)await adapter.close();}catch(error){if(failure)(failure.cleanupErrors ||= []).push(error.message);else failure=error;}
    try{await closeAttachment(a);}catch(error){if(failure)(failure.cleanupErrors ||= []).push(error.message);else failure=error;}
    let reusable=!failure;
    if(failure&&!nativeTouched)reusable=true;
    if(failure?.nativeRefusal&&!failure.ftpUnsafe&&!failure.cleanupErrors){try{reusable=await probe(run)===true;}catch{reusable=false;}}
    try {
      if(failure){if(!reusable&&unlock)await invalidateSession(run,failure.message);send('error',{...failureDetails(failure),requiresRestart:!reusable,summary:failure.message});process.exitCode=1;}
      else send('complete',{message:'FTP desmontado; recursos auxiliares encerrados.'});
    }finally{progress.close();process.off('SIGINT',stop);process.off('SIGTERM',stop);signal?.removeEventListener('abort',stop);if(unlock)await unlock();}
  }
}
module.exports={main};
if(require.main===module)runControlled(main,process.argv.slice(2)).catch(error=>{emit('error',failureDetails(error));process.exitCode=1;});
