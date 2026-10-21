"""Standalone Maya demo, without the Ability Bazaar commerce platform."""
import io
import os
from functools import lru_cache
from flask import Flask, jsonify, render_template, request, send_file
from ability_ai.interview_coach_core import QUESTION_BANK
from ability_ai.sarvam_voice import VoiceUnavailable, synthesize_interview_coach_voice

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 8192

@app.get('/')
@app.get('/coach')
@app.get('/ability-fellows/interview-coach')
def home():
    return render_template('interview_coach.html')

@app.after_request
def headers(response):
    response.headers['X-Content-Type-Options']='nosniff'
    response.headers['Cache-Control']='no-store'
    return response

@lru_cache(maxsize=64)
def speech(text):
    return synthesize_interview_coach_voice(text)

def audio_response(text):
    if os.environ.get('ENABLE_GOOGLE_TTS') != '1':
        return jsonify(error='Cloud speech is disabled. Use typed practice or configure Google TTS.'),503
    try:
        return send_file(io.BytesIO(speech(text)),mimetype='audio/mpeg')
    except ValueError as exc:
        return jsonify(error=str(exc)),400
    except VoiceUnavailable:
        return jsonify(error='Cloud speech is temporarily unavailable; typed practice remains available.'),503

@app.post('/api/interview-coach/voice')
def voice():
    data=request.get_json(silent=True)
    if not isinstance(data,dict) or not isinstance(data.get('text'),str):
        return jsonify(error='Provide a text string.'),400
    return audio_response(data['text'])

@app.get('/api/interview-coach/welcome.mp3')
def welcome():
    track=QUESTION_BANK.get(request.args.get('track','accessibility'),QUESTION_BANK['accessibility'])
    text=("Welcome to Maya, Vision-Aid's Ability Fellows Interview Coach. "
          "You can practice by speaking or typing. I will ask one question at a time, "
          "offer practical feedback, and invite you to improve your answer. "
          "This is supportive practice, not a hiring decision. Your first question is: "
          +track['questions'][0]['text']+" I am ready to listen when this message ends.")
    return audio_response(text)

@app.get('/api/health')
def health():
    return jsonify(ok=True,prototype=True,bedrock_configured=bool(os.environ.get('BEDROCK_MODEL_ID')))
