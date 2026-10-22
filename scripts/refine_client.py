"""Mechanical changes to preserve answer editing and route spoken help."""
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'static/js/interview_coach.js'
s=p.read_text(encoding='utf-8')
s=s.replace('$("retry").onclick = function () { $("answer").value = ""; $("answer").focus();','$("retry").onclick = function () { $("answer").focus(); $("answer").select();')
s=s.replace('if (spoken.indexOf("repeat") !== -1)', 'if (/^(skip|pass|next question)[.!?]*$/.test(spoken)) { next(); return; } if (spoken.indexOf("hint") !== -1) { help("hint"); return; } if (spoken.indexOf("sample") !== -1) { help("sample_answer"); return; } if (spoken.indexOf("repeat") !== -1)')
s=s.replace('var commandText = text.toLowerCase(); if', 'var commandText = text.toLowerCase(); if (commandText.indexOf("skip") !== -1) { next(); return; } if (commandText.indexOf("hint") !== -1) { help("hint"); return; } if (commandText.indexOf("sample") !== -1) { help("sample_answer"); return; } if')
s=s.replace('  connectCoach();', '  $("hint").onclick = function () { help("hint"); }; $("sample").onclick = function () { help("sample_answer"); }; $("skip").onclick = next;\n  connectCoach();')
# Browser-only fallback must not claim evaluation from keywords.
start=s.index('    var lower = answer.toLowerCase(), hits =')
end=s.index('\n  async function evaluate()',start)
prefix=s[:start]
tail=s[end:]
# Preserve the helpers inserted immediately before evaluate.
helpers=s[s.index('  var lastFeedback =',start):end]
s=prefix+'''    return {mode:"offline", coverage_percent:0, covered:[], missing:[], strength:"The coach connection is unavailable, so I cannot evaluate this answer reliably.", next_step:"For self-practice, explain your approach, one example and how you verified the result.", spoken_summary:"The coach connection is unavailable. You can keep practising or retry the connection. Say next question to continue."};
  }
'''+helpers+tail
p.write_text(s,encoding='utf-8')
