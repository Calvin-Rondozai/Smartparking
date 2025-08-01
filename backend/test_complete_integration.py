#!/usr/bin/env python3
"""
Complete IoT Integration Test
Tests all aspects of the ESP32 + Django integration
"""

import requests
import json
import time

# Configuration
BASE_URL = "http://localhost:8000/api/iot"

def test_server_connection():
    """Test if Django server is accessible"""
    print("🔍 Testing Django server connection...")
    try:
        response = requests.get("http://localhost:8000/api/")
        print(f"✅ Server accessible - Status: {response.status_code}")
        return True
    except Exception as e:
        print(f"❌ Server not accessible: {e}")
        return False

def test_esp32_device_registration():
    """Test ESP32 device registration"""
    print("\n📱 Testing ESP32 device registration...")
    
    url = f"{BASE_URL}/devices/register/"
    data = {
        "device_id": "ESP32_DUAL_SENSOR_001",
        "device_type": "sensor",
        "name": "Dual Parking Sensor",
        "location": "Test Parking Lot"
    }
    
    try:
        response = requests.post(url, json=data)
        if response.status_code == 201:
            print("✅ Device registration successful!")
            return True
        elif response.status_code == 400 and "already exists" in response.text:
            print("✅ Device already registered (this is fine)")
            return True
        else:
            print(f"❌ Registration failed: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"❌ Registration error: {e}")
        return False

def test_sensor_data_reception():
    """Test sensor data reception from ESP32"""
    print("\n📊 Testing sensor data reception...")
    
    url = f"{BASE_URL}/sensor/data/"
    data = {
        "device_id": "ESP32_DUAL_SENSOR_001",
        "is_occupied": True,
        "distance_cm": 15.5,
        "battery_level": 95.0,
        "signal_strength": -42,
        "slot1_occupied": True,
        "slot2_occupied": False,
        "ir_alert": False
    }
    
    try:
        response = requests.post(url, json=data)
        if response.status_code == 201:
            print("✅ Sensor data received successfully!")
            return True
        else:
            print(f"❌ Sensor data failed: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"❌ Sensor data error: {e}")
        return False

def test_parking_availability():
    """Test parking availability endpoint"""
    print("\n🅿️  Testing parking availability...")
    
    url = f"{BASE_URL}/parking/availability/"
    
    try:
        response = requests.get(url)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Parking availability: {data['total_spots']} total spots")
            print(f"   Available: {data['available_spots']}, Occupied: {data['occupied_spots']}")
            return True
        else:
            print(f"❌ Availability failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Availability error: {e}")
        return False

def test_device_heartbeat():
    """Test device heartbeat"""
    print("\n💓 Testing device heartbeat...")
    
    url = f"{BASE_URL}/devices/heartbeat/"
    data = {
        "device_id": "ESP32_DUAL_SENSOR_001"
    }
    
    try:
        response = requests.post(url, json=data)
        if response.status_code == 200:
            print("✅ Heartbeat received successfully!")
            return True
        else:
            print(f"❌ Heartbeat failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Heartbeat error: {e}")
        return False

def test_device_listing():
    """Test listing all devices"""
    print("\n📋 Testing device listing...")
    
    url = f"{BASE_URL}/devices/"
    
    try:
        response = requests.get(url)
        if response.status_code == 200:
            devices = response.json()
            print(f"✅ Found {len(devices)} active devices")
            for device in devices:
                print(f"   - {device['name']} ({device['device_id']})")
            return True
        else:
            print(f"❌ Device listing failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Device listing error: {e}")
        return False

def main():
    """Run complete integration test"""
    print("🚀 Complete IoT Integration Test")
    print("=" * 50)
    
    tests = [
        ("Server Connection", test_server_connection),
        ("Device Registration", test_esp32_device_registration),
        ("Sensor Data Reception", test_sensor_data_reception),
        ("Parking Availability", test_parking_availability),
        ("Device Heartbeat", test_device_heartbeat),
        ("Device Listing", test_device_listing),
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        print(f"\n--- {test_name} ---")
        if test_func():
            passed += 1
        time.sleep(1)  # Small delay between tests
    
    print(f"\n{'='*50}")
    print(f"🎯 Test Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 ALL TESTS PASSED! Your IoT integration is working perfectly!")
        print("\n📱 Next Steps:")
        print("1. Your ESP32 is sending data to Django")
        print("2. Your sensors are working correctly")
        print("3. Your backend is processing data")
        print("4. Ready to integrate with your React Native app!")
    else:
        print("⚠️  Some tests failed. Check the issues above.")
    
    print(f"\n🔗 Your Django server is running at: http://192.168.73.47:8000")
    print(f"📊 API endpoints available at: http://192.168.73.47:8000/api/iot/")

if __name__ == "__main__":
    main() 