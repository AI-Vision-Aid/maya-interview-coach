"""Versioned welcome recordings: no TTS request in the normal startup path."""
from pathlib import Path
from ability_ai.interview_coach_core import QUESTION_BANK

WELCOME_VERSION = '3519'
AUDIO_DIR = Path(__file__).resolve().parents[1] / 'static' / 'audio' / 'maya'

def normalize_track(track_id):
    return track_id if track_id in QUESTION_BANK else 'accessibility'

def welcome_text(track_id):
    track = QUESTION_BANK[normalize_track(track_id)]
    return (
        "Hello, I'm Maya, your Vision-Aid interview coach. "
        "We offer three practice areas: one, Digital Accessibility Testing; "
        "two, Full-stack Development; and three, Digital Marketing. "
        f"Your selected area is {track['label']}. "
        "To switch, use Change practice area, choose another area, and press Start. "
        "I'll ask a question, listen, give feedback and offer a retry. "
        f"Your first question is: {track['questions'][0]['text']} "
        "I will listen when this message ends."
    )

def welcome_path(track_id):
    return AUDIO_DIR / f'welcome-v{WELCOME_VERSION}-{normalize_track(track_id)}.mp3'
