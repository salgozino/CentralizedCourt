from datetime import timedelta

import pytest
from django.test import Client
from django.utils import timezone

from accounts.models import LoginCode
from accounts.services import MAX_FAILED_ATTEMPTS

pytestmark = pytest.mark.django_db

ME_SHAPE = {"id", "email", "roles"}


def wrong(code: str) -> str:
    return f"{(int(code) + 1) % 1_000_000:06d}"


def test_request_code_prints_code_and_stores_it(seeded, request_code):
    code = request_code("juror1@example.com")
    assert len(code) == 6 and code.isdigit()
    assert LoginCode.objects.filter(user__email="juror1@example.com", code=code).exists()


def test_request_code_unknown_email_is_indistinguishable(seeded, client, capsys):
    known = client.post(
        "/api/auth/request-code", {"email": "user@example.com"}, content_type="application/json"
    )
    capsys.readouterr()
    unknown = client.post(
        "/api/auth/request-code", {"email": "nobody@example.com"}, content_type="application/json"
    )
    assert unknown.status_code == known.status_code == 200
    assert unknown.json() == known.json()
    assert "LOGIN CODE" not in capsys.readouterr().out
    assert not LoginCode.objects.filter(user__email="nobody@example.com").exists()


@pytest.mark.parametrize(
    "body", [{}, {"mail": "user@example.com"}, {"email": 123}, {"email": "not-an-email"}]
)
def test_request_code_invalid_body(seeded, client, body):
    response = client.post("/api/auth/request-code", body, content_type="application/json")
    assert response.status_code == 422


def test_verify_success_creates_session(seeded, client, request_code, verify):
    code = request_code("creator1@example.com")
    response = verify("creator1@example.com", code)
    assert response.status_code == 200
    assert set(response.json()) == ME_SHAPE
    assert response.json()["email"] == "creator1@example.com"
    assert response.json()["roles"] == ["creator", "user"]
    assert "sessionid" in response.cookies

    me = client.get("/api/me")
    assert me.status_code == 200
    assert me.json() == response.json()


def test_verify_email_is_case_insensitive(seeded, client, request_code, verify):
    code = request_code("user@example.com")
    assert verify("  USER@example.com ", code).status_code == 200


def test_verify_wrong_code(seeded, client, request_code, verify):
    code = request_code("user@example.com")
    assert verify("user@example.com", wrong(code)).status_code == 401
    assert client.get("/api/me").status_code == 401
    # A single wrong guess does not burn the real code.
    assert verify("user@example.com", code).status_code == 200


def test_verify_reused_code(seeded, request_code, verify):
    code = request_code("user@example.com")
    assert verify("user@example.com", code).status_code == 200
    assert verify("user@example.com", code, on=Client()).status_code == 401


def test_verify_expired_code(seeded, client, request_code, verify):
    code = request_code("user@example.com")
    LoginCode.objects.filter(code=code).update(
        expires_at=timezone.now() - timedelta(seconds=1)
    )
    assert verify("user@example.com", code).status_code == 401
    assert client.get("/api/me").status_code == 401


def test_code_expires_after_ten_minutes(seeded, request_code):
    request_code("user@example.com")
    login_code = LoginCode.objects.get(user__email="user@example.com")
    assert login_code.expires_at - login_code.created_at == timedelta(minutes=10)


def test_verify_foreign_code(seeded, request_code, verify):
    code = request_code("juror1@example.com")
    request_code("juror2@example.com")
    assert verify("juror2@example.com", code).status_code == 401
    # The foreign attempt does not consume the code for its owner.
    assert verify("juror1@example.com", code).status_code == 200


def test_verify_unknown_email(seeded, verify):
    assert verify("nobody@example.com", "123456").status_code == 401


def test_new_code_invalidates_previous_one(seeded, request_code, verify):
    first = request_code("user@example.com")
    second = request_code("user@example.com")
    if first != second:
        assert verify("user@example.com", first).status_code == 401
    assert verify("user@example.com", second).status_code == 200


def test_too_many_wrong_attempts_burn_the_code(seeded, request_code, verify):
    code = request_code("user@example.com")
    for _ in range(MAX_FAILED_ATTEMPTS):
        assert verify("user@example.com", wrong(code)).status_code == 401
    assert verify("user@example.com", code).status_code == 401


def test_verify_invalid_body(seeded, client):
    response = client.post(
        "/api/auth/verify", {"email": "user@example.com"}, content_type="application/json"
    )
    assert response.status_code == 422


def test_me_requires_login(db, client):
    assert client.get("/api/me").status_code == 401


def test_logout_clears_session(login_as, client):
    login_as("user@example.com")
    assert client.get("/api/me").status_code == 200
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/me").status_code == 401


def test_logout_when_not_logged_in(db, client):
    assert client.post("/api/auth/logout").status_code == 200


@pytest.mark.parametrize(
    "email, roles",
    [
        ("admin@example.com", ["admin", "user"]),
        ("creator1@example.com", ["creator", "user"]),
        ("creator2@example.com", ["creator", "user"]),
        ("juror1@example.com", ["juror", "user"]),
        ("juror5@example.com", ["juror", "user"]),
        ("user@example.com", ["user"]),
    ],
)
def test_seeded_users_log_in_with_their_roles(login_as, client, email, roles):
    login_as(email)
    me = client.get("/api/me").json()
    assert me["email"] == email
    assert me["roles"] == roles
