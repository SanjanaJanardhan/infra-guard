"""
infra_guard.scanner

Wraps Checkov to produce clean, structured findings from a Terraform file.
This is the core engine — both the MCP server and the web frontend call
into this same module, so there's exactly one place the scanning logic lives.
"""

import json
import subprocess
import tempfile
import os


def scan_terraform(file_content: str, filename: str = "main.tf") -> dict:
    """
    Run Checkov against a Terraform file's contents and return clean,
    structured findings.

    Args:
        file_content: the raw text of a .tf file
        filename: used only for a friendlier label in output

    Returns:
        {
            "summary": {"passed": int, "failed": int, "total_checks": int},
            "findings": [
                {
                    "check_id": "CKV_AWS_24",
                    "title": "Ensure no security groups allow ingress from 0.0.0.0:0 to port 22",
                    "resource": "aws_security_group.app_sg",
                    "start_line": 6,
                    "end_line": 24,
                    "code_snippet": "resource \"aws_security_group\" ...",
                },
                ...
            ]
        }
    """
    with tempfile.TemporaryDirectory() as tmp_dir:
        tf_path = os.path.join(tmp_dir, filename)
        with open(tf_path, "w") as f:
            f.write(file_content)

        result = subprocess.run(
            ["checkov", "-f", tf_path, "-o", "json", "--quiet"],
            capture_output=True,
            text=True,
            timeout=60,
        )

        # Checkov exits non-zero when it finds failed checks — that's expected,
        # not an error. Only treat it as a real failure if there's no JSON output.
        try:
            data = json.loads(result.stdout)
        except json.JSONDecodeError:
            return {
                "error": "Could not parse Terraform file. Check for syntax errors.",
                "raw_output": result.stdout[-2000:] + result.stderr[-2000:],
            }

    results = data.get("results", {})
    failed = results.get("failed_checks", [])
    summary = data.get("summary", {})

    findings = []
    for check in failed:
        code_lines = [line for _, line in (check.get("code_block") or [])]
        findings.append({
            "check_id": check["check_id"],
            "title": check["check_name"],
            "resource": check["resource"],
            "start_line": check["file_line_range"][0],
            "end_line": check["file_line_range"][1],
            "code_snippet": "".join(code_lines).rstrip(),
        })

    return {
        "summary": {
            "passed": summary.get("passed", 0),
            "failed": summary.get("failed", len(failed)),
            "total_checks": summary.get("passed", 0) + summary.get("failed", len(failed)),
        },
        "findings": findings,
    }


if __name__ == "__main__":
    # quick manual test
    with open("insecure_example.tf") as f:
        content = f.read()
    output = scan_terraform(content)
    print(json.dumps(output, indent=2))
