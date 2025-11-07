from django.urls import path
from . import views

urlpatterns = [
    # Device management
    path("devices/register/", views.register_device, name="register_device"),
    path("devices/", views.get_devices, name="get_devices"),
    path("devices/details/", views.get_device_details, name="get_device_details"),
    path(
        "devices/<str:device_id>/data/", views.get_device_data, name="get_device_data"
    ),
    # Sensor data
    path("sensor/data/", views.sensor_data, name="sensor_data"),
    path(
        "sensors/real-time/",
        views.get_real_time_sensor_data,
        name="get_real_time_sensor_data",
    ),
    path(
        "parking/availability/",
        views.get_parking_availability,
        name="get_parking_availability",
    ),
    path(
        "parking/statistics/",
        views.get_parking_statistics,
        name="get_parking_statistics",
    ),
    path("system/status/", views.get_system_status, name="get_system_status"),
    # Device health
    path("devices/heartbeat/", views.device_heartbeat, name="device_heartbeat"),
    # Testing
    path("test/occupancy/", views.test_occupancy, name="test_occupancy"),
    # ESP32 Control
    path("control/booking/", views.control_esp32_booking, name="control_esp32_booking"),
    # Active bookings for ESP32 LED control
    path("bookings/active/", views.active_bookings, name="active_bookings"),
    # Grace period check endpoint (for polling/calling to check expired grace periods)
    path("grace-period/check/", views.check_grace_periods, name="check_grace_periods"),
    # Device health and system status
    path("health/", views.get_device_health, name="get_device_health"),
    # System alerts
    path("alerts/", views.get_alerts, name="get_alerts"),
]
