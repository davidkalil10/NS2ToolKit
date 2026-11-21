'use strict';
// Trusted distribution descriptor. No discovery, downloads or console requests.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const fail=message=>{throw Error('Configuração kaiHEN inválida: '+message);};
function validateConfig(c){
  if(c?.format!=='ns2toolkit-kaihen-config-v1')fail('formato não reconhecido.');
  if(!/^\d{8}(?:[a-z]|\.\d+)?$/.test(c.release||''))fail('release.');
  for(const key of ['kaihenCommit','hostCommit'])if(!/^[a-f0-9]{40}$/.test(c[key]||''))fail(key+'.');
  if(c.compatibility?.profile!=='held-fs-kaihen-v1'||c.compatibility.bootstrapArgumentBytes!==432||c.compatibility.startOperation!==10)
    fail('perfil de integração não suportado; revise o host antes de atualizar.');
  const name='kaiHEN-'+c.release+'.zip';
  if(c.archive?.file!==name||c.archive.url!=='https://github.com/ouncebrew/kaihen/releases/download/'+c.release+'/'+name||
    !/^[a-f0-9]{64}$/.test(c.archive.sha256||''))fail('origem ou hash do pacote.');
  if(!Array.isArray(c.localPatches)||c.localPatches.some(x=>typeof x!=='string'))fail('adaptações locais.');
  if(!Array.isArray(c.sources)||!c.sources.length)fail('fontes ausentes.');
  const names=new Set(),files=new Set();
  for(const e of c.sources){
    if(!/^[a-z0-9-]+$/.test(e.name||'')||names.has(e.name)||files.has(e.file))fail('fontes duplicadas.');
    if(!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(e.repository||'')||
      !/^[A-Za-z0-9_.-]+$/.test(e.revision||'')||!/^[A-Za-z0-9_.-]+\.zip$/.test(e.file||'')||
      !/^[a-f0-9]{64}$/.test(e.sha256||''))fail('entrada de fontes.');
    if(e.url!==e.repository.replace('https://github.com/','https://codeload.github.com/')+'/zip/'+e.revision)
      fail('URL de fontes não corresponde à revisão.');
    names.add(e.name);files.add(e.file);
  }
  if(c.sources.find(e=>e.name==='kaihen')?.revision!==c.kaihenCommit)fail('revisão dos fontes kaiHEN.');
  for(const name of ['hbloader','hbmenu','ounceshell','libounce','ouncevk','libkaihen-sdk','ounce-devkit','libconfig','devkitpro-portlibs'])
    if(!names.has(name))fail('fonte obrigatória ausente: '+name);
  return c;
}
async function loadConfig(root){
  root=path.resolve(root);
  const base=path.join(root,'integrations/kaihen'),raw=await fs.readFile(path.join(base,'kaihen-config.json'));
  const config=validateConfig(JSON.parse(raw.toString('utf8').replace(/^\uFEFF/,'')));
  return {config,configurationSha256:crypto.createHash('sha256').update(raw).digest('hex'),base,
    paths:{archive:path.join(root,'.runtime/kaihen-cache',config.archive.file),
      payload:path.join(root,'.runtime/kaihen-cache','package-'+config.release),
      sources:path.join(root,'.runtime/kaihen-source-archives')}};
}
module.exports={validateConfig,loadConfig};
if(require.main===module){
  if(process.argv[2]!=='--json'||process.argv.length!==4){console.error('Uso: node kaihen-config.cjs --json PASTA_TOOLKIT');process.exitCode=1;}
  else loadConfig(process.argv[3]).then(c=>console.log(JSON.stringify(c))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
