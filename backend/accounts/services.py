import hashlib
import hmac
import logging
import secrets

from django.contrib.auth import get_user_model
from django.db.models import F, Sum
from django.utils import timezone

from .models import CODE_TTL, LOGIN_THROTTLE_WINDOW, MAX_CODES_PER_WINDOW, MAX_FAILED_VERIFICATIONS, LoginCode

logger = logging.getLogger(__name__)


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _find_user(email: str):
    return get_user_model().objects.filter(email__iexact=email.strip()).first()


def _recent_codes(user, now):
    return LoginCode.objects.filter(user=user, created_at__gt=now - LOGIN_THROTTLE_WINDOW)


def _is_locked(user, now) -> bool:
    failed = _recent_codes(user, now).aggregate(total=Sum("failed_attempts"))["total"] or 0
    return failed >= MAX_FAILED_VERIFICATIONS


def issue_login_code(email: str) -> None:
    user = _find_user(email)
    if user is None:
        return
    now = timezone.now()
    if _recent_codes(user, now).count() >= MAX_CODES_PER_WINDOW or _is_locked(user, now):
        logger.warning("Login code not issued for user %s: throttled", user.pk)
        return
    LoginCode.objects.filter(user=user, used_at__isnull=True).update(used_at=now)
    code = f"{secrets.randbelow(10**6):06d}"
    LoginCode.objects.create(
        user=user,
        code_hash=_hash_code(code),
        expires_at=now + CODE_TTL,
    )
    print(f"LOGIN CODE {user.email} {code}", flush=True)


def verify_login_code(email: str, code: str):
    user = _find_user(email)
    if user is None:
        return None
    now = timezone.now()
    if _is_locked(user, now):
        return None
    candidate = _hash_code(code.strip())
    pending = LoginCode.objects.filter(user=user, used_at__isnull=True, expires_at__gt=now)
    for login_code in pending:
        if hmac.compare_digest(login_code.code_hash, candidate):
            claimed = LoginCode.objects.filter(pk=login_code.pk, used_at__isnull=True).update(used_at=now)
            if claimed == 1:
                return user
    latest = _recent_codes(user, now).order_by("-created_at", "-pk").first()
    if latest is not None:
        LoginCode.objects.filter(pk=latest.pk).update(failed_attempts=F("failed_attempts") + 1)
    return None
