"""Official MCP server exposing the Ability Fellows Interview Coach tools."""

from mcp.server.mcpserver import MCPServer

from ability_ai import interview_coach_core as coach

mcp = MCPServer(
    "Ability Fellows Interview Coach",
    title="Ability Fellows Interview Coach",
    description="Voice-first interview practice for blind and visually impaired digital-career candidates.",
    instructions="Use the coach tools in order: list tracks, start a session, get feedback, retry or continue, then end the session.",
    version="1.0.0",
)


@mcp.tool(name="list_tracks", description="List available Ability Fellows interview-practice tracks.")
def list_tracks() -> list[dict]:
    return coach.list_tracks()


@mcp.tool(name="start_session", description="Start a privacy-minimising practice session and return the first question.")
def start_session(track_id: str) -> dict:
    return coach.start_session(track_id)


@mcp.tool(name="get_question", description="Get the current interview question for a session.")
def get_question(session_id: str) -> dict:
    return coach.get_question(session_id)


@mcp.tool(name="evaluate_answer", description="Evaluate an answer with transparent rubric feedback. Answers are never retained in session state.")
def evaluate_answer(session_id: str, answer_text: str, input_mode: str = "typed") -> dict:
    return coach.evaluate_answer(session_id, answer_text, input_mode)


@mcp.tool(name="retry_question", description="Repeat the current interview question.")
def retry_question(session_id: str) -> dict:
    return coach.retry_question(session_id)


@mcp.tool(name="next_question", description="Move to the next question or finish the session.")
def next_question(session_id: str) -> dict:
    return coach.next_question(session_id)


@mcp.tool(name="end_session", description="End a session and return a spoken-friendly practice summary.")
def end_session(session_id: str) -> dict:
    return coach.end_session(session_id)


@mcp.tool(name="surprise_question", description="Optional AI bonus question using Amazon Bedrock; regular practice position is preserved.")
def surprise_question(session_id: str) -> dict:
    from ability_ai.surprise_round import run
    return run(coach._session(session_id), 'question')


@mcp.tool(name="evaluate_surprise", description="Bedrock feedback only for the active surprise question; learner answers are not retained.")
def evaluate_surprise(session_id: str, answer_text: str) -> dict:
    from ability_ai.surprise_round import run
    return run(coach._session(session_id), 'answer', answer_text)
