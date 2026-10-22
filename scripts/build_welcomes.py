"""Generate fixed public prompts with configured Google ADC, never learner data."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ability_ai.coach_welcome import AUDIO_DIR, welcome_path, welcome_text, QUESTION_BANK
from ability_ai.sarvam_voice import synthesize_interview_coach_voice

AUDIO_DIR.mkdir(parents=True, exist_ok=True)
for track in QUESTION_BANK:
    text = welcome_text(track)
    assert len(text) <= 900
    path = welcome_path(track)
    if not path.exists():
        path.write_bytes(synthesize_interview_coach_voice(text))
    print(f'{track}: {len(text)} characters; {path.stat().st_size} bytes', flush=True)
