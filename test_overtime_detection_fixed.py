#!/usr/bin/env python
import os
import django
import requests
import json

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking_backend.settings')
django.setup()

from parking_app.models import ParkingLot, ParkingSpot, Booking
from iot_integration.models import IoTDevice, SensorData
from django.utils import timezone
from datetime import timedelta

def test_overtime_detection():
    print("=== TESTING OVERTIME DETECTION WITH HOME PAGE LOGIC ===")
    
    try:
        # Get IoT Smart Parking lot
        lot = ParkingLot.objects.get(name='IoT Smart Parking')
        print(f"✅ Found parking lot: {lot.name}")
        
        # Get all spots
        spots = ParkingSpot.objects.filter(parking_lot=lot)
        print(f"📱 Total spots: {spots.count()}")
        
        print("\n=== SLOT STATUS (Home Page Logic) ===")
        for spot in spots:
            print(f"  {spot.spot_number}: {'🔴 Occupied' if spot.is_occupied else '🟢 Available'}")
        
        # Get IoT devices and sensor data (same as home page)
        devices = IoTDevice.objects.filter(is_active=True).order_by('id')
        print(f"\n=== IOT DEVICES ({devices.count()}) ===")
        
        for i, device in enumerate(devices):
            latest_data = SensorData.objects.filter(device=device).order_by('-timestamp').first()
            if latest_data:
                time_diff = timezone.now() - latest_data.timestamp
                print(f"  Device {i} ({device.device_id}):")
                print(f"    - General occupied: {latest_data.is_occupied}")
                print(f"    - Slot1 occupied: {getattr(latest_data, 'slot1_occupied', 'N/A')}")
                print(f"    - Slot2 occupied: {getattr(latest_data, 'slot2_occupied', 'N/A')}")
                print(f"    - Last seen: {time_diff.total_seconds():.0f}s ago")
                
                # Test the new overtime detection logic
                slot_mapping = {"Slot A": 0, "Slot B": 1}
                slot_name = f"Slot {'A' if i == 0 else 'B'}"
                device_index = slot_mapping.get(slot_name)
                
                if device_index == i:
                    # Use dual sensor data if available (same as home page logic)
                    if hasattr(latest_data, 'slot1_occupied') and latest_data.slot1_occupied is not None:
                        if device_index == 0:  # Slot A
                            is_occupied = latest_data.slot1_occupied
                        elif device_index == 1:  # Slot B
                            is_occupied = latest_data.slot2_occupied if hasattr(latest_data, 'slot2_occupied') else latest_data.is_occupied
                        else:
                            is_occupied = latest_data.is_occupied
                    else:
                        is_occupied = latest_data.is_occupied
                    
                    print(f"    - Overtime Detection Result: {'🔴 Occupied' if is_occupied else '🟢 Available'}")
            else:
                print(f"  Device {i} ({device.device_id}): No sensor data")
        
        # Test the check_if_car_still_parked function
        print(f"\n=== TESTING check_if_car_still_parked FUNCTION ===")
        for spot in spots:
            try:
                from parking_app.views import check_if_car_still_parked
                is_still_parked = check_if_car_still_parked(spot)
                print(f"  {spot.spot_number}: {'🔴 Still Parked' if is_still_parked else '🟢 Available'}")
            except Exception as e:
                print(f"  {spot.spot_number}: Error - {e}")
        
        # Test LED status API
        print(f"\n=== TESTING LED STATUS API ===")
        for spot in spots:
            try:
                response = requests.get(f"http://localhost:8000/api/parking-spots/{spot.spot_number}/led-status/")
                if response.status_code == 200:
                    data = response.json()
                    print(f"  {spot.spot_number}: {data['led_color'].upper()} - {data['led_message']}")
                    if data['sensor_data']:
                        print(f"    Sensor: {'Occupied' if data['sensor_data']['is_occupied'] else 'Available'} ({data['sensor_data']['last_seen_seconds_ago']}s ago)")
                else:
                    print(f"  {spot.spot_number}: API Error - {response.status_code}")
            except Exception as e:
                print(f"  {spot.spot_number}: API Error - {e}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_overtime_detection()


