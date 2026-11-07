const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const {request} = require('./rpc.cjs');
const {requireHeldSession} = require('./painel-session.cjs');

async function verifyHeldHealth(run) {
  await requireHeldSession(run);
  const status = await request(run, {command: 'status'});
  if (!status.ready) throw Error('A ponte RPC não está pronta.');
  const state = JSON.parse(await fs.readFile(path.join(run, 'switch2/current-acquisition.json'), 'utf8'));
  const info = await new Promise((resolve, reject) => {
    const socket = net.createConnection(state.socketPath);
    let body = '';
    socket.setEncoding('utf8');
    socket.setTimeout(3000, () => socket.destroy(Error('A verificação da sessão não respondeu.')));
    socket.on('error', reject);
    socket.on('connect', () => socket.write(JSON.stringify({command: 'root-native-info'}) + '\n'));
    socket.on('data', part => {body += part; if (body.length > 1024 * 1024) socket.destroy(Error('Resposta de sessão inválida.'));});
    socket.on('end', () => {try {const value = JSON.parse(body); if (value.error) throw Error(value.error); resolve(value);} catch (error) {reject(error);}});
  });
  if (info.session !== path.basename(run)) throw Error('O endpoint pertence a outra sessão.');
  return true;
}

function refusalKind(error) {
  let kind = null, depth = 0;
  const seen = new Set();
  for (let current = error; current; current = current.cause) {
    if (++depth > 8 || seen.has(current) || current instanceof AggregateError || current.cleanupErrors?.length ||
        /timed out|timeout|disconnected/i.test(String(current.message))) return null;
    seen.add(current);
    if (current.code === 'GAME_ORIGINAL_CONTENT_REQUIRED' ||
        current.message === 'Content requires an original-content mount; standalone ES preparation does not apply') kind ||= 'unsupported_content';
    const native = current.nativeResult;
    if (current.nativeOperation === 'Open selected game CodeFS' && Number.isInteger(native?.raw) &&
        native.raw > 0 && (native.raw & 0x3fffff) === 0x408 && native.canonical === 0x408) kind = 'content_not_found';
  }
  return kind;
}

async function assessFailure(error, cleanupErrors, run, probe = verifyHeldHealth) {
  const category = refusalKind(error);
  if (!category || cleanupErrors.length) return {requiresRestart: true, sessionReusable: false};
  try {
    if (await probe(run) !== true) throw Error('A saúde da sessão não foi confirmada.');
    return {category, requiresRestart: false, sessionReusable: true,
      summary: category === 'content_not_found' ?
        'O sistema não encontrou o conteúdo selecionado para abrir. A sessão foi verificada; você pode escolher outro jogo.' :
        'Este conteúdo exige uma montagem ainda não suportada. A sessão foi verificada; você pode escolher outro jogo.'};
  } catch (healthError) {
    return {requiresRestart: true, sessionReusable: false, sessionCheckError: healthError.message};
  }
}

module.exports = {verifyHeldHealth, assessFailure, refusalKind};
