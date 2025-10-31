from django.db import models
from django.utils import timezone
from parking_app.models import ParkingSpot, ParkingLot

class IoTDevice(models.Model):
    DEVICE_TYPES = [
        ('sensor', 'Parking Sensor'),
        ('gate', 'Entry/Exit Gate'),
        ('display', 'LED Display'),
        ('camera', 'Camera'),
    ]
    
    device_id = models.CharField(max_length=50, unique=True)
    device_type = models.CharField(max_length=20, choices=DEVICE_TYPES)
    name = models.CharField(max_length=100)
    parking_lot = models.ForeignKey(ParkingLot, on_delete=models.CASCADE, null=True, blank=True)
    parking_spot = models.ForeignKey(ParkingSpot, on_delete=models.CASCADE, null=True, blank=True)
    location = models.CharField(max_length=200, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    mac_address = models.CharField(max_length=17, blank=True)
    is_active = models.BooleanField(default=True)
    last_seen = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"{self.name} ({self.device_id})"

class SensorData(models.Model):
    device = models.ForeignKey(IoTDevice, on_delete=models.CASCADE)
    parking_spot = models.ForeignKey(ParkingSpot, on_delete=models.CASCADE, null=True, blank=True)
    is_occupied = models.BooleanField()
    distance_cm = models.FloatField(null=True, blank=True)
    battery_level = models.FloatField(null=True, blank=True)
    signal_strength = models.FloatField(null=True, blank=True)
    temperature = models.FloatField(null=True, blank=True)
    humidity = models.FloatField(null=True, blank=True)
    # Dual sensor fields
    slot1_occupied = models.BooleanField(null=True, blank=True)
    slot2_occupied = models.BooleanField(null=True, blank=True)
    ir_alert = models.BooleanField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-timestamp']
    
    def __str__(self):
        return f"{self.device.name} - {'Occupied' if self.is_occupied else 'Empty'} ({self.timestamp})"

class DeviceLog(models.Model):
    LOG_TYPES = [
        ('info', 'Information'),
        ('warning', 'Warning'),
        ('error', 'Error'),
        ('debug', 'Debug'),
    ]
    
    device = models.ForeignKey(IoTDevice, on_delete=models.CASCADE)
    log_type = models.CharField(max_length=10, choices=LOG_TYPES)
    message = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-timestamp']
    
    def __str__(self):
        return f"{self.device.name} - {self.log_type}: {self.message[:50]}" 