param([switch]$Offline)
$ErrorActionPreference='Stop'
# Build/maintenance only. Never contacts a console or changes an installed HEN.
if(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'integrations/kaihen/payload')){
    throw 'Execute a manutencao na pasta de fontes e gere um novo portatil. Nao atualize parcialmente um portatil ja extraido.'
}
. (Join-Path $PSScriptRoot 'Ler-Config-Kaihen.ps1')
$taskSetup=Read-KaihenConfiguration $PSScriptRoot
$taskNode=Join-Path $PSScriptRoot '.runtime/portable-cache/node.exe'
if(!(Test-Path -LiteralPath $taskNode)){$taskNode=(Get-Command node -ErrorAction Stop).Source}
# Verify/download the corresponding sources before writing a new runtime manifest.
& (Join-Path $PSScriptRoot 'Preparar-Fontes-Kaihen.ps1') -Offline:$Offline
& (Join-Path $PSScriptRoot 'Preparar-Kaihen.ps1') -Offline:$Offline
& $taskNode -e "require(process.argv[1]).verifyRuntime(process.argv[2]).then(x=>console.log('Pacote verificado: kaiHEN '+x.configuration.release)).catch(e=>{console.error(e.message);process.exitCode=1;})" (Join-Path $PSScriptRoot 'painel-kaihen.cjs') $PSScriptRoot
if($LASTEXITCODE -ne 0){throw 'O pacote atualizado nao passou na verificacao do aplicativo.'}
Push-Location $PSScriptRoot
try {
    & $taskNode --test kaihen-config.test.cjs painel-kaihen.test.cjs painel-kaihen-held.test.cjs
    if($LASTEXITCODE -ne 0){throw 'Os testes de configuracao e ativacao kaiHEN falharam.'}
} finally {Pop-Location}
Write-Output ('kaiHEN '+$taskSetup.config.release+' preparado no PC. Teste no console ainda necessario antes de publicar.')
