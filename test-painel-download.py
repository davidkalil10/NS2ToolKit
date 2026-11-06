import importlib.util
import json
from pathlib import Path
import tempfile
import socket
import socketserver
import threading
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('download', Path(__file__).with_name('painel-download.py'))
download = importlib.util.module_from_spec(spec)
spec.loader.exec_module(download)


class FakeFTP:
    short = False
    unsafe = False
    def __init__(self, **kwargs):
        self.reads = 0
    def connect(self, host, port):
        pass
    def login(self):
        pass
    def voidcmd(self, command):
        return '200 OK'
    def mlsd(self, path):
        if self.unsafe:
            return iter([('../escape', {'type': 'file', 'size': '4'})])
        if path == '/':
            return iter([('game', {'type': 'dir', 'size': '0'})])
        return iter([('romfs.tar', {'type': 'file', 'size': '4'})])
    def retrbinary(self, command, callback, **kwargs):
        self.reads += 1
        callback(b'ab')
        if not self.short:
            callback(b'cd')
        return '226 Complete'
    def size(self, path):
        return 4
    def quit(self):
        pass
    def close(self):
        pass


class DownloadTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.fake = FakeFTP()
        self.patches = [patch.object(download.ftplib, 'FTP', return_value=self.fake), patch.object(download, 'emit')]
        for item in self.patches:
            item.start()
            self.addCleanup(item.stop)

    def run_copy(self):
        return download.download('127.0.0.1', self.tmp.name, '0100000000000000')

    def test_complete_backup_records_size_and_hash_and_never_overwrites(self):
        root = self.run_copy()
        manifest = json.loads((root / 'manifest.json').read_text())
        self.assertTrue(manifest['complete'])
        self.assertEqual(manifest['received_bytes'], 4)
        self.assertEqual(manifest['files'][0]['sha256'], download.hashlib.sha256(b'abcd').hexdigest())
        self.assertEqual((root / 'game' / 'romfs.tar').read_bytes(), b'abcd')
        self.assertNotEqual(root, self.run_copy())
        self.assertEqual((root / 'game' / 'romfs.tar').read_bytes(), b'abcd')

    def test_short_transfer_stays_incomplete_and_preserves_partial_file(self):
        self.fake.short = True
        with self.assertRaisesRegex(ValueError, 'incompleta'):
            self.run_copy()
        root = next(Path(self.tmp.name).iterdir())
        self.assertFalse(json.loads((root / 'manifest.json').read_text())['complete'])
        self.assertEqual((root / 'game' / 'romfs.tar.part').read_bytes(), b'ab')
        self.assertFalse((root / 'game' / 'romfs.tar').exists())

    def test_remote_traversal_is_refused_before_downloading(self):
        self.fake.unsafe = True
        with self.assertRaisesRegex(ValueError, 'inválido'):
            self.run_copy()
        self.assertEqual(self.fake.reads, 0)

    def test_insufficient_space_does_not_start_transfer(self):
        from collections import namedtuple
        with patch.object(download.shutil, 'disk_usage', return_value=namedtuple('Space', 'total used free')(1, 1, 0)):
            with self.assertRaisesRegex(ValueError, 'insuficiente'):
                self.run_copy()
        self.assertEqual(self.fake.reads, 0)

    def test_windows_case_collision_is_refused(self):
        self.fake.mlsd = lambda path: iter([('A.tar', {'type': 'file', 'size': '1'}), ('a.tar', {'type': 'file', 'size': '1'})])
        with self.assertRaisesRegex(ValueError, 'colidem'):
            self.run_copy()

    def test_game_name_is_saved_and_directories_are_readable_without_overwrite(self):
        from painel_names import game_label
        root = download.download('127.0.0.1', self.tmp.name, '0100000000000000', name='Pokémon: Test / Demo')
        self.assertEqual(root.name, game_label('Pokémon: Test / Demo', '0100000000000000'))
        self.assertNotIn(':', root.name)
        manifest = json.loads((root / 'manifest.json').read_text())
        self.assertEqual(manifest['name'], 'Pokémon: Test / Demo')
        second = download.download('127.0.0.1', self.tmp.name, '0100000000000000', name='Pokémon: Test / Demo')
        self.assertEqual(second.name, root.name + ' (2)')


class FTPHandler(socketserver.StreamRequestHandler):
    def handle(self):
        passive = None
        def reply(text):
            self.wfile.write((text + '\r\n').encode())
            self.wfile.flush()
        reply('220 Local test server')
        try:
            while True:
                line = self.rfile.readline().decode().rstrip('\r\n')
                if not line:
                    break
                command, _, arg = line.partition(' ')
                if command in ('USER', 'PASS'):
                    reply('230 Logged in')
                elif command == 'TYPE':
                    reply('200 Type set')
                elif command == 'PASV':
                    passive = socket.socket()
                    passive.bind(('127.0.0.1', 0))
                    passive.listen(1)
                    passive.settimeout(5)
                    port = passive.getsockname()[1]
                    reply(f'227 Entering Passive Mode (127,0,0,1,{port // 256},{port % 256})')
                elif command in ('MLSD', 'RETR'):
                    reply('150 Opening data connection')
                    connection, _ = passive.accept()
                    with connection:
                        if command == 'MLSD':
                            connection.sendall(b'type=file;size=7; romfs.tar\r\n')
                        else:
                            connection.sendall(b'payload')
                    passive.close()
                    passive = None
                    reply('226 Transfer complete')
                elif command == 'SIZE':
                    reply('213 7')
                elif command == 'QUIT':
                    reply('221 Goodbye')
                    break
                else:
                    reply('502 Unsupported')
        finally:
            if passive:
                passive.close()


class RealFTPTests(unittest.TestCase):
    def test_transfer_over_real_passive_ftp_connection(self):
        with socketserver.TCPServer(('127.0.0.1', 0), FTPHandler) as server, tempfile.TemporaryDirectory() as root:
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                with patch.object(download, 'emit'):
                    target = download.download('127.0.0.1', root, '0100000000000000', port=server.server_address[1])
                self.assertEqual((target / 'romfs.tar').read_bytes(), b'payload')
                manifest = json.loads((target / 'manifest.json').read_text())
                self.assertTrue(manifest['complete'])
                self.assertEqual(manifest['received_bytes'], 7)
            finally:
                server.shutdown()
                thread.join(timeout=5)


if __name__ == '__main__':
    unittest.main()
