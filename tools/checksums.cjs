// Hash the staged Git blobs, including normalized line endings. Submodules are
// pinned separately by their Git commit and are intentionally not expanded.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const git = args => execFileSync('git', args, {cwd: root, windowsHide: true, maxBuffer: 64 * 1024 * 1024});
const entries = git(['ls-files', '--stage', '-z']).toString('utf8').split('\0').filter(Boolean)
  .map(line => {const [header, ...parts] = line.split('\t'); return {mode: header.split(' ')[0], blob: header.split(' ')[1], name: parts.join('\t')};})
  .filter(entry => entry.mode !== '160000' && entry.name !== 'SHA256SUMS')
  .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
if (!entries.length) throw Error('Stage the checkpoint files before generating hashes.');
const expected = entries.map(entry => crypto.createHash('sha256').update(git(['cat-file', 'blob', entry.blob])).digest('hex') + '  ' + entry.name).join('\n') + '\n';
const file = path.join(root, 'SHA256SUMS');
if (process.argv.includes('--check')) {
  if (fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== expected) throw Error('SHA256SUMS does not match the staged checkpoint.');
  console.log('SHA256SUMS: ' + entries.length + ' staged files verified.');
} else {
  fs.writeFileSync(file, expected);
  console.log('SHA256SUMS: ' + entries.length + ' staged files recorded.');
}
