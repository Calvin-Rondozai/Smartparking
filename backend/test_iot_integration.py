#!/usr/bin/env python
import os
import django
import requests
import json
from datetime import datetime

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking_backend.settings')
django.setup()

from parking_app.models import ParkingLot, ParkingSpot, Booking
from iot_integration.models import IoTDevice, SensorData

def test_iot_integration():
    print("=== Testing IoT Integration with Mobile App ===")
    
    # Test 1: Check if parking lot and spots exist
    print("\n1. Checking parking infrastructure...")
    try:
        lot = ParkingLot.objects.get(name="IoT Smart Parking")
        print(f"✅ Found parking lot: {lot.name}")
        
        spots = ParkingSpot.objects.filter(parking_lot=lot)
        print(f"✅ Found {spots.count()} parking spots:")
        for spot in spots:
            print(f"   - {spot.spot_number}: {'Occupied' if spot.is_occupied else 'Available'}")
    except ParkingLot.DoesNotExist:
        print("❌ IoT Smart Parking lot not found")
        return
    
    # Test 2: Check IoT devices
    print("\n2. Checking IoT devices...")
    devices = IoTDevice.objects.filter(is_active=True)
    print(f"✅ Found {devices.count()} active IoT devices:")
    for device in devices:
        print(f"   - {device.device_id}: {device.name}")
    
    # Test 3: Check latest sensor data
    print("\n3. Checking latest sensor data...")
    for device in devices:
        latest_data = SensorData.objects.filter(device=device).order_by('-timestamp').first()
        if latest_data:
            print(f"   - {device.device_id}:")
            print(f"     * Last update: {latest_data.timestamp}")
            print(f"     * Slot 1 occupied: {getattr(latest_data, 'slot1_occupied', 'N/A')}")
            print(f"     * Slot 2 occupied: {getattr(latest_data, 'slot2_occupied', 'N/A')}")
            print(f"     * General occupied: {latest_data.is_occupied}")
        else:
            print(f"   - {device.device_id}: No sensor data found")
    
    # Test 4: Test API endpoints
    print("\n4. Testing API endpoints...")
    base_url = "http://192.168.180.47:8000/api"
    
    # Test parking availability endpoint
    try:
        response = requests.get(f"{base_url}/iot/parking/availability/")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Parking availability API working:")
            print(f"   * Total spots: {data.get('total_spots')}")
            print(f"   * Available spots: {data.get('available_spots')}")
            print(f"   * Occupied spots: {data.get('occupied_spots')}")
            print(f"   * Spots data: {data.get('spots')}")
        else:
            print(f"❌ Parking availability API failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Parking availability API error: {e}")
    
    # Test devices endpoint
    try:
        response = requests.get(f"{base_url}/iot/devices/")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Devices API working: {len(data)} devices found")
        else:
            print(f"❌ Devices API failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Devices API error: {e}")
    
    # Test 5: Simulate sensor data update
    print("\n5. Simulating sensor data update...")
    try:
        # Create test sensor data
        device = devices.first()
        if device:
            sensor_data = {
                "device_id": device.device_id,
                "is_occupied": True,
                "distance_cm": 15.5,
                "battery_level": 85.0,
                "signal_strength": -45,
                "temperature": 25,
                "humidity": 50,
                "slot1_occupied": True,
                "slot2_occupied": False,
                "ir_alert": False
            }
            
            response = requests.post(
                f"{base_url}/iot/sensor/data/",
                json=sensor_data,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 201:
                print("✅ Sensor data sent successfully")
                
                # Check if parking spots were updated
                spots = ParkingSpot.objects.filter(parking_lot=lot)
                print("Updated parking spots:")
                for spot in spots:
                    print(f"   - {spot.spot_number}: {'Occupied' if spot.is_occupied else 'Available'}")
            else:
                print(f"❌ Sensor data failed: {response.status_code} - {response.text}")
        else:
            print("❌ No IoT devices found to test with")
    except Exception as e:
        print(f"❌ Sensor data test error: {e}")
    
    # Test 6: Test booking with occupied spot
    print("\n6. Testing booking validation...")
    try:
        # Try to book an occupied spot
        occupied_spot = ParkingSpot.objects.filter(parking_lot=lot, is_occupied=True).first()
        if occupied_spot:
            print(f"✅ Found occupied spot: {occupied_spot.spot_number}")
            print("   * This spot should not be bookable in the mobile app")
        else:
            print("ℹ️ No occupied spots found to test booking validation")
    except Exception as e:
        print(f"❌ Booking validation test error: {e}")
    
    print("\n=== Integration Test Complete ===")
    print("\nNext steps:")
    print("1. Check your mobile app - it should show real-time slot availability")
    print("2. Occupied slots should show as 'Occupied' and be unbookable")
    print("3. Available slots should show as 'Available' and be bookable")
    print("4. The available slots count should update automatically")

if __name__ == "__main__":
    test_iot_integration() 