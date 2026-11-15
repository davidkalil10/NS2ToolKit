param([string]$RunDirectory, [switch]$Verificar)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
$taskRoot = $PSScriptRoot
$nodeExe = Join-Path $taskRoot 'runtime/node.exe'
if (-not (Test-Path -LiteralPath $nodeExe)) { throw 'Runtime ausente. Use a pasta de teste preparada completa.' }
if ($Verificar) {
    & $nodeExe (Join-Path $taskRoot 'iniciar.cjs') --check
    if ($LASTEXITCODE -ne 0) { throw 'A conferência do pacote falhou.' }
    exit 0
}
Write-Host 'Teste Zelda sobre FireRed - experimental, ainda sem validação no console.'
Write-Host 'Primeiro copie sd-card-root/ns2jb-modloader para /SD pelo FTP.'
Write-Host 'Depois desmonte FTP e mantenha a conexão 4/4 e SmileBASIC abertos.'
if (-not $RunDirectory) { $RunDirectory = (Read-Host 'Cole a pasta da sessão ativa (runs\switch2-...)').Trim().Trim('"') }
if (-not $RunDirectory -or -not [IO.Path]::IsPathRooted($RunDirectory)) { throw 'Informe o caminho completo da sessão ativa.' }
$logRoot = Join-Path $taskRoot 'logs'
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$logFile = Join-Path $logRoot ('teste-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt')
Start-Transcript -LiteralPath $logFile | Out-Null
try {
    & $nodeExe (Join-Path $taskRoot 'iniciar.cjs') --run-dir $RunDirectory
    $taskExitCode = $LASTEXITCODE
} finally { Stop-Transcript | Out-Null }
if ($taskExitCode -ne 0) {
    Write-Host "Teste interrompido. Registro: $logFile" -ForegroundColor Red
    exit $taskExitCode
}
