from ability_ai import interview_coach_core as coach
from app import app

def test_page():
    r=app.test_client().get('/')
    assert r.status_code==200
    assert b'Start Maya voice practice' in r.data

def test_practice_retry(monkeypatch):
    monkeypatch.delenv('BEDROCK_MODEL_ID',raising=False)
    s=coach.start_session('accessibility'); sid=s['session_id']
    first=coach.evaluate_answer(sid,'I would run an automated checker.')
    assert first['mode']=='offline'
    assert coach.retry_question(sid)['question_id']==s['question_id']
    second=coach.evaluate_answer(sid,'I would use keyboard focus and tab order to test the form, then use the screen reader NVDA to check headings and labels, document each issue and retest the completed task.')
    assert second['coverage_percent']>first['coverage_percent']
    assert coach.end_session(sid)['complete']

def test_voice_off_by_default(monkeypatch):
    monkeypatch.delenv('ENABLE_GOOGLE_TTS',raising=False)
    assert app.test_client().post('/api/interview-coach/voice',json={'text':'Hello'}).status_code==503
    # A bundled public welcome can be served without calling a paid service.
    assert app.test_client().get('/api/interview-coach/welcome.mp3').status_code in (200,503)
    assert app.test_client().post('/api/interview-coach/voice',json={'text':3}).status_code==400

def test_tracks():
    assert len(coach.list_tracks())==3
    assert len(coach.QUESTION_BANK['accessibility']['questions'])>=10

def test_session_does_not_store_answer(monkeypatch):
    monkeypatch.delenv('BEDROCK_MODEL_ID',raising=False)
    s=coach.start_session('accessibility'); marker='private answer sentinel'
    coach.evaluate_answer(s['session_id'],marker)
    assert marker not in str(coach._sessions[s['session_id']])
    coach.end_session(s['session_id'])
