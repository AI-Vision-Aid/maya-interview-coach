from ability_ai import interview_coach_core as core, surprise_round as bonus

def test_bonus_is_separate_and_answers_not_stored(monkeypatch):
    sid=core.start_session('accessibility')['session_id']
    current=core._session(sid)
    old=core.get_question(sid)
    outputs=iter([{'question':'How would you test a form error with NVDA?', 'guidance':'Check label, error announcement and keyboard focus.', 'hint':'Consider focus.'},
                  {'strength':'You described keyboard focus.', 'next_step':'Also test the error announcement with NVDA.'}])
    monkeypatch.setattr(bonus,'_invoke',lambda *args:next(outputs))
    assert bonus.run(current,'question')['available']
    result=bonus.run(current,'answer','private unique learner answer')
    assert result['mode']=='bedrock'
    assert core.get_question(sid)==old
    assert 'private unique' not in str(current)
    assert core.evaluate_answer(sid,'I would check the form with a keyboard first.')['mode']=='offline'
    core.end_session(sid)

def test_bad_output_and_provider_failure_leave_regular_practice(monkeypatch):
    sid=core.start_session('marketing')['session_id']; current=core._session(sid)
    old=core.get_question(sid)
    monkeypatch.setattr(bonus,'_invoke',lambda *args:{'question':123})
    assert not bonus.run(current,'question')['available']
    assert 'bonus' not in current
    def fail(*args): raise TimeoutError()
    monkeypatch.setattr(bonus,'_invoke',fail)
    assert not bonus.run(current,'question')['available']
    assert core.get_question(sid)==old
    current['bonus_calls']=12
    assert not bonus.run(current,'question')['available']
    core.end_session(sid)

def test_bonus_requires_question_and_valid_answer(monkeypatch):
    sid=core.start_session('fullstack')['session_id']; current=core._session(sid)
    assert not bonus.run(current,'answer','test')['available']
    current['bonus']={'question':'Test?', 'guidance':'Check', 'hint':'Try'}
    assert not bonus.run(current,'answer','')['available']
    core.end_session(sid)
