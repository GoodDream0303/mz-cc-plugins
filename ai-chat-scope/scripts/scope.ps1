param(
    [switch]$Setup,
    [switch]$Check,
    [switch]$Hook,
    [string]$CodexEndpoint,
    [string]$CodexTokenFile
)

# ASCII source keeps Windows PowerShell 5.1 compatible with UTF-8 without BOM.
$ErrorActionPreference = 'Stop'
if ($Hook -and -not ($env:PLUGIN_ROOT -or $env:CLAUDE_PLUGIN_ROOT)) {
    '{}'
    exit 0
}
if (($Setup -and $Check) -or ($Hook -and ($Setup -or $Check))) {
    [Console]::Error.WriteLine('Choose one of -Setup, -Check or -Hook.')
    exit 2
}

$scopePython = $null
$scopePrefix = @()
$scopeProbe = 'import sys; assert sys.version_info >= (3,9)'
if (-not $Hook) { $scopeProbe += '; import tkinter' }
foreach ($scopeCandidate in @('python.exe', 'py.exe', 'python3.exe')) {
    $scopeCommand = Get-Command $scopeCandidate -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $scopeCommand) { continue }
    $scopeArguments = @()
    if ($scopeCandidate -eq 'py.exe') { $scopeArguments = @('-3') }
    try {
        & $scopeCommand.Source @scopeArguments -B -c $scopeProbe 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $scopePython = $scopeCommand.Source
            $scopePrefix = $scopeArguments
            break
        }
    } catch {
        # Try the next interpreter, including when python is a Store alias.
    }
}
if (-not $scopePython) {
    if ($Hook) { '{}'; exit 0 }
    [Console]::Error.WriteLine('AI Chat Scope requires Python 3.9+ with tkinter (Tcl/Tk). Install or repair Python, and enable python or py -3. No packages were installed.')
    exit 1
}

$scopeRoot = Split-Path -Parent $PSScriptRoot
try {
    if ($Hook) {
        & $scopePython @scopePrefix -B (Join-Path $scopeRoot 'src\codex_hooks.py') 2>$null
        if ($LASTEXITCODE -ne 0) { '{}' }
        exit 0
    }
    $scopeArguments = @('-B', (Join-Path $PSScriptRoot 'start_scope.py'))
    if ($Setup) { $scopeArguments += '--setup' }
    if ($Check) { $scopeArguments += '--check' }
    if ($CodexEndpoint) { $scopeArguments += @('--codex-endpoint', $CodexEndpoint) }
    if ($CodexTokenFile) { $scopeArguments += @('--codex-token-file', $CodexTokenFile) }
    & $scopePython @scopePrefix @scopeArguments
    exit $LASTEXITCODE
} catch {
    if ($Hook) { '{}'; exit 0 }
    [Console]::Error.WriteLine('AI Chat Scope could not run. Check the selected Python installation and plugin files.')
    exit 1
}
