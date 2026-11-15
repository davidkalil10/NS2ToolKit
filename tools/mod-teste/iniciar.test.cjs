'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {activate, inside} = require('./iniciar.cjs');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ns2-mod-test-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const run = path.join(root, 'switch2-fixture'); await fs.mkdir(run);
  await fs.writeFile(path.join(run, 'connection.json'), JSON.stringify({port: 12345, addresses: {session: path.basename(run)}}));
  let calls = 0;
  const dependencies = {verify: async () => {}, verifyRun: () => {}, status: async () => {}, log: () => {}, load: async args => {
    calls++;
    assert.deepEqual(args, ['--sd', '--run-dir', run, '--title', '0100554023408000']);
    await fs.writeFile(path.join(run, 'ns2jb-modloader-install.json'), JSON.stringify({status: 'ready', titleIds: ['0100554023408000']}));
  }};
  return {root, run, dependencies, calls: () => calls};
}
test('does not touch the loader when FTP owns the session', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.run, 'painel-operation.lock'), 'ftp');
  await assert.rejects(activate(f.root, f.run, f.dependencies), /Desmonte o FTP/);
  assert.equal(f.calls(), 0);
  assert.equal(await fs.readFile(path.join(f.run, 'painel-operation.lock'), 'utf8'), 'ftp');
});
test('offline session releases its reservation without invalidating a boot', async t => {
  const f = await fixture(t); f.dependencies.status = async () => {throw Error('offline');};
  await assert.rejects(activate(f.root, f.run, f.dependencies), /offline/);
  assert.equal(f.calls(), 0);
  for (const name of ['painel-operation.lock', 'painel-session-invalid.json']) await assert.rejects(fs.access(path.join(f.run, name)), {code: 'ENOENT'});
});
test('READY retains reservation, preventing accidental GUI operations and repeat install', async t => {
  const f = await fixture(t);
  assert.equal((await activate(f.root, f.run, f.dependencies)).status, 'ready');
  await fs.access(path.join(f.run, 'painel-operation.lock'));
  await assert.rejects(activate(f.root, f.run, f.dependencies), /já recebeu o loader/);
  assert.equal(f.calls(), 1);
});
test('native error preserves reservation and invalidates the session without retry', async t => {
  const f = await fixture(t); let calls = 0;
  f.dependencies.load = async () => {calls++; throw Error('native pending');};
  await assert.rejects(activate(f.root, f.run, f.dependencies), /native pending/);
  await fs.access(path.join(f.run, 'painel-operation.lock'));
  assert.match(await fs.readFile(path.join(f.run, 'painel-session-invalid.json'), 'utf8'), /native pending/);
  assert.equal(calls, 1);
});
test('successful return without READY is not presented as success', async t => {
  const f = await fixture(t);
  f.dependencies.load = async () => {await fs.writeFile(path.join(f.run, 'ns2jb-modloader-install.json'), JSON.stringify({status: 'installed-rpc-held'}));};
  await assert.rejects(activate(f.root, f.run, f.dependencies), /não confirmou READY/);
  await fs.access(path.join(f.run, 'painel-session-invalid.json'));
});
test('manifest paths cannot escape the package', () => {
  for (const name of ['../outside', 'loader/../../file', 'loader\\file', '/outside', 'loader//file']) assert.throws(() => inside(process.cwd(), name));
});
