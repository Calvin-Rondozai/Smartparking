import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking_backend.settings')
django.setup()

from parking_app.models import ParkingLot, ParkingSpot
from iot_integration.models import IoTDevice

# Link device to parking spots
device = IoTDevice.objects.get(device_id="ESP32_DUAL_SENSOR_001")
lot = ParkingLot.objects.get(name="IoT Smart Parking")

slot_a = ParkingSpot.objects.get(parking_lot=lot, spot_number="Slot A")
slot_b = ParkingSpot.objects.get(parking_lot=lot, spot_number="Slot B")

# Link device to both slots (it's a dual sensor)
device.parking_spot = slot_a
device.save()

print(f"✅ Linked {device.device_id} to {slot_a.spot_number}")

# Set initial occupancy to test
slot_a.is_occupied = True
slot_a.save()
slot_b.is_occupied = False
slot_b.save()

print(f"✅ Set {slot_a.spot_number} to OCCUPIED")
print(f"✅ Set {slot_b.spot_number} to AVAILABLE") 