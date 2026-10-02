from django.contrib.auth import login, logout
from django.middleware.csrf import get_token
from ninja import Router, Schema
from ninja.errors import HttpError
from ninja.security import django_auth
from pydantic import field_validator

from .models import ASSIGNABLE_ROLES, ROLE_ADMIN, ROLE_USER, User
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
        for role in roles:
            if role == ROLE_ADMIN:
                raise ValueError("The admin role cannot be set or removed")
            if role != ROLE_USER and role not in ASSIGNABLE_ROLES:
                raise ValueError(f"Invalid role: {role}")
        return roles


class MessageOut(Schema):
    detail: str


def user_out(user: User) -> dict:
    return {"id": user.id, "email": user.email, "roles": user.roles}


def require_admin(request) -> None:
    if not request.user.is_admin:
        raise HttpError(403, "Admin role required")


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


admin_router = Router(tags=["admin"], auth=django_auth)


@admin_router.get("/users", response=list[UserOut])
def list_users(request):
    require_admin(request)
    return [user_out(user) for user in User.objects.order_by("id")]


@admin_router.put("/users/{user_id}/roles", response=UserOut)
def set_user_roles(request, user_id: int, payload: RolesIn):
    require_admin(request)
    user = User.objects.filter(id=user_id).first()
    if user is None:
        raise HttpError(404, "User not found")
    user.set_extra_roles(set(payload.roles))
    user.save(update_fields=["is_creator", "is_juror"])
    return user_out(user)
