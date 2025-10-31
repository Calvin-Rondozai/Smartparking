from rest_framework import serializers
from .models import IoTDevice, SensorData, DeviceLog
from parking_app.serializers import ParkingSpotSerializer, ParkingLotSerializer

class IoTDeviceSerializer(serializers.ModelSerializer):
    parking_lot = ParkingLotSerializer(read_only=True)
    parking_spot = ParkingSpotSerializer(read_only=True)
    
    class Meta:
        model = IoTDevice
        fields = '__all__'

class SensorDataSerializer(serializers.ModelSerializer):
    device = IoTDeviceSerializer(read_only=True)
    parking_spot = ParkingSpotSerializer(read_only=True)
    
    class Meta:
        model = SensorData
        fields = '__all__'

class DeviceLogSerializer(serializers.ModelSerializer):
    device = IoTDeviceSerializer(read_only=True)
    
    class Meta:
        model = DeviceLog
        fields = '__all__'

class IoTDeviceCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = IoTDevice
        fields = ['device_id', 'device_type', 'name', 'parking_lot', 'parking_spot', 'location', 'ip_address', 'mac_address']

class SensorDataCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SensorData
        fields = ['device', 'parking_spot', 'is_occupied', 'distance_cm', 'battery_level', 'signal_strength', 'temperature', 'humidity', 'slot1_occupied', 'slot2_occupied', 'ir_alert']
        # Dual sensor fields are optional 