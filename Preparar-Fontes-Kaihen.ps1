param([switch]$Offline)
$ErrorActionPreference = 'Stop'
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'integrations/kaihen/source-manifest.json') -Raw | ConvertFrom-Json
if ($manifest.format -ne 'ns2toolkit-kaihen-sources-v1') { throw 'Manifesto de fontes invalido.' }
$cache = Join-Path $PSScriptRoot '.runtime/kaihen-source-archives'
New-Item -ItemType Directory -Path $cache -Force | Out-Null
foreach ($entry in $manifest.entries) {
    if ($entry.file -notmatch '^[a-zA-Z0-9_.-]+\.zip$' -or $entry.url -notmatch '^https://codeload\.github\.com/' -or $entry.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'Entrada de fontes invalida.' }
    $target = Join-Path $cache $entry.file
    if (!(Test-Path -LiteralPath $target -PathType Leaf)) {
        if ($Offline) { throw "Fonte ausente: $($entry.file)" }
        Invoke-WebRequest -Uri $entry.url -OutFile $target
    }
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw "Fonte divergente: $($entry.file)" }
}
Write-Output 'Fontes dos componentes kaiHEN conferidas.'
