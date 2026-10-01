from django.contrib import admin
from django.urls import path
from ninja import NinjaAPI
from ninja.errors import HttpError

from accounts.admin_api import router as admin_router
from accounts.api import router as accounts_router

api = NinjaAPI(title="CentralizedCourt API")
api.add_router("", accounts_router)
api.add_router("/admin", admin_router)


@api.exception_handler(HttpError)
def on_http_error(request, exc):
    # Malformed JSON is reported by ninja as 400; the contract wants 422 for any invalid body.
    status = 422 if str(exc) == "Cannot parse request body" else exc.status_code
    return api.create_response(request, {"detail": str(exc)}, status=status)


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", api.urls),
]
