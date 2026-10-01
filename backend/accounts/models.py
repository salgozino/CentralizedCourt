from collections.abc import Iterable
from datetime import timedelta

from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models

EXTRA_ROLES = ("creator", "juror")
ALL_ROLES = ("admin", *EXTRA_ROLES, "user")
CODE_TTL = timedelta(minutes=10)


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_admin", True)
        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    username = None
    email = models.EmailField(unique=True)
    is_admin = models.BooleanField(default=False)
    is_creator = models.BooleanField(default=False)
    is_juror = models.BooleanField(default=False)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    @property
    def roles(self) -> list[str]:
        roles = {"user"}
        for name in ("admin", *EXTRA_ROLES):
            if getattr(self, f"is_{name}"):
                roles.add(name)
        return sorted(roles)

    def set_extra_roles(self, roles: Iterable[str]) -> None:
        wanted = set(roles)
        invalid = wanted - set(EXTRA_ROLES)
        if invalid:
            raise ValueError(f"Invalid roles: {sorted(invalid)}")
        self.is_creator = "creator" in wanted
        self.is_juror = "juror" in wanted

    def __str__(self):
        return self.email


class LoginCode(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="login_codes")
    code_hash = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
