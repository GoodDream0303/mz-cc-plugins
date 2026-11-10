param([Parameter(Mandatory=$true)][ValidateRange(1,65535)][int]$ListenPort)
$ErrorActionPreference = 'Stop'
$owners = @(Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $ListenPort -State Listen | Select-Object -ExpandProperty OwningProcess -Unique)
if ($owners.Count -ne 1 -or $owners[0] -le 0) { throw 'The loopback listener owner is unavailable or ambiguous' }
[Console]::Out.Write([string]$owners[0])
