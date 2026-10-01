from django.contrib.auth import login, logout
from django.middleware.csrf import get_token
from ninja import Router, Schema, Status
from ninja.security import django_auth

from . import services

router = Router()


class UserOut(Schema):
    id: int
    email: str
    roles: list[str]


class RequestCodeIn(Schema):
    email: str


class VerifyIn(Schema):
    email: str
    code: str


class DetailOut(Schema):
    detail: str


@router.post("/auth/request-code", response=DetailOut)
def request_code(request, payload: RequestCodeIn):
    services.issue_login_code(payload.email)
    return {"detail": "If the email exists, a code was sent."}


@router.post("/auth/verify", response={200: UserOut, 401: DetailOut})
def verify(request, payload: VerifyIn):
    user = services.verify_login_code(payload.email, payload.code)
    if user is None:
        return Status(401, {"detail": "Invalid or expired code"})
    login(request, user)
    get_token(request)
    return Status(200, user)


@router.post("/auth/logout", response=DetailOut)
def logout_view(request):
    logout(request)
    return {"detail": "Logged out"}


@router.get("/me", response=UserOut, auth=django_auth)
def me(request):
    get_token(request)
    return request.user
