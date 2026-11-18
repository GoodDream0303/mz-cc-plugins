# Call from a PowerShell profile to register new Windows Terminal tabs.
if ($Host.Name -ne 'ConsoleHost') { return }
$scopeSession = [guid]::Empty
if (-not [guid]::TryParse($env:WT_SESSION, [ref]$scopeSession)) { return }
if ($env:AI_CHAT_SCOPE_TERMINAL_SESSION -eq $scopeSession -and $env:AI_CHAT_SCOPE_TERMINAL_TAB) { return }

# A new Terminal tab can inherit environment variables from an older tab.
[Environment]::SetEnvironmentVariable('AI_CHAT_SCOPE_TERMINAL_TAB', $null, 'Process')
[Environment]::SetEnvironmentVariable('AI_CHAT_SCOPE_TERMINAL_SESSION', $null, 'Process')
$scopeProbe = Join-Path (Split-Path -Parent $PSScriptRoot) 'src\terminal_tabs.py'
$scopePython = Get-Command python.exe, py.exe -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
if (-not $scopePython -or -not (Test-Path -LiteralPath $scopeProbe -PathType Leaf)) { return }
$scopeArgs = @()
if ($scopePython.Name -eq 'py.exe') { $scopeArgs += '-3' }

$scopeConsole = $Host.UI.RawUI
$scopeOriginalTitle = $scopeConsole.WindowTitle
$scopeMarker = '[ACS:' + $scopeSession.ToString('N').Substring(0, 8) + ']'
$scopeIdentity = $null
try {
    $scopeConsole.WindowTitle = "$scopeOriginalTitle $scopeMarker"
    $scopeIdentity = & $scopePython.Source @scopeArgs -I -B $scopeProbe $scopeMarker 2>$null
    if ($scopeIdentity -is [string] -and $scopeIdentity -match '^\d+(,-?\d+){1,16}$') {
        $env:AI_CHAT_SCOPE_TERMINAL_SESSION = $scopeSession.ToString()
        $env:AI_CHAT_SCOPE_TERMINAL_TAB = $scopeIdentity
    }
} catch {
    # Accessibility can be unavailable at startup. Keep the shell usable.
} finally {
    if (-not $env:AI_CHAT_SCOPE_TERMINAL_TAB) {
        $scopeConsole.WindowTitle = $scopeOriginalTitle
    }
}
