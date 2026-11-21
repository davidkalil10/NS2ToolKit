param([switch]$Offline)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Ler-Config-Kaihen.ps1')
$taskSetup=Read-KaihenConfiguration $PSScriptRoot
$taskConfig=$taskSetup.config
$taskArchive=$taskSetup.paths.archive
$taskPayload=$taskSetup.paths.payload
$taskCache=Split-Path -Parent $taskArchive
New-Item -ItemType Directory -Path $taskCache -Force | Out-Null
if(-not(Test-Path -LiteralPath $taskArchive)) {
    if($Offline){throw ('Pacote kaiHEN ausente no cache: '+$taskConfig.archive.file)}
    $taskDownload=$taskArchive+'.'+[guid]::NewGuid().ToString('N')+'.part'
    Invoke-WebRequest -Uri $taskConfig.archive.url -OutFile $taskDownload
    if((Get-FileHash -LiteralPath $taskDownload -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskConfig.archive.sha256){throw 'O ZIP kaiHEN difere do hash fixado; pacote nao aplicado.'}
    Move-Item -LiteralPath $taskDownload -Destination $taskArchive
}
if((Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskConfig.archive.sha256){throw 'O ZIP kaiHEN difere do hash fixado.'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskZip=[IO.Compression.ZipFile]::OpenRead($taskArchive)
try {
    $taskNames=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    $taskFiles=@{}
    [long]$taskExpandedBytes=0
    foreach($taskEntry in $taskZip.Entries){
        $taskName=$taskEntry.FullName
        if($taskName -match '(^/|\\|(^|/)\.\.(/|$)|:)' -or $taskName.Split('/') -contains '.' -or -not $taskNames.Add($taskName)){throw 'Caminho invalido ou duplicado no ZIP kaiHEN.'}
        $taskExpandedBytes+=$taskEntry.Length
        if($taskExpandedBytes -gt 268435456){throw 'Pacote kaiHEN excede o limite de extracao.'}
        if(-not $taskName.EndsWith('/')){$taskFiles[$taskName]=$taskEntry}
    }
    foreach($taskRequired in @('bootstrap.bin','ro/main','hen/main','game/main','hbmenu.nro','programs/ounceshell.nro')){
        if(-not $taskFiles.ContainsKey($taskRequired)){throw ('Pacote kaiHEN incompleto: '+$taskRequired)}
    }
    $taskNew=-not(Test-Path -LiteralPath $taskPayload)
    $taskExtract=if($taskNew){$taskPayload+'.pending-'+[guid]::NewGuid().ToString('N')}else{$taskPayload}
    if($taskNew){Expand-Archive -LiteralPath $taskArchive -DestinationPath $taskExtract}
    foreach($taskName in $taskFiles.Keys){
        $taskEntry=$taskFiles[$taskName];$taskStream=$taskEntry.Open();$taskHasher=[Security.Cryptography.SHA256]::Create()
        try{$taskDigest=([BitConverter]::ToString($taskHasher.ComputeHash($taskStream))).Replace('-','').ToLowerInvariant()}finally{$taskStream.Dispose();$taskHasher.Dispose()}
        $taskFile=Join-Path $taskExtract $taskName
        if(-not(Test-Path -LiteralPath $taskFile) -or (Get-FileHash -LiteralPath $taskFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskDigest){throw ('Cache extraido difere da release: '+$taskName)}
    }
    $taskActual=@(Get-ChildItem -LiteralPath $taskExtract -Recurse -File)
    if($taskActual.Count -ne $taskFiles.Count){throw 'Cache kaiHEN contem arquivos adicionais nao verificados.'}
    if($taskNew){Move-Item -LiteralPath $taskExtract -Destination $taskPayload}
} finally {$taskZip.Dispose()}
$taskManifest=[ordered]@{release=$taskConfig.release;kaihenCommit=$taskConfig.kaihenCommit;hostCommit=$taskConfig.hostCommit;archiveSha256=$taskConfig.archive.sha256;configurationSha256=$taskSetup.configurationSha256;
    compatibility=$taskConfig.compatibility;localPatches=@($taskConfig.localPatches);hostFiles=[ordered]@{};payloadFiles=[ordered]@{}}
$taskHost=Join-Path $PSScriptRoot 'integrations/kaihen/host'
foreach($taskPair in @(@($taskHost,'hostFiles'),@($taskPayload,'payloadFiles'))) {
    $taskBase=$taskPair[0]
    Get-ChildItem -LiteralPath $taskBase -Recurse -File | Sort-Object FullName | ForEach-Object {
        $taskRelative=$_.FullName.Substring($taskBase.Length+1).Replace('\','/')
        if($taskRelative -match '(^|/)(runs|dumps|\.git)(/|$)'){throw 'Arquivo de sessao encontrado na fonte de distribuicao.'}
        $taskManifest[$taskPair[1]][$taskRelative]=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}
$taskOutput=Join-Path $PSScriptRoot 'integrations/kaihen/runtime-manifest.json'
$taskTemporary=$taskOutput+'.pending'
[IO.File]::WriteAllText($taskTemporary,($taskManifest|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $taskTemporary -Destination $taskOutput -Force
Write-Output ('kaiHEN '+$taskConfig.release+', hbmenu e OunceShell conferidos para empacotamento.')
