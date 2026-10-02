from django.contrib import admin
from django.urls import path
from ninja import NinjaAPI

from accounts.api import admin_router, auth_router, me_router

api = NinjaAPI(title="CentralizedCourt API")
api.add_router("/auth", auth_router)
api.add_router("/me", me_router)
api.add_router("/admin", admin_router)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", api.urls),
]
