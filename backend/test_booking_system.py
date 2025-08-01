#!/usr/bin/env python3
"""
Test script for the complete booking system with ESP32 integration
"""

import requests
import json
import time
from datetime import datetime, timedelta

# Configuration
BASE_URL = "http://192.168.180.47:8000/api"
IOT_BASE_URL = f"{BASE_URL}/iot"

def test_booking_system():
    print("=== Testing Complete Booking System with ESP32 Integration ===\n")
    
    # Test 1: Check current parking availability
    print("1. Checking current parking availability...")
    try:
        response = requests.get(f"{IOT_BASE_URL}/parking/availability/")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Parking availability: {data['available_spots']}/{data['total_spots']} available")
            for spot in data['spots']:
                print(f"   - {spot['spot_number']}: {'Available' if spot['is_available'] else 'Occupied'}")
        else:
            print(f"❌ Failed to get parking availability: {response.status_code}")
    except Exception as e:
        print(f"❌ Error getting parking availability: {e}")
    
    print()
    
    # Test 2: Check IoT devices
    print("2. Checking IoT devices...")
    try:
        response = requests.get(f"{IOT_BASE_URL}/devices/")
        if response.status_code == 200:
            devices = response.json()
            print(f"✅ Found {len(devices)} IoT devices")
            for device in devices:
                print(f"   - {device['device_id']}: {device['name']}")
        else:
            print(f"❌ Failed to get devices: {response.status_code}")
    except Exception as e:
        print(f"❌ Error getting devices: {e}")
    
    print()
    
    # Test 3: Test ESP32 booking control (set Slot A as booked)
    print("3. Testing ESP32 booking control (setting Slot A as booked)...")
    try:
        control_data = {
            "device_id": "ESP32_DUAL_SENSOR_001",
            "slot_number": "Slot A",
            "is_booked": True
        }
        response = requests.post(f"{IOT_BASE_URL}/control/booking/", json=control_data)
        if response.status_code == 200:
            print("✅ ESP32 booking control successful - Slot A should show BLUE light")
        else:
            print(f"❌ ESP32 booking control failed: {response.status_code}")
            print(f"   Response: {response.text}")
    except Exception as e:
        print(f"❌ Error controlling ESP32 booking: {e}")
    
    print()
    
    # Test 4: Wait and check ESP32 data
    print("4. Waiting 10 seconds for ESP32 to update...")
    time.sleep(10)
    
    print("5. Checking ESP32 sensor data...")
    try:
        response = requests.get(f"{IOT_BASE_URL}/devices/ESP32_DUAL_SENSOR_001/data/")
        if response.status_code == 200:
            device_data = response.json()
            print("✅ ESP32 device data:")
            print(f"   - Device: {device_data.get('device_id')}")
            print(f"   - Last seen: {device_data.get('last_seen')}")
            if 'metadata' in device_data:
                metadata = device_data['metadata']
                print(f"   - Slot 1 booked: {metadata.get('slot1_booked', 'Not set')}")
                print(f"   - Slot 2 booked: {metadata.get('slot2_booked', 'Not set')}")
            else:
                print("   - No metadata found")
        else:
            print(f"❌ Failed to get ESP32 data: {response.status_code}")
    except Exception as e:
        print(f"❌ Error getting ESP32 data: {e}")
    
    print()
    
    # Test 6: Test ESP32 booking control (unset Slot A)
    print("6. Testing ESP32 booking control (unsetting Slot A)...")
    try:
        control_data = {
            "device_id": "ESP32_DUAL_SENSOR_001",
            "slot_number": "Slot A",
            "is_booked": False
        }
        response = requests.post(f"{IOT_BASE_URL}/control/booking/", json=control_data)
        if response.status_code == 200:
            print("✅ ESP32 booking control successful - Slot A should show GREEN light (if available)")
        else:
            print(f"❌ ESP32 booking control failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Error controlling ESP32 booking: {e}")
    
    print()
    
    # Test 7: Test booking creation (this would require authentication)
    print("7. Testing booking creation (requires authentication)...")
    print("   Note: This test requires a valid user token")
    print("   You can test this manually through the mobile app")
    
    print()
    print("=== Booking System Test Complete ===")
    print("\nNext steps:")
    print("1. Upload the updated ESP32 code")
    print("2. Test booking through the mobile app")
    print("3. Verify blue light appears on ESP32 when slot is booked")
    print("4. Check countdown timer in My Bookings screen")
    print("5. Verify booked slots show as 'Booked by You' on Home screen")

if __name__ == "__main__":
    test_booking_system() 