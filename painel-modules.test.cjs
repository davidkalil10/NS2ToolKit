const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const reader = require('./painel-save-reader.cjs');
const {Progress, failureDetails, closeAttachment} = require('./painel-progress.cjs');
const {requireHeldSession, lockSession, invalidateSession} = require('./painel-session.cjs');

function record() {
  const bytes = Buffer.alloc(0x60);
  bytes.writeBigUInt64LE(123n); bytes[8] = 1; bytes[9] = 1;
  Buffer.from('0123456789abcdef1032547698badcfe', 'hex').copy(bytes, 16);
  bytes.writeBigUInt64LE(0x0100000000000000n, 0x28);
  bytes.writeBigUInt64LE(4096n, 0x30);
  return bytes;
}

function fakeAttachment(content = {'/state.bin': Buffer.from('save data'), '/folder/config': Buffer.from('nested')}) {
  const files = new Map(Object.entries(content));
  let serial = 20;
  const opened = new Map();
  const commands = [];
  const s = {
    base: 0x100000, handles: new Set(), threads: new Set(),
    async ipc(label, handle, command, input) {
      commands.push({label, command, input: Buffer.from(input)});
      if (command === 61) {s.handles.add(10); return {result: 0, moves: [10]};}
      if (handle === 10 && command === 0) {const data = Buffer.alloc(8); data.writeBigUInt64LE(1n); return {result: 0, data};}
      if (command === 53) {s.handles.add(11); return {result: 0, moves: [11]};}
      throw Error('Unexpected IPC; writes are forbidden in this fixture: ' + command);
    },
    async read(address, length) {return record().subarray(0, length);},
    async close(handle) {assert.ok(s.handles.delete(handle), 'close owned handle'); opened.delete(handle);}
  };
  const filesystem = {
    async listDirectory(unused, handle, directory) {
      const prefix = directory === '/' ? '/' : directory + '/';
      const entries = new Map();
      if (directory === '/') entries.set('empty', {name: 'empty', type: 0, size: '0'});
      for (const [filename, bytes] of files) {
        if (!filename.startsWith(prefix)) continue;
        const relative = filename.slice(prefix.length), slash = relative.indexOf('/');
        const name = slash < 0 ? relative : relative.slice(0, slash);
        entries.set(name, {name, type: slash < 0 ? 1 : 0, size: slash < 0 ? String(bytes.length) : '0'});
      }
      return [...entries.values()];
    },
    async openFile(unused, handle, filename) {const id = serial++; opened.set(id, filename); s.handles.add(id); return {result: 0, handle: id};},
    async fileSize(unused, handle) {return BigInt(files.get(opened.get(handle)).length);},
    async readFile(unused, handle, offset, size) {return files.get(opened.get(handle)).subarray(offset, offset + size);}
  };
  return {s, root: 9, commands, files, filesystem, domain: {oneHandle(reply) {assert.equal(reply.moves.length, 1); return reply.moves[0];}},
    async close() {for (const handle of [...s.handles]) await s.close(handle); s.base = 0;}};
}

async function temporary(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ns2-saves-test-'));
  t.after(() => fs.rm(root, {recursive: true, force: true})); return root;
}

test('save inventory preserves raw UID and refuses malformed record counts', async () => {
  const a = fakeAttachment();
  const entries = await reader.inventory(a);
  assert.equal(entries[0].uid, '0123456789abcdef1032547698badcfe');
  assert.equal(entries[0].id, '123'); assert.equal(entries[0].title, '0100000000000000');
  assert.ok(reader.supported(entries[0])); assert.equal(a.s.handles.size, 0);
  const b = fakeAttachment(), ipc = b.s.ipc;
  b.s.ipc = async (...args) => {const reply = await ipc(...args); if (args[1] === 10) reply.data.writeBigUInt64LE(65n); return reply;};
  await assert.rejects(reader.inventory(b), /Contagem inválida/);
  assert.equal(b.s.handles.size, 0);
});

test('read-only save copy preserves files, empty directories, identity and hashes without declaring cleanup complete', async t => {
  const root = await temporary(t), a = fakeAttachment();
  const before = [...a.files].map(([name, bytes]) => [name, Buffer.from(bytes)]);
  const result = await reader.copyArchive(a, reader.parseEntry(record()), root);
  assert.equal(result.manifest.complete, false);
  assert.equal(result.manifest.dataVerified, true);
  assert.equal(result.manifest.entries.length, 2);
  assert.equal(a.s.handles.size, 0);
  assert.deepEqual(a.commands.map(c => c.command), [53]);
  assert.equal(a.commands[0].input[0], 1);
  assert.equal(a.commands[0].input.subarray(16, 32).toString('hex'), reader.parseEntry(record()).uid);
  for (const file of result.manifest.entries) {
    const bytes = await fs.readFile(path.join(result.folder, file.local));
    assert.deepEqual(bytes, a.files.get(file.path));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), file.sha256);
  }
  assert.ok((await fs.stat(path.join(result.folder, 'data/empty'))).isDirectory());
  assert.deepEqual([...a.files], before);
  const another = await reader.copyArchive(a, reader.parseEntry(record()), root);
  assert.notEqual(another.folder, result.folder);
});

test('a short save read leaves an incomplete manifest and closes owned handles', async t => {
  const root = await temporary(t), a = fakeAttachment();
  a.filesystem.readFile = async () => Buffer.alloc(0);
  await assert.rejects(reader.copyArchive(a, reader.parseEntry(record()), root), /Leitura incompleta/);
  const folder = path.join(root, (await fs.readdir(root))[0]);
  const manifest = JSON.parse(await fs.readFile(path.join(folder, 'manifest.json')));
  assert.equal(manifest.complete, false); assert.equal(manifest.dataVerified, false);
  assert.ok(manifest.pendingFile);
  assert.equal(a.s.handles.size, 0);
});

test('save cancellation preserves partial bytes and never reports a verified copy', async t => {
  const root = await temporary(t), a = fakeAttachment({'/large.bin': Buffer.alloc(0x50000, 7)});
  let cancelled = false;
  await assert.rejects(reader.copyArchive(a, reader.parseEntry(record()), root, {
    stop: () => cancelled, send(kind) {if (kind === 'transfer') cancelled = true;}
  }), /cancelado/);
  const folder = path.join(root, (await fs.readdir(root))[0]);
  const manifest = JSON.parse(await fs.readFile(path.join(folder, 'manifest.json')));
  assert.equal(manifest.complete, false); assert.equal(manifest.dataVerified, false);
  assert.equal((await fs.stat(path.join(folder, manifest.pendingFile.local))).size, 0x40000);
  assert.equal(a.s.handles.size, 0);
});

test('Windows save names are encoded without traversal or case collisions', async t => {
  const root = await temporary(t), a = fakeAttachment({'/CON': Buffer.from('x'), '/a:b': Buffer.from('y')});
  const result = await reader.copyArchive(a, reader.parseEntry(record()), root);
  assert.ok(result.manifest.entries.some(file => file.local.includes('_CON')));
  assert.ok(result.manifest.entries.some(file => file.local.includes('a%3Ab')));
  for (const name of ['..', '../escape', '\\escape', '/root', 'bad\0name']) assert.throws(() => reader.localName(name));
  const b = fakeAttachment({'/A': Buffer.from('a'), '/a': Buffer.from('b')});
  await assert.rejects(reader.copyArchive(b, reader.parseEntry(record()), root), /colidem/);
  assert.equal(b.s.handles.size, 0);
});

test('save backup becomes complete only after attachment cleanup; inventory ID is selected rather than guessing users', async t => {
  const root = await temporary(t), run = path.join(root, 'run'); await fs.mkdir(run);
  await fs.writeFile(path.join(run, 'result.json'), JSON.stringify({verified: true, rpc: {state: 'listening'}}));
  const {main} = require('./painel-saves.cjs');
  const events = [];
  await main([run, 'backup', path.join(root, 'backups'), '123'], {attach: async () => fakeAttachment(), send: (kind, value) => events.push({kind, ...value})});
  assert.equal(events.at(-1).kind, 'complete');
  const folder = events.find(e => e.kind === 'destination').path;
  const manifest = JSON.parse(await fs.readFile(path.join(folder, 'manifest.json')));
  assert.equal(manifest.complete, true); assert.equal(manifest.cleanupConfirmed, true);
  assert.equal(manifest.archive.id, '123');
  assert.equal((await fs.readdir(run)).includes('painel-operation.lock'), false);
});

test('session lock prevents overlapping modules and invalid sessions are refused', async t => {
  const run = await temporary(t);
  await fs.writeFile(path.join(run, 'result.json'), JSON.stringify({verified: true, rpc: {state: 'listening'}}));
  assert.equal(await requireHeldSession(run), run);
  const release = await lockSession(run, 'games');
  await assert.rejects(lockSession(run, 'saves'), /Outra operação/);
  await release(); const again = await lockSession(run, 'saves'); await again();
  await invalidateSession(run, 'uncertain response');
  await assert.rejects(requireHeldSession(run), /sessão nova/);
});

test('save cleanup failure never publishes complete and prevents reuse of the session', async t => {
  const root = await temporary(t), run = path.join(root, 'run'); await fs.mkdir(run);
  await fs.writeFile(path.join(run, 'result.json'), JSON.stringify({verified: true, rpc: {state: 'listening'}}));
  const {main} = require('./painel-saves.cjs'), a = fakeAttachment(), events = [];
  a.close = async () => {}; // A deferred cleanup leaves the owned allocation live.
  const previousExit = process.exitCode;
  try {
    await main([run, 'backup', path.join(root, 'backups'), '123'], {attach: async () => a, send: (kind, value) => events.push({kind, ...value})});
    assert.equal(process.exitCode, 1);
  } finally {process.exitCode = previousExit;}
  assert.equal(events.at(-1).kind, 'error');
  assert.equal(events.some(e => e.kind === 'complete'), false);
  const manifest = JSON.parse(await fs.readFile(path.join(events.find(e => e.kind === 'destination').path, 'manifest.json')));
  assert.equal(manifest.complete, false); assert.equal(manifest.dataVerified, true);
  await assert.rejects(requireHeldSession(run), /sessão nova/);
  assert.equal((await fs.readdir(run)).includes('painel-operation.lock'), false);
});

test('a failed save read stays the primary error even if closing the file also fails', async t => {
  const root = await temporary(t), a = fakeAttachment(), close = a.s.close;
  a.filesystem.readFile = async () => {throw Error('first read failed');};
  a.s.close = async handle => {if (handle >= 20) throw Error('later close failed'); return close(handle);};
  await assert.rejects(reader.copyArchive(a, reader.parseEntry(record()), root), error => {
    assert.equal(error.message, 'first read failed');
    assert.ok(error.cleanupErrors.includes('later close failed')); return true;
  });
  const folder = path.join(root, (await fs.readdir(root))[0]);
  const manifest = JSON.parse(await fs.readFile(path.join(folder, 'manifest.json')));
  assert.equal(manifest.error, 'first read failed'); assert.equal(manifest.complete, false);
});

test('diagnostics preserve preparation phase, distinguish content refusal and detect deferred cleanup', async () => {
  const events = [], progress = new Progress((kind, value) => events.push({kind, ...value}));
  const original = console.log;
  progress.begin('prepare', 'Preparing');
  await assert.rejects(progress.openings(async () => {console.log('Opening /updates/1/program/1/romfs'); throw Error('Console response timed out');}), /timed out/);
  assert.equal(console.log, original);
  const failure = failureDetails(Error('Console response timed out'), progress.snapshot(), [Error('cleanup also failed')]);
  assert.equal(failure.phase, 'prepare'); assert.equal(failure.operation, '/updates/1/program/1/romfs');
  assert.equal(failure.category, 'response_timeout'); assert.equal(failure.cleanupConfirmed, false);
  assert.equal(failureDetails(Error('Content requires an original-content mount')).category, 'unsupported_content');
  await assert.rejects(closeAttachment({s: {base: 4096}, close: async () => {}}), /não foi confirmada/);
});
