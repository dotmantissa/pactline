# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import hashlib
import json
from datetime import datetime, timezone

from genlayer import *


STATUS_ACTIVE = "active"
STATUS_PAUSED = "paused"
STATUS_BREACHED = "breached"
STATUS_CLEAR = "clear"
STATUS_UNAVAILABLE = "unavailable"
ERROR_EXPECTED = "[EXPECTED]"
ERROR_EXTERNAL = "[EXTERNAL]"
ERROR_TRANSIENT = "[TRANSIENT]"


class Pactline(gl.Contract):
    """On chain SLA registry, evidence ledger, and claim settlement engine."""

    owner: Address
    monitor_operator: Address
    agreement_seq: u256
    claim_seq: u256
    agreements: TreeMap[str, str]
    agreement_order: DynArray[str]
    snapshots: TreeMap[str, str]
    snapshot_order: DynArray[str]
    claims: TreeMap[str, str]
    claim_order: DynArray[str]
    claimed_snapshots: TreeMap[str, bool]

    def __init__(self):
        self.owner = gl.message.sender_address
        self.monitor_operator = gl.message.sender_address
        self.agreement_seq = u256(0)
        self.claim_seq = u256(0)

    def _now_epoch(self) -> u256:
        try:
            raw = getattr(gl, "message_raw", {})
            if isinstance(raw, dict) and raw.get("datetime"):
                value = str(raw["datetime"]).replace("Z", "+00:00")
                parsed = datetime.fromisoformat(value)
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=timezone.utc)
                return u256(int(parsed.timestamp()))
            return u256(int(datetime.now(timezone.utc).timestamp()))
        except Exception:
            return u256(0)

    def _agreement_key(self, agreement_id: u256) -> str:
        return "agreement_" + str(int(agreement_id)).zfill(8)

    def _claim_key(self, claim_id: u256) -> str:
        return "claim_" + str(int(claim_id)).zfill(8)

    def _snapshot_key(self, agreement_id: str, period_start: str) -> str:
        digest = hashlib.sha256(
            f"{agreement_id}:{period_start}".encode("utf-8")
        ).hexdigest()
        return "snapshot_" + digest[:48]

    def _date_epoch(self, value: str) -> u256:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return u256(int(parsed.timestamp()))
        except Exception:
            raise gl.vm.UserError(ERROR_EXPECTED + " period end is invalid")

    def _load_agreement(self, agreement_id: str) -> dict:
        key = str(agreement_id).strip()
        encoded = self.agreements.get(key, "")
        if not encoded:
            raise gl.vm.UserError(ERROR_EXPECTED + " agreement does not exist")
        return json.loads(encoded)

    def _load_snapshot(self, snapshot_id: str) -> dict:
        encoded = self.snapshots.get(str(snapshot_id).strip(), "")
        if not encoded:
            raise gl.vm.UserError(ERROR_EXPECTED + " snapshot does not exist")
        return json.loads(encoded)

    def _validate_url(self, value: str, field: str) -> str:
        url = str(value).strip()
        if not (url.startswith("https://") or url.startswith("http://")):
            raise gl.vm.UserError(ERROR_EXPECTED + f" {field} must be an http URL")
        if len(url) > 512:
            raise gl.vm.UserError(ERROR_EXPECTED + f" {field} is too long")
        return url

    def _validate_date(self, value: str, field: str) -> str:
        text = str(value).strip()
        try:
            datetime.fromisoformat(text.replace("Z", "+00:00"))
        except Exception:
            raise gl.vm.UserError(
                ERROR_EXPECTED + f" {field} must be an ISO date"
            )
        return text

    def _resolve_evidence(self, snapshot: dict) -> dict:
        url = self._validate_url(snapshot["evidence_url"], "evidence_url")

        def fetch_and_normalize() -> dict:
            try:
                response = gl.nondet.web.get(
                    url,
                    headers={"Accept": "application/json"},
                )
                if response.status >= 500:
                    raise gl.vm.UserError(
                        ERROR_TRANSIENT + f" evidence returned {response.status}"
                    )
                if response.status >= 400:
                    raise gl.vm.UserError(
                        ERROR_EXTERNAL + f" evidence returned {response.status}"
                    )
                body = response.body
                if isinstance(body, str):
                    body = body.encode("utf-8")
                parsed = json.loads(body.decode("utf-8", errors="replace"))
                if not isinstance(parsed, dict):
                    raise gl.vm.UserError(
                        ERROR_EXTERNAL + " evidence is not a JSON object"
                    )
                return {
                    "agreement_id": str(parsed.get("agreement_id", "")),
                    "period_start": str(parsed.get("period_start", "")),
                    "period_end": str(parsed.get("period_end", "")),
                    "uptime_bps": int(parsed.get("uptime_bps", -1)),
                    "total_checks": int(parsed.get("total_checks", -1)),
                    "failed_checks": int(parsed.get("failed_checks", -1)),
                    "signature": str(parsed.get("signature", "")),
                }
            except gl.vm.UserError:
                raise
            except Exception:
                raise gl.vm.UserError(
                    ERROR_EXTERNAL + " evidence could not be parsed"
                )

        return gl.eq_principle.strict_eq(fetch_and_normalize)

    def _send_value(self, recipient: Address, amount: u256) -> None:
        if amount > u256(0):
            gl.get_contract_at(recipient).emit_transfer(
                value=amount,
                on="finalized",
            )

    @gl.public.write
    def set_monitor_operator(self, operator: Address) -> None:
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError(ERROR_EXPECTED + " only the owner can set the monitor")
        self.monitor_operator = operator

    @gl.public.write.payable
    def register_sla(
        self,
        service_name: str,
        service_url: str,
        terms: str,
        threshold_bps: u256,
        window_days: u256,
        compensation_type: str,
        compensation_bps: u256,
    ) -> str:
        name = str(service_name).strip()
        if not name or len(name) > 96:
            raise gl.vm.UserError(ERROR_EXPECTED + " service name is required")
        url = self._validate_url(service_url, "service_url")
        terms_text = str(terms).strip()
        if not terms_text or len(terms_text) > 1000:
            raise gl.vm.UserError(ERROR_EXPECTED + " SLA terms are required")
        if threshold_bps < u256(1) or threshold_bps > u256(10000):
            raise gl.vm.UserError(
                ERROR_EXPECTED + " threshold must be between 0.01 and 100 percent"
            )
        if window_days < u256(1) or window_days > u256(365):
            raise gl.vm.UserError(
                ERROR_EXPECTED + " measurement window must be between 1 and 365 days"
            )
        kind = str(compensation_type).strip().lower()
        if kind not in ("refund", "credit"):
            raise gl.vm.UserError(
                ERROR_EXPECTED + " compensation must be refund or credit"
            )
        if compensation_bps < u256(1) or compensation_bps > u256(10000):
            raise gl.vm.UserError(
                ERROR_EXPECTED + " compensation must be between 0.01 and 100 percent"
            )
        if gl.message.value <= u256(0):
            raise gl.vm.UserError(ERROR_EXPECTED + " a subscription deposit is required")

        self.agreement_seq += u256(1)
        agreement_id = str(int(self.agreement_seq))
        agreement = {
            "agreement_id": agreement_id,
            "customer": str(gl.message.sender_address),
            "service_name": name,
            "service_url": url,
            "terms": terms_text,
            "threshold_bps": int(threshold_bps),
            "window_days": int(window_days),
            "compensation_type": kind,
            "compensation_bps": int(compensation_bps),
            "deposit_wei": int(gl.message.value),
            "status": STATUS_ACTIVE,
            "created_at": int(self._now_epoch()),
            "claim_count": 0,
            "last_uptime_bps": 10000,
        }
        self.agreements[agreement_id] = json.dumps(agreement, sort_keys=True)
        self.agreement_order.append(agreement_id)
        return agreement_id

    @gl.public.write
    def pause_sla(self, agreement_id: str) -> None:
        agreement = self._load_agreement(agreement_id)
        if str(gl.message.sender_address) != agreement["customer"]:
            raise gl.vm.UserError(ERROR_EXPECTED + " only the customer can pause an SLA")
        if agreement["status"] not in (STATUS_ACTIVE, STATUS_PAUSED):
            raise gl.vm.UserError(ERROR_EXPECTED + " SLA is already settled")
        agreement["status"] = (
            STATUS_PAUSED if agreement["status"] == STATUS_ACTIVE else STATUS_ACTIVE
        )
        self.agreements[str(agreement_id)] = json.dumps(agreement, sort_keys=True)

    @gl.public.write
    def publish_snapshot(
        self,
        agreement_id: str,
        period_start: str,
        period_end: str,
        uptime_bps: u256,
        total_checks: u256,
        failed_checks: u256,
        evidence_url: str,
        signature: str,
    ) -> str:
        if gl.message.sender_address != self.monitor_operator:
            raise gl.vm.UserError(
                ERROR_EXPECTED + " only the monitor operator can publish snapshots"
            )
        agreement = self._load_agreement(agreement_id)
        start = self._validate_date(period_start, "period_start")
        end = self._validate_date(period_end, "period_end")
        if end <= start:
            raise gl.vm.UserError(ERROR_EXPECTED + " period end must be after start")
        if uptime_bps > u256(10000):
            raise gl.vm.UserError(ERROR_EXPECTED + " uptime cannot exceed 100 percent")
        if total_checks <= u256(0) or failed_checks > total_checks:
            raise gl.vm.UserError(ERROR_EXPECTED + " check counts are invalid")
        if not str(signature).strip():
            raise gl.vm.UserError(ERROR_EXPECTED + " snapshot signature is required")

        snapshot_id = self._snapshot_key(str(agreement["agreement_id"]), start)
        snapshot = {
            "snapshot_id": snapshot_id,
            "agreement_id": str(agreement["agreement_id"]),
            "period_start": start,
            "period_end": end,
            "uptime_bps": int(uptime_bps),
            "total_checks": int(total_checks),
            "failed_checks": int(failed_checks),
            "evidence_url": self._validate_url(evidence_url, "evidence_url"),
            "signature": str(signature).strip(),
            "publisher": str(gl.message.sender_address),
            "published_at": int(self._now_epoch()),
        }
        self.snapshots[snapshot_id] = json.dumps(snapshot, sort_keys=True)
        self.snapshot_order.append(snapshot_id)
        agreement["last_uptime_bps"] = int(uptime_bps)
        self.agreements[str(agreement_id)] = json.dumps(agreement, sort_keys=True)
        return snapshot_id

    @gl.public.write
    def file_claim(self, agreement_id: str, snapshot_id: str) -> str:
        agreement = self._load_agreement(agreement_id)
        if str(gl.message.sender_address) != agreement["customer"]:
            raise gl.vm.UserError(ERROR_EXPECTED + " only the customer can file a claim")
        if agreement["status"] == STATUS_PAUSED:
            raise gl.vm.UserError(ERROR_EXPECTED + " resume the SLA before claiming")
        snapshot = self._load_snapshot(snapshot_id)
        if snapshot["agreement_id"] != str(agreement["agreement_id"]):
            raise gl.vm.UserError(ERROR_EXPECTED + " snapshot belongs to another SLA")
        if self.claimed_snapshots.get(str(snapshot_id), False):
            raise gl.vm.UserError(ERROR_EXPECTED + " this snapshot already has a claim")
        if self._now_epoch() < self._date_epoch(snapshot["period_end"]):
            raise gl.vm.UserError(ERROR_EXPECTED + " measurement window has not ended")
        evidence = self._resolve_evidence(snapshot)
        expected = {
            "agreement_id": snapshot["agreement_id"],
            "period_start": snapshot["period_start"],
            "period_end": snapshot["period_end"],
            "uptime_bps": int(snapshot["uptime_bps"]),
            "total_checks": int(snapshot["total_checks"]),
            "failed_checks": int(snapshot["failed_checks"]),
            "signature": snapshot["signature"],
        }
        if evidence != expected:
            raise gl.vm.UserError(
                ERROR_EXTERNAL + " fetched evidence does not match the signed snapshot"
            )

        breached = int(evidence["uptime_bps"]) < int(agreement["threshold_bps"])
        payout = u256(0)
        status = STATUS_CLEAR
        if breached:
            status = STATUS_BREACHED
            payout = (
                u256(int(agreement["deposit_wei"]))
                * u256(int(agreement["compensation_bps"]))
                // u256(10000)
            )
            if payout > u256(int(agreement["deposit_wei"])):
                payout = u256(int(agreement["deposit_wei"]))

        self.claim_seq += u256(1)
        claim_id = str(int(self.claim_seq))
        claim = {
            "claim_id": claim_id,
            "agreement_id": str(agreement["agreement_id"]),
            "customer": agreement["customer"],
            "snapshot_id": str(snapshot_id),
            "status": status,
            "uptime_bps": int(evidence["uptime_bps"]),
            "threshold_bps": int(agreement["threshold_bps"]),
            "settlement_type": agreement["compensation_type"],
            "settlement_wei": int(payout),
            "evidence_url": snapshot["evidence_url"],
            "evidence_signature": snapshot["signature"],
            "resolved_at": int(self._now_epoch()),
        }
        self.claims[claim_id] = json.dumps(claim, sort_keys=True)
        self.claim_order.append(claim_id)
        self.claimed_snapshots[str(snapshot_id)] = True
        agreement["claim_count"] = int(agreement["claim_count"]) + 1
        agreement["status"] = status
        self.agreements[str(agreement_id)] = json.dumps(agreement, sort_keys=True)
        if payout > u256(0) and agreement["compensation_type"] == "refund":
            self._send_value(gl.message.sender_address, payout)
        return claim_id

    @gl.public.view
    def get_agreement(self, agreement_id: str) -> str:
        return self.agreements.get(str(agreement_id), "")

    @gl.public.view
    def get_agreements(self) -> str:
        result = []
        for agreement_id in self.agreement_order:
            result.append(json.loads(self.agreements[agreement_id]))
        return json.dumps(result, sort_keys=True)

    @gl.public.view
    def get_snapshot(self, snapshot_id: str) -> str:
        return self.snapshots.get(str(snapshot_id), "")

    @gl.public.view
    def get_snapshots(self) -> str:
        result = []
        for snapshot_id in self.snapshot_order:
            result.append(json.loads(self.snapshots[snapshot_id]))
        return json.dumps(result, sort_keys=True)

    @gl.public.view
    def get_claim(self, claim_id: str) -> str:
        return self.claims.get(str(claim_id), "")

    @gl.public.view
    def get_claims(self) -> str:
        result = []
        for claim_id in self.claim_order:
            result.append(json.loads(self.claims[claim_id]))
        return json.dumps(result, sort_keys=True)

    @gl.public.view
    def get_counts(self) -> str:
        return json.dumps(
            {
                "agreements": int(self.agreement_seq),
                "snapshots": len(self.snapshot_order),
                "claims": int(self.claim_seq),
            },
            sort_keys=True,
        )
