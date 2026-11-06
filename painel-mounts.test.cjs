const test = require('node:test');
const assert = require('node:assert/strict');
const {createGameFiles, prepareGame} = require('./compat/ouncecake/mounts.cjs');
const {Progress} = require('./painel-progress.cjs');
const {tracePreparation, summarizeInventory} = require('./painel-game-diagnostics.cjs');

test('secondary update programs use the opt-in direct route; the default still composes them', async () => {
  for (const experimentalProgram1 of [false, true]) {
    const calls = [];
    const a = {root: 1, s: {base: 4096, async write() {}, async ipc() {const data = Buffer.alloc(8);data.writeBigUInt64LE(4096n);return {result: 0, data};}},
      domain: {async send(s, label) {calls.push(label);return {result: 0, handle: 2};}, oneHandle: reply => reply.handle}, filesystem: {}};
    const files = createGameFiles(a, {experimentalProgram1,
      resolve: async () => ({contentPath: '@test:/installed.nca', attributes: 0, contentType: 1, programIndex: 1, runtimeProgramId: '0400000000000000'}),
      mounts: () => ({async openUpdate() {calls.push('composed');return 2;}, async openCode(args) {calls.push(args.direct ? 'direct-code' : 'mapped-code');return 2;}}),
    });
    await files.open({title: '0100000000000000', storage: 4, update: {}, section: 'romfs'});
    await files.open({title: '0100000000000000', storage: 4, update: {}, section: 'exefs'});
    assert.deepEqual(calls, experimentalProgram1 ? ['OpenDataStorageByPath', 'direct-code'] : ['composed', 'composed']);
  }
});

function catalogFixture() {
  const title = '0100000000000000';
  const records = [
    {contentTitle: title, version: 0, storage: 2, programIndex: 0},
    {contentTitle: '0100000000000800', version: 393216, storage: 4, programIndex: 1},
    {contentTitle: '0400000000000800', version: 65536, storage: 4, programIndex: 1},
  ].map((record, index) => {
    record.metaKey = Buffer.alloc(16, index + 1);
    record.contents = [1, 3, 4].map(type => ({contentType: type, programIndex: record.programIndex,
      contentId: Buffer.alloc(16, index * 8 + type).toString('hex')}));
    return record;
  });
  const byTitle = new Map(records.map(r => [r.contentTitle, r]));
  const a = {root: 1, domain: {oneHandle: reply => reply.handle}, service: async () => 1,
    s: {async close() {}, async ipc(label, handle, command, input) {
      if (command === 5) return {result: 0, handle: 20};
      if (command === 6) return {result: 0, data: byTitle.get(input.readBigUInt64LE().toString(16).padStart(16, '0')).metaKey};
      if (command === 20) {
        const record = records.find(r => r.metaKey.equals(input.subarray(8, 24)));
        return {result: 0, data: Buffer.from(record.contents.find(c => c.contentType === input[0] && c.programIndex === input[1]).contentId, 'hex')};
      }
      throw Error('Unexpected command ' + command);
    }} };
  const files = {async open(options) {
    const record = options.base || options.update;
    return {handle: 5, kind: 'filesystem', source: {...record, ...options.content, contentPath: '@test:/installed.nca', attributes: 0,
      selection: options.update ? 'update' : 'base', runtimeProgramId: record.contentTitle}};
  }, async list() {return [];}, async close() {}};
  return {title, a, records, dependencies: {files, discoverBase: async () => records.slice(0, 1), discoverUpdates: async () => records.slice(1), discoverDlc: async () => [], discoverDataPatches: async () => []}};
}

test('compatibility omits only manuals and retains both upgrade identities even with different version numbers', async () => {
  for (const profile of ['full', 'compatibility']) {
    const {a, title, dependencies} = catalogFixture();
    const prepared = await prepareGame({attachment: a, title, tar: true, profile}, dependencies);
    assert.equal(prepared.selection.profile, profile);
    assert.equal(prepared.selection.omittedSections.length, profile === 'full' ? 0 : 3);
    assert.ok(prepared.selection.mountedSections.includes('/updates/393216/program/1/exefs'));
    assert.ok(prepared.selection.mountedSections.includes('/updates/65536/program/1/exefs'));
    assert.ok(prepared.selection.mountedSections.includes('/base/program/0/control'));
    assert.equal(prepared.selection.mountedSections.includes('/base/program/0/manual'), profile === 'full');
    assert.ok(prepared.index.length > 0);
  }
});

test('preparation tracing preserves the original error and restores the original IPC method', async () => {
  const error = Error('native failed'), events = [], progress = new Progress();
  const ipc = async () => {throw error;};
  const a = {s: {ipc}, domain: {}};
  await assert.rejects(tracePreparation(a, progress, (kind, value) => events.push({kind, ...value}), traced => traced.s.ipc('Open selected content')), e => e === error);
  assert.equal(a.s.ipc, ipc);
  assert.equal(error.nativeOperation, 'Open selected content');
  assert.equal(events.at(-1).kind, 'native_error');
});

test('inventory reports all program indices without exporting account or runtime addresses', () => {
  const {title, records} = catalogFixture();
  const summary = summarizeInventory({title, base: records.slice(0, 1), updates: records.slice(1), dlc: [], dataPatches: []});
  assert.equal(summary.updates.length, 2);
  assert.equal(summary.updates[1].contents[0].programIndex, 1);
  assert.equal('metaKey' in summary.updates[0], false);
});
