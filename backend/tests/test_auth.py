import re
from datetime import timedelta

import pytest
from django.test import Client
from django.utils import timezone

from accounts.models import LOGIN_THROTTLE_WINDOW, LoginCode, LoginEvent
from accounts.services import MAX_ATTEMPTS_PER_CODE, MAX_CODE_REQUESTS_PER_IP, MAX_FAILED_VERIFICATIONS_PER_IP

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


def _wrong(code):
    return f"{(int(code) + 1) % 10**6:06d}"


def test_older_code_rejected_after_new_request(client, post_json, request_code, users):
    first = request_code("juror1@example.com")
    second = request_code("juror1@example.com")
    body = {"email": "juror1@example.com"}
    assert post_json(client, "/api/auth/verify", {**body, "code": first}).status_code == 401
    assert post_json(client, "/api/auth/verify", {**body, "code": second}).status_code == 200


def test_one_wrong_attempt_then_correct(client, post_json, request_code, users):
    code = request_code("juror1@example.com")
    body = {"email": "juror1@example.com"}
    assert post_json(client, "/api/auth/verify", {**body, "code": _wrong(code)}).status_code == 401
    assert post_json(client, "/api/auth/verify", {**body, "code": code}).status_code == 200


def test_me_requires_login(client):
    assert client.get("/api/me").status_code == 401


def test_logout(login, users):
    client = login("juror1@example.com")
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/me").status_code == 401


def test_logout_without_session(client):
    assert client.post("/api/auth/logout").status_code == 200


def test_attacker_cannot_block_victim(post_json, request_code, users):
    attacker = Client(REMOTE_ADDR="10.0.0.66")
    victim = Client(REMOTE_ADDR="10.0.0.1")
    body = {"email": "admin@example.com"}
    for _ in range(10):
        request_code("admin@example.com", client=attacker)
    for _ in range(25):
        assert post_json(attacker, "/api/auth/verify", {**body, "code": "000000"}).status_code == 401
    code = request_code("admin@example.com", client=victim)
    assert code is not None
    assert post_json(victim, "/api/auth/verify", {**body, "code": code}).status_code == 200


def test_victim_code_survives_attacker_requests(post_json, request_code, users):
    victim = Client(REMOTE_ADDR="10.0.0.1")
    attacker = Client(REMOTE_ADDR="10.0.0.66")
    body = {"email": "admin@example.com"}
    code = request_code("admin@example.com", client=victim)
    request_code("admin@example.com", client=attacker)
    assert post_json(victim, "/api/auth/verify", {**body, "code": code}).status_code == 200


def test_code_is_bound_to_requesting_session(post_json, request_code, users):
    session_a, session_b = Client(), Client()
    code = request_code("juror1@example.com", client=session_a)
    response = post_json(session_b, "/api/auth/verify", {"email": "juror1@example.com", "code": code})
    assert response.status_code == 401


def test_attempt_cap_per_code(client, post_json, request_code, users):
    code = request_code("juror1@example.com")
    body = {"email": "juror1@example.com"}
    for _ in range(MAX_ATTEMPTS_PER_CODE):
        assert post_json(client, "/api/auth/verify", {**body, "code": _wrong(code)}).status_code == 401
    assert post_json(client, "/api/auth/verify", {**body, "code": code}).status_code == 401


def test_attacker_guesses_do_not_burn_victim_code(post_json, request_code, users):
    victim = Client(REMOTE_ADDR="10.0.0.1")
    attacker = Client(REMOTE_ADDR="10.0.0.66")
    body = {"email": "admin@example.com"}
    code = request_code("admin@example.com", client=victim)
    for _ in range(MAX_ATTEMPTS_PER_CODE + 1):
        post_json(attacker, "/api/auth/verify", {**body, "code": _wrong(code)})
    assert LoginCode.objects.get().failed_attempts == 0
    assert post_json(victim, "/api/auth/verify", {**body, "code": code}).status_code == 200


def test_request_cap_per_ip(post_json, request_code, capsys, users):
    spammer = Client(REMOTE_ADDR="10.0.0.66")
    for _ in range(MAX_CODE_REQUESTS_PER_IP):
        assert request_code("juror1@example.com", client=spammer) is not None
    capsys.readouterr()
    response = post_json(spammer, "/api/auth/request-code", {"email": "juror1@example.com"})
    assert response.status_code == 200
    assert response.json() == {"detail": "If the email exists, a code was sent."}
    assert "LOGIN CODE" not in capsys.readouterr().out
    assert request_code("juror1@example.com", client=Client(REMOTE_ADDR="10.0.0.1")) is not None


def test_unknown_emails_count_toward_request_cap(post_json, request_code, users):
    spammer = Client(REMOTE_ADDR="10.0.0.66")
    for i in range(MAX_CODE_REQUESTS_PER_IP):
        request_code(f"nobody{i}@example.com", client=spammer)
    assert request_code("juror1@example.com", client=spammer) is None


def test_request_cap_window_expires(post_json, request_code, users):
    spammer = Client(REMOTE_ADDR="10.0.0.66")
    for _ in range(MAX_CODE_REQUESTS_PER_IP):
        request_code("juror1@example.com", client=spammer)
    LoginEvent.objects.update(created_at=timezone.now() - LOGIN_THROTTLE_WINDOW - timedelta(seconds=1))
    assert request_code("juror1@example.com", client=spammer) is not None


def test_failure_cap_per_ip(post_json, request_code, users):
    attacker = Client(REMOTE_ADDR="10.0.0.66")
    body = {"email": "juror1@example.com"}
    code = request_code("juror1@example.com", client=attacker)
    for i in range(MAX_FAILED_VERIFICATIONS_PER_IP):
        post_json(attacker, "/api/auth/verify", {"email": f"nobody{i}@example.com", "code": "000000"})
    assert post_json(attacker, "/api/auth/verify", {**body, "code": code}).status_code == 401
    other = Client(REMOTE_ADDR="10.0.0.1")
    assert post_json(other, "/api/auth/verify", {**body, "code": request_code(body["email"], client=other)}).status_code == 200


def _proxied(forwarded_for, remote_addr="127.0.0.1"):
    return Client(REMOTE_ADDR=remote_addr, HTTP_X_FORWARDED_FOR=forwarded_for)


def test_attacker_behind_proxy_cannot_block_victim(post_json, request_code, users):
    attacker, victim = _proxied("10.0.0.66"), _proxied("10.0.0.1")
    body = {"email": "admin@example.com"}
    for _ in range(MAX_CODE_REQUESTS_PER_IP):
        request_code("admin@example.com", client=attacker)
    for _ in range(MAX_FAILED_VERIFICATIONS_PER_IP + 5):
        post_json(attacker, "/api/auth/verify", {**body, "code": "000000"})
    code = request_code("admin@example.com", client=victim)
    assert code is not None
    assert post_json(victim, "/api/auth/verify", {**body, "code": code}).status_code == 200


def test_spoofed_forwarded_for_entries_are_ignored(request_code, users):
    attacker = _proxied("10.0.0.1, 10.0.0.66")
    for _ in range(MAX_CODE_REQUESTS_PER_IP):
        request_code("juror1@example.com", client=attacker)
    assert request_code("juror1@example.com", client=attacker) is None
    assert set(LoginEvent.objects.values_list("ip", flat=True)) == {"10.0.0.66"}
    assert request_code("juror1@example.com", client=_proxied("10.0.0.1")) is not None


@pytest.mark.parametrize(
    ("remote_addr", "forwarded_for", "expected"),
    [("10.0.0.5", "10.0.0.1", "10.0.0.5"), ("127.0.0.1", "10.0.0.1, garbage", "127.0.0.1")],
)
def test_forwarded_for_not_trusted(request_code, users, remote_addr, forwarded_for, expected):
    request_code("juror1@example.com", client=_proxied(forwarded_for, remote_addr))
    assert set(LoginEvent.objects.values_list("ip", flat=True)) == {expected}
