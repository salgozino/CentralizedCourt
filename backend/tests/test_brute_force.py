import re
from datetime import timedelta

import pytest
from django.test import Client
from django.utils import timezone

from accounts.models import LoginCode, LoginThrottleEvent, User
from accounts.services import (
    CODE_TTL,
    MAX_CODE_REQUESTS_PER_IP,
    MAX_FAILED_ATTEMPTS,
    MAX_FAILED_VERIFIES_PER_IP,
    THROTTLE_WINDOW,
)

pytestmark = pytest.mark.django_db

VICTIM = "user@example.com"
CODE_LINE = re.compile(r"^LOGIN CODE (\S+) (\d{6})$", re.MULTILINE)


@pytest.fixture
def attacker():
    return Client(REMOTE_ADDR="203.0.113.66")


@pytest.fixture
def victim():
    return Client(REMOTE_ADDR="198.51.100.7")


def request_code(on, email, capsys):
    capsys.readouterr()
    response = on.post("/api/auth/request-code", {"email": email}, content_type="application/json")
    assert response.status_code == 200
    matches = CODE_LINE.findall(capsys.readouterr().out)
    return matches[0][1] if matches else None


def verify(on, email, code):
    return on.post(
        "/api/auth/verify", {"email": email, "code": code}, content_type="application/json"
    )


def wrong(code: str) -> str:
    return f"{(int(code) + 1) % 1_000_000:06d}"


def plant_valid_code(email=VICTIM, code="424242"):
    now = timezone.now()
    LoginCode.objects.create(
        user=User.objects.get(email=email), code=code, created_at=now, expires_at=now + CODE_TTL
    )
    return code


def exhaust_failures(attacker, capsys):
    """Attacker loop: request fresh codes and spend their guesses until throttled."""
    failures = 0
    while failures < MAX_FAILED_VERIFIES_PER_IP:
        code = request_code(attacker, VICTIM, capsys)
        for _ in range(MAX_FAILED_ATTEMPTS):
            assert verify(attacker, VICTIM, wrong(code)).status_code == 401
            failures += 1


def test_new_codes_do_not_give_unlimited_guesses(seeded, attacker, capsys):
    exhaust_failures(attacker, capsys)
    # Even the right code is refused from the throttled client.
    assert verify(attacker, VICTIM, plant_valid_code()).status_code == 401


def test_guesses_are_bounded_per_client(seeded, attacker, capsys):
    exhaust_failures(attacker, capsys)
    for _ in range(50):
        attacker.post("/api/auth/request-code", {"email": VICTIM}, content_type="application/json")
        verify(attacker, VICTIM, "000000")
    total = sum(LoginCode.objects.filter(user__email=VICTIM).values_list("failed_attempts", flat=True))
    assert total == MAX_FAILED_VERIFIES_PER_IP


def test_attacker_cannot_lock_out_the_victim(seeded, attacker, victim, capsys):
    exhaust_failures(attacker, capsys)
    for _ in range(MAX_CODE_REQUESTS_PER_IP + 5):
        attacker.post("/api/auth/request-code", {"email": VICTIM}, content_type="application/json")
        verify(attacker, VICTIM, "000000")
    code = request_code(victim, VICTIM, capsys)
    assert code is not None
    assert verify(victim, VICTIM, code).status_code == 200
    assert victim.get("/api/me").json()["email"] == VICTIM


def test_throttled_client_does_not_burn_the_victims_code(seeded, attacker, victim, capsys):
    exhaust_failures(attacker, capsys)
    code = request_code(victim, VICTIM, capsys)
    for _ in range(MAX_FAILED_ATTEMPTS + 1):
        verify(attacker, VICTIM, wrong(code))
    assert verify(victim, VICTIM, code).status_code == 200


def test_code_requests_are_throttled_per_client(seeded, attacker, victim, capsys):
    for _ in range(MAX_CODE_REQUESTS_PER_IP):
        assert request_code(attacker, "nobody@example.com", capsys) is None
    capsys.readouterr()
    throttled = attacker.post(
        "/api/auth/request-code", {"email": VICTIM}, content_type="application/json"
    )
    # Same response as any other request: nothing reveals the throttling.
    assert throttled.status_code == 200
    assert throttled.json() == victim.post(
        "/api/auth/request-code", {"email": "nobody@example.com"}, content_type="application/json"
    ).json()
    out = capsys.readouterr().out
    assert "LOGIN CODE" not in out
    assert "LOGIN THROTTLED 203.0.113.66" in out
    assert request_code(victim, VICTIM, capsys) is not None


def test_unknown_emails_count_as_failures(seeded, attacker):
    for _ in range(MAX_FAILED_VERIFIES_PER_IP):
        verify(attacker, "nobody@example.com", "000000")
    assert verify(attacker, VICTIM, plant_valid_code()).status_code == 401


def test_throttle_expires_after_window(seeded, attacker, capsys):
    exhaust_failures(attacker, capsys)
    LoginThrottleEvent.objects.update(
        created_at=timezone.now() - THROTTLE_WINDOW - timedelta(seconds=1)
    )
    code = request_code(attacker, VICTIM, capsys)
    assert verify(attacker, VICTIM, code).status_code == 200


def test_failures_below_the_limit_do_not_throttle(seeded, attacker, capsys):
    code = request_code(attacker, VICTIM, capsys)
    for _ in range(MAX_FAILED_ATTEMPTS - 1):
        verify(attacker, VICTIM, wrong(code))
    code = request_code(attacker, VICTIM, capsys)
    for _ in range(MAX_FAILED_VERIFIES_PER_IP - MAX_FAILED_ATTEMPTS):
        verify(attacker, VICTIM, wrong(code))
    code = request_code(attacker, VICTIM, capsys)
    assert verify(attacker, VICTIM, code).status_code == 200


PROXY = "127.0.0.1"


def via_proxy(forwarded_for):
    return Client(REMOTE_ADDR=PROXY, HTTP_X_FORWARDED_FOR=forwarded_for)


def test_clients_behind_the_proxy_are_throttled_separately(seeded, capsys):
    attacker = via_proxy("203.0.113.66")
    exhaust_failures(attacker, capsys)
    victim = via_proxy("198.51.100.7")
    code = request_code(victim, VICTIM, capsys)
    assert verify(victim, VICTIM, code).status_code == 200


def test_forged_forwarded_entries_cannot_rotate_the_ip(seeded, capsys):
    # The client controls everything left of the entry the proxy appends.
    for i in range(MAX_FAILED_VERIFIES_PER_IP):
        verify(via_proxy(f"10.0.0.{i}, 203.0.113.66"), VICTIM, "000000")
    attacker = via_proxy("10.9.9.9, 203.0.113.66")
    assert verify(attacker, VICTIM, plant_valid_code()).status_code == 401


def test_forwarded_header_from_untrusted_client_is_ignored(seeded):
    for i in range(MAX_FAILED_VERIFIES_PER_IP):
        Client(REMOTE_ADDR="203.0.113.66", HTTP_X_FORWARDED_FOR=f"10.0.0.{i}").post(
            "/api/auth/verify", {"email": VICTIM, "code": "000000"}, content_type="application/json"
        )
    attacker = Client(REMOTE_ADDR="203.0.113.66", HTTP_X_FORWARDED_FOR="10.9.9.9")
    assert verify(attacker, VICTIM, plant_valid_code()).status_code == 401


def test_garbage_forwarded_header_falls_back_to_remote_addr(seeded):
    response = verify(via_proxy("not-an-ip"), VICTIM, "000000")
    assert response.status_code == 401
    assert LoginThrottleEvent.objects.get().ip == PROXY
