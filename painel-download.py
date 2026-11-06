"""Read-only FTP transfer from OunceCake. Only local files are written."""
import ftplib
import argparse
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import shutil
import sys
import time
from urllib.parse import quote
from painel_names import game_label, new_directory


def emit(kind, **fields):
    print('PANEL:' + json.dumps(dict(kind=kind, **fields), ensure_ascii=True), flush=True)


def component(name):
    if not name or name in ('.', '..') or any(c in name for c in '/\\\r\n\x00'):
        raise ValueError('Nome de arquivo remoto inválido.')
    result = quote(name, safe='-_. ')
    if result.rstrip(' .') != result:
        result = result.rstrip(' .') + ''.join('%%%02X' % ord(c) for c in result[len(result.rstrip(' .')):])
    if result.split('.')[0].upper() in {'CON', 'PRN', 'AUX', 'NUL', *(f'COM{i}' for i in range(1, 10)), *(f'LPT{i}' for i in range(1, 10))}:
        result = '_' + result
    return result


def inventory(ftp, remote='/', local=Path('.'), depth=0, seen=None):
    if depth > 24:
        raise ValueError('Profundidade remota excedida.')
    if seen is None:
        seen = set()
    files = []
    # Finish MLSD before issuing another command on the same connection.
    for name, facts in list(ftp.mlsd(remote)):
        kind = facts.get('type')
        if kind in ('cdir', 'pdir'):
            continue
        if kind not in ('dir', 'file'):
            raise ValueError('Tipo de arquivo remoto não suportado.')
        relative = local / component(name)
        key = str(relative).casefold()
        if key in seen:
            raise ValueError('Nomes de arquivos colidem no Windows.')
        seen.add(key)
        if len(seen) > 100000:
            raise ValueError('Limite de arquivos excedido.')
        child = remote.rstrip('/') + '/' + name
        if kind == 'dir':
            files.extend(inventory(ftp, child, relative, depth + 1, seen))
        else:
            size = int(facts['size'])
            if size < 0:
                raise ValueError('Tamanho remoto inválido.')
            files.append(dict(remote=child, local=str(relative), size=size))
    return files


def save_manifest(root, manifest):
    temporary = root / 'manifest.json.pending'
    temporary.write_text(json.dumps(manifest, indent=2, ensure_ascii=True), encoding='utf-8')
    for attempt in range(11):
        try:
            os.replace(temporary, root / 'manifest.json')
            return
        except PermissionError:
            if attempt == 10:
                raise
            time.sleep(.01 * (attempt + 1))


def download(host, destination, title, port=2121, name=None):
    ipaddress.IPv4Address(host)
    if len(title) != 16 or any(c not in '0123456789abcdefABCDEF' for c in title):
        raise ValueError('Identificador inválido.')
    parent = Path(destination).resolve()
    parent.mkdir(parents=True, exist_ok=True)
    root = new_directory(parent, game_label(name, title))
    manifest = dict(complete=False, title=title, name=name, host=host, files=[], verification='FTP size and local SHA-256; no remote hash')
    save_manifest(root, manifest)
    emit('destination', path=str(root))
    ftp = ftplib.FTP(timeout=60)
    transferred = 0
    try:
        ftp.connect(host, port)
        ftp.login()
        ftp.voidcmd('TYPE I')
        files = inventory(ftp)
        if not files:
            raise ValueError('Nenhum arquivo foi anunciado pelo servidor.')
        total = sum(item['size'] for item in files)
        if shutil.disk_usage(root).free < total + 64 * 1024 * 1024:
            raise ValueError('Espaço insuficiente no destino do backup.')
        manifest['expected_bytes'] = total
        manifest['expected_files'] = len(files)
        save_manifest(root, manifest)
        for item in files:
            target = root / item['local']
            if not target.resolve().is_relative_to(root):
                raise ValueError('Caminho local inválido.')
            target.parent.mkdir(parents=True, exist_ok=True)
            partial = target.with_name(target.name + '.part')
            digest = hashlib.sha256()
            received = 0
            updated = 0
            with partial.open('xb') as stream:
                def chunk(data):
                    nonlocal received, transferred, updated
                    stream.write(data)
                    digest.update(data)
                    received += len(data)
                    transferred += len(data)
                    if time.monotonic() - updated >= 1:
                        emit('transfer', file=item['local'], done=transferred, total=total)
                        updated = time.monotonic()
                ftp.retrbinary('RETR ' + item['remote'], chunk, blocksize=256 * 1024)
            if received != item['size']:
                raise ValueError('Transferência incompleta: ' + item['local'])
            ftp.voidcmd('TYPE I')
            if ftp.size(item['remote']) != received:
                raise ValueError('O tamanho remoto mudou durante a transferência.')
            os.rename(partial, target)
            manifest['files'].append(dict(path=item['local'], remote=item['remote'], bytes=received, sha256=digest.hexdigest()))
            save_manifest(root, manifest)
            emit('transfer', file=item['local'], done=transferred, total=total)
        manifest['complete'] = True
        manifest['received_bytes'] = transferred
        save_manifest(root, manifest)
        emit('files_done', path=str(root), total=transferred)
        return root
    except BaseException as error:
        manifest['error'] = str(error)
        save_manifest(root, manifest)
        raise
    finally:
        try:
            ftp.quit()
        except (OSError, EOFError, ftplib.Error):
            ftp.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('host')
    parser.add_argument('destination')
    parser.add_argument('title')
    parser.add_argument('--name')
    args = parser.parse_args()
    try:
        download(args.host, args.destination, args.title, name=args.name)
    except Exception as error:
        emit('error', message=str(error))
        sys.exit(1)
