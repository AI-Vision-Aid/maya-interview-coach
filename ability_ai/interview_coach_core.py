"""Stateful, privacy-minimising coaching logic shared by the MCP server and web app."""

from __future__ import annotations

import json
import logging
import os
import secrets
import threading
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parents[1]
QUESTION_BANK_PATH = BASE_DIR / "data" / "interview_coach_questions.json"
QUESTION_BANK = json.loads(QUESTION_BANK_PATH.read_text(encoding="utf-8"))
_sessions: dict[str, dict[str, Any]] = {}
_lock = threading.Lock()
logger = logging.getLogger(__name__)


def list_tracks() -> list[dict[str, Any]]:
    return [{"id": key, "label": value["label"], "question_count": len(value["questions"])} for key, value in QUESTION_BANK.items()]


def _public_question(track_id: str, index: int) -> dict[str, Any]:
    track = QUESTION_BANK[track_id]
    question = track["questions"][index]
    return {"track": track["label"], "question_id": question["id"], "question": question["text"], "number": index + 1, "total": len(track["questions"])}


def start_session(track_id: str) -> dict[str, Any]:
    if track_id not in QUESTION_BANK:
        raise ValueError("Choose a supported practice track.")
    session_id = secrets.token_urlsafe(18)
    with _lock:
        _sessions[session_id] = {"track_id": track_id, "index": 0, "attempts": [], "covered": set()}
    return {"session_id": session_id, **_public_question(track_id, 0)}


def _session(session_id: str) -> dict[str, Any]:
    with _lock:
        value = _sessions.get(session_id)
    if not value:
        raise ValueError("This practice session has expired. Please start again.")
    return value


def get_question(session_id: str) -> dict[str, Any]:
    current = _session(session_id)
    return _public_question(current["track_id"], current["index"])


def _offline_feedback(question: dict[str, Any], answer: str) -> dict[str, Any]:
    normalized = answer.casefold()
    covered, missing = [], []
    for point in question["rubric"]:
        match = next((word for word in point["keywords"] if word.casefold() in normalized), None)
        if match:
            covered.append({"id": point["id"], "label": point["label"], "evidence": match})
        else:
            missing.append(point)
    score = round(100 * len(covered) / len(question["rubric"]))
    strength = (f"You covered {len(covered)} of {len(question['rubric'])} key areas."
                if covered else "You began responding, but the key points were not yet clear.")
    next_step = (f"To make this hiring-ready, add {missing[0]['label']}."
                 if missing else "Strong answer. Add one brief real example to make it more persuasive.")
    return {"mode": "offline", "coverage_percent": score, "covered": covered,
            "missing": [item["label"] for item in missing], "strength": strength,
            "next_step": next_step,
            "spoken_summary": f"{strength} {next_step}"}


def _bedrock_feedback(question: dict[str, Any], answer: str, input_mode: str) -> dict[str, Any] | None:
    """Return verified Bedrock feedback only when explicitly configured; never log answers."""
    model_id = os.environ.get("BEDROCK_MODEL_ID")
    if not model_id:
        return None
    try:
        import boto3
        client = boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1"))
        rubric = [{"id": p["id"], "label": p["label"], "keywords": p["keywords"]} for p in question["rubric"]]
        prompt = (
            "You are an accessible interview-practice coach, not a hiring decision-maker. "
            "Return JSON only with covered (array of objects with id and evidence), strength, and next_step. "
            "Be encouraging but candid. Grade content, not grammar or fluency. A speech transcript can contain errors. "
            f"Question: {question['text']}\nRubric: {json.dumps(rubric)}\nInput mode: {input_mode}\nAnswer: {answer}"
        )
        response = client.converse(modelId=model_id, messages=[{"role": "user", "content": [{"text": prompt}]}],
                                   inferenceConfig={"maxTokens": 350, "temperature": 0.2})
        text = response["output"]["message"]["content"][0]["text"]
        result = json.loads(text[text.find("{"):text.rfind("}") + 1])
        normalized = answer.casefold()
        valid_points = {p["id"]: p for p in question["rubric"]}
        covered = []
        for item in result.get("covered", []):
            point = valid_points.get(item.get("id"))
            evidence = str(item.get("evidence", "")).strip()
            if point and evidence and evidence.casefold() in normalized:
                covered.append({"id": point["id"], "label": point["label"], "evidence": evidence})
        missing = [p["label"] for p in question["rubric"] if p["id"] not in {p["id"] for p in covered}]
        score = round(100 * len(covered) / len(question["rubric"]))
        strength = str(result.get("strength") or "You have a useful starting point.")
        next_step = str(result.get("next_step") or (f"Add {missing[0]}." if missing else "Add one concise example."))
        return {"mode": "bedrock", "coverage_percent": score, "covered": covered, "missing": missing,
                "strength": strength, "next_step": next_step,
                "spoken_summary": f"{strength} {next_step}"}
    except Exception as exc:
        # The app remains usable if credentials, model access, or the provider are unavailable.
        # Log only the exception type; never log an applicant's answer, prompt, or AWS credentials.
        logger.warning("Bedrock interview-coach feedback fell back to rubric mode: %s", type(exc).__name__)
        return None


def evaluate_answer(session_id: str, answer: str, input_mode: str = "typed") -> dict[str, Any]:
    if not isinstance(answer, str) or not answer.strip():
        raise ValueError("Please give an answer before requesting feedback.")
    answer = answer.strip()[:4000]
    current = _session(session_id)
    question = QUESTION_BANK[current["track_id"]]["questions"][current["index"]]
    feedback = _bedrock_feedback(question, answer, input_mode) or _offline_feedback(question, answer)
    with _lock:
        # Persist rubric IDs only—not the applicant's answer or transcript.
        current["attempts"].append({"question_id": question["id"], "score": feedback["coverage_percent"],
                                    "covered": [item["id"] for item in feedback["covered"]]})
        current["covered"].update(item["id"] for item in feedback["covered"])
    return feedback


def retry_question(session_id: str) -> dict[str, Any]:
    return get_question(session_id)


def next_question(session_id: str) -> dict[str, Any]:
    current = _session(session_id)
    with _lock:
        current["index"] += 1
        done = current["index"] >= len(QUESTION_BANK[current["track_id"]]["questions"])
    return end_session(session_id) if done else {"complete": False, **get_question(session_id)}


def end_session(session_id: str) -> dict[str, Any]:
    current = _session(session_id)
    with _lock:
        attempts = list(current["attempts"])
        _sessions.pop(session_id, None)
    scores = [item["score"] for item in attempts]
    return {"complete": True, "questions_practiced": len({item["question_id"] for item in attempts}),
            "best_coverage_percent": max(scores, default=0),
            "spoken_summary": (f"You completed {len({item['question_id'] for item in attempts})} practice questions. "
                                f"Your best rubric coverage was {max(scores, default=0)} percent. "
                                "Keep practicing concise answers with specific examples.")}
