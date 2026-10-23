# Optional AWS surprise round

Regular practice remains rubric-based. The separate `surprise_question` and
`evaluate_surprise` MCP tools use Amazon Bedrock Converse with Meta Llama.
The UI supports “surprise me”, “back to practice”, retry and typed buttons.
Google Chirp remains the voice for both paths. Regular progress is preserved.

Configure server-side AWS credentials using the standard boto3 credential
chain, `AWS_REGION=us-east-1`, and
`MAYA_SURPRISE_MODEL_ID=us.meta.llama3-3-70b-instruct-v1:0`.
Leave `BEDROCK_MODEL_ID` unset/empty to keep ordinary feedback rule-based.
Never put credentials in browser code or commit them. Production uses existing
Google Secret Manager references. AWS invocation requires appropriate IAM access.

Bonus questions are grounded in the selected track's approved question topics.
Feedback is model generated, can make mistakes, and is not a hiring score.
Answers are sent to AWS only for bonus feedback and are not retained in Maya's
session state or logs. The page explains this before the optional feature.
Do not submit personal/confidential information. Browser speech recognition
and Google voice synthesis remain separate providers.

Protection: 4,000-character answers, validated bounded JSON outputs, a
15-second provider read timeout, no automatic AWS retries, single in-flight
bonus operation per session, 12 operations per session, and 200 operations per
rolling day per process. This last limit is NOT an account-wide billing cap:
replicas/restarts reset or multiply it. AWS billing alarms remain advisable.
Failures are announced without silently substituting rubric grading for a
generated question; regular practice remains available.

Run `python -m pytest -q`, `node tests/test_audio_queue.cjs`, and
`node tests/test_microphone.cjs`. Live checks must verify generated questions,
feedback and return to the same regular question. Microphone recognition on
physical phones must still be tested by a human; typed/MCP checks do not prove it.

For the hackathon: demonstrate the real bonus call and document AWS usage.
This is a browser-based Alexa+ simulation with an MCP server, not a certified
public Alexa skill. Existing practice feedback should not be called AI grading.
