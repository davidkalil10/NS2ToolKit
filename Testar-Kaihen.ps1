param([Parameter(Mandatory=$true)][string]$Package,[string]$Screenshot)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms,System.Drawing,System.Web.Extensions
[Windows.Forms.Application]::EnableVisualStyles();[Windows.Forms.Application]::SetCompatibleTextRenderingDefault($false)
$taskAssembly=[Reflection.Assembly]::LoadFrom((Join-Path $Package 'NS2 Assistente.exe'))
$taskFlags=[Reflection.BindingFlags]'Instance,NonPublic'
$taskFixture=Join-Path $PSScriptRoot ('.runtime/kaihen-ui-test-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskFixture -Force | Out-Null
$taskNode=Join-Path $Package 'runtime/node/node.exe'
if(-not(Test-Path -LiteralPath $taskNode)){$taskNode=Join-Path $PSScriptRoot '.runtime/portable-cache/node.exe'}
function TaskGet($Window,[string]$Name){$Window.GetType().GetField($Name,$taskFlags).GetValue($Window)}
function TaskPump($Window){$taskWatch=[Diagnostics.Stopwatch]::StartNew();while($null -ne (TaskGet $Window 'worker')){[Windows.Forms.Application]::DoEvents();Start-Sleep -Milliseconds 20;if($taskWatch.Elapsed.TotalSeconds -gt 15){throw 'A simulação da janela excedeu o prazo.'}}}
function TaskShow($Window){$Window.ShowInTaskbar=$false;$Window.StartPosition=[Windows.Forms.FormStartPosition]::Manual;$Window.Location=New-Object Drawing.Point(-20000,-20000);$Window.Show();[Windows.Forms.Application]::DoEvents()}
# These workers emit only test events: no console modules, sockets or native API.
$taskSuccess=Join-Path $taskFixture 'success.cjs'
[IO.File]::WriteAllText($taskSuccess,@'
const e=(kind,row={})=>console.log('PANEL:'+JSON.stringify({kind,...row}));
e('kaihen_waiting',{message:'Teste local'});e('kaihen_command',{command:'V=START(39380,192,0,2,1)'});
e('kaihen_connected',{message:'Conectado (somente simulação)'});e('kaihen_ready',{message:'kaiHEN iniciado (somente simulação)'});
e('kaihen_closed',{message:'Abra hbmenu e teste OunceShell (somente simulação)',hostError:'registro preservado'});
'@,[Text.UTF8Encoding]::new($false))
$taskWindow=[Activator]::CreateInstance($taskAssembly.GetType('NS2Panel.KaihenWindow'),[object[]]@([string]$Package,[string]'192.0.2.1',[string]$taskSuccess))
try{
    TaskShow $taskWindow;(TaskGet $taskWindow 'prepared').Checked=$true
    $taskWindow.GetType().GetMethod('Start',$taskFlags).Invoke($taskWindow,@())|Out-Null
    TaskPump $taskWindow
    if(-not $taskWindow.ReadyForGame){throw 'A janela não reconheceu a conclusão simulada.'}
    if((TaskGet $taskWindow 'guide').Text -notmatch 'OunceShell'){throw 'As instruções do homebrew de teste estão ausentes.'}
    if((TaskGet $taskWindow 'start').Enabled){throw 'A janela permite repetir HEN após ativação.'}
    if($Screenshot){$taskImage=New-Object Drawing.Bitmap($taskWindow.Width,$taskWindow.Height);try{$taskWindow.DrawToBitmap($taskImage,(New-Object Drawing.Rectangle(0,0,$taskWindow.Width,$taskWindow.Height)));$taskImage.Save($Screenshot)}finally{$taskImage.Dispose()}}
}finally{$taskWindow.Close();$taskWindow.Dispose()}
$taskFailure=Join-Path $taskFixture 'failure.cjs'
[IO.File]::WriteAllText($taskFailure,"console.log('PANEL:'+JSON.stringify({kind:'error',summary:'Falha simulada antes de HEN'}));process.exitCode=1;",[Text.UTF8Encoding]::new($false))
$taskWindow=[Activator]::CreateInstance($taskAssembly.GetType('NS2Panel.KaihenWindow'),[object[]]@([string]$Package,[string]'192.0.2.1',[string]$taskFailure))
try{
    TaskShow $taskWindow;(TaskGet $taskWindow 'prepared').Checked=$true
    $taskWindow.GetType().GetMethod('Start',$taskFlags).Invoke($taskWindow,@())|Out-Null;TaskPump $taskWindow
    if($taskWindow.ReadyForGame){throw 'Falha simulada foi anunciada como sucesso.'}
    if((TaskGet $taskWindow 'status').Text -notmatch 'Falha simulada'){throw 'A primeira causa foi substituída.'}
}finally{$taskWindow.Close();$taskWindow.Dispose()}
# The entry point must be present on the main backup/FTP assistant.
$taskMain=[Activator]::CreateInstance($taskAssembly.GetType('NS2Panel.MainWindow'),@($Package))
try{if((TaskGet $taskMain 'homebrew').Text -ne 'Ativar Homebrew'){throw 'Entrada kaiHEN ausente do toolkit principal.'};if((TaskGet $taskMain 'homebrew').Enabled){throw 'Ativação disponível antes de conectar.'}}finally{$taskMain.Dispose()}
$taskWindow=[Activator]::CreateInstance($taskAssembly.GetType('NS2Panel.KaihenWindow'),[object[]]@([string]$Package,[string]'192.0.2.1',[string]$taskSuccess,[string]$taskFixture))
try{
    TaskShow $taskWindow
    foreach($taskField in (TaskGet $taskWindow 'commands')){if($taskField.Visible){throw 'A janela de sessão ativa repetiu os comandos de conexão.'}}
    if((TaskGet $taskWindow 'status').Text -notmatch '4/4'){throw 'A conexão existente não foi identificada.'}
    $taskWindow.GetType().GetMethod('Start',$taskFlags).Invoke($taskWindow,@())|Out-Null;TaskPump $taskWindow
    if(-not $taskWindow.ReadyForGame){throw 'A ativação com sessão existente não foi reconhecida.'}
    if((TaskGet $taskWindow 'guide').Text -notmatch 'OunceShell'){throw 'As instruções guiadas foram perdidas.'}
    if($Screenshot){$taskImage=New-Object Drawing.Bitmap($taskWindow.Width,$taskWindow.Height);try{$taskWindow.DrawToBitmap($taskImage,(New-Object Drawing.Rectangle(0,0,$taskWindow.Width,$taskWindow.Height)));$taskImage.Save($Screenshot)}finally{$taskImage.Dispose()}}
}finally{$taskWindow.Close();$taskWindow.Dispose()}
Write-Output 'Interface kaiHEN integrada ao painel principal: conclusão, falha e instruções validadas sem console.'
