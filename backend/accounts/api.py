from django.contrib.auth import login, logout
from django.middleware.csrf import get_token
from ninja import Router, Schema
from ninja.errors import AuthorizationError, HttpError
from ninja.security import SessionAuth, django_auth
from pydantic import field_validator

from .models import ASSIGNABLE_ROLES, ROLE_USER, User
from .services import request_login_code, verify_login_code


class UserOut(Schema):
    id: int
    email: str
    roles: list[str]


class RequestCodeIn(Schema):
    email: str

    @field_validator("email")
    @classmethod
    def looks_like_email(cls, value: str) -> str:
        value = value.strip()
        local, _, domain = value.partition("@")
        if not local or not domain or " " in value:
            raise ValueError("Invalid email")
        return value


class VerifyIn(Schema):
    email: str
    code: str


class RolesIn(Schema):
    roles: list[str]

    @field_validator("roles")
    @classmethod
    def only_assignable_roles(cls, roles: list[str]) -> list[str]:
        # One generic message for every invalid value (unknown role, `admin`, ...)
        # so the error does not reveal which roles exist.
        if any(role != ROLE_USER and role not in ASSIGNABLE_ROLES for role in roles):
            raise ValueError(f"roles must be a subset of {list(ASSIGNABLE_ROLES)}")
        return roles


class MessageOut(Schema):
    detail: str


def user_out(user: User) -> dict:
    return {"id": user.id, "email": user.email, "roles": user.roles}


class AdminSessionAuth(SessionAuth):
    """Session auth that also requires the admin role.

    Runs before the request body is parsed, so a non-admin always gets the same
    `403` regardless of the body and cannot probe validation errors.
    """

    def authenticate(self, request, key):
        user = super().authenticate(request, key)
        if user is not None and not user.is_admin:
            raise AuthorizationError(message="Admin role required")
        return user


auth_router = Router(tags=["auth"])


@auth_router.get("/csrf", response=MessageOut)
def csrf(request):
    """Sets the `csrftoken` cookie the UI echoes back in `X-CSRFToken`."""
    get_token(request)
    return {"detail": "ok"}


@auth_router.post("/request-code", response=MessageOut)
def request_code(request, payload: RequestCodeIn):
    request_login_code(payload.email)
    return {"detail": "If the email is registered, a login code has been issued."}


@auth_router.post("/verify", response=UserOut)
def verify(request, payload: VerifyIn):
    user = verify_login_code(payload.email, payload.code)
    if user is None:
        raise HttpError(401, "Invalid or expired code")
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    return user_out(user)


@auth_router.post("/logout", response=MessageOut)
def logout_view(request):
    logout(request)
    return {"detail": "Logged out"}


me_router = Router(tags=["me"], auth=django_auth)


@me_router.get("", response=UserOut)
def me(request):
    return user_out(request.user)


admin_router = Router(tags=["admin"], auth=AdminSessionAuth())


@admin_router.get("/users", response=list[UserOut])
def list_users(request):
    return [user_out(user) for user in User.objects.order_by("id")]


@admin_router.put("/users/{user_id}/roles", response=UserOut)
def set_user_roles(request, user_id: int, payload: RolesIn):
    user = User.objects.filter(id=user_id).first()
    if user is None:
        raise HttpError(404, "User not found")
    user.set_extra_roles(set(payload.roles))
    user.save(update_fields=["is_creator", "is_juror"])
    return user_out(user)
