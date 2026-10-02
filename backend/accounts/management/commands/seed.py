from django.core.management.base import BaseCommand

from accounts.models import User

SEED_USERS = [
    ("admin@example.com", {"is_admin": True}),
    ("creator1@example.com", {"is_creator": True}),
    ("creator2@example.com", {"is_creator": True}),
    ("juror1@example.com", {"is_juror": True}),
    ("juror2@example.com", {"is_juror": True}),
    ("juror3@example.com", {"is_juror": True}),
    ("juror4@example.com", {"is_juror": True}),
    ("juror5@example.com", {"is_juror": True}),
    ("user@example.com", {}),
]


class Command(BaseCommand):
    help = "Create the seeded users. Idempotent: existing users are left untouched."

    def handle(self, *args, **options):
        for email, roles in SEED_USERS:
            if User.objects.filter(email=email).exists():
                self.stdout.write(f"exists  {email}")
                continue
            User.objects.create_user(email=email, **roles)
            self.stdout.write(f"created {email}")
