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
    """Provider service registry, SLA coverage pool, evidence ledger, and settlement engine."""

    owner: Address
    monitor_operator: Address
    service_seq: u256
    subscription_seq: u256
    snapshot_seq: u256
    claim_seq: u256
    services: TreeMap[str, str]
    service_order: DynArray[str]
    subscriptions: TreeMap[str, str]
    subscription_order: DynArray[str]
    subscription_index: TreeMap[str, str]
    snapshots: TreeMap[str, str]
    snapshot_order: DynArray[str]
    claims: TreeMap[str, str]
    claim_order: DynArray[str]
    claimed_windows: TreeMap[str, bool]

    def __init__(self):
        self.owner = gl.message.sender_address
        self.monitor_operator = gl.message.sender_address
        self.service_seq = u256(0)
        self.subscription_seq = u256(0)
        self.snapshot_seq = u256(0)
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

    def _date_epoch(self, value: str) -> u256:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return u256(int(parsed.timestamp()))
        except Exception:
            raise gl.vm.UserError(ERROR_EXPECTED + " period end is invalid")

    def _service_key(self, service_id: u256) -> str:
        return str(int(service_id))

    def _snapshot_key(self, service_id: str, period_start: str) -> str:
        digest = hashlib.sha256(
            f"{service_id}:{period_start}".encode("utf-8")
        ).hexdigest()
        return "snapshot_" + digest[:48]

    def _subscription_key(self, service_id: str, customer: str) -> str:
        digest = hashlib.sha256(
            f"{service_id}:{customer}".encode("utf-8")
        ).hexdigest()
        return "subscription_index_" + digest[:48]

    def _claim_key(self, subscription_id: str, snapshot_id: str) -> str:
        digest = hashlib.sha256(
            f"{subscription_id}:{snapshot_id}".encode("utf-8")
        ).hexdigest()
        return "claim_window_" + digest[:48]

    def _load_service(self, service_id: str) -> dict:
        key = str(service_id).strip()
        encoded = self.services.get(key, "")
        if not encoded:
            raise gl.vm.UserError(ERROR_EXPECTED + " service does not exist")
        return json.loads(encoded)

    def _load_subscription(self, subscription_id: str) -> dict:
        key = str(subscription_id).strip()
        encoded = self.subscriptions.get(key, "")
        if not encoded:
            raise gl.vm.UserError(ERROR_EXPECTED + " subscription does not exist")
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

    def _max_payout(self, service: dict, subscription_fee: int) -> u256:
        return (
            u256(subscription_fee)
            * u256(int(service["compensation_bps"]))
            // u256(10000)
        )

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
                    "service_id": str(parsed.get("service_id", "")),
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
    def register_service(
        self,
        service_name: str,
        service_url: str,
        terms: str,
        threshold_bps: u256,
        window_days: u256,
        compensation_type: str,
        compensation_bps: u256,
        subscription_price_wei: u256,
    ) -> str:
        name = str(service_name).strip()
        if not name or len(name) > 96:
            raise gl.vm.UserError(ERROR_EXPECTED + " service name is required")
        url = self._validate_url(service_url, "service_url")
        terms_text = str(terms).strip()
        if not terms_text or len(terms_text) > 1000:
            raise gl.vm.UserError(ERROR_EXPECTED + " service terms are required")
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
        if subscription_price_wei <= u256(0):
            raise gl.vm.UserError(
                ERROR_EXPECTED + " subscription price is required"
            )
        if gl.message.value <= u256(0):
            raise gl.vm.UserError(
                ERROR_EXPECTED + " provider collateral is required"
            )
        max_payout = self._max_payout(
            {"compensation_bps": int(compensation_bps)},
            int(subscription_price_wei),
        )
        if max_payout <= u256(0) or gl.message.value < max_payout:
            raise gl.vm.UserError(
                ERROR_EXPECTED + " collateral must cover one subscription claim"
            )

        self.service_seq += u256(1)
        service_id = self._service_key(self.service_seq)
        service = {
            "service_id": service_id,
            "provider": str(gl.message.sender_address),
            "service_name": name,
            "service_url": url,
            "terms": terms_text,
            "threshold_bps": int(threshold_bps),
            "window_days": int(window_days),
            "compensation_type": kind,
            "compensation_bps": int(compensation_bps),
            "subscription_price_wei": int(subscription_price_wei),
            "collateral_wei": int(gl.message.value),
            "reserved_wei": 0,
            "provider_revenue_wei": 0,
            "subscriber_count": 0,
            "status": STATUS_ACTIVE,
            "created_at": int(self._now_epoch()),
            "last_uptime_bps": 10000,
        }
        self.services[service_id] = json.dumps(service, sort_keys=True)
        self.service_order.append(service_id)
        return service_id

    @gl.public.write.payable
    def add_service_collateral(self, service_id: str) -> None:
        service = self._load_service(service_id)
        if str(gl.message.sender_address) != service["provider"]:
            raise gl.vm.UserError(
                ERROR_EXPECTED + " only the provider can add collateral"
            )
        if gl.message.value <= u256(0):
            raise gl.vm.UserError(ERROR_EXPECTED + " collateral must be positive")
        service["collateral_wei"] = int(service["collateral_wei"]) + int(
            gl.message.value
        )
        self.services[str(service_id)] = json.dumps(service, sort_keys=True)

    @gl.public.write
    def pause_service(self, service_id: str) -> None:
        service = self._load_service(service_id)
        if str(gl.message.sender_address) != service["provider"]:
            raise gl.vm.UserError(
                ERROR_EXPECTED + " only the provider can pause a service"
            )
        if service["status"] not in (STATUS_ACTIVE, STATUS_PAUSED):
            raise gl.vm.UserError(ERROR_EXPECTED + " service is already closed")
        service["status"] = (
            STATUS_PAUSED
            if service["status"] == STATUS_ACTIVE
            else STATUS_ACTIVE
        )
        self.services[str(service_id)] = json.dumps(service, sort_keys=True)

    @gl.public.write
    def withdraw_provider_revenue(
        self, service_id: str, amount_wei: u256
    ) -> None:
        service = self._load_service(service_id)
        if str(gl.message.sender_address) != service["provider"]:
            raise gl.vm.UserError(
                ERROR_EXPECTED + " only the provider can withdraw revenue"
            )
        if amount_wei <= u256(0) or amount_wei > u256(
            int(service["provider_revenue_wei"])
        ):
            raise gl.vm.UserError(ERROR_EXPECTED + " revenue amount is unavailable")
        service["provider_revenue_wei"] = int(
            u256(int(service["provider_revenue_wei"])) - amount_wei
        )
        self.services[str(service_id)] = json.dumps(service, sort_keys=True)
        self._send_value(gl.message.sender_address, amount_wei)

    @gl.public.write.payable
    def subscribe_service(self, service_id: str) -> str:
        service = self._load_service(service_id)
        if service["status"] != STATUS_ACTIVE:
            raise gl.vm.UserError(
                ERROR_EXPECTED + " service is not accepting subscribers"
            )
        if str(gl.message.sender_address) == service["provider"]:
            raise gl.vm.UserError(
                ERROR_EXPECTED + " provider cannot subscribe to its own service"
            )
        price = u256(int(service["subscription_price_wei"]))
        if gl.message.value != price:
            raise gl.vm.UserError(
                ERROR_EXPECTED + " subscription payment does not match the price"
            )
        max_payout = self._max_payout(service, int(price))
        available = u256(int(service["collateral_wei"])) - u256(
            int(service["reserved_wei"])
        )
        if available < max_payout:
            raise gl.vm.UserError(
                ERROR_EXPECTED + " provider collateral is fully reserved"
            )

        index_key = self._subscription_key(
            str(service["service_id"]), str(gl.message.sender_address)
        )
        existing_id = self.subscription_index.get(index_key, "")
        if existing_id:
            existing = self._load_subscription(existing_id)
            if existing["status"] == STATUS_ACTIVE:
                raise gl.vm.UserError(
                    ERROR_EXPECTED + " customer already has an active subscription"
                )

        self.subscription_seq += u256(1)
        subscription_id = str(int(self.subscription_seq))
        subscription = {
            "subscription_id": subscription_id,
            "service_id": str(service["service_id"]),
            "customer": str(gl.message.sender_address),
            "provider": service["provider"],
            "subscription_price_wei": int(price),
            "max_payout_wei": int(max_payout),
            "started_at": int(self._now_epoch()),
            "status": STATUS_ACTIVE,
            "claim_count": 0,
            "compensated_wei": 0,
        }
        self.subscriptions[subscription_id] = json.dumps(
            subscription, sort_keys=True
        )
        self.subscription_order.append(subscription_id)
        self.subscription_index[index_key] = subscription_id
        service["reserved_wei"] = int(
            u256(int(service["reserved_wei"])) + max_payout
        )
        service["provider_revenue_wei"] = int(
            u256(int(service["provider_revenue_wei"])) + price
        )
        service["subscriber_count"] = int(service["subscriber_count"]) + 1
        self.services[str(service_id)] = json.dumps(service, sort_keys=True)
        return subscription_id

    @gl.public.write
    def publish_snapshot(
        self,
        service_id: str,
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
        service = self._load_service(service_id)
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

        snapshot_id = self._snapshot_key(str(service["service_id"]), start)
        if self.snapshots.get(snapshot_id, ""):
            raise gl.vm.UserError(ERROR_EXPECTED + " snapshot already exists")
        snapshot = {
            "snapshot_id": snapshot_id,
            "service_id": str(service["service_id"]),
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
        self.snapshot_seq += u256(1)
        self.snapshots[snapshot_id] = json.dumps(snapshot, sort_keys=True)
        self.snapshot_order.append(snapshot_id)
        service["last_uptime_bps"] = int(uptime_bps)
        self.services[str(service_id)] = json.dumps(service, sort_keys=True)
        return snapshot_id

    @gl.public.write
    def file_claim(self, subscription_id: str, snapshot_id: str) -> str:
        subscription = self._load_subscription(subscription_id)
        if str(gl.message.sender_address) != subscription["customer"]:
            raise gl.vm.UserError(
                ERROR_EXPECTED + " only the subscriber can file a claim"
            )
        if subscription["status"] != STATUS_ACTIVE:
            raise gl.vm.UserError(ERROR_EXPECTED + " subscription is not active")
        service = self._load_service(subscription["service_id"])
        snapshot = self._load_snapshot(snapshot_id)
        if snapshot["service_id"] != str(service["service_id"]):
            raise gl.vm.UserError(
                ERROR_EXPECTED + " snapshot belongs to another service"
            )
        if self.claimed_windows.get(
            self._claim_key(subscription_id, snapshot_id), False
        ):
            raise gl.vm.UserError(
                ERROR_EXPECTED + " this subscription window already has a claim"
            )
        if self._now_epoch() < self._date_epoch(snapshot["period_end"]):
            raise gl.vm.UserError(ERROR_EXPECTED + " measurement window has not ended")
        if self._date_epoch(snapshot["period_end"]) <= u256(
            int(subscription["started_at"])
        ):
            raise gl.vm.UserError(
                ERROR_EXPECTED + " snapshot predates the subscription"
            )
        evidence = self._resolve_evidence(snapshot)
        expected = {
            "service_id": snapshot["service_id"],
            "period_start": snapshot["period_start"],
            "period_end": snapshot["period_end"],
            "uptime_bps": int(snapshot["uptime_bps"]),
            "total_checks": int(snapshot["total_checks"]),
            "failed_checks": int(snapshot["failed_checks"]),
            "signature": snapshot["signature"],
        }
        if evidence != expected:
            raise gl.vm.UserError(
                ERROR_EXTERNAL + " fetched evidence does not match the snapshot"
            )

        breached = int(evidence["uptime_bps"]) < int(service["threshold_bps"])
        max_payout = u256(int(subscription["max_payout_wei"]))
        payout = max_payout if breached else u256(0)
        if breached and u256(int(service["collateral_wei"])) < payout:
            raise gl.vm.UserError(
                ERROR_EXPECTED + " provider collateral is insufficient for this claim"
            )

        service["reserved_wei"] = int(
            u256(int(service["reserved_wei"])) - max_payout
        )
        if payout > u256(0):
            service["collateral_wei"] = int(
                u256(int(service["collateral_wei"])) - payout
            )
        self.services[str(service["service_id"])] = json.dumps(
            service, sort_keys=True
        )

        self.claim_seq += u256(1)
        claim_id = str(int(self.claim_seq))
        status = STATUS_BREACHED if breached else STATUS_CLEAR
        claim = {
            "claim_id": claim_id,
            "service_id": str(service["service_id"]),
            "subscription_id": str(subscription["subscription_id"]),
            "customer": subscription["customer"],
            "provider": service["provider"],
            "snapshot_id": str(snapshot_id),
            "status": status,
            "uptime_bps": int(evidence["uptime_bps"]),
            "threshold_bps": int(service["threshold_bps"]),
            "settlement_type": service["compensation_type"],
            "settlement_wei": int(payout),
            "evidence_url": snapshot["evidence_url"],
            "evidence_signature": snapshot["signature"],
            "resolved_at": int(self._now_epoch()),
        }
        self.claims[claim_id] = json.dumps(claim, sort_keys=True)
        self.claim_order.append(claim_id)
        self.claimed_windows[self._claim_key(subscription_id, snapshot_id)] = True
        subscription["claim_count"] = int(subscription["claim_count"]) + 1
        subscription["compensated_wei"] = int(
            u256(int(subscription["compensated_wei"])) + payout
        )
        self.subscriptions[str(subscription_id)] = json.dumps(
            subscription, sort_keys=True
        )
        if payout > u256(0) and service["compensation_type"] == "refund":
            self._send_value(gl.message.sender_address, payout)
        return claim_id

    @gl.public.view
    def get_service(self, service_id: str) -> str:
        return self.services.get(str(service_id), "")

    @gl.public.view
    def get_services(self) -> str:
        result = []
        for service_id in self.service_order:
            result.append(json.loads(self.services[service_id]))
        return json.dumps(result, sort_keys=True)

    @gl.public.view
    def get_subscription(self, subscription_id: str) -> str:
        return self.subscriptions.get(str(subscription_id), "")

    @gl.public.view
    def get_subscriptions(self) -> str:
        result = []
        for subscription_id in self.subscription_order:
            result.append(json.loads(self.subscriptions[subscription_id]))
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
                "services": int(self.service_seq),
                "subscriptions": int(self.subscription_seq),
                "snapshots": int(self.snapshot_seq),
                "claims": int(self.claim_seq),
            },
            sort_keys=True,
        )
