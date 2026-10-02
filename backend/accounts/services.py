import secrets
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import LoginCode, LoginThrottleEvent, User

CODE_TTL = timedelta(minutes=10)
MAX_FAILED_ATTEMPTS = 5
# Per-client (IP) limits, so requesting new codes does not give unlimited guesses.
# They are deliberately not per account: an attacker only throttles themselves and
# can never lock another user out.
THROTTLE_WINDOW = timedelta(minutes=15)
MAX_FAILED_VERIFIES_PER_IP = 10
MAX_CODE_REQUESTS_PER_IP = 20


def normalize_email(email: str) -> str:
    return email.strip().lower()


def find_active_user(email: str) -> User | None:
    return User.objects.filter(email=normalize_email(email), is_active=True).first()


def _is_throttled(ip: str, kind: str, limit: int, now) -> bool:
    recent = LoginThrottleEvent.objects.filter(
        ip=ip, kind=kind, created_at__gt=now - THROTTLE_WINDOW
    )
    return recent.count() >= limit


def _record(ip: str, kind: str, now) -> None:
    LoginThrottleEvent.objects.filter(created_at__lte=now - THROTTLE_WINDOW).delete()
    LoginThrottleEvent.objects.create(ip=ip, kind=kind, created_at=now)


def request_login_code(email: str, ip: str) -> None:
    """Issue a code for an existing user and print it to the console.

    Unknown emails and throttled clients are silently ignored so the caller cannot
    tell either case apart. Issuing a new code invalidates the user's previous
    unused codes.
    """
    now = timezone.now()
    if _is_throttled(ip, LoginThrottleEvent.CODE_REQUEST, MAX_CODE_REQUESTS_PER_IP, now):
        print(f"LOGIN THROTTLED {ip} (too many code requests)", flush=True)
        return
    _record(ip, LoginThrottleEvent.CODE_REQUEST, now)
    user = find_active_user(email)
    if user is None:
        return
    code = f"{secrets.randbelow(1_000_000):06d}"
    with transaction.atomic():
        LoginCode.objects.filter(user=user, used_at__isnull=True).update(used_at=now)
        LoginCode.objects.create(
            user=user, code=code, created_at=now, expires_at=now + CODE_TTL
        )
    print(f"LOGIN CODE {user.email} {code}", flush=True)


def verify_login_code(email: str, code: str, ip: str) -> User | None:
    """Return the user if `code` is the current valid code for `email`, else None.

    A matching code is consumed. Too many wrong guesses invalidate the code. A client
    with too many failed verifies is refused without checking (or burning) any code.
    """
    now = timezone.now()
    if _is_throttled(ip, LoginThrottleEvent.FAILED_VERIFY, MAX_FAILED_VERIFIES_PER_IP, now):
        print(f"LOGIN THROTTLED {ip} (too many failed attempts)", flush=True)
        return None
    user = _check_code(email, code, now)
    if user is None:
        _record(ip, LoginThrottleEvent.FAILED_VERIFY, now)
    return user


def _check_code(email: str, code: str, now) -> User | None:
    user = find_active_user(email)
    if user is None:
        return None
    with transaction.atomic():
        login_code = (
            LoginCode.objects.select_for_update()
            .filter(user=user, used_at__isnull=True, expires_at__gt=now)
            .order_by("-created_at")
            .first()
        )
        if login_code is None:
            return None
        if not secrets.compare_digest(login_code.code, code.strip()):
            login_code.failed_attempts += 1
            if login_code.failed_attempts >= MAX_FAILED_ATTEMPTS:
                login_code.used_at = now
            login_code.save(update_fields=["failed_attempts", "used_at"])
            return None
        login_code.used_at = now
        login_code.save(update_fields=["used_at"])
    return user
