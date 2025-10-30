"""
URL configuration for smartparking_backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.contrib import admin
from django.urls import path, include
from chatbot import admin_auth  # direct wiring for critical admin auth endpoints

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("parking_app.urls")),
    path("api/iot/", include("iot_integration.urls")),
    path("api/chatbot/", include("chatbot.urls")),
    path("api/ai/", include("ai_analytics.urls")),
    # Hard-wire admin auth endpoints to ensure availability
    path("api/chatbot/admin-login/", admin_auth.admin_login, name="admin_login_direct"),
    path(
        "api/chatbot/auth/verify/", admin_auth.verify_token, name="verify_token_direct"
    ),
    # Additional aliases for robustness
    path("api/admin-login/", admin_auth.admin_login, name="admin_login_alias_root"),
    path(
        "api/chatbot/login-admin/",
        admin_auth.admin_login,
        name="admin_login_alias_variant",
    ),
]
