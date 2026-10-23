"""Conservative practice signals, not a correctness or hiring score."""
import re

def stuck(answer):
    return bool(re.fullmatch(r"\s*(?:i\s+)?(?:don['’]?t know|do not know|am not sure|not sure|have no idea|no idea|pass|skip)[.!?\s]*", answer, re.I))

def assess(question, answer):
    words = re.findall(r"\b[\w'-]+\b", answer.lower())
    sentences = re.split(r'[.!?;\n]+', answer.lower())
    # A keyword list is not an explanation. Negated claims are never evidence.
    explanatory = len(words) >= 25 and bool(re.search(r'\b(i|we|would|should|because|using|check|verify|measure|compare)\b', answer, re.I))
    covered = []
    for point in question['rubric']:
        evidence = None
        for sentence in sentences:
            if re.search(r"\b(never|not|no|don't|cannot|can't|ignore|avoid)\b", sentence):
                continue
            for keyword in point['keywords']:
                if len(keyword) < 3:
                    continue
                if re.search(r'(?<!\w)' + re.escape(keyword.lower()) + r'(?:s)?(?!\w)', sentence):
                    evidence = sentence.strip()
                    break
            if evidence:
                break
        if explanatory and evidence:
            covered.append(dict(id=point['id'], label=point['label'], evidence=evidence))
    example = bool(re.search(r'\b(found|discovered|noticed|identified)\b', answer, re.I) and re.search(r'\b(retested|verified|fixed|resolved|confirmed)\b', answer, re.I))
    meaningful_start = len(words) >= 8 and bool(re.search(r'\b(i|we)\b.*\b(would|use|run|check|test|verify|measure)\b', answer, re.I))
    # Merely saying "limitation" (or denying a need for visual review) is not evidence.
    limitation = any(
        re.search(r'\b(complementary visual review|requires? visual checks|needs? visual checks)\b', s)
        and not re.search(r"\b(no|not|never|don't|ignore)\b", s)
        or re.search(r'\bcannot detect\s+(?:\w+\s+){1,5}\w+', s)
        for s in sentences)
    missing = [p['label'] for p in question['rubric'] if p['id'] not in {c['id'] for c in covered}]
    if stuck(answer):
        strength = 'No problem. This is a safe place to practise.'
        step = 'Would you like a hint, a sample answer, or to skip this one?'
    elif not explanatory:
        strength = ('That is a useful starting point. Let us develop your working method.' if meaningful_start else
                    'Thank you for making a start. I need an explanation, not just a few terms, to offer useful feedback.')
        step = 'Tell me what you would do, which tool you would use, and how you would check the result.'
    elif covered:
        strength = 'You described ' + covered[0]['label'] + '.'
        step = ('Next, explain ' + missing[0] + ' with a practical step.' if missing else
                'You included a concrete example and a limitation. Practise explaining this clearly in under a minute.' if example and limitation else
                'You included a concrete example. Now explain one trade-off or limitation.' if example else
                'If you have not already, give a real example: the situation, what you found, and how you checked the fix.')
    else:
        strength = 'Let us bring this back to the interview question.'
        step = 'Explain ' + question['rubric'][0]['label'] + ' and how you would apply it in this job.'
    retry = 'Say retry to improve your answer, more for details, or next question.'
    return dict(mode='offline', coverage_percent=round(len(covered)*100/len(question['rubric'])), covered=covered,
        missing=missing, strength=strength, next_step=step, retry_prompt=retry, stuck=stuck(answer),
        has_example=example, signal_label=f"Practice signals: {len(covered)} of {len(question['rubric'])} areas mentioned. This is not a correctness score.",
        spoken_summary=f'{strength} {step}' + ('' if stuck(answer) else ' ' + retry))
