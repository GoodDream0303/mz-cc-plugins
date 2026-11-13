import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../dist/process-birth.js').catch(()=>({}));

test('equivalent UTC creation times compare at the existing microsecond precision',()=>{
 assert.equal(typeof api.sameProcessBirth,'function','precise process-birth comparison is missing');
 for(const [a,b] of [
  ['2026-11-13T08:00:00.123Z','2026-11-13T08:00:00.1230000Z'],
  ['2026-11-13T08:00:00.123456Z','2026-11-13T08:00:00.1234560Z'],
  ['2026-11-13T08:00:00.1234560Z','2026-11-13T08:00:00.1234569Z'],
  ['2026-11-13T08:00:00Z','2026-11-13T08:00:00.0000000Z']
 ])assert.equal(api.sameProcessBirth(a,b),true,[a,b].join(' / '));
});

test('a different process birth inside the same millisecond never compares equal',()=>{
 assert.equal(typeof api.sameProcessBirth,'function','precise process-birth comparison is missing');
 for(const [a,b] of [
  ['2026-11-13T08:00:00.1234560Z','2026-11-13T08:00:00.1234570Z'],
  ['2026-11-13T08:00:00.0009999Z','2026-11-13T08:00:00.0010000Z'],
  ['2026-11-13T08:00:00.9999999Z','2026-11-13T08:00:01.0000000Z']
 ])assert.equal(api.sameProcessBirth(a,b),false,[a,b].join(' / '));
});

test('invalid or non-UTC process births never authorize an identity match',()=>{
 assert.equal(typeof api.sameProcessBirth,'function','precise process-birth comparison is missing');
 for(const invalid of ['', 'not-a-date', '2026-02-30T08:00:00.123Z','2026-11-13T08:00:00.12345678Z','2026-11-13T08:00:00+00:00','2026-11-13T08:00:60Z','2026-11-13 08:00:00Z'])
  assert.equal(api.sameProcessBirth(invalid,invalid),false,invalid);
});

test('native scope conversion preserves microseconds using the Windows epoch',()=>{
 assert.equal(typeof api.processBirthMicros,'function','native birth conversion is missing');
 assert.equal(api.processBirthMicros('1601-01-01T00:00:00.0000000Z'),0n);
 assert.equal(api.processBirthMicros('1970-01-01T00:00:00.0000019Z'),11644473600000001n);
 assert.equal(api.processBirthMicros('2026-02-30T08:00:00.123Z'),undefined);
});
