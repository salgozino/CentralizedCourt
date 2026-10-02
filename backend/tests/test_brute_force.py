from datetime import timedelta

import pytest
from django.utils import timezone

from accounts.models import LoginCode, User
from accounts.services import CODE_TTL, LOCKOUT_WINDOW, MAX_FAILED_ATTEMPTS, MAX_FAILED_PER_WINDOW

pytestmark = pytest.mark.django_db

EMAIL = "user@example.com"
ROUNDS_TO_LOCK = MAX_FAILED_PER_WINDOW // MAX_FAILED_ATTEMPTS


def wrong(code: str) -> str:
    return f"{(int(code) + 1) % 1_000_000:06d}"


def burn_codes(request_code, verify, rounds: int) -> None:
    """Attacker loop: request a fresh code and spend all its guesses."""
    for _ in range(rounds):
        code = request_code(EMAIL)
        for _ in range(MAX_FAILED_ATTEMPTS):
            assert verify(EMAIL, wrong(code)).status_code == 401


def plant_valid_code(code="424242"):
    now = timezone.now()
    LoginCode.objects.create(
        user=User.objects.get(email=EMAIL), code=code, created_at=now, expires_at=now + CODE_TTL
    )
    return code


def test_requesting_new_codes_does_not_give_unlimited_guesses(seeded, verify):
    # Seed the lockout through the API, then make sure even a valid code is refused.
    for _ in range(ROUNDS_TO_LOCK):
        code = plant_valid_code()
        for _ in range(MAX_FAILED_ATTEMPTS):
            assert verify(EMAIL, wrong(code)).status_code == 401
    assert verify(EMAIL, plant_valid_code()).status_code == 401


def test_locked_user_gets_no_new_code_and_same_response(seeded, request_code, verify, client, capsys):
    burn_codes(request_code, verify, rounds=ROUNDS_TO_LOCK)
    capsys.readouterr()
    locked = client.post("/api/auth/request-code", {"email": EMAIL}, content_type="application/json")
    unknown = client.post(
        "/api/auth/request-code", {"email": "nobody@example.com"}, content_type="application/json"
    )
    assert locked.status_code == unknown.status_code == 200
    assert locked.json() == unknown.json()
    out = capsys.readouterr().out
    assert "LOGIN CODE" not in out
    assert f"LOGIN LOCKED {EMAIL}" in out


def test_guesses_are_bounded_per_window(seeded, request_code, verify, client):
    burn_codes(request_code, verify, rounds=ROUNDS_TO_LOCK)
    for _ in range(50):
        client.post("/api/auth/request-code", {"email": EMAIL}, content_type="application/json")
        verify(EMAIL, "000000")
    total = sum(LoginCode.objects.filter(user__email=EMAIL).values_list("failed_attempts", flat=True))
    assert total == MAX_FAILED_PER_WINDOW


def test_lockout_is_per_user(seeded, request_code, verify):
    burn_codes(request_code, verify, rounds=ROUNDS_TO_LOCK)
    code = request_code("juror1@example.com")
    assert verify("juror1@example.com", code).status_code == 200


def test_lockout_expires_after_window(seeded, request_code, verify):
    burn_codes(request_code, verify, rounds=ROUNDS_TO_LOCK)
    LoginCode.objects.filter(user__email=EMAIL).update(
        created_at=timezone.now() - LOCKOUT_WINDOW - timedelta(seconds=1)
    )
    code = request_code(EMAIL)
    assert verify(EMAIL, code).status_code == 200


def test_failures_below_the_cap_do_not_lock(seeded, request_code, verify):
    code = request_code(EMAIL)
    for _ in range(MAX_FAILED_PER_WINDOW - 1):
        verify(EMAIL, wrong(code))
    code = request_code(EMAIL)
    assert verify(EMAIL, code).status_code == 200
