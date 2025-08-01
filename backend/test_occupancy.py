#!/usr/bin/env python
import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking_backend.settings')
django.setup()

from parking_app.models import ParkingLot, ParkingSpot
from iot_integration.models import IoTDevice

def test_occupancy():
    print("=== Testing Parking Occupancy ===")
    
    # Check if parking lot exists
    try:
        lot = ParkingLot.objects.get(name="IoT Smart Parking")
        print(f"✅ Found parking lot: {lot.name}")
    except ParkingLot.DoesNotExist:
        print("❌ IoT Smart Parking lot not found")
        return
    
    # Check parking spots
    spots = ParkingSpot.objects.filter(parking_lot=lot)
    print(f"Found {spots.count()} parking spots:")
    
    for spot in spots:
        print(f"  - {spot.spot_number}: {'Occupied' if spot.is_occupied else 'Available'}")
    
    # Check IoT devices
    devices = IoTDevice.objects.filter(is_active=True)
    print(f"\nFound {devices.count()} active IoT devices:")
    
    for device in devices:
        print(f"  - {device.device_id}: {device.name}")
        if device.parking_spot:
            print(f"    Linked to: {device.parking_spot.spot_number}")
        else:
            print(f"    Not linked to any parking spot")
    
    # Test setting occupancy manually
    print("\n=== Testing Manual Occupancy Setting ===")
    
    # Set Slot A to occupied
    try:
        slot_a = ParkingSpot.objects.get(parking_lot=lot, spot_number="Slot A")
        slot_a.is_occupied = True
        slot_a.save()
        print("✅ Set Slot A to OCCUPIED")
    except ParkingSpot.DoesNotExist:
        print("❌ Slot A not found")
    
    # Set Slot B to available
    try:
        slot_b = ParkingSpot.objects.get(parking_lot=lot, spot_number="Slot B")
        slot_b.is_occupied = False
        slot_b.save()
        print("✅ Set Slot B to AVAILABLE")
    except ParkingSpot.DoesNotExist:
        print("❌ Slot B not found")
    
    # Show final status
    print("\n=== Final Status ===")
    spots = ParkingSpot.objects.filter(parking_lot=lot)
    for spot in spots:
        print(f"  - {spot.spot_number}: {'Occupied' if spot.is_occupied else 'Available'}")

if __name__ == "__main__":
    test_occupancy() 