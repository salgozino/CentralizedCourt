import hashlib
import hmac
import logging
import secrets

from django.contrib.auth import get_user_model
from django.db.models import F
from django.utils import timezone

from .models import CODE_TTL, LOGIN_THROTTLE_WINDOW, LoginCode, LoginEvent

logger = logging.getLogger(__name__)

SESSION_KEY = "login_code_ids"
MAX_CODES_PER_SESSION = 5
MAX_ATTEMPTS_PER_CODE = 5
MAX_CODE_REQUESTS_PER_IP = 10
MAX_FAILED_VERIFICATIONS_PER_IP = 20


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _find_user(email: str):
    return get_user_model().objects.filter(email__iexact=email.strip()).first()


def _ip_over_cap(ip: str, kind: str, cap: int) -> bool:
    since = timezone.now() - LOGIN_THROTTLE_WINDOW
    return LoginEvent.objects.filter(ip=ip, kind=kind, created_at__gt=since).count() >= cap


def _session_codes(session, email: str, now):
    """Usable codes held by this browser session for this email."""
    return LoginCode.objects.filter(
        pk__in=session.get(SESSION_KEY, []),
        user__email__iexact=email.strip(),
        used_at__isnull=True,
        expires_at__gt=now,
        failed_attempts__lt=MAX_ATTEMPTS_PER_CODE,
    )


def issue_login_code(email: str, ip: str, session) -> None:
    if _ip_over_cap(ip, LoginEvent.REQUEST, MAX_CODE_REQUESTS_PER_IP):
        logger.warning("Login code not issued: IP %s over the request cap", ip)
        return
    # Count unknown emails too, so throttling does not reveal which emails exist.
    LoginEvent.objects.create(ip=ip, kind=LoginEvent.REQUEST)
    user = _find_user(email)
    if user is None:
        return
    now = timezone.now()
    # Only revoke codes held by this session; other sessions' codes are untouched.
    _session_codes(session, user.email, now).update(used_at=now)
    code = f"{secrets.randbelow(10**6):06d}"
    login_code = LoginCode.objects.create(user=user, code_hash=_hash_code(code), expires_at=now + CODE_TTL)
    session[SESSION_KEY] = [*session.get(SESSION_KEY, []), login_code.pk][-MAX_CODES_PER_SESSION:]
    print(f"LOGIN CODE {user.email} {code}", flush=True)


def verify_login_code(email: str, code: str, ip: str, session):
    if _ip_over_cap(ip, LoginEvent.FAILURE, MAX_FAILED_VERIFICATIONS_PER_IP):
        return None
    now = timezone.now()
    candidate = _hash_code(code.strip())
    codes = list(_session_codes(session, email, now))
    for login_code in codes:
        if hmac.compare_digest(login_code.code_hash, candidate):
            claimed = LoginCode.objects.filter(pk=login_code.pk, used_at__isnull=True).update(used_at=now)
            if claimed == 1:
                session[SESSION_KEY] = [pk for pk in session.get(SESSION_KEY, []) if pk != login_code.pk]
                return login_code.user
    LoginEvent.objects.create(ip=ip, kind=LoginEvent.FAILURE)
    LoginCode.objects.filter(pk__in=[c.pk for c in codes]).update(failed_attempts=F("failed_attempts") + 1)
    return None
