#!/usr/bin/env python
import requests
import time
import json

def test_occupancy(slot_name, is_occupied):
    """Test setting slot occupancy"""
    url = "http://localhost:8000/api/iot/test/occupancy/"
    data = {
        "slot_name": slot_name,
        "is_occupied": is_occupied
    }
    
    try:
        response = requests.post(url, json=data)
        print(f"📡 Set {slot_name} to {'Occupied' if is_occupied else 'Available'}")
        print(f"   Response: {response.status_code}")
        if response.status_code == 200:
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

print("=== TESTING OCCUPANCY UI UPDATES ===")

# Initial state
print("\n=== INITIAL STATE ===")
check_availability()

# Test 1: Make Slot A occupied
print("\n=== TEST 1: Make Slot A Occupied ===")
test_occupancy("Slot A", True)
time.sleep(2)  # Wait for update
check_availability()

# Test 2: Make Slot B occupied
print("\n=== TEST 2: Make Slot B Occupied ===")
test_occupancy("Slot B", True)
time.sleep(2)  # Wait for update
check_availability()

# Test 3: Make Slot A available again
print("\n=== TEST 3: Make Slot A Available ===")
test_occupancy("Slot A", False)
time.sleep(2)  # Wait for update
check_availability()

# Test 4: Make Slot B available again
print("\n=== TEST 4: Make Slot B Available ===")
test_occupancy("Slot B", False)
time.sleep(2)  # Wait for update
check_availability()

print("\n✅ Testing complete! Check your React Native app - it should update every 5 seconds.") 