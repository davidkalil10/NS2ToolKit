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

    def test_patched_dlc_at_end_is_refused_before_hashing_any_input(self):
        self.fixture()
        self.archive('dlc/0100000000001001/0/updates/65536/program/0/romfs.tar', [('romfs/dlc', b'test', tarfile.REGTYPE)])
        self.manifest()
        with patch.object(builder, 'digest', side_effect=AssertionError('must preflight before hashing')):
            with self.assertRaisesRegex(ValueError, 'Atualizações de DLC'):
                builder.generate(self.backup, self.root / 'outputs')
        self.assertFalse((self.root / 'outputs').exists())

    def test_base_update_and_two_addons_preserve_identities_and_trees(self):
        self.fixture()
        for title in ['0100000000001001', '0100000000001002']:
            self.archive(f'dlc/{title}/0/base/program/0/romfs.tar', [('romfs/own-data', title.encode(), tarfile.REGTYPE)])
            self.archive(f'dlc/{title}/0/base/program/0/meta.tar', [('meta/info', b'metadata', tarfile.REGTYPE)])
        self.manifest()
        report = builder.generate(self.backup, self.root / 'outputs')
        self.assertTrue(report['deep_verified'])
        self.assertTrue(report['source_trees_matched'])
        self.assertEqual([(p['kind'], p['title']) for p in report['packages']],
                         [('base', '0100000000000000'), ('update', '0100000000000000'),
                          ('addon', '0100000000001001'), ('addon', '0100000000001002')])
        with builder.NupReader(report['output']) as reader:
            for addon in reader.packages[2:]:
                files = builder.container_tree(reader, addon.root_dir)[1]
                self.assertIn('romfs/own-data', files)
                self.assertIn('data/meta/info', files)
                self.assertNotIn('base/program/0/romfs/own-data', files)

    def test_nonzero_dlc_versions_are_refused_without_losing_version(self):
        self.archive('dlc/0100000000001001/65536/base/program/0/romfs.tar', [('romfs/dlc', b'test', tarfile.REGTYPE)])
        self.manifest()
        with self.assertRaisesRegex(ValueError, 'Layout ainda não suportado'):
            builder.generate(self.backup, self.root / 'outputs')

    def test_addon_npdm_must_match_its_own_identity(self):
        self.fixture()
        npdm = bytearray(64)
        npdm[:4] = b'ACI0'
        struct.pack_into('<Q', npdm, 16, 0x0100000000000000)
        self.archive('dlc/0100000000001001/0/base/program/0/exefs.tar', [('exefs/main.npdm', bytes(npdm), tarfile.REGTYPE)])
        self.manifest()
        with self.assertRaisesRegex(ValueError, 'identidade do programa'):
            builder.generate(self.backup, self.root / 'outputs')
        self.assertFalse(list((self.root / 'outputs').glob('**/*.nup')))

    def test_streamed_raw_verify_and_cancellation(self):
        self.fixture()
        pack_module = __import__('importlib').import_module('nup.pack')
        with patch.object(pack_module, 'have_zstd', return_value=False):
            report = builder.generate(self.backup, self.root / 'outputs')
        self.assertEqual(builder.verify_streamed(report['output']), (True, []))
        with builder.NupReader(report['output']) as reader:
            offset = next(row[3] for row in reader.files if row[1])
        with open(report['output'], 'r+b') as stream:
            stream.seek(offset)
            original = stream.read(1)
            stream.seek(offset)
            stream.write(bytes([original[0] ^ 255]))
        self.assertFalse(builder.verify_streamed(report['output'])[0])
        try:
            builder.cancel_requested.set()
            with self.assertRaises(InterruptedError):
                builder.verify_streamed(report['output'])
        finally:
            builder.cancel_requested.clear()

    def test_streamed_verify_avoids_whole_file_reads_and_detects_corruption(self):
        self.fixture()
        self.archive('base/program/0/manual.tar', [('manual/large', b'x' * (3 * 1024 * 1024), tarfile.REGTYPE)])
        self.manifest()
        report = builder.generate(self.backup, self.root / 'outputs')
        with patch.object(builder.NupReader, 'read_file', side_effect=AssertionError('whole-file read forbidden')):
            self.assertEqual(builder.verify_streamed(report['output']), (True, []))
        with builder.NupReader(report['output']) as reader:
            offset = next(row[3] for row in reader.files if row[0] == b'large')
        with open(report['output'], 'r+b') as stream:
            stream.seek(offset)
            first = stream.read(1)
            stream.seek(offset)
            stream.write(bytes([first[0] ^ 255]))
        ok, problems = builder.verify_streamed(report['output'])
        self.assertFalse(ok)
        self.assertTrue(problems)

    def test_input_hash_progress_reports_total_bytes(self):
        self.fixture()
        builder.plan_inputs(self.backup)
        messages = [call.kwargs.get('message', '') for call in builder.emit.call_args_list]
        total = sum(item['bytes'] for item in self.files)
        self.assertTrue(any(f'{total:,} / {total:,} bytes (100.0%)' in message for message in messages))

    def test_digest_can_be_cancelled_from_progress(self):
        self.fixture()
        target = self.root / 'large.bin'
        target.write_bytes(b'x' * (2 * 1024 * 1024))
        try:
            with self.assertRaises(InterruptedError):
                builder.digest(target, progress=lambda done: builder.cancel_requested.set())
        finally:
            builder.cancel_requested.clear()

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
        manifest['scope'] = dict(profile='compatibility', omittedSections=['/base/program/0/manual'])
        file.write_text(json.dumps(manifest))
        report = builder.generate(self.backup, self.root / 'outputs')
        result = Path(report['output'])
        self.assertEqual(result.parent.name, 'My Test Game [0100000000000000]')
        self.assertEqual(result.name, 'My Test Game [0100000000000000].nup')
        self.assertEqual(report['source_scope'], manifest['scope'])
        override = builder.generate(self.backup, self.root / 'outputs', name='Other Name')
        self.assertEqual(Path(override['output']).name, 'Other Name [0100000000000000].nup')

    def test_name_and_icon_use_spec_ids_read_by_eglantine_and_preserve_control_files(self):
        self.fixture()
        nacp = bytearray(0x4000)
        nacp[:14] = b'Synthetic Game'
        nacp[0x200:0x209] = b'Publisher'
        nacp[0x3060:0x3065] = b'1.2.3'
        icon = b'\xff\xd8\xff\xe0synthetic icon bytes\xff\xd9'
        self.archive('base/program/0/control.tar', [('control/control.nacp', bytes(nacp), tarfile.REGTYPE), ('control/icon_AmericanEnglish.dat', icon, tarfile.REGTYPE)])
        self.manifest()
        report = builder.generate(self.backup, self.root / 'outputs')
        with builder.NupReader(report['output']) as reader:
            package = reader.packages[0]
            # Parse raw TLV numbers independently of the reference's constants.
            with open(report['output'], 'rb') as stream:
                stream.seek(package.meta_offset); block = stream.read(package.meta_size)
            records, offset = {}, 0
            while offset + 8 <= len(block):
                kind, reserved, size = struct.unpack_from('<HHI', block, offset)
                offset += 8; records[kind] = block[offset:offset + size]; offset += size
            self.assertNotIn(0, records)
            self.assertEqual(records[0x0005], b'Synthetic Game')
            self.assertEqual(records[0x0003], icon)
            self.assertEqual(records[0x0004], b'1.2.3')
            self.assertEqual(records[0x0006], b'Publisher')
            self.assertTrue(records[0x0001].startswith(b'ACI0'))
            self.assertIn('data/control/control.nacp', builder.container_tree(reader, package.root_dir)[1])
        self.assertTrue(report['metadata']['icon'])
        self.assertTrue(report['source_trees_matched'])


if __name__ == '__main__':
    unittest.main()
