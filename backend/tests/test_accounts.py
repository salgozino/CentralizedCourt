import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command

from accounts.management.commands.seed import SEED_USERS

User = get_user_model()

EXPECTED_SEED = {
    "admin@example.com": ["admin", "user"],
    "creator1@example.com": ["creator", "user"],
    "creator2@example.com": ["creator", "user"],
    "juror1@example.com": ["juror", "user"],
    "juror2@example.com": ["juror", "user"],
    "juror3@example.com": ["juror", "user"],
    "juror4@example.com": ["juror", "user"],
    "juror5@example.com": ["juror", "user"],
    "user@example.com": ["user"],
}


def test_user_model_is_accounts_user():
    assert User._meta.label == "accounts.User"
    assert User.USERNAME_FIELD == "email"


@pytest.mark.django_db
def test_create_user_normalizes_email_and_unusable_password():
    user = User.objects.create_user("Foo@Example.COM")
    assert user.email == "foo@example.com"
    assert not user.has_usable_password()


@pytest.mark.django_db
def test_create_superuser_is_admin():
    user = User.objects.create_superuser("root@example.com", "pw12345!")
    assert user.is_staff and user.is_superuser and user.is_admin


@pytest.mark.parametrize(
    "flags,expected",
    [
        ({}, ["user"]),
        ({"is_admin": True}, ["admin", "user"]),
        ({"is_creator": True, "is_juror": True}, ["creator", "juror", "user"]),
        (
            {"is_admin": True, "is_creator": True, "is_juror": True},
            ["admin", "creator", "juror", "user"],
        ),
    ],
)
def test_roles(flags, expected):
    assert User(email="a@example.com", **flags).roles == expected


def test_set_extra_roles_keeps_admin():
    user = User(email="a@example.com", is_admin=True, is_juror=True)
    user.set_extra_roles(["creator"])
    assert user.is_creator and not user.is_juror and user.is_admin
    user.set_extra_roles([])
    assert not user.is_creator and not user.is_juror and user.is_admin


@pytest.mark.parametrize("bad", ["admin", "user", "nope"])
def test_set_extra_roles_rejects_invalid(bad):
    user = User(email="a@example.com")
    with pytest.raises(ValueError):
        user.set_extra_roles(["creator", bad])
    assert not user.is_creator


@pytest.mark.django_db
def test_seed_creates_expected_users():
    call_command("seed")
    assert User.objects.count() == 9
    assert {u.email: u.roles for u in User.objects.all()} == EXPECTED_SEED
    assert {email: sorted({"user", *extra}) for email, extra in SEED_USERS.items()} == EXPECTED_SEED


@pytest.mark.django_db
def test_seed_is_idempotent_and_keeps_roles():
    call_command("seed")
    plain = User.objects.get(email="user@example.com")
    plain.set_extra_roles(["creator"])
    plain.save()
    call_command("seed")
    assert User.objects.count() == 9
    assert User.objects.get(email="user@example.com").roles == ["creator", "user"]
