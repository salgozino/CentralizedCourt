import re
from datetime import timedelta

import pytest
from django.test import Client
from django.utils import timezone

from accounts.models import LoginCode

LINE_RE = re.compile(r"^LOGIN CODE (\S+) (\d{6})\n$")


@pytest.fixture
def users(make_user):
    return {
        "admin": make_user("admin@example.com", ["admin"]),
        "juror1": make_user("juror1@example.com", ["juror"]),
        "juror2": make_user("juror2@example.com", ["juror"]),
    }


def test_request_code_unknown_email(client, post_json, capsys, users):
    known = post_json(client, "/api/auth/request-code", {"email": "juror1@example.com"})
    capsys.readouterr()
    LoginCode.objects.all().delete()
    unknown = post_json(client, "/api/auth/request-code", {"email": "nobody@example.com"})
    assert unknown.status_code == 200
    assert unknown.json() == known.json()
    assert capsys.readouterr().out == ""
    assert LoginCode.objects.count() == 0


def test_request_code_prints_single_line(client, post_json, capsys, users):
    post_json(client, "/api/auth/request-code", {"email": " Juror1@Example.com "})
    out = capsys.readouterr().out
    match = LINE_RE.match(out)
    assert match
    assert match.group(1) == "juror1@example.com"
    assert LoginCode.objects.filter(user=users["juror1"]).count() == 1
    stored = LoginCode.objects.get()
    assert stored.code_hash != match.group(2)
    assert len(stored.code_hash) == 64


@pytest.mark.parametrize("body", [{}, {"email": 5}, {"foo": "bar"}])
def test_request_code_invalid_body(client, post_json, body):
    assert post_json(client, "/api/auth/request-code", body).status_code == 422


def test_request_code_invalid_json(client, db):
    response = client.post("/api/auth/request-code", data="{nope", content_type="application/json")
    assert response.status_code == 422


def test_happy_path(client, post_json, request_code, users):
    code = request_code("JUROR1@example.com")
    response = post_json(client, "/api/auth/verify", {"email": "Juror1@Example.com", "code": code})
    assert response.status_code == 200
    expected = {"id": users["juror1"].id, "email": "juror1@example.com", "roles": ["juror", "user"]}
    assert response.json() == expected
    assert "sessionid" in response.cookies
    assert "csrftoken" in response.cookies
    me = client.get("/api/me")
    assert me.status_code == 200
    assert me.json() == expected


def test_roles_sorted(login, users):
    client = login("admin@example.com")
    assert client.get("/api/me").json()["roles"] == ["admin", "user"]


def test_wrong_code(client, post_json, request_code, users):
    code = request_code("juror1@example.com")
    wrong = f"{(int(code) + 1) % 10**6:06d}"
    response = post_json(client, "/api/auth/verify", {"email": "juror1@example.com", "code": wrong})
    assert response.status_code == 401
    assert client.get("/api/me").status_code == 401


def test_reused_code(client, post_json, request_code, users):
    code = request_code("juror1@example.com")
    body = {"email": "juror1@example.com", "code": code}
    assert post_json(client, "/api/auth/verify", body).status_code == 200
    assert post_json(Client(), "/api/auth/verify", body).status_code == 401


def test_expired_code(client, post_json, request_code, users):
    code = request_code("juror1@example.com")
    LoginCode.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
    response = post_json(client, "/api/auth/verify", {"email": "juror1@example.com", "code": code})
    assert response.status_code == 401


def test_foreign_code(client, post_json, request_code, users):
    code = request_code("juror1@example.com")
    response = post_json(client, "/api/auth/verify", {"email": "juror2@example.com", "code": code})
    assert response.status_code == 401


def test_unknown_email_verify(client, post_json, db):
    response = post_json(client, "/api/auth/verify", {"email": "nobody@example.com", "code": "123456"})
    assert response.status_code == 401


def test_older_code_stays_valid(client, post_json, request_code, users):
    first = request_code("juror1@example.com")
    request_code("juror1@example.com")
    response = post_json(client, "/api/auth/verify", {"email": "juror1@example.com", "code": first})
    assert response.status_code == 200


def test_me_requires_login(client):
    assert client.get("/api/me").status_code == 401


def test_logout(login, users):
    client = login("juror1@example.com")
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/me").status_code == 401


def test_logout_without_session(client):
    assert client.post("/api/auth/logout").status_code == 200
