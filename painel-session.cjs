const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');

async function sessionConsoleAddress(run) {
  for (const name of ['result.json', 'connection.json']) {
    const state = await fs.readFile(path.join(run, name), 'utf8').then(JSON.parse)
      .catch(error => {if (error.code === 'ENOENT') return {}; throw error;});
    if (net.isIPv4(state.consoleAddress)) return state.consoleAddress;
  }
  throw Error('Esta sessão não registrou o IP do console. Informe-o manualmente ou inicie uma sessão nova com o assistente atualizado.');
}

async function requireHeldSession(run) {
  run = path.resolve(run);
  const state = JSON.parse(await fs.readFile(path.join(run, 'result.json'), 'utf8'));
  if (!state.verified || state.rpc?.state !== 'listening') throw Error('É necessária uma sessão 4/4 com conexão mantida aberta.');
  try {
    await fs.access(path.join(run, 'painel-session-invalid.json'));
    throw Error('Esta sessão teve uma operação incerta. Reinicie o console e inicie uma sessão nova.');
  } catch (error) {if (error.code !== 'ENOENT') throw error;}
  return run;
}

async function lockSession(run, operation) {
  const file = path.join(run, 'painel-operation.lock');
  let handle;
  try {handle = await fs.open(file, 'wx', 0o600);}
  catch (error) {
    if (error.code === 'EEXIST') throw Error('Outra operação do painel está usando esta sessão. Aguarde sua conclusão.');
    throw error;
  }
  try {await handle.writeFile(JSON.stringify({pid: process.pid, operation, at: new Date().toISOString()}));}
  catch (error) {await handle.close(); await fs.unlink(file); throw error;}
  return async () => {await handle.close(); await fs.unlink(file);};
}

async function invalidateSession(run, reason) {
  await fs.writeFile(path.join(run, 'painel-session-invalid.json'), JSON.stringify({at: new Date().toISOString(), reason}), {mode: 0o600});
}

module.exports = {requireHeldSession, lockSession, invalidateSession, sessionConsoleAddress};
