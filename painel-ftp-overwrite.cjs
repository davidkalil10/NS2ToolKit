// SD overwrites keep a verified, durable PC backup before the first mutation.
// There is no delete/rename command and no automatic replay after an RPC error.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {replace}=require('./engine/shared/atomic-file.cjs');
const MAX_FILE=1024*1024*1024,RESERVE=512n*1024n*1024n;
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const refused=message=>Object.assign(Error(message),{ftpCode:550});
async function localStep(operation){
  try{return await operation();}catch(error){error.ftpCode=['ENOSPC','EDQUOT'].includes(error.code)?552:550;throw error;}
}
async function persist(filename,report){
  await localStep(async()=>{
    const pending=filename+'.tmp';let file;
    try{file=await fs.open(pending,'w',0o600);await file.writeFile(JSON.stringify(report,null,2)+'\n');await file.sync();}
    finally{if(file)await file.close();}
    await replace(pending,filename);
  });
}
async function localHash(filename){
  return localStep(async()=>{
    const file=await fs.open(filename,'r'),hash=crypto.createHash('sha256');
    try{for await(const bytes of file.createReadStream())hash.update(bytes);return hash.digest('hex');}
    finally{await file.close();}
  });
}
async function overwriteFile({a,mount,remote,filename,local,expected,size,oldSize,backupRoot,journalFile,
  stop=()=>false,cancelled=()=>false,send=()=>{},check}){
  if(!backupRoot)throw refused('Selecione a pasta das cópias de segurança no PC.');
  if(!Number.isSafeInteger(size)||size<0||size>MAX_FILE||!Number.isSafeInteger(oldSize)||oldSize<0||oldSize>MAX_FILE||!/^[a-f0-9]{64}$/.test(expected))
    throw refused('Arquivo fora do limite de 1 GiB ou hash inválido.');
  const guard=()=>{if(stop()||cancelled())throw Object.assign(Error('Envio cancelado antes de alterar o SD.'),{ftpCode:426});};
  const checkSpace=async required=>localStep(async()=>{const s=await fs.statfs(backupRoot,{bigint:true});if(s.bavail*s.bsize<required+RESERVE)throw Object.assign(Error('Espaço insuficiente para preservar o arquivo anterior no PC.'),{code:'ENOSPC'});});
  guard();await localStep(()=>fs.mkdir(backupRoot,{recursive:true}));await checkSpace(BigInt(oldSize));
  if((await localStep(()=>fs.stat(local))).size!==size||await localHash(local)!==expected)throw refused('O arquivo preparado para envio mudou.');
  const folder=await localStep(()=>fs.mkdtemp(path.join(backupRoot,'sd-'+new Date().toISOString().replace(/[:.]/g,'-')+'-')));
  const original=path.join(folder,'original.bin'),manifestFile=path.join(folder,'manifest.json');
  const report={format:'ns2toolkit-ftp-sd-overwrite-v1',file:filename,oldSize,size,sha256:expected,backup:original,
    backupVerified:false,mutationAttempted:false,verified:false,complete:false};
  const backup={format:'ns2toolkit-ftp-backup-v1',file:filename,originalName:path.posix.basename(remote),size:oldSize,complete:false};
  let readHandle,writeHandle,backupFile,source,failure,mutationStarted=false;
  const save=async()=>{await persist(journalFile,report);await persist(manifestFile,{...backup,overwrite:report});};
  async function remoteHash(handle,length,canCancel=true){
    const hash=crypto.createHash('sha256');
    for(let at=0;at<length;){
      if(canCancel)guard();
      const wanted=Math.min(0x40000,length-at),bytes=await a.filesystem.readFile(a.s,handle,at,wanted);
      if(bytes.length!==wanted)throw Error('Leitura incompleta do arquivo no SD.');
      hash.update(bytes);at+=bytes.length;
    }
    if(Number(await a.filesystem.fileSize(a.s,handle))!==length)throw refused('O tamanho do arquivo no SD mudou.');
    return hash.digest('hex');
  }
  try{
    await save();guard();send('status',{message:'Salvando cópia de segurança do arquivo anterior no PC...'});
    const opened=check(await a.filesystem.openFile(a.s,mount.handle,remote),'Abrir original para backup');
    readHandle=opened.handle;
    if(Number(await a.filesystem.fileSize(a.s,readHandle))!==oldSize)throw refused('O arquivo de destino mudou antes do backup.');
    backupFile=await localStep(()=>fs.open(original+'.part','wx',0o600));
    const before=crypto.createHash('sha256');let copied=0;
    while(copied<oldSize){
      guard();await checkSpace(BigInt(oldSize-copied));
      const wanted=Math.min(0x40000,oldSize-copied),bytes=await a.filesystem.readFile(a.s,readHandle,copied,wanted);
      if(bytes.length!==wanted)throw Error('Cópia do arquivo anterior incompleta.');
      await localStep(()=>backupFile.writeFile(bytes));before.update(bytes);copied+=bytes.length;
      send('status',{message:'Backup anterior: '+copied.toLocaleString('pt-BR')+' / '+oldSize.toLocaleString('pt-BR')+' bytes'});
    }
    if(Number(await a.filesystem.fileSize(a.s,readHandle))!==oldSize)throw refused('O destino mudou durante o backup.');
    await a.s.close(readHandle);readHandle=undefined;
    await localStep(()=>backupFile.sync());await localStep(()=>backupFile.close());backupFile=undefined;
    backup.sha256=before.digest('hex');
    if(await localHash(original+'.part')!==backup.sha256)throw refused('A cópia anterior no PC não passou na verificação.');
    await localStep(()=>fs.rename(original+'.part',original));
    backup.complete=true;report.backupVerified=true;report.originalSha256=backup.sha256;await save();
    send('backup_ready',{path:folder,file:filename});guard();
    const mode=Buffer.alloc(4);mode.writeUInt32LE(3);
    const writable=check(await a.filesystem.pathMethod(a.s,mount.handle,8,remote,mode),'Abrir destino para substituição');
    writeHandle=a.domain.oneHandle(writable);
    if(await remoteHash(writeHandle,oldSize)!==backup.sha256)throw refused('O destino mudou após o backup; nada foi substituído.');
    source=await localStep(()=>fs.open(local,'r'));guard();
    // Persist intent before mutation, then honor one final cancellation check.
    report.mutationAttempted=true;await save();guard();
    send('writing',{message:'Substituindo arquivo no SD. Aguarde a gravação e a verificação.'});
    const length=Buffer.alloc(8);length.writeBigInt64LE(BigInt(size));
    mutationStarted=true;
    check(await a.s.ipc('FTP SD FileSetSize',writeHandle,3,length),'Ajustar tamanho do arquivo no SD');
    const hash=crypto.createHash('sha256'),buffer=Buffer.alloc(0x10000);let offset=0;
    while(offset<size){
      const wanted=Math.min(buffer.length,size-offset),{bytesRead}=await source.read(buffer,0,wanted,offset);
      if(bytesRead!==wanted)throw Error('O arquivo de envio mudou durante a substituição.');
      const bytes=buffer.subarray(0,bytesRead),address=a.s.base+0x20000;
      await a.s.write(address,bytes);
      if(await a.filesystem.nativeHash(a.s,address,bytesRead)!==sha(bytes))throw Error('Bloco de envio não confirmado.');
      const input=Buffer.alloc(24);input.writeBigUInt64LE(BigInt(offset),8);input.writeBigUInt64LE(BigInt(bytesRead),16);
      check(await a.s.ipc('FTP SD overwrite FileWrite',writeHandle,1,input,{send:[{address,size:bytesRead,mode:1}]}),'Substituir arquivo no SD');
      hash.update(bytes);offset+=bytesRead;send('transfer',{direction:'upload',file:filename,done:offset,total:size});
    }
    if((await source.stat()).size!==size||hash.digest('hex')!==expected)throw Error('Arquivo de envio divergente após a gravação.');
    check(await a.s.ipc('FTP SD overwrite FileFlush',writeHandle,2),'Flush do arquivo substituído');
    await a.s.close(writeHandle);writeHandle=undefined;
    const reopened=check(await a.filesystem.openFile(a.s,mount.handle,remote),'Reler arquivo substituído');readHandle=reopened.handle;
    if(await remoteHash(readHandle,size,false)!==expected)throw Error('Hash do arquivo substituído não confere.');
    report.verified=true;
  }catch(error){failure=error;report.error=error.message;report.mutationAttempted=mutationStarted;
    if(mutationStarted){delete error.ftpCode;error.ftpUnsafe=true;}
  }finally{
    for(const file of [backupFile,source]){
      try{if(file)await localStep(()=>file.close());}catch(error){failure ||= error;if(mutationStarted){delete failure.ftpCode;failure.ftpUnsafe=true;}}
    }
    for(const handle of [readHandle,writeHandle]){
      try{if(handle!==undefined)await a.s.close(handle);}catch(error){failure ||= error;delete failure.ftpCode;failure.ftpUnsafe=true;}
    }
    report.complete=!failure&&report.verified;
    try{await save();}catch(error){failure ||= error;report.complete=false;if(report.mutationAttempted){delete failure.ftpCode;failure.ftpUnsafe=true;}}
    send('write_finished',{complete:report.complete,operation:'overwrite',backup:folder});
  }
  if(failure)throw failure;
  return report;
}
module.exports={overwriteFile,MAX_FILE};
