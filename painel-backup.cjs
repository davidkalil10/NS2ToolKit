const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const {spawn} = require('node:child_process');
const {runControlled} = require('./painel-runner.cjs');
const ounce = './tools/OunceCake/engine/';
const {attachGame} = require(ounce + 'session.cjs');
const {discoverGames} = require(ounce + 'content.cjs');
const {prepareGame} = require(ounce + 'mounts.cjs');
const {deployFtp, readImage} = require(ounce + 'ftp.cjs');
const send = (kind, fields = {}) => console.log('PANEL:' + JSON.stringify({kind, ...fields}));

async function main([run, host, destination, title]) {
  if (!run || !net.isIPv4(host)) throw Error('Informe a sessão e o endereço IPv4 do Switch 2.');
  run = path.resolve(run);
  const state = JSON.parse(await fs.readFile(path.join(run, 'result.json'), 'utf8'));
  if (!state.verified || state.rpc?.state !== 'listening')
    throw Error('O backup exige uma sessão 4/4 verificada com Manter conexão aberta ativado.');
  let cancelled = false, attachment, server, downloader;
  const stop = () => {cancelled = true; downloader?.kill();};
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  let failure;
  try {
    send('status', {message: 'Conectando à sessão verificada...'});
    attachment = await attachGame(run);
    if (!title) {
      const games = await discoverGames({...attachment, shouldStop: () => cancelled});
      send('games', {games: games.map(g => ({title: g.title, name: g.name || g.title}))});
    } else {
      if (!/^[0-9a-f]{16}$/i.test(title)) throw Error('Identificador do jogo inválido.');
      const python = process.env.NS2_PANEL_PYTHON;
      if (!python) throw Error('Python 3 não foi encontrado pelo painel.');
      send('status', {message: 'Preparando os arquivos do jogo. Isso pode demorar...'});
      const prepared = await prepareGame({attachment, title, shouldStop: () => cancelled, tar: true});
      if (cancelled) throw Error('Backup cancelado.');
      server = await deployFtp({attachment, image: await readImage(), ...prepared, port: 2121});
      if (cancelled) throw Error('Backup cancelado.');
      send('status', {message: 'Copiando do Switch 2 para o PC...'});
      await new Promise((resolve, reject) => {
        downloader = spawn(python, ['-u', path.join(__dirname, 'painel-download.py'), host, destination, title],
          {stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true});
        downloader.stdout.pipe(process.stdout, {end: false});
        downloader.stderr.pipe(process.stderr, {end: false});
        downloader.once('error', reject);
        downloader.once('close', code => code === 0 && !cancelled ? resolve() : reject(Error(cancelled ?
          'Backup cancelado. Arquivos parciais foram preservados.' : 'A cópia não terminou. Confira os registros e o manifesto do backup.')));
      });
    }
  } catch (error) {failure = error;}
  finally {
    send('status', {message: 'Encerrando os recursos do backup...'});
    for (const close of [() => server?.close(), () => attachment?.close()]) {
      try {await close();} catch (error) {failure = failure ? new AggregateError([failure, error], failure.message + '\n' + error.message) : error;}
    }
    process.off('SIGINT', stop); process.off('SIGTERM', stop);
  }
  if (failure) throw failure;
  send(title ? 'complete' : 'listed');
}

if (require.main === module) runControlled(main, process.argv.slice(2)).catch(error => {
  send('error', {message: error.message}); process.exitCode = 1;
});
