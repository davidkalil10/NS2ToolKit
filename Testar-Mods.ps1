param(
    [Parameter(Mandatory=$true)][string]$Package,
    [Parameter(Mandatory=$true)][string]$Nup,
    [Parameter(Mandatory=$true)][string]$OutputRoot,
    [string]$Screenshot
)
# Exercises only local preparation and UI state. Never invokes Install.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms,System.Drawing,System.Web.Extensions
[Windows.Forms.Application]::EnableVisualStyles()
[Windows.Forms.Application]::SetCompatibleTextRenderingDefault($false)
$taskAssembly = [Reflection.Assembly]::LoadFrom((Join-Path $Package 'NS2 Mods GBA.exe'))
$taskType = $taskAssembly.GetType('NS2Mods.ModsWindow')
$taskWindow = [Activator]::CreateInstance($taskType,@($Package,[bool]$true))
$taskFlags = [Reflection.BindingFlags]'Instance,NonPublic'
function TaskField([string]$Name) { $taskType.GetField($Name,$taskFlags).GetValue($taskWindow) }
function TaskSet([string]$Name,$Value) { $taskType.GetField($Name,$taskFlags).SetValue($taskWindow,$Value) }
function TaskRun([string]$Kind,[string]$Arguments) {
    $taskType.GetMethod('Begin',$taskFlags).Invoke($taskWindow,@($Kind,$Arguments)) | Out-Null
    $taskWatch = [Diagnostics.Stopwatch]::StartNew()
    while ($null -ne (TaskField 'worker')) {
        [Windows.Forms.Application]::DoEvents()
        Start-Sleep -Milliseconds 20
        if ($taskWatch.Elapsed.TotalSeconds -gt 30) { throw 'A operação local da interface excedeu o prazo do teste.' }
    }
}
try {
    $taskWindow.ShowInTaskbar = $false
    $taskWindow.StartPosition = [Windows.Forms.FormStartPosition]::Manual
    $taskWindow.Location = New-Object Drawing.Point(-20000,-20000)
    $taskWindow.Show();[Windows.Forms.Application]::DoEvents()
    (TaskField 'source').Text = $Nup
    (TaskField 'destination').Text = $OutputRoot
    TaskRun 'prepare' ([NS2Panel.Checks]::QuoteArgument($Nup)+' '+[NS2Panel.Checks]::QuoteArgument($OutputRoot))
    $taskJob = TaskField 'job'
    if (-not $taskJob -or (TaskField 'failed') -or -not (Test-Path -LiteralPath (Join-Path $taskJob 'mod.json'))) { throw 'A janela não recebeu a preparação local concluída.' }
    if ((TaskField 'install').Enabled) { throw 'Ativação disponível sem conexão.' }
    $taskSession = [Activator]::CreateInstance($taskAssembly.GetType('NS2Mods.SessionChoice'))
    $taskSession.Name = 'somente-simulacao'; $taskSession.Path = Join-Path $Package 'sessao-inexistente-de-teste'
    (TaskField 'sessions').Items.Add($taskSession) | Out-Null
    (TaskField 'sessions').SelectedIndex = 0
    if ((TaskField 'install').Enabled) { throw 'Ativação disponível sem confirmação do perfil.' }
    (TaskField 'profile').Checked = $true
    if (-not (TaskField 'install').Enabled) { throw 'O plano pronto e a seleção simulada não habilitam a ação.' }
    if ($Screenshot) { $taskWindow.Render($Screenshot) }
    # Check refusal and recovery without writing real user preferences.
    TaskSet 'job' $null
    TaskRun 'prepare' ([NS2Panel.Checks]::QuoteArgument((Join-Path $Package 'nao-existe.nup'))+' '+[NS2Panel.Checks]::QuoteArgument($OutputRoot))
    if (-not (TaskField 'failed') -or -not (TaskField 'prepare').Enabled -or (TaskField 'install').Enabled) { throw 'A recusa local deixou a janela em um estado incorreto.' }
    if ((TaskField 'status').Text -notmatch '\.nup') { throw 'A causa original da recusa não foi preservada.' }
    Write-Output ('Interface validada sem console. Preparação: '+$taskJob)
} finally {
    if ($null -eq (TaskField 'worker')) { $taskWindow.Close();$taskWindow.Dispose() }
}
