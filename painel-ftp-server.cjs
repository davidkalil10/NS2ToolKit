const net=require('node:net');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {virtualPath,denied}=require('./painel-ftp-storage.cjs');
const networkError=message=>Object.assign(Error(message),{ftpCode:426});
const quote=text=>'"'+text.replace(/"/g,'""')+'"';
function listing(row,writable=false) {
  const directory=row.type==='directory';
  // No timestamps are returned by ReadDirectory; 1970 is an explicit placeholder.
  return (directory?(writable?'drwxr-xr-x':'dr-xr-xr-x'):'-r--r--r--')+' 1 console console '+row.size+' Jan 01  1970 '+row.name+'\r\n';
}
async function createServer(adapter,{port=0,upload=false,staging,send=()=>{},onFatal=()=>{},dataTimeout=20000,maxUpload=1024*1024*1024}={}) {
  if(upload&&!staging)throw Error('Destino temporário de uploads ausente.');
  if(upload)await fs.mkdir(staging,{recursive:true});
  let stopping=false,tail=Promise.resolve(),fatalError,uploadBusy=false;
  const clients=new Set();
  const serial=operation=>{
    const pending=tail.then(async()=>{if(stopping)throw Object.assign(Error('FTP encerrando.'),{ftpStop:true});return operation();});
    tail=pending.catch(error=>{if(!error.ftpCode&&!error.ftpStop){fatalError ||= error;onFatal(error);}});
    return pending;
  };
  const control=net.createServer(socket=>{
    if(stopping||clients.size>=6){socket.end('421 Servidor ocupado.\r\n');return;}
    const client={socket,cwd:'/',logged:false,rest:0,chain:Promise.resolve(),pending:0,closed:false,mode:null,data:null,aborted:false};
    clients.add(client);socket.setEncoding('utf8');socket.setTimeout(5*60*1000,()=>socket.destroy());
    const reply=(code,text)=>{if(!socket.destroyed)socket.write(code+' '+text+'\r\n');};
    function clearMode() {
      if(client.mode?.server?.listening)client.mode.server.close();
      client.mode?.cancel?.();if(client.mode?.socket)client.mode.socket.destroy();client.mode=null;
    }
    client.abort=()=>{client.aborted=true;clearMode();client.data?.destroy();};
    socket.on('error',()=>{});
    socket.on('close',()=>{client.closed=true;client.abort();clients.delete(client);});
    reply(220,'NS2ToolKit FTP local');
    async function passive(extended) {
      clearMode();
      const mode={};mode.promise=new Promise((resolve,reject)=>{mode.accept=resolve;mode.cancel=()=>reject(networkError('Conexao de dados encerrada.'));});
      mode.promise.catch(()=>{});
      mode.server=net.createServer({allowHalfOpen:true},data=>{
        if(mode.socket||client.closed||stopping||client.mode!==mode){data.destroy();return;}
        mode.socket=data;data.on('error',()=>{});data.setTimeout(dataTimeout,()=>data.destroy(networkError('Tempo de dados esgotado.')));
        mode.server.close();mode.accept(data);
      });
      mode.server.on('error',error=>{mode.cancel();});
      client.mode=mode;
      await new Promise((resolve,reject)=>{mode.server.once('error',reject);mode.server.listen(0,'127.0.0.1',resolve);});
      if(stopping||client.closed||client.mode!==mode){if(mode.server.listening)mode.server.close();return;}
      const value=mode.server.address().port;
      reply(extended?229:227,extended?'Entering Extended Passive Mode (|||'+value+'|)':'Entering Passive Mode (127,0,0,1,'+(value>>8)+','+(value&255)+')');
    }
    async function dataConnection() {
      if(!client.mode)throw Object.assign(Error('Use PASV, EPSV ou PORT.'),{ftpCode:425});
      const mode=client.mode;client.mode=null;
      let timer;
      try {
        const promise=mode.active?new Promise((resolve,reject)=>{
          mode.cancel=()=>reject(networkError('Conexao ativa encerrada.'));
          const data=net.createConnection({host:'127.0.0.1',port:mode.port,allowHalfOpen:true});mode.socket=data;
          data.once('connect',()=>resolve(data));data.once('error',reject);
        }):mode.promise;
        // Keep mode visible so a stop/ABOR also releases a passive accept wait.
        client.mode=mode;
        const data=await Promise.race([promise,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(networkError('Conexao de dados nao abriu.')),dataTimeout);})]);
        if(client.closed||stopping)throw networkError('FTP encerrado.');
        data.on('error',()=>{});data.setTimeout(dataTimeout,()=>data.destroy(networkError('Dados sem atividade.')));
        client.data=data;return data;
      }catch(error){if(mode.socket)mode.socket.destroy();throw Object.assign(error,{ftpCode:425});}
      finally{clearTimeout(timer);if(mode.server?.listening)mode.server.close();client.mode=null;}
    }
    async function write(data,bytes) {
      if(data.destroyed||client.aborted||client.closed)throw networkError('Transferencia interrompida.');
      if(!data.write(bytes))await new Promise((resolve,reject)=>{
        const cleanup=()=>{data.off('drain',ready);data.off('error',error);data.off('close',closed);};
        const ready=()=>{cleanup();resolve();},error=reason=>{cleanup();reject(Object.assign(reason,{ftpCode:426}));},closed=()=>error(networkError('Conexao de dados fechada.'));
        data.once('drain',ready);data.once('error',error);data.once('close',closed);
      });
    }
    async function transfer(operation,incoming=false) {
      client.aborted=false;socket.setTimeout(0);reply(150,'Abrindo transferencia binaria.');let data;
      try {
        data=await dataConnection();await operation(data);
        if(client.aborted||client.closed||!incoming&&data.destroyed)throw networkError('Transferencia interrompida.');
        if(!data.destroyed)await new Promise((resolve,reject)=>{data.once('error',reject);data.end(resolve);});
        reply(226,'Transferencia concluida.');
      }finally{if(data&&!data.destroyed)data.destroy();client.data=null;if(!socket.destroyed)socket.setTimeout(5*60*1000);}
    }
    async function command(verb,arg) {
      if(stopping||client.closed)return;
      if(!client.logged&&!['USER','PASS','QUIT','FEAT','OPTS','SYST','NOOP'].includes(verb)){reply(530,'Entre como anonymous.');return;}
      const filename=()=>virtualPath(client.cwd,arg);
      switch(verb) {
        case 'USER':reply(331,'Anonymous aceito; envie PASS.');break;
        case 'PASS':client.logged=true;reply(230,'Conexao local autorizada.');break;
        case 'QUIT':reply(221,'Ate logo.');socket.end();client.abort();break;
        case 'NOOP':reply(200,'OK');break;
        case 'SYST':reply(215,'UNIX Type: L8');break;
        case 'FEAT':socket.write('211-Features\r\n UTF8\r\n EPSV\r\n SIZE\r\n REST STREAM\r\n MLST type*;size*;\r\n211 End\r\n');break;
        case 'OPTS':reply(/^(UTF8 ON|MLST(?: .*)?)$/i.test(arg)?200:504,'Opcoes processadas.');break;
        case 'TYPE':reply(/^[AI](?: N)?$/i.test(arg)?200:504,'Transferencia de bytes sem conversao.');break;
        case 'MODE':reply(arg.toUpperCase()==='S'?200:504,'Stream');break;
        case 'STRU':reply(arg.toUpperCase()==='F'?200:504,'File');break;
        case 'PWD':case 'XPWD':reply(257,quote(client.cwd)+' is current directory');break;
        case 'CWD':case 'XCWD':case 'CDUP':case 'XCUP': {
          const target=virtualPath(client.cwd,verb==='CDUP'||verb==='XCUP'?'..':arg);
          if((await serial(()=>adapter.stat(target))).type!=='directory')throw denied('Nao e pasta.');
          client.cwd=target;reply(250,'Pasta selecionada.');break;
        }
        case 'PASV':await passive(false);break;
        case 'EPSV':if(arg&&arg!=='1')reply(522,'IPv4 somente.');else await passive(true);break;
        case 'PORT':case 'EPRT': {
          clearMode();let host,number;
          if(verb==='PORT') {
            const parts=arg.split(',');if(parts.length!==6||parts.some(p=>!/^\d+$/.test(p)||Number(p)>255))throw denied('PORT invalido.');
            host=parts.slice(0,4).join('.');number=Number(parts[4])*256+Number(parts[5]);
          }else{const parts=arg.split(arg[0]);if(parts.length!==5||parts[1]!=='1'||!/^\d+$/.test(parts[3]))throw denied('EPRT invalido.');host=parts[2];number=Number(parts[3]);}
          if(host!=='127.0.0.1'||!Number.isInteger(number)||number<1024||number>65535)throw denied('Destino ativo deve ser local e usar porta alta.');
          client.mode={active:true,port:number};reply(200,'Conexao ativa configurada.');break;
        }
        case 'SIZE': {const entry=await serial(()=>adapter.stat(filename()));if(entry.type!=='file')throw denied('Nao e arquivo.');reply(213,String(entry.size));break;}
        case 'REST':if(!/^\d+$/.test(arg)||!Number.isSafeInteger(Number(arg)))throw denied('Offset invalido.');client.rest=Number(arg);reply(350,'Offset aceito.');break;
        case 'LIST':case 'NLST':case 'MLSD': {
          const target=virtualPath(client.cwd,arg.replace(/^-[A-Za-z]+(?:\s+|$)/,''));
          const rows=await serial(()=>adapter.list(target));
          const text=rows.map(row=>{
            const writable=upload&&row.type==='directory'&&/^\/SD(?:\/|$)/i.test(virtualPath(target,row.name));
            return verb==='NLST'?row.name+'\r\n':verb==='MLSD'?'type='+(row.type==='directory'?'dir':'file')+';size='+row.size+';perm='+(row.type==='directory'?(writable?'elcm':'el'):'r')+'; '+row.name+'\r\n':listing(row,writable);
          }).join('');
          await transfer(data=>write(data,Buffer.from(text,'utf8')));break;
        }
        case 'MLST': {const entry=await serial(()=>adapter.stat(filename()));socket.write('250-Entry\r\n type='+(entry.type==='directory'?'dir':'file')+';size='+entry.size+'; '+filename()+'\r\n250 End\r\n');break;}
        case 'STAT':reply(211,'NS2ToolKit FTP local ativo.');break;
        case 'RETR': {
          const target=filename(), offset=client.rest;client.rest=0;
          const entry=await serial(()=>adapter.stat(target));if(entry.type!=='file'||offset>entry.size)throw denied('Arquivo ou offset invalido.');
          await transfer(data=>serial(async()=>{for await(const bytes of adapter.read(target,offset))await write(data,bytes);}));break;
        }
        case 'MKD':case 'XMKD':if(!upload)throw denied('Servidor somente leitura.');await serial(()=>adapter.mkdir(filename()));reply(257,quote(filename())+' created');break;
        case 'STOR': {
          if(!upload)throw denied('Servidor somente leitura.');
          if(client.rest){client.rest=0;throw denied('Retomada de envio nao suportada.');}
          if(uploadBusy)throw Object.assign(Error('Outro envio esta em andamento.'),{ftpCode:450});
          const target=filename();uploadBusy=true;
          let work;
          try {
            await serial(()=>adapter.canUpload(target));
            work=await fs.mkdtemp(path.join(staging,'upload-'));const local=path.join(work,'data.part');
            let size=0;const hash=crypto.createHash('sha256');
            await transfer(async data=>{
              const output=await fs.open(local,'wx');let checked=0;
              try {
                for await(const bytes of data) {
                  if(client.aborted||stopping)throw networkError('Envio cancelado.');
                  size+=bytes.length;if(size>maxUpload)throw Object.assign(Error('Limite de envio: 1 GiB por arquivo.'),{ftpCode:552});
                  if(size>=checked){const space=await fs.statfs(work,{bigint:true});if(space.bavail*space.bsize<512n*1024n*1024n)throw Object.assign(Error('Pouco espaco para preparar o envio no PC.'),{ftpCode:552});checked=size+16*1024*1024;}
                  await output.writeFile(bytes);hash.update(bytes);
                }
              }finally{await output.close();}
              if(client.aborted||stopping)throw networkError('Envio cancelado antes da gravacao no SD.');
              data.setTimeout(0);
              const expected=hash.digest('hex');
              await serial(()=>{if(client.closed||client.aborted)throw networkError('Envio cancelado antes de criar o arquivo.');return adapter.uploadNew(target,local,expected,size,path.join(work,'upload-report.json'));});
            },true);
          }finally{uploadBusy=false;if(work)await fs.unlink(path.join(work,'data.part')).catch(error=>{if(error.code!=='ENOENT')throw error;});}
          break;
        }
        default:reply(['APPE','STOU','DELE','RMD','XRMD','RNFR','RNTO','SITE'].includes(verb)?550:502,'Operacao indisponivel. Sem sobrescrita ou exclusao.');
      }
    }
    let input='';socket.on('data',part=>{
      input+=part;if(Buffer.byteLength(input)>16384){reply(500,'Comando longo demais.');socket.destroy();return;}
      for(;;){const at=input.indexOf('\n');if(at<0)break;const line=input.slice(0,at).replace(/\r$/,'');input=input.slice(at+1);
        const match=/^([A-Za-z]+)(?: (.*))?$/.exec(line);if(!match||line.includes('\0')){reply(500,'Comando invalido.');continue;}
        const verb=match[1].toUpperCase(),arg=match[2]||'';
        if(verb==='ABOR'){client.abort();reply(225,'Cancelamento solicitado.');continue;}
        if(++client.pending>32){reply(421,'Comandos demais.');socket.destroy();return;}
        client.chain=client.chain.then(()=>command(verb,arg)).catch(error=>{
          if(!error.ftpStop)reply(error.ftpCode||451,error.ftpCode?error.message:'Operacao falhou. Confira o assistente.');
        }).finally(()=>client.pending--);
      }
    });
  });
  control.on('error',error=>{fatalError ||= error;onFatal(error);});
  await new Promise((resolve,reject)=>{control.once('error',reject);control.listen(port,'127.0.0.1',resolve);});
  return {url:'ftp://127.0.0.1:'+control.address().port+'/',port:control.address().port,
    close:async()=>{stopping=true;for(const client of clients){client.abort();client.socket.destroy();}await new Promise(resolve=>control.close(resolve));await tail;
      if(fatalError)throw fatalError;}};
}
module.exports={createServer,listing};
