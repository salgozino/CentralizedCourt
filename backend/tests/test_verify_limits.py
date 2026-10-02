from datetime import timedelta
from unittest.mock import patch

import pytest
from django.test import Client
from django.utils import timezone

from accounts.api import CHALLENGE_COOKIE, browser_digest
from accounts.models import LoginCode, LoginIssueBudget, User

pytestmark = pytest.mark.django_db
EMAIL = "admin@example.com"


@pytest.fixture(autouse=True)
def account():
    return User.objects.create_user(EMAIL, is_admin=True)


def issue(client, email=EMAIL, number=123456, **headers):
    with patch("accounts.api.secrets.randbelow", return_value=number):
        return client.post("/api/auth/request-code", {"email": email},
                           content_type="application/json", **headers)


def verify(client, code="123456", email=EMAIL):
    return client.post("/api/auth/verify", {"email": email, "code": code},
                       content_type="application/json")


def challenge(client):
    return LoginCode.objects.get(browser_digest=browser_digest(client.cookies[CHALLENGE_COOKIE].value))


def test_five_attempts_block_only_that_challenge():
    client = Client()
    issue(client)
    for attempt in range(1, 6):
        assert verify(client, "wrong").status_code == 401
        assert challenge(client).attempts == attempt
    for _ in range(10):
        response = verify(client)
        assert response.status_code == 401
        assert "sessionid" not in response.cookies
    assert challenge(client).attempts == 5
    assert not challenge(client).used


def test_fifth_attempt_can_succeed_once():
    client = Client()
    issue(client)
    for _ in range(4):
        assert verify(client, "wrong").status_code == 401
    assert verify(client).status_code == 200
    assert challenge(client).attempts == 5
    assert challenge(client).used
    assert verify(client).status_code == 401


def test_attacker_cannot_block_admin_even_on_same_ip():
    victim, attacker = Client(), Client()
    issue(victim)
    victim_id = challenge(victim).pk
    for attempt in range(3):
        issue(attacker, number=654321)
        for _ in range(6):
            assert verify(attacker, "wrong").status_code == 401
        assert verify(attacker, "654321").status_code == 401
        # The victim's original code and budget never change.
        record = LoginCode.objects.get(pk=victim_id)
        assert record.attempts == 0
        assert not record.used
    response = verify(victim)
    assert response.status_code == 200
    assert response.json()["roles"] == ["admin", "user"]


def test_admin_can_start_login_after_attack_from_another_source():
    attacker = Client(REMOTE_ADDR="192.0.2.10")
    with patch("accounts.api.ISSUE_IP_LIMIT", 2):
        for _ in range(3):
            attacker.cookies.clear()
            issue(attacker)
            for _ in range(6):
                assert verify(attacker, "wrong").status_code == 401
        victim = Client(REMOTE_ADDR="192.0.2.20")
        issue(victim)
        assert verify(victim).status_code == 200


@pytest.mark.parametrize("cookie", [None, "invalid", "x" * 43])
def test_missing_or_forged_binding_cannot_spend_victim_attempts(cookie):
    victim, attacker = Client(), Client()
    issue(victim)
    if cookie:
        attacker.cookies[CHALLENGE_COOKIE] = cookie
    for _ in range(10):
        assert verify(attacker).status_code == 401
    assert challenge(victim).attempts == 0
    assert verify(victim).status_code == 200


def test_code_cannot_be_used_by_another_browser():
    victim, attacker = Client(), Client()
    issue(victim)
    issue(attacker, number=654321)
    assert verify(attacker, "123456").status_code == 401
    assert verify(victim, "654321").status_code == 401
    assert verify(victim).status_code == 200


def test_cookie_reset_and_forwarded_ip_spoof_cannot_bypass_issuance_budget(capsys):
    with patch("accounts.api.ISSUE_IP_LIMIT", 2):
        for i in range(5):
            client = Client()  # new cookie jar each time
            capsys.readouterr()
            response = issue(client, HTTP_X_FORWARDED_FOR=f"192.0.2.{i}")
            assert response.status_code == 200
            assert ("LOGIN CODE" in capsys.readouterr().out) == (i < 2)
        assert LoginCode.objects.count() == 2
        assert verify(client).status_code == 401


def test_existing_challenge_works_when_source_and_global_issuance_are_exhausted():
    victim = Client()
    with patch("accounts.api.ISSUE_IP_LIMIT", 1), patch("accounts.api.ISSUE_GLOBAL_LIMIT", 1):
        issue(victim)
        issue(Client())
        issue(Client(REMOTE_ADDR="192.0.2.10"))
        assert LoginCode.objects.count() == 1
        assert verify(victim).status_code == 200


def test_global_issuance_budget_bounds_rotating_sources():
    with patch("accounts.api.ISSUE_GLOBAL_LIMIT", 2):
        for i in range(5):
            assert issue(Client(REMOTE_ADDR=f"192.0.2.{i}")).status_code == 200
        assert LoginCode.objects.count() == 2


def test_issuance_window_resets_at_exact_boundary():
    now = timezone.now()
    with patch("accounts.api.ISSUE_IP_LIMIT", 1):
        with patch("accounts.api.timezone.now", return_value=now):
            issue(Client())
        with patch("accounts.api.timezone.now", return_value=now + timedelta(minutes=10, microseconds=-1)):
            issue(Client())
            assert LoginCode.objects.count() == 1
        with patch("accounts.api.timezone.now", return_value=now + timedelta(minutes=10)):
            client = Client()
            issue(client)
            assert verify(client).status_code == 200


def test_challenge_expires_even_with_unused_attempts():
    now = timezone.now()
    client = Client()
    with patch("accounts.api.timezone.now", return_value=now):
        issue(client)
    with patch("accounts.api.timezone.now", return_value=now + timedelta(minutes=10)):
        assert verify(client).status_code == 401
    assert challenge(client).attempts == 0


def test_unknown_and_throttled_emails_have_identical_responses(capsys):
    with patch("accounts.api.ISSUE_IP_LIMIT", 2):
        known = issue(Client())
        capsys.readouterr()
        unknown = issue(Client(), email="unknown@example.com")
        throttled = issue(Client())
        assert known.status_code == unknown.status_code == throttled.status_code == 200
        assert known.json() == unknown.json() == throttled.json()
        assert "LOGIN CODE" not in capsys.readouterr().out
        for response in (known, unknown, throttled):
            cookie = response.cookies[CHALLENGE_COOKIE]
            assert cookie["httponly"]
            assert cookie["samesite"] == "Lax"
            assert len(cookie.value) == 43
        assert User.objects.count() == 1
        assert LoginCode.objects.count() == 1


def test_unknown_requests_consume_source_budget_without_creating_accounts():
    with patch("accounts.api.ISSUE_IP_LIMIT", 1):
        issue(Client(), email="unknown@example.com")
        issue(Client())
        assert LoginCode.objects.count() == 0
        assert User.objects.count() == 1
        assert LoginIssueBudget.objects.count() == 2
