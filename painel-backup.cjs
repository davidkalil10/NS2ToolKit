const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const {spawn} = require('node:child_process');
const {runControlled} = require('./painel-runner.cjs');
const {emit, Progress, failureDetails, closeAttachment} = require('./painel-progress.cjs');
const {assessFailure, verifyHeldHealth} = require('./painel-recovery.cjs');
const {requireHeldSession, lockSession, invalidateSession, sessionConsoleAddress} = require('./painel-session.cjs');
const ounce = './tools/OunceCake/engine/';
const {attachGame} = require(ounce + 'session.cjs');
const {discoverGames} = require(ounce + 'content.cjs');
const {prepareGame} = require(ounce + 'mounts.cjs');
const {deployFtp, readImage} = require(ounce + 'ftp.cjs');
const {prepareGame: prepareCompatibility} = require('./compat/ouncecake/mounts.cjs');
const {inventoryGame, summarizeInventory, tracePreparation} = require('./painel-game-diagnostics.cjs');

async function main([run, host, destination, title, suppliedName, profile = 'full'], {
  attach = attachGame, discover = discoverGames, prepare, inventory = inventoryGame, probe = verifyHeldHealth, send = emit,
} = {}) {
  if (!['full', 'compatibility', 'inventory'].includes(profile)) throw Error('Perfil de exportação inválido.');
  if (!run || host !== 'auto' && !net.isIPv4(host)) throw Error('Informe a sessão e o endereço IPv4 do Switch 2.');
  run = await requireHeldSession(run);
  if (host === 'auto') host = await sessionConsoleAddress(run);
  const unlock = await lockSession(run, title ? 'game-backup' : 'game-list');
  let cancelled = false, attachment, server, downloader;
  const stop = () => {cancelled = true; downloader?.kill();};
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  let failure, failureContext, recovery, selection = {profile, omittedSections: []};
  const cleanupErrors = [];
  const progress = new Progress(send); progress.start();
  try {
    progress.begin('connect', 'Validando a sessão do console');
    send('status', {message: 'Conectando à sessão verificada...'});
    attachment = await attach(run);
    if (!title) {
      progress.begin('discover', 'Consultando os jogos instalados');
      const games = await discover({...attachment, shouldStop: () => cancelled});
      await fs.writeFile(path.join(run, 'painel-games.json'), JSON.stringify(games.map(g => ({title: g.title, name: g.name || g.title}))));
      send('games', {games: games.map(g => ({title: g.title, name: g.name || g.title}))});
    } else {
      if (!/^[0-9a-f]{16}$/i.test(title)) throw Error('Identificador do jogo inválido.');
      let gameName = suppliedName;
      if (!gameName) {
        const cache = await fs.readFile(path.join(run, 'painel-games.json'), 'utf8').then(JSON.parse).catch(error => {if (error.code === 'ENOENT') return []; throw error;});
        gameName = cache.find(game => game.title.toLowerCase() === title.toLowerCase())?.name;
      }
      send('selection', {title, name: gameName, profile});
      const diagnosticFile = path.join(run, 'game-plan-' + title + '-' + Date.now() + '.json');
      progress.begin('inventory', 'Identificando base, atualizações e programas do jogo');
      // Unit-test overrides may supply the preparation directly, as before.
      const catalog = prepare ? null : await inventory(attachment, title, () => cancelled);
      if (catalog) await fs.writeFile(diagnosticFile, JSON.stringify({profile, ...summarizeInventory(catalog)}, null, 2));
      if (profile === 'inventory') {
        send('destination', {path: run});
        send('status', {message: 'Inventário salvo: ' + diagnosticFile});
      } else {
        const python = process.env.NS2_PANEL_PYTHON;
        if (!python) throw Error('Python 3 não foi encontrado pelo painel.');
        send('status', {message: 'Preparando os arquivos do jogo. Isso pode demorar...'});
        progress.begin('prepare', 'Preparando o conteúdo do jogo');
        const mount = prepare || (profile === 'compatibility' ? prepareCompatibility : prepareGame);
        const prepared = await progress.openings(() => tracePreparation(attachment, progress, send, traced =>
          mount({attachment: traced, title, shouldStop: () => cancelled, tar: true, profile})));
        selection = prepared.selection || selection;
        const scopeFile = path.join(run, 'game-scope-' + title + '-' + Date.now() + '.json');
        await fs.writeFile(scopeFile, JSON.stringify(selection, null, 2));
        send('scope', selection);
        if (cancelled) throw Error('Backup cancelado.');
        progress.begin('ftp', 'Iniciando o servidor de leitura');
        server = await deployFtp({attachment, image: await readImage(), ...prepared, port: 2121});
        if (cancelled) throw Error('Backup cancelado.');
        send('status', {message: 'Copiando do Switch 2 para o PC...'});
        progress.begin('transfer', 'Transferindo os arquivos para o PC');
        await new Promise((resolve, reject) => {
          downloader = spawn(python, ['-u', path.join(__dirname, 'painel-download.py'), host, destination, title, '--scope', scopeFile, ...(gameName ? ['--name', gameName] : [])],
            {stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true});
          downloader.stdout.pipe(process.stdout, {end: false});
          downloader.stderr.pipe(process.stderr, {end: false});
          downloader.once('error', reject);
          downloader.once('close', code => code === 0 && !cancelled ? resolve() : reject(Error(cancelled ?
            'Backup cancelado. Arquivos parciais foram preservados.' : 'A cópia não terminou. Confira os registros e o manifesto do backup.')));
        });
      }
    }
  } catch (error) {failure = error; failureContext = progress.snapshot();}
  finally {
    progress.begin('cleanup', 'Encerrando os recursos do backup');
    send('status', {message: 'Encerrando os recursos do backup...'});
    for (const close of [() => server?.close(), () => closeAttachment(attachment)]) {
      try {await close();} catch (error) {cleanupErrors.push(error); failure ||= error; failureContext ||= progress.snapshot();}
    }
    process.off('SIGINT', stop); process.off('SIGTERM', stop);
    progress.close();
    if (failure) {
      recovery = await assessFailure(failure, cleanupErrors, run, probe);
      if (recovery.requiresRestart) await invalidateSession(run, failure.message);
    }
    await unlock();
  }
  if (failure) {
    send('error', {...failureDetails(failure, failureContext, cleanupErrors), ...recovery});
    process.exitCode = 1; return;
  }
  send(title ? 'complete' : 'listed', {profile, selection});
}

module.exports = {main};
if (require.main === module) runControlled(main, process.argv.slice(2)).catch(error => {
  emit('error', failureDetails(error)); process.exitCode = 1;
});
