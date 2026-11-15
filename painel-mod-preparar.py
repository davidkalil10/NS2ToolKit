"""Prepare a bounded GBA/FireRed RomFS+ExeFS overlay from a NUP; no console I/O."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
sys.path[:0] = [str(ROOT / '.runtime/nup-python'), str(ROOT / 'tools/nup/tools/nup')]
from nup.read import NupReader
from nup.access import iter_children
from nup.discover import parse_npdm_program_id
from nup.format import Kind
from painel_names import game_label

TITLE = '0100554023408000'
MAX_FILE = 64 * 1024 * 1024
MAX_TOTAL = 256 * 1024 * 1024
WANTED = {'romfs/FireRed_e.gba', 'exefs/main', 'exefs/main.npdm'}

def emit(kind, **fields):
    print('PANEL:' + json.dumps(dict(kind=kind, **fields), ensure_ascii=True), flush=True)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def no_links(file):
    for part in [file, *file.parents]:
        if part.exists() or part.is_symlink():
            info = part.lstat()
            if part.is_symlink() or getattr(info, 'st_file_attributes', 0) & 0x400:
                raise ValueError('Selecione um caminho sem atalhos ou redirecionamentos: ' + str(part))

def validate_rom(rom):
    if not 0xC0 <= len(rom) <= 32 * 1024 * 1024 or len(rom) & (len(rom) - 1):
        raise ValueError('A ROM GBA deve ter tamanho válido de até 32 MiB.')
    if rom[0xB2] != 0x96 or rom[0xBE:0xC0] != b'\0\0' or (sum(rom[0xA0:0xBD]) + rom[0xBD] + 0x19) & 255:
        raise ValueError('O cabeçalho/checksum GBA não corresponde ao formato preparado para este teste.')

def read_input(source):
    files, seen, visited = {}, set(), set()
    total = 0
    with NupReader(str(source)) as reader:
        if len(reader.packages) != 1:
            raise ValueError('Esta versão aceita um único jogo base, sem atualizações ou DLC no NUP.')
        pkg = reader.packages[0]
        if pkg.kind != Kind.BASE or pkg.title_id != int(TITLE, 16):
            raise ValueError('O NUP deve usar o FireRed instalado como base: ' + TITLE)
        def walk(index, prefix='', depth=0):
            nonlocal total
            if depth > 32 or index in visited:
                raise ValueError('Árvore NUP cíclica ou profunda demais.')
            visited.add(index)
            for node in iter_children(reader, index):
                name = node.name.decode('utf-8', 'strict')
                if not name or name in ('.', '..') or re.search(r'[\\/\x00-\x1f:]', name):
                    raise ValueError('Nome inválido no NUP.')
                relative = prefix + name
                folded = relative.casefold()
                if folded in seen or len(seen) >= 10000:
                    raise ValueError('Entradas duplicadas ou excessivas no NUP.')
                seen.add(folded)
                if node.is_dir:
                    walk(node.index, relative + '/', depth + 1)
                else:
                    size = reader.files[node.index][1]
                    if size < 0 or size > MAX_FILE or total + size > MAX_TOTAL:
                        raise ValueError('NUP excede os limites desta ferramenta GBA.')
                    total += size
                    data = reader.read_file(node.index)
                    if sha(data) != reader.files[node.index][2].hex():
                        raise ValueError('Hash divergente no NUP: ' + relative)
                    if relative in WANTED:
                        files[relative] = data
        walk(pkg.root_dir)
    missing = WANTED - files.keys()
    if missing:
        raise ValueError('Arquivos necessários ausentes: ' + ', '.join(sorted(missing)))
    if parse_npdm_program_id(files['exefs/main.npdm']) != int(TITLE, 16):
        raise ValueError('O executável pertence a outro jogo base.')
    if not files['exefs/main'].startswith(b'NSO0') or len(files['exefs/main']) < 0x100:
        raise ValueError('O NUP não contém main no formato NSO esperado.')
    validate_rom(files['romfs/FireRed_e.gba'])
    return files, len(seen), total

def prepare(source, destination):
    source, destination = Path(source).absolute(), Path(destination).absolute()
    no_links(source); no_links(destination)
    if not source.is_file() or source.suffix.lower() != '.nup':
        raise ValueError('Selecione o arquivo .nup gerado pela ferramenta GBA.')
    if source.stat().st_size > 512 * 1024 * 1024:
        raise ValueError('O arquivo NUP excede o limite de 512 MiB desta ferramenta GBA.')
    emit('status', message='Conferindo os arquivos e hashes do NUP...')
    before = source.stat()
    files, entries, total = read_input(source)
    after = source.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise ValueError('O NUP mudou durante a leitura.')
    label = re.sub(r'\s*\[' + TITLE + r'\]\s*$', '', source.stem, flags=re.I)
    destination.mkdir(parents=True, exist_ok=True)
    folder = Path(tempfile.mkdtemp(prefix=game_label(label, TITLE)[:100] + '-', dir=destination))
    rows = []
    for relative in ['romfs/FireRed_e.gba', 'exefs/main']:
        target = folder / 'sd-card-root/ns2jb-modloader/contents' / TITLE / PurePosixPath(relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(files[relative])
        rows.append(dict(path=relative, bytes=len(files[relative]), sha256=sha(files[relative])))
    report = dict(format='ns2toolkit-gba-mod-v1', name=label, titleId=TITLE,
                  source=str(source), inputFilesVerified=True, inputEntries=entries,
                  inputUncompressedBytes=total, files=rows, ready=False,
                  installed=False, scope='RomFS/FireRed_e.gba + ExeFS/main; HOME e saves não são alterados na preparação',
                  notes=['Nome/capa no HOME permanecem FireRed.',
                         'O jogo modificado usa o destino de save do FireRed; use um perfil de teste.',
                         'Ativação temporária até reiniciar; não reinstala o jogo.'])
    (folder / 'mod.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    return folder

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source'); parser.add_argument('destination')
    args = parser.parse_args()
    try:
        folder = prepare(args.source, args.destination)
        emit('prepared_input', path=str(folder))
    except Exception as error:
        emit('error', summary=str(error), requiresRestart=False)
        sys.exit(1)
