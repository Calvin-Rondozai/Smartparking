from django.urls import path
from . import views

urlpatterns = [
    # Authentication endpoints
    path("auth/signup/", views.signup, name="signup"),
    path("auth/signin/", views.signin, name="signin"),
    path("auth/signout/", views.signout, name="signout"),
    path("auth/verify/", views.verify_auth, name="verify_auth"),
    path("auth/profile/", views.get_user_profile, name="get_profile"),
    path("auth/profile/update/", views.update_user_profile, name="update_profile"),
    path("auth/change-password/", views.change_password, name="change_password"),
    path("auth/reset-password/", views.reset_password, name="reset_password"),
    path("auth/forgot-password/", views.forgot_password, name="forgot_password"),
    # Parking lot endpoints
    path("parking-lots/", views.ParkingLotList.as_view(), name="parking_lot_list"),
    path(
        "parking-lots/<int:pk>/",
        views.ParkingLotDetail.as_view(),
        name="parking_lot_detail",
    ),
    # Parking spot endpoints
    path("parking-spots/", views.ParkingSpotList.as_view(), name="parking_spot_list"),
    path(
        "parking-spots/<int:pk>/",
        views.ParkingSpotDetail.as_view(),
        name="parking_spot_detail",
    ),
    # Booking endpoints
    path("bookings/", views.BookingList.as_view(), name="booking_list"),
    path("bookings/<int:pk>/", views.BookingDetail.as_view(), name="booking_detail"),
    path(
        "bookings/<int:booking_id>/extend/", views.extend_booking, name="extend_booking"
    ),
    path(
        "bookings/<int:booking_id>/cancel/", views.cancel_booking, name="cancel_booking"
    ),
    path(
        "bookings/<int:booking_id>/overtime/",
        views.get_booking_overtime,
        name="get_booking_overtime",
    ),
    path(
        "bookings/<int:booking_id>/overtime/check/",
        views.check_and_bill_overtime,
        name="check_and_bill_overtime",
    ),
    path(
        "bookings/<int:booking_id>/overtime/complete/",
        views.complete_overtime_booking,
        name="complete_overtime_booking",
    ),
    path(
        "bookings/<int:booking_id>/test-cost/",
        views.test_update_booking_cost,
        name="test_update_booking_cost",
    ),
    path(
        "bookings/<int:booking_id>/detect-car/",
        views.detect_car_parked,
        name="detect_car_parked",
    ),
    path(
        "bookings/overtime/active/",
        views.get_active_overtime_bookings,
        name="get_active_overtime_bookings",
    ),
    path(
        "bookings/overtime/check-all/",
        views.check_all_overtime_bookings,
        name="check_all_overtime_bookings",
    ),
    path(
        "bookings/<int:booking_id>/complete/",
        views.complete_active_booking,
        name="complete_active_booking",
    ),
    # Wallet endpoints
    path("wallet/", views.get_wallet, name="get_wallet"),
    path("wallet/top-up/", views.wallet_top_up, name="wallet_top_up"),
    path("wallet/charge/", views.wallet_charge, name="wallet_charge"),
    # LED/RGB status endpoints
    path(
        "parking-spots/<str:spot_number>/led-status/",
        views.get_parking_spot_led_status,
        name="get_parking_spot_led_status",
    ),
    # Admin endpoints
    path("admin/bookings/", views.get_all_bookings_admin, name="admin_bookings"),
    path("admin/users/", views.get_all_users_admin, name="admin_users"),
    path(
        "admin/users/negative-balance/",
        views.get_negative_balance_users_admin,
        name="admin_users_negative_balance",
    ),
    path("admin/users/create/", views.create_user_admin, name="create_user_admin"),
    path(
        "admin/users/<int:user_id>/update/",
        views.update_user_admin,
        name="update_user_admin",
    ),
    path(
        "admin/users/<int:user_id>/delete/",
        views.delete_user_admin,
        name="delete_user_admin",
    ),
    path(
        "admin/users/<int:user_id>/toggle-status/",
        views.toggle_user_status_admin,
        name="toggle_user_status_admin",
    ),
    path(
        "admin/users/<int:user_id>/reset-password/",
        views.reset_user_password_admin,
        name="reset_user_password_admin",
    ),
    # Dashboard endpoints
    path("dashboard_reports/", views.dashboard_reports, name="dashboard_reports"),
    path("user_statistics/", views.user_statistics, name="user_statistics"),
    # Statistics endpoint
    path("stats/", views.get_parking_stats, name="parking_stats"),
    # Admin reports endpoints
    path("admin/reports/", views.submit_user_report, name="submit_user_report"),
    path("admin/reports/list/", views.get_admin_reports, name="get_admin_reports"),
]
