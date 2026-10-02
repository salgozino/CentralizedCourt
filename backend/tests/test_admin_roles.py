import pytest
from django.test import Client

from accounts.models import User

pytestmark = pytest.mark.django_db


def put_roles(client, user_id, roles):
    return client.put(
        f"/api/admin/users/{user_id}/roles", {"roles": roles}, content_type="application/json"
    )


def user_id(email):
    return User.objects.get(email=email).id


def test_admin_lists_users(login_as, client):
    login_as("admin@example.com")
    response = client.get("/api/admin/users")
    assert response.status_code == 200
    users = {u["email"]: u for u in response.json()}
    assert len(users) == 9
    assert users["admin@example.com"]["roles"] == ["admin", "user"]
    assert users["user@example.com"]["roles"] == ["user"]
    assert all(set(u) == {"id", "email", "roles"} for u in users.values())


def test_admin_endpoints_require_login(seeded, client):
    assert client.get("/api/admin/users").status_code == 401
    assert put_roles(client, user_id("user@example.com"), ["creator"]).status_code == 401


@pytest.mark.parametrize(
    "email",
    ["user@example.com", "creator1@example.com", "juror1@example.com"],
)
def test_non_admin_gets_403(login_as, client, email):
    login_as(email)
    assert client.get("/api/admin/users").status_code == 403
    response = put_roles(client, user_id("user@example.com"), ["creator", "juror"])
    assert response.status_code == 403
    assert User.objects.get(email="user@example.com").roles == ["user"]


def test_non_admin_cannot_grant_themselves_roles(login_as, client):
    login_as("creator1@example.com")
    assert put_roles(client, user_id("creator1@example.com"), ["creator", "juror"]).status_code == 403
    assert User.objects.get(email="creator1@example.com").roles == ["creator", "user"]


def test_admin_grants_creator_and_juror(login_as, client):
    login_as("admin@example.com")
    response = put_roles(client, user_id("user@example.com"), ["juror", "creator"])
    assert response.status_code == 200
    assert response.json() == {
        "id": user_id("user@example.com"),
        "email": "user@example.com",
        "roles": ["creator", "juror", "user"],
    }

    other = Client()
    login_as("user@example.com", on=other)
    assert other.get("/api/me").json()["roles"] == ["creator", "juror", "user"]


def test_role_change_applies_to_existing_session(login_as, client):
    user_client = Client()
    login_as("user@example.com", on=user_client)
    login_as("admin@example.com")
    put_roles(client, user_id("user@example.com"), ["creator"])
    assert user_client.get("/api/me").json()["roles"] == ["creator", "user"]


def test_admin_removes_roles(login_as, client):
    login_as("admin@example.com")
    response = put_roles(client, user_id("juror1@example.com"), [])
    assert response.status_code == 200
    assert response.json()["roles"] == ["user"]


def test_user_role_in_body_is_accepted_as_implied(login_as, client):
    login_as("admin@example.com")
    response = put_roles(client, user_id("user@example.com"), ["user", "juror"])
    assert response.status_code == 200
    assert response.json()["roles"] == ["juror", "user"]


def test_admin_role_is_left_unchanged(login_as, client):
    login_as("admin@example.com")
    response = put_roles(client, user_id("admin@example.com"), ["creator"])
    assert response.status_code == 200
    assert response.json()["roles"] == ["admin", "creator", "user"]
    response = put_roles(client, user_id("admin@example.com"), [])
    assert response.json()["roles"] == ["admin", "user"]


@pytest.mark.parametrize("roles", [["admin"], ["creator", "admin"], ["superuser"], ["Juror"]])
def test_invalid_or_admin_roles_are_rejected(login_as, client, roles):
    login_as("admin@example.com")
    target = user_id("user@example.com")
    assert put_roles(client, target, roles).status_code == 422
    assert User.objects.get(id=target).roles == ["user"]


def test_admin_cannot_remove_admin_role_via_api(login_as, client):
    login_as("admin@example.com")
    assert put_roles(client, user_id("admin@example.com"), ["admin"]).status_code == 422
    assert User.objects.get(email="admin@example.com").is_admin


@pytest.mark.parametrize("body", [{}, {"roles": "creator"}, {"roles": None}])
def test_invalid_roles_body(login_as, client, body):
    login_as("admin@example.com")
    response = client.put(
        f"/api/admin/users/{user_id('user@example.com')}/roles",
        body,
        content_type="application/json",
    )
    assert response.status_code == 422


def test_unknown_user_returns_404(login_as, client):
    login_as("admin@example.com")
    assert put_roles(client, 999_999, ["creator"]).status_code == 404


def test_put_roles_requires_csrf_token(login_as):
    client = Client(enforce_csrf_checks=True)
    login_as("admin@example.com", on=client)
    target = user_id("user@example.com")
    assert put_roles(client, target, ["creator"]).status_code == 403

    client.get("/api/auth/csrf")
    token = client.cookies["csrftoken"].value
    response = client.put(
        f"/api/admin/users/{target}/roles",
        {"roles": ["creator"]},
        content_type="application/json",
        headers={"X-CSRFToken": token},
    )
    assert response.status_code == 200
