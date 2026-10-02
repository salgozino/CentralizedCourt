import re
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.conf import settings
from django.core.management import call_command
from django.test import Client
from django.utils import timezone

from accounts.models import LoginCode, User

pytestmark = pytest.mark.django_db

SEED = {
    "admin@example.com": ["admin", "user"],
    **{f"creator{i}@example.com": ["creator", "user"] for i in range(1, 3)},
    **{f"juror{i}@example.com": ["juror", "user"] for i in range(1, 6)},
    "user@example.com": ["user"],
}


@pytest.fixture(autouse=True)
def seed():
    call_command("seed")


def request_code(client, email, capsys):
    capsys.readouterr()
    result = client.post("/api/auth/request-code", {"email": email}, content_type="application/json")
    assert result.status_code == 200
    output = capsys.readouterr().out
    match = re.search(rf"^LOGIN CODE {re.escape(email)} (\d{{6}})$", output, re.MULTILINE)
    assert match, output
    return match[1]


def verify(client, email, code):
    return client.post("/api/auth/verify", {"email": email, "code": code}, content_type="application/json")


def login(client, email, capsys):
    response = verify(client, email, request_code(client, email, capsys))
    assert response.status_code == 200, response.content
    return response.json()


def put_roles(client, user_id, roles):
    return client.put(f"/api/admin/users/{user_id}/roles", {"roles": roles}, content_type="application/json")


def test_seed_idempotent_and_custom_model():
    assert settings.AUTH_USER_MODEL == "accounts.User"
    assert dict((u.email, u.roles) for u in User.objects.all()) == SEED
    assert all(not u.has_usable_password() for u in User.objects.all())
    plain = User.objects.get(email="user@example.com")
    plain.is_juror = plain.is_creator = True
    plain.save()
    call_command("seed")
    assert User.objects.count() == 9
    plain.refresh_from_db()
    assert plain.roles == ["creator", "juror", "user"]


@pytest.mark.parametrize("email,roles", SEED.items())
def test_each_seeded_user_logs_in_with_console_code(client, capsys, email, roles):
    profile = login(client, email, capsys)
    assert profile == {"id": User.objects.get(email=email).pk, "email": email, "roles": roles}
    assert settings.SESSION_COOKIE_NAME in client.cookies
    assert client.get("/api/me").json() == profile
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/me").status_code == 401
    assert client.post("/api/auth/logout").status_code == 200


def test_wrong_reused_foreign_and_expired_codes(client, capsys):
    email = "user@example.com"
    code = request_code(client, email, capsys)
    wrong = f"{(int(code) + 1) % 1_000_000:06d}"
    assert verify(client, email, wrong).status_code == 401
    assert verify(client, "creator1@example.com", code).status_code == 401
    assert verify(client, email, code).status_code == 200
    assert verify(Client(), email, code).status_code == 401
    code = request_code(client, email, capsys)
    LoginCode.objects.filter(user__email=email).update(expires_at=timezone.now())
    assert verify(Client(), email, code).status_code == 401


def test_code_expiry_boundary_and_reissue(client, capsys):
    now = timezone.now()
    with patch("accounts.api.timezone.now", return_value=now), patch("accounts.api.secrets.randbelow", return_value=123):
        old = request_code(client, "user@example.com", capsys)
    record = LoginCode.objects.get(user__email="user@example.com")
    assert old == "000123"
    assert record.digest != old
    assert record.expires_at == now + timedelta(minutes=10)
    with patch("accounts.api.secrets.randbelow", return_value=456):
        new = request_code(client, "user@example.com", capsys)
    assert LoginCode.objects.count() == 1
    assert verify(client, "user@example.com", old).status_code == 401
    expires = LoginCode.objects.get().expires_at
    with patch("accounts.api.timezone.now", return_value=expires - timedelta(microseconds=1)):
        assert verify(client, "user@example.com", new).status_code == 200


def test_unknown_email_does_not_reveal_account(client, capsys):
    known = client.post("/api/auth/request-code", {"email": "user@example.com"}, content_type="application/json")
    capsys.readouterr()
    unknown = client.post("/api/auth/request-code", {"email": "unknown@example.com"}, content_type="application/json")
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    assert "LOGIN CODE" not in capsys.readouterr().out
    assert User.objects.count() == 9
    assert LoginCode.objects.count() == 1
    assert verify(client, "unknown@example.com", "123456").status_code == 401


@pytest.mark.parametrize("payload", [{}, {"email": 42}, {"email": "not-an-email"}, {"email": None}])
def test_request_invalid_body(client, payload):
    assert client.post("/api/auth/request-code", payload, content_type="application/json").status_code == 422


@pytest.mark.parametrize("path,method", [("/api/me", "get"), ("/api/admin/users", "get"), ("/api/admin/users/1/roles", "put")])
def test_anonymous_denied(client, path, method):
    response = getattr(client, method)(path, **({"data": {"roles": []}, "content_type": "application/json"} if method == "put" else {}))
    assert response.status_code == 401


@pytest.mark.parametrize("email", [email for email in SEED if email != "admin@example.com"])
def test_non_admin_denied(client, capsys, email):
    login(client, email, capsys)
    assert client.get("/api/admin/users").status_code == 403
    assert put_roles(client, User.objects.get(email=email).pk, ["creator"]).status_code == 403


def test_admin_assigns_removes_and_preserves_admin(client, capsys):
    admin = login(client, "admin@example.com", capsys)
    plain_client = Client()
    plain = login(plain_client, "user@example.com", capsys)
    users = client.get("/api/admin/users")
    assert users.status_code == 200
    assert len(users.json()) == 9
    assert all(u["roles"] == sorted(u["roles"]) for u in users.json())
    result = put_roles(client, plain["id"], ["juror", "creator"])
    assert result.status_code == 200
    assert result.json()["roles"] == ["creator", "juror", "user"]
    # Existing session sees new roles; no logout/login needed.
    assert plain_client.get("/api/me").json() == result.json()
    assert put_roles(client, plain["id"], []).json()["roles"] == ["user"]
    assert put_roles(client, admin["id"], ["creator"]).json()["roles"] == ["admin", "creator", "user"]
    assert put_roles(client, admin["id"], []).json()["roles"] == ["admin", "user"]
    assert put_roles(client, 999999, []).status_code == 404


@pytest.mark.parametrize("roles", [["admin"], ["user"], ["owner"], ["creator", "admin"], [12], None, "creator"])
def test_invalid_roles_rejected(client, capsys, roles):
    admin = login(client, "admin@example.com", capsys)
    assert put_roles(client, admin["id"], roles).status_code == 422
    assert client.get("/api/me").json()["roles"] == ["admin", "user"]


def test_csrf_protection_and_cookie_rotation(capsys):
    client = Client(enforce_csrf_checks=True)
    payload = {"email": "admin@example.com"}
    assert client.post("/api/auth/request-code", payload, content_type="application/json").status_code == 403
    assert client.get("/api/auth/csrf").status_code == 200
    token = client.cookies["csrftoken"].value
    assert client.post("/api/auth/request-code", payload, content_type="application/json", HTTP_X_CSRFTOKEN=token).status_code == 200
    code = re.search(r"LOGIN CODE admin@example.com (\d{6})", capsys.readouterr().out)[1]
    assert verify(client, payload["email"], code).status_code == 403
    result = client.post("/api/auth/verify", {**payload, "code": code}, content_type="application/json", HTTP_X_CSRFTOKEN=token)
    assert result.status_code == 200
    rotated = client.cookies["csrftoken"].value
    assert rotated != token
    user_id = result.json()["id"]
    assert put_roles(client, user_id, []).status_code == 403
    assert client.put(f"/api/admin/users/{user_id}/roles", {"roles": ["juror"]}, content_type="application/json", HTTP_X_CSRFTOKEN=rotated).status_code == 200
    assert client.post("/api/auth/logout").status_code == 403
    assert client.post("/api/auth/logout", HTTP_X_CSRFTOKEN=rotated).status_code == 200
    assert client.get("/api/me").status_code == 401
