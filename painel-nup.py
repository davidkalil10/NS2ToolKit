"""Convert verified OunceCake TAR backups into verified NUPs on the PC.

Original backups are read-only. This initial adapter supports base/program/0
and updates/<version>/program/0, refusing other layouts rather than omitting them.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import sys
import tarfile
import tempfile
import time
import threading

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / '.runtime' / 'nup-python'))
sys.path.insert(0, str(ROOT / 'tools' / 'nup' / 'tools' / 'nup'))
from nup.pack import pack
from nup.verify import verify
from nup.read import NupReader
from nup.access import iter_children
from nup.discover import parse_npdm_program_id
import nup
from painel_names import game_label, new_directory
from nup import format as nup_format
from nup.access import app_meta
from painel_nup_metadata import use_spec_metadata, control_metadata

use_spec_metadata(nup_format)

cancel_requested = threading.Event()


def check_cancelled():
    if cancel_requested.is_set():
        raise InterruptedError('Geração cancelada pelo usuário.')


def panel_commands():
    for command in sys.stdin:
        if command.strip() == 'stop':
            cancel_requested.set()
            return


def emit(kind, **fields):
    print('PANEL:' + json.dumps(dict(kind=kind, at=time.strftime('%Y-%m-%dT%H:%M:%S'), **fields), ensure_ascii=True), flush=True)


def digest(file):
    value = hashlib.sha256()
    with Path(file).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            check_cancelled()
            value.update(block)
    return value.hexdigest()


def relative_path(text):
    text = str(text).replace('\\', '/')
    path = PurePosixPath(text)
    if path.is_absolute() or not path.parts or '..' in path.parts or any(':' in p for p in path.parts):
        raise ValueError('Caminho de entrada inválido: ' + text)
    return path


def plan_inputs(backup):
    backup = Path(backup).resolve()
    manifest_path = backup / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    if manifest.get('complete') is not True or not manifest.get('files'):
        raise ValueError('O backup não está completo.')
    title = str(manifest.get('title', '')).lower()
    if not re.fullmatch(r'[0-9a-f]{16}', title):
        raise ValueError('Identificador do jogo ausente ou inválido.')
    items, paths = [], set()
    for entry in manifest['files']:
        relative = relative_path(entry['path'])
        match = re.fullmatch(r'(base|updates/[0-9]+)/program/0/(meta|romfs|exefs|logo|control|manual|legal)\.tar', relative.as_posix())
        if not match:
            raise ValueError('Layout ainda não suportado; nenhum conteúdo será descartado: ' + relative.as_posix())
        if relative.as_posix().lower() in paths:
            raise ValueError('Arquivo de entrada duplicado.')
        paths.add(relative.as_posix().lower())
        file = (backup / Path(*relative.parts)).resolve()
        if not file.is_relative_to(backup) or not file.is_file():
            raise ValueError('Arquivo fora do backup ou ausente.')
        expected = str(entry.get('sha256', ''))
        if not re.fullmatch(r'[0-9a-fA-F]{64}', expected) or file.stat().st_size != int(entry['bytes']):
            raise ValueError('Tamanho ou hash de entrada inválido: ' + relative.as_posix())
        emit('status', message='Conferindo entrada: ' + relative.as_posix())
        if digest(file) != expected.lower():
            raise ValueError('Hash de entrada não confere: ' + relative.as_posix())
        items.append(dict(file=file, package=match[1], section=match[2], sha256=expected.lower(),
                          size=file.stat().st_size, mtime=file.stat().st_mtime_ns, path=relative.as_posix()))
    return backup, manifest, title, items


def safe_members(archive, section, package, seen):
    result = []
    for member in archive.getmembers():
        if '\\' in member.name:
            raise ValueError('TAR contém separador ambíguo.')
        relative = relative_path(member.name)
        if relative.parts[0] != section or not (member.isdir() or member.isfile()):
            raise ValueError('TAR contém raiz inesperada, link ou tipo especial: ' + member.name)
        for part in relative.parts:
            if re.search(r'[<>:"|?*\x00-\x1f]', part) or part.endswith((' ', '.')) or re.match(r'^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)', part, re.I):
                raise ValueError('Nome do TAR não pode ser preservado no Windows: ' + member.name)
        local = relative if section in ('romfs', 'exefs') else PurePosixPath('data') / relative
        key = (PurePosixPath(package) / local).as_posix()
        folded = key.casefold()
        if folded in seen:
            raise ValueError('Entradas do TAR duplicadas ou em colisão no Windows: ' + key)
        seen.add(folded)
        if member.size < 0:
            raise ValueError('Tamanho negativo no TAR.')
        result.append((member, local))
    return result


def extract_inputs(items, stage):
    seen, planned = set(), []
    total = 0
    for item in items:
        check_cancelled()
        with tarfile.open(item['file'], 'r:') as archive:
            members = safe_members(archive, item['section'], item['package'], seen)
            total += sum(m.size for m, unused in members if m.isfile())
            planned.append((item, members))
    if shutil.disk_usage(stage).free < total * 2 + 256 * 1024 * 1024:
        raise ValueError('Espaço insuficiente para preparar e gerar o pacote.')
    for item, members in planned:
        emit('status', message='Preparando árvore: ' + item['path'])
        package = stage / Path(*PurePosixPath(item['package']).parts)
        with tarfile.open(item['file'], 'r:') as archive:
            for member, local in members:
                check_cancelled()
                target = package / Path(*local.parts)
                if not target.resolve().is_relative_to(stage.resolve()):
                    raise ValueError('Extração fora da área temporária.')
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    source = archive.extractfile(member)
                    if source is None:
                        raise ValueError('Arquivo TAR sem dados.')
                    with source, target.open('xb') as output:
                        for block in iter(lambda: source.read(1024 * 1024), b''):
                            check_cancelled()
                            output.write(block)
                    if target.stat().st_size != member.size:
                        raise ValueError('Extração incompleta.')
        current = item['file'].stat()
        if current.st_size != item['size'] or current.st_mtime_ns != item['mtime']:
            raise ValueError('Um backup de entrada mudou durante a preparação.')


def disk_tree(folder):
    directories, files = set(), {}
    for file in Path(folder).rglob('*'):
        check_cancelled()
        relative = file.relative_to(folder).as_posix()
        if file.is_symlink():
            raise ValueError('Link inesperado na árvore preparada.')
        if file.is_dir():
            directories.add(relative)
        else:
            files[relative] = (file.stat().st_size, digest(file))
    return directories, files


def container_tree(reader, root):
    directories, files = set(), {}
    def walk(index, prefix=''):
        for child in iter_children(reader, index):
            relative = prefix + child.name.decode('utf-8')
            if child.is_dir:
                directories.add(relative)
                walk(child.index, relative + '/')
            else:
                unused, size, sha, *rest = reader.file_info(child.index)
                files[relative] = (size, sha.hex())
    walk(root)
    return directories, files


def nacp_name(data):
    for index in range(16):
        raw = data[index * 0x300:index * 0x300 + 0x200].split(b'\0')[0]
        try:
            text = raw.decode('utf-8').strip()
        except UnicodeDecodeError:
            continue
        if len(text) >= 2 and '\ufffd' not in text and all(ord(c) >= 32 for c in text) and any(c.isalnum() for c in text):
            return text
    return None


def generate(backup, output_parent, name=None):
    backup, manifest, title, items = plan_inputs(backup)
    name = name or manifest.get('name')
    if not name:
        for item in items:
            if item['package'] == 'base' and item['section'] == 'control':
                with tarfile.open(item['file'], 'r:') as control:
                    try:
                        member = control.getmember('control/control.nacp')
                    except KeyError:
                        continue
                    if member.isfile() and member.size <= 0x10000:
                        with control.extractfile(member) as source:
                            name = nacp_name(source.read())
    label = game_label(name, title)
    output_parent = Path(output_parent).resolve()
    output_parent.mkdir(parents=True, exist_ok=True)
    job = new_directory(output_parent, label)
    report_path = job / 'build-report.json'
    report = dict(complete=False, title=title, source=str(backup), source_manifest_sha256=digest(backup / 'manifest.json'),
                  nup_revision='d40d9cfa50792ba8021d2967d994d1b1c25d62b0', nup_version=nup.__version__,
                  input_files=[dict(path=item['path'], sha256=item['sha256']) for item in items])
    report_path.write_text(json.dumps(report, indent=2), encoding='utf-8')
    try:
        with tempfile.TemporaryDirectory(prefix='.nup-work-', dir=output_parent) as work:
            stage = Path(work)
            extract_inputs(items, stage)
            for package in {item['package'] for item in items}:
                npdm = stage / Path(*PurePosixPath(package).parts) / 'exefs/main.npdm'
                if npdm.exists() and parse_npdm_program_id(npdm.read_bytes()) != int(title, 16):
                    raise ValueError('A identidade do programa não confere com o manifesto: ' + package)
            pending = job / (label + '.nup.part')
            last = 0
            def progress(done, total, unused):
                nonlocal last
                check_cancelled()
                if time.monotonic() - last > .5 or done == total:
                    emit('pack', done=done, total=total)
                    last = time.monotonic()
            emit('status', message='Gerando o pacote NUP...')
            metadata = control_metadata(stage, name)
            packages = pack(str(pending), str(stage), base_title_id=int(title, 16), progress=progress, **metadata)
            emit('status', message='Verificando estrutura e conteúdo de todos os arquivos...')
            ok, problems = verify(str(pending), deep=True)
            if not ok:
                raise ValueError('Verificação NUP falhou: ' + '; '.join(problems[:10]))
            check_cancelled()
            summaries = []
            with NupReader(str(pending)) as container:
                meta = app_meta(container, container.packages[0])
                expected_name = metadata['names'].get(None)
                if expected_name and meta.get(0x0005) != expected_name.encode('utf-8'):
                    raise ValueError('Nome do jogo não foi preservado nos metadados padrão do NUP.')
                if metadata['icons'] and meta.get(0x0003) != Path(metadata['icons'][None]).read_bytes():
                    raise ValueError('Ícone do jogo não foi preservado nos metadados padrão do NUP.')
                if len(packages) != len(container.packages):
                    raise ValueError('Contagem de pacotes divergente.')
                for source, package in zip(packages, container.packages):
                    original = disk_tree(Path(source.src))
                    copied = container_tree(container, package.root_dir)
                    if original != copied:
                        raise ValueError('O pacote não preservou toda a árvore de origem.')
                    summaries.append(dict(kind=package.kind_name, title=f'{package.title_id:016X}', version=package.version,
                                          files=len(copied[1]), directories=len(copied[0])))
            final = job / (label + '.nup')
            output_hash = digest(pending)
            check_cancelled()
            pending.rename(final)
            report.update(complete=True, output=str(final), bytes=final.stat().st_size, sha256=output_hash,
                          deep_verified=True, source_trees_matched=True, packages=summaries, name=name)
            report['metadata'] = dict(schema='SPEC-v1-TLV-1-based', title=metadata['names'].get(None),
                                      icon=bool(metadata['icons']), publisher=metadata['publisher'], display_version=metadata['display_version'])
            report_path.write_text(json.dumps(report, indent=2, ensure_ascii=True), encoding='utf-8')
            emit('complete', path=str(final), bytes=report['bytes'], packages=summaries)
            return report
    except BaseException as error:
        report['error'] = str(error)
        report_path.write_text(json.dumps(report, indent=2), encoding='utf-8')
        raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('backup')
    parser.add_argument('--out', default=str(ROOT / 'exports/nup'))
    parser.add_argument('--name', help='Nome para backups antigos sem nome no manifesto')
    parser.add_argument('--panel', action='store_true', help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.panel:
        threading.Thread(target=panel_commands, daemon=True).start()
    try:
        generate(args.backup, args.out, name=args.name)
    except (Exception, SystemExit) as error:
        emit('error', message=str(error))
        sys.exit(1)
