from ability_ai import interview_coach_core as coach


def test_microphone_policy_is_scoped_to_practice_pages():
    from app import app
    client = app.test_client()
    for path in ('/', '/coach', '/ability-fellows/interview-coach'):
        assert 'microphone=(self)' in client.get(path).headers['Permissions-Policy']
    assert 'microphone=()' in client.get('/api/health').headers['Permissions-Policy']


def test_first_answer_has_actionable_coaching_and_retry(monkeypatch):
    monkeypatch.delenv('BEDROCK_MODEL_ID', raising=False)
    session = coach.start_session('accessibility')['session_id']
    feedback = coach.evaluate_answer(session, 'I would run an automated accessibility checker and fix the errors it finds.')
    assert 'Tab and Shift Tab' in feedback['next_step']
    assert 'NVDA' in feedback['next_step']
    assert 'cannot replace' in feedback['strength']
    assert 'Say retry' in feedback['spoken_summary']
    assert len(feedback['spoken_summary'].split()) >= 70
    assert coach.retry_question(session)['number'] == 1
    retry = coach.evaluate_answer(session, 'I use keyboard Tab and visible focus, NVDA screen reader headings and labels, and test a real user task.')
    assert retry['coverage_percent'] > feedback['coverage_percent']
    assert 'concrete example' in retry['next_step']
    coach.end_session(session)


def test_all_questions_offer_complete_coaching():
    for track in coach.QUESTION_BANK.values():
        for question in track['questions']:
            feedback = coach._offline_feedback(question, 'I am not sure.')
            assert len(feedback['next_step'].split()) > 25
            assert 'Say retry' in feedback['spoken_summary']
