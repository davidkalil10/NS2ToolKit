param([string]$OutputFolder)
$ErrorActionPreference = 'Stop'
if (!$OutputFolder) { $OutputFolder = $PSScriptRoot }
if (!(Test-Path -LiteralPath $OutputFolder -PathType Container)) { throw 'Pasta de saida inexistente.' }
$source = ''
foreach ($name in @('Painel-NS2.cs', 'Painel-Backup.cs', 'Painel-Nup.cs', 'Painel-Entry.cs')) {
    $source += Get-Content -LiteralPath (Join-Path $PSScriptRoot $name) -Raw -Encoding UTF8
    $source += "`n"
}
$version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'VERSION') -Raw).Trim()
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'VERSION invalida.' }
$attributes = "[assembly: System.Reflection.AssemblyVersion(`"$version.0`")]`n[assembly: System.Reflection.AssemblyFileVersion(`"$version.0`")]`n[assembly: System.Reflection.AssemblyProduct(`"NS2ToolKit`")]`n"
$source = $source.Insert($source.IndexOf('namespace NS2Panel {'), $attributes)
$compiled = Join-Path $OutputFolder ('NS2-' + [guid]::NewGuid().ToString('N') + '.exe')
Add-Type -TypeDefinition $source -OutputAssembly $compiled -OutputType WindowsApplication -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Web.Extensions
Move-Item -LiteralPath $compiled -Destination (Join-Path $OutputFolder 'NS2 Assistente.exe') -Force
