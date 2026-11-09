"""Validate and stage extracted FTP trees without changing their source files."""
import hashlib
import os
from pathlib import Path
import re
import shutil
import time
import unicodedata

SECTIONS = {'exefs', 'romfs', 'meta', 'logo', 'control', 'manual', 'legal'}


def safe_entry(path):
    info = path.lstat()
    if path.is_symlink() or getattr(info, 'st_file_attributes', 0) & 0x400:
        raise ValueError('Links e pontos de nova análise não são aceitos: ' + str(path))
    if not path.is_dir() and not path.is_file():
        raise ValueError('Tipo de entrada não suportado: ' + str(path))
    name = path.name
    if (re.search(r'[<>:"|?*\x00-\x1f]', name) or name.endswith((' ', '.')) or
            re.match(r'^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)', name, re.I)):
        raise ValueError('Nome não pode ser preservado no Windows: ' + str(path))
    return info


def folder_snapshot(root, check):
    result = {}
    def walk(folder, depth):
        check()
        if depth > 64:
            raise ValueError('Pasta de origem excede o limite de profundidade.')
        for path in sorted(folder.iterdir()):
            check()
            info = safe_entry(path)
            relative = path.relative_to(root).as_posix()
            result[relative] = ('directory',) if path.is_dir() else ('file', info.st_size, info.st_mtime_ns)
            if len(result) > 200000:
                raise ValueError('Pasta de origem excede o limite de entradas.')
            if path.is_dir():
                walk(path, depth + 1)
    safe_entry(root)
    walk(root, 0)
    return result


def plan_folder(folder, *, digest, parse_id, check, emit):
    raw = Path(folder).absolute()
    if not raw.is_dir():
        raise ValueError('Escolha a pasta de origem de um jogo.')
    safe_entry(raw)
    root = raw.resolve()
    snapshot = folder_snapshot(root, check)
    items, seen, packages = [], set(), set()

    def children(folder):
        result = {}
        for path in sorted(folder.iterdir()):
            folded = unicodedata.normalize('NFC', path.name).casefold()
            if folded in result:
                raise ValueError('Nomes de origem em colisão: ' + str(path))
            result[folded] = path
        return result

    def add(path, target, package, title, section):
        folded = unicodedata.normalize('NFC', package + '/' + target).casefold()
        if folded in seen:
            raise ValueError('Entradas de origem em colisão: ' + str(path))
        seen.add(folded)
        info = safe_entry(path)
        items.append(dict(file=path, path=path.relative_to(root).as_posix(), package=package,
                          title=title, section=section, target=target, kind='directory' if path.is_dir() else 'file',
                          size=info.st_size if path.is_file() else 0, mtime=info.st_mtime_ns))

    def section_tree(path, target, package, title, section):
        check()
        add(path, target, package, title, section)
        if path.is_dir():
            for child in path.iterdir():
                section_tree(child, target + '/' + child.name, package, title, section)

    def program(folder, package, title):
        if not folder.is_dir():
            raise ValueError('Programa de origem ausente: ' + str(folder))
        programs = children(folder)
        if set(programs) != {'programa 0'} or not programs['programa 0'].is_dir():
            raise ValueError('Layout de pasta ainda não suportado: ' + str(folder) +
                             '. Selecione o jogo copiado pelo FTP (programa 0) ou o backup com manifest.json e TARs.')
        entries = children(programs['programa 0'])
        if not entries or any(name not in SECTIONS or not path.is_dir() for name, path in entries.items()):
            raise ValueError('Seções de pasta desconhecidas ou incompletas; nenhum conteúdo será descartado: ' + str(folder))
        if package in packages:
            raise ValueError('Pacote duplicado na pasta de origem: ' + package)
        packages.add(package)
        for section, path in entries.items():
            target = section if section in {'exefs', 'romfs'} else 'data/' + section
            section_tree(path, target, package, title, section)
        if not any(item['package'] == package and item['kind'] == 'file' for item in items):
            raise ValueError('Pacote sem arquivos: ' + package)
        if not package.startswith('dlc/'):
            exefs = entries.get('exefs')
            if not exefs or not (exefs / 'main').is_file() or not (exefs / 'main.npdm').is_file():
                raise ValueError('Pasta incompleta: faltam exefs/main ou main.npdm em ' + package)

    roots = children(root)
    if not roots or 'base' not in roots or any(name not in {'base', 'atualizações', 'dlc'} or not path.is_dir() for name, path in roots.items()):
        raise ValueError('Pasta de origem não reconhecida. Escolha o jogo completo copiado pelo FTP ou o backup com manifest.json e TARs.')
    base_programs = children(roots['base'])
    if set(base_programs) != {'programa 0'}:
        raise ValueError('Layout da Base não suportado. A pasta FTP deve conter Base/programa 0; backups TAR exigem manifest.json.')
    npdm = base_programs['programa 0'] / 'exefs/main.npdm'
    if not npdm.is_file() or npdm.stat().st_size > 1024 * 1024:
        raise ValueError('Pasta incompleta: main.npdm ausente ou inválido.')
    identity = parse_id(npdm.read_bytes())
    if not identity:
        raise ValueError('Não foi possível identificar o jogo pelo main.npdm.')
    title = f'{identity:016x}'
    folder_id = re.search(r'\[([0-9a-fA-F]{16})\]', root.name)
    if folder_id and folder_id[1].lower() != title:
        raise ValueError('A identidade do programa não confere com o ID da pasta.')
    program(roots['base'], 'base', title)
    if 'atualizações' in roots:
        for version, path in children(roots['atualizações']).items():
            if not re.fullmatch(r'0|[1-9][0-9]*', version) or int(version) > 0xffffffff or not path.is_dir():
                raise ValueError('Versão de atualização inválida: ' + str(path))
            program(path, 'updates/' + version, title)
    if 'dlc' in roots:
        for addon, path in children(roots['dlc']).items():
            if not re.fullmatch(r'[0-9a-f]{16}', addon) or not path.is_dir():
                raise ValueError('Identificador de DLC inválido: ' + str(path))
            versions = children(path)
            if set(versions) != {'0'} or not versions['0'].is_dir():
                raise ValueError('DLC de versão diferente de zero ainda não suportado.')
            contents = children(versions['0'])
            if set(contents) != {'base'} or not contents['base'].is_dir():
                raise ValueError('Atualizações de DLC ainda não são suportadas.')
            program(contents['base'], 'dlc/' + addon + '/0', addon)
    # Finish layout validation before hashing any large files.
    total = sum(item['size'] for item in items)
    completed, last = 0, 0
    for item in items:
        if item['kind'] != 'file':
            continue
        def progress(done):
            nonlocal last
            now = time.monotonic()
            if now - last >= .5 or completed + done == total:
                count = completed + done
                emit('status', message=f'Conferindo pasta: {count:,} / {total:,} bytes ({100 * count / total if total else 100:.1f}%)')
                last = now
        check()
        item['sha256'] = digest(item['file'], progress=progress)
        completed += item['size']
    if folder_snapshot(root, check) != snapshot:
        raise ValueError('A pasta de origem mudou durante a conferência.')
    descriptor = dict(source_kind='ftp-folder', _snapshot=snapshot,
                      scope=dict(profile='ftp-folder', verification='Files present in the supplied folder; remote completeness not assessed'))
    return root, descriptor, title, items


def prepare_folder(items, stage, *, check, emit):
    total = sum(item['size'] for item in items)
    if shutil.disk_usage(stage).free < total * 2 + 256 * 1024 * 1024:
        raise ValueError('Espaço insuficiente para preparar e gerar o pacote.')
    done, last = 0, 0
    for item in items:
        check()
        safe_entry(item['file'])
        target = stage / item['package'] / item['target']
        if not target.resolve().is_relative_to(stage.resolve()):
            raise ValueError('Preparação fora da área temporária.')
        if item['kind'] == 'directory':
            target.mkdir(parents=True, exist_ok=True)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        value, size = hashlib.sha256(), 0
        with item['file'].open('rb') as source, target.open('xb') as output:
            for block in iter(lambda: source.read(1024 * 1024), b''):
                check()
                output.write(block)
                value.update(block)
                size += len(block)
                done += len(block)
                now = time.monotonic()
                if now - last >= .5 or done == total:
                    emit('status', message=f'Preparando pasta: {done:,} / {total:,} bytes ({100 * done / total if total else 100:.1f}%)')
                    last = now
        if size != item['size'] or value.hexdigest() != item['sha256']:
            raise ValueError('Um arquivo de origem mudou durante a preparação: ' + item['path'])
