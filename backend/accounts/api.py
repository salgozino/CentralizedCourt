import ipaddress

from django.conf import settings
from django.contrib.auth import login, logout
from django.middleware.csrf import get_token
from ninja import Router, Schema, Status
from ninja.security import django_auth

from . import services


def client_ip(request) -> str:
    remote = request.META["REMOTE_ADDR"]
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if remote not in settings.TRUSTED_PROXY_IPS or not forwarded:
        return remote
    # The trusted proxy appends the real client address, so earlier entries are client-controlled.
    last = forwarded.split(",")[-1].strip()
    try:
        return str(ipaddress.ip_address(last))
    except ValueError:
        return remote

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
    services.issue_login_code(payload.email, client_ip(request), request.session)
    return {"detail": "If the email exists, a code was sent."}


@router.post("/auth/verify", response={200: UserOut, 401: DetailOut})
def verify(request, payload: VerifyIn):
    user = services.verify_login_code(payload.email, payload.code, client_ip(request), request.session)
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
