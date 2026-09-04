import json


def evidence_body(
    service_id: str,
    period_start: str,
    period_end: str,
    uptime_bps: int,
    total_checks: int,
    failed_checks: int,
    signature: str,
) -> str:
    return json.dumps(
        {
            "service_id": service_id,
            "period_start": period_start,
            "period_end": period_end,
            "uptime_bps": uptime_bps,
            "total_checks": total_checks,
            "failed_checks": failed_checks,
            "signature": signature,
        }
    )
