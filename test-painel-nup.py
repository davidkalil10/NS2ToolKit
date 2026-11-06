import hashlib
import importlib.util
import io
import json
from pathlib import Path
import struct
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('builder', Path(__file__).with_name('painel-nup.py'))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.backup = self.root / 'backup'
        self.backup.mkdir()
        self.files = []
        self.silent = patch.object(builder, 'emit')
        self.silent.start()
        self.addCleanup(self.silent.stop)

    def archive(self, path, entries):
        target = self.backup / Path(*path.split('/'))
        target.parent.mkdir(parents=True, exist_ok=True)
        with tarfile.open(target, 'w:') as archive:
            for name, data, kind in entries:
                member = tarfile.TarInfo(name)
                member.type = kind
                if kind == tarfile.REGTYPE:
                    member.size = len(data)
                    archive.addfile(member, io.BytesIO(data))
                else:
                    member.linkname = data.decode()
                    archive.addfile(member)
        self.files.append(dict(path=path, bytes=target.stat().st_size, sha256=builder.digest(target)))
        return target

    def manifest(self, complete=True):
        (self.backup / 'manifest.json').write_text(json.dumps(dict(complete=complete, title='0100000000000000', files=self.files)), encoding='utf-8')

    def fixture(self):
        npdm = bytearray(64)
        npdm[:4] = b'ACI0'
        struct.pack_into('<Q', npdm, 16, 0x0100000000000000)
        for prefix in ['base', 'updates/65536']:
            self.archive(prefix + '/program/0/exefs.tar', [('exefs/main.npdm', bytes(npdm), tarfile.REGTYPE), ('exefs/main', b'fake executable for tests', tarfile.REGTYPE)])
            self.archive(prefix + '/program/0/romfs.tar', [('romfs/data.bin', b'own synthetic content', tarfile.REGTYPE), ('romfs/empty', b'', tarfile.DIRTYPE)])
        self.archive('base/program/0/legal.tar', [('legal/notice.txt', b'test notice', tarfile.REGTYPE)])
        self.manifest()

    def test_base_and_update_pack_deep_verify_and_match_source_trees(self):
        self.fixture()
        before = {item['path']: builder.digest(self.backup / item['path']) for item in self.files}
        report = builder.generate(self.backup, self.root / 'outputs')
        self.assertTrue(report['complete'])
        self.assertTrue(report['deep_verified'])
        self.assertTrue(report['source_trees_matched'])
        self.assertEqual([p['kind'] for p in report['packages']], ['base', 'update'])
        self.assertEqual(report['packages'][1]['version'], 65536)
        self.assertEqual(report['sha256'], builder.digest(report['output']))
        after = {item['path']: builder.digest(self.backup / item['path']) for item in self.files}
        self.assertEqual(before, after)
        second = builder.generate(self.backup, self.root / 'outputs')
        self.assertNotEqual(report['output'], second['output'])

    def test_incomplete_backup_is_refused_before_output(self):
        self.fixture()
        self.manifest(False)
        with self.assertRaisesRegex(ValueError, 'não está completo'):
            builder.generate(self.backup, self.root / 'outputs')
        self.assertFalse((self.root / 'outputs').exists())

    def test_cancel_during_pack_preserves_sources_and_incomplete_report(self):
        self.fixture()
        original = builder.pack
        def cancelled_pack(*args, **kwargs):
            builder.cancel_requested.set()
            return original(*args, **kwargs)
        try:
            with patch.object(builder, 'pack', cancelled_pack):
                with self.assertRaises(InterruptedError):
                    builder.generate(self.backup, self.root / 'outputs')
        finally:
            builder.cancel_requested.clear()
        reports = list((self.root / 'outputs').glob('*/build-report.json'))
        self.assertEqual(len(reports), 1)
        self.assertFalse(json.loads(reports[0].read_text())['complete'])
        self.assertFalse(list((self.root / 'outputs').glob('**/*.nup')))
        self.assertFalse(list((self.root / 'outputs').glob('.nup-work-*')))
        for item in self.files:
            self.assertEqual(builder.digest(self.backup / item['path']), item['sha256'])

    def test_changed_input_is_refused(self):
        self.fixture()
        target = self.backup / self.files[0]['path']
        data = bytearray(target.read_bytes())
        data[-1] ^= 1
        target.write_bytes(data)
        with self.assertRaisesRegex(ValueError, 'Hash de entrada'):
            builder.generate(self.backup, self.root / 'outputs')

    def test_multiple_program_layout_is_refused_rather_than_dropped(self):
        self.archive('base/program/1/romfs.tar', [('romfs/file', b'test', tarfile.REGTYPE)])
        self.manifest()
        with self.assertRaisesRegex(ValueError, 'Layout ainda não suportado'):
            builder.generate(self.backup, self.root / 'outputs')

    def test_tar_traversal_and_links_are_refused(self):
        for members in [[('../escape', b'bad', tarfile.REGTYPE)], [('romfs/link', b'../../escape', tarfile.SYMTYPE)]]:
            with self.subTest(members=members):
                self.files.clear()
                self.archive('base/program/0/romfs.tar', members)
                self.manifest()
                with self.assertRaises(ValueError):
                    builder.generate(self.backup, self.root / 'outputs')
                self.assertFalse((self.root / 'escape').exists())
                reports = list((self.root / 'outputs').glob('*/build-report.json'))
                self.assertTrue(all(not json.loads(p.read_text())['complete'] for p in reports))

    def test_invalid_title_metadata_is_omitted_instead_of_replaced_with_garbage(self):
        raw = bytearray(0x4000)
        raw[0] = 0xff
        self.assertIsNone(builder.nacp_name(bytes(raw)))
        name = 'Synthetic title'.encode()
        raw[0x300:0x300 + len(name)] = name
        self.assertEqual(builder.nacp_name(bytes(raw)), 'Synthetic title')

    def test_output_folder_and_nup_use_manifest_game_name_and_id(self):
        self.fixture()
        file = self.backup / 'manifest.json'
        manifest = json.loads(file.read_text())
        manifest['name'] = 'My Test Game'
        file.write_text(json.dumps(manifest))
        report = builder.generate(self.backup, self.root / 'outputs')
        result = Path(report['output'])
        self.assertEqual(result.parent.name, 'My Test Game [0100000000000000]')
        self.assertEqual(result.name, 'My Test Game [0100000000000000].nup')
        override = builder.generate(self.backup, self.root / 'outputs', name='Other Name')
        self.assertEqual(Path(override['output']).name, 'Other Name [0100000000000000].nup')


if __name__ == '__main__':
    unittest.main()
