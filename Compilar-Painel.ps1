param([string]$OutputFolder)
$ErrorActionPreference = 'Stop'
if (!$OutputFolder) { $OutputFolder = $PSScriptRoot }
if (!(Test-Path -LiteralPath $OutputFolder -PathType Container)) { throw 'Pasta de saida inexistente.' }
$source = ''
foreach ($name in @('Painel-NS2.cs', 'Painel-Backup.cs', 'Painel-Nup.cs', 'Painel-Entry.cs')) {
    $source += Get-Content -LiteralPath (Join-Path $PSScriptRoot $name) -Raw -Encoding UTF8
    $source += "`n"
}
$compiled = Join-Path $OutputFolder ('NS2-' + [guid]::NewGuid().ToString('N') + '.exe')
Add-Type -TypeDefinition $source -OutputAssembly $compiled -OutputType WindowsApplication -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Web.Extensions
Move-Item -LiteralPath $compiled -Destination (Join-Path $OutputFolder 'NS2 Assistente.exe') -Force
