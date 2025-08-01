#!/usr/bin/env python3
"""
Simple test script for IoT integration
"""

import requests
import json

# Configuration
BASE_URL = "http://localhost:8000/api/iot"

def test_device_registration():
    """Test device registration"""
    print("Testing device registration...")
    
    url = f"{BASE_URL}/devices/register/"
    data = {
        "device_id": "ESP32_TEST_001",
        "device_type": "sensor",
        "name": "Test Sensor",
        "location": "Test Location"
    }
    
    try:
        response = requests.post(url, json=data)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 201
    except Exception as e:
        print(f"Error: {e}")
        return False

def test_basic_sensor_data():
    """Test basic sensor data submission (without dual sensor fields)"""
    print("\nTesting basic sensor data submission...")
    
    url = f"{BASE_URL}/sensor/data/"
    data = {
        "device_id": "ESP32_TEST_001",
        "is_occupied": True,
        "distance_cm": 25.5,
        "battery_level": 85.0,
        "signal_strength": -45
    }
    
    try:
        response = requests.post(url, json=data)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 201
    except Exception as e:
        print(f"Error: {e}")
        return False

def test_parking_availability():
    """Test parking availability endpoint"""
    print("\nTesting parking availability...")
    
    url = f"{BASE_URL}/parking/availability/"
    
    try:
        response = requests.get(url)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"Error: {e}")
        return False

def test_heartbeat():
    """Test device heartbeat"""
    print("\nTesting device heartbeat...")
    
    url = f"{BASE_URL}/devices/heartbeat/"
    data = {
        "device_id": "ESP32_TEST_001"
    }
    
    try:
        response = requests.post(url, json=data)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"Error: {e}")
        return False

def main():
    """Run all tests"""
    print("Simple IoT Integration Test")
    print("=" * 40)
    
    # Check if server is running
    try:
        response = requests.get("http://localhost:8000/api/")
        print("✓ Django server is running")
    except:
        print("✗ Django server is not running. Please start it first:")
        print("  python manage.py runserver 0.0.0.0:8000")
        return
    
    tests = [
        ("Device Registration", test_device_registration),
        ("Basic Sensor Data", test_basic_sensor_data),
        ("Parking Availability", test_parking_availability),
        ("Device Heartbeat", test_heartbeat),
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        print(f"\n--- {test_name} ---")
        if test_func():
            print(f"✓ {test_name} PASSED")
            passed += 1
        else:
            print(f"✗ {test_name} FAILED")
    
    print(f"\n{'='*40}")
    print(f"Tests passed: {passed}/{total}")
    
    if passed == total:
        print("🎉 All tests passed! Basic IoT integration is working.")
        print("Next: Fix the database schema for dual sensor fields.")
    else:
        print("⚠️  Some tests failed. Check the Django server and database.")

if __name__ == "__main__":
    main() 