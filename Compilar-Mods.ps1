param([Parameter(Mandatory=$true)][string]$OutputFolder)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $OutputFolder -PathType Container)) { throw 'Pasta de saída inexistente.' }
$taskSource = ''
foreach ($taskName in @('Painel-NS2.cs','Painel-Backup.cs','Painel-Nup.cs','Painel-Restore.cs','Painel-Ftp.cs','Painel-Kaihen.cs','Painel-Mods.cs')) {
    $taskSource += [IO.File]::ReadAllText((Join-Path $PSScriptRoot $taskName)) + "`n"
}
$taskTemporary = Join-Path $OutputFolder ('NS2-Mods-' + [guid]::NewGuid().ToString('N') + '.exe')
Add-Type -TypeDefinition $taskSource -OutputAssembly $taskTemporary -OutputType WindowsApplication -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Web.Extensions
Move-Item -LiteralPath $taskTemporary -Destination (Join-Path $OutputFolder 'NS2 Mods GBA.exe') -Force
