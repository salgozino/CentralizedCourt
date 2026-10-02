import secrets
from datetime import timedelta

from django.contrib.auth import login, logout
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.db.models import F
from django.http import HttpResponse
from django.utils import timezone
from django.utils.crypto import salted_hmac
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from ninja import NinjaAPI, Schema
from ninja.decorators import decorate_view
from ninja.errors import HttpError
from ninja.security import django_auth
from pydantic import field_validator

from .models import LoginCode, LoginIssueBudget, User

api = NinjaAPI(title="CentralizedCourt")

VERIFY_ATTEMPT_LIMIT = 5
LOGIN_WINDOW = timedelta(minutes=10)
ISSUE_IP_LIMIT = 20
ISSUE_GLOBAL_LIMIT = 200
CHALLENGE_COOKIE = "login_challenge"


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


def browser_digest(token):
    return salted_hmac("login-browser", token, algorithm="sha256").hexdigest()


def reserve_issuance(key, limit, now):
    """Called inside atomic; write first to serialize SQLite writers safely."""
    key = salted_hmac("login-issuance", key, algorithm="sha256").hexdigest()
    LoginIssueBudget.objects.filter(key=key, window_ends_at__lte=now).update(
        attempts=0, window_ends_at=now + LOGIN_WINDOW,
    )
    LoginIssueBudget.objects.get_or_create(
        key=key, defaults={"window_ends_at": now + LOGIN_WINDOW},
    )
    return bool(LoginIssueBudget.objects.filter(key=key, attempts__lt=limit).update(
        attempts=F("attempts") + 1,
    ))


@api.get("/auth/csrf")
@decorate_view(ensure_csrf_cookie)
def csrf(request):
    return {"detail": "CSRF cookie set"}


@api.post("/auth/request-code")
@decorate_view(csrf_protect)
def request_code(request, payload: EmailInput, response: HttpResponse):
    now = timezone.now()
    token = secrets.token_urlsafe(32)
    user = None
    with transaction.atomic():
        # Do not trust client-supplied X-Forwarded-For. In this local deployment,
        # Vite is the peer for proxied traffic; see README for proxy limitations.
        source = request.META.get("REMOTE_ADDR", "unknown")
        allowed = reserve_issuance(f"ip:{source}", ISSUE_IP_LIMIT, now)
        if allowed:
            allowed = reserve_issuance("global", ISSUE_GLOBAL_LIMIT, now)
        if allowed:
            LoginCode.objects.filter(expires_at__lte=now).delete()
            LoginIssueBudget.objects.filter(window_ends_at__lt=now - LOGIN_WINDOW).delete()
            user = User.objects.filter(email=payload.email, is_active=True).first()
            if user:
                code = f"{secrets.randbelow(1_000_000):06d}"
                LoginCode.objects.create(
                    user=user, digest=code_digest(user.email, code),
                    browser_digest=browser_digest(token), expires_at=now + LOGIN_WINDOW,
                )
    # Same response/cookie shape for known, unknown and throttled requests.
    response.set_cookie(CHALLENGE_COOKIE, token, max_age=600, httponly=True,
                        secure=request.is_secure(), samesite="Lax", path="/api/auth/")
    if user:
        print(f"LOGIN CODE {user.email} {code}", flush=True)
    return {"detail": "If the account exists and requests are within the limit, a login code has been issued."}


@api.post("/auth/verify", response=Profile)
@decorate_view(csrf_protect)
def verify(request, payload: VerifyInput):
    token = request.COOKIES.get(CHALLENGE_COOKIE)
    if not token or len(token) != 43:
        raise HttpError(401, "Invalid or expired code")
    now = timezone.now()
    authenticated = False
    with transaction.atomic():
        challenge = LoginCode.objects.filter(
            browser_digest=browser_digest(token), user__email=payload.email,
            user__is_active=True, used=False, expires_at__gt=now,
        )
        # The first statement is a conditional write: no read/modify/write race,
        # and SQLite serializes competing workers before consuming a slot.
        allowed = challenge.filter(attempts__lt=VERIFY_ATTEMPT_LIMIT).update(
            attempts=F("attempts") + 1,
        )
        if allowed:
            authenticated = bool(challenge.filter(
                digest=code_digest(payload.email, payload.code),
            ).update(used=True))
            if authenticated:
                user = LoginCode.objects.get(browser_digest=browser_digest(token)).user
                login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    # Commit failed attempts too; guessing only spends this browser's challenge.
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
