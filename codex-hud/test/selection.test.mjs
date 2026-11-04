import test from 'node:test';import assert from 'node:assert/strict';
const api=await import('../dist/selection.js').catch(()=>({}));
function fixture(){assert.equal(typeof api.HudSelection,'function');const s=new api.HudSelection();s.frame(['alpha beta','第二行测试'],20,3);return s;}
test('drag selection survives mouse release and keeps the originally displayed frame',()=>{
 const s=fixture();s.feed('\x1b[<0;1;1M\x1b[<32;5;1M\x1b[<0;5;1m');assert.equal(s.active,true);assert.equal(s.text(),'alpha');assert.match(s.paint().join(''),/\x1b\[7m/);
 s.frame(['CHANGED'],20,3);assert.equal(s.text(),'alpha');assert.doesNotMatch(s.paint().join(''),/CHANGED/);
 s.clear();assert.equal(s.active,false);s.frame(['new frame'],20,3);assert.equal(s.text(),'');
});
test('selection accepts partial SGR events, reversed drags and wide character cells',()=>{
 const s=fixture();s.feed('\x1b[<0;6;2');s.feed('M\x1b[<32;1;2M\x1b[<0;1;2m');assert.equal(s.text(),'第二行');
});
test('a focus click does not leave a selection and a new click resumes a retained selection',()=>{
 const s=fixture();s.feed('\x1b[<0;1;1M\x1b[<0;1;1m');assert.equal(s.active,false);
 s.feed('\x1b[<0;1;1M\x1b[<32;5;1M\x1b[<0;5;1m');s.feed('\x1b[<0;2;1M\x1b[<0;2;1m');assert.equal(s.active,false);
});
test('multiline selection trims trailing cells without losing leading spaces and viewport resize cancels it',()=>{
 const s=fixture();s.frame(['  one  ',' two'],20,3);s.feed('\x1b[<0;1;1M\x1b[<32;4;2M\x1b[<0;4;2m');assert.equal(s.text(),'  one\n two');s.frame(['resize'],21,3);assert.equal(s.active,false);
});
test('SGR press survives every input split including bare Escape and Escape bracket',()=>{
 const press='\x1b[<0;1;1M';for(let i=1;i<press.length;i++){const s=fixture();s.feed(press.slice(0,i));s.feed(press.slice(i)+'\x1b[<32;5;1M\x1b[<0;5;1m');assert.equal(s.text(),'alpha','split at '+i);}
});
test('mouse release finalizes and paints the actual release endpoint',()=>{
 const s=fixture();s.feed('\x1b[<0;1;1M\x1b[<32;3;1M\x1b[<0;5;1m');assert.equal(s.text(),'alpha');assert.match(s.paint()[0],/\x1b\[7malpha\x1b\[27m/);
});
