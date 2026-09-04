import json

import pytest

from .conftest import evidence_body


PERIOD_START = "2025-01-01T00:00:00+00:00"
PERIOD_END = "2025-01-02T00:00:00+00:00"


def register_args():
    return [
        "Acme API",
        "https://api.example.com/health",
        "If uptime falls below 99.9 percent, return 20 percent.",
        9990,
        1,
        "refund",
        2000,
    ]


def register(direct_vm, contract, alice, value=10**18):
    direct_vm.sender = alice
    direct_vm.value = value
    return contract.register_sla(*register_args())


def publish(direct_vm, contract, owner, agreement_id, uptime_bps=9980):
    direct_vm.sender = owner
    direct_vm.value = 0
    signature = "sig_" + str(uptime_bps)
    direct_vm.mock_web(
        r"https://evidence\.example\.com/.*",
        {
            "status": 200,
            "body": evidence_body(
                agreement_id,
                PERIOD_START,
                PERIOD_END,
                uptime_bps,
                1000,
                20,
                signature,
            ),
        },
    )
    snapshot_id = contract.publish_snapshot(
        agreement_id,
        PERIOD_START,
        PERIOD_END,
        uptime_bps,
        1000,
        20,
        "https://evidence.example.com/" + agreement_id,
        signature,
    )
    return snapshot_id


def test_register_and_read_agreement(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/Pactline.py")
    agreement_id = register(direct_vm, contract, direct_alice)

    agreement = json.loads(contract.get_agreement(agreement_id))
    assert agreement["service_name"] == "Acme API"
    assert agreement["threshold_bps"] == 9990
    assert agreement["deposit_wei"] == 10**18
    assert json.loads(contract.get_counts())["agreements"] == 1


def test_registration_rejects_invalid_terms(
    direct_vm, direct_deploy, direct_alice
):
    contract = direct_deploy("contracts/Pactline.py")
    direct_vm.sender = direct_alice
    direct_vm.value = 10**18
    with direct_vm.expect_revert("threshold"):
        contract.register_sla(
            "Bad SLA",
            "https://api.example.com",
            "terms",
            10001,
            1,
            "refund",
            2000,
        )


def test_only_owner_can_change_monitor(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/Pactline.py")
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("only the owner"):
        contract.set_monitor_operator(direct_alice)


def test_snapshot_is_published_and_updates_last_uptime(
    direct_vm, direct_deploy, direct_alice, direct_owner
):
    contract = direct_deploy("contracts/Pactline.py")
    agreement_id = register(direct_vm, contract, direct_alice)
    snapshot_id = publish(direct_vm, contract, direct_owner, agreement_id)

    snapshot = json.loads(contract.get_snapshot(snapshot_id))
    agreement = json.loads(contract.get_agreement(agreement_id))
    assert snapshot["uptime_bps"] == 9980
    assert agreement["last_uptime_bps"] == 9980


def test_breached_claim_pays_refund(
    direct_vm, direct_deploy, direct_alice, direct_owner
):
    contract = direct_deploy("contracts/Pactline.py")
    agreement_id = register(direct_vm, contract, direct_alice)
    snapshot_id = publish(direct_vm, contract, direct_owner, agreement_id, 9980)

    direct_vm.sender = direct_alice
    direct_vm.value = 0
    claim_id = contract.file_claim(agreement_id, snapshot_id)
    claim = json.loads(contract.get_claim(claim_id))
    assert claim["status"] == "breached"
    assert claim["settlement_wei"] == 2 * 10**17


def test_clear_claim_has_zero_settlement(
    direct_vm, direct_deploy, direct_alice, direct_owner
):
    contract = direct_deploy("contracts/Pactline.py")
    agreement_id = register(direct_vm, contract, direct_alice)
    snapshot_id = publish(direct_vm, contract, direct_owner, agreement_id, 9995)

    direct_vm.sender = direct_alice
    direct_vm.value = 0
    claim_id = contract.file_claim(agreement_id, snapshot_id)
    claim = json.loads(contract.get_claim(claim_id))
    assert claim["status"] == "clear"
    assert claim["settlement_wei"] == 0


def test_snapshot_cannot_be_claimed_twice(
    direct_vm, direct_deploy, direct_alice, direct_owner
):
    contract = direct_deploy("contracts/Pactline.py")
    agreement_id = register(direct_vm, contract, direct_alice)
    snapshot_id = publish(direct_vm, contract, direct_owner, agreement_id)
    direct_vm.sender = direct_alice
    contract.file_claim(agreement_id, snapshot_id)
    with direct_vm.expect_revert("already has a claim"):
        contract.file_claim(agreement_id, snapshot_id)


def test_claim_rejects_mismatched_evidence(
    direct_vm, direct_deploy, direct_alice, direct_owner
):
    contract = direct_deploy("contracts/Pactline.py")
    agreement_id = register(direct_vm, contract, direct_alice)
    snapshot_id = publish(direct_vm, contract, direct_owner, agreement_id)
    direct_vm.clear_mocks()
    direct_vm.mock_web(
        r"https://evidence\.example\.com/.*",
        {
            "status": 200,
            "body": evidence_body(
                agreement_id,
                PERIOD_START,
                PERIOD_END,
                9999,
                1000,
                1,
                "wrong_signature",
            ),
        },
    )

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("does not match"):
        contract.file_claim(agreement_id, snapshot_id)


def test_only_customer_can_file_claim(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_owner
):
    contract = direct_deploy("contracts/Pactline.py")
    agreement_id = register(direct_vm, contract, direct_alice)
    snapshot_id = publish(direct_vm, contract, direct_owner, agreement_id)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("only the customer"):
        contract.file_claim(agreement_id, snapshot_id)


@pytest.mark.parametrize(
    "method,args",
    [
        ("get_agreement", ["missing"]),
        ("get_snapshot", ["missing"]),
        ("get_claim", ["missing"]),
    ],
)
def test_missing_reads_are_safe(direct_vm, direct_deploy, method, args):
    contract = direct_deploy("contracts/Pactline.py")
    assert getattr(contract, method)(*args) == ""
