#!/usr/bin/env python3
"""
Simple Django Server Test
"""

import requests
import time

def test_django_server():
    """Test if Django server is running"""
    print("🔍 Testing Django server...")
    
    try:
        # Test main API endpoint
        response = requests.get("http://localhost:8000/api/", timeout=5)
        print(f"✅ Main API accessible - Status: {response.status_code}")
        
        # Test IoT API endpoint
        response = requests.get("http://localhost:8000/api/iot/", timeout=5)
        print(f"✅ IoT API accessible - Status: {response.status_code}")
        
        return True
    except requests.exceptions.ConnectionError:
        print("❌ Django server is not running")
        print("   Start it with: python manage.py runserver 0.0.0.0:8000")
        return False
    except Exception as e:
        print(f"❌ Error testing server: {e}")
        return False

def test_iot_endpoints():
    """Test IoT endpoints"""
    print("\n📊 Testing IoT endpoints...")
    
    endpoints = [
        ("/api/iot/devices/", "GET"),
        ("/api/iot/parking/availability/", "GET"),
        ("/api/iot/devices/register/", "POST"),
    ]
    
    for endpoint, method in endpoints:
        try:
            if method == "GET":
                response = requests.get(f"http://localhost:8000{endpoint}", timeout=5)
            else:
                response = requests.post(f"http://localhost:8000{endpoint}", 
                                       json={"test": "data"}, timeout=5)
            
            print(f"✅ {method} {endpoint} - Status: {response.status_code}")
        except Exception as e:
            print(f"❌ {method} {endpoint} - Error: {e}")

if __name__ == "__main__":
    print("🚀 Django Server Test")
    print("=" * 30)
    
    if test_django_server():
        test_iot_endpoints()
        print("\n🎉 Server is running and accessible!")
    else:
        print("\n⚠️  Please start the Django server first") 