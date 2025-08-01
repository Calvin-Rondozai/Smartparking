#!/usr/bin/env python3
"""
Update IoT Display Data
"""

import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking_backend.settings')
django.setup()

from parking_app.models import ParkingLot, ParkingSpot
from iot_integration.models import IoTDevice, SensorData

def update_iot_display():
    """Update IoT display data"""
    print("🔄 Updating IoT Display Data...")
    
    # Create or update parking lot
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
    
    # Create parking spots with IoT data
    spots_data = [
        {"spot_number": "A1", "is_available": True, "hourly_rate": 2.50},
        {"spot_number": "A2", "is_available": False, "hourly_rate": 2.50},
        {"spot_number": "A3", "is_available": True, "hourly_rate": 2.50},
        {"spot_number": "A4", "is_available": True, "hourly_rate": 2.50},
        {"spot_number": "B1", "is_available": False, "hourly_rate": 2.50},
        {"spot_number": "B2", "is_available": True, "hourly_rate": 2.50},
    ]
    
    for spot_data in spots_data:
        spot, created = ParkingSpot.objects.get_or_create(
            lot=lot,
            spot_number=spot_data["spot_number"],
            defaults={
                "is_available": spot_data["is_available"],
                "hourly_rate": spot_data["hourly_rate"]
            }
        )
        if created:
            print(f"✅ Created spot: {spot.spot_number}")
    
    # Update IoT devices
    devices = IoTDevice.objects.all()
    print(f"📱 Active IoT Devices: {devices.count()}")
    
    for device in devices:
        print(f"   - {device.name} ({device.device_id}) - Active: {device.is_active}")
    
    # Create sample sensor data
    for device in devices:
        sensor_data, created = SensorData.objects.get_or_create(
            device=device,
            defaults={
                "is_occupied": True,
                "distance_cm": 15.5,
                "battery_level": 95.0,
                "signal_strength": -42,
                "slot1_occupied": True,
                "slot2_occupied": False,
                "ir_alert": False
            }
        )
        if created:
            print(f"✅ Created sensor data for {device.name}")
    
    # Calculate statistics
    total_spots = ParkingSpot.objects.filter(lot=lot).count()
    available_spots = ParkingSpot.objects.filter(lot=lot, is_available=True).count()
    occupied_spots = ParkingSpot.objects.filter(lot=lot, is_available=False).count()
    active_devices = IoTDevice.objects.filter(is_active=True).count()
    
    occupancy_rate = round((occupied_spots / total_spots) * 100) if total_spots > 0 else 0
    
    print(f"\n📊 IoT Display Statistics:")
    print(f"   🅿️  Total Spots: {total_spots}")
    print(f"   ✅ Available Spots: {available_spots}")
    print(f"   🚗 Occupied Spots: {occupied_spots}")
    print(f"   📱 Active Sensors: {active_devices}")
    print(f"   📈 Occupancy Rate: {occupancy_rate}%")
    
    return {
        "total_spots": total_spots,
        "available_spots": available_spots,
        "occupied_spots": occupied_spots,
        "active_devices": active_devices,
        "occupancy_rate": occupancy_rate
    }

if __name__ == "__main__":
    print("🚀 IoT Display Update")
    print("=" * 30)
    
    stats = update_iot_display()
    
    print(f"\n🎉 IoT Display Updated Successfully!")
    print(f"Your React Native app should now show:")
    print(f"   📱 Active Sensors: {stats['active_devices']}")
    print(f"   🅿️  Available Spots: {stats['available_spots']}")
    print(f"   📈 Occupancy Rate: {stats['occupancy_rate']}%") 