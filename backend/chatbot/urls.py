from django.urls import path
from . import views
from . import admin_dashboard_views
from . import admin_auth
from .admin_api import (
    admin_users,
    admin_bookings,
    admin_parking_spots,
    admin_users_create,
    admin_users_update,
    admin_users_delete,
    admin_users_toggle_status,
    admin_users_reset_password,
    admin_bookings_delete,
    admin_user_reports,
    admin_unbooked_occupied_alerts,
    admin_user_report_resolve,
)

urlpatterns = [
    path("current-booking/", views.current_booking, name="chatbot_current_booking"),
    path("booking-history/", views.booking_history, name="chatbot_booking_history"),
    path("available-slots/", views.available_slots, name="chatbot_available_slots"),
    path("reserve/", views.reserve_slot, name="chatbot_reserve_slot"),
    path("help/", views.help_info, name="chatbot_help_info"),
    # Twilio WhatsApp webhook endpoint
    path(
        "twilio/webhook/", views.twilio_whatsapp_webhook, name="chatbot_twilio_webhook"
    ),
    # Admin dashboard
    path(
        "admin-dashboard/",
        admin_dashboard_views.admin_dashboard,
        name="admin_dashboard",
    ),
    path(
        "admin-dashboard/<str:filename>",
        admin_dashboard_views.admin_dashboard,
        name="admin_dashboard_file",
    ),
    # Admin authentication
    path("admin-login/", admin_auth.admin_login, name="admin_login"),
    path("auth/verify/", admin_auth.verify_token, name="verify_token"),
    # Admin API endpoints
    path("admin/users/", admin_users, name="admin_users"),
    path("admin/users/create/", admin_users_create, name="admin_users_create"),
    path(
        "admin/users/<int:user_id>/update/",
        admin_users_update,
        name="admin_users_update",
    ),
    path(
        "admin/users/<int:user_id>/delete/",
        admin_users_delete,
        name="admin_users_delete",
    ),
    path(
        "admin/users/<int:user_id>/toggle-status/",
        admin_users_toggle_status,
        name="admin_users_toggle_status",
    ),
    path(
        "admin/users/<int:user_id>/reset-password/",
        admin_users_reset_password,
        name="admin_users_reset_password",
    ),
    path("admin/bookings/", admin_bookings, name="admin_bookings"),
    path(
        "admin/bookings/<int:booking_id>/delete/",
        admin_bookings_delete,
        name="admin_bookings_delete",
    ),
    path("admin/spots/", admin_parking_spots, name="admin_spots"),
    path("admin/user-reports/", admin_user_reports, name="admin_user_reports"),
    path(
        "admin/user-reports/<int:report_id>/resolve/",
        admin_user_report_resolve,
        name="admin_user_report_resolve",
    ),
    path(
        "admin/alerts/unbooked-occupied/",
        admin_unbooked_occupied_alerts,
        name="admin_unbooked_occupied_alerts",
    ),
]
