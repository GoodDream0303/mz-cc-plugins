param([Parameter(Mandatory=$true)][int]$RootPid,[string]$Ids='',[switch]$IdentitiesOnly)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
$hudTable=@{}
$hudSelected=@{}
$hudRequired=@{}
$hudRequired[$RootPid]=$true
foreach($hudId in ($Ids -split ',')){
 if($hudId -and $hudId -notmatch '^[1-9][0-9]*$'){throw 'Invalid requested process ID'}
 if($hudId){$hudRequired[[int]$hudId]=$true}
}
if($IdentitiesOnly){
 # Periodic liveness checks need exact identities, not an ancestry proof.
 $hudFilter=($hudRequired.Keys | ForEach-Object { "ProcessId=$_" }) -join ' OR '
 $hudSearcher=New-Object -TypeName System.Management.ManagementObjectSearcher -ArgumentList "SELECT ProcessId,ParentProcessId,Name,CreationDate FROM Win32_Process WHERE $hudFilter"
 $hudSnapshot=$null
 try {
  $hudSnapshot=$hudSearcher.Get()
  foreach($hudEntry in $hudSnapshot){
   try { $hudTable[[int]$hudEntry.ProcessId]=@{ProcessId=[int]$hudEntry.ProcessId;ParentProcessId=[int]$hudEntry.ParentProcessId;Name=[string]$hudEntry.Name;CreationDate=$hudEntry.CreationDate} }
   finally { $hudEntry.Dispose() }
  }
 } finally { if($null -ne $hudSnapshot){$hudSnapshot.Dispose()};$hudSearcher.Dispose() }
} else {
 Get-CimInstance -Query 'SELECT ProcessId,ParentProcessId,Name,CreationDate FROM Win32_Process' | ForEach-Object { $hudTable[[int]$_.ProcessId]=$_ }
}
$hudCurrent=$RootPid
for($hudLevel=0;-not $IdentitiesOnly -and $hudLevel -lt 64 -and $hudTable.ContainsKey($hudCurrent) -and -not $hudSelected.ContainsKey($hudCurrent);$hudLevel++){
 $hudItem=$hudTable[$hudCurrent]
 $hudSelected[$hudCurrent]=$hudItem
 $hudCurrent=[int]$hudItem.ParentProcessId
}
foreach($hudId in $hudRequired.Keys){
 if($hudTable.ContainsKey($hudId)){$hudSelected[$hudId]=$hudTable[$hudId]}
}
$hudResult=@(foreach($hudItem in $hudSelected.Values){
 if($null -ne $hudItem.CreationDate){
  $hudBirth=if($hudItem.CreationDate -is [string]){[System.Management.ManagementDateTimeConverter]::ToDateTime($hudItem.CreationDate).ToUniversalTime()}else{$hudItem.CreationDate.ToUniversalTime()}
  @{pid=[int]$hudItem.ProcessId;parentPid=[int]$hudItem.ParentProcessId;name=[string]$hudItem.Name;startedAt=$hudBirth.ToString('O')}
 } elseif($hudRequired.ContainsKey([int]$hudItem.ProcessId)){throw 'A requested live process has an unknown creation time'}
})
ConvertTo-Json -InputObject $hudResult -Compress
