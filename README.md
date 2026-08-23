# infra-guard

An MCP server that scans Terraform for real security misconfigurations — open security groups, public S3 buckets, wildcard IAM policies, hardcoded secrets — and hands back structured findings instead of a guess.

It plugs into Claude Code, Claude Desktop, or Cursor as a tool. Ask your AI assistant to review your Terraform, and it calls `infra-guard`, gets back real findings from [Checkov](https://www.checkov.io/), and explains them to you.

**Live endpoint:** `https://infra-guard-production.up.railway.app/mcp`

## Why this exists

I did cloud infrastructure work at A.P. Moller–Maersk — Terraform, Docker, AWS provisioning at real scale. Most portfolio projects are generic web apps; this one is the tool I actually wished existed: something that turns "does my Terraform have any obvious security holes" into a real, structured answer instead of an AI assistant's best guess.

`infra-guard` doesn't guess. It runs your `.tf` file through Checkov, a real static analysis engine with hundreds of built-in AWS/Azure/GCP checks, and returns the actual findings — check ID, title, affected resource, line range, code snippet. The hosting LLM (Claude, or whatever's on the other end of the MCP connection) explains the findings in plain English. The tool's job is just to be correct.

## How it works

```
scanner.py   → core engine: scan_terraform(file_content, filename) -> structured dict
server.py    → wraps it as an MCP tool, served over stdio or Streamable HTTP
```

`scanner.py` shells out to the Checkov CLI, parses its JSON output, and returns:

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

`server.py` exposes this as a single MCP tool, `scan_terraform_file(file_content, filename)`, with no interpretation layer of its own — the structured data goes straight to whatever LLM is hosting the session.

[`insecure_example.tf`](insecure_example.tf) is a sample file with four intentional issues (open SSH ingress, a public+unencrypted S3 bucket, a wildcard IAM policy, a hardcoded RDS password) that Checkov reliably catches — 14 passed / 34 failed checks.

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

## Deployment

Containerized with a single `Dockerfile` (Python 3.13-slim + [uv](https://docs.astral.sh/uv/)), deployed on [Railway](https://railway.app) building directly from the Dockerfile. The server reads `PORT` from the environment so it adapts to whatever port the platform assigns, with no config changes needed.

## Stack

Python · [Checkov](https://www.checkov.io/) · [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk) · [uv](https://docs.astral.sh/uv/) · Docker · Railway

## Roadmap

- [x] Core Terraform scanning engine
- [x] MCP server over stdio
- [x] Streamable HTTP transport
- [x] Deployed to Railway
- [ ] Dockerfile scanning
- [ ] Cost-impact estimate for findings
- [ ] Web frontend with a live playground

## License

MIT
