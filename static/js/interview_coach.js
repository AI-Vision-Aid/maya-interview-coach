/* Voice-first MCP client for the Ability Fellows Interview Coach. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var voices = [], sessionId = null, mcpSessionId = null, rpcId = 0;
  var current = null, voiceFirst = true, serverReady = false;
  var regularQuestion = null, bonusBusy = false;
  function spokenPromise(text) { return new Promise(function (resolve) { if (voiceFirst) { say(text, resolve); } else { resolve(); } }); }
  function bonusNotice(text) {
    $('voice-status').textContent = text;
    if (voiceFirst) { say(text, function () { command(0); }); }
  }
  async function surprise() {
    if (bonusBusy || evaluating || isListening) { return; }
    if (!serverReady || !sessionId) { bonusNotice('Bonus questions need a connection to Maya. Regular practice is still available.'); return; }
    bonusBusy = true; $('surprise').disabled = true;
    $('voice-status').textContent = 'Preparing an optional AI surprise question. Your regular place is saved.';
    try {
      var acknowledgement = spokenPromise('Let us try a surprise question. I am preparing one for your selected track.');
      var result = await callTool('surprise_question', {session_id:sessionId});
      await acknowledgement;
      if (!result.available) { bonusNotice(result.spoken_summary); return; }
      if (!regularQuestion) { regularQuestion = current; }
      current = {bonus:true, question:result.question, track:regularQuestion.track, number:regularQuestion.number, total:regularQuestion.total};
      lastFeedback = {hint:result.hint}; $('back-practice').hidden = false;
      announceQuestion();
    } catch (_) { bonusNotice('The surprise round could not connect. Say back to practice to continue your regular interview.'); }
    finally { bonusBusy = false; $('surprise').disabled = false; }
  }
  function backToPractice() {
    if (bonusBusy || evaluating) { return; }
    if (regularQuestion) { current = regularQuestion; regularQuestion = null; lastFeedback = null; }
    $('back-practice').hidden = true;
    announceQuestion();
  }
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
      serverStatus(serverReady ? "Maya is ready." : "Using offline practice feedback.", serverReady);
    } catch (_) { serverReady = false; serverStatus("Offline practice feedback is active. Your answers stay in this browser.", false); }
  }
  function selectedTrack() { return document.querySelector("input[name=track]:checked").value; }
  function announceQuestion(questionWasAlreadySpoken) {
    $("progress").textContent = current.bonus ? 'AI surprise round — regular practice is saved' : "Question " + current.number + " of " + current.total;
    $("track-title").textContent = current.track; $("question").textContent = current.question; $("answer").value = "";
    $("feedback").hidden = true; $("retry").hidden = true; $("next").hidden = true; $("submit").hidden = false; $("question").focus();
    if (voiceFirst && !questionWasAlreadySpoken) { say((current.bonus ? 'Surprise question. ' : "Question " + current.number + ". ") + current.question + " I will listen after a short pause. You may say repeat question at any time.", function () { window.setTimeout(function () { listen(0); }, 350); }); }
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
    return {mode:"offline", coverage_percent:0, covered:[], missing:[], strength:"The coach connection is unavailable, so I cannot evaluate this answer reliably.", next_step:"For self-practice, explain your approach, one example and how you verified the result.", spoken_summary:"The coach connection is unavailable. You can keep practising or retry the connection. Say next question to continue."};
  }
  var lastFeedback = null, evaluating = false;
  function help(kind) {
    if (bonusBusy || evaluating) { return; }
    var text = lastFeedback && lastFeedback[kind] || (kind === 'hint' ? 'Explain your method, the tools you use, and how you check the result.' : 'Describe a real task, the action you took, and what you verified. Use your own experience.');
    $('feedback').hidden = false; $('feedback').textContent = text; $('feedback').focus();
    if (voiceFirst) { say(text + ' You can now try your answer, or say skip.', function () { listen(0); }); }
  }
  async function evaluate() {
    if (evaluating || bonusBusy) { return; }
    var answer = $("answer").value.trim(); if (!answer) { $("feedback").textContent = "Please give an answer before requesting feedback."; $("feedback").hidden = false; return; }
    var feedback; evaluating = true; $('submit').disabled = true; $('voice-status').textContent = 'Your answer is received. Preparing feedback.';
    try {
      if (current.bonus) {
        var acknowledged = spokenPromise('Thank you. I am preparing feedback for your bonus answer.');
        feedback = await callTool('evaluate_surprise', {session_id:sessionId, answer_text:answer});
        await acknowledged;
        if (!feedback.available) { evaluating = false; $('submit').disabled = false; bonusNotice(feedback.spoken_summary); return; }
      } else { feedback = serverReady && sessionId ? await callTool("evaluate_answer", {session_id: sessionId, answer_text: answer, input_mode: voiceFirst ? "speech" : "typed"}) : offlineEvaluate(answer); }
    }
    catch (_) { if (current.bonus) { evaluating = false; $('submit').disabled = false; bonusNotice('Bonus feedback could not connect. Say retry or back to practice.'); return; } feedback = offlineEvaluate(answer); serverStatus("The coach is temporarily unavailable. Offline practice feedback is active.", false); }
    evaluating = false; $('submit').disabled = false; lastFeedback = feedback;
    $('voice-status').textContent = 'Feedback is ready. Choose retry, help, or next question.';
    var detail = feedback.missing && feedback.missing.length ? " Areas to explore: " + feedback.missing.slice(0, 2).join(" and ") + "." : "";
    var feedbackSource = feedback.mode === "bedrock" ? "AWS Bedrock practice feedback" : "Practice feedback";
    $("feedback").textContent = feedbackSource + ". " + (feedback.comparison || '') + (feedback.stuck ? '' : (feedback.signal_label || 'This is practice guidance, not a correctness score.')) + ' ' + feedback.strength + " " + feedback.next_step + detail + " " + (feedback.retry_prompt || "Try again using this feedback, or continue to the next question.");
    $('feedback').hidden = false; $('feedback').focus();
    $("feedback").hidden = false; $("submit").hidden = true; $("retry").hidden = false; $("next").hidden = false; $("next").textContent = current.number === current.total ? "Finish practice" : "Next question";
    if (voiceFirst) { say((feedback.spoken_summary || (feedback.strength + " " + feedback.next_step)) + (feedback.retry_prompt ? "" : " Would you like to try again? Say retry or next question.") + (current.bonus ? '' : ' For an optional AI bonus question, say surprise me.'), command); }
  }
  async function next() {
    if (bonusBusy || evaluating) { return; }
    if (current && current.bonus) { backToPractice(); return; }
    if (serverReady && sessionId) { try { var reply = await callTool("next_question", {session_id: sessionId}); if (reply.complete) { finish(reply); } else { current = reply; announceQuestion(); } return; } catch (_) { serverReady = false; } }
    var track = fallbackTracks[selectedTrack()]; fallbackIndex += 1;
    if (fallbackIndex >= track.qs.length) { finish({questions_practiced: fallbackScores.length, best_coverage_percent: Math.max.apply(Math, fallbackScores.concat([0]))}); return; }
    current = {track: track.label, question: track.qs[fallbackIndex].text, number: fallbackIndex + 1, total: track.qs.length, fallback: true, rubric: track.qs[fallbackIndex].rubric}; announceQuestion();
  }
  function finish(summary) {
    $("coach").hidden = true; $("summary-card").hidden = false;
    var text = summary.spoken_summary || ("You completed " + summary.questions_practiced + " practice questions. Keep practicing concise answers with specific details.");
    $("summary").textContent = text; if (voiceFirst) { say(text); } sessionId = null;
  }
  var microphonePermission = null, microphonePermissionError = "not-allowed";
  function microphoneFailure(code) {
    var messages = {
      "not-allowed": "Microphone access is blocked. Open this site's permissions, allow the microphone, then select Speak your answer. Also check your computer's microphone privacy settings.",
      "service-not-allowed": "This browser has blocked its speech recognition service. Try opening Maya in Google Chrome, or check your browser's speech permissions. Your question stays open.",
      "audio-capture": "No working microphone was found. Check that your microphone is connected, unmuted and selected in your browser, then select Speak your answer.",
      "network": "The browser's speech recognition service could not connect. This is a connection problem, not a problem with your answer. Check your connection or try Google Chrome, then select Speak your answer.",
      "policy": "This page is blocking microphone access. Reload Maya to get the latest version and open it directly on Ability Bazaar, rather than inside another app.",
      "unsupported": "This browser does not provide speech recognition. Open Maya in Google Chrome to try voice practice. Your question stays open and typing is optional."
    };
    var message = messages[code] || "The microphone could not start. Check your microphone and browser permissions, then select Speak your answer. Your question stays open.";
    $("voice-status").textContent = message;
    $("listen").disabled = false;
    if (voiceFirst) { say(message); }
  }
  async function recognize(result, end, noSpeech) {
    if (!Recognition) { microphoneFailure("unsupported"); return; }
    if (isListening) { return; }
    isListening = true;
    var policy = document.permissionsPolicy || document.featurePolicy;
    if (policy && policy.allowsFeature && !policy.allowsFeature("microphone")) { isListening = false; microphoneFailure("policy"); return; }
    if (!microphonePermission) { microphonePermission = requestMicrophonePermission(); }
    if (!await microphonePermission) { isListening = false; microphonePermission = null; microphoneFailure(microphonePermissionError); return; }
    var recognizer = new Recognition(), heard = false, failure = null;
    recognizer.lang = "en-IN"; recognizer.interimResults = true; recognizer.maxAlternatives = 1;
    recognizer.onstart = function () { $("listen").disabled = true; $("voice-status").textContent = "Maya is listening now. Speak your answer when you are ready."; };
    var transcript = "";
    recognizer.onresult = function (event) { transcript = Array.from(event.results).map(function (item) { return item[0].transcript; }).join(" ").trim(); heard = !!transcript; if (heard) { $("voice-status").textContent = "Speech detected. Maya is listening."; } };
    recognizer.onerror = function (event) { failure = event.error; };
    recognizer.onend = function () { isListening = false; $("listen").disabled = false; if (heard) { result(transcript); } else if (failure && failure !== "no-speech") { microphonePermission = null; microphoneFailure(failure); } else if (noSpeech) { noSpeech(); } if (end) { end(); } };
    try { recognizer.start(); } catch (_) { isListening = false; microphoneFailure("start"); }
  }
  function listen(attempt) {
    if (bonusBusy || evaluating) { return; }
    recognize(function (text) {
      var spoken = text.toLowerCase();
      if (/surprise|bonus question/.test(spoken)) { surprise(); return; }
      if (/back to|regular practice/.test(spoken)) { backToPractice(); return; }
      if (/^(skip|pass|next question)[.!?]*$/.test(spoken)) { next(); return; } if (spoken.indexOf("hint") !== -1) { help("hint"); return; } if (spoken.indexOf("sample") !== -1) { help("sample_answer"); return; } if (spoken.indexOf("repeat") !== -1) { announceQuestion(); return; }
      $("answer").value = text; $("voice-status").textContent = "I heard your answer. Maya is preparing feedback now."; evaluate();
    }, null, function () {
      if ((attempt || 0) < 1) { say("I did not hear an answer. Please share your answer now, or say repeat question.", function () { window.setTimeout(function () { listen(1); }, 350); }); }
      else { var waiting = "No speech was detected. I will keep this question open. Check that your microphone is unmuted, then select Speak your answer to try again. Typing is optional."; $("voice-status").textContent = waiting; say(waiting); }
    });
  }
  async function requestMicrophonePermission() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      microphonePermissionError = "unsupported";
      return false;
    }
    try {
      var stream = await navigator.mediaDevices.getUserMedia({audio: true});
      stream.getTracks().forEach(function (track) { track.stop(); });
      $("voice-status").textContent = "Microphone access is ready. Maya will listen when you choose Speak your answer.";
      return true;
    } catch (error) {
      microphonePermissionError = error.name === "NotAllowedError" ? "not-allowed" : "audio-capture";
      return false;
    }
  }
  function command(attempt) {
    recognize(function (text) {
      var commandText = text.toLowerCase();
      if (/surprise|bonus question/.test(commandText)) { surprise(); return; }
      if (/back to|regular practice/.test(commandText)) { backToPractice(); return; }
      if (/skip|next|continue/.test(commandText)) { next(); return; }
      if (/hint/.test(commandText)) { help('hint'); return; }
      if (/sample/.test(commandText)) { help('sample_answer'); return; }
      if (/retry/.test(commandText)) { $('retry').click(); return; }
      if (/more|repeat/.test(commandText)) { say($('feedback').textContent + ' Say retry, next question, or surprise me.', function () { command(0); }); return; }
      say('Please say retry, next question, surprise me, or back to practice.', function () { command(1); });
    }, null, function () {
      if ((attempt || 0) < 1) { say('Say retry, next question, surprise me, or back to practice.', function () { command(1); }); }
      else { $('voice-status').textContent = 'Your place is saved. Select Speak your answer to give Maya a command, or use the buttons.'; }
    });
  }
  function playWelcome(trackId, done) {
    // The welcome and first question are one tap-playable MP3.  On iPhone and
    // Android this avoids the autoplay boundary between the orientation and
    // the first question.
    var audio = warmWelcome(trackId);
    audio.currentTime = 0;
    playCoachAudio(audio, null, done);
  }
  var welcomeAudio = {};
  function warmWelcome(trackId) {
    if (!welcomeAudio[trackId]) {
      var audio = new Audio('/static/audio/maya/welcome-v3519-' + trackId + '.mp3');
      audio.preload = 'auto'; audio.load(); welcomeAudio[trackId] = audio;
    }
    return welcomeAudio[trackId];
  }
  function describeSelection() {
    var label = fallbackTracks[selectedTrack()].label;
    $('launch-instructions').textContent = 'Three practice areas: Digital Accessibility Testing, Full-stack Development, and Digital Marketing. Currently selected: ' + label + '. Choose another area below before starting, or use Change practice area to restart.';
    warmWelcome(selectedTrack());
  }
  document.querySelectorAll('input[name=track]').forEach(function (radio) { radio.addEventListener('change', describeSelection); });
  describeSelection();
  $("begin").onclick = function () {
    if (isLaunching) { return; }
    isLaunching = true; $("begin").disabled = true; $("begin").setAttribute("aria-disabled", "true"); $("begin").textContent = "Starting Maya…";
    document.querySelectorAll('input[name=track]').forEach(function (radio) { radio.disabled = true; });
    unlockCoachAudio();
    // Permission is helpful, but must never hold up the first spoken question.
    microphonePermission = requestMicrophonePermission();
    var preparedSession = prepareVoiceSession();
    $("voice-status").textContent = "Maya is preparing your practice session.";
    playWelcome(selectedTrack(), function () { preparedSession.then(function (start) { begin(true, start, true); }).finally(function () { isLaunching = false; }); });
  }; $("begin-typing").onclick = function () { begin(false); }; $("listen").onclick = function () { if (!$("feedback").hidden) { command(0); } else { listen(0); } }; $("submit").onclick = evaluate;
  $("retry").onclick = function () { if (bonusBusy || evaluating) { return; } $("answer").focus(); $("answer").select(); $("feedback").hidden = true; $("submit").hidden = false; $("retry").hidden = true; $("next").hidden = true; if (voiceFirst) { say("Let's try the same question again. " + current.question + " Use the feedback to add a concrete example. I will listen after a short pause.", function () { window.setTimeout(function () { listen(0); }, 350); }); } };
  $("next").onclick = next; $("again").onclick = function () { $("start").hidden = false; $("summary-card").hidden = true; current = null; document.querySelectorAll('input[name=track]').forEach(function (radio) { radio.disabled = false; }); $("begin").disabled = false; $("begin").removeAttribute("aria-disabled"); $("begin").textContent = "Start Maya voice practice"; };
  if (!Recognition) { $("listen").disabled = true; }
  $("hint").onclick = function () { help("hint"); }; $("sample").onclick = function () { help("sample_answer"); }; $("skip").onclick = next;
  $('surprise').onclick = surprise; $('back-practice').onclick = backToPractice;
  connectCoach();
}());
