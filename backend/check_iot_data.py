#!/usr/bin/env python3
"""
Check and Update IoT Data
"""

import requests
import json

def check_iot_data():
    """Check current IoT data"""
    print("🔍 Checking IoT Data...")
    
    try:
        # Check devices
        response = requests.get("http://localhost:8000/api/iot/devices/")
        devices = response.json()
        print(f"📱 Active Devices: {len(devices)}")
        for device in devices:
            print(f"   - {device['name']} ({device['device_id']})")
        
        # Check parking availability
        response = requests.get("http://localhost:8000/api/iot/parking/availability/")
        availability = response.json()
        print(f"🅿️  Parking Data:")
        print(f"   Total Spots: {availability.get('total_spots', 0)}")
        print(f"   Available: {availability.get('available_spots', 0)}")
        print(f"   Occupied: {availability.get('occupied_spots', 0)}")
        
        return devices, availability
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return [], {}

def create_test_data():
    """Create test IoT data"""
    print("\n📊 Creating Test IoT Data...")
    
    try:
        # Register a test device
        device_data = {
            "device_id": "ESP32_TEST_001",
            "device_type": "sensor",
            "name": "Test Parking Sensor",
            "location": "Test Parking Lot"
        }
        
        response = requests.post("http://localhost:8000/api/iot/devices/register/", json=device_data)
        print(f"📱 Device Registration: {response.status_code}")
        
        # Send test sensor data
        sensor_data = {
            "device_id": "ESP32_TEST_001",
            "is_occupied": True,
            "distance_cm": 15.5,
            "battery_level": 95.0,
            "signal_strength": -42,
            "slot1_occupied": True,
            "slot2_occupied": False,
            "ir_alert": False
        }
        
        response = requests.post("http://localhost:8000/api/iot/sensor/data/", json=sensor_data)
        print(f"📊 Sensor Data: {response.status_code}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error creating test data: {e}")
        return False

def update_parking_spots():
    """Update parking spots with IoT data"""
    print("\n🅿️  Updating Parking Spots...")
    
    try:
        # Create a parking lot if it doesn't exist
        from parking_app.models import ParkingLot, ParkingSpot
        
        lot, created = ParkingLot.objects.get_or_create(
            name="IoT Smart Parking",
            defaults={
                "address": "123 IoT Street",
                "hourly_rate": 2.50,
                "rating": 4.8
            }
        )
        
        if created:
            print(f"✅ Created parking lot: {lot.name}")
        
        # Create parking spots
        spots_data = [
            {"spot_number": "A1", "is_available": True},
            {"spot_number": "A2", "is_available": False},
            {"spot_number": "A3", "is_available": True},
            {"spot_number": "A4", "is_available": True},
        ]
        
        for spot_data in spots_data:
            spot, created = ParkingSpot.objects.get_or_create(
                lot=lot,
                spot_number=spot_data["spot_number"],
                defaults={"is_available": spot_data["is_available"]}
            )
            if created:
                print(f"✅ Created spot: {spot.spot_number}")
        
        print(f"🅿️  Total spots: {ParkingSpot.objects.filter(lot=lot).count()}")
        print(f"🅿️  Available: {ParkingSpot.objects.filter(lot=lot, is_available=True).count()}")
        print(f"🅿️  Occupied: {ParkingSpot.objects.filter(lot=lot, is_available=False).count()}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error updating parking spots: {e}")
        return False

if __name__ == "__main__":
    print("🚀 IoT Data Check and Update")
    print("=" * 40)
    
    # Check current data
    devices, availability = check_iot_data()
    
    # Create test data if none exists
    if not devices:
        create_test_data()
        devices, availability = check_iot_data()
    
    # Update parking spots
    update_parking_spots()
    
    print("\n🎉 IoT Data Updated!")
    print(f"📱 Active Sensors: {len(devices)}")
    print(f"🅿️  Available Spots: {availability.get('available_spots', 0)}")
    print(f"🅿️  Occupancy Rate: {availability.get('occupied_spots', 0)}/{availability.get('total_spots', 1)}") 