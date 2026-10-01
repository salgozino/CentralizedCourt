import json
import re

import pytest
from django.contrib.auth import get_user_model
from django.test import Client

CODE_RE = re.compile(r"^LOGIN CODE (\S+) (\d{6})$", re.MULTILINE)


@pytest.fixture
def make_user(db):
    def _make(email, roles=()):
        user = get_user_model().objects.create_user(email)
        wanted = set(roles)
        user.is_admin = "admin" in wanted
        user.set_extra_roles(wanted - {"admin", "user"})
        user.save()
        return user

    return _make


@pytest.fixture
def post_json():
    def _post(client, path, data):
        return client.post(path, data=json.dumps(data), content_type="application/json")

    return _post


@pytest.fixture
def request_code(client, post_json, capsys):
    """Request a login code through the API and return the printed code."""

    def _request(email, client=client):
        capsys.readouterr()
        response = post_json(client, "/api/auth/request-code", {"email": email})
        assert response.status_code == 200
        match = CODE_RE.search(capsys.readouterr().out)
        return match.group(2) if match else None

    return _request


@pytest.fixture
def login(post_json, request_code):
    """Log a client in through the API; returns the verify response."""

    def _login(email, client=None):
        client = client or Client()
        code = request_code(email, client=client)
        assert code is not None
        response = post_json(client, "/api/auth/verify", {"email": email, "code": code})
        assert response.status_code == 200
        return client

    return _login
