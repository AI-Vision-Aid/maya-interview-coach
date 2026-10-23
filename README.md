# Maya: Ability Fellows Interview Coach

A standalone open-source interview-practice prototype from Vision-Aid, prepared
for **Build, Ship, Shape: Amazon Developer Hackathon**, Alexa+ simulation route.
This repository deliberately excludes Ability Bazaar commerce, customer records,
staff tools, deployment credentials, and private platform code.

## What works, and what is not claimed

- Three practice tracks: Digital Accessibility Testing (including ARIA),
  Full-Stack Development, and Digital Marketing.
- Stateful MCP tools for questions, feedback, retry, next, and session summary.
- Regular practice uses transparent rubric rules. The separate optional
  “Surprise me” round uses Meta Llama through Amazon Bedrock for new questions
  and bonus feedback without replacing the regular interview.
- Optional Google Cloud female Indian-English speech, with a typed fallback.
- Browser speech recognition varies by device/browser. Microphone access and
  audio require user permission and a user gesture; hosted use requires HTTPS.
- **Not a certified or publicly enabled Alexa skill.** This is an Alexa+-style
  web simulation. A backend alone does not establish Alexa distribution.
- The optional Bedrock surprise round was verified through live hosted checks
  on October 22, including question generation, feedback and return to regular
  practice. The demonstration film shows regular rubric-based coaching with
  a simulated learner voice; it does not demonstrate the AWS bonus round.
- Rubric coverage is a practice signal, not a validated assessment of competence,
  employability, disability, or hiring suitability. No job outcome is promised.

## Run locally

Use Python 3.11 or 3.12 in a new virtual environment:

```sh
python -m venv .venv
# Activate your environment, then:
python -m pip install -r requirements.txt
python -m uvicorn asgi:application --host 127.0.0.1 --port 8099
```

Open http://127.0.0.1:8099 and choose **Begin with typing**. No cloud credentials
are needed for rubric practice. The MCP endpoint is http://127.0.0.1:8099/mcp/.
Run `python -m pytest -q` for automated checks.

### Recommended optional AWS surprise round

Set `MAYA_SURPRISE_MODEL_ID=us.meta.llama3-3-70b-instruct-v1:0` and
`AWS_REGION=us-east-1`, with server-side AWS credentials. Leave
`BEDROCK_MODEL_ID` empty to preserve regular rubric practice. See
[Surprise round setup and limits](docs/SURPRISE_ROUND.md).
Say “surprise me” after ordinary feedback, answer the bonus question, then say
“back to practice”. The original question remains available.

### Legacy optional AWS feedback for regular practice

Set `BEDROCK_MODEL_ID` and `AWS_REGION`; provide credentials through the normal
AWS SDK credential chain or a least-privilege deployment role. Grant only the
Bedrock invocation permissions required by the chosen model and region. The
code calls `bedrock-runtime.converse`. An unavailable service falls back to
rubric feedback and labels that mode; configuration is not proof of successful
invocation. Cloud services may incur costs. Do not put keys into this repository.

### Optional speech

Enable Google Cloud Text-to-Speech in your own billing project, configure
Application Default Credentials, set `GOOGLE_CLOUD_QUOTA_PROJECT`, and set
`ENABLE_GOOGLE_TTS=1`. Maya uses `en-IN-Chirp3-HD-Laomedeia`. The legacy module
filename `sarvam_voice.py` is retained for source compatibility; it calls Google,
not Sarvam. The selected demo learner voice is `en-IN-Neural2-C` and is not used
as Maya's coach voice. The example environment file is documentation only;
the app does not automatically load it.

## Reproducible demo

1. Start Digital Accessibility Testing.
2. Answer the keyboard/screen-reader question with only an automated-checker idea.
3. Read the feedback, choose Retry, and add keyboard, screen reader, meaningful
   tasks, and documentation/retesting.
4. Inspect the coverage feedback; it is not a hiring score.

Question content and rubric keywords are editable in
`data/interview_coach_questions.json`. Keep model and fallback mode visible.
Synthetic learner narration in the film is disclosed, and typed input is not
presented as proof that live speech recognition worked.

## Privacy and deployment limits

The session store retains rubric IDs/scores, not answer text; answers are sent
to Bedrock when enabled. Browser speech services and Google TTS have their own
processing policies. In-memory sessions disappear on restart and are unsuitable
for multiple independent workers without a shared, expiring store. This demo
has no learner authentication or account-wide cloud-spend cap. The bonus
round has bounded inputs, timeouts and per-session/process request limits.
Bind to loopback for local review. Before public deployment add request limits,
session expiry/capacity, origin validation, and billing safeguards. Do not
submit confidential or identifying answers. No telemetry is required here.

## Product feedback for the hackathon

What worked: a small set of MCP tools keeps the practice flow explicit; Bedrock's
Converse interface fits structured rubric coaching; a typed path allows testing
without microphone availability.

Friction: phone autoplay/microphone handoffs need careful state management;
long or repeated audio requests can overlap without cancellation; cloud model
access and authentication failures need clear fallback status. The optional
Bedrock surprise round has been verified through the deployed service and
browser flow. Regular coaching remains rubric-based. Long spoken answers
can still end prematurely in browser recognition and need further work;
typed or service-level checks do not establish physical-device microphone
reliability. Alexa integration, device testing and certification remain next
steps.

## License and scope

MIT applies to this repository's code and question content. Vision-Aid and
Ability Bazaar names remain their owners' marks. Archive film footage, photos,
and third-party media are not included or relicensed by this repository.
