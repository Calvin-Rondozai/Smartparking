#!/usr/bin/env python
import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking_backend.settings')
django.setup()

from parking_app.models import ParkingLot, ParkingSpot
from iot_integration.models import IoTDevice

def fix_slot_mapping():
    """Fix the device-to-slot mapping"""
    print("=== FIXING SLOT MAPPING ===")
    
    try:
        # Get the IoT Smart Parking lot
        lot = ParkingLot.objects.get(name='IoT Smart Parking')
        print(f"✅ Found parking lot: {lot.name}")
        
        # Get all spots
        spots = ParkingSpot.objects.filter(parking_lot=lot)
        print(f"📱 Found {spots.count()} spots:")
        for spot in spots:
            print(f"   - {spot.spot_number}: {'🔴 Occupied' if spot.is_occupied else '🟢 Available'}")
        
        # Get all active devices
        devices = IoTDevice.objects.filter(is_active=True)
        print(f"\n📱 Found {devices.count()} active devices:")
        for device in devices:
            print(f"   - {device.device_id}: {device.name}")
            print(f"     Location: {device.location}")
            print(f"     Parking Spot: {device.parking_spot.spot_number if device.parking_spot else 'None'}")
        
        # Fix the mapping - assign devices to slots
        if devices.count() >= 2:
            device1 = devices[0]  # First device
            device2 = devices[1]  # Second device
            
            # Get the slots
            slot_a = ParkingSpot.objects.get(parking_lot=lot, spot_number='Slot A')
            slot_b = ParkingSpot.objects.get(parking_lot=lot, spot_number='Slot B')
            
            # Assign devices to slots
            device1.parking_spot = slot_a
            device1.location = f"IoT Smart Parking - {slot_a.spot_number}"
            device1.save()
            
            device2.parking_spot = slot_b
            device2.location = f"IoT Smart Parking - {slot_b.spot_number}"
            device2.save()
            
            print(f"\n✅ Fixed device mapping:")
            print(f"   {device1.device_id} -> {slot_a.spot_number}")
            print(f"   {device2.device_id} -> {slot_b.spot_number}")
            
            # Test the mapping
            print(f"\n📊 Updated device info:")
            for device in devices:
                print(f"   - {device.device_id}: {device.location}")
                print(f"     Parking Spot: {device.parking_spot.spot_number if device.parking_spot else 'None'}")
        
        else:
            print(f"❌ Need at least 2 devices for dual slot setup")
            
    except Exception as e:
        print(f"❌ Error: {e}")

def test_slot_occupancy():
    """Test setting occupancy for both slots"""
    print(f"\n=== TESTING SLOT OCCUPANCY ===")
    
    try:
        lot = ParkingLot.objects.get(name='IoT Smart Parking')
        slot_a = ParkingSpot.objects.get(parking_lot=lot, spot_number='Slot A')
        slot_b = ParkingSpot.objects.get(parking_lot=lot, spot_number='Slot B')
        
        # Test Slot A
        print(f"\n🔧 Testing Slot A:")
        slot_a.is_occupied = True
        slot_a.save()
        print(f"   Set {slot_a.spot_number} to Occupied")
        
        # Test Slot B
        print(f"\n🔧 Testing Slot B:")
        slot_b.is_occupied = True
        slot_b.save()
        print(f"   Set {slot_b.spot_number} to Occupied")
        
        # Check both slots
        print(f"\n📊 Current status:")
        for spot in [slot_a, slot_b]:
            status = "🔴 Occupied" if spot.is_occupied else "🟢 Available"
            print(f"   - {spot.spot_number}: {status}")
        
        # Reset both to available
        slot_a.is_occupied = False
        slot_a.save()
        slot_b.is_occupied = False
        slot_b.save()
        print(f"\n✅ Reset both slots to Available")
        
    except Exception as e:
        print(f"❌ Error testing occupancy: {e}")

if __name__ == "__main__":
    fix_slot_mapping()
    test_slot_occupancy()
    print(f"\n✅ Slot mapping fix completed!") 