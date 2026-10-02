import secrets
from datetime import timedelta

from django.contrib.auth import login, logout
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone
from django.utils.crypto import salted_hmac
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from ninja import NinjaAPI, Schema
from ninja.decorators import decorate_view
from ninja.errors import HttpError
from ninja.security import django_auth
from pydantic import field_validator

from .models import LoginCode, User

api = NinjaAPI(title="CentralizedCourt")

VERIFY_ATTEMPT_LIMIT = 5
VERIFY_WINDOW = timedelta(minutes=10)


class EmailInput(Schema):
    email: str

    @field_validator("email")
    @classmethod
    def valid_email(cls, value):
        value = value.strip().lower()
        try:
            validate_email(value)
        except ValidationError:
            raise ValueError("Invalid email")
        return value


class VerifyInput(EmailInput):
    code: str


class RolesInput(Schema):
    roles: list[str]

    @field_validator("roles")
    @classmethod
    def valid_roles(cls, value):
        if not set(value) <= {"creator", "juror"}:
            raise ValueError("Only creator and juror can be assigned; admin is unchanged")
        return value


class Profile(Schema):
    id: int
    email: str
    roles: list[str]


def code_digest(email, code):
    return salted_hmac("login-code", f"{email}:{code}", algorithm="sha256").hexdigest()


@api.get("/auth/csrf")
@decorate_view(ensure_csrf_cookie)
def csrf(request):
    return {"detail": "CSRF cookie set"}


@api.post("/auth/request-code")
@decorate_view(csrf_protect)
def request_code(request, payload: EmailInput):
    user = User.objects.filter(email=payload.email, is_active=True).first()
    if user:
        code = f"{secrets.randbelow(1_000_000):06d}"
        LoginCode.objects.update_or_create(
            user=user,
            defaults={"digest": code_digest(user.email, code),
                      "expires_at": timezone.now() + timedelta(minutes=10), "used": False},
        )
        print(f"LOGIN CODE {user.email} {code}", flush=True)
    return {"detail": "If the account exists, a login code has been issued."}


@api.post("/auth/verify", response=Profile)
@decorate_view(csrf_protect)
def verify(request, payload: VerifyInput):
    now = timezone.now()
    authenticated = False
    with transaction.atomic():
        account = User.objects.filter(email=payload.email, is_active=True)
        # Write first: SQLite serializes competing writers, avoiding a read/write
        # lock upgrade. A conditional increment reserves a slot across workers.
        account.filter(
            Q(verification_window_ends_at__isnull=True)
            | Q(verification_window_ends_at__lte=now)
        ).update(verification_attempts=0, verification_window_ends_at=now + VERIFY_WINDOW)
        allowed = account.filter(
            verification_attempts__lt=VERIFY_ATTEMPT_LIMIT,
            verification_window_ends_at__gt=now,
        ).update(verification_attempts=F("verification_attempts") + 1)
        if allowed:
            user = account.get()
            authenticated = bool(LoginCode.objects.filter(
                user=user, digest=code_digest(payload.email, payload.code),
                used=False, expires_at__gt=now,
            ).update(used=True))
            if authenticated:
                login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    # Raise AFTER commit: invalid codes must not roll back the attempt counter.
    # Unknown accounts, wrong codes and exhausted budgets have the same response.
    if not authenticated:
        raise HttpError(401, "Invalid or expired code")
    return user


@api.post("/auth/logout")
@decorate_view(csrf_protect)
def sign_out(request):
    logout(request)
    return {"detail": "Logged out"}


@api.get("/me", auth=django_auth, response=Profile)
def me(request):
    return request.auth


def require_admin(request):
    if not request.auth.is_admin:
        raise HttpError(403, "Admin role required")


@api.get("/admin/users", auth=django_auth, response=list[Profile])
def users(request):
    require_admin(request)
    return User.objects.order_by("email")


@api.put("/admin/users/{user_id}/roles", auth=django_auth, response=Profile)
def update_roles(request, user_id: int, payload: RolesInput):
    require_admin(request)
    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        raise HttpError(404, "User not found")
    user.is_creator = "creator" in payload.roles
    user.is_juror = "juror" in payload.roles
    user.save(update_fields=["is_creator", "is_juror"])
    return user
