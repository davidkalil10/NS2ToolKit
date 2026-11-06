param([switch]$Offline)
$ErrorActionPreference = 'Stop'
# Build machine only: Git, Windows PowerShell and the already installed zstandard
# wheel are required. The output has no Git/Python/Node installation dependency.
$cache = Join-Path $PSScriptRoot '.runtime\portable-cache'
New-Item -ItemType Directory -Path $cache -Force | Out-Null
function Get-PinnedFile($Name, $Uri, $Hash) {
    $file = Join-Path $cache $Name
    if (!(Test-Path -LiteralPath $file)) {
        if ($Offline) { throw "Arquivo ausente no cache: $Name" }
        Invoke-WebRequest -Uri $Uri -OutFile $file
    }
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $Hash) { throw "Hash divergente: $Name" }
    return $file
}
$python = Get-PinnedFile 'python-3.13.4-embed-amd64.zip' 'https://www.python.org/ftp/python/3.13.4/python-3.13.4-embed-amd64.zip' '514ca14ec356ecb7749a7c0a1ef1eac9fd9c67d57af4812cb1f0822b0d3a85e8'
$node = Get-PinnedFile 'node.exe' 'https://nodejs.org/dist/v22.16.0/win-x64/node.exe' 'c5ff4c736112dd483c750fd4149d30c8a116db1a49b8b3ec88be4b65e6c86c19'
$nodeLicense = Get-PinnedFile 'NODE-LICENSE.txt' 'https://raw.githubusercontent.com/nodejs/node/v22.16.0/LICENSE' '1ae62e2015784ba438db7b04ebd33f3c4ff3efdb824c111c4ececd99945fd52d'
$zstd = Join-Path $PSScriptRoot '.runtime\nup-python\zstandard'
if (!(Test-Path -LiteralPath $zstd)) { throw 'Prepare a dependência de build: python -m pip install --target .runtime/nup-python --only-binary=:all: --no-deps -r requirements-nup.txt' }
$version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'VERSION') -Raw).Trim()
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'VERSION invalida.' }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dist = Join-Path $PSScriptRoot 'dist'
$package = Join-Path $dist ("NS2ToolKit-v$version-portatil-win-x64-$stamp-" + [guid]::NewGuid().ToString('N').Substring(0,6))
New-Item -ItemType Directory -Path $package -Force | Out-Null
$files = @(& git -C $PSScriptRoot ls-files --recurse-submodules)
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível ler os arquivos versionados.' }
# Explicit new files also allow a local preview before committing the feature.
$files += @('Painel-Nup.cs', 'Empacotar-Portatil.ps1', 'Testar-Portatil.ps1', 'docs/PORTATIL.md')
foreach ($relative in ($files | Sort-Object -Unique)) {
    if ($relative -match '(^|/)(\.git|\.runtime|runtime|runs|dumps|backups|saves-backups|exports|dist)(/|$)') { throw "Arquivo privado na lista de publicação: $relative" }
    $source = Join-Path $PSScriptRoot $relative
    if (!(Test-Path -LiteralPath $source -PathType Leaf)) { throw "Arquivo necessário ausente: $relative. Confira os submódulos." }
    $target = Join-Path $package $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $target
}
foreach ($required in @('tools/OunceCake/ouncecake.cjs', 'tools/ns2-savekit/tools/lib/save-attr.cjs', 'tools/nup/tools/nup/nup/pack.py', 'engine/switch2/ro/payload/main', 'NS2 Assistente.exe')) {
    if (!(Test-Path -LiteralPath (Join-Path $package $required))) { throw "Dependência ausente: $required" }
}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Compilar-Painel.ps1') -OutputFolder $package
if ($LASTEXITCODE -ne 0) { throw 'Falha na compilacao do assistente.' }
$pythonDir = Join-Path $package 'runtime\python'
$nodeDir = Join-Path $package 'runtime\node'
New-Item -ItemType Directory -Path $pythonDir,$nodeDir -Force | Out-Null
Expand-Archive -LiteralPath $python -DestinationPath $pythonDir
# Isolated embedded interpreter: stdlib ZIP, its own extensions, and app source.
@('python313.zip', '.', '..\..') | Set-Content -LiteralPath (Join-Path $pythonDir 'python313._pth') -Encoding ASCII
Copy-Item -LiteralPath $zstd -Destination $pythonDir -Recurse
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '.runtime\nup-python\zstandard-0.25.0.dist-info') -Destination $pythonDir -Recurse
Copy-Item -LiteralPath $node -Destination (Join-Path $nodeDir 'node.exe')
Copy-Item -LiteralPath $nodeLicense -Destination (Join-Path $nodeDir 'LICENSE.txt')
$embedded = Join-Path $pythonDir 'python.exe'
& $embedded -c "import zstandard, sys; assert zstandard.__version__ == '0.25.0'; assert sys.version_info[:3] == (3,13,4); zstandard.ZstdCompressor().compress(b'portable')"
if ($LASTEXITCODE -ne 0) { throw 'Falha na validação do Python/compressor incluídos.' }
@{
    version = $version; built = (Get-Date -Format o); architecture = 'win-x64'; sourceCommit = (& git -C $PSScriptRoot rev-parse HEAD)
    sourceWorkingTreeModified = [bool](& git -C $PSScriptRoot status --porcelain)
    node = '22.16.0'; python = '3.13.4'; zstandard = '0.25.0'
    pythonArchiveSha256 = (Get-FileHash -LiteralPath $python).Hash
    nodeSha256 = (Get-FileHash -LiteralPath $node).Hash
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $package 'portable-build.json') -Encoding UTF8
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $package 'Testar-Portatil.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Pacote não passou na validação portátil. ZIP não gerado.' }
# Hash actual distribution bytes, including expanded dependencies (not Git blobs).
$releaseFiles = @(Get-ChildItem -LiteralPath $package -Recurse -File | Where-Object {
    $relative = $_.FullName.Substring($package.Length + 1).Replace('\','/')
    $relative -notmatch '(^|/)__pycache__/|\.pyc$|^exports/'
} | Sort-Object FullName)
$hashLines = $releaseFiles | ForEach-Object {
    (Get-FileHash -LiteralPath $_.FullName).Hash.ToLowerInvariant() + '  ' + $_.FullName.Substring($package.Length + 1).Replace('\','/')
}
$hashLines | Set-Content -LiteralPath (Join-Path $package 'PORTABLE-SHA256SUMS') -Encoding ASCII
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = $package + '.zip'
$archive = [System.IO.Compression.ZipFile]::Open($zip, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    $releaseFiles += Get-Item -LiteralPath (Join-Path $package 'PORTABLE-SHA256SUMS')
    foreach ($file in $releaseFiles) {
        $entry = (Split-Path -Leaf $package) + '/' + $file.FullName.Substring($package.Length + 1).Replace('\','/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $entry, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally { $archive.Dispose() }
$zipHash = (Get-FileHash -LiteralPath $zip).Hash.ToLowerInvariant()
($zipHash + '  ' + (Split-Path -Leaf $zip)) | Set-Content -LiteralPath ($zip + '.sha256') -Encoding ASCII
Write-Output "Pacote portátil: $package"
Write-Output "ZIP: $zip"
Write-Output "SHA256: $zipHash"
