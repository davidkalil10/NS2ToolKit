"""Convert verified OunceCake TAR backups into verified NUPs on the PC.

Original backups are read-only. Supports base/program/0, updates/<version>/program/0
and unpatched version-zero DLC/program/0, refusing other layouts rather than omitting them.
"""
from __future__ import annotations
import argparse
from contextlib import contextmanager
import hashlib
import io
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
emit_lock = threading.Lock()


def check_cancelled():
    if cancel_requested.is_set():
        raise InterruptedError('Geração cancelada pelo usuário.')


def panel_commands():
    for command in sys.stdin:
        if command.strip() == 'stop':
            cancel_requested.set()
            return


def emit(kind, **fields):
    with emit_lock:
        print('PANEL:' + json.dumps(dict(kind=kind, at=time.strftime('%Y-%m-%dT%H:%M:%S'), **fields), ensure_ascii=True), flush=True)


@contextmanager
def pack_activity(file):
    stopped = threading.Event()
    def watch():
        while not stopped.wait(2):
            try:
                size = file.stat().st_size
            except FileNotFoundError:
                continue
            emit('activity', message=f'Compactando NUP: {size:,} bytes gravados (tamanho final ainda desconhecido)')
    watcher = threading.Thread(target=watch, daemon=True)
    watcher.start()
    try:
        yield
    finally:
        stopped.set()
        watcher.join()


def digest(file, progress=None):
    value = hashlib.sha256()
    done = 0
    with Path(file).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            check_cancelled()
            value.update(block)
            done += len(block)
            if progress:
                progress(done)
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
        check_cancelled()
        relative = relative_path(entry['path'])
        match = re.fullmatch(r'(base|updates/[0-9]+)/program/0/(meta|romfs|exefs|logo|control|manual|legal)\.tar', relative.as_posix())
        addon = re.fullmatch(r'dlc/([0-9a-fA-F]{16})/0/base/program/0/(meta|romfs|exefs|logo|control|manual|legal)\.tar', relative.as_posix())
        if not match and not addon:
            raise ValueError('Layout ainda não suportado; nenhum conteúdo será descartado: ' + relative.as_posix()
                             + '. Aceita base, atualizações e DLC base de versão 0, sempre do programa 0. Atualizações de DLC e outros programas ainda não são suportados.')
        package = match[1] if match else f'dlc/{addon[1].lower()}/0'
        section = match[2] if match else addon[2]
        package_title = title if match else addon[1].lower()
        if relative.as_posix().lower() in paths:
            raise ValueError('Arquivo de entrada duplicado.')
        paths.add(relative.as_posix().lower())
        file = (backup / Path(*relative.parts)).resolve()
        if not file.is_relative_to(backup) or not file.is_file():
            raise ValueError('Arquivo fora do backup ou ausente.')
        expected = str(entry.get('sha256', ''))
        if not re.fullmatch(r'[0-9a-fA-F]{64}', expected) or file.stat().st_size != int(entry['bytes']):
            raise ValueError('Tamanho ou hash de entrada inválido: ' + relative.as_posix())
        items.append(dict(file=file, package=package, section=section, title=package_title, sha256=expected.lower(),
                          size=file.stat().st_size, mtime=file.stat().st_mtime_ns, path=relative.as_posix()))
    # Validate every layout before reading potentially tens of GB for hashes.
    total = sum(item['size'] for item in items)
    verified = 0
    for item in items:
        last = 0
        def progress(done):
            nonlocal last
            now = time.monotonic()
            if now - last >= .5 or done == item['size']:
                count = verified + done
                percent = 100 * count / total if total else 100
                emit('status', message=f"Conferindo entrada: {item['path']} • {count:,} / {total:,} bytes ({percent:.1f}%)")
                last = now
        check_cancelled()
        emit('status', message='Conferindo entrada: ' + item['path'])
        if digest(item['file'], progress=progress) != item['sha256']:
            raise ValueError('Hash de entrada não confere: ' + item['path'])
        verified += item['size']
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
    extracted, last = 0, 0
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
                            extracted += len(block)
                            now = time.monotonic()
                            if now - last >= .5 or extracted == total:
                                emit('status', message=f'Preparando arquivos: {extracted:,} / {total:,} bytes ({100 * extracted / total:.1f}%)')
                                last = now
                    if target.stat().st_size != member.size:
                        raise ValueError('Extração incompleta.')
        current = item['file'].stat()
        if current.st_size != item['size'] or current.st_mtime_ns != item['mtime']:
            raise ValueError('Um backup de entrada mudou durante a preparação.')


def disk_tree(folder):
    directories, files = set(), {}
    entries = list(Path(folder).rglob('*'))
    total = sum(file.stat().st_size for file in entries if file.is_file())
    completed, last = 0, 0
    for file in entries:
        check_cancelled()
        relative = file.relative_to(folder).as_posix()
        if file.is_symlink():
            raise ValueError('Link inesperado na árvore preparada.')
        if file.is_dir():
            directories.add(relative)
        else:
            size = file.stat().st_size
            def progress(done):
                nonlocal last
                now = time.monotonic()
                if now - last >= .5 or completed + done == total:
                    count = completed + done
                    emit('status', message=f'Comparando origem: {count:,} / {total:,} bytes ({100 * count / total:.1f}%)')
                    last = now
            files[relative] = (size, digest(file, progress=progress))
            completed += size
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


class ExtentReader(io.RawIOBase):
    """Expose exactly one extent to zstd without buffering the entire file."""
    def __init__(self, stream, size):
        self.stream, self.remaining = stream, size

    def readable(self):
        return True

    def readinto(self, buffer):
        check_cancelled()
        data = self.stream.read(min(len(buffer), self.remaining))
        buffer[:len(data)] = data
        self.remaining -= len(data)
        return len(data)


def verify_streamed(file):
    ok, problems = verify(str(file), deep=False)
    if not ok:
        return ok, problems
    with NupReader(str(file)) as reader, Path(file).open('rb') as source:
        total = sum(row[1] for row in reader.files)
        completed, last = 0, 0
        seen = {}
        for index, (name, size, expected, offset, extent_size, codec) in enumerate(reader.files):
            check_cancelled()
            source.seek(offset)
            extent = ExtentReader(source, extent_size)
            if codec == nup_format.CODEC_ZSTD:
                import zstandard
                stream = zstandard.ZstdDecompressor().stream_reader(extent)
            elif codec == nup_format.CODEC_RAW:
                if extent_size != size:
                    problems.append(f'file {index}: raw extent size mismatch')
                stream = io.BufferedReader(extent)
            else:
                problems.append(f'file {index}: unknown codec {codec}')
                continue
            value, count = hashlib.sha256(), 0
            try:
                with stream:
                    for block in iter(lambda: stream.read(1024 * 1024), b''):
                        check_cancelled()
                        count += len(block)
                        if count > size:
                            raise ValueError(f'file {index}: decompressed size exceeds expected size')
                        value.update(block)
                        now = time.monotonic()
                        if now - last >= .5 or completed + count == total:
                            done = completed + count
                            emit('status', message=f'Verificando NUP: {done:,} / {total:,} bytes ({100 * done / total:.1f}%)')
                            last = now
            except InterruptedError:
                raise
            except Exception as error:
                problems.append(f'file {index}: read failed: {error}')
            if count != size or value.digest() != expected or extent.remaining:
                problems.append(f'file {index}: size, extent or SHA-256 mismatch')
            key = (offset, extent_size, codec)
            if key in seen and seen[key] != expected:
                problems.append(f'file {index}: shares extent with different hash')
            seen[key] = expected
            completed += size
    return not problems, problems


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
                  source_scope=manifest.get('scope', dict(profile='legacy', omittedSections=[])),
                  nup_revision='d40d9cfa50792ba8021d2967d994d1b1c25d62b0', nup_version=nup.__version__,
                  input_files=[dict(path=item['path'], sha256=item['sha256']) for item in items])
    report_path.write_text(json.dumps(report, indent=2), encoding='utf-8')
    try:
        with tempfile.TemporaryDirectory(prefix='.nup-work-', dir=output_parent) as work:
            stage = Path(work)
            extract_inputs(items, stage)
            for package, expected_title in {(item['package'], item['title']) for item in items}:
                npdm = stage / Path(*PurePosixPath(package).parts) / 'exefs/main.npdm'
                if npdm.exists() and parse_npdm_program_id(npdm.read_bytes()) != int(expected_title, 16):
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
            with pack_activity(pending):
                packages = pack(str(pending), str(stage), base_title_id=int(title, 16), progress=progress, **metadata)
            emit('status', message='Verificando estrutura e conteúdo de todos os arquivos...')
            ok, problems = verify_streamed(pending)
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
                    emit('status', message='Comparando arquivos de origem: ' + Path(source.src).relative_to(stage).as_posix())
                    original = disk_tree(Path(source.src))
                    copied = container_tree(container, package.root_dir)
                    if original != copied:
                        raise ValueError('O pacote não preservou toda a árvore de origem.')
                    summaries.append(dict(kind=package.kind_name, title=f'{package.title_id:016X}', version=package.version,
                                          files=len(copied[1]), directories=len(copied[0])))
            final = job / (label + '.nup')
            output_size, hash_last = pending.stat().st_size, 0
            def hash_progress(done):
                nonlocal hash_last
                now = time.monotonic()
                if now - hash_last >= .5 or done == output_size:
                    emit('status', message=f'Hash do NUP final: {done:,} / {output_size:,} bytes ({100 * done / output_size:.1f}%)')
                    hash_last = now
            emit('status', message='Conferindo hash do NUP final...')
            output_hash = digest(pending, progress=hash_progress)
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
