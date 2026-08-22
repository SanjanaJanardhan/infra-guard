"""
infra_guard.server

Exposes scan_terraform as an MCP tool over stdio, so an MCP client
(Claude Code, Claude Desktop, Cursor) can scan Terraform for security
misconfigurations and get back structured findings.
"""

from typing import Any

from mcp.server import MCPServer

from scanner import scan_terraform

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


if __name__ == "__main__":
    mcp.run()
