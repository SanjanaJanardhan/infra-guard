"""
infra_guard.api

A plain REST API wrapping scan_terraform and scan_dockerfile, for the web
playground. Kept separate from server.py (the MCP server) — different
client shape, same underlying engine.
"""

import json
import os

import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from scanner import scan_dockerfile, scan_terraform

load_dotenv()

app = FastAPI(title="infra-guard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class ScanRequest(BaseModel):
    file_content: str
    filename: str = "main.tf"


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/scan")
def scan(req: ScanRequest) -> dict:
    return scan_terraform(req.file_content, req.filename)


@app.post("/api/scan-dockerfile")
def scan_dockerfile_endpoint(req: ScanRequest) -> dict:
    filename = req.filename if req.filename != "main.tf" else "Dockerfile"
    return scan_dockerfile(req.file_content, filename)


class ExplainRequest(BaseModel):
    check_id: str
    title: str
    resource: str
    code_snippet: str
    framework: str = "terraform"


_EXPLAIN_MODEL = "claude-haiku-4-5-20251001"

_EXPLAIN_SYSTEM_PROMPT = (
    "You are a security remediation assistant for Infrastructure-as-Code. "
    "Given a single Checkov finding, respond with ONLY a JSON object — no "
    "markdown fences, no commentary before or after — shaped exactly like: "
    '{"explanation": "2-3 sentence plain-English explanation of why this is '
    'a security issue", "fixed_code": "the corrected code that resolves the '
    'issue while preserving everything else about the resource"}'
)


def _get_anthropic_client() -> anthropic.Anthropic | None:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return None
    return anthropic.Anthropic(api_key=api_key)


@app.post("/api/explain")
def explain(req: ExplainRequest) -> dict:
    """
    Generate a plain-English explanation and a suggested fix for one
    finding, grounded in its real check_id/resource/code_snippet. Returns
    {"configured": false} if ANTHROPIC_API_KEY isn't set — deliberately not
    set on the public deployment, so this only works when run locally with
    your own key (see README).
    """
    client = _get_anthropic_client()
    if client is None:
        return {"configured": False}

    user_prompt = (
        f"Framework: {req.framework}\n"
        f"Checkov check: {req.check_id} - {req.title}\n"
        f"Resource: {req.resource}\n\n"
        f"Original code:\n```\n{req.code_snippet}\n```"
    )

    try:
        response = client.messages.create(
            model=_EXPLAIN_MODEL,
            max_tokens=1024,
            system=_EXPLAIN_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
        raw = response.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.strip("`").removeprefix("json").strip()
        parsed = json.loads(raw)
        return {
            "configured": True,
            "explanation": parsed["explanation"],
            "fixed_code": parsed["fixed_code"],
        }
    except Exception as e:
        print(f"[explain] error: {e}")
        return {"configured": True, "error": "Could not generate a fix right now. Try again in a moment."}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8001)))
