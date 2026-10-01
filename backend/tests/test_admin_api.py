import pytest
from django.core.management import call_command
from django.test import Client

LIST_URL = "/api/admin/users"


def roles_url(user_id):
    return f"/api/admin/users/{user_id}/roles"


@pytest.fixture
def seeded(db):
    call_command("seed")


@pytest.fixture
def put_json():
    import json

    def _put(client, path, data):
        return client.put(path, data=json.dumps(data), content_type="application/json")

    return _put


@pytest.fixture
def user_id(seeded):
    from django.contrib.auth import get_user_model

    return lambda email: get_user_model().objects.get(email=email).id


NON_ADMINS = ["creator1@example.com", "juror1@example.com", "user@example.com"]


def test_list_requires_login(seeded):
    assert Client().get(LIST_URL).status_code == 401


@pytest.mark.parametrize("email", NON_ADMINS)
def test_list_forbidden_for_non_admin(seeded, login, email):
    assert login(email).get(LIST_URL).status_code == 403


def test_list_returns_all_users_ordered_by_id(seeded, login):
    response = login("admin@example.com").get(LIST_URL)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 9
    assert [u["id"] for u in data] == sorted(u["id"] for u in data)
    by_email = {u["email"]: u["roles"] for u in data}
    assert by_email["admin@example.com"] == ["admin", "user"]
    assert by_email["creator2@example.com"] == ["creator", "user"]
    assert by_email["juror5@example.com"] == ["juror", "user"]
    assert by_email["user@example.com"] == ["user"]
    assert set(data[0]) == {"id", "email", "roles"}


def test_put_requires_login(seeded, put_json, user_id):
    response = put_json(Client(), roles_url(user_id("user@example.com")), {"roles": []})
    assert response.status_code == 401


@pytest.mark.parametrize("email", NON_ADMINS)
@pytest.mark.parametrize("body", [{"roles": ["creator"]}, {"roles": ["admin"]}, {"nope": 1}])
def test_put_forbidden_for_non_admin_even_with_invalid_body(
    seeded, login, put_json, user_id, email, body
):
    response = put_json(login(email), roles_url(user_id("user@example.com")), body)
    assert response.status_code == 403


def test_put_unknown_user_is_404(seeded, login, put_json):
    response = put_json(login("admin@example.com"), roles_url(999999), {"roles": ["creator"]})
    assert response.status_code == 404


@pytest.mark.parametrize(
    "body",
    [
        {"roles": ["admin"]},
        {"roles": ["user"]},
        {"roles": ["superhero"]},
        {"roles": ["creator", "admin"]},
        {},
        {"roles": "creator"},
        {"roles": None},
    ],
)
def test_put_invalid_body_is_422(seeded, login, put_json, user_id, body):
    response = put_json(login("admin@example.com"), roles_url(user_id("user@example.com")), body)
    assert response.status_code == 422


def test_put_invalid_body_wins_over_unknown_user(seeded, login, put_json):
    response = put_json(login("admin@example.com"), roles_url(999999), {"roles": ["admin"]})
    assert response.status_code == 422


def test_admin_grants_roles_and_user_sees_them(seeded, login, put_json, user_id):
    admin = login("admin@example.com")
    response = put_json(
        admin, roles_url(user_id("user@example.com")), {"roles": ["creator", "juror"]}
    )
    assert response.status_code == 200
    assert response.json()["email"] == "user@example.com"
    assert response.json()["roles"] == ["creator", "juror", "user"]
    me = login("user@example.com").get("/api/me")
    assert me.json()["roles"] == ["creator", "juror", "user"]


def test_duplicates_are_deduped(seeded, login, put_json, user_id):
    response = put_json(
        login("admin@example.com"),
        roles_url(user_id("user@example.com")),
        {"roles": ["juror", "juror"]},
    )
    assert response.status_code == 200
    assert response.json()["roles"] == ["juror", "user"]


def test_admin_removes_roles(seeded, login, put_json, user_id):
    response = put_json(login("admin@example.com"), roles_url(user_id("juror1@example.com")), {"roles": []})
    assert response.status_code == 200
    assert response.json()["roles"] == ["user"]


def test_admin_own_roles_keep_admin(seeded, login, put_json, user_id):
    response = put_json(
        login("admin@example.com"), roles_url(user_id("admin@example.com")), {"roles": ["juror"]}
    )
    assert response.status_code == 200
    assert response.json()["roles"] == ["admin", "juror", "user"]


def test_target_admin_stays_admin(seeded, login, make_user, put_json):
    other = make_user("admin2@example.com", roles=["admin", "creator"])
    response = put_json(login("admin@example.com"), roles_url(other.id), {"roles": []})
    assert response.status_code == 200
    assert response.json()["roles"] == ["admin", "user"]


def test_role_change_applies_to_logged_in_user_without_relogin(seeded, login, put_json, user_id):
    user_client = login("user@example.com")
    assert user_client.get("/api/me").json()["roles"] == ["user"]
    put_json(login("admin@example.com"), roles_url(user_id("user@example.com")), {"roles": ["creator"]})
    assert user_client.get("/api/me").json()["roles"] == ["creator", "user"]


@pytest.fixture
def csrf_client():
    return Client(enforce_csrf_checks=True)


def test_csrf_anonymous_put_is_401(seeded, csrf_client, put_json, user_id):
    response = put_json(csrf_client, roles_url(user_id("user@example.com")), {"roles": []})
    assert response.status_code == 401


def test_csrf_anonymous_list_is_401(seeded, csrf_client):
    assert csrf_client.get(LIST_URL).status_code == 401


def test_csrf_admin_put_without_token_is_403(seeded, login, csrf_client, put_json, user_id):
    admin = login("admin@example.com", client=csrf_client)
    response = put_json(admin, roles_url(user_id("user@example.com")), {"roles": ["juror"]})
    assert response.status_code == 403
    assert "CSRF" in response.json()["detail"]


def test_csrf_admin_put_with_token_is_200(seeded, login, csrf_client, put_json, user_id):
    admin = login("admin@example.com", client=csrf_client)
    token = admin.cookies["csrftoken"].value
    response = admin.put(
        roles_url(user_id("user@example.com")),
        data='{"roles": ["juror"]}',
        content_type="application/json",
        headers={"X-CSRFToken": token},
    )
    assert response.status_code == 200
    assert response.json()["roles"] == ["juror", "user"]


def test_csrf_non_admin_put_with_token_is_403(seeded, login, csrf_client, user_id):
    user = login("user@example.com", client=csrf_client)
    token = user.cookies["csrftoken"].value
    response = user.put(
        roles_url(user_id("user@example.com")),
        data='{"roles": ["juror"]}',
        content_type="application/json",
        headers={"X-CSRFToken": token},
    )
    assert response.status_code == 403
    assert "CSRF" not in response.json()["detail"]
