"""
infra_guard.scanner

Wraps Checkov to produce clean, structured findings from Terraform or
Dockerfile input. This is the core engine — the MCP server, the REST API,
and the web frontend all call into this same module, so there's exactly
one place the scanning logic lives.
"""

import json
import subprocess
import tempfile
import os

# Checkov's open-source CLI always returns `severity: null` for every check —
# real severity ratings only exist when a scan is connected to Bridgecrew /
# Prisma Cloud (via --bc-api-key), which means an account and sending scan
# content to that platform. We don't do that, so severity is assigned locally
# instead: exact-match on check_id for checks we've reasoned about, "info" for
# anything else. Extend this table as new check IDs come up.
_SEVERITY_MAP: dict[str, str] = {
    # Network exposure
    "CKV_AWS_24": "critical",  # SSH open to 0.0.0.0/0
    "CKV_AWS_260": "critical",  # HTTP(S) admin ports open
    "CKV_AWS_382": "medium",  # unrestricted egress
    "CKV2_AWS_5": "low",  # security group not attached to a resource
    "CKV_AWS_23": "low",  # security group/rule missing a description
    # IAM
    "CKV_AWS_62": "critical",  # full admin (*:* ) IAM policy
    "CKV_AWS_63": "critical",  # wildcard action
    "CKV_AWS_286": "critical",  # privilege escalation
    "CKV_AWS_287": "critical",  # credentials exposure
    "CKV_AWS_288": "critical",  # data exfiltration
    "CKV2_AWS_40": "critical",  # full IAM privileges
    "CKV_AWS_289": "high",  # permissions management without constraints
    "CKV_AWS_290": "high",  # write access without constraints
    "CKV_AWS_355": "high",  # wildcard resource
    # Storage — public access / encryption
    "CKV2_AWS_6": "high",  # S3 bucket missing public access block
    "CKV_AWS_53": "high",
    "CKV_AWS_54": "high",
    "CKV_AWS_55": "high",
    "CKV_AWS_56": "high",
    "CKV_AWS_16": "high",  # RDS not encrypted at rest
    "CKV_AWS_145": "medium",  # S3 not encrypted with KMS
    "CKV_AWS_21": "medium",  # S3 versioning disabled
    "CKV_AWS_18": "medium",  # S3 access logging disabled
    "CKV_AWS_144": "low",  # S3 cross-region replication
    "CKV2_AWS_61": "low",  # S3 lifecycle configuration
    "CKV2_AWS_62": "low",  # S3 event notifications
    # RDS operational hygiene
    "CKV_AWS_157": "medium",  # Multi-AZ disabled
    "CKV_AWS_161": "medium",  # IAM auth disabled
    "CKV_AWS_293": "medium",  # deletion protection disabled
    "CKV_AWS_129": "medium",  # logging disabled
    "CKV2_AWS_30": "low",  # query logging (Postgres)
    "CKV_AWS_118": "low",  # enhanced monitoring
    "CKV_AWS_226": "low",  # auto minor version upgrade
    "CKV_AWS_353": "low",  # performance insights
    "CKV2_AWS_60": "low",  # copy tags to snapshot
    # Dockerfile
    "CKV_DOCKER_1": "high",  # port 22 exposed
    "CKV_DOCKER_3": "high",  # no USER — runs as root
    "CKV_DOCKER_4": "medium",  # ADD instead of COPY
    "CKV_DOCKER_7": "medium",  # unpinned/":latest" base image
    "CKV_DOCKER_2": "low",  # missing HEALTHCHECK
}


def _run_checkov(file_content: str, filename: str, framework: str | None = None) -> dict:
    with tempfile.TemporaryDirectory() as tmp_dir:
        file_path = os.path.join(tmp_dir, filename)
        with open(file_path, "w") as f:
            f.write(file_content)

        cmd = ["checkov", "-f", file_path, "-o", "json", "--quiet"]
        if framework:
            cmd += ["--framework", framework]

        result = subprocess.run(
            cmd,
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
                "error": "Could not parse file. Check for syntax errors.",
                "raw_output": result.stdout[-2000:] + result.stderr[-2000:],
            }

    results = data.get("results", {})
    failed = results.get("failed_checks", [])
    summary = data.get("summary", {})

    # Checkov never crashes on malformed input — it silently reports
    # parsing_errors and returns a "clean" 0/0/0 result, which reads as a
    # false-positive pass rather than "this doesn't look like valid input."
    # Surface it as a real error instead.
    if summary.get("parsing_errors", 0) > 0 and summary.get("resource_count", 0) == 0:
        return {
            "error": "Could not parse this file — it doesn't look like valid "
            f"{framework or 'Terraform'}. Check for syntax errors.",
        }

    findings = []
    for check in failed:
        code_lines = [line for _, line in (check.get("code_block") or [])]
        # Checkov's Dockerfile framework embeds the full scanned file path in
        # `resource` (e.g. "/tmp/xyz/Dockerfile.FROM"); Terraform's doesn't.
        # Normalize both to use the friendly filename.
        resource = check["resource"].replace(file_path, filename)
        findings.append({
            "check_id": check["check_id"],
            "title": check["check_name"],
            "resource": resource,
            "severity": _SEVERITY_MAP.get(check["check_id"], "info"),
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
                    "severity": "critical",
                    "start_line": 6,
                    "end_line": 24,
                    "code_snippet": "resource \"aws_security_group\" ...",
                },
                ...
            ]
        }
    """
    return _run_checkov(file_content, filename)


def scan_dockerfile(file_content: str, filename: str = "Dockerfile") -> dict:
    """
    Run Checkov against a Dockerfile's contents and return clean,
    structured findings, in the same shape as scan_terraform.

    Args:
        file_content: the raw text of a Dockerfile
        filename: used only for a friendlier label in output
    """
    return _run_checkov(file_content, filename, framework="dockerfile")


if __name__ == "__main__":
    # quick manual test
    with open("insecure_example.tf") as f:
        content = f.read()
    output = scan_terraform(content)
    print(json.dumps(output, indent=2))
