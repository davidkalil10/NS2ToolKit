'use strict';
// NS2ToolKit Windows compatibility patch for SebaaMG/ns2jb-modloader,
// GPL-2.0, upstream 9395c91e9f5bb6c01df242fdbf7db194cf94b3c6.
// Only remote SD paths use POSIX; local PC paths keep the native path API.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const PATCH = 'remote-posix-paths-v1';
const ORIGINAL = 'b843f72df4031c7ef9888acf669d66e5b0a9b4ac1cc33fb922222e097852d8c6';
function patchSource(input) {
  const source = input.replace(/\r\n/g, '\n');
  if (crypto.createHash('sha256').update(source).digest('hex') !== ORIGINAL) throw Error('A revisão de mods.cjs difere da fonte examinada; patch não aplicado.');
  return source.replace('function walk(root,base=root,io=fs){',
    'function walk(root,base=root,io=fs){\n // NS2ToolKit '+PATCH+'\n const paths=io.remote?path.posix:path;')
    .replace('const file=path.join(root,e.name)', 'const file=paths.join(root,e.name)')
    .replace("path.relative(base,file).split(path.sep)", "paths.relative(base,file).split(paths.sep)")
    .replace(/function collectMods\(root,io=fs\)\{[\s\S]*?(?=module.exports=)/, block =>
      block.replace('function collectMods(root,io=fs){', 'function collectMods(root,io=fs){\n const paths=io.remote?path.posix:path;')
        .replace(/path\.(resolve|join)\(/g, 'paths.$1('));
}
function applyPatch(loader) {
  const file = path.join(loader, 'lib/mods.cjs');
  fs.writeFileSync(file, patchSource(fs.readFileSync(file, 'utf8')));
}
function remoteFixture(collection) {
  const root = '/ns2jb-modloader', tree = new Map([[root, {type: 'directory', children: []}]]);
  function add(name, row) {
    if (tree.has(name)) return;
    const parent = path.posix.dirname(name);
    if (!tree.has(parent)) add(parent, {type: 'directory', children: []});
    tree.get(parent).children.push(path.posix.basename(name)); tree.set(name, row);
  }
  for (const game of collection.games) for (const section of ['romfs','exefs']) {
    const base = root+'/contents/'+game.titleId+'/'+section;
    add(base, {type: 'directory', children: []});
    for (const row of game[section]) add(base+row.path, {type: row.type, size: row.size, children: []});
  }
  const stat = name => {
    const row = tree.get(name); if (!row) throw Error('Recurso SD desconhecido: '+name);
    return {size: row.size, isSymbolicLink: () => false, isFile: () => row.type === 'file', isDirectory: () => row.type === 'directory'};
  };
  return {root, io: {remote: true, existsSync: name => tree.has(name), statSync: stat, lstatSync: stat,
    readdirSync: (name, options) => tree.get(name).children.map(child => options?.withFileTypes ? {name: child,...stat(name+'/'+child)} : child)}};
}
function verifyRemoteLayout(loader, collection) {
  const {root, io} = remoteFixture(collection);
  const remote = require(path.join(loader, 'lib/mods.cjs')).collectMods(root, io);
  const files = remote.games.flatMap(game => [...game.romfs,...game.exefs].filter(row => row.type === 'file'));
  if (files.length !== 2 || files.some(row => !row.sdPath?.startsWith(root+'/') || row.sdPath.includes('\\'))) throw Error('A compatibilidade de caminhos do SD falhou.');
  // Exercise the next preparation stage with the same remote entries.
  require(path.join(loader, 'lib/lazy-context.cjs')).plan(remote, 'offline-windows-check');
}
module.exports = {PATCH, patchSource, applyPatch, remoteFixture, verifyRemoteLayout};
if (require.main === module) {
  if (process.argv.length !== 3) throw Error('Informe a pasta local do loader a corrigir.');
  applyPatch(path.resolve(process.argv[2])); console.log('Patch aplicado: '+PATCH);
}
