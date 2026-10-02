from django.contrib import admin

from .models import LoginCode, User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("id", "email", "is_admin", "is_creator", "is_juror", "is_active")
    search_fields = ("email",)


@admin.register(LoginCode)
class LoginCodeAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "created_at", "expires_at", "used_at")
