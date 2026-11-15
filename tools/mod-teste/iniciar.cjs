'use strict';
// Experimental hardware test, kept separate from the public assistant.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const PIN = '9395c91e9f5bb6c01df242fdbf7db194cf94b3c6';
const TITLE = '0100554023408000';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
function inside(root, name) {
  if (typeof name !== 'string' || name.includes('\\') || name.split('/').some(p => !p || p === '.' || p === '..') || path.isAbsolute(name)) throw Error('Caminho inválido no pacote.');
  return path.join(root, ...name.split('/'));
}
async function verifyPack(root) {
  const manifest = await read(path.join(root, 'pacote.json'));
  if (manifest.loaderRevision !== PIN || manifest.titleId !== TITLE || !manifest.files || !Object.keys(manifest.files).length) throw Error('Pacote de teste incompatível.');
  for (const [name, expected] of Object.entries(manifest.files)) {
    const file = inside(root, name);
    let parent = file;
    while (parent !== root) {
      if ((await fs.lstat(parent)).isSymbolicLink()) throw Error('O pacote não aceita atalhos de arquivos.');
      parent = path.dirname(parent);
    }
    if (hash(await fs.readFile(file)) !== expected) throw Error('Arquivo do pacote alterado: ' + name);
  }
  const loader = path.join(root, 'loader');
  require(path.join(loader, 'lib/native/artifacts.cjs')).artifacts();
  const collection = require(path.join(loader, 'lib/mods.cjs')).collectMods(path.join(root, 'sd-card-root/ns2jb-modloader'));
  const game = collection.games[0];
  if (collection.games.length !== 1 || game.titleId.toUpperCase() !== TITLE || game.romfs.filter(f => f.type === 'file').length !== 1 || game.exefs.length !== 1 || game.exefs[0].path !== '/main') throw Error('O pacote deve conter somente a ROM e main do teste FireRed.');
  require(path.join(loader, 'lib/exefs.cjs')).decodeNso(await fs.readFile(game.exefs[0].file));
  require('./patch-loader.cjs').verifyRemoteLayout(loader, collection);
  return manifest;
}
async function activate(root, run, {verify = verifyPack, load, status, verifyRun, log = console.log} = {}) {
  root = path.resolve(root); run = path.resolve(run);
  await verify(root);
  const installer = load ? null : require(path.join(root, 'loader/install.cjs'));
  (verifyRun || installer.verifiedRun)(run);
  const connection = await read(path.join(run, 'connection.json'));
  if (connection.addresses?.session !== path.basename(run) || !Number.isInteger(connection.port) || connection.port < 1 || connection.port > 65535) throw Error('A conexão não pertence à sessão selecionada.');
  for (const name of ['painel-session-invalid.json', 'ns2jb-modloader-install.json']) {
    try {await fs.access(path.join(run, name));} catch (error) {if (error.code === 'ENOENT') continue; throw error;}
    throw Error('Esta sessão já foi encerrada para operações ou já recebeu o loader. Inicie uma sessão nova após reiniciar o console.');
  }
  const lockFile = path.join(run, 'painel-operation.lock');
  let lock;
  try {lock = await fs.open(lockFile, 'wx');} catch (error) {if (error.code === 'EEXIST') throw Error('Desmonte o FTP e aguarde qualquer backup terminar antes de ativar o mod.'); throw error;}
  let nativeStarted = false;
  try {
    await lock.writeFile(JSON.stringify({pid: process.pid, operation: 'modloader-game-handoff', at: new Date().toISOString()}));
    await (status || require(path.join(root, 'loader/lib/find-session.cjs')).status)(connection.port);
    log('Conexão confirmada. Carregando o mod do SD; aguarde READY.');
    nativeStarted = true;
    await (load || installer.main)(['--sd', '--run-dir', run, '--title', TITLE]);
    const result = await read(path.join(run, 'ns2jb-modloader-install.json'));
    if (result.status !== 'ready' || !result.titleIds?.some(id => id.toUpperCase() === TITLE)) throw Error('O loader não confirmou READY para o FireRed.');
    log('\nPRONTO PARA TESTAR: clique em Encerrar conexão no assistente e aguarde a limpeza.');
    log('Depois feche o SmileBASIC SEM REINICIAR o console e abra o FireRed. Mantenha o SD inserido.');
    log('Não monte FTP nem execute backups nesta sessão. Reiniciar desativa o mod.');
    return result;
  } catch (error) {
    if (nativeStarted) {
      await fs.writeFile(path.join(run, 'painel-session-invalid.json'), JSON.stringify({at: new Date().toISOString(), reason: 'Teste de mod interrompido: ' + error.message}), {flag: 'wx'}).catch(e => {if (e.code !== 'EEXIST') log('Não foi possível registrar a sessão interrompida: ' + e.message);});
      log('A ativação não foi confirmada. Preserve os registros, encerre a conexão e reinicie antes de outra tentativa.');
    }
    throw error;
  } finally {
    await lock.close();
    // Keep a durable reservation after native operations: the GUI must not reuse
    // a session whose helper RO has been handed off, even if its host is alive.
    if (!nativeStarted) await fs.unlink(lockFile);
  }
}
async function main(args = process.argv.slice(2)) {
  const root = path.resolve(__dirname);
  if (args.length === 1 && args[0] === '--check') {
    await verifyPack(root);
    console.log('Pacote conferido: hashes, loader, RomFS/ExeFS, NSO e caminhos remotos do SD. Nenhuma conexão foi aberta.');
  } else if (args.length === 2 && args[0] === '--run-dir') await activate(root, args[1]);
  else throw Error('Use --check ou --run-dir "caminho da pasta runs/switch2-... ativa".');
}
module.exports = {verifyPack, activate, inside};
if (require.main === module) main().catch(error => {console.error('TESTE INTERROMPIDO: ' + error.message); process.exitCode = 1;});
