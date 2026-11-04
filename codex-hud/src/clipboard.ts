import {execFileSync} from 'node:child_process';
export function copyHudText(text:string):void {
 if(!text)return;
 execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; [Console]::InputEncoding=New-Object System.Text.UTF8Encoding($false); Set-Clipboard -Value ([Console]::In.ReadToEnd())"],{input:text,encoding:'utf8',windowsHide:true,timeout:5000,maxBuffer:4096,stdio:['pipe','ignore','pipe']});
}
