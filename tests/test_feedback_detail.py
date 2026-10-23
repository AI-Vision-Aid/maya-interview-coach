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
    assert 'useful starting point' in feedback['strength']
    assert 'not just a few terms' not in feedback['strength']
    assert 'Say retry' in feedback['spoken_summary']
    assert len(feedback['spoken_summary'].split()) < 80
    assert coach.retry_question(session)['number'] == 1
    retry = coach.evaluate_answer(session, 'I use keyboard Tab and visible focus to test a registration form. With NVDA screen reader I found an unlabelled field, fixed its label, and retested the user task.')
    assert retry['coverage_percent'] > feedback['coverage_percent']
    assert retry['has_example']
    assert 'added' in retry['comparison']
    coach.end_session(session)


def test_all_questions_offer_complete_coaching():
    for track in coach.QUESTION_BANK.values():
        for question in track['questions']:
            feedback = coach._offline_feedback(question, 'I am not sure.')
            assert feedback['stuck']
            assert 'sample answer' in feedback['spoken_summary']

def test_adversarial_fallback():
    q=coach.QUESTION_BANK['accessibility']['questions'][0]
    for answer in ['keyboard screen reader semantic user tab heading label test', 'I would never use a keyboard or a screen reader, and I do not believe in semantic HTML or user testing', 'I am not sure, I have not done this before']:
        assert coach._offline_feedback(q,answer)['covered']==[]
    table=next(q for q in coach.QUESTION_BANK['accessibility']['questions'] if q['id']=='data-table')
    assert coach._offline_feedback(table,'this')['covered']==[]
