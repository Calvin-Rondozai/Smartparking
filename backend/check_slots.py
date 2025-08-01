#!/usr/bin/env python
import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking_backend.settings')
django.setup()

from parking_app.models import ParkingLot, ParkingSpot
from iot_integration.models import IoTDevice, SensorData

print("=== CHECKING PARKING SLOTS STATUS ===")

try:
    # Get IoT Smart Parking lot
    lot = ParkingLot.objects.get(name='IoT Smart Parking')
    print(f"✅ Found parking lot: {lot.name}")
    
    # Get all spots
    spots = ParkingSpot.objects.filter(parking_lot=lot)
    print(f"📱 Total spots: {spots.count()}")
    
    print("\n=== SLOT STATUS ===")
    for spot in spots:
        print(f"  {spot.spot_number}: {'🔴 Occupied' if spot.is_occupied else '🟢 Available'}")
    
    # Get IoT devices
    devices = IoTDevice.objects.filter(is_active=True)
    print(f"\n=== IOT DEVICES ({devices.count()}) ===")
    
    for device in devices:
        latest_data = SensorData.objects.filter(device=device).order_by('-timestamp').first()
        if latest_data:
            print(f"  {device.device_id}:")
            print(f"    - General occupied: {latest_data.is_occupied}")
            if hasattr(latest_data, 'slot1_occupied'):
                print(f"    - Slot 1 occupied: {latest_data.slot1_occupied}")
            if hasattr(latest_data, 'slot2_occupied'):
                print(f"    - Slot 2 occupied: {latest_data.slot2_occupied}")
            print(f"    - Timestamp: {latest_data.timestamp}")
        else:
            print(f"  {device.device_id}: No sensor data")
    
    # Calculate availability
    available_spots = spots.filter(is_occupied=False).count()
    occupied_spots = spots.filter(is_occupied=True).count()
    
    print(f"\n=== SUMMARY ===")
    print(f"  Total spots: {spots.count()}")
    print(f"  Available: {available_spots}")
    print(f"  Occupied: {occupied_spots}")
    print(f"  Occupancy rate: {(occupied_spots/spots.count())*100:.1f}%")
    
except ParkingLot.DoesNotExist:
    print("❌ IoT Smart Parking lot not found!")
except Exception as e:
    print(f"❌ Error: {e}") 