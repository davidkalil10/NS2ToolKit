$ErrorActionPreference = 'Stop'
# No Switch connection: test dependency resolution and the real NUP window.
$savedPath = $env:PATH
$savedHome = $env:PYTHONHOME
$savedPythonPath = $env:PYTHONPATH
$savedUtf8 = $env:PYTHONUTF8
$savedSettings = $env:NS2_PANEL_SETTINGS
$logDir = Join-Path $PSScriptRoot 'exports\logs'
$logsBefore = @{}
if (Test-Path -LiteralPath $logDir) { Get-ChildItem -LiteralPath $logDir -File | ForEach-Object { $logsBefore[$_.FullName] = $true } }
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$work = Join-Path $tempRoot ('ns2-portable-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
try {
    $env:NS2_PANEL_SETTINGS = Join-Path $work 'settings.json'
    $env:PATH = "$env:SystemRoot\System32;$env:SystemRoot"
    $env:PYTHONHOME = $null; $env:PYTHONPATH = $null
    $env:PYTHONUTF8 = '1'
    $python = Join-Path $PSScriptRoot 'runtime\python\python.exe'
    if (!(Test-Path -LiteralPath $python)) { throw 'Execute este teste dentro do pacote portátil.' }
    $fixture = @'
import hashlib, io, json, struct, sys, tarfile, zlib
from pathlib import Path
root = Path(sys.argv[1]); root.mkdir()
npdm = bytearray(64); npdm[:4] = b'ACI0'; struct.pack_into('<Q', npdm, 16, 0x0100000000000000)
files=[]
for section, entries in [('exefs', [('main.npdm', bytes(npdm))]), ('romfs', [('dados.bin', b'portable synthetic fixture')])]:
    relative = f'base/program/0/{section}.tar'; target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(target, 'w:') as archive:
        for name, data in entries:
            member = tarfile.TarInfo(section + '/' + name); member.size = len(data)
            archive.addfile(member, io.BytesIO(data))
    files.append(dict(path=relative, bytes=target.stat().st_size, sha256=hashlib.sha256(target.read_bytes()).hexdigest()))
(root / 'manifest.json').write_text(json.dumps(dict(complete=True, title='0100000000000000', name='Teste portatil', files=files)), encoding='utf-8')
ftp = root.parent / 'pasta FTP com espacos'
for relative, data in [('exefs/main.npdm', bytes(npdm)), ('exefs/main', b'fake executable'), ('romfs/data.bin', b'FTP synthetic data')]:
    target = ftp / 'Base/programa 0' / relative
    target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
raw = bytearray(0x4000); titles = bytearray(16*0x300); titles[:9] = b'Pasta FTP'
encoder = zlib.compressobj(wbits=-15); payload = encoder.compress(titles) + encoder.flush()
raw[:2] = len(payload).to_bytes(2, 'little'); raw[2:2+len(payload)] = payload; raw[0x3215] = 1
control = ftp / 'Base/programa 0/control'; control.mkdir()
(control / 'control.nacp').write_bytes(raw)
(control / 'icon_AmericanEnglish.dat').write_bytes(b'\xff\xd8synthetic icon\xff\xd9')
save = root.parent / 'save com espacos'; (save / 'data').mkdir(parents=True)
(save / 'data/slot.sav').write_bytes(b'modified')
entry = dict(path='/slot.sav', local='data/slot.sav', size=8, sha256=hashlib.sha256(b'original').hexdigest())
archive = dict(id='7', space=1, type=1, rank=0, index=0, title='0100000000000000', uid='1'*32)
(save / 'manifest.json').write_text(json.dumps(dict(format='ns2toolkit-save-v1', complete=True, dataVerified=True,
    cleanupConfirmed=True, archive=archive, entries=[entry], directories=[])), encoding='utf-8')
'@
    $fixtureFile = Join-Path $work 'fixture.py'
    $fixture | Set-Content -LiteralPath $fixtureFile -Encoding UTF8
    $backup = Join-Path $work 'backup com espacos'
    & $python $fixtureFile $backup
    if ($LASTEXITCODE -ne 0) { throw 'Python incluído não conseguiu preparar a amostra.' }
    $source = ''
    foreach ($file in @('Painel-NS2.cs','Painel-Backup.cs','Painel-Nup.cs','Painel-Restore.cs','Painel-Ftp.cs')) {
        $source += Get-Content -LiteralPath (Join-Path $PSScriptRoot $file) -Raw -Encoding UTF8
        $source += "`n"
    }
    Add-Type -TypeDefinition $source -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Web.Extensions
    if ([NS2Panel.Checks]::FindNode($PSScriptRoot) -ne (Join-Path $PSScriptRoot 'runtime\node\node.exe')) { throw 'Node externo selecionado.' }
    if ([NS2Panel.Checks]::FindPython($PSScriptRoot) -ne $python) { throw 'Python externo selecionado.' }
    [NS2Panel.Checks]::Run($PSScriptRoot)
    $sessionFixture = Join-Path $work 'sessao'
    New-Item -ItemType Directory -Path $sessionFixture | Out-Null
    '{"consoleAddress":"192.168.18.139"}' | Set-Content -LiteralPath (Join-Path $sessionFixture 'result.json') -Encoding ASCII
    if ([NS2Panel.BackupWindow]::SessionAddress($sessionFixture) -ne '192.168.18.139') { throw 'IP do console nao foi carregado da sessao.' }
    # Inspect an edited save through the real UI and embedded Node, without a console session.
    $restoreWindow = New-Object NS2Panel.RestoreWindow($PSScriptRoot, $sessionFixture)
    $restoreFlags = [Reflection.BindingFlags]'NonPublic,Instance'
    $restoreTargets = $restoreWindow.GetType().GetField('targets', $restoreFlags).GetValue($restoreWindow)
    $restoreTarget = New-Object NS2Panel.RestoreTarget
    $restoreTarget.Id='7'; $restoreTarget.Title='0100000000000000'; $restoreTarget.User=('1'*32); $restoreTarget.Name='Teste de save'
    $restoreTargets.Items.Add($restoreTarget) | Out-Null; $restoreTargets.SelectedIndex=0
    $restoreSource = $restoreWindow.GetType().GetField('source', $restoreFlags).GetValue($restoreWindow)
    $restoreSource.Text = Join-Path $work 'save com espacos\data'
    $restoreWindow.GetType().GetMethod('Start', $restoreFlags).Invoke($restoreWindow, @('inspect')) | Out-Null
    $restoreWorker = $restoreWindow.GetType().GetField('worker', $restoreFlags).GetValue($restoreWindow)
    $restoreDeadline = [DateTime]::UtcNow.AddSeconds(15)
    while (!$restoreWorker.Complete -and [DateTime]::UtcNow -lt $restoreDeadline) { Start-Sleep -Milliseconds 40 }
    if (!$restoreWorker.Complete) { throw 'Inspecao local de save nao terminou.' }
    $restoreWindow.GetType().GetMethod('ReadOutput', $restoreFlags).Invoke($restoreWindow, @()) | Out-Null
    $restoreSelected = $restoreWindow.GetType().GetField('selected', $restoreFlags).GetValue($restoreWindow)
    if ($restoreSelected.Count -ne 1 -or $restoreSelected[0] -ne '/slot.sav' -or $restoreWindow.GetType().GetField('failed', $restoreFlags).GetValue($restoreWindow)) { throw 'Arquivo editado nao reconhecido pela interface.' }
    $restoreWorker.Dispose(); $restoreWindow.GetType().GetField('worker', $restoreFlags).SetValue($restoreWindow, $null); $restoreWindow.Dispose()
    # Exercise FTP ready/unmount UI states without opening Explorer or a console connection.
    $ftpScript=Join-Path $work 'ftp-ui-fixture.cjs'
    @'
const {runControlled}=require(process.argv[2]);
runControlled(async()=>{await new Promise(resolve=>{process.once('SIGINT',resolve);console.log('PANEL:'+JSON.stringify({kind:'ftp_ready',url:'ftp://127.0.0.1:30000/',scopes:['SD','Interno'],unavailable:[],upload:false}));});console.log('PANEL:'+JSON.stringify({kind:'complete'}));},[]);
'@ | Set-Content -LiteralPath $ftpScript -Encoding ASCII
    $ftpWindow=New-Object NS2Panel.FtpWindow($PSScriptRoot,$sessionFixture,$false)
    $ftpFlags=[Reflection.BindingFlags]'NonPublic,Instance'
    $ftpWorker=New-Object NS2Panel.Runner
    $ftpWorker.Start((Join-Path $PSScriptRoot 'runtime\node\node.exe'),$ftpScript,[NS2Panel.Checks]::QuoteArgument((Join-Path $PSScriptRoot 'painel-runner.cjs')),$PSScriptRoot)
    $ftpWindow.GetType().GetField('worker',$ftpFlags).SetValue($ftpWindow,$ftpWorker)
    $ftpToggle=$ftpWindow.GetType().GetField('toggle',$ftpFlags).GetValue($ftpWindow);$ftpToggle.Text='Desmontar FTP'
    $ftpExplorer=$ftpWindow.GetType().GetField('explorer',$ftpFlags).GetValue($ftpWindow)
    $ftpWindow.Show();$ftpDeadline=[DateTime]::UtcNow.AddSeconds(10)
    while(!$ftpExplorer.Enabled -and [DateTime]::UtcNow -lt $ftpDeadline){[System.Windows.Forms.Application]::DoEvents();Start-Sleep -Milliseconds 40}
    if(!$ftpExplorer.Enabled -or !$ftpWindow.GetType().GetMethod('ValidAddress',$ftpFlags).Invoke($ftpWindow,@())){throw 'FTP pronto nao reconhecido pela interface'}
    $ftpToggle.PerformClick();$ftpDeadline=[DateTime]::UtcNow.AddSeconds(10)
    while($ftpWindow.GetType().GetField('worker',$ftpFlags).GetValue($ftpWindow) -ne $null -and [DateTime]::UtcNow -lt $ftpDeadline){[System.Windows.Forms.Application]::DoEvents();Start-Sleep -Milliseconds 40}
    if($ftpWindow.GetType().GetField('worker',$ftpFlags).GetValue($ftpWindow) -ne $null -or $ftpToggle.Text -ne 'Montar FTP' -or $ftpWindow.RequiresRestart){throw ('Desmontagem FTP nao reconhecida: '+$ftpWindow.GetType().GetField('status',$ftpFlags).GetValue($ftpWindow).Text+'; '+$ftpWindow.GetType().GetField('output',$ftpFlags).GetValue($ftpWindow).Text+'; worker alive='+$ftpWorker.Alive+' complete='+$ftpWorker.Complete)}
    $ftpWindow.Close();$ftpWindow.Dispose()
    $backupWindow = New-Object NS2Panel.BackupWindow($PSScriptRoot, $sessionFixture)
    $addressField = $backupWindow.GetType().GetField('host', [Reflection.BindingFlags]'NonPublic,Instance').GetValue($backupWindow)
    if ($addressField.Text -ne '192.168.18.139') { throw 'IP do console nao foi preenchido na interface.' }
    $backupWindow.Dispose()
    $profileWindow = New-Object NS2Panel.BackupWindow($PSScriptRoot, $sessionFixture)
    $profileFlags = [Reflection.BindingFlags]'NonPublic,Instance'
    $profiles = $profileWindow.GetType().GetField('profile', $profileFlags).GetValue($profileWindow)
    if ($profiles.SelectedIndex -ne 0 -or $profiles.Items.Count -ne 3) { throw 'Perfil completo nao e o padrao.' }
    $profiles.SelectedIndex = 1
    $profileStatus = $profileWindow.GetType().GetField('status', $profileFlags).GetValue($profileWindow)
    if (!$profileStatus.Text.Contains('omite manuais')) { throw 'A omissao de manuais nao ficou explicita.' }
    $profiles.SelectedIndex = 2
    $profileBegin = $profileWindow.GetType().GetField('begin', $profileFlags).GetValue($profileWindow)
    if ($profileBegin.Text -ne 'Coletar diagnóstico') { throw 'Acao de diagnostico nao foi apresentada.' }
    $profileWindow.Dispose()
    # Preferences survive window recreation and keep games and saves separate.
    $gameTarget = Join-Path $work 'jogos personalizados'
    $saveTarget = Join-Path $work 'saves personalizados'
    [NS2Panel.PanelSettings]::SaveDestination('games', $gameTarget)
    [NS2Panel.PanelSettings]::SaveDestination('saves', $saveTarget)
    foreach ($forSaves in @($false, $true)) {
        $dialog = New-Object NS2Panel.BackupWindow($PSScriptRoot, $sessionFixture, $forSaves)
        $field = $dialog.GetType().GetField('destination', [Reflection.BindingFlags]'NonPublic,Instance').GetValue($dialog)
        $expected = if ($forSaves) { $saveTarget } else { $gameTarget }
        if ($field.Text -ne $expected) { throw 'Pasta personalizada nao persistiu.' }
        $dialog.Dispose()
    }
    # Exercise recoverable vs uncertain backend errors through the real UI.
    foreach ($restart in @($false, $true)) {
        $dialog = New-Object NS2Panel.BackupWindow($PSScriptRoot, $sessionFixture)
        $dialogFlags = [Reflection.BindingFlags]'NonPublic,Instance'
        $gameBox = $dialog.GetType().GetField('games', $dialogFlags).GetValue($dialog)
        $choice = New-Object NS2Panel.GameChoice
        $choice.Name = 'Teste'; $choice.Title = '0100000000000000'
        $gameBox.Items.Add($choice) | Out-Null; $gameBox.SelectedIndex = 0
        $stub = Join-Path $work 'failure.cjs'
        $probeReady = if ($restart) { 'false' } else { 'true' }
        $recoveryPath = (New-Object System.Web.Script.Serialization.JavaScriptSerializer).Serialize((Join-Path $PSScriptRoot 'painel-recovery.cjs'))
        $stubSource = @'
const {assessFailure} = require(__RECOVERY__);
(async () => {
    const native = Object.assign(Error('Open selected game CodeFS: result 0xd7400408'), {
        nativeOperation: 'Open selected game CodeFS', nativeResult: {raw: 0xd7400408, canonical: 0x408}
    });
    const error = Error('Could not prepare /updates/393216/program/1/exefs', {cause: native});
    const result = await assessFailure(error, [], '.', async () => __READY__);
    console.log('PANEL:' + JSON.stringify({kind:'error', message:error.message, ...result}));
    process.exitCode = 1;
})().catch(error => {console.error(error); process.exitCode=2;});
'@
        $stubSource.Replace('__RECOVERY__', $recoveryPath).Replace('__READY__', $probeReady) | Set-Content -LiteralPath $stub -Encoding UTF8
        $runner = New-Object NS2Panel.Runner
        $runner.Start([NS2Panel.Checks]::FindNode($PSScriptRoot), $stub, '', $PSScriptRoot)
        $dialog.GetType().GetField('worker', $dialogFlags).SetValue($dialog, $runner)
        $dialog.Show()
        $deadline = [DateTime]::UtcNow.AddSeconds(10)
        while ($dialog.GetType().GetField('worker', $dialogFlags).GetValue($dialog) -ne $null -and [DateTime]::UtcNow -lt $deadline) {
            [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 50
        }
        if ($dialog.RequiresRestart -ne $restart) { throw 'Estado de recuperacao incorreto na interface.' }
        $listButton = $dialog.GetType().GetField('list', $dialogFlags).GetValue($dialog)
        if ($listButton.Enabled -eq $restart) { throw 'A interface bloqueou uma sessao recuperavel ou liberou uma sessao incerta.' }
        $dialog.Close(); $dialog.Dispose()
    }
    [System.Windows.Forms.Application]::EnableVisualStyles()
    $window = New-Object NS2Panel.NupWindow($PSScriptRoot)
    $flags = [Reflection.BindingFlags]'NonPublic,Instance'
    function Field($Name) { $window.GetType().GetField($Name, $flags).GetValue($window) }
    (Field 'source').Text = $backup
    (Field 'destination').Text = Join-Path $work 'saida com espacos'
    (Field 'name').Text = 'Teste portátil'
    $window.Show()
    $window.GetType().GetMethod('StartBuild', $flags).Invoke($window, @()) | Out-Null
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    while ((Field 'worker') -ne $null -and [DateTime]::UtcNow -lt $deadline) {
        [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 50
    }
    if ((Field 'worker') -ne $null) { throw 'Tempo excedido na geração pela interface.' }
    if (!(Field 'status').Text.StartsWith('NUP concluído')) { throw ('Falha na interface: ' + (Field 'output').Text) }
    $reportPath = Get-ChildItem -LiteralPath (Join-Path $work 'saida com espacos') -Filter build-report.json -Recurse | Select-Object -First 1
    $report = Get-Content -LiteralPath $reportPath.FullName -Raw | ConvertFrom-Json
    if (!$report.complete -or !$report.deep_verified -or !$report.source_trees_matched -or !(Test-Path -LiteralPath $report.output)) { throw 'NUP não foi verificado.' }
    # The same source picker accepts an extracted FTP folder without a manifest.
    (Field 'source').Text = Join-Path $work 'pasta FTP com espacos'
    (Field 'name').Clear()
    $window.GetType().GetMethod('StartBuild', $flags).Invoke($window, @()) | Out-Null
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    while ((Field 'worker') -ne $null -and [DateTime]::UtcNow -lt $deadline) {
        [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 50
    }
    if ((Field 'worker') -ne $null -or !(Field 'status').Text.StartsWith('NUP concluído')) { throw ('Pasta FTP falhou na interface: ' + (Field 'output').Text) }
    $folderReports = @(Get-ChildItem -LiteralPath (Join-Path $work 'saida com espacos') -Filter build-report.json -Recurse | ForEach-Object {
        $value = Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json
        if ($value.source_kind -eq 'ftp-folder') { $value }
    })
    if ($folderReports.Count -ne 1 -or !$folderReports[0].deep_verified -or !$folderReports[0].metadata.icon -or $folderReports[0].metadata.title -ne 'Pasta FTP') { throw 'Pasta FTP ou metadados comprimidos nao verificados.' }
    # Exercise a backend failure through the same window; zero false successes.
    $manifest = Join-Path $backup 'manifest.json'
    $value = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
    $value.complete = $false
    $value | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $manifest -Encoding ASCII
    (Field 'source').Text = $backup
    $window.GetType().GetMethod('StartBuild', $flags).Invoke($window, @()) | Out-Null
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while ((Field 'worker') -ne $null -and [DateTime]::UtcNow -lt $deadline) {
        [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 50
    }
    if ((Field 'worker') -ne $null -or !(Field 'status').Text.StartsWith('Falha na geração')) { throw 'Falha do backend não foi reconhecida.' }
    $window.Close(); $window.Dispose()
    Write-Output 'Portátil validado com PATH sem Node/Python: GUI NUP aceita TAR e pasta FTP automaticamente; metadados comprimidos e recusa de backup incompleto conferidos.'
} finally {
    $env:PATH = $savedPath; $env:PYTHONHOME = $savedHome; $env:PYTHONPATH = $savedPythonPath; $env:PYTHONUTF8 = $savedUtf8; $env:NS2_PANEL_SETTINGS = $savedSettings
    if (Test-Path -LiteralPath $logDir) {
        Get-ChildItem -LiteralPath $logDir -File -Filter 'nup-*.log' | Where-Object { !$logsBefore.ContainsKey($_.FullName) } | ForEach-Object { Remove-Item -LiteralPath $_.FullName }
        if (!(Get-ChildItem -LiteralPath $logDir -Force)) { Remove-Item -LiteralPath $logDir }
        $exports = Split-Path -Parent $logDir
        if (!(Get-ChildItem -LiteralPath $exports -Force)) { Remove-Item -LiteralPath $exports }
    }
    $resolved = [IO.Path]::GetFullPath($work)
    if ($resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolved).StartsWith('ns2-portable-test-')) {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
