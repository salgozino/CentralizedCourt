from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

# email -> extra roles (the base "user" role is implicit)
SEED_USERS = {
    "admin@example.com": ["admin"],
    "creator1@example.com": ["creator"],
    "creator2@example.com": ["creator"],
    "juror1@example.com": ["juror"],
    "juror2@example.com": ["juror"],
    "juror3@example.com": ["juror"],
    "juror4@example.com": ["juror"],
    "juror5@example.com": ["juror"],
    "user@example.com": [],
}


class Command(BaseCommand):
    help = "Create the demo users. Idempotent: existing users are left untouched."

    def handle(self, *args, **options):
        User = get_user_model()
        created = 0
        for email, extra in SEED_USERS.items():
            user, was_created = User.objects.get_or_create(email=email)
            if not was_created:
                continue
            user.is_admin = "admin" in extra
            user.set_extra_roles([r for r in extra if r != "admin"])
            user.set_unusable_password()
            user.save()
            created += 1
        self.stdout.write(
            f"Seed done: {created} created, {len(SEED_USERS) - created} already existed."
        )
