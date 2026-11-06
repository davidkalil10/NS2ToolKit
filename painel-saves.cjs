const fs = require('node:fs/promises');
const path = require('node:path');
const {runControlled} = require('./painel-runner.cjs');
const {emit, Progress, failureDetails, closeAttachment} = require('./painel-progress.cjs');
const {requireHeldSession, lockSession, invalidateSession} = require('./painel-session.cjs');
const reader = require('./painel-save-reader.cjs');
const {attachGame} = require('./tools/OunceCake/engine/session.cjs');
const {discoverGames} = require('./tools/OunceCake/engine/content.cjs');

async function main([run, action, destination, id], {attach = attachGame, names = discoverGames, send = emit} = {}) {
  if (!['list', 'backup'].includes(action) || !destination || action === 'backup' && !/^\d+$/.test(id || '')) throw Error('Comando de backup de saves inválido.');
  run = await requireHeldSession(run);
  const unlock = await lockSession(run, 'saves-' + action);
  const progress = new Progress(send); progress.start();
  let cancelled = false, attachment, failure, context, result;
  const cleanupErrors = [];
  const stop = () => {cancelled = true;};
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    progress.begin('connect', 'Validando a conexão de leitura');
    attachment = await attach(run);
    progress.begin('inventory', 'Consultando os saves de usuário do console');
    const entries = await reader.inventory(attachment, () => cancelled);
    const available = entries.filter(reader.supported);
    if (action === 'list') {
      let games;
      try {games = JSON.parse(await fs.readFile(path.join(run, 'painel-games.json'), 'utf8'));}
      catch (error) {if (error.code !== 'ENOENT') throw error;}
      if (!games) {
        progress.begin('discover', 'Lendo os nomes dos jogos');
        games = (await names({...attachment, shouldStop: () => cancelled})).map(g => ({title: g.title, name: g.name || g.title}));
        await fs.writeFile(path.join(run, 'painel-games.json'), JSON.stringify(games));
      }
      const byTitle = new Map(games.map(g => [g.title.toLowerCase(), g.name]));
      send('saves', {saves: available.map(e => ({...e, name: byTitle.get(e.title) || e.title,
        typeName: e.type === 1 ? 'Por usuário' : 'Compartilhado'})), omitted: entries.length - available.length});
    } else {
      const entry = available.find(e => e.id === id);
      if (!entry) throw Error('O save selecionado não existe mais ou não é suportado. Atualize a lista.');
      const games = await fs.readFile(path.join(run, 'painel-games.json'), 'utf8').then(JSON.parse)
        .catch(error => {if (error.code === 'ENOENT') return []; throw error;});
      const name = games.find(game => game.title.toLowerCase() === entry.title)?.name;
      progress.begin('save_copy', 'Copiando o save em modo somente leitura');
      result = await reader.copyArchive(attachment, entry, destination, {stop: () => cancelled, send, name});
    }
    if (cancelled) throw Error('Operação cancelada.');
  } catch (error) {failure = error; context = progress.snapshot();}
  finally {
    progress.begin('cleanup', 'Fechando os arquivos de save abertos para leitura');
    try {await closeAttachment(attachment);}
    catch (error) {cleanupErrors.push(error); failure ||= error; context ||= progress.snapshot();}
    try {
      if (result) {
        result.manifest.complete = !failure;
        result.manifest.cleanupConfirmed = cleanupErrors.length === 0;
        if (failure) result.manifest.error = failure.message;
        await reader.writeManifest(result.folder, result.manifest);
      }
      if (failure) await invalidateSession(run, failure.message);
    } finally {
      progress.close(); process.off('SIGINT', stop); process.off('SIGTERM', stop);
      await unlock();
    }
  }
  if (failure) {
    send('error', failureDetails(failure, context, cleanupErrors)); process.exitCode = 1; return;
  }
  send(action === 'list' ? 'listed' : 'complete');
}

module.exports = {main};
if (require.main === module) runControlled(main, process.argv.slice(2)).catch(error => {emit('error', failureDetails(error)); process.exitCode = 1;});
