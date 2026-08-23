"""
infra_guard.api

A plain REST API wrapping scan_terraform, for the web playground. Kept
separate from server.py (the MCP server) — different client shape, same
underlying engine.
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from scanner import scan_terraform

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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8001)))
