"""Deterministic question-bank expansion from the October team review."""
import json
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'data/interview_coach_questions.json'
bank=json.loads(p.read_text())
specific={
 'accessibility': ('An interviewer asks how you, as a screen-reader user, would test a page you cannot see. How would you answer?', 'I use NVDA and keyboard navigation to check names, roles and focus order. On a registration form I found an unlabelled email field, logged reproduction steps, and retested the corrected label. This helps the employer deliver a usable customer journey; visual checks still need complementary review.'),
 'fullstack': ('How do you use your screen reader and other tools to write and debug code? Give one example.', 'I use a screen reader with my editor and terminal to navigate code and inspect test output. On a form submission bug I found a validation error, fixed the server rule, and verified it with a regression test. I explain that workflow to teammates so we can review changes effectively.'),
 'marketing': ('How would you review campaign images and charts using your assistive technology?', 'I use a screen reader to inspect alternative text and the underlying data table. In a campaign chart I found a missing description, worked with the designer to add the message and data, and verified the result. I also request visual review of layout so the employer gets complementary checks.')}
for track,(text,sample) in specific.items():
    q=dict(id=track+'-assistive-workflow',text=text,sample_answer=sample,rubric=[
      dict(id='tool',label='the assistive tool',keywords=['nvda','screen reader','jaws','voiceover']),
      dict(id='method',label='a practical workflow',keywords=['keyboard','navigate','inspect','test','review']),
      dict(id='example',label='a real example',keywords=['found','example','fixed','retested']),
      dict(id='employer',label='value and limitations for the employer',keywords=['employer','customer','team','limitation'])])
    if not any(x['id']==q['id'] for x in bank[track]['questions']): bank[track]['questions'].insert(1,q)
for ident,text,labels,keywords in [
 ('marketing-basics','What is digital marketing, and how is it different from traditional marketing?', ['digital channels','audience','measurement','a comparison'],[['search','social','email'],['audience'],['measure','analytics'],['traditional','print']]),
 ('seo','What is SEO, and why is it important for a website?', ['search visibility','useful content','technical accessibility','measurement'],[['search','visibility'],['content'],['crawl','accessible','structure'],['measure','traffic']]),
 ('campaign-success','How do you measure the success of a digital marketing campaign?', ['business goal','relevant metrics','baseline and attribution','next action'],[['goal','business'],['conversion','metric'],['baseline','attribution'],['test','improve']])]:
    if not any(q['id']==ident for q in bank['marketing']['questions']):
        bank['marketing']['questions'].append(dict(id=ident,text=text,rubric=[dict(id=str(i),label=l,keywords=k) for i,(l,k) in enumerate(zip(labels,keywords))]))
for track in bank.values():
    for q in track['questions']:
        for r in q['rubric']: r['keywords']=[w for w in r['keywords'] if len(w)>2]
p.write_text(json.dumps(bank,indent=2)+'\n',encoding='utf-8')
