"""Exercise friendly FTP views over simulated console storage, with real FTP."""
import ftplib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parent
node = sys.argv[1] if len(sys.argv) > 1 else 'node'
with tempfile.TemporaryDirectory(prefix='ftp-virtual-') as staging:
    process = subprocess.Popen(
        [node, str(root / 'test-ftp-virtual-fixture.cjs'), staging],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding='utf-8')
    try:
        info = json.loads(process.stdout.readline())
        with ftplib.FTP() as ftp:
            ftp.connect('127.0.0.1', info['port'], timeout=15)
            ftp.login()
            assert set(ftp.nlst()) == {'SD', 'Interno', 'Jogos', 'Saves'}
            assert info['label'] in ftp.nlst('/Jogos')
            game = '/Jogos/' + info['label']
            ftp.cwd(game)
            assert set(ftp.nlst()) == {'Base', 'Atualizações'}
            path = game + '/Atualizações/65536/programa 0/romfs/folder/game.bin'
            ftp.voidcmd('TYPE I')
            assert ftp.size(path) == len(b'ROM contents')
            output = io.BytesIO()
            ftp.retrbinary('RETR ' + path, output.write, rest=4)
            assert output.getvalue() == b'contents'
            archive_root = '/Saves/' + info['label']
            archives = ftp.nlst(archive_root)
            assert len(archives) == len(set(archives)) == 3
            ftp.cwd(archive_root + '/' + archives[1])
            assert ftp.nlst() == ['FireRed_e.sav']
            output = io.BytesIO()
            ftp.retrbinary('RETR FireRed_e.sav', output.write)
            assert output.getvalue() == b'save editado'
            for target in [game + '/new', archive_root + '/new']:
                try:
                    ftp.mkd(target)
                except ftplib.error_perm:
                    pass
                else:
                    raise AssertionError('Virtual mkdir unexpectedly allowed')
                try:
                    ftp.storbinary('STOR ' + target, io.BytesIO(b'forbidden'))
                except ftplib.error_perm:
                    pass
                else:
                    raise AssertionError('Virtual upload unexpectedly allowed')
            ftp.cwd('/')
            assert set(ftp.nlst()) == {'SD', 'Interno', 'Jogos', 'Saves'}
        print('FTP virtual: UTF-8, nomes, arquivos de saves, RomFS, retomada e recusa de escrita passaram. Sem console.')
    finally:
        process.stdin.write('stop\n')
        process.stdin.flush()
        output, errors = process.communicate(timeout=15)
        assert process.returncode == 0, (output, errors)
        assert not errors, errors
