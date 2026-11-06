// SaveDataInfo layout and read-only SaveDataAttribute follow ns2-savekit
// (dougchansan, MIT), pinned under tools/ns2-savekit. No write patches are used.
const fs = require('node:fs/promises');
const {createReadStream} = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {build} = require('./tools/ns2-savekit/tools/lib/save-attr.cjs');
const {replace} = require('./engine/shared/atomic-file.cjs');

const assert = (condition, message) => {if (!condition) throw Error(message);};
const checkStop = stop => {if (stop()) throw Error('Backup cancelado; os arquivos parciais foram preservados.');};

async function finishResources(actions, failure) {
  for (const action of actions) {
    try {await action();}
    catch (error) {
      if (failure) (failure.cleanupErrors ||= []).push(error.message);
      else failure = error;
    }
  }
  return failure;
}

function parseEntry(bytes) {
  assert(bytes.length === 0x60, 'Registro de save incompleto.');
  return {id: bytes.readBigUInt64LE(0).toString(), space: bytes[8], type: bytes[9],
    rank: bytes[10], index: bytes.readUInt32LE(12), uid: bytes.subarray(16, 32).toString('hex'),
    title: bytes.readBigUInt64LE(0x28).toString(16).padStart(16, '0'), size: bytes.readBigUInt64LE(0x30).toString()};
}

function supported(entry) {
  return entry.space === 1 && [1, 3].includes(entry.type) && [0, 1].includes(entry.rank) &&
    Number.isInteger(entry.index) && entry.index >= 0 && entry.index <= 0xffff &&
    /^[0-9a-f]{16}$/.test(entry.title) && BigInt('0x' + entry.title) > 0n &&
    /^[0-9a-f]{32}$/.test(entry.uid) && /^\d+$/.test(entry.id);
}

async function inventory(a, stop = () => false) {
  checkStop(stop);
  const opened = await a.s.ipc('Read-only User save inventory', a.root, 61, Buffer.from([1]));
  assert(!opened.result, 'O inventário de saves não abriu: ' + opened.result);
  const handle = a.domain.oneHandle(opened);
  const entries = [];
  try {
    for (let page = 0; page < 64; page++) {
      checkStop(stop);
      const address = a.s.base + 0x8000;
      const reply = await a.s.ipc('ReadSaveDataInfo', handle, 0, Buffer.alloc(0), {receive: [{address, size: 64 * 0x60, mode: 0}]});
      assert(!reply.result && reply.data.length >= 8, 'Resposta inválida do inventário de saves.');
      const count = Number(reply.data.readBigUInt64LE());
      assert(Number.isInteger(count) && count >= 0 && count <= 64, 'Contagem inválida de saves.');
      if (!count) return entries;
      const bytes = await a.s.read(address, count * 0x60);
      assert(bytes.length === count * 0x60, 'Inventário truncado.');
      for (let i = 0; i < count; i++) entries.push(parseEntry(bytes.subarray(i * 0x60, (i + 1) * 0x60)));
      if (count < 64) return entries;
    }
    throw Error('O inventário atingiu o limite sem confirmar o final.');
  } finally {await a.s.close(handle);}
}

function localName(name) {
  assert(typeof name === 'string' && name.length > 0 && !['.', '..'].includes(name) && !/[\/\\\0\r\n]/.test(name), 'Nome de arquivo de save inválido.');
  let result = name.replace(/%/g, '%25').replace(/[<>:"|?*\x00-\x1f]/g, c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase());
  result = result.replace(/[ .]+$/, tail => [...tail].map(c => '%' + c.charCodeAt(0).toString(16).toUpperCase()).join(''));
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(result)) result = '_' + result;
  return result;
}

async function scan(a, handle, stop, visit = () => {}) {
  const files = [], directories = [], seen = new Set();
  async function walk(remote, local, depth) {
    assert(depth <= 32, 'O save excede o limite de profundidade.');
    checkStop(stop);
    visit(remote);
    const entries = await a.filesystem.listDirectory(a.s, handle, remote, 65536);
    for (const entry of entries) {
      checkStop(stop);
      const relative = path.join(local, localName(entry.name));
      const key = relative.normalize('NFC').toLowerCase();
      assert(!seen.has(key), 'Nomes do save colidem no Windows.'); seen.add(key);
      assert(seen.size <= 100000, 'O save excede o limite de entradas.');
      const full = remote === '/' ? '/' + entry.name : remote + '/' + entry.name;
      if (Number(entry.type) === 0) {directories.push(relative); await walk(full, relative, depth + 1);}
      else {
        assert(Number(entry.type) === 1, 'Tipo de entrada do save desconhecido.');
        const size = Number(entry.size);
        assert(Number.isSafeInteger(size) && size >= 0, 'Tamanho de arquivo inválido.');
        files.push({path: full, local: relative, size});
      }
    }
  }
  await walk('/', '', 0);
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  directories.sort();
  return {files, directories};
}

async function writeManifest(folder, manifest) {
  const file = path.join(folder, 'manifest.json');
  const temporary = file + '.tmp';
  await fs.writeFile(temporary, JSON.stringify(manifest, null, 2) + '\n', {mode: 0o600});
  await replace(temporary, file);
}

async function diskHash(file) {
  const hash = crypto.createHash('sha256');
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest('hex');
}

async function copyArchive(a, entry, parent, {stop = () => false, send = () => {}, name} = {}) {
  assert(supported(entry), 'Este tipo de save não é suportado nesta versão.');
  checkStop(stop);
  const {gameLabel, newDirectory} = require('./painel-names.cjs');
  const folder = await newDirectory(parent, gameLabel(name, entry.title));
  const manifest = {format: 'ns2toolkit-save-v1', complete: false, dataVerified: false,
    at: new Date().toISOString(), name: name || null, archive: entry, entries: [], directories: [],
    verification: 'Console-verified chunks, local SHA-256 and local read-back'};
  await writeManifest(folder, manifest);
  send('destination', {path: folder});
  let handle, failure;
  try {
    const input = build({space: entry.space, referenceId: BigInt('0x' + entry.title), uid: Buffer.from(entry.uid, 'hex'),
      type: entry.type, rank: entry.rank, index: entry.index});
    const opened = await a.s.ipc('Open selected save read-only', a.root, 53, input);
    assert(!opened.result, 'O save selecionado não abriu: ' + opened.result);
    handle = a.domain.oneHandle(opened);
    const plan = await scan(a, handle, stop, file => send('status', {message: 'Lendo a estrutura do save: ' + file}));
    manifest.directories = plan.directories;
    manifest.expectedFiles = plan.files.length;
    manifest.expectedBytes = plan.files.reduce((sum, file) => sum + file.size, 0);
    assert(Number.isSafeInteger(manifest.expectedBytes), 'O total de bytes excede a precisão suportada.');
    const space = await fs.statfs(folder, {bigint: true});
    assert(space.bavail * space.bsize >= BigInt(manifest.expectedBytes) + 16n * 1024n * 1024n, 'Espaço insuficiente para copiar o save.');
    await fs.mkdir(path.join(folder, '.partial'));
    for (const directory of plan.directories) await fs.mkdir(path.join(folder, 'data', directory), {recursive: true});
    await fs.mkdir(path.join(folder, 'data'), {recursive: true});
    await writeManifest(folder, manifest);
    let done = 0;
    for (const file of plan.files) {
      checkStop(stop);
      const openedFile = await a.filesystem.openFile(a.s, handle, file.path);
      assert(!openedFile.result, 'Um arquivo do save não abriu: ' + file.path);
      let local, fileFailure;
      try {
        const size = Number(await a.filesystem.fileSize(a.s, openedFile.handle));
        assert(size === file.size, 'O save mudou durante a cópia: ' + file.path);
        const partial = path.join(folder, '.partial', manifest.entries.length + '.part');
        manifest.pendingFile = {path: file.path, local: path.relative(folder, partial)};
        await writeManifest(folder, manifest);
        local = await fs.open(partial, 'wx', 0o600);
        const hash = crypto.createHash('sha256');
        for (let offset = 0; offset < size;) {
          checkStop(stop);
          const wanted = Math.min(0x40000, size - offset);
          const bytes = await a.filesystem.readFile(a.s, openedFile.handle, offset, wanted);
          assert(bytes.length > 0 && bytes.length <= wanted, 'Leitura incompleta do save: ' + file.path);
          await local.writeFile(bytes); hash.update(bytes); offset += bytes.length; done += bytes.length;
          send('transfer', {file: file.path, done, total: manifest.expectedBytes});
        }
        assert(Number(await a.filesystem.fileSize(a.s, openedFile.handle)) === size, 'O tamanho do save mudou durante a leitura.');
        await local.close(); local = null;
        const sha256 = hash.digest('hex');
        assert(await diskHash(partial) === sha256, 'A releitura no PC não confirmou o arquivo salvo.');
        const target = path.join(folder, 'data', file.local);
        await fs.mkdir(path.dirname(target), {recursive: true});
        await fs.rename(partial, target);
        manifest.entries.push({path: file.path, local: path.relative(folder, target), size, sha256});
        delete manifest.pendingFile; await writeManifest(folder, manifest);
      } catch (error) {fileFailure = error;}
      finally {
        fileFailure = await finishResources([async () => {if (local) await local.close();}, () => a.s.close(openedFile.handle)], fileFailure);
      }
      if (fileFailure) throw fileFailure;
    }
    // Recheck the listing before calling the copied snapshot complete.
    const after = await scan(a, handle, stop);
    assert(JSON.stringify(after) === JSON.stringify(plan), 'A estrutura do save mudou durante a cópia.');
    manifest.dataVerified = true;
    manifest.receivedBytes = done;
    send('files_done', {path: folder, total: done});
  } catch (error) {failure = error; manifest.error = error.message;}
  finally {
    const primary = failure;
    failure = await finishResources([async () => {if (handle !== undefined) await a.s.close(handle);}], failure);
    if (failure?.cleanupErrors) manifest.cleanupErrors = failure.cleanupErrors;
    if (failure && !primary) manifest.cleanupError = failure.message;
    await writeManifest(folder, manifest);
  }
  if (failure) {failure.backupFolder = folder; throw failure;}
  return {folder, manifest};
}

module.exports = {parseEntry, supported, inventory, localName, scan, copyArchive, writeManifest};
