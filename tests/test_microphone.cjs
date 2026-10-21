const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('static/js/interview_coach.js','utf8');
const fragment = source.slice(source.indexOf('  var microphonePermission ='), source.indexOf('  function listen(attempt)'));
function setup({allowed=true, granted=true}={}) {
  const elements = {'listen':{},'voice-status':{}};
  const spoken = []; let engine;
  class Recognition { constructor(){ engine=this; } start(){ this.onstart(); } }
  const context=vm.createContext({Recognition, isListening:false,voiceFirst:true,document:{permissionsPolicy:{allowsFeature:()=>allowed}},$:(id)=>elements[id],say:t=>spoken.push(t),requestMicrophonePermission:async()=>granted});
  vm.runInContext(fragment, context);
  return {context,elements,spoken,get engine(){return engine;}};
}
(async()=>{
  let t=setup({allowed:false}), silence=0;
  await t.context.recognize(()=>{},null,()=>silence++);
  assert.match(t.spoken[0],/blocking microphone/); assert.equal(t.engine,undefined);
  t=setup({granted:false}); await t.context.recognize(()=>{},null,()=>silence++);
  assert.match(t.spoken[0],/Microphone access is blocked/);
  t=setup(); await t.context.recognize(()=>{},null,()=>silence++);
  t.engine.onerror({error:'network'}); t.engine.onend();
  assert.match(t.spoken[0],/connection problem/); assert.equal(silence,0);
  t=setup(); let answer=''; await t.context.recognize(text=>answer=text,null,()=>silence++);
  assert.equal(t.engine.lang,'en-IN');
  t.engine.onresult({results:[[{transcript:'I test keyboard navigation'}]]});
  assert.equal(answer,''); t.engine.onend();
  assert.equal(answer,'I test keyboard navigation'); assert.equal(silence,0);
  t=setup(); await t.context.recognize(()=>{},null,()=>silence++);
  t.engine.onerror({error:'no-speech'}); t.engine.onend(); assert.equal(silence,1);
  console.log('Microphone tests passed: policy, permission, network, speech, true silence.');
})().catch(error=>{console.error(error);process.exitCode=1;});
