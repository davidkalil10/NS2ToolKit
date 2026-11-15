import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('mods', Path(__file__).with_name('painel-mod-preparar.py'))
mods = importlib.util.module_from_spec(spec); spec.loader.exec_module(mods)
from nup.pack import pack
from nup.read import NupReader

class PrepareTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name); self.source = self.root/'source'
        (self.source/'exefs').mkdir(parents=True); (self.source/'romfs').mkdir()
        self.rom = bytearray(256); self.rom[0xB2]=0x96
        self.rom[0xBD] = (-sum(self.rom[0xA0:0xBD])-0x19)&255
        self.main = b'NSO0' + bytes(252)
        self.write_source()
        self.silent = patch.object(mods,'emit'); self.silent.start();self.addCleanup(self.silent.stop)
    def write_source(self, title=mods.TITLE):
        npdm=bytearray(64);npdm[:4]=b'ACI0';struct.pack_into('<Q',npdm,16,int(title,16))
        (self.source/'exefs/main.npdm').write_bytes(npdm)
        (self.source/'exefs/main').write_bytes(self.main)
        (self.source/'romfs/FireRed_e.gba').write_bytes(self.rom)
    def nup(self, title=mods.TITLE):
        file=self.root/'Teste GBA.nup'
        pack(str(file),str(self.source),base_title_id=int(title,16),level=1)
        return file
    def test_prepare_preserves_nup_and_stages_only_rom_and_main(self):
        file=self.nup();before=hashlib.sha256(file.read_bytes()).digest()
        job=mods.prepare(file,self.root/'out');report=json.loads((job/'mod.json').read_text(encoding='utf8'))
        self.assertEqual({r['path'] for r in report['files']},{'romfs/FireRed_e.gba','exefs/main'})
        self.assertFalse(report['ready']);self.assertTrue(report['inputFilesVerified'])
        self.assertEqual((job/('sd-card-root/ns2jb-modloader/contents/'+mods.TITLE+'/romfs/FireRed_e.gba')).read_bytes(),self.rom)
        self.assertEqual(hashlib.sha256(file.read_bytes()).digest(),before)
    def test_another_title_is_refused_before_output(self):
        title='0100000000000000';self.write_source(title)
        with self.assertRaisesRegex(ValueError,'FireRed'):mods.prepare(self.nup(title),self.root/'out')
        self.assertFalse((self.root/'out').exists())
    def test_corrupt_blob_with_intact_toc_is_refused(self):
        file=self.nup()
        with NupReader(str(file)) as reader:
            row=next(row for row in reader.files if row[0]==b'FireRed_e.gba')
            offset=row[3]
        with file.open('r+b') as stream:
            stream.seek(offset);value=stream.read(1);stream.seek(offset);stream.write(bytes([value[0]^1]))
        with self.assertRaises(Exception):mods.prepare(file,self.root/'out')
        self.assertFalse((self.root/'out').exists())
    def test_gba_checksum_is_checked_independently_of_nup_hash(self):
        self.rom[0xBD]^=1;self.write_source()
        with self.assertRaisesRegex(ValueError,'cabeçalho/checksum'):mods.prepare(self.nup(),self.root/'out')
    def test_nro_is_not_treated_as_a_nup(self):
        file=self.root/'homebrew.nro';file.write_bytes(b'NRO0')
        with self.assertRaisesRegex(ValueError,'arquivo .nup'):mods.prepare(file,self.root/'out')
    def test_repeated_preparations_do_not_replace_previous_folder(self):
        file=self.nup();one=mods.prepare(file,self.root/'out');two=mods.prepare(file,self.root/'out')
        self.assertNotEqual(one,two);self.assertTrue((one/'mod.json').is_file())
    def test_missing_main_is_not_a_partial_success(self):
        (self.source/'exefs/main').unlink()
        with self.assertRaisesRegex(ValueError,'ausentes'):mods.prepare(self.nup(),self.root/'out')

if __name__=='__main__':unittest.main()
