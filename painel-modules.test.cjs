const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const reader = require('./painel-save-reader.cjs');
const {Progress, failureDetails, closeAttachment} = require('./painel-progress.cjs');
const {requireHeldSession, lockSession, invalidateSession} = require('./painel-session.cjs');
const {gameLabel, newDirectory} = require('./painel-names.cjs');
const {sessionConsoleAddress} = require('./painel-session.cjs');
const {assessFailure} = require('./painel-recovery.cjs');

test('game inventory mode records all packages without preparing mounts or requiring Python', async t => {
  const run = await temporary(t), events = [], a = fakeAttachment();
  const title = '0100000000000000';
  await fs.writeFile(path.join(run, 'result.json'), JSON.stringify({verified: true, rpc: {state: 'listening'}}));
  const {main} = require('./painel-backup.cjs');
  await main([run, '192.168.18.139', run, title, 'Teste', 'inventory'], {
    attach: async () => a,
    inventory: async () => ({title, base: [{contentTitle: title, version: 0, storage: 2, contents: [{contentType: 1, programIndex: 0}]}], updates: [], dlc: [], dataPatches: []}),
    send: (kind, value) => events.push({kind, ...value}),
  });
  assert.equal(events.at(-1).kind, 'complete');
  assert.equal(events.at(-1).profile, 'inventory');
  assert.deepEqual(a.commands, []);
  const plan = (await fs.readdir(run)).find(name => name.startsWith('game-plan-'));
  assert.equal(JSON.parse(await fs.readFile(path.join(run, plan))).base[0].storage, 2);
});

test('the recovery probe checks both the RPC bridge and the retained endpoint session', async t => {
  const http = require('node:http'), net = require('node:net');
  const {verifyHeldHealth} = require('./painel-recovery.cjs');
  const run = await temporary(t), seen = [];
  await fs.mkdir(path.join(run, 'switch2'));
  await fs.writeFile(path.join(run, 'result.json'), JSON.stringify({verified: true, rpc: {state: 'listening'}}));
  let ready = true, session = path.basename(run);
  const bridge = http.createServer((request, response) => response.end(JSON.stringify({ready})));
  const memory = net.createServer(socket => socket.once('data', bytes => {
    seen.push(JSON.parse(bytes)); socket.end(JSON.stringify({session}));
  }));
  const socketPath = process.platform === 'win32' ? '\\\\.\\pipe\\ns2-recovery-test-' + crypto.randomUUID() : path.join(run, 'memory.sock');
  await new Promise(resolve => bridge.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => memory.listen(socketPath, resolve));
  try {
    await fs.writeFile(path.join(run, 'connection.json'), JSON.stringify({port: bridge.address().port}));
    await fs.writeFile(path.join(run, 'switch2/current-acquisition.json'), JSON.stringify({socketPath}));
    assert.equal(await verifyHeldHealth(run), true);
    assert.deepEqual(seen, [{command: 'root-native-info'}]);
    session = 'another-session'; await assert.rejects(verifyHeldHealth(run), /outra sessão/);
    ready = false; await assert.rejects(verifyHeldHealth(run), /não está pronta/);
  } finally {
    await new Promise(resolve => bridge.close(resolve)); await new Promise(resolve => memory.close(resolve));
  }
});

test('only a known content refusal with clean resources and a healthy endpoint is reusable', async () => {
  const refusal = Object.assign(Error('Content requires an original-content mount; standalone ES preparation does not apply'), {code: 'GAME_ORIGINAL_CONTENT_REQUIRED'});
  assert.equal((await assessFailure(refusal, [], 'run', async () => true)).requiresRestart, false);
  for (const [error, cleanup, probe] of [
    [refusal, [Error('cleanup failed')], async () => true],
    [Error('Console response timed out'), [], async () => true],
    [new AggregateError([refusal, Error('restore failed')], refusal.message), [], async () => true],
    [refusal, [], async () => {throw Error('not ready');}],
    [refusal, [], async () => false],
  ]) assert.equal((await assessFailure(error, cleanup, 'run', probe)).requiresRestart, true);
});

test('the observed CodeFS 0x408 response is recoverable through its cause, but not through message matching alone', async () => {
  const native = Object.assign(Error('Open selected game CodeFS: result 0xd7400408'), {
    nativeOperation: 'Open selected game CodeFS', nativeResult: {raw: 0xd7400408, canonical: 0x408},
  });
  const wrapped = Error('Could not prepare /updates/393216/program/1/exefs', {cause: native});
  const result = await assessFailure(wrapped, [], 'run', async () => true);
  assert.equal(result.requiresRestart, false);
  assert.equal(result.category, 'content_not_found');
  assert.equal((await assessFailure(Error(native.message), [], 'run', async () => true)).requiresRestart, true);
  assert.equal((await assessFailure(wrapped, [Error('cleanup failed')], 'run', async () => true)).requiresRestart, true);
  assert.equal((await assessFailure(wrapped, [], 'run', async () => false)).requiresRestart, true);
  const unknown = Object.assign(Error('unknown result'), {nativeOperation: native.nativeOperation, nativeResult: {raw: 0x1234, canonical: 0x1234}});
  assert.equal((await assessFailure(unknown, [], 'run', async () => true)).requiresRestart, true);
});

test('an unsupported game does not block a subsequent operation after verified cleanup', async t => {
  const run = await temporary(t);
  await fs.writeFile(path.join(run, 'result.json'), JSON.stringify({verified: true, rpc: {state: 'listening'}}));
  const {main} = require('./painel-backup.cjs'), events = [];
  const previousExit = process.exitCode, python = process.env.NS2_PANEL_PYTHON;
  process.env.NS2_PANEL_PYTHON = process.execPath;
  try {
    const codefs = Object.assign(Error('Open selected game CodeFS: result 0xd7400408'), {
      nativeOperation: 'Open selected game CodeFS', nativeResult: {raw: 0xd7400408, canonical: 0x408},
    });
    for (const failure of [
      Object.assign(Error('Content requires an original-content mount; standalone ES preparation does not apply'), {code: 'GAME_ORIGINAL_CONTENT_REQUIRED'}),
      Error('Could not prepare /updates/393216/program/1/exefs', {cause: codefs}),
    ]) {
    await main([run, '192.168.18.139', run, '0100000000000000'], {
      attach: async () => fakeAttachment(), probe: async () => true,
      prepare: async () => {throw failure;},
      send: (kind, value) => events.push({kind, ...value}),
    });
    assert.equal(events.at(-1).requiresRestart, false);
    assert.equal(events.at(-1).cleanupConfirmed, true);
    assert.equal(process.exitCode, 1); // Operation failed; the session survived.
    process.exitCode = previousExit;
    await requireHeldSession(run);
    await main([run, '192.168.18.139', run], {attach: async () => fakeAttachment(), discover: async () => [], send: (kind, value) => events.push({kind, ...value})});
    assert.equal(events.at(-1).kind, 'listed');
    assert.equal((await fs.readdir(run)).includes('painel-operation.lock'), false);
    }
  } finally {
    process.exitCode = previousExit;
    if (python === undefined) delete process.env.NS2_PANEL_PYTHON; else process.env.NS2_PANEL_PYTHON = python;
  }
});

test('friendly save directories preserve game identity and never overwrite another user backup', async t => {
  const root = await temporary(t), title = '0100000000000000';
  const label = gameLabel('Pokémon: Teste / Save', title);
  assert.equal(label, 'Pokémon - Teste - Save [0100000000000000]');
  const folders = await Promise.all([newDirectory(root, label), newDirectory(root, label)]);
  assert.equal(new Set(folders).size, 2);
  assert.ok(folders.some(folder => path.basename(folder) === label + ' (2)'));
  assert.equal(gameLabel(title, title), 'Jogo [0100000000000000]');
  assert.equal(gameLabel('CON', title), '_CON [0100000000000000]');
  const entry = reader.parseEntry(record());
  const result = await reader.copyArchive(fakeAttachment(), entry, root, {name: 'Meu jogo'});
  assert.equal(path.basename(result.folder), 'Meu jogo [0100000000000000]');
  assert.equal(result.manifest.name, 'Meu jogo');
  assert.deepEqual(result.manifest.archive, entry);
});

test('console IPv4 comes from the session peer, with legacy fallback and no PC address guessing', async t => {
  const run = await temporary(t);
  await fs.writeFile(path.join(run, 'result.json'), JSON.stringify({consoleAddress: '192.168.18.139'}));
  assert.equal(await sessionConsoleAddress(run), '192.168.18.139');
  await fs.writeFile(path.join(run, 'result.json'), JSON.stringify({consoleAddress: '::1'}));
  await fs.writeFile(path.join(run, 'connection.json'), JSON.stringify({consoleAddress: '192.168.18.140'}));
  assert.equal(await sessionConsoleAddress(run), '192.168.18.140');
  await fs.writeFile(path.join(run, 'connection.json'), JSON.stringify({port: 1234, host: '192.168.18.40'}));
  await assert.rejects(sessionConsoleAddress(run), /manualmente/);
});

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
  await fs.writeFile(path.join(run, 'painel-games.json'), JSON.stringify([{title: '0100000000000000', name: 'Jogo de teste'}]));
  const {main} = require('./painel-saves.cjs');
  const events = [];
  await main([run, 'backup', path.join(root, 'backups'), '123'], {attach: async () => fakeAttachment(), send: (kind, value) => events.push({kind, ...value})});
  assert.equal(events.at(-1).kind, 'complete');
  const folder = events.find(e => e.kind === 'destination').path;
  assert.equal(path.basename(folder), 'Jogo de teste [0100000000000000]');
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
