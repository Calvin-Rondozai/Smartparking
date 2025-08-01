#!/usr/bin/env python
import requests
import time

def test_slot_b():
    """Test Slot B occupancy specifically"""
    print("=== TESTING SLOT B ===")
    
    # Test 1: Set Slot B to occupied
    print(f"\n🔧 Setting Slot B to Occupied...")
    response = requests.post('http://localhost:8000/api/iot/test/occupancy/', 
                           json={'slot_name': 'Slot B', 'is_occupied': True})
    
    if response.status_code == 200:
        print(f"✅ Success: {response.json()}")
    else:
        print(f"❌ Error: {response.text}")
    
    # Check availability
    time.sleep(1)
    print(f"\n📊 Checking availability...")
    response = requests.get('http://localhost:8000/api/iot/parking/availability/')
    
    if response.status_code == 200:
        data = response.json()
        print(f"📊 API Response:")
        print(f"   Total spots: {data['total_spots']}")
        print(f"   Available: {data['available_spots']}")
        print(f"   Occupied: {data['occupied_spots']}")
        for spot in data['spots']:
            status = "🔴 Occupied" if not spot['is_available'] else "🟢 Available"
            print(f"   - {spot['spot_number']}: {status}")
    
    # Test 2: Set Slot B back to available
    print(f"\n🔧 Setting Slot B back to Available...")
    response = requests.post('http://localhost:8000/api/iot/test/occupancy/', 
                           json={'slot_name': 'Slot B', 'is_occupied': False})
    
    if response.status_code == 200:
        print(f"✅ Success: {response.json()}")
    else:
        print(f"❌ Error: {response.text}")
    
    # Final check
    time.sleep(1)
    print(f"\n📊 Final availability check...")
    response = requests.get('http://localhost:8000/api/iot/parking/availability/')
    
    if response.status_code == 200:
        data = response.json()
        print(f"📊 Final API Response:")
        print(f"   Total spots: {data['total_spots']}")
        print(f"   Available: {data['available_spots']}")
        print(f"   Occupied: {data['occupied_spots']}")
        for spot in data['spots']:
            status = "🔴 Occupied" if not spot['is_available'] else "🟢 Available"
            print(f"   - {spot['spot_number']}: {status}")

if __name__ == "__main__":
    test_slot_b() 