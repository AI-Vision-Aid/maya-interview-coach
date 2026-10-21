const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('static/js/interview_coach.js', 'utf8');
const queue = source.slice(source.indexOf('  var speechTurn ='), source.indexOf('  function sayOne('));
const clips = [];
const context = vm.createContext({stopCoachAudio() {}, sayOne(text, done) { clips.push({text, done}); }});
vm.runInContext(queue, context);
const text = Array.from({length:400}, (_,i) => `word${i}`).join(' ');
let complete = 0;
context.say(text, () => complete++);
assert.equal(clips.length, 1);
for (let i = 0; i < clips.length; i++) {
  assert.ok(clips[i].text.length <= 750);
  clips[i].done();
}
assert.equal(clips.map(c => c.text).join(' '), text);
assert.equal(complete, 1);
clips.length = 0;
context.say(text, () => complete++);
context.say('Replacement message.', () => complete++);
clips[0].done();
assert.equal(clips.length, 2, 'cancelled speech must not enqueue additional chunks');
clips[1].done();
assert.equal(complete, 2, 'only the replacement completion fires');
console.log('Audio queue: preserves all words, stays under provider limit, serial playback, cancellation passed.');
