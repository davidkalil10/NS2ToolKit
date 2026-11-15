'use strict';
// One-way handoff from an owned FS 4/4 session. Never acquires or stops a host.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {emit}=require('./painel-progress.cjs');
const {requireHeldSession,lockSession,invalidateSession}=require('./painel-session.cjs');
const {verifyHeldHealth}=require('./painel-recovery.cjs');
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const check=(ok,message)=>{if(!ok)throw Error(message);};
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const proofs=['-layout.json','-loader-root-copy.json','-bound-sessions.json','-filesystem-types.json',
  '-gate-event.json','-sm-proof.json','-notifier-proof.json'];
async function exists(file){try{await fs.access(file);return true;}catch(e){if(e.code!=='ENOENT')throw e;return false;}}
async function endpointInfo(run){
  const current=await read(path.join(run,'switch2/current-acquisition.json'));
  return require('./engine/switch2/tools/endpoint.cjs').request(current.socketPath,{command:'root-native-info'});
}
async function preflight(run,probe=verifyHeldHealth,info=endpointInfo){
  run=await requireHeldSession(run);
  const state=await read(path.join(run,'result.json'));
  check(!state.completed,'A conexão já foi encerrada. Inicie uma sessão nova.');
  check(!await exists(path.join(run,'ns2jb-modloader-install.json')),'Esta sessão já foi usada pelo loader de mods. Reinicie antes de ativar homebrew.');
  const execution=await read(path.join(run,'switch2/fs-execution-current.json'));
  check(execution.verified&&execution.restored&&execution.session===path.basename(run),'A sessão não tem uma prova FS 4/4 correspondente.');
  const nativeProof=await read(path.resolve(run,execution.file));
  check(nativeProof.verified===true&&nativeProof.session===path.basename(run)&&
    nativeProof.trials?.length===2&&nativeProof.trials.every(row=>row.verified===true&&row.restored===true),
    'A prova nativa FS não corresponde à conexão.');
  const previous=await read(path.join(run,'switch2/ro/current-execution.json'));
  check(previous.verified&&previous.session===path.basename(run)&&previous.programId==='0400000000000037'&&
    /^\d+$/.test(previous.pid)&&BigInt(previous.pid)>1n,'Não foi possível identificar o processo RO desta conexão.');
  check(await probe(run)===true,'A saúde da sessão não foi confirmada.');
  const native=await info(run);
  check(native.session===path.basename(run)&&native.toolkitCapabilities?.includes('kaihen-transition-v1'),
    'Esta conexão foi aberta por uma versão anterior. Reinicie o console e conecte pela tela inicial desta versão para habilitar Ativar Homebrew.');
  check(native.worker?.joined&&native.notifiers?.length===1,'A sessão está ocupada ou não confirmou seus recursos nativos.');
  return {run,state,previous};
}
async function workspace(run,base,manifest){
  const folder=await fs.mkdtemp(path.join(run,'kaihen-runtime-'));
  for(const name of Object.keys(manifest.hostFiles)){
    if(!name.startsWith('engine/'))continue;
    const relative=name.slice(7),target=path.join(folder,...relative.split('/'));
    await fs.mkdir(path.dirname(target),{recursive:true});
    await fs.copyFile(path.join(base,'host',...name.split('/')),target);
  }
  await fs.copyFile(path.join(run,'connection.json'),path.join(folder,'connection.json'));
  await fs.copyFile(path.join(run,'switch2/current-acquisition.json'),path.join(folder,'switch2/current-acquisition.json'));
  for(const suffix of proofs){
    const name=path.basename(run)+suffix;
    const source=path.join(run,'switch2/ro',name),value=await read(source);
    check(value.session===path.basename(run),'Há um registro nativo de outra sessão: '+suffix);
    await fs.copyFile(source,path.join(folder,'switch2/ro',name));
  }
  // Only client tooling/proofs are copied. No live endpoint files are replaced.
  return folder;
}
async function nativeTools(folder){
  const at=name=>path.join(folder,'switch2/ro',name+'.cjs');
  const memory=await require(path.join(folder,'switch2/tools/fs-memory.cjs')).connect();
  return {memory,build:require(at('package-build')).build,bind:require(at('bind-sessions')).main,
    gate:require(at('test-gate')).main,launch:require(at('launch')).main,runtime:require(at('runtime')),
    ready:require(at('ready')).main,start:require(at('start-hen')).main};
}
async function frontend({run,folder,payload,previous,tools,send}){
  const {memory}=tools,current=await read(path.join(run,'switch2/current-acquisition.json'));
  const report=await read(current.report),root=report.ownedRoot?.clones?.[0];
  check(report.session===path.basename(run)&&root,'O root FS não corresponde à conexão atual.');
  const policy=path.join(run,'switch2/ro',path.basename(run)+'-code-0400000000000037/main.npdm');
  const image=path.join(payload,'ro/main'),pfs=path.join(folder,'switch2/ro/payload/kaihen-exefs.nsp');
  const imageHash=digest(await fs.readFile(image)),policyHash=digest(await fs.readFile(policy));
  await tools.build(image,policy,pfs);
  send('status',{message:'Preparando o ambiente homebrew usando a conexão 4/4 atual...'});
  await memory.request({command:'root-native-package-stage',root,kind:'ro',source:pfs});
  const donor=await memory.request({command:'root-native-package-open',root,kind:'ro',selectDonor:true});
  check(!donor.result&&donor.entries?.length===2&&
    donor.entries.find(e=>e.name==='main')?.sha256===imageHash&&
    donor.entries.find(e=>e.name==='main.npdm')?.sha256===policyHash,'O pacote RO não passou na releitura do console.');
  await tools.bind();
  const gate=await tools.gate();
  check(gate?.verified&&gate.restored,'A preparação do canal não foi confirmada.');
  const launch=await tools.launch();
  check(launch.imageAccepted&&launch.restored&&launch.pid,'O novo ambiente RO não foi aceito.');
  const active=await tools.runtime.activate(launch.file,previous.pid);
  check(String(active.originalPid)===previous.pid&&String(active.pid)===String(launch.pid),'A troca do processo RO não corresponde à sessão.');
  await tools.runtime.handoff();
  check((await tools.ready()).ready===true,'O frontend RO não confirmou a conexão.');
  return {previousPid:previous.pid,pid:String(active.pid),imageSha256:imageHash,policySha256:policyHash};
}
async function waitForClose(run,started){
  for(;;){
    const state=await read(path.join(run,'result.json'));
    check(state.started===started,'A identidade da conexão mudou enquanto aguardávamos SmileBASIC fechar.');
    if(state.completed){
      check(state.rpc?.state==='closed'&&state.rpc.reason==='disconnected','A conexão terminou de forma inesperada. Preserve os registros e reinicie o console.');
      return state;
    }
    await new Promise(resolve=>setTimeout(resolve,200));
  }
}
async function activateHeld(root,run,{send=emit,verify,probe,info,prepare=workspace,tools=nativeTools,
    promote=frontend,wait=waitForClose}={}){
  const kaihen=require('./painel-kaihen.cjs');
  const config=await(verify||kaihen.verifyRuntime)(root);
  let unlock,mutated=false,ready=false,record={mode:'held-session',ready:false};
  const oldRun=process.env.NS2_RUN_DIR,oldMenu=process.env.HBMENU_NRO;
  try{
    run=await requireHeldSession(run);unlock=await lockSession(run,'kaihen-transition');
    const checked=await preflight(run,probe,info);
    send('kaihen_run',{path:run});
    send('kaihen_connected',{message:'Conexão 4/4 reconhecida. Não é preciso repetir os comandos no SmileBASIC.'});
    const folder=await prepare(run,config.base,config.manifest);
    process.env.NS2_RUN_DIR=folder;process.env.HBMENU_NRO=path.join(config.payload,'hbmenu.nro');
    const client=await tools(folder);
    record={...record,session:path.basename(run),workspace:folder,started:new Date().toISOString()};
    await fs.writeFile(path.join(run,'painel-kaihen.json'),JSON.stringify(record,null,2));
    await invalidateSession(run,'Transição exclusiva para kaiHEN. Reinicie antes de voltar a backups ou FTP.');
    mutated=true;
    record.frontend=await promote({run,folder,payload:config.payload,previous:checked.previous,tools:client,send});
    send('kaihen_loading',{message:'Preparando hbmenu, OunceShell e ambiente homebrew no SD...'});
    const launched=await client.start(path.join(config.payload,'hen/main'),path.join(config.payload,'bootstrap.bin'),
      path.join(config.payload,'game/main'),[{source:path.join(config.payload,'programs/ounceshell.nro'),target:'/switch/ounceshell/ounceshell.nro'}]);
    const proof=kaihen.verifyStartup(await read(launched.file),path.basename(run));
    check(proof.pid===String(launched.pid),'O processo HEN difere do registro nativo.');
    ready=true;record={...record,...proof,ready:true,launcherOpened:false,homebrewOpened:false};
    await fs.writeFile(path.join(run,'painel-kaihen.json'),JSON.stringify(record,null,2));
    send('kaihen_ready',{message:'kaiHEN iniciado. Agora feche SmileBASIC pelo HOME, SEM REINICIAR. Mantenha esta janela aberta até confirmar o encerramento.',...proof});
    const closed=await wait(run,checked.state.started);
    record={...record,hostClosed:true,reason:closed.rpc.reason,hostError:closed.error||null,cleanupErrors:closed.cleanupErrors||[]};
    await fs.writeFile(path.join(run,'painel-kaihen.json'),JSON.stringify(record,null,2));
    send('kaihen_closed',{message:'SmileBASIC fechado. Abra um jogo nativo de Switch 2 segurando R. Na primeira vez ele pode abrir normalmente; feche o jogo e repita com R para entrar no hbmenu. Escolha OunceShell para testar.',
      hostError:record.hostError,cleanupConfirmed:!record.hostError&&!record.cleanupErrors.length});
    return record;
  }catch(error){
    error.requiresRestart=mutated;
    if(mutated){record={...record,error:error.message,requiresRestart:true};await fs.writeFile(path.join(run,'painel-kaihen.json'),JSON.stringify(record,null,2));}
    send('error',{summary:error.message,requiresRestart:mutated,henStarted:ready});error.reported=true;
    if(mutated)send('status',{message:'Preserve os registros. Feche SmileBASIC e reinicie o console antes de uma nova tentativa.'});
    throw error;
  }finally{
    // After mutation the marker and operation lock intentionally remain until reboot.
    if(unlock){if(mutated)await unlock.retain();else await unlock();}
    if(oldRun===undefined)delete process.env.NS2_RUN_DIR;else process.env.NS2_RUN_DIR=oldRun;
    if(oldMenu===undefined)delete process.env.HBMENU_NRO;else process.env.HBMENU_NRO=oldMenu;
  }
}
module.exports={activateHeld,preflight,workspace,frontend,waitForClose};
