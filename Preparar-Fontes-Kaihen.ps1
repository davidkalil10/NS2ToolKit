param([switch]$Offline)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Ler-Config-Kaihen.ps1')
$taskSetup = Read-KaihenConfiguration $PSScriptRoot
$manifest = [pscustomobject]@{format='ns2toolkit-kaihen-sources-v1';entries=@($taskSetup.config.sources)}
$cache = Join-Path $PSScriptRoot '.runtime/kaihen-source-archives'
New-Item -ItemType Directory -Path $cache -Force | Out-Null
foreach ($entry in $manifest.entries) {
    if ($entry.file -notmatch '^[a-zA-Z0-9_.-]+\.zip$' -or $entry.url -notmatch '^https://codeload\.github\.com/' -or $entry.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'Entrada de fontes invalida.' }
    $target = Join-Path $cache $entry.file
    if (!(Test-Path -LiteralPath $target -PathType Leaf)) {
        if ($Offline) { throw "Fonte ausente: $($entry.file)" }
        $temporary=$target+'.'+[guid]::NewGuid().ToString('N')+'.part'
        Invoke-WebRequest -Uri $entry.url -OutFile $temporary
        if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw "Fonte divergente: $($entry.file)" }
        Move-Item -LiteralPath $temporary -Destination $target
    }
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw "Fonte divergente: $($entry.file)" }
}
$taskSourceManifest=Join-Path $PSScriptRoot 'integrations/kaihen/source-manifest.json'
[IO.File]::WriteAllText(($taskSourceManifest+'.pending'),($manifest|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath ($taskSourceManifest+'.pending') -Destination $taskSourceManifest -Force
Write-Output 'Fontes dos componentes kaiHEN conferidas.'
