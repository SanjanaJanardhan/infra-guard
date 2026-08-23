"""
infra_guard.server

Exposes scan_terraform and scan_dockerfile as MCP tools over stdio or
Streamable HTTP, so an MCP client (Claude Code, Claude Desktop, Cursor) can
scan Terraform or Dockerfiles for security misconfigurations and get back
structured findings.
"""

import argparse
import os
from typing import Any

from mcp.server import MCPServer

from scanner import scan_dockerfile, scan_terraform

mcp = MCPServer("infra-guard")


@mcp.tool()
def scan_terraform_file(file_content: str, filename: str = "main.tf") -> dict[str, Any]:
    """
    Scan Terraform (.tf) file content for security misconfigurations using
    Checkov and return structured findings.

    Each finding includes the Checkov check ID, a human-readable title, the
    affected resource, its line range in the file, and the offending code
    snippet. Use this whenever the user asks to review, audit, or check the
    security of Terraform code.

    Args:
        file_content: the raw text of a .tf file
        filename: original filename, used only for a friendlier label in output
    """
    return scan_terraform(file_content, filename)


@mcp.tool()
def scan_dockerfile_file(file_content: str, filename: str = "Dockerfile") -> dict[str, Any]:
    """
    Scan Dockerfile content for security misconfigurations using Checkov
    and return structured findings, in the same shape as
    scan_terraform_file (check ID, title, resource, line range, code
    snippet). Use this whenever the user asks to review, audit, or check
    the security of a Dockerfile.

    Args:
        file_content: the raw text of a Dockerfile
        filename: original filename, used only for a friendlier label in output
    """
    return scan_dockerfile(file_content, filename)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--transport",
        choices=["stdio", "streamable-http"],
        default="stdio",
        help="stdio for local MCP clients (Claude Code, Claude Desktop); "
        "streamable-http for remote deployment",
    )
    parser.add_argument("--host", default=os.environ.get("HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8000)))
    args = parser.parse_args()

    if args.transport == "stdio":
        mcp.run()
    else:
        # Stateless: each tool call is self-contained, so no session state
        # needs to survive between requests or across restarts/scaling.
        mcp.run(transport="streamable-http", host=args.host, port=args.port, stateless_http=True)
