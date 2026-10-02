from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.models import AbstractUser
from django.db import models


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        user = self.model(email=self.normalize_email(email).lower(), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.update(is_staff=True, is_superuser=True, is_admin=True)
        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    username = None
    email = models.EmailField(unique=True)
    is_creator = models.BooleanField(default=False)
    is_juror = models.BooleanField(default=False)
    is_admin = models.BooleanField(default=False)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []
    objects = UserManager()

    @property
    def roles(self):
        return sorted(["user"] + [role for role in ("admin", "creator", "juror")
                                  if getattr(self, f"is_{role}")])


class LoginCode(models.Model):
    # Independent browser challenges: issuance never replaces someone else's code.
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    digest = models.CharField(max_length=64)
    # Legacy codes migrate with NULL binding and cannot be verified.
    browser_digest = models.CharField(max_length=64, unique=True, null=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    expires_at = models.DateTimeField()
    used = models.BooleanField(default=False)


class LoginIssueBudget(models.Model):
    # HMAC of the socket peer IP (or global key), never the target email.
    key = models.CharField(max_length=64, primary_key=True)
    attempts = models.PositiveIntegerField(default=0)
    window_ends_at = models.DateTimeField()
