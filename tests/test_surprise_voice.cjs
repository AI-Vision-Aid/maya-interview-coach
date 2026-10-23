const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('static/js/interview_coach.js','utf8');
const fragment = source.slice(source.indexOf('  var regularQuestion ='),source.indexOf('  // One audio channel'));
const els = {}; const spoken=[]; let calls=0, resolveCall;
const regular={question:'Regular question',track:'DAT',number:2,total:11};
const context=vm.createContext({Promise,current:regular,voiceFirst:true,serverReady:true,sessionId:'test',evaluating:false,isListening:false,lastFeedback:null,
  $:id=>(els[id] ||= {}),say:(text,done)=>{spoken.push(text);done?.();},command(){},announceQuestion(){},
  callTool:()=>{calls++;return new Promise(r=>resolveCall=r);}});
vm.runInContext(fragment,context);
(async()=>{
  const first=context.surprise(); await context.surprise(); assert.equal(calls,1);
  resolveCall({available:true,question:'Fresh question',hint:'Hint'}); await first;
  assert.equal(context.current.bonus,true); assert.equal(context.current.number,2);
  context.backToPractice(); assert.equal(context.current,regular);
  const failed=context.surprise(); resolveCall({available:false,spoken_summary:'Unavailable; regular practice is saved.'}); await failed;
  assert.equal(context.current,regular); assert.equal(els.surprise.disabled,false);
  const cmd=source.slice(source.indexOf('  function command(attempt)'),source.indexOf('  function playWelcome('));
  let heard; let surpriseCalls=0,backCalls=0;
  Object.assign(context,{recognize:cb=>heard=cb,surprise:()=>surpriseCalls++,backToPractice:()=>backCalls++});
  vm.runInContext(cmd,context);
  context.command();heard('surprise me');assert.equal(surpriseCalls,1);
  context.command();heard('back to practice');assert.equal(backCalls,1);
  console.log('Bonus UI: duplicate prevention, position preservation, failure recovery and voice commands passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
