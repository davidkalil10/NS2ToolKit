$ErrorActionPreference = 'Stop'
# No Switch connection: test dependency resolution and the real NUP window.
$savedPath = $env:PATH
$savedHome = $env:PYTHONHOME
$savedPythonPath = $env:PYTHONPATH
$savedUtf8 = $env:PYTHONUTF8
$logDir = Join-Path $PSScriptRoot 'exports\logs'
$logsBefore = @{}
if (Test-Path -LiteralPath $logDir) { Get-ChildItem -LiteralPath $logDir -File | ForEach-Object { $logsBefore[$_.FullName] = $true } }
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$work = Join-Path $tempRoot ('ns2-portable-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
try {
    $env:PATH = "$env:SystemRoot\System32;$env:SystemRoot"
    $env:PYTHONHOME = $null; $env:PYTHONPATH = $null
    $env:PYTHONUTF8 = '1'
    $python = Join-Path $PSScriptRoot 'runtime\python\python.exe'
    if (!(Test-Path -LiteralPath $python)) { throw 'Execute este teste dentro do pacote portátil.' }
    $fixture = @'
import hashlib, io, json, struct, sys, tarfile
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
'@
    $fixtureFile = Join-Path $work 'fixture.py'
    $fixture | Set-Content -LiteralPath $fixtureFile -Encoding UTF8
    $backup = Join-Path $work 'backup com espacos'
    & $python $fixtureFile $backup
    if ($LASTEXITCODE -ne 0) { throw 'Python incluído não conseguiu preparar a amostra.' }
    $source = ''
    foreach ($file in @('Painel-NS2.cs','Painel-Backup.cs','Painel-Nup.cs')) {
        $source += Get-Content -LiteralPath (Join-Path $PSScriptRoot $file) -Raw -Encoding UTF8
        $source += "`n"
    }
    Add-Type -TypeDefinition $source -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Web.Extensions
    if ([NS2Panel.Checks]::FindNode($PSScriptRoot) -ne (Join-Path $PSScriptRoot 'runtime\node\node.exe')) { throw 'Node externo selecionado.' }
    if ([NS2Panel.Checks]::FindPython($PSScriptRoot) -ne $python) { throw 'Python externo selecionado.' }
    [NS2Panel.Checks]::Run($PSScriptRoot)
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
    # Exercise a backend failure through the same window; zero false successes.
    $manifest = Join-Path $backup 'manifest.json'
    $value = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
    $value.complete = $false
    $value | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $manifest -Encoding ASCII
    $window.GetType().GetMethod('StartBuild', $flags).Invoke($window, @()) | Out-Null
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while ((Field 'worker') -ne $null -and [DateTime]::UtcNow -lt $deadline) {
        [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 50
    }
    if ((Field 'worker') -ne $null -or !(Field 'status').Text.StartsWith('Falha na geração')) { throw 'Falha do backend não foi reconhecida.' }
    $window.Close(); $window.Dispose()
    Write-Output 'Portátil validado com PATH sem Node/Python: processos, GUI NUP, sucesso verificado e recusa de backup incompleto.'
} finally {
    $env:PATH = $savedPath; $env:PYTHONHOME = $savedHome; $env:PYTHONPATH = $savedPythonPath; $env:PYTHONUTF8 = $savedUtf8
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
