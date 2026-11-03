param([Parameter(Mandatory=$true)][int]$RootPid,[string]$Ids='')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$hudTable=@{}
Get-CimInstance -Query 'SELECT ProcessId,ParentProcessId,Name,CreationDate FROM Win32_Process' | ForEach-Object { $hudTable[[int]$_.ProcessId]=$_ }
$hudSelected=@{}
$hudRequired=@{}
$hudRequired[$RootPid]=$true
$hudCurrent=$RootPid
for($hudLevel=0;$hudLevel -lt 64 -and $hudTable.ContainsKey($hudCurrent) -and -not $hudSelected.ContainsKey($hudCurrent);$hudLevel++){
 $hudItem=$hudTable[$hudCurrent]
 $hudSelected[$hudCurrent]=$hudItem
 $hudCurrent=[int]$hudItem.ParentProcessId
}
foreach($hudId in ($Ids -split ',')){
 if($hudId -and $hudId -notmatch '^[1-9][0-9]*$'){throw 'Invalid requested process ID'}
 if($hudId){$hudRequired[[int]$hudId]=$true;if($hudTable.ContainsKey([int]$hudId)){$hudSelected[[int]$hudId]=$hudTable[[int]$hudId]}}
}
$hudResult=@(foreach($hudItem in $hudSelected.Values){
 if($null -ne $hudItem.CreationDate){
  @{pid=[int]$hudItem.ProcessId;parentPid=[int]$hudItem.ParentProcessId;name=[string]$hudItem.Name;startedAt=$hudItem.CreationDate.ToUniversalTime().ToString('O')}
 } elseif($hudRequired.ContainsKey([int]$hudItem.ProcessId)){throw 'A requested live process has an unknown creation time'}
})
ConvertTo-Json -InputObject $hudResult -Compress
