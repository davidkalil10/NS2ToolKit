# Shared read-only bridge to the same descriptor validator used by the application.
function Read-KaihenConfiguration([string]$RootFolder) {
    $taskNode = Join-Path $RootFolder '.runtime/portable-cache/node.exe'
    if (!(Test-Path -LiteralPath $taskNode)) { $taskNode = Join-Path $RootFolder 'runtime/node/node.exe' }
    if (!(Test-Path -LiteralPath $taskNode)) { $taskNode = (Get-Command node -ErrorAction Stop).Source }
    $taskJson = & $taskNode (Join-Path $RootFolder 'kaihen-config.cjs') --json $RootFolder
    if ($LASTEXITCODE -ne 0) { throw 'A configuracao central do kaiHEN nao passou na validacao.' }
    return ($taskJson | ConvertFrom-Json)
}
