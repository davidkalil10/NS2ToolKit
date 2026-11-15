'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto');
const {format}=require('node:util');
const {emit}=require('./painel-progress.cjs');
const PACKAGE_HASH='9d0d1a7c6d91d018576121a9513f691ff397883a58090b585f0384965144f38f';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function safeFile(base,name){
  if(typeof name!=='string'||path.isAbsolute(name)||name.includes('\\')||name.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Caminho inválido no pacote kaiHEN.');
  return path.join(base,...name.split('/'));
}
async function verifyRuntime(root){
  const base=path.join(root,'integrations/kaihen'),manifest=await read(path.join(base,'runtime-manifest.json'));
  if(manifest.hostCommit!=='28f03b5895e5569d8fbc35cbed84906b8f0a65b2'||manifest.release!=='20261114d'||manifest.archiveSha256!==PACKAGE_HASH)throw Error('Versão kaiHEN não reconhecida.');
  let payload=path.join(base,'payload');
  try{await fs.access(payload);}catch(error){if(error.code!=='ENOENT')throw error;payload=path.join(root,'.runtime/kaihen-cache/package-20261114d');}
  for(const [directory,rows] of [[path.join(base,'host'),manifest.hostFiles],[payload,manifest.payloadFiles]]){
    if(!rows||!Object.keys(rows).length)throw Error('Manifesto kaiHEN incompleto.');
    for(const [name,expected]of Object.entries(rows))if(sha(await fs.readFile(safeFile(directory,name)))!==expected)throw Error('Arquivo kaiHEN alterado: '+name);
  }
  for(const name of ['ro/main','hen/main','game/main'])if((await fs.readFile(safeFile(payload,name))).toString('ascii',0,4)!=='NSO0')throw Error('Executável kaiHEN inválido: '+name);
  for(const name of ['hbmenu.nro','programs/ounceshell.nro'])if((await fs.readFile(safeFile(payload,name))).toString('ascii',16,20)!=='NRO0')throw Error('Homebrew inválido: '+name);
  return {base,payload,manifest};
}
function verifyStartup(record,session){
  if(record.session!==session||record.complete!==true||record.joined!==true||record.operation!==10||record.result!==0||record.channelRestoreResult!==0||
     !(record.gateRestoreResult===0||record.gateRestoreResult===0xea01&&record.gateRestorePending===true)||
     !/^\d+$/.test(String(record.pid))||BigInt(record.pid)<=0n)throw Error('O registro nativo não confirmou a inicialização do kaiHEN.');
  return {pid:String(record.pid),gateRestorePending:record.gateRestorePending===true};
}
class Monitor {
  constructor(send=emit){this.send=send;this.connected=false;this.folder=null;this.frontend=false;}
  line(text){for(const line of text.split(/\r?\n/)){
    if(line.startsWith('Run folder: ')){this.folder=line.slice(12).trim();this.send('kaihen_run',{path:this.folder});}
    if(line.startsWith('Waiting for Switch 2 at '))this.send('kaihen_waiting',{message:'PC pronto. Digite os comandos no SmileBASIC.'});
    if(line.trim().startsWith('V=START(')&&!this.start){this.start=line.trim();this.send('kaihen_command',{command:this.start});}
    if(line.startsWith('Connected. ')){this.connected=true;this.send('kaihen_connected',{message:'Conectado. Mantenha SmileBASIC aberto.'});}
    const stage=/^([1-4])\/4 (.*)/.exec(line);if(stage)this.send('kaihen_stage',{stage:Number(stage[1]),message:stage[2]});
    if(line.startsWith('RO frontend verified. '))this.frontend=true;
  }}
}
async function run(root,host,{send=emit,verify=verifyRuntime,acquire,launch,monitor=new Monitor(send),onCancelWaiting}={}){
  if(!net.isIPv4(host))throw Error('Selecione o endereço IPv4 do PC.');
  const {base,payload}=await verify(root),originalLog=console.log;
  const oldEnv={};for(const key of ['NS2_RO_IMAGE','NS2_BASIC_ARITY','NS2_WORKSPACE','NS2_RUN_DIR','HBMENU_NRO'])oldEnv[key]=process.env[key];
  let readyResolve,readyReject,readySeen=false,started=false,runFolder,proof;
  const frontend=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  const input=require('node:readline').createInterface({input:process.stdin});
  input.on('line',line=>{if(line==='stop'){
    if(!monitor.connected){send('kaihen_cancelled',{message:'Espera cancelada. Feche SmileBASIC antes de uma nova tentativa.'});if(onCancelWaiting)onCancelWaiting();}
    else send('status',{message:'A operação já está no console. Aguarde; não interrompa a inicialização.'});
  }});
  console.log=(...args)=>{originalLog(...args);monitor.line(format(...args));if(monitor.frontend&&!readySeen){readySeen=true;readyResolve(monitor.folder);}};
  process.env.NS2_RO_IMAGE=path.join(payload,'ro/main');process.env.NS2_BASIC_ARITY='5';process.env.NS2_WORKSPACE=path.join(root,'runs');
  delete process.env.NS2_RUN_DIR;
  let acquisition;
  try{
    const runAcquisition=acquire||require(path.join(base,'host/run.cjs')).main;
    acquisition=Promise.resolve().then(()=>runAcquisition(['--rpc',host])).then(result=>({result}),error=>({error}));
    acquisition.then(outcome=>{if(!readySeen)readyReject(outcome.error||Error('A aquisição terminou sem confirmar o RO.'));});
    runFolder=await frontend;if(!runFolder)throw Error('A aquisição não informou a pasta da sessão.');
    const state=await read(path.join(runFolder,'result.json'));
    if(!state.verified||state.rpc?.state!=='listening'||state.completed)throw Error('A sessão kaiHEN não está pronta.');
    await fs.writeFile(path.join(runFolder,'painel-session-invalid.json'),JSON.stringify({reason:'Sessão exclusiva do modo kaiHEN; não usar para backups, FTP ou mods GBA.'}));
    await fs.writeFile(path.join(runFolder,'painel-operation.lock'),JSON.stringify({pid:process.pid,operation:'kaihen'}),{flag:'wx'});
    process.env.NS2_RUN_DIR=runFolder;process.env.HBMENU_NRO=path.join(payload,'hbmenu.nro');
    send('kaihen_loading',{message:'Preparando hbmenu, OunceShell e ambiente homebrew no SD...'});
    const start=launch||require(path.join(runFolder,'switch2/ro/start-hen.cjs')).main;
    const result=await start(path.join(payload,'hen/main'),path.join(payload,'bootstrap.bin'),path.join(payload,'game/main'),[
      {source:path.join(payload,'programs/ounceshell.nro'),target:'/switch/ounceshell/ounceshell.nro'}]);
    proof=verifyStartup(await read(result.file),path.basename(runFolder));
    if(proof.pid!==String(result.pid))throw Error('O processo HEN difere do registro da inicialização.');
    started=true;
    await fs.writeFile(path.join(runFolder,'painel-kaihen.json'),JSON.stringify({ready:true,...proof,launcherOpened:false,homebrewOpened:false}));
    send('kaihen_ready',{message:'kaiHEN iniciado. Agora feche SmileBASIC pelo HOME, SEM REINICIAR. Mantenha esta janela aberta até confirmar o encerramento.',...proof});
    const outcome=await acquisition;
    const final=await read(path.join(runFolder,'result.json'));
    const report={ready:true,...proof,hostClosed:final.rpc?.state==='closed',reason:final.rpc?.reason,hostError:final.error||outcome.error?.message||null,
      cleanupErrors:final.cleanupErrors||[],launcherOpened:false,homebrewOpened:false};
    await fs.writeFile(path.join(runFolder,'painel-kaihen.json'),JSON.stringify(report,null,2));
    if(final.rpc?.reason!=='disconnected'||!report.hostClosed)throw Error('O host terminou de uma forma inesperada; preserve os registros.');
    send('kaihen_closed',{message:'SmileBASIC fechado. Abra um jogo nativo de Switch 2 segurando R. Na primeira vez ele pode abrir normalmente; feche o jogo e repita com R para entrar no hbmenu. Escolha OunceShell para testar.',
      hostError:report.hostError,cleanupConfirmed:!report.hostError&&!report.cleanupErrors.length});
    return report;
  }catch(error){
    error.requiresRestart=monitor.connected;
    send('error',{summary:error.message,requiresRestart:true,henStarted:started});
    // Never terminate a live native request. Let the user close SmileBASIC and
    // keep the host alive until its normal disconnect/retirement path ends.
    if(acquisition&&monitor.connected){send('status',{message:'Preserve os registros. Feche SmileBASIC e reinicie o console antes de tentar novamente.'});await acquisition;}
    throw error;
  }finally{
    console.log=originalLog;input.close();process.stdin.pause();
    for(const [key,value]of Object.entries(oldEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
}
module.exports={Monitor,verifyStartup,verifyRuntime,run};
if(require.main===module)run(__dirname,process.argv[2],{onCancelWaiting:()=>process.exit(0)}).catch(error=>{emit('error',{summary:error.message,requiresRestart:error.requiresRestart===true});process.exitCode=1;});
