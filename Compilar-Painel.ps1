$ErrorActionPreference = 'Stop'
$source = ''
foreach ($name in @('Painel-NS2.cs', 'Painel-Backup.cs', 'Painel-Entry.cs')) {
    $source += Get-Content -LiteralPath (Join-Path $PSScriptRoot $name) -Raw -Encoding UTF8
    $source += "`n"
}
$compiled = Join-Path $PSScriptRoot ('NS2-' + [guid]::NewGuid().ToString('N') + '.exe')
Add-Type -TypeDefinition $source -OutputAssembly $compiled -OutputType WindowsApplication -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Web.Extensions
Move-Item -LiteralPath $compiled -Destination (Join-Path $PSScriptRoot 'NS2 Assistente.exe') -Force
