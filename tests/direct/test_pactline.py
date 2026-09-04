import json
import sys

import pytest

from .conftest import evidence_body


PERIOD_START = "2025-01-01T00:00:00+00:00"
PERIOD_END = "2025-01-02T00:00:00+00:00"
AFTER_PERIOD = "2025-01-03T00:00:00+00:00"
SUBSCRIPTION_PRICE = 10**18
COLLATERAL = 10**18


def address_text(value):
    return "0x" + bytes(value).hex()


def set_time(direct_vm, value):
    direct_vm.warp(value)
    gl_module = sys.modules.get("genlayer.gl")
    if gl_module is not None and gl_module.message_raw is not None:
        gl_module.message_raw["datetime"] = value


def service_args():
    return [
        "Acme API",
        "https://api.example.com/health",
        "If uptime falls below 99.9 percent, return 20 percent.",
        9990,
        1,
        "refund",
        2000,
        SUBSCRIPTION_PRICE,
    ]


def register_service(direct_vm, contract, provider, value=COLLATERAL):
    set_time(direct_vm, PERIOD_START)
    direct_vm.sender = provider
    direct_vm.value = value
    return contract.register_service(*service_args())


def subscribe(direct_vm, contract, customer, service_id, value=SUBSCRIPTION_PRICE):
    set_time(direct_vm, PERIOD_START)
    direct_vm.sender = customer
    direct_vm.value = value
    return contract.subscribe_service(service_id)


def publish(
    direct_vm,
    contract,
    monitor,
    service_id,
    uptime_bps=9980,
    evidence_service_id=None,
):
    set_time(direct_vm, AFTER_PERIOD)
    direct_vm.sender = monitor
    direct_vm.value = 0
    signature = "sig_" + str(uptime_bps)
    direct_vm.mock_web(
        r"https://evidence\.example\.com/.*",
        {
            "status": 200,
            "body": evidence_body(
                evidence_service_id or service_id,
                PERIOD_START,
                PERIOD_END,
                uptime_bps,
                1000,
                20,
                signature,
            ),
        },
    )
    return contract.publish_snapshot(
        service_id,
        PERIOD_START,
        PERIOD_END,
        uptime_bps,
        1000,
        20,
        "https://evidence.example.com/" + service_id,
        signature,
    )


def test_provider_registers_service_and_reads_terms(
    direct_vm, direct_deploy, direct_alice
):
    contract = direct_deploy("contracts/Pactline.py")
    service_id = register_service(direct_vm, contract, direct_alice)

    service = json.loads(contract.get_service(service_id))
    assert service["provider"].lower() == address_text(direct_alice)
    assert service["service_name"] == "Acme API"
    assert service["threshold_bps"] == 9990
    assert service["subscription_price_wei"] == SUBSCRIPTION_PRICE
    assert service["collateral_wei"] == COLLATERAL


def test_registration_rejects_insufficient_provider_collateral(
    direct_vm, direct_deploy, direct_alice
):
    contract = direct_deploy("contracts/Pactline.py")
    direct_vm.warp(PERIOD_START)
    direct_vm.sender = direct_alice
    direct_vm.value = 1
    with direct_vm.expect_revert("collateral must cover"):
        contract.register_service(*service_args())


def test_only_owner_can_change_monitor(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/Pactline.py")
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("only the owner"):
        contract.set_monitor_operator(direct_alice)


def test_provider_can_add_collateral(
    direct_vm, direct_deploy, direct_alice
):
    contract = direct_deploy("contracts/Pactline.py")
    service_id = register_service(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_alice
    direct_vm.value = COLLATERAL
    contract.add_service_collateral(service_id)
    service = json.loads(contract.get_service(service_id))
    assert service["collateral_wei"] == 2 * COLLATERAL


def test_only_provider_can_add_collateral(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/Pactline.py")
    service_id = register_service(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_bob
    direct_vm.value = COLLATERAL
    with direct_vm.expect_revert("only the provider"):
        contract.add_service_collateral(service_id)


def test_customer_subscription_reserves_provider_coverage(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/Pactline.py")
    service_id = register_service(direct_vm, contract, direct_alice)
    subscription_id = subscribe(direct_vm, contract, direct_bob, service_id)

    subscription = json.loads(contract.get_subscription(subscription_id))
    service = json.loads(contract.get_service(service_id))
    assert subscription["customer"].lower() == address_text(direct_bob)
    assert subscription["provider"].lower() == address_text(direct_alice)
    assert subscription["max_payout_wei"] == 2 * 10**17
    assert service["reserved_wei"] == 2 * 10**17
    assert service["provider_revenue_wei"] == SUBSCRIPTION_PRICE


def test_subscription_requires_exact_price(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/Pactline.py")
    service_id = register_service(direct_vm, contract, direct_alice)
    direct_vm.warp(PERIOD_START)
    direct_vm.sender = direct_bob
    direct_vm.value = SUBSCRIPTION_PRICE - 1
    with direct_vm.expect_revert("does not match"):
        contract.subscribe_service(service_id)


def test_provider_cannot_subscribe_to_own_service(
    direct_vm, direct_deploy, direct_alice
):
    contract = direct_deploy("contracts/Pactline.py")
    service_id = register_service(direct_vm, contract, direct_alice)
    direct_vm.warp(PERIOD_START)
    direct_vm.sender = direct_alice
    direct_vm.value = SUBSCRIPTION_PRICE
    with direct_vm.expect_revert("own service"):
        contract.subscribe_service(service_id)


def test_collateral_reservation_limits_subscribers(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = direct_deploy("contracts/Pactline.py")
    service_id = register_service(
        direct_vm, contract, direct_alice, value=2 * 10**17
    )
    subscribe(direct_vm, contract, direct_bob, service_id)
    direct_vm.warp(PERIOD_START)
    direct_vm.sender = direct_charlie
    direct_vm.value = SUBSCRIPTION_PRICE
    with direct_vm.expect_revert("fully reserved"):
        contract.subscribe_service(service_id)


def test_paused_service_rejects_new_subscriptions(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/Pactline.py")
    service_id = register_service(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_alice
    contract.pause_service(service_id)
    direct_vm.warp(PERIOD_START)
    direct_vm.sender = direct_bob
    direct_vm.value = SUBSCRIPTION_PRICE
    with direct_vm.expect_revert("not accepting"):
        contract.subscribe_service(service_id)


def test_snapshot_is_published_for_registered_service(
    direct_vm, direct_deploy, direct_alice, direct_owner
):
    contract = direct_deploy("contracts/Pactline.py")
    service_id = register_service(direct_vm, contract, direct_alice)
    snapshot_id = publish(direct_vm, contract, direct_owner, service_id)

    snapshot = json.loads(contract.get_snapshot(snapshot_id))
    service = json.loads(contract.get_service(service_id))
    assert snapshot["service_id"] == service_id
    assert snapshot["uptime_bps"] == 9980
    assert service["last_uptime_bps"] == 9980
    assert json.loads(contract.get_counts())["snapshots"] == 1


def test_breached_claim_pays_subscriber_from_provider_collateral(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_owner
):
    contract = direct_deploy("contracts/Pactline.py")
    service_id = register_service(direct_vm, contract, direct_alice)
    subscription_id = subscribe(direct_vm, contract, direct_bob, service_id)
    snapshot_id = publish(direct_vm, contract, direct_owner, service_id, 9980)

    set_time(direct_vm, AFTER_PERIOD)
    direct_vm.sender = direct_bob
    direct_vm.value = 0
    claim_id = contract.file_claim(subscription_id, snapshot_id)
    claim = json.loads(contract.get_claim(claim_id))
    service = json.loads(contract.get_service(service_id))
    assert claim["status"] == "breached"
    assert claim["customer"].lower() == address_text(direct_bob)
    assert claim["provider"].lower() == address_text(direct_alice)
    assert claim["settlement_wei"] == 2 * 10**17
    assert service["collateral_wei"] == 8 * 10**17
    assert service["reserved_wei"] == 0


def test_clear_claim_releases_reserved_coverage(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_owner
):
    contract = direct_deploy("contracts/Pactline.py")
    service_id = register_service(direct_vm, contract, direct_alice)
    subscription_id = subscribe(direct_vm, contract, direct_bob, service_id)
    snapshot_id = publish(direct_vm, contract, direct_owner, service_id, 9995)

    set_time(direct_vm, AFTER_PERIOD)
    direct_vm.sender = direct_bob
    claim_id = contract.file_claim(subscription_id, snapshot_id)
    claim = json.loads(contract.get_claim(claim_id))
    service = json.loads(contract.get_service(service_id))
    assert claim["status"] == "clear"
    assert claim["settlement_wei"] == 0
    assert service["reserved_wei"] == 0
    assert service["collateral_wei"] == COLLATERAL


def test_only_subscriber_can_file_claim(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_owner
):
    contract = direct_deploy("contracts/Pactline.py")
    service_id = register_service(direct_vm, contract, direct_alice)
    subscription_id = subscribe(direct_vm, contract, direct_bob, service_id)
    snapshot_id = publish(direct_vm, contract, direct_owner, service_id)
    direct_vm.warp(AFTER_PERIOD)
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("only the subscriber"):
        contract.file_claim(subscription_id, snapshot_id)


def test_snapshot_predating_subscription_cannot_be_claimed(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_owner
):
    contract = direct_deploy("contracts/Pactline.py")
    service_id = register_service(direct_vm, contract, direct_alice)
    set_time(direct_vm, AFTER_PERIOD)
    direct_vm.sender = direct_bob
    direct_vm.value = SUBSCRIPTION_PRICE
    subscription_id = contract.subscribe_service(service_id)
    snapshot_id = publish(direct_vm, contract, direct_owner, service_id)
    set_time(direct_vm, AFTER_PERIOD)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("predates"):
        contract.file_claim(subscription_id, snapshot_id)


def test_claim_rejects_mismatched_evidence(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_owner
):
    contract = direct_deploy("contracts/Pactline.py")
    service_id = register_service(direct_vm, contract, direct_alice)
    subscription_id = subscribe(direct_vm, contract, direct_bob, service_id)
    snapshot_id = publish(direct_vm, contract, direct_owner, service_id)
    direct_vm.clear_mocks()
    direct_vm.mock_web(
        r"https://evidence\.example\.com/.*",
        {
            "status": 200,
            "body": evidence_body(
                service_id,
                PERIOD_START,
                PERIOD_END,
                9999,
                1000,
                1,
                "wrong_signature",
            ),
        },
    )
    set_time(direct_vm, AFTER_PERIOD)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("does not match"):
        contract.file_claim(subscription_id, snapshot_id)


def test_subscription_window_cannot_be_claimed_twice(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_owner
):
    contract = direct_deploy("contracts/Pactline.py")
    service_id = register_service(direct_vm, contract, direct_alice)
    subscription_id = subscribe(direct_vm, contract, direct_bob, service_id)
    snapshot_id = publish(direct_vm, contract, direct_owner, service_id)
    direct_vm.warp(AFTER_PERIOD)
    direct_vm.sender = direct_bob
    contract.file_claim(subscription_id, snapshot_id)
    with direct_vm.expect_revert("already has a claim"):
        contract.file_claim(subscription_id, snapshot_id)


@pytest.mark.parametrize(
    "method,args",
    [
        ("get_service", ["missing"]),
        ("get_subscription", ["missing"]),
        ("get_snapshot", ["missing"]),
        ("get_claim", ["missing"]),
    ],
)
def test_missing_reads_are_safe(direct_vm, direct_deploy, method, args):
    contract = direct_deploy("contracts/Pactline.py")
    assert getattr(contract, method)(*args) == ""
