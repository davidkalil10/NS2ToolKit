const {discoverBase, discoverUpdates, discoverDlc, discoverDataPatches} = require('./tools/OunceCake/engine/content.cjs');

async function inventoryGame(attachment, title, stop = () => false) {
  const result = {title, base: [], updates: [], dlc: [], dataPatches: []};
  for (const [key, discover] of Object.entries({base: discoverBase, updates: discoverUpdates, dlc: discoverDlc, dataPatches: discoverDataPatches})) {
    if (stop()) throw Error('Operação cancelada.');
    result[key] = await discover({...attachment, title});
  }
  return result;
}

function summarizeInventory(inventory) {
  const summary = {title: inventory.title};
  for (const key of ['base', 'updates', 'dlc', 'dataPatches']) summary[key] = inventory[key].map(row => ({
    contentTitle: row.contentTitle, version: row.version, storage: row.storage,
    contents: row.contents.map(content => ({type: content.contentType, programIndex: content.programIndex})),
  }));
  return summary;
}

async function tracePreparation(attachment, progress, send, action) {
  const ipc = attachment.s.ipc;
  async function traced(label, operation) {
    const started = Date.now();
    progress.nativeOperation = label;
    send('native_begin', {label, ...progress.snapshot()});
    try {
      const reply = await operation();
      send('native_end', {label, elapsedMs: Date.now() - started, result: reply?.result ?? null});
      progress.nativeOperation = '';
      return reply;
    } catch (error) {
      error.nativeOperation ||= label;
      send('native_error', {label, elapsedMs: Date.now() - started, message: error.message});
      throw error;
    }
  }
  attachment.s.ipc = function(label, ...args) {return traced(label, () => ipc.call(this, label, ...args));};
  const domain = {...attachment.domain, send(s, label, ...args) {
    return traced(label, () => attachment.domain.send(s, label, ...args));
  }};
  try {return await action({...attachment, domain});}
  finally {attachment.s.ipc = ipc;}
}

module.exports = {inventoryGame, summarizeInventory, tracePreparation};
