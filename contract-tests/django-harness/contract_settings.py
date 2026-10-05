# Settings overlay used only by the contract harness (selected through DJANGO_SETTINGS_MODULE).
# The project settings leave ALLOWED_HOSTS empty, which Django only tolerates with DEBUG on, and
# DEBUG changes API behaviour (ninja appends parser details to the malformed-JSON message).
from config.settings import *  # noqa: F401,F403

ALLOWED_HOSTS = ["127.0.0.1", "localhost"]
