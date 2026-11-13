/** Windows WMI proofs retain microseconds; Date.parse alone loses that identity. */
export function processBirthMicros(value:string):bigint|undefined {
 const match=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,7}))?Z$/.exec(value);
 if(!match||match[1]<'1601-01-01T00:00:00')return;
 const milliseconds=Date.parse(match[1]+'Z');
 if(!Number.isFinite(milliseconds)||new Date(milliseconds).toISOString().slice(0,19)!==match[1])return;
 return BigInt(milliseconds)*1000n+11644473600000000n+BigInt((match[2]??'').padEnd(6,'0').slice(0,6));
}

export function sameProcessBirth(actual:string,expected:string):boolean {
 const birth=processBirthMicros(actual);
 return birth!==undefined&&birth===processBirthMicros(expected);
}
