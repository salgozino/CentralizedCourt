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
    # Account-wide budget: issuing another LoginCode must not reset it.
    verification_attempts = models.PositiveSmallIntegerField(default=0)
    verification_window_ends_at = models.DateTimeField(null=True, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []
    objects = UserManager()

    @property
    def roles(self):
        return sorted(["user"] + [role for role in ("admin", "creator", "juror")
                                  if getattr(self, f"is_{role}")])


class LoginCode(models.Model):
    # Only the latest code for each email is valid. Never store plaintext codes.
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    digest = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    used = models.BooleanField(default=False)
