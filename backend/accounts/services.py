import hashlib
import hmac
import secrets

from django.contrib.auth import get_user_model
from django.utils import timezone

from .models import CODE_TTL, LoginCode


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _find_user(email: str):
    return get_user_model().objects.filter(email__iexact=email.strip()).first()


def issue_login_code(email: str) -> None:
    user = _find_user(email)
    if user is None:
        return
    code = f"{secrets.randbelow(10**6):06d}"
    LoginCode.objects.create(
        user=user,
        code_hash=_hash_code(code),
        expires_at=timezone.now() + CODE_TTL,
    )
    print(f"LOGIN CODE {user.email} {code}", flush=True)


def verify_login_code(email: str, code: str):
    user = _find_user(email)
    if user is None:
        return None
    now = timezone.now()
    candidate = _hash_code(code.strip())
    pending = LoginCode.objects.filter(user=user, used_at__isnull=True, expires_at__gt=now)
    for login_code in pending:
        if hmac.compare_digest(login_code.code_hash, candidate):
            claimed = LoginCode.objects.filter(pk=login_code.pk, used_at__isnull=True).update(used_at=now)
            if claimed == 1:
                return user
    return None
