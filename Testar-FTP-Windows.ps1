param([string]$NodePath)
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
if(!$NodePath){$NodePath=(Get-Command node).Source}
$work=Join-Path (Join-Path $PSScriptRoot '.runtime') ('wininet-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
$start=New-Object Diagnostics.ProcessStartInfo
$start.FileName=$NodePath
$start.Arguments='"'+(Join-Path $root 'test-ftp-fixture.cjs')+'" "'+$work+'" --upload'
$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
$process=[Diagnostics.Process]::Start($start)
$port=($process.StandardOutput.ReadLine()|ConvertFrom-Json).port
if(!$port){throw 'Fixture FTP nao iniciou'}
$native=@'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.ComponentModel;
public static class NativeFtpTest {
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] public struct Entry {
  public uint attr;public System.Runtime.InteropServices.ComTypes.FILETIME created,accessed,written;
  public uint sizeHigh,sizeLow,reserved0,reserved1;
  [MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)]public string name;
  [MarshalAs(UnmanagedType.ByValTStr,SizeConst=14)]public string alternate;
 }
 [DllImport("wininet.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr InternetOpen(string agent,uint mode,string proxy,string bypass,uint flags);
 [DllImport("wininet.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr InternetConnect(IntPtr internet,string server,ushort port,string user,string password,uint service,uint flags,IntPtr context);
 [DllImport("wininet.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr FtpFindFirstFile(IntPtr ftp,string search,out Entry entry,uint flags,IntPtr context);
 [DllImport("wininet.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool InternetFindNextFile(IntPtr find,out Entry entry);
 [DllImport("wininet.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool FtpGetFile(IntPtr ftp,string remote,string local,bool fail,uint attributes,uint flags,IntPtr context);
 [DllImport("wininet.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool FtpPutFile(IntPtr ftp,string local,string remote,uint flags,IntPtr context);
 [DllImport("wininet.dll",SetLastError=true)]static extern bool InternetSetOption(IntPtr handle,uint option,ref uint value,uint bytes);
 [DllImport("wininet.dll")]static extern bool InternetCloseHandle(IntPtr handle);
 static void Check(bool ok,string message){if(!ok)throw new Exception(message+": "+new Win32Exception(Marshal.GetLastWin32Error()).Message);}
 public static void Run(int port,string folder,bool passive){
  IntPtr internet=InternetOpen("NS2ToolKit test",1,null,null,0),ftp=IntPtr.Zero,find=IntPtr.Zero;
  try {
   Check(internet!=IntPtr.Zero,"InternetOpen");uint timeout=10000;
   InternetSetOption(internet,2,ref timeout,4);InternetSetOption(internet,6,ref timeout,4);
   ftp=InternetConnect(internet,"127.0.0.1",(ushort)port,"anonymous","",1,passive?0x08000000u:0,IntPtr.Zero);Check(ftp!=IntPtr.Zero,"InternetConnect");
   Entry entry;find=FtpFindFirstFile(ftp,"*",out entry,0x80000000u,IntPtr.Zero);Check(find!=IntPtr.Zero,"FtpFindFirstFile");
   bool sd=entry.name=="SD",inside=entry.name=="Interno";
   while(InternetFindNextFile(find,out entry)){sd|=entry.name=="SD";inside|=entry.name=="Interno";}
   InternetCloseHandle(find);find=IntPtr.Zero;if(!sd||!inside)throw new Exception("Native folder listing missing roots");
   string local=Path.Combine(folder,passive?"passive.bin":"active.bin");
   Check(FtpGetFile(ftp,"/SD/hello.bin",local,true,0,0x80000002u,IntPtr.Zero),"FtpGetFile");
   byte[] bytes=File.ReadAllBytes(local);if(bytes.Length!=300000)throw new Exception("Download length");
   for(int i=0;i<bytes.Length;i++)if(bytes[i]!=(byte)(i%251))throw new Exception("Download bytes");
   string small=Path.Combine(folder,"upload.bin");File.WriteAllBytes(small,new byte[]{1,0,255,3});
   Check(FtpPutFile(ftp,small,passive?"/SD/windows-passive.bin":"/SD/windows-active.bin",2,IntPtr.Zero),"FtpPutFile");
  }finally{if(find!=IntPtr.Zero)InternetCloseHandle(find);if(ftp!=IntPtr.Zero)InternetCloseHandle(ftp);if(internet!=IntPtr.Zero)InternetCloseHandle(internet);}
 }
}
'@
try {
 Add-Type -TypeDefinition $native
 [NativeFtpTest]::Run($port,$work,$true)
 [NativeFtpTest]::Run($port,$work,$false)
 Write-Output 'Windows WinINet: listagem, download binario e upload passaram em modos passivo e ativo. Sem console.'
}finally{
 $process.StandardInput.WriteLine('stop');$process.StandardInput.Flush()
 if(!$process.WaitForExit(10000)){$process.Kill();throw 'Fixture nao encerrou'}
 $errors=$process.StandardError.ReadToEnd();$process.Dispose()
 if($errors){Write-Error $errors}
}
