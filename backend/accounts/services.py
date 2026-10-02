import secrets
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import LoginCode, User

CODE_TTL = timedelta(minutes=10)
MAX_FAILED_ATTEMPTS = 5


def normalize_email(email: str) -> str:
    return email.strip().lower()


def find_active_user(email: str) -> User | None:
    return User.objects.filter(email=normalize_email(email), is_active=True).first()


def request_login_code(email: str) -> None:
    """Issue a code for an existing user and print it to the console.

    Unknown emails are silently ignored so the caller cannot tell whether the
    email exists. Issuing a new code invalidates the user's previous unused codes.
    """
    user = find_active_user(email)
    if user is None:
        return
    now = timezone.now()
    code = f"{secrets.randbelow(1_000_000):06d}"
    with transaction.atomic():
        LoginCode.objects.filter(user=user, used_at__isnull=True).update(used_at=now)
        LoginCode.objects.create(
            user=user, code=code, created_at=now, expires_at=now + CODE_TTL
        )
    print(f"LOGIN CODE {user.email} {code}", flush=True)


def verify_login_code(email: str, code: str) -> User | None:
    """Return the user if `code` is the current valid code for `email`, else None.

    A matching code is consumed. Too many wrong guesses invalidate the code.
    """
    user = find_active_user(email)
    if user is None:
        return None
    now = timezone.now()
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
