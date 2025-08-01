#!/usr/bin/env python3
"""
Setup IoT-Connected Parking Slots (Slot A and Slot B)
"""

import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking_backend.settings')
django.setup()

from parking_app.models import ParkingLot, ParkingSpot
from iot_integration.models import IoTDevice, SensorData

def setup_iot_slots():
    """Setup 2 IoT-connected parking slots"""
    print("🔄 Setting up IoT-Connected Parking Slots...")
    
    # Create IoT Smart Parking lot
    lot, created = ParkingLot.objects.get_or_create(
        name="IoT Smart Parking",
        defaults={
            "address": "123 IoT Street",
            "total_spots": 2,  # Only 2 slots for your 2 ultrasonic sensors
            "hourly_rate": 2.50,
            "rating": 4.8
        }
    )
    
    if created:
        print(f"✅ Created parking lot: {lot.name}")
    else:
        # Update total spots to 2
        lot.total_spots = 2
        lot.save()
        print(f"✅ Updated parking lot: {lot.name} - Total spots: 2")
    
    # Clear existing spots and create only 2 IoT-connected slots
    ParkingSpot.objects.filter(parking_lot=lot).delete()
    
    # Create Slot A and Slot B
    slots_data = [
        {
            "spot_number": "Slot A",
            "spot_type": "regular",
            "is_occupied": False,  # Will be updated by IoT sensors
            "is_reserved": False
        },
        {
            "spot_number": "Slot B", 
            "spot_type": "regular",
            "is_occupied": False,  # Will be updated by IoT sensors
            "is_reserved": False
        }
    ]
    
    for slot_data in slots_data:
        spot = ParkingSpot.objects.create(
            parking_lot=lot,
            **slot_data
        )
        print(f"✅ Created {spot.spot_number}")
    
    # Update IoT devices to link with slots
    devices = IoTDevice.objects.all()
    print(f"📱 Found {devices.count()} IoT devices")
    
    for i, device in enumerate(devices):
        slot_name = f"Slot {'A' if i == 0 else 'B'}"
        device.location = f"IoT Smart Parking - {slot_name}"
        device.save()
        print(f"✅ Linked {device.name} to {slot_name}")
    
    # Calculate current statistics
    total_spots = ParkingSpot.objects.filter(parking_lot=lot).count()
    available_spots = ParkingSpot.objects.filter(parking_lot=lot, is_occupied=False).count()
    occupied_spots = ParkingSpot.objects.filter(parking_lot=lot, is_occupied=True).count()
    active_devices = IoTDevice.objects.filter(is_active=True).count()
    
    print(f"\n📊 IoT Parking Setup Complete:")
    print(f"   🅿️  Total Slots: {total_spots} (Slot A, Slot B)")
    print(f"   ✅ Available Slots: {available_spots}")
    print(f"   🚗 Occupied Slots: {occupied_spots}")
    print(f"   📱 Active Sensors: {active_devices}")
    
    return {
        "total_spots": total_spots,
        "available_spots": available_spots,
        "occupied_spots": occupied_spots,
        "active_devices": active_devices
    }

def update_slot_availability_from_iot():
    """Update slot availability based on IoT sensor data"""
    print("\n🔄 Updating slot availability from IoT sensors...")
    
    try:
        # Get latest sensor data for each device
        devices = IoTDevice.objects.filter(is_active=True)
        lot = ParkingLot.objects.get(name="IoT Smart Parking")
        
        for i, device in enumerate(devices):
            slot_name = f"Slot {'A' if i == 0 else 'B'}"
            
            # Get latest sensor data
            latest_data = SensorData.objects.filter(device=device).order_by('-timestamp').first()
            
            if latest_data:
                # Update slot availability based on sensor data
                slot = ParkingSpot.objects.get(parking_lot=lot, spot_number=slot_name)
                
                # Use slot1_occupied for Slot A, slot2_occupied for Slot B
                if i == 0:  # Slot A
                    is_occupied = latest_data.slot1_occupied
                else:  # Slot B
                    is_occupied = latest_data.slot2_occupied
                
                slot.is_occupied = is_occupied
                slot.save()
                
                status = "🟢 Available" if not is_occupied else "🔴 Occupied"
                print(f"   {slot_name}: {status}")
            else:
                print(f"   {slot_name}: No sensor data available")
        
        # Recalculate statistics
        available_spots = ParkingSpot.objects.filter(parking_lot=lot, is_occupied=False).count()
        occupied_spots = ParkingSpot.objects.filter(parking_lot=lot, is_occupied=True).count()
        
        print(f"\n📊 Updated Availability:")
        print(f"   ✅ Available: {available_spots} slots")
        print(f"   🚗 Occupied: {occupied_spots} slots")
        
    except Exception as e:
        print(f"❌ Error updating slot availability: {e}")

if __name__ == "__main__":
    print("🚀 IoT Parking Slots Setup")
    print("=" * 40)
    
    # Setup the 2 IoT slots
    stats = setup_iot_slots()
    
    # Update availability from IoT sensors
    update_slot_availability_from_iot()
    
    print(f"\n🎉 IoT Parking Setup Complete!")
    print(f"Your React Native app will now show:")
    print(f"   📱 Active Sensors: {stats['active_devices']}")
    print(f"   🅿️  Available Slots: {stats['available_spots']}/2")
    print(f"   📈 Occupancy Rate: {round((stats['occupied_spots']/2)*100)}%") 