param([switch]$Offline)
$ErrorActionPreference='Stop'
$taskCache=Join-Path $PSScriptRoot '.runtime/kaihen-cache'
$taskArchive=Join-Path $taskCache 'kaiHEN-20261114d.zip'
$taskExpected='9d0d1a7c6d91d018576121a9513f691ff397883a58090b585f0384965144f38f'
New-Item -ItemType Directory -Path $taskCache -Force | Out-Null
if(-not(Test-Path -LiteralPath $taskArchive)) {
    if($Offline){throw 'Pacote kaiHEN ausente no cache.'}
    Invoke-WebRequest -Uri 'https://github.com/ouncebrew/kaihen/releases/download/20261114d/kaiHEN-20261114d.zip' -OutFile $taskArchive
}
if((Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskExpected){throw 'O ZIP kaiHEN difere do hash oficial.'}
$taskPayload=Join-Path $taskCache 'package-20261114d'
if(-not(Test-Path -LiteralPath $taskPayload)) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $taskZip=[IO.Compression.ZipFile]::OpenRead($taskArchive)
    try{foreach($taskEntry in $taskZip.Entries){if($taskEntry.FullName -match '(^/|\\|(^|/)\.\.(/|$)|:)'){throw 'Caminho inválido no ZIP kaiHEN.'}}}finally{$taskZip.Dispose()}
    Expand-Archive -LiteralPath $taskArchive -DestinationPath $taskPayload
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskZip=[IO.Compression.ZipFile]::OpenRead($taskArchive)
try{
    foreach($taskEntry in $taskZip.Entries){
        if($taskEntry.FullName.EndsWith('/')){continue}
        if($taskEntry.FullName -match '(^/|\\|(^|/)\.\.(/|$)|:)'){throw 'Caminho inválido no ZIP kaiHEN.'}
        $taskStream=$taskEntry.Open();$taskHasher=[Security.Cryptography.SHA256]::Create()
        try{$taskDigest=([BitConverter]::ToString($taskHasher.ComputeHash($taskStream))).Replace('-','').ToLowerInvariant()}finally{$taskStream.Dispose();$taskHasher.Dispose()}
        $taskFile=Join-Path $taskPayload $taskEntry.FullName
        if(-not(Test-Path -LiteralPath $taskFile) -or (Get-FileHash -LiteralPath $taskFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskDigest){throw ('Cache extraído difere da release: '+$taskEntry.FullName)}
    }
}finally{$taskZip.Dispose()}
$taskManifest=[ordered]@{release='20261114d';kaihenCommit='5ac772560698b325551db014478a5a43e941474c';hostCommit='28f03b5895e5569d8fbc35cbed84906b8f0a65b2';archiveSha256=$taskExpected;
    localPatches=@('windows-named-pipe','windows-atomic-report','toolkit-run-directory');hostFiles=[ordered]@{};payloadFiles=[ordered]@{}}
$taskHost=Join-Path $PSScriptRoot 'integrations/kaihen/host'
foreach($taskPair in @(@($taskHost,'hostFiles'),@($taskPayload,'payloadFiles'))) {
    $taskBase=$taskPair[0]
    Get-ChildItem -LiteralPath $taskBase -Recurse -File | Sort-Object FullName | ForEach-Object {
        $taskRelative=$_.FullName.Substring($taskBase.Length+1).Replace('\','/')
        if($taskRelative -match '(^|/)(runs|dumps|\.git)(/|$)'){throw 'Arquivo de sessão encontrado na fonte de distribuição.'}
        $taskManifest[$taskPair[1]][$taskRelative]=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'integrations/kaihen/runtime-manifest.json'),($taskManifest|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
Write-Output 'kaiHEN, hbmenu e OunceShell conferidos para empacotamento.'
