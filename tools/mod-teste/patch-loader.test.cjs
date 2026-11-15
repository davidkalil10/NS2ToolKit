'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const {patchSource, remoteFixture} = require('./patch-loader.cjs');
const filename = path.resolve(__dirname, '../../.runtime/ns2jb-modloader-review/lib/mods.cjs');
const options = {skip: !fs.existsSync(filename) && 'Requer o checkout privado da revisão fixada do loader.'};
function load(source, paths) {
  const upstreamRequire = createRequire(filename), module = {exports: {}};
  vm.runInNewContext(source, {module, exports: module.exports, Buffer, console,
    require: name => name === 'node:path' ? {...paths, posix: path.posix} : upstreamRequire(name)}, {filename});
  return module.exports;
}
const collection = {games: [{titleId: '0100554023408000',
  romfs: [{path: '/FireRed_e.gba',type: 'file',size: 8388608}],
  exefs: [{path: '/main',type: 'file',size: 1004667}]}]};
test('reproduces original Windows failure with a populated SD inventory', options, () => {
  const {root,io} = remoteFixture(collection);
  assert.throws(() => load(fs.readFileSync(filename,'utf8'),path.win32).collectMods(root,io), /No supported mods found/);
});
for (const [name, paths] of [['Windows',path.win32],['POSIX',path.posix]]) {
  test('patched loader retains SD paths on '+name, options, () => {
    const {root,io} = remoteFixture(collection);
    const mods = load(patchSource(fs.readFileSync(filename,'utf8')),paths).collectMods(root,io);
    assert.equal(mods.games.length,1);
    assert.equal(mods.games[0].romfs[0].sdPath,root+'/contents/0100554023408000/romfs/FireRed_e.gba');
    assert.equal(mods.games[0].exefs[0].sdPath,root+'/contents/0100554023408000/exefs/main');
  });
}
test('nested remote files retain POSIX relative names and UTF-8', options, () => {
  const nested = {games: [{...collection.games[0],romfs: [{path:'/assets',type:'directory'},{path:'/assets/ação.bin',type:'file',size:23}]}]};
  const {root,io} = remoteFixture(nested);
  const mods = load(patchSource(fs.readFileSync(filename,'utf8')),path.win32).collectMods(root,io);
  assert.equal(mods.games[0].romfs[1].path,'/assets/ação.bin');
  assert.equal(mods.games[0].romfs[1].sdPath,root+'/contents/0100554023408000/romfs/assets/ação.bin');
});
test('patch refuses unknown vendor revisions', () => {
  assert.throws(() => patchSource('unknown'),/patch não aplicado/);
});
