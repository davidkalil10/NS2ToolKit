// Filesystem commands follow libnx fs.c and the existing owned-session helpers.
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const {pathRequest} = require('./tools/OunceCake/engine/protocol.cjs');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const denied = message => Object.assign(Error(message), {ftpCode:550});
function check(reply, label) {
  if (reply.result) throw Object.assign(denied(label+' (0x'+Number(reply.result).toString(16)+')'), {nativeRefusal:true});
  return reply;
}
function virtualPath(cwd, text = '') {
  if (/[\\\0\r\n]/.test(text) || Buffer.byteLength(text)>2048) throw denied('Caminho inválido.');
  return path.posix.resolve(cwd, text || '.');
}
async function mountStorage(a, {upload=false, stop=()=>false, send=()=>{}} = {}) {
  const mounts = new Map(), unavailable = [];
  for (const [key,name,command] of [['sd','SD',18],['interno','Interno',11]]) {
    if (stop()) throw Object.assign(Error('FTP encerrado.'),{ftpStop:true});
    let reply;
    if (command===18) reply=await a.s.ipc('FTP OpenSdCardFileSystem',a.root,18);
    else {
      const input=Buffer.alloc(4);input.writeUInt32LE(30);
      await a.s.write(a.s.base+0x2000,Buffer.alloc(0x301));
      reply=await a.domain.send(a.s,'FTP OpenBisFileSystem USER',a.root,pathRequest(11,input,a.s.base+0x2000));
    }
    if (reply.result) {unavailable.push({name,result:reply.result});continue;}
    mounts.set(key,{name,handle:a.domain.oneHandle(reply)});
  }
  if (!mounts.size) throw Object.assign(denied('Nenhum armazenamento pôde ser aberto.'),{nativeRefusal:true});
  function resolve(filename, write=false) {
    const normalized=virtualPath('/',filename), parts=normalized.split('/').filter(Boolean);
    const key=(parts.shift()||'').toLowerCase(), mount=mounts.get(key);
    if (!mount) throw denied('Armazenamento indisponível.');
    if (write && (!upload || key!=='sd' || !parts.length)) throw denied('Envio permitido somente para arquivos novos no SD, quando habilitado.');
    const remote='/'+parts.join('/');
    if (Buffer.byteLength(remote)>=0x301) throw denied('Caminho longo demais para o console.');
    return {mount,remote};
  }
  function interrupted() {if(stop())throw Object.assign(Error('FTP encerrado.'),{ftpStop:true});}
  async function stat(filename) {
    if (filename==='/') return {type:'directory',size:0};
    const {mount,remote}=resolve(filename);
    const type=check(await a.filesystem.pathMethod(a.s,mount.handle,7,remote),'Tipo do arquivo').data.readUInt32LE();
    if (type===0)return {type:'directory',size:0};
    if(type!==1)throw denied('Tipo de entrada não suportado.');
    const opened=check(await a.filesystem.openFile(a.s,mount.handle,remote),'Abrir arquivo');
    try {
      const size=Number(await a.filesystem.fileSize(a.s,opened.handle));
      if(!Number.isSafeInteger(size)||size<0)throw denied('Tamanho não suportado.');
      return {type:'file',size};
    }finally{await a.s.close(opened.handle);}
  }
  async function list(filename) {
    interrupted();
    if(filename==='/')return [...mounts.values()].map(m=>({name:m.name,type:'directory',size:0}));
    const {mount,remote}=resolve(filename), mode=Buffer.alloc(4);mode.writeUInt32LE(3);
    const opened=check(await a.filesystem.pathMethod(a.s,mount.handle,9,remote,mode),'Abrir pasta');
    const handle=a.domain.oneHandle(opened), entries=[];
    send('status',{message:'Lendo pasta '+filename+'...'});
    try {
      for (;;) {
        interrupted();
        const address=a.s.base+0x6000, capacity=64;
        const reply=check(await a.s.ipc('FTP ReadDirectory',handle,0,Buffer.alloc(0),{receive:[{address,size:capacity*0x310,mode:0}]}),'Listar pasta');
        const count=Number(reply.data.readBigUInt64LE());
        if(!Number.isInteger(count)||count<0||count>capacity)throw Error('Contagem inválida de diretório.');
        if(!count)return entries;
        const bytes=await a.s.read(address,count*0x310);
        if(bytes.length!==count*0x310)throw Error('Listagem truncada.');
        for(let i=0;i<count;i++) {
          const row=bytes.subarray(i*0x310,(i+1)*0x310), name=row.subarray(0,0x301).toString('utf8').split('\0')[0];
          if(!name||/[\/\\\r\n]/.test(name)||name==='.'||name==='..')throw denied('Nome não representável no FTP.');
          const type=row[0x304], size=Number(row.readBigUInt64LE(0x308));
          if(![0,1].includes(type)||!Number.isSafeInteger(size)||size<0)throw Error('Entrada de diretório inválida.');
          entries.push({name,type:type===0?'directory':'file',size});
          if(entries.length>16384)throw denied('Pasta excede o limite de 16.384 entradas.');
        }
      }
    }finally{await a.s.close(handle);}
  }
  async function* read(filename,offset=0) {
    const {mount,remote}=resolve(filename);
    const opened=check(await a.filesystem.openFile(a.s,mount.handle,remote),'Abrir download');
    try {
      const size=Number(await a.filesystem.fileSize(a.s,opened.handle));
      if(!Number.isSafeInteger(size)||offset<0||offset>size)throw denied('Offset inválido.');
      let last=0;
      while(offset<size) {
        interrupted();
        const wanted=Math.min(0x40000,size-offset), bytes=await a.filesystem.readFile(a.s,opened.handle,offset,wanted);
        if(!bytes.length||bytes.length>wanted)throw Error('Leitura de arquivo incompleta.');
        offset+=bytes.length;
        if(Date.now()-last>500){send('transfer',{direction:'download',file:filename,done:offset,total:size});last=Date.now();}
        yield bytes;
      }
      if(Number(await a.filesystem.fileSize(a.s,opened.handle))!==size)throw denied('O arquivo mudou durante o download.');
    }finally{await a.s.close(opened.handle);}
  }
  async function mutation(mount,remote,command,input) {
    const text=Buffer.alloc(0x301);text.write(remote);
    await a.s.write(a.s.base+0x2000,text);
    return a.domain.send(a.s,'FTP SD create '+command,mount.handle,pathRequest(command,input,a.s.base+0x2000));
  }
  async function ensureAbsent(mount,remote) {
    const reply=await a.filesystem.pathMethod(a.s,mount.handle,7,remote);
    if(!reply.result)throw denied('Já existe um arquivo ou pasta com esse nome. Sobrescrita desativada.');
    if((reply.result&0x3fffff)!==0x202)check(reply,'Conferir destino novo');
  }
  async function canUpload(filename) {const {mount,remote}=resolve(filename,true);await ensureAbsent(mount,remote);}
  async function mkdir(filename) {
    interrupted();const {mount,remote}=resolve(filename,true);await ensureAbsent(mount,remote);
    check(await mutation(mount,remote,2,Buffer.alloc(0)),'Criar pasta no SD');
  }
  async function uploadNew(filename,local,expected,size,journalFile) {
    interrupted();const {mount,remote}=resolve(filename,true);await ensureAbsent(mount,remote);
    const report={file:filename,size,sha256:expected,complete:false,createAttempted:false,created:false,verified:false};
    const save=()=>fs.writeFile(journalFile,JSON.stringify(report,null,2),{mode:0o600});
    await save();
    let file, source, failure;
    try {
      const input=Buffer.alloc(16);input.writeBigUInt64LE(BigInt(size),8);
      report.createAttempted=true;await save();
      check(await mutation(mount,remote,0,input),'Criar arquivo novo no SD');
      report.created=true;await save();
      send('writing',{message:'Gravando arquivo novo no SD. Aguarde a verificação antes de desmontar.'});
      const mode=Buffer.alloc(4);mode.writeUInt32LE(3);
      const opened=check(await a.filesystem.pathMethod(a.s,mount.handle,8,remote,mode),'Abrir arquivo novo');file=a.domain.oneHandle(opened);
      source=await fs.open(local,'r');let offset=0,last=0;const buffer=Buffer.alloc(0x10000), uploaded=crypto.createHash('sha256');
      for(;;) {
        const {bytesRead}=await source.read(buffer,0,buffer.length,offset);if(!bytesRead)break;
        const bytes=buffer.subarray(0,bytesRead), address=a.s.base+0x20000;
        await a.s.write(address,bytes);
        if(await a.filesystem.nativeHash(a.s,address,bytesRead)!==hash(bytes))throw Error('Bloco enviado ao SD não foi confirmado.');
        const data=Buffer.alloc(24);data.writeBigUInt64LE(BigInt(offset),8);data.writeBigUInt64LE(BigInt(bytesRead),16);
        check(await a.s.ipc('FTP SD FileWrite',file,1,data,{send:[{address,size:bytesRead,mode:1}]}),'Gravar arquivo novo');
        uploaded.update(bytes);offset+=bytesRead;
        if(Date.now()-last>500){send('transfer',{direction:'upload',file:filename,done:offset,total:size});last=Date.now();}
      }
      if(offset!==size||uploaded.digest('hex')!==expected)throw Error('O arquivo de envio mudou.');
      check(await a.s.ipc('FTP SD FileFlush',file,2),'Flush do arquivo novo');
      await a.s.close(file);file=undefined;
      const readOnly=check(await a.filesystem.openFile(a.s,mount.handle,remote),'Reler arquivo novo');file=readOnly.handle;
      if(Number(await a.filesystem.fileSize(a.s,file))!==size)throw Error('Tamanho no SD divergente.');
      const verified=crypto.createHash('sha256');
      for(let at=0;at<size;) {
        const bytes=await a.filesystem.readFile(a.s,file,at,Math.min(0x40000,size-at));
        if(!bytes.length||bytes.length>size-at)throw Error('Releitura incompleta no SD.');
        verified.update(bytes);at+=bytes.length;
      }
      if(verified.digest('hex')!==expected)throw Error('Hash do arquivo novo divergente no SD.');
      report.verified=true;
    }catch(error){failure=error;report.error=error.message;
      // A received CreateFile refusal did not modify an existing file.
      if(report.created||report.createAttempted&&!error.nativeRefusal){delete error.ftpCode;error.ftpUnsafe=true;}
    }finally {
      try{if(source)await source.close();if(file!==undefined)await a.s.close(file);}catch(error){failure=error;delete error.ftpCode;report.error=error.message;}
      report.complete=!failure&&report.verified;await save();
      send('write_finished',{complete:report.complete});
    }
    if(failure)throw failure;
  }
  return {list,stat,read,canUpload,mkdir,uploadNew,scopes:[...mounts.values()].map(m=>m.name),unavailable};
}
module.exports={mountStorage,virtualPath,denied};
