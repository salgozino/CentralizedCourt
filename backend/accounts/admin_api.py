from typing import Literal

from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from ninja import Router, Schema
from ninja.errors import HttpError
from ninja.security import SessionAuth

from .api import UserOut


class AdminSessionAuth(SessionAuth):
    """Session auth that also requires the admin flag.

    Runs before body validation, so non-admins get 403 even with an invalid body.
    """

    def __call__(self, request):
        # SessionAuth runs the CSRF check first; anonymous requests must get 401, not 403.
        if not request.user.is_authenticated:
            return None
        return super().__call__(request)

    def authenticate(self, request, key):
        user = super().authenticate(request, key)
        if user is None:
            return None
        if not user.is_admin:
            raise HttpError(403, "Admin role required")
        return user


router = Router(auth=AdminSessionAuth())


class RolesIn(Schema):
    roles: list[Literal["creator", "juror"]]


@router.get("/users", response=list[UserOut])
def list_users(request):
    return get_user_model().objects.order_by("id")


@router.put("/users/{user_id}/roles", response=UserOut)
def set_roles(request, user_id: int, payload: RolesIn):
    user = get_object_or_404(get_user_model(), id=user_id)
    user.set_extra_roles(payload.roles)
    user.save(update_fields=["is_creator", "is_juror"])
    return user
