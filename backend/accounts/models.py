from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models

ROLE_USER = "user"
ROLE_CREATOR = "creator"
ROLE_JUROR = "juror"
ROLE_ADMIN = "admin"

# Extra roles an admin can grant or remove through the API.
ASSIGNABLE_ROLES = (ROLE_CREATOR, ROLE_JUROR)


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        user = self.model(email=self.normalize_email(email).lower(), **extra_fields)
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
    """Login is by email; there is no username.

    Every user implicitly holds the `user` role; the flags below are the extra roles.
    `is_admin` is the app-level admin role, unrelated to Django's `is_staff`.
    """

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
        roles = [ROLE_USER]
        if self.is_admin:
            roles.append(ROLE_ADMIN)
        if self.is_creator:
            roles.append(ROLE_CREATOR)
        if self.is_juror:
            roles.append(ROLE_JUROR)
        return sorted(roles)

    def set_extra_roles(self, roles: set[str]) -> None:
        """Set the assignable roles; `admin` is left unchanged."""
        self.is_creator = ROLE_CREATOR in roles
        self.is_juror = ROLE_JUROR in roles


class LoginCode(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="login_codes")
    code = models.CharField(max_length=6)
    created_at = models.DateTimeField()
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    failed_attempts = models.PositiveSmallIntegerField(default=0)

    class Meta:
        indexes = [models.Index(fields=["user", "used_at"])]
