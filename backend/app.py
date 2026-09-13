from __future__ import annotations

import os
import json
from pathlib import Path
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from agents import Attempt, build_response

try:
    import weave
except ImportError:
    weave = None


app = FastAPI(title="PipeSense Voice Agents", version="0.1.0")


class TelemetrySnapshot(BaseModel):
    events_count: int = Field(default=0, ge=0, le=2000)
    camera_frames_seen: int = Field(default=0, ge=0, le=100000)
    input_mode: Literal["keyboard_mouse", "camera", "mixed"] = "keyboard_mouse"


class AttemptRequest(BaseModel):
    attempt_number: int = Field(ge=1, le=1000)
    score: float = Field(ge=0, le=100)
    previous_score: float = Field(default=-1, ge=-1, le=100)
    primary_issue: Literal["sequence", "height_alignment", "connection_gap", "none"]
    elapsed_seconds: float = Field(default=0, ge=0, le=7200)
    telemetry: TelemetrySnapshot | None = None

    @field_validator("score", "previous_score")
    @classmethod
    def _round_scores(cls, value: float) -> float:
        # Keep bounded numeric telemetry deterministic across runtime/platforms.
        return round(float(value), 2)


def _evaluate(request: AttemptRequest):
    payload = request.model_dump(exclude={"telemetry"})
    return build_response(Attempt(**payload))


if weave and os.getenv("PIPESENSE_ENABLE_WEAVE_TRACING", "").strip().lower() in {"1", "true", "yes", "on"} and os.getenv("WANDB_API_KEY"):
    weave.init(os.getenv("WANDB_WEAVE_PROJECT", "pipesense-hackathon"))
    evaluate_attempt = weave.op(name="pipesense/attempt-loop")(_evaluate)
    _tracing_status = {"configured": True, "active": True}
else:
    evaluate_attempt = _evaluate
    _tracing_status = {
        "configured": os.getenv("PIPESENSE_ENABLE_WEAVE_TRACING", "").strip().lower() in {"1", "true", "yes", "on"},
        "active": False,
    }


@app.get("/health")
def health():
    return {
        "ok": True,
        "tracing": _tracing_status,
        "inference": {
            "configured": os.getenv("PIPESENSE_ENABLE_WANDB_INFERENCE", "").strip().lower() in {"1", "true", "yes", "on"},
            "has_api_key": bool(os.getenv("WANDB_API_KEY")),
        },
        "voice": {
            "configured": bool(os.getenv("ELEVENLABS_API_KEY") and os.getenv("ELEVENLABS_AGENT_ID")),
            "provider": "elevenlabs-live" if os.getenv("ELEVENLABS_API_KEY") and os.getenv("ELEVENLABS_AGENT_ID") else None,
        },
    }


@app.post("/v1/voice/signed-url")
def voice_signed_url():
    api_key = os.getenv("ELEVENLABS_API_KEY")
    agent_id = os.getenv("ELEVENLABS_AGENT_ID")
    if not api_key or not agent_id:
        return {"configured": False, "error": "voice_not_configured"}
    endpoint = "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?" + urlencode({"agent_id": agent_id})
    request = Request(endpoint, headers={"xi-api-key": api_key, "accept": "application/json"})
    try:
        with urlopen(request, timeout=12) as response:
            payload = json.loads(response.read())
        signed_url = payload.get("signed_url")
        if not signed_url:
            return {"configured": True, "error": "invalid_provider_response"}
        return {"configured": True, "provider": "elevenlabs-live", "signed_url": signed_url}
    except (HTTPError, URLError, TimeoutError, ValueError) as error:
        return {"configured": True, "error": type(error).__name__}


@app.post("/v1/attempts/evaluate")
def evaluate(request: AttemptRequest):
    return evaluate_attempt(request)


web_dir = Path(__file__).resolve().parent.parent / "web"
if web_dir.exists():
    app.mount("/", StaticFiles(directory=str(web_dir), html=True), name="web")
