/* Voice-first MCP client for the Ability Fellows Interview Coach. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var voices = [], sessionId = null, mcpSessionId = null, rpcId = 0;
  var current = null, voiceFirst = true, serverReady = false;
  // One audio channel for Maya.  This prevents rapid taps or a slow network
  // response from leaving two versions of the coach speaking at once.
  var activeAudio = null, activeAudioUrl = null, activeAudioSource = null, playbackToken = 0;
  var coachAudioContext = null;
  var isLaunching = false, isListening = false;
  var fallbackTracks = {
    accessibility: { label: "Digital accessibility testing", qs: [
      {text: "How would you test whether a website works well with both a keyboard and a screen reader?", rubric: [["keyboard", "tab", "focus"], ["screen reader", "nvda", "jaws", "voiceover"], ["heading", "label", "semantic"], ["test", "user", "task"]]},
      {text: "When would you use ARIA, and when would you prefer native semantic HTML?", rubric: [["native", "semantic", "html"], ["aria", "role"], ["screen reader"], ["test", "keyboard"]]},
      {text: "A custom ARIA combobox works with a mouse but not with a keyboard. What would you check and fix?", rubric: [["keyboard", "arrow", "enter"], ["focus", "active descendant"], ["role", "listbox", "combobox"], ["screen reader", "test"]]}
    ]},
    fullstack: { label: "Full-stack development", qs: [{text: "A user says a page is slow. How would you begin investigating?", rubric: [["measure", "profile", "performance"], ["browser", "network"], ["database", "query", "server"], ["bottleneck", "test"]]}]},
    marketing: { label: "Digital marketing", qs: [{text: "How would you determine whether a campaign is reaching the right audience?", rubric: [["audience", "segment"], ["metric", "analytics", "data"], ["conversion", "goal"], ["test", "adjust", "optimize"]]}]}
  };
  var fallbackIndex = 0, fallbackScores = [];

  function loadVoices() {
    if (!("speechSynthesis" in window)) { return; }
    voices = speechSynthesis.getVoices();
    var select = $("voice-choice"); if (!select) { return; } select.innerHTML = "";
    if (!voices.length) { select.innerHTML = "<option>Browser voices are not available</option>"; return; }
    var aria = voices.find(function (v) { return /microsoft aria/i.test(v.name); });
    var indianFemale = voices.find(function (v) { return /^en-IN/i.test(v.lang) && /female|priya|heera/i.test(v.name); });
    var indian = voices.find(function (v) { return /^en-IN/i.test(v.lang) || /india|heera|priya/i.test(v.name); });
    var preferred = aria || indianFemale || indian || voices.find(function (v) { return /^en/i.test(v.lang); }) || voices[0];
    voices.forEach(function (v) { var option = document.createElement("option"); option.value = v.name; option.textContent = v.name + " (" + v.lang + ")"; option.selected = v.name === preferred.name; select.appendChild(option); });
    // Browser voices are retained only to select a recognition locale. Maya's
    // spoken coaching always uses the server-side Google Chirp voice.
  }
  if ("speechSynthesis" in window) { speechSynthesis.onvoiceschanged = loadVoices; loadVoices(); }
  function unlockCoachAudio() {
    var Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) { return; }
    if (!coachAudioContext) { coachAudioContext = new Context(); }
    // This is invoked synchronously by the Start button.  It preserves mobile
    // playback permission for Maya's later server-generated messages.
    if (coachAudioContext.state === "suspended") { coachAudioContext.resume(); }
    try {
      var buffer = coachAudioContext.createBuffer(1, 1, coachAudioContext.sampleRate);
      var source = coachAudioContext.createBufferSource(); source.buffer = buffer;
      source.connect(coachAudioContext.destination); source.start(0);
    } catch (_) { /* A normal audio element remains available as a fallback. */ }
  }
  function stopCoachAudio() {
    playbackToken += 1;
    if (activeAudio) { activeAudio.onended = null; activeAudio.onerror = null; activeAudio.pause(); activeAudio = null; }
    if (activeAudioSource) { activeAudioSource.onended = null; try { activeAudioSource.stop(); } catch (_) {} activeAudioSource = null; }
    if (activeAudioUrl) { URL.revokeObjectURL(activeAudioUrl); activeAudioUrl = null; }
  }
  function playCoachAudio(audio, url, done) {
    stopCoachAudio();
    var token = ++playbackToken;
    activeAudio = audio; activeAudioUrl = url || null;
    var finished = false;
    function finish() {
      if (finished || token !== playbackToken) { return; }
      finished = true; activeAudio = null;
      if (activeAudioUrl) { URL.revokeObjectURL(activeAudioUrl); activeAudioUrl = null; }
      if (done) { done(); }
    }
    audio.onended = finish;
    audio.onerror = function () { $("voice-status").textContent = "Maya's audio could not play. You can continue by typing."; finish(); };
    audio.play().catch(function () { $("voice-status").textContent = "Maya's audio could not start. You can continue by typing."; finish(); });
  }
  var speechTurn = 0;
  function say(text, done) {
    var turn = ++speechTurn, chunks = [], chunk = "";
    // The voice endpoint accepts 900 characters. Keep every word and play
    // chunks serially, rather than truncating longer coaching responses.
    String(text).split(/\s+/).forEach(function (word) {
      if (chunk.length + word.length + 1 > 750 && chunk) { chunks.push(chunk); chunk = ""; }
      chunk += (chunk ? " " : "") + word;
    });
    if (chunk) { chunks.push(chunk); }
    function deliver() {
      if (turn !== speechTurn) { return; }
      if (!chunks.length) { if (done) { done(); } return; }
      sayOne(chunks.shift(), deliver);
    }
    stopCoachAudio();
    deliver();
  }
  function sayOne(text, done) {
    // Every spoken coach message uses Google Chirp.  We deliberately do not
    // fall back to a device voice: a changed voice is confusing in a blind
    // user's interview flow.
    var requestToken = ++playbackToken;
    fetch("/api/interview-coach/voice", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({text: text})})
      .then(function (response) { if (!response.ok) { throw new Error("Server voice unavailable"); } return response.blob(); })
      .then(function (blob) {
        if (requestToken !== playbackToken) { return; }
        playCoachBlob(blob, requestToken, done);
      })
      .catch(function () { if (requestToken === playbackToken) { $("voice-status").textContent = "Maya's voice is temporarily unavailable. You can continue by typing."; if (done) { done(); } } });
  }
  function playCoachBlob(blob, requestToken, done) {
    if (!coachAudioContext) {
      var url = URL.createObjectURL(blob), audio = new Audio(url);
      playCoachAudio(audio, url, done); return;
    }
    blob.arrayBuffer().then(function (bytes) { return coachAudioContext.decodeAudioData(bytes); }).then(function (buffer) {
      if (requestToken !== playbackToken) { return; }
      stopCoachAudio();
      var token = ++playbackToken, source = coachAudioContext.createBufferSource(), finished = false;
      source.buffer = buffer; source.connect(coachAudioContext.destination); activeAudioSource = source;
      source.onended = function () {
        if (finished || token !== playbackToken) { return; }
        finished = true; activeAudioSource = null; if (done) { done(); }
      };
      source.start(0);
    }).catch(function () {
      if (requestToken === playbackToken) { $("voice-status").textContent = "Maya's voice could not play. You can continue by typing."; if (done) { done(); } }
    });
  }
  function serverStatus(text, ready) { $("coach-server-status").textContent = text; $("coach-server-status").classList.toggle("is-ready", !!ready); }
  function toolResult(result) {
    if (result && result.structuredContent) { return result.structuredContent; }
    var content = result && result.content && result.content[0];
    if (content && content.text) { try { return JSON.parse(content.text); } catch (_) { return {message: content.text}; } }
    return result || {};
  }
  async function mcp(method, params) {
    var headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25"};
    if (mcpSessionId) { headers["Mcp-Session-Id"] = mcpSessionId; }
    var payload = {jsonrpc: "2.0", method: method, params: params || {}};
    var notification = method.indexOf("notifications/") === 0;
    if (!notification) { payload.id = ++rpcId; }
    var response = await fetch("/mcp/", {method: "POST", headers: headers, body: JSON.stringify(payload)});
    if (!response.ok) { throw new Error("Coach server is unavailable."); }
    var returnedSession = response.headers.get("Mcp-Session-Id"); if (returnedSession) { mcpSessionId = returnedSession; }
    if (notification || response.status === 202 || response.status === 204) { return {}; }
    var json = await response.json(); if (json.error) { throw new Error(json.error.message || "Coach server could not complete the request."); }
    return json.result;
  }
  async function callTool(name, args) { return toolResult(await mcp("tools/call", {name: name, arguments: args})); }
  async function connectCoach() {
    try {
      await mcp("initialize", {protocolVersion: "2025-11-25", capabilities: {}, clientInfo: {name: "ability-bazaar-interview-coach", version: "1.0.0"}});
      await mcp("notifications/initialized", {});
      var tools = await mcp("tools/list", {});
      serverReady = !!(tools && tools.tools && tools.tools.length >= 7);
      serverStatus(serverReady ? "Connected to the Ability Fellows MCP coach server. Seven tools are available." : "Using offline practice feedback.", serverReady);
    } catch (_) { serverReady = false; serverStatus("Offline practice feedback is active. Your answers stay in this browser.", false); }
  }
  function selectedTrack() { return document.querySelector("input[name=track]:checked").value; }
  function announceQuestion(questionWasAlreadySpoken) {
    $("progress").textContent = "Question " + current.number + " of " + current.total;
    $("track-title").textContent = current.track; $("question").textContent = current.question; $("answer").value = "";
    $("feedback").hidden = true; $("retry").hidden = true; $("next").hidden = true; $("submit").hidden = false; $("question").focus();
    if (voiceFirst && !questionWasAlreadySpoken) { say("Question " + current.number + ". " + current.question + " I will listen after a short pause. You may say repeat question at any time.", function () { window.setTimeout(function () { listen(0); }, 350); }); }
    if (voiceFirst && questionWasAlreadySpoken) { $("voice-status").textContent = "Maya is listening now. Speak your answer when you are ready."; window.setTimeout(function () { listen(0); }, 350); }
  }
  function fallbackStart(trackId, questionWasAlreadySpoken) {
    var track = fallbackTracks[trackId]; fallbackIndex = 0; fallbackScores = [];
    current = {track: track.label, question: track.qs[0].text, number: 1, total: track.qs.length, fallback: true, rubric: track.qs[0].rubric}; announceQuestion(questionWasAlreadySpoken);
  }
  async function prepareVoiceSession() {
    if (!serverReady) { return null; }
    try {
      var start = await callTool("start_session", {track_id: selectedTrack()});
      sessionId = start.session_id;
      return start;
    } catch (_) {
      serverReady = false;
      serverStatus("Offline practice feedback is active. Your answers stay in this browser.", false);
      return null;
    }
  }
  async function begin(mode, preparedStart, questionWasAlreadySpoken) {
    voiceFirst = mode; $("start").hidden = true; $("summary-card").hidden = true; $("coach").hidden = false;
    if (preparedStart) { current = preparedStart; announceQuestion(questionWasAlreadySpoken); return; }
    if (serverReady) { try { var start = await callTool("start_session", {track_id: selectedTrack()}); sessionId = start.session_id; current = start; announceQuestion(questionWasAlreadySpoken); return; } catch (_) { serverReady = false; serverStatus("Offline practice feedback is active. Your answers stay in this browser.", false); } }
    fallbackStart(selectedTrack(), questionWasAlreadySpoken);
  }
  function offlineEvaluate(answer) {
    if (!current.rubric) {
      var matching = fallbackTracks[selectedTrack()].qs.find(function (q) { return q.text === current.question; });
      current.rubric = matching ? matching.rubric : [];
    }
    var lower = answer.toLowerCase(), hits = current.rubric.filter(function (group) { return group.some(function (word) { return lower.indexOf(word) !== -1; }); });
    var missing = current.rubric.filter(function (group) { return !group.some(function (word) { return lower.indexOf(word) !== -1; }); });
    var score = current.rubric.length ? Math.round(100 * hits.length / current.rubric.length) : 0; fallbackScores.push(score);
    var tips = {
      keyboard: "Describe a keyboard-only check: use Tab and Shift Tab to follow focus order, then Enter or Space to operate controls. Check visible focus and keyboard traps.",
      "screen reader": "Explain how you would use NVDA or another screen reader to check names, roles, headings and form errors.",
      heading: "Check headings and field labels so the page structure and each control's purpose are announced clearly.",
      test: "Walk through a real task such as submitting a form, document any barrier and retest the fix."
    };
    var strength = hits.length ? "Your answer mentions " + hits.length + " of the practice areas. That is a useful starting point, but naming topics alone does not show how you would do the work." : "Thank you for making a start. Your answer needs more detail about how you would carry out the work.";
    if (/automated|automation/i.test(answer) && missing.length) { strength = "An automated checker is a useful starting point, but it cannot replace hands-on keyboard and screen-reader testing."; }
    var nextStep = missing.length ? missing.slice(0,2).map(function (group) { return tips[group[0]] || "Explain how you would check " + group[0] + ", which technique you would use, and how you would verify the result with a concrete example."; }).join(" ") : "Make your answer more convincing with one concrete example: describe the situation, a barrier you found, the action you took and how you verified the fix.";
    var retry = "Would you like to try that answer again using this feedback? Say retry, or say next question to continue.";
    return {mode:"offline", coverage_percent: score, strength: strength, next_step: nextStep, retry_prompt: retry, spoken_summary: strength + " " + nextStep + " " + retry};
  }
  async function evaluate() {
    var answer = $("answer").value.trim(); if (!answer) { $("feedback").textContent = "Please give an answer before requesting feedback."; $("feedback").hidden = false; return; }
    var feedback;
    try { feedback = serverReady && sessionId ? await callTool("evaluate_answer", {session_id: sessionId, answer_text: answer, input_mode: voiceFirst ? "speech" : "typed"}) : offlineEvaluate(answer); }
    catch (_) { feedback = offlineEvaluate(answer); serverStatus("The AI coach is temporarily unavailable. Offline practice feedback is active.", false); }
    var detail = feedback.missing && feedback.missing.length ? " Missing areas: " + feedback.missing.slice(0, 2).join(" and ") + "." : "";
    var feedbackSource = feedback.mode === "bedrock" ? "AWS Bedrock coaching feedback" : "Hiring-style practice feedback";
    $("feedback").textContent = feedbackSource + ": " + feedback.coverage_percent + "% rubric coverage. " + feedback.strength + " " + feedback.next_step + detail + " " + (feedback.retry_prompt || "Try again using this feedback, or continue to the next question.");
    $("feedback").hidden = false; $("submit").hidden = true; $("retry").hidden = false; $("next").hidden = false; $("next").textContent = current.number === current.total ? "Finish practice" : "Next question";
    if (voiceFirst) { say((feedback.spoken_summary || (feedback.strength + " " + feedback.next_step)) + (feedback.retry_prompt ? "" : " Would you like to try again? Say retry or next question."), command); }
  }
  async function next() {
    if (serverReady && sessionId) { try { var reply = await callTool("next_question", {session_id: sessionId}); if (reply.complete) { finish(reply); } else { current = reply; announceQuestion(); } return; } catch (_) { serverReady = false; } }
    var track = fallbackTracks[selectedTrack()]; fallbackIndex += 1;
    if (fallbackIndex >= track.qs.length) { finish({questions_practiced: fallbackScores.length, best_coverage_percent: Math.max.apply(Math, fallbackScores.concat([0]))}); return; }
    current = {track: track.label, question: track.qs[fallbackIndex].text, number: fallbackIndex + 1, total: track.qs.length, fallback: true, rubric: track.qs[fallbackIndex].rubric}; announceQuestion();
  }
  function finish(summary) {
    $("coach").hidden = true; $("summary-card").hidden = false;
    var text = summary.spoken_summary || ("You completed " + summary.questions_practiced + " practice questions. Your best rubric coverage was " + summary.best_coverage_percent + " percent. Keep practicing concise answers with specific details.");
    $("summary").textContent = text; if (voiceFirst) { say(text); } sessionId = null;
  }
  function recognize(result, end, noSpeech) {
    if (!Recognition) { $("listen").disabled = true; $("voice-status").textContent = "Speech recognition is not available in this browser. You can type your answer instead."; if (voiceFirst) { say("This browser cannot capture speech here. You can type your answer, then select Get feedback."); } return; }
    if (isListening) { return; }
    var choice = $("voice-choice"), chosen = choice && voices.find(function (item) { return item.name === choice.value; });
    var recognizer = new Recognition(), heard = false;
    isListening = true;
    recognizer.lang = chosen && /^en-IN/i.test(chosen.lang) ? "en-IN" : "en-US"; recognizer.interimResults = false; recognizer.maxAlternatives = 1;
    recognizer.onstart = function () { $("listen").disabled = true; $("voice-status").textContent = "Maya is listening now. Speak your answer when you are ready."; };
    var transcript = "";
    recognizer.onresult = function (event) { heard = true; transcript = Array.from(event.results).map(function (item) { return item[0].transcript; }).join(" "); };
    recognizer.onerror = function (event) { $("voice-status").textContent = event.error === "not-allowed" ? "Microphone access was not granted. You can type instead." : "I could not hear that clearly. Please try again or type your answer."; };
    recognizer.onend = function () { isListening = false; $("listen").disabled = false; if (heard) { result(transcript); } else if (noSpeech) { noSpeech(); } if (end) { end(); } };
    try { recognizer.start(); } catch (_) { isListening = false; $("voice-status").textContent = "Could not start the microphone. Please type your answer instead."; $("listen").disabled = false; }
  }
  function listen(attempt) {
    recognize(function (text) {
      var spoken = text.toLowerCase();
      if (spoken.indexOf("repeat") !== -1) { announceQuestion(); return; }
      $("answer").value = text; $("voice-status").textContent = "I heard your answer. Maya is preparing feedback now."; evaluate();
    }, null, function () {
      if ((attempt || 0) < 1) { say("I did not hear an answer. Please share your answer now, or say repeat question.", function () { window.setTimeout(function () { listen(1); }, 350); }); }
      else { $("voice-status").textContent = "Maya did not hear an answer. Select Speak your answer to try again, or type your answer."; say("I still did not hear an answer. Please select Speak your answer to try again, or type your answer."); }
    });
  }
  async function requestMicrophonePermission() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $("voice-status").textContent = "This browser does not offer microphone access here. You can still type your answer.";
      return false;
    }
    try {
      var stream = await navigator.mediaDevices.getUserMedia({audio: true});
      stream.getTracks().forEach(function (track) { track.stop(); });
      $("voice-status").textContent = "Microphone access is ready. Maya will listen when you choose Speak your answer.";
      return true;
    } catch (_) {
      $("voice-status").textContent = "Microphone access was not granted. You can still continue with Maya by typing your answer.";
      return false;
    }
  }
  function command(attempt) { recognize(function (text) { var commandText = text.toLowerCase(); if (commandText.indexOf("retry") !== -1) { $("retry").click(); } else if (commandText.indexOf("next") !== -1 || commandText.indexOf("continue") !== -1) { next(); } else if (commandText.indexOf("more") !== -1 || commandText.indexOf("repeat") !== -1) { say($("feedback").textContent + " Say retry or next question.", function () { command(0); }); } else { say("I heard you. Please say retry, next question, repeat feedback, or more detail.", function () { command(0); }); } }, null, function () { if ((attempt || 0) < 1) { say("What would you like to do? Say retry, next question, repeat feedback, or more detail.", function () { command(1); }); } else { $("voice-status").textContent = "Choose Retry this answer or Next question, or select Speak your answer to give Maya a voice command."; } }); }
  function playWelcome(trackId, done) {
    // The welcome and first question are one tap-playable MP3.  On iPhone and
    // Android this avoids the autoplay boundary between the orientation and
    // the first question.
    var audio = new Audio("/api/interview-coach/welcome.mp3?track=" + encodeURIComponent(trackId) + "&v=3.5.15");
    audio.preload = "auto";
    playCoachAudio(audio, null, done);
  }
  $("begin").onclick = function () {
    if (isLaunching) { return; }
    isLaunching = true; $("begin").disabled = true; $("begin").setAttribute("aria-disabled", "true"); $("begin").textContent = "Starting Maya…";
    unlockCoachAudio();
    // Permission is helpful, but must never hold up the first spoken question.
    requestMicrophonePermission();
    var preparedSession = prepareVoiceSession();
    $("voice-status").textContent = "Maya is preparing your practice session.";
    playWelcome(selectedTrack(), function () { preparedSession.then(function (start) { begin(true, start, true); }).finally(function () { isLaunching = false; }); });
  }; $("begin-typing").onclick = function () { begin(false); }; $("listen").onclick = listen; $("submit").onclick = evaluate;
  $("retry").onclick = function () { $("answer").value = ""; $("answer").focus(); $("feedback").hidden = true; $("submit").hidden = false; $("retry").hidden = true; $("next").hidden = true; if (voiceFirst) { say("Let's try the same question again. " + current.question + " Use the feedback to add a concrete example. I will listen after a short pause.", function () { window.setTimeout(function () { listen(0); }, 350); }); } };
  $("next").onclick = next; $("again").onclick = function () { $("start").hidden = false; $("summary-card").hidden = true; current = null; $("begin").disabled = false; $("begin").removeAttribute("aria-disabled"); $("begin").textContent = "Start Maya voice practice"; };
  if (!Recognition) { $("listen").disabled = true; }
  connectCoach();
}());
