#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {packageNso} = require('../engine/build-payload.cjs');

const root = __dirname;
const devkitA64Gcc = process.env.DEVKITA64
  ? path.join(process.env.DEVKITA64, 'bin/aarch64-none-elf-gcc.exe')
  : 'C:\\devkitPro\\devkitA64\\bin\\aarch64-none-elf-gcc.exe';
const devkitA64Objcopy = process.env.DEVKITA64
  ? path.join(process.env.DEVKITA64, 'bin/aarch64-none-elf-objcopy.exe')
  : 'C:\\devkitPro\\devkitA64\\bin\\aarch64-none-elf-objcopy.exe';

const hash = buf => crypto.createHash('sha256').update(buf).digest('hex');

function build() {
  console.log('Compilando Homebrew para Nintendo Switch 2 (AArch64)...');
  const elfFile = path.join(root, 'homebrew.elf');
  const binFile = path.join(root, 'homebrew.bin');
  const nsoFile = path.join(root, 'homebrew.nso');

  const sources = [
    'src/start.S',
    'src/svc.S',
    'src/ipc.c',
    'src/sm.c',
    'src/hid.c',
    'src/gfx.c',
    'src/main.c'
  ].map(rel => path.join(root, rel));

  for (const src of sources) {
    if (!fs.existsSync(src)) {
      throw Error('Arquivo fonte não encontrado: ' + src);
    }
  }

  // 1. Compila ELF usando devkitA64 GCC com suporte a BTI e ARMv8.5-A
  const gccArgs = [
    '-nostdlib',
    '-ffreestanding',
    '-fno-builtin',
    '-fPIC',
    '-fno-stack-protector',
    '-march=armv8.5-a',
    '-mbranch-protection=standard',
    '-O2',
    '-I', path.join(root, 'include'),
    '-T', path.join(root, 'layout.ld'),
    '-Wl,-static',
    '-Wl,--build-id=none',
    '-Wl,--no-warn-rwx-segments',
    ...sources,
    '-o', elfFile
  ];

  console.log('1/3 Compiling sources with devkitA64 GCC...');
  execFileSync(devkitA64Gcc, gccArgs, {stdio: 'inherit'});

  // Extract flat raw binary
  console.log('2/3 Generating flat binary image (.bin)...');
  execFileSync(devkitA64Objcopy, ['-O', 'binary', elfFile, binFile], {stdio: 'inherit'});
  const binBytes = fs.readFileSync(binFile);

  // Package as Horizon NSO binary
  console.log('3/3 Packaging as NSO (.nso)...');
  const elfBytes = fs.readFileSync(elfFile);
  const nsoBytes = packageNso(elfBytes);
  fs.writeFileSync(nsoFile, nsoBytes);

  console.log('\nBuild completed successfully:');
  console.log(`- ELF: ${elfFile} (${elfBytes.length} bytes, SHA256: ${hash(elfBytes).slice(0, 16)}...)`);
  console.log(`- BIN: ${binFile} (${binBytes.length} bytes, SHA256: ${hash(binBytes).slice(0, 16)}...)`);
  console.log(`- NSO: ${nsoFile} (${nsoBytes.length} bytes, SHA256: ${hash(nsoBytes).slice(0, 16)}...)`);
}

if (require.main === module) {
  try {
    build();
  } catch (err) {
    console.error('Compilation failed:', err.message);
    process.exitCode = 1;
  }
}

module.exports = {build};
