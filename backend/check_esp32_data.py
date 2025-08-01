#!/usr/bin/env python
import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking_backend.settings')
django.setup()

from iot_integration.models import IoTDevice, SensorData
from parking_app.models import ParkingLot, ParkingSpot

def check_esp32_data():
    print("=== Checking ESP32 Data ===")
    
    # Get all IoT devices
    devices = IoTDevice.objects.filter(is_active=True)
    print(f"Found {devices.count()} active devices:")
    
    for device in devices:
        print(f"\n--- Device: {device.device_id} ---")
        print(f"Name: {device.name}")
        print(f"Type: {device.device_type}")
        print(f"Last seen: {device.last_seen}")
        
        # Get latest sensor data
        latest_data = SensorData.objects.filter(device=device).order_by('-timestamp').first()
        if latest_data:
            print(f"Latest sensor data ({latest_data.timestamp}):")
            print(f"  - is_occupied: {latest_data.is_occupied}")
            print(f"  - distance_cm: {latest_data.distance_cm}")
            print(f"  - slot1_occupied: {getattr(latest_data, 'slot1_occupied', 'N/A')}")
            print(f"  - slot2_occupied: {getattr(latest_data, 'slot2_occupied', 'N/A')}")
            print(f"  - ir_alert: {getattr(latest_data, 'ir_alert', 'N/A')}")
            
            # Get last 5 sensor readings
            recent_data = SensorData.objects.filter(device=device).order_by('-timestamp')[:5]
            print(f"\nLast 5 sensor readings:")
            for i, data in enumerate(recent_data):
                print(f"  {i+1}. {data.timestamp}: slot1={getattr(data, 'slot1_occupied', 'N/A')}, slot2={getattr(data, 'slot2_occupied', 'N/A')}, distance={data.distance_cm}")
        else:
            print("No sensor data found")
    
    # Check parking spots
    print(f"\n--- Parking Spots Status ---")
    try:
        lot = ParkingLot.objects.get(name="IoT Smart Parking")
        spots = ParkingSpot.objects.filter(parking_lot=lot)
        for spot in spots:
            print(f"{spot.spot_number}: {'Occupied' if spot.is_occupied else 'Available'}")
    except ParkingLot.DoesNotExist:
        print("IoT Smart Parking lot not found")

if __name__ == "__main__":
    check_esp32_data() 