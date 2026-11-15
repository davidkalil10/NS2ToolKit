param([string]$OutputRoot = (Join-Path $PSScriptRoot 'dist'), [string]$PythonModules = (Join-Path $PSScriptRoot '.runtime/nup-python'))
$ErrorActionPreference = 'Stop'
$taskLoader = Join-Path $PSScriptRoot '.runtime/ns2jb-modloader-review'
$taskCache = Join-Path $PSScriptRoot '.runtime/portable-cache'
foreach ($taskRequired in @((Join-Path $taskLoader 'install.cjs'),(Join-Path $taskCache 'node.exe'),(Join-Path $taskCache 'python-3.13.4-embed-amd64.zip'),(Join-Path $PythonModules 'zstandard'))) {
    if (-not (Test-Path -LiteralPath $taskRequired)) { throw "Dependência local ausente: $taskRequired" }
}
New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null
$taskPackage = Join-Path $OutputRoot ('NS2-Mods-GBA-0.1.0-teste-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,6))
New-Item -ItemType Directory -Path $taskPackage | Out-Null
foreach ($taskName in @('painel-mods.cjs','painel-mod-preparar.py','painel_names.py','painel-progress.cjs','painel-session.cjs','painel-recovery.cjs','painel-ftp-storage.cjs','painel-ftp-overwrite.cjs','rpc.cjs','THIRD_PARTY_NOTICES.md','README.md','Painel-NS2.cs','Painel-Backup.cs','Painel-Nup.cs','Painel-Restore.cs','Painel-Ftp.cs','Painel-Kaihen.cs','Painel-Mods.cs','Compilar-Mods.ps1','Empacotar-Mods.ps1','Testar-Mods.ps1')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $taskName) -Destination $taskPackage
}
foreach ($taskDir in @('loader','tools/mod-teste','tools/OunceCake','tools/nup/tools','engine/shared','runtime/node','runtime/python','docs')) { New-Item -ItemType Directory -Path (Join-Path $taskPackage $taskDir) -Force | Out-Null }
Get-ChildItem -LiteralPath $taskLoader -Force | Where-Object { $_.Name -notin @('.git','logs','state') } | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $taskPackage 'loader') -Recurse }
Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'tools/OunceCake') -Force | Where-Object { $_.Name -ne '.git' } | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $taskPackage 'tools/OunceCake') -Recurse }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'tools/nup/tools/nup') -Destination (Join-Path $taskPackage 'tools/nup/tools') -Recurse -Exclude '__pycache__','*.pyc'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'tools/nup/LICENSE'),(Join-Path $PSScriptRoot 'tools/nup/SPEC.md') -Destination (Join-Path $taskPackage 'tools/nup')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'engine/shared/atomic-file.cjs') -Destination (Join-Path $taskPackage 'engine/shared')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'tools/mod-teste/patch-loader.cjs') -Destination (Join-Path $taskPackage 'tools/mod-teste')
Copy-Item -LiteralPath (Join-Path $taskCache 'node.exe') -Destination (Join-Path $taskPackage 'runtime/node/node.exe')
Copy-Item -LiteralPath (Join-Path $taskCache 'NODE-LICENSE.txt') -Destination (Join-Path $taskPackage 'runtime/node/LICENSE.txt')
Expand-Archive -LiteralPath (Join-Path $taskCache 'python-3.13.4-embed-amd64.zip') -DestinationPath (Join-Path $taskPackage 'runtime/python')
@('python313.zip','.', '..\..') | Set-Content -LiteralPath (Join-Path $taskPackage 'runtime/python/python313._pth') -Encoding ASCII
Copy-Item -LiteralPath (Join-Path $PythonModules 'zstandard'),(Join-Path $PythonModules 'zstandard-0.25.0.dist-info') -Destination (Join-Path $taskPackage 'runtime/python') -Recurse
& (Join-Path $taskPackage 'runtime/python/python.exe') -c "import zstandard, sys; assert zstandard.__version__ == '0.25.0'; assert sys.version_info[:3] == (3,13,4); zstandard.ZstdDecompressor()"
if ($LASTEXITCODE -ne 0) { throw 'O Python/compressor incluído não passou na verificação.' }
$taskNode = Join-Path $taskPackage 'runtime/node/node.exe'
& $taskNode (Join-Path $PSScriptRoot 'tools/mod-teste/patch-loader.cjs') (Join-Path $taskPackage 'loader')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar a compatibilidade Windows do loader.' }
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Compilar-Mods.ps1') -OutputFolder $taskPackage
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar a interface.' }
$taskRoots = @($PSScriptRoot)
$taskReleases = 'D:\Games\NS2ToolKit-releases'
if (Test-Path -LiteralPath $taskReleases) { $taskRoots += @(Get-ChildItem -LiteralPath $taskReleases -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'runs') } | ForEach-Object { $_.FullName }) }
[IO.File]::WriteAllText((Join-Path $taskPackage 'mods-config.json'),(@{assistantRoots=$taskRoots} | ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'docs/MODS-GBA.md')) {
    $taskReadme = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'docs/MODS-GBA.md')).Replace('(../README.md)','(README.md)').Replace('(../THIRD_PARTY_NOTICES.md)','(THIRD_PARTY_NOTICES.md)')
    [IO.File]::WriteAllText((Join-Path $taskPackage 'LEIA-ME.md'),$taskReadme,[Text.UTF8Encoding]::new($false))
}
Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'docs') -Filter '*.md' -File | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $taskPackage 'docs') }
$taskFiles = [ordered]@{}
Get-ChildItem -LiteralPath $taskPackage -Recurse -File | Where-Object { $_.FullName -notmatch '[\\/]__pycache__[\\/]|\.pyc$' } | Sort-Object FullName | ForEach-Object {
    $taskRelative = $_.FullName.Substring($taskPackage.Length+1).Replace('\','/')
    $taskFiles[$taskRelative] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
}
$taskManifest = [ordered]@{version='0.1.0-teste';loaderRevision='9395c91e9f5bb6c01df242fdbf7db194cf94b3c6';patch='remote-posix-paths-v1';newGuiHardwareTested=$false;files=$taskFiles}
[IO.File]::WriteAllText((Join-Path $taskPackage 'mods-runtime.json'),($taskManifest | ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
& $taskNode -e "require(process.argv[1]).verifyRuntime(process.argv[2]).then(()=>console.log('Runtime portatil conferido.')).catch(e=>{console.error(e);process.exitCode=1;})" (Join-Path $taskPackage 'painel-mods.cjs') $taskPackage
if ($LASTEXITCODE -ne 0) { throw 'A conferência do pacote falhou.' }
Write-Output ('Pacote: '+$taskPackage)
