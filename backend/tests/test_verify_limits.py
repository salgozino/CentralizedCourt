from datetime import timedelta
from unittest.mock import patch

import pytest
from django.test import Client
from django.utils import timezone

from accounts.api import code_digest
from accounts.models import LoginCode, User

pytestmark = pytest.mark.django_db
EMAIL = "user@example.com"


@pytest.fixture
def account():
    user = User.objects.create_user(EMAIL)
    LoginCode.objects.create(
        user=user, digest=code_digest(EMAIL, "123456"),
        expires_at=timezone.now() + timedelta(minutes=10),
    )
    return user


def verify(code, email=EMAIL):
    # Every attempt uses a fresh client/session: the budget is not cookie-based.
    return Client().post("/api/auth/verify", {"email": email, "code": code}, content_type="application/json")


def test_five_wrong_attempts_block_even_correct_code(account):
    for attempt in range(1, 6):
        assert verify("000000").status_code == 401
        account.refresh_from_db()
        assert account.verification_attempts == attempt  # failures commit
    for _ in range(10):
        response = verify("123456")
        assert response.status_code == 401
        assert "sessionid" not in response.cookies
    account.refresh_from_db()
    assert account.verification_attempts == 5
    assert not LoginCode.objects.get(user=account).used
    assert verify("123456").json() == verify("123456", "unknown@example.com").json()


def test_fifth_attempt_can_succeed_but_success_does_not_reset_budget(account):
    for _ in range(4):
        assert verify("000000").status_code == 401
    assert verify("123456").status_code == 200
    account.refresh_from_db()
    assert account.verification_attempts == 5
    assert LoginCode.objects.get(user=account).used


def test_reissuing_codes_does_not_reset_budget(account, capsys):
    for _ in range(5):
        assert verify("000000").status_code == 401
    account.refresh_from_db()
    window_end = account.verification_window_ends_at
    for _ in range(3):
        with patch("accounts.api.secrets.randbelow", return_value=654321):
            response = Client().post("/api/auth/request-code", {"email": EMAIL}, content_type="application/json")
        assert response.status_code == 200
        assert f"LOGIN CODE {EMAIL} 654321" in capsys.readouterr().out
        assert verify("654321").status_code == 401
    account.refresh_from_db()
    assert account.verification_attempts == 5
    assert account.verification_window_ends_at == window_end


def test_window_reopens_at_boundary_without_extending_lock_on_denial(account):
    now = timezone.now()
    with patch("accounts.api.timezone.now", return_value=now):
        for _ in range(5):
            assert verify("000000").status_code == 401
    window_end = now + timedelta(minutes=10)
    # Fresh, unexpired code; code expiry and attempt window are independent.
    LoginCode.objects.filter(user=account).update(expires_at=window_end + timedelta(minutes=5))
    with patch("accounts.api.timezone.now", return_value=window_end - timedelta(microseconds=1)):
        assert verify("123456").status_code == 401
    account.refresh_from_db()
    assert account.verification_window_ends_at == window_end
    with patch("accounts.api.timezone.now", return_value=window_end):
        assert verify("123456").status_code == 200
    account.refresh_from_db()
    assert account.verification_attempts == 1
    assert account.verification_window_ends_at == window_end + timedelta(minutes=10)


def test_budget_is_per_account_and_email_is_normalized(account):
    other = User.objects.create_user("other@example.com")
    LoginCode.objects.create(user=other, digest=code_digest(other.email, "123456"),
                             expires_at=timezone.now() + timedelta(minutes=10))
    for _ in range(5):
        assert verify("000000", " USER@EXAMPLE.COM ").status_code == 401
    assert verify("123456").status_code == 401
    assert verify("123456", other.email).status_code == 200


def test_attempts_before_code_issuance_still_count(account):
    LoginCode.objects.filter(user=account).delete()
    for _ in range(5):
        assert verify("123456").status_code == 401
    account.refresh_from_db()
    assert account.verification_attempts == 5
    LoginCode.objects.create(user=account, digest=code_digest(EMAIL, "123456"),
                             expires_at=timezone.now() + timedelta(minutes=10))
    assert verify("123456").status_code == 401
