import concurrent.futures, ftplib, io, json, os, re, subprocess, sys, tempfile
from pathlib import Path
root=Path(__file__).resolve().parent
node=sys.argv[1] if len(sys.argv)>1 else 'node'
payload=bytes(i%251 for i in range(300000))
def test_server(upload):
 with tempfile.TemporaryDirectory(prefix='ns2-ftp-test-') as folder:
  process=subprocess.Popen([node,str(root/'test-ftp-fixture.cjs'),folder,*(['--upload'] if upload else [])],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8')
  try:
   line=process.stdout.readline()
   assert line,process.stderr.read()
   port=json.loads(line)['port']
   def connect(passive=True):
    ftp=ftplib.FTP();ftp.connect('127.0.0.1',port,timeout=10);ftp.login();ftp.set_pasv(passive);return ftp
   with connect() as ftp:
    assert set(ftp.nlst())=={'SD','Interno'}
    ftp.cwd('SD');assert ftp.pwd()=='/SD'
    assert ftp.size('hello.bin')==len(payload)
    rows=[];ftp.retrlines('LIST',rows.append);assert any('nome com espaço.txt' in x for x in rows)
    result=io.BytesIO();ftp.retrbinary('RETR hello.bin',result.write);assert result.getvalue()==payload
    result=io.BytesIO();ftp.retrbinary('RETR hello.bin',result.write,rest=12345);assert result.getvalue()==payload[12345:]
    ftp.set_pasv(False);result=io.BytesIO();ftp.retrbinary('RETR hello.bin',result.write);assert result.getvalue()==payload
    ftp.set_pasv(True)
    for command in ['PORT 10,0,0,1,200,20','DELE hello.bin','RNFR hello.bin','SITE anything','CWD /SYSTEM']:
     try:ftp.sendcmd(command);raise AssertionError(command+' was accepted')
     except ftplib.error_perm:pass
    for name in ['/Interno/new.bin','/SD/hello.bin']:
     try:ftp.storbinary('STOR '+name,io.BytesIO(b'replace'));raise AssertionError('overwrite accepted')
     except ftplib.error_perm:pass
    if upload:
     ftp.mkd('/SD/homebrew');data=b'own upload\x00\xff'*4000
     ftp.storbinary('STOR /SD/homebrew/test.nro',io.BytesIO(data))
     result=io.BytesIO();ftp.retrbinary('RETR /SD/homebrew/test.nro',result.write);assert result.getvalue()==data
     ftp.storbinary('STOR /SD/empty',io.BytesIO(b''));assert ftp.size('/SD/empty')==0
     try:ftp.storbinary('STOR /SD/too-big',io.BytesIO(b'x'*600000));raise AssertionError('size cap ignored')
     except (ftplib.error_perm,ConnectionError):pass
    else:
     try:ftp.storbinary('STOR /SD/new',io.BytesIO(b'new'));raise AssertionError('read-only upload')
     except ftplib.error_perm:pass
   def retrieve(_):
    with connect() as ftp:
     result=io.BytesIO();ftp.retrbinary('RETR /SD/hello.bin',result.write);assert result.getvalue()==payload
   with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:list(executor.map(retrieve,range(2)))
   class ExtendedFTP(ftplib.FTP):
    def makepasv(self):return '127.0.0.1',int(re.search(r'\(\|\|\|(\d+)\|\)',self.sendcmd('EPSV')).group(1))
   with ExtendedFTP() as ftp:
    ftp.connect('127.0.0.1',port,timeout=10);ftp.login();assert set(ftp.nlst())=={'SD','Interno'}
   # An idle Explorer connection and an unused passive listener must not prevent unmount.
   waiting=connect();waiting.sendcmd('PASV')
   print('FTP '+('SD uploads' if upload else 'read-only')+': PASV, EPSV, PORT, UTF-8, list, download, resume, permissions and serialized clients passed.',flush=True)
  finally:
   process.stdin.write('stop\n');process.stdin.flush()
   output,errors=process.communicate(timeout=10)
   assert process.returncode==0,(output,errors)
   assert not errors,errors
test_server(False)
test_server(True)
