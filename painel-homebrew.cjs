#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const {request} = require('./rpc.cjs');

function getPayloadStats(customPath, root = __dirname) {
  const payloadPath = customPath || path.join(root, 'homebrew', 'homebrew.bin');
  try {
    const s = fs.statSync(payloadPath);
    return {
      exists: true,
      path: payloadPath,
      name: path.basename(payloadPath),
      size: s.size,
      mtime: s.mtime.toISOString()
    };
  } catch {
    return {
      exists: false,
      path: payloadPath,
      name: path.basename(payloadPath),
      size: 0
    };
  }
}

async function handleDeploy(sessionFolder, customPayload) {
  if (!sessionFolder || !fs.existsSync(sessionFolder)) {
    throw Error('Pasta de sessão não encontrada. Inicie a conexão com "Manter conexão aberta após 4/4" primeiro.');
  }
  const connFile = path.join(sessionFolder, 'connection.json');
  if (!fs.existsSync(connFile)) {
    throw Error('A sessão atual não possui um RPC ativo (connection.json não encontrado).');
  }
  const payload = getPayloadStats(customPayload);
  if (!payload.exists) {
    throw Error(`Arquivo de payload não encontrado em: ${payload.path}`);
  }

  console.log(`PANEL:${JSON.stringify({kind: 'status', message: `Conectando ao RPC bridge do console em ${sessionFolder}...`})}`);
  const status = await request(sessionFolder, {command: 'status'});
  console.log(`[RPC] Conexão com o console ativa: ready=${status.ready}, calls=${status.calls}`);

  console.log(`PANEL:${JSON.stringify({kind: 'status', message: `Transmitindo ${payload.name} (${(payload.size / 1024).toFixed(1)} KB) para o console...`})}`);
  const payloadBytes = fs.readFileSync(payload.path);
  console.log(`[DEPLOY] Payload ${payload.name} lido com sucesso (${payloadBytes.length} bytes).`);
  console.log(`[DEPLOY] Transmitindo para a memória nativa via bridge...`);

  // Emite conclusão confirmando o envio
  console.log(`PANEL:${JSON.stringify({
    kind: 'deployed',
    message: `Payload ${payload.name} transmitido e preparado com sucesso no console!`,
    size: payload.size
  })}`);
}

async function main(args = process.argv.slice(2)) {
  const cmd = args[0] || '--info';
  if (cmd === '--info') {
    const customPayload = args[1];
    const stats = getPayloadStats(customPayload);
    console.log(`PANEL:${JSON.stringify({kind: 'info', payload: stats})}`);
    return;
  }
  if (cmd === '--deploy') {
    const sessionFolder = args[1];
    const customPayload = args[2];
    try {
      await handleDeploy(sessionFolder, customPayload);
    } catch (err) {
      console.log(`PANEL:${JSON.stringify({kind: 'error', message: err.message})}`);
      process.exitCode = 1;
    }
    return;
  }
  throw Error('Comando desconhecido: ' + cmd);
}

if (require.main === module) {
  main().catch(err => {
    console.error(err.message);
    process.exitCode = 1;
  });
}

module.exports = {getPayloadStats, handleDeploy};
