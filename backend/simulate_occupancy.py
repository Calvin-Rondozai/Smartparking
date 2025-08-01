#!/usr/bin/env python
import os
import django
import requests
import json

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking_backend.settings')
django.setup()

from iot_integration.models import IoTDevice, SensorData

print("=== SIMULATING SENSOR OCCUPANCY ===")

def simulate_sensor_data(device_id, is_occupied, slot1_occupied=None, slot2_occupied=None):
    """Simulate sensor data for testing"""
    url = "http://localhost:8000/api/iot/sensor/data/"
    
    data = {
        "device_id": device_id,
        "is_occupied": is_occupied,
        "distance": 15 if is_occupied else 200,
        "temperature": 25.5,
        "humidity": 60.0
    }
    
    if slot1_occupied is not None:
        data["slot1_occupied"] = slot1_occupied
    if slot2_occupied is not None:
        data["slot2_occupied"] = slot2_occupied
    
    try:
        response = requests.post(url, json=data)
        print(f"📡 Sent data for {device_id}: Occupied={is_occupied}")
        print(f"   Response: {response.status_code}")
        if response.status_code == 201:
            print(f"   ✅ Success: {response.json()}")
        else:
            print(f"   ❌ Error: {response.text}")
    except Exception as e:
        print(f"   ❌ Request failed: {e}")

def check_availability():
    """Check current parking availability"""
    url = "http://localhost:8000/api/iot/parking/availability/"
    try:
        response = requests.get(url)
        if response.status_code == 200:
            data = response.json()
            print(f"\n📊 CURRENT AVAILABILITY:")
            print(f"   Total spots: {data['total_spots']}")
            print(f"   Available: {data['available_spots']}")
            print(f"   Occupied: {data['occupied_spots']}")
            print(f"   Spots:")
            for spot in data['spots']:
                status = "🔴 Occupied" if not spot['is_available'] else "🟢 Available"
                print(f"     - {spot['spot_number']}: {status}")
        else:
            print(f"❌ Failed to get availability: {response.status_code}")
    except Exception as e:
        print(f"❌ Error checking availability: {e}")

# Get active devices
devices = IoTDevice.objects.filter(is_active=True)
print(f"📱 Found {devices.count()} active devices")

if devices.count() >= 2:
    device1 = devices[0]
    device2 = devices[1]
    
    print(f"\n🔧 Testing with devices:")
    print(f"   Device 1: {device1.device_id}")
    print(f"   Device 2: {device2.device_id}")
    
    # Test 1: Both slots available
    print(f"\n=== TEST 1: Both slots available ===")
    simulate_sensor_data(device1.device_id, False, slot1_occupied=False, slot2_occupied=False)
    simulate_sensor_data(device2.device_id, False, slot1_occupied=False, slot2_occupied=False)
    check_availability()
    
    # Test 2: Slot A occupied
    print(f"\n=== TEST 2: Slot A occupied ===")
    simulate_sensor_data(device1.device_id, True, slot1_occupied=True, slot2_occupied=False)
    check_availability()
    
    # Test 3: Both slots occupied
    print(f"\n=== TEST 3: Both slots occupied ===")
    simulate_sensor_data(device1.device_id, True, slot1_occupied=True, slot2_occupied=True)
    check_availability()
    
    # Test 4: Back to available
    print(f"\n=== TEST 4: Back to available ===")
    simulate_sensor_data(device1.device_id, False, slot1_occupied=False, slot2_occupied=False)
    check_availability()
    
else:
    print("❌ Need at least 2 active devices for testing") 