# infra-guard

An MCP server that scans Terraform and Dockerfiles for real security misconfigurations — open security groups, public S3 buckets, wildcard IAM policies, hardcoded secrets, containers running as root — and hands back structured findings instead of a guess.

It plugs into Claude Code, Claude Desktop, or Cursor as a tool. Ask your AI assistant to review your infrastructure code, and it calls `infra-guard`, gets back real findings from [Checkov](https://www.checkov.io/), and explains them to you.

**Try it in the browser:** [infra-guard-frontend-production.up.railway.app](https://infra-guard-frontend-production.up.railway.app) — paste Terraform, click Scan, see real findings. No install required.

**MCP endpoint:** `https://infra-guard-production.up.railway.app/mcp`

## Why this exists

I did cloud infrastructure work at A.P. Moller–Maersk — Terraform, Docker, AWS provisioning at real scale. Most portfolio projects are generic web apps; this one is the tool I actually wished existed: something that turns "does my Terraform have any obvious security holes" into a real, structured answer instead of an AI assistant's best guess.

`infra-guard` doesn't guess. It runs your file through Checkov, a real static analysis engine with hundreds of built-in checks, and returns the actual findings — check ID, title, affected resource, line range, code snippet. The hosting LLM (Claude, or whatever's on the other end of the MCP connection) explains the findings in plain English. The tool's job is just to be correct.

## How it works

```
scanner.py   → core engine: scan_terraform(...) / scan_dockerfile(...) -> structured dict
server.py    → wraps both as MCP tools, served over stdio or Streamable HTTP
api.py       → wraps both as a plain REST API (POST /api/scan, POST /api/scan-dockerfile)
frontend/    → React + Vite playground that calls api.py (Terraform only, for now)
```

`scanner.py` shells out to the Checkov CLI, parses its JSON output, and returns the same shape regardless of which framework ran:

```json
{
  "summary": { "passed": 14, "failed": 34, "total_checks": 48 },
  "findings": [
    {
      "check_id": "CKV_AWS_24",
      "title": "Ensure no security groups allow ingress from 0.0.0.0:0 to port 22",
      "resource": "aws_security_group.app_sg",
      "start_line": 6,
      "end_line": 24,
      "code_snippet": "resource \"aws_security_group\" \"app_sg\" { ... }"
    }
  ]
}
```

`server.py` exposes two MCP tools, `scan_terraform_file(file_content, filename)` and `scan_dockerfile_file(file_content, filename)`, with no interpretation layer of its own — the structured data goes straight to whatever LLM is hosting the session.

[`insecure_example.tf`](insecure_example.tf) has four intentional Terraform issues (open SSH ingress, a public+unencrypted S3 bucket, a wildcard IAM policy, a hardcoded RDS password) — 14 passed / 34 failed checks. [`insecure_example.Dockerfile`](insecure_example.Dockerfile) has five (unpinned base image, `ADD` instead of `COPY`, port 22 exposed, no `HEALTHCHECK`, runs as root) — 26 passed / 5 failed checks.

## Running it locally

Requires [uv](https://docs.astral.sh/uv/).

```bash
git clone https://github.com/SanjanaJanardhan/infra-guard.git
cd infra-guard
uv sync
```

Run the scanner directly:

```bash
uv run python3 scanner.py
```

Run the MCP server over stdio (for local clients like Claude Code/Desktop):

```bash
uv run python3 server.py
```

Run it over Streamable HTTP (for remote clients, or to reproduce the deployed setup):

```bash
uv run python3 server.py --transport streamable-http --port 8000
```

## Connecting it to an MCP client

**Claude Code / Claude Desktop** — add to `.mcp.json` (project-level) or your global MCP config:

```json
{
  "mcpServers": {
    "infra-guard": {
      "command": "uv",
      "args": ["--directory", "/absolute/path/to/infra-guard", "run", "python3", "server.py"]
    }
  }
}
```

**Any Streamable HTTP client** (including the live deployment above) — point it at:

```
https://infra-guard-production.up.railway.app/mcp
```

## Running the playground locally

```bash
# terminal 1 — API
uv run python3 api.py

# terminal 2 — frontend
cd frontend
npm install
npm run dev
```

The frontend reads its API base URL from `VITE_API_URL` (see `frontend/.env.local`), defaulting to `http://localhost:8001`.

## Deployment

Three services on [Railway](https://railway.app), all built from Docker/Nixpacks with no manual server config:

- **MCP server** — `Dockerfile`, Streamable HTTP
- **REST API** — `Dockerfile.api`, same `scanner.py` core, powers the playground
- **Frontend** — Railway's Nixpacks builder auto-detects the Vite app in `frontend/`; `VITE_API_URL` is set at build time to the deployed API's URL

Both Python services read `PORT` from the environment, so they adapt to whatever port Railway assigns with no config changes.

## Stack

Python · [Checkov](https://www.checkov.io/) · [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk) · FastAPI · React · Vite · [uv](https://docs.astral.sh/uv/) · Docker · Railway

## Roadmap

- [x] Core Terraform scanning engine
- [x] MCP server over stdio
- [x] Streamable HTTP transport
- [x] Deployed to Railway
- [x] Web frontend with a live playground
- [x] Dockerfile scanning (scanner, MCP tool, REST API — not yet in the playground UI)
- [ ] Cost-impact estimate for findings

## License

MIT
