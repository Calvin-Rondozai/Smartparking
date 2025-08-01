from django.urls import path
from . import views

urlpatterns = [
    # Device management
    path('devices/register/', views.register_device, name='register_device'),
    path('devices/', views.get_devices, name='get_devices'),
    path('devices/<str:device_id>/data/', views.get_device_data, name='get_device_data'),
    
    # Sensor data
    path('sensor/data/', views.sensor_data, name='sensor_data'),
    path('parking/availability/', views.get_parking_availability, name='get_parking_availability'),
    
    # Device health
    path('devices/heartbeat/', views.device_heartbeat, name='device_heartbeat'),
    
    # Testing
    path('test/occupancy/', views.test_occupancy, name='test_occupancy'),
    
    # ESP32 Control
    path('control/booking/', views.control_esp32_booking, name='control_esp32_booking'),
] 