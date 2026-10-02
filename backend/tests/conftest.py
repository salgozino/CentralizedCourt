import io
import re

import pytest
from django.core.management import call_command
from django.test import Client

CODE_LINE = re.compile(r"^LOGIN CODE (\S+) (\d{6})$", re.MULTILINE)


@pytest.fixture
def seeded(db):
    call_command("seed", stdout=io.StringIO())


@pytest.fixture
def client():
    return Client()


@pytest.fixture
def request_code(client, capsys):
    """Request a login code and return it, read from the console output."""

    def _request(email: str) -> str:
        capsys.readouterr()
        response = client.post(
            "/api/auth/request-code", {"email": email}, content_type="application/json"
        )
        assert response.status_code == 200
        matches = CODE_LINE.findall(capsys.readouterr().out)
        assert len(matches) == 1, "expected exactly one LOGIN CODE line"
        printed_email, code = matches[0]
        assert printed_email == email
        return code

    return _request


@pytest.fixture
def verify(client):
    def _verify(email: str, code: str, on=None):
        return (on or client).post(
            "/api/auth/verify", {"email": email, "code": code}, content_type="application/json"
        )

    return _verify


@pytest.fixture
def login_as(seeded, request_code, verify):
    """Log `client` (or the given client) in as `email`."""

    def _login(email: str, on=None):
        code = request_code(email)
        response = verify(email, code, on=on)
        assert response.status_code == 200
        return response

    return _login
