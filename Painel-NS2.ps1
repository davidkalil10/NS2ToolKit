param(
    [switch]$SelfTest,
    [string]$PreviewPath,
    [switch]$BackupPreview,
    [switch]$SavesPreview,
    [switch]$NupPreview,
    [switch]$RestorePreview
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$source = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'Painel-NS2.cs') -Raw -Encoding UTF8
$source += Get-Content -LiteralPath (Join-Path $PSScriptRoot 'Painel-Backup.cs') -Raw -Encoding UTF8
$source += Get-Content -LiteralPath (Join-Path $PSScriptRoot 'Painel-Nup.cs') -Raw -Encoding UTF8
$source += Get-Content -LiteralPath (Join-Path $PSScriptRoot 'Painel-Restore.cs') -Raw -Encoding UTF8
Add-Type -TypeDefinition $source -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Web.Extensions
if ($SelfTest) {
    [NS2Panel.Checks]::Run($PSScriptRoot)
    exit
}
[System.Windows.Forms.Application]::EnableVisualStyles()
if ($RestorePreview) {
    $window = New-Object NS2Panel.RestoreWindow($PSScriptRoot, $PSScriptRoot)
} elseif ($NupPreview) {
    $window = New-Object NS2Panel.NupWindow($PSScriptRoot)
} elseif ($SavesPreview) {
    $window = New-Object NS2Panel.BackupWindow($PSScriptRoot, $PSScriptRoot, $true)
} elseif ($BackupPreview) {
    $window = New-Object NS2Panel.BackupWindow($PSScriptRoot, $PSScriptRoot)
} else {
    $window = New-Object NS2Panel.MainWindow($PSScriptRoot)
}
if ($PreviewPath) {
    $window.Show()
    [System.Windows.Forms.Application]::DoEvents()
    $bitmap = New-Object System.Drawing.Bitmap($window.Width, $window.Height)
    $window.DrawToBitmap($bitmap, (New-Object System.Drawing.Rectangle(0, 0, $window.Width, $window.Height)))
    $bitmap.Save($PreviewPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
    $window.Dispose()
} else {
    [System.Windows.Forms.Application]::Run($window)
}
