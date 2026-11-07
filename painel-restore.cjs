const {emit, failureDetails} = require('./painel-progress.cjs');
const {runControlled} = require('./painel-runner.cjs');
const {requireHeldSession, lockSession, invalidateSession} = require('./painel-session.cjs');
const {verifyHeldHealth} = require('./painel-recovery.cjs');
const {attachGame} = require('./tools/OunceCake/engine/session.cjs');
const restore = require('./painel-save-restore.cjs');
async function main([run, action, source, parent, selection, editFlag, targetId], {send = emit, attach = attachGame} = {}) {
  let unlock, cancelled = false, result, sessionReady = false;
  const stop = () => {cancelled = true;};
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    if (action === 'inspect') {send('inspection', await restore.inspect(source)); return;}
    if (!['prepare','apply'].includes(action)) throw Error('Ação de restauração inválida.');
    run = await requireHeldSession(run); sessionReady = true; unlock = await lockSession(run, 'restore-' + action);
    if (action === 'prepare') {
      const selected = JSON.parse(Buffer.from(selection || '', 'base64').toString('utf8'));
      if (!/^\d+$/.test(targetId || '')) throw Error('Selecione o destino lido do console.');
      result = await restore.prepare({run,source,parent,selected,targetId,allowEdited:editFlag === 'allow-edited',stop:() => cancelled,send,attach});
      send('prepared', result);
    } else {
      result = await restore.apply({run,planPath:source,planSha256:parent,confirmed:selection === '--confirm-restore',stop:() => cancelled,send,attach});
      send('complete', result);
    }
  } catch (error) {
    let reusable = !error.nativeTouched && (action === 'inspect' || sessionReady);
    if (error.nativeTouched && error.restoreRefusal === true && !error.writesStarted && !error.cleanupErrors && !/timeout|timed out|transport|disconnected/i.test(error.message)) {
      try {reusable = await verifyHeldHealth(run);} catch {reusable = false;}
    }
    if (!reusable && unlock) await invalidateSession(run, error.message);
    send('error', {...failureDetails(error, {}, (error.cleanupErrors || []).map(message => Error(message))),
      summary:error.message, requiresRestart:!reusable, writesStarted:!!error.writesStarted});
    process.exitCode = 1;
  } finally {process.off('SIGINT',stop); process.off('SIGTERM',stop); if (unlock) await unlock();}
}
module.exports = {main};
if (require.main === module) runControlled(main, process.argv.slice(2)).catch(error => {emit('error',failureDetails(error)); process.exitCode = 1;});
