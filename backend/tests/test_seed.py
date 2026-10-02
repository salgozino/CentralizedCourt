import io

import pytest
from django.conf import settings
from django.core.management import call_command

from accounts.models import User

pytestmark = pytest.mark.django_db

EXPECTED = {
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


def seed():
    call_command("seed", stdout=io.StringIO())


def test_custom_user_model():
    assert settings.AUTH_USER_MODEL == "accounts.User"


def test_seed_creates_users_with_roles():
    seed()
    assert {u.email: u.roles for u in User.objects.all()} == EXPECTED


def test_seed_is_idempotent():
    seed()
    User.objects.filter(email="user@example.com").update(is_creator=True)
    seed()
    assert User.objects.count() == 9
    assert User.objects.get(email="user@example.com").roles == ["creator", "user"]
    assert User.objects.get(email="admin@example.com").roles == ["admin", "user"]


def test_seeded_users_have_no_usable_password():
    seed()
    assert not any(u.has_usable_password() for u in User.objects.all())
