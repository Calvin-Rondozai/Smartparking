#!/usr/bin/env python
import requests
import time
import json

def simulate_esp32_sensor_data(device_id, is_occupied, slot1_occupied=None, slot2_occupied=None):
    """Simulate ESP32 sending sensor data"""
    url = "http://localhost:8000/api/iot/sensor/data/"
    
    data = {
        "device_id": device_id,
        "is_occupied": is_occupied,
        "distance_cm": 15 if is_occupied else 200,
        "temperature": 25.5,
        "humidity": 60.0
    }
    
    if slot1_occupied is not None:
        data["slot1_occupied"] = slot1_occupied
    if slot2_occupied is not None:
        data["slot2_occupied"] = slot2_occupied
    
    try:
        response = requests.post(url, json=data)
        print(f"📡 ESP32 {device_id} sent: Occupied={is_occupied}, Slot1={slot1_occupied}, Slot2={slot2_occupied}")
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

print("=== SIMULATING ESP32 SENSOR DATA ===")

# Get device IDs (you can replace these with your actual device IDs)
device_id_1 = "ESP32_DUAL_SENSOR_001"  # Replace with your actual device ID
device_id_2 = "ESP32_TEST_001"         # Replace with your actual device ID

print(f"📱 Using device IDs: {device_id_1}, {device_id_2}")

# Test 1: Both slots available
print(f"\n=== TEST 1: Both slots available ===")
simulate_esp32_sensor_data(device_id_1, False, slot1_occupied=False, slot2_occupied=False)
time.sleep(2)
check_availability()

# Test 2: Slot A occupied
print(f"\n=== TEST 2: Slot A occupied ===")
simulate_esp32_sensor_data(device_id_1, True, slot1_occupied=True, slot2_occupied=False)
time.sleep(2)
check_availability()

# Test 3: Both slots occupied
print(f"\n=== TEST 3: Both slots occupied ===")
simulate_esp32_sensor_data(device_id_1, True, slot1_occupied=True, slot2_occupied=True)
time.sleep(2)
check_availability()

# Test 4: Back to available
print(f"\n=== TEST 4: Back to available ===")
simulate_esp32_sensor_data(device_id_1, False, slot1_occupied=False, slot2_occupied=False)
time.sleep(2)
check_availability()

print(f"\n✅ ESP32 simulation completed!")
print(f"📱 Your React Native app should update every 5 seconds showing these changes.") 