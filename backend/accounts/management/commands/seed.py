from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import User


class Command(BaseCommand):
    help = "Create the nine local demo users without changing existing roles"

    @transaction.atomic
    def handle(self, *args, **options):
        entries = [("admin", "admin"), ("creator1", "creator"), ("creator2", "creator")]
        entries += [(f"juror{i}", "juror") for i in range(1, 6)]
        entries += [("user", None)]
        for name, role in entries:
            email = f"{name}@example.com"
            if not User.objects.filter(email=email).exists():
                User.objects.create_user(email, **({f"is_{role}": True} if role else {}))
        self.stdout.write(self.style.SUCCESS("Seed ready: 9 demo accounts (existing roles preserved)."))
