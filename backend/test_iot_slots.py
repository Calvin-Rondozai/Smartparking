#!/usr/bin/env python3
"""
Test IoT Slots Data
"""

import requests
import json

def test_iot_slots():
    """Test IoT slots data"""
    print("🔍 Testing IoT Slots Data...")
    
    try:
        # Test parking availability
        response = requests.get("http://localhost:8000/api/iot/parking/availability/")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Parking Availability API Response:")
            print(f"   Total Spots: {data.get('total_spots', 0)}")
            print(f"   Available Spots: {data.get('available_spots', 0)}")
            print(f"   Occupied Spots: {data.get('occupied_spots', 0)}")
            print(f"   Spots Data:")
            for spot in data.get('spots', []):
                status = "🟢 Available" if spot.get('is_available') else "🔴 Occupied"
                print(f"     - {spot.get('spot_number')}: {status}")
        else:
            print(f"❌ Parking Availability API Error: {response.status_code}")
        
        # Test devices
        response = requests.get("http://localhost:8000/api/iot/devices/")
        if response.status_code == 200:
            devices = response.json()
            print(f"\n📱 IoT Devices ({len(devices)}):")
            for device in devices:
                print(f"   - {device.get('name')} ({device.get('device_id')})")
        else:
            print(f"❌ Devices API Error: {response.status_code}")
            
    except Exception as e:
        print(f"❌ Error testing IoT slots: {e}")

if __name__ == "__main__":
    print("🚀 IoT Slots Test")
    print("=" * 30)
    test_iot_slots() 