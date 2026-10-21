"""Server-side Google Chirp TTS adapter for the Interview Coach."""

from __future__ import annotations

import base64
import os

import google.auth
from google.auth.transport.requests import Request as GoogleAuthRequest
import requests

GOOGLE_TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize"
GOOGLE_TTS_SCOPE = "https://www.googleapis.com/auth/cloud-platform"
MAYA_VOICE = "en-IN-Chirp3-HD-Laomedeia"
MAX_TEXT_LENGTH = 900


class VoiceUnavailable(RuntimeError):
    """Raised when the deployment has no usable Maya voice configuration."""


def synthesize_interview_coach_voice(text: str) -> bytes:
    """Return a warm female Indian-English Chirp 3 HD MP3 for Maya."""
    clean_text = " ".join((text or "").split())
    if not clean_text or len(clean_text) > MAX_TEXT_LENGTH:
        raise ValueError("Voice text must be between 1 and 900 characters.")

    try:
        credentials, _ = google.auth.default(scopes=[GOOGLE_TTS_SCOPE])
        credentials.refresh(GoogleAuthRequest())
        response = requests.post(
            GOOGLE_TTS_URL,
            headers={"Authorization": f"Bearer {credentials.token}",
                     **({"x-goog-user-project": os.environ['GOOGLE_CLOUD_QUOTA_PROJECT']}
                        if os.environ.get('GOOGLE_CLOUD_QUOTA_PROJECT') else {})},
            json={
                "input": {"text": clean_text},
                "voice": {"languageCode": "en-IN", "name": MAYA_VOICE},
                "audioConfig": {
                    "audioEncoding": "MP3",
                    "speakingRate": 0.96,
                    "effectsProfileId": ["handset-class-device"],
                },
            },
            timeout=18,
        )
        response.raise_for_status()
        audio = base64.b64decode(response.json().get("audioContent") or "")
        if not audio:
            raise VoiceUnavailable("Google returned no playable audio.")
        return audio
    except requests.RequestException as error:
        raise VoiceUnavailable("Maya's voice is temporarily unavailable.") from error
    except (ValueError, IndexError, TypeError) as error:
        raise VoiceUnavailable("Google returned an unexpected audio response.") from error
