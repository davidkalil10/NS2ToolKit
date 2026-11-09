// Read-only access to an already opened filesystem; owns only temporary handles.
const {denied} = require('./painel-ftp-storage.cjs');
const {resultError} = require('./tools/OunceCake/engine/protocol.cjs');
function reply(value, label) {if (value.result) throw resultError(label, value.result); return value;}
function fileSystemView(a, handle, {stop=()=>false, send=()=>{}}={}) {
  function checkStop() {if (stop()) throw Object.assign(Error('FTP encerrado.'), {ftpStop:true});}
  async function stat(filename) {
    checkStop();
    const type=reply(await a.filesystem.pathMethod(a.s,handle,7,filename),'FTP virtual tipo').data.readUInt32LE();
    if(type===0)return {type:'directory',size:0};
    if(type!==1)throw Error('Tipo de arquivo desconhecido.');
    const opened=reply(await a.filesystem.openFile(a.s,handle,filename),'FTP virtual abrir arquivo');
    try {const size=Number(await a.filesystem.fileSize(a.s,opened.handle));if(!Number.isSafeInteger(size)||size<0)throw Error('Tamanho inválido.');return {type:'file',size};}
    finally {await a.s.close(opened.handle);}
  }
  async function list(filename) {
    checkStop();const mode=Buffer.alloc(4);mode.writeUInt32LE(3);
    const opened=reply(await a.filesystem.pathMethod(a.s,handle,9,filename,mode),'FTP virtual abrir pasta');
    const directory=a.domain.oneHandle(opened), rows=[];
    try {
      for(;;){
        checkStop();const address=a.s.base+0x6000,capacity=64;
        const response=reply(await a.s.ipc('FTP virtual listar pasta',directory,0,Buffer.alloc(0),{receive:[{address,size:capacity*0x310,mode:0}]}),'FTP virtual listar pasta');
        const count=Number(response.data.readBigUInt64LE());
        if(!Number.isInteger(count)||count<0||count>capacity)throw Error('Contagem de diretório inválida.');
        if(!count)return rows;
        const bytes=await a.s.read(address,count*0x310);if(bytes.length!==count*0x310)throw Error('Diretório truncado.');
        for(let i=0;i<count;i++){
          const row=bytes.subarray(i*0x310,(i+1)*0x310),name=row.subarray(0,0x301).toString('utf8').split('\0')[0],type=row[0x304],size=Number(row.readBigUInt64LE(0x308));
          if(!name||/[\/\\\0\r\n]/.test(name)||['.','..'].includes(name)||![0,1].includes(type)||!Number.isSafeInteger(size)||size<0)throw Error('Entrada de diretório inválida.');
          rows.push({name,type:type===0?'directory':'file',size});
          if(rows.length>16384)throw denied('Pasta excede 16.384 entradas.');
        }
      }
    }finally{await a.s.close(directory);}
  }
  async function* read(filename,offset=0){
    checkStop();const opened=reply(await a.filesystem.openFile(a.s,handle,filename),'FTP virtual download');
    try {
      const size=Number(await a.filesystem.fileSize(a.s,opened.handle));
      if(!Number.isSafeInteger(size)||size<0||!Number.isSafeInteger(offset)||offset<0||offset>size)throw denied('Tamanho ou offset inválido.');
      while(offset<size){checkStop();const wanted=Math.min(0x40000,size-offset),bytes=await a.filesystem.readFile(a.s,opened.handle,offset,wanted);
        if(bytes.length!==wanted)throw Error('Leitura virtual incompleta.');offset+=bytes.length;send('transfer',{direction:'download',file:filename,done:offset,total:size});yield bytes;}
      if(Number(await a.filesystem.fileSize(a.s,opened.handle))!==size)throw Error('O arquivo mudou durante a leitura.');
    }finally{await a.s.close(opened.handle);}
  }
  return {stat,list,read};
}
module.exports={fileSystemView};
