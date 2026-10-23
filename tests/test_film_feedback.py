from ability_ai.interview_coach_core import start_session, next_question, evaluate_answer, end_session

def test_film_feedback_is_coherent():
    s = start_session('accessibility')['session_id']
    next_question(s)
    first = evaluate_answer(s, 'I would run an automated accessibility checker and fix the errors it finds.')
    assert 'useful starting point' in first['spoken_summary']
    assert 'not just a few terms' not in first['spoken_summary']
    retry = evaluate_answer(s, 'I use NVDA and the keyboard to test a registration form. I found an unlabelled email field, documented the barrier for the team, and retested the corrected label. This helps the employer deliver a usable customer journey, with complementary visual review.')
    assert 'On this retry, you added' in retry['spoken_summary']
    assert 'Now explain one trade-off' not in retry['spoken_summary']
    assert 'complete answer' not in retry['spoken_summary']
    end_session(s)

def test_keyword_list_still_needs_explanation():
    s = start_session('accessibility')['session_id']
    feedback = evaluate_answer(s, 'keyboard nvda label focus test')
    assert 'not just a few terms' in feedback['spoken_summary']
    assert not feedback['covered']
    end_session(s)

def test_bare_or_negated_limitation_is_not_credited():
    from ability_ai.practice_feedback import assess
    q={'rubric':[{'id':'keyboard','label':'keyboard testing','keywords':['keyboard']} ]}
    base='I use the keyboard to test the registration form and found a focus problem. I documented the steps carefully, fixed the issue and retested the form. '
    for ending in ['Limitation.', 'I do not need complementary visual review.']:
        assert 'Now explain one trade-off' in assess(q,base+ending)['next_step']
    assert 'and a limitation' in assess(q,base+'This needs complementary visual review.')['next_step']
