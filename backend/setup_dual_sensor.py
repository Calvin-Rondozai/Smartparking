#!/usr/bin/env python3
"""
Setup script for dual sensor IoT integration
"""

import os
import sys
import django

# Add the project directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking_backend.settings')
django.setup()

from parking_app.models import ParkingLot, ParkingSpot
from iot_integration.models import IoTDevice

def create_parking_lots():
    """Create parking lots with IoT sensors"""
    print("Creating parking lots...")
    
    # Create main parking lot
    parking_lot, created = ParkingLot.objects.get_or_create(
        name="Dual Sensor Parking Lot",
        defaults={
            'address': "123 Main Street",
            'total_spots': 2,
            'hourly_rate': 5.00,
            'rating': 4.5,
        }
    )
    
    if created:
        print(f"Created parking lot: {parking_lot.name}")
    else:
        print(f"Parking lot already exists: {parking_lot.name}")
    
    return parking_lot

def create_parking_spots(parking_lot):
    """Create parking spots for dual sensor setup"""
    print("Creating parking spots...")
    
    spots_created = 0
    
    # Create 2 parking spots for dual sensor
    for i in range(1, 3):
        spot, created = ParkingSpot.objects.get_or_create(
            parking_lot=parking_lot,
            spot_number=f"DS{i:02d}",  # DS01, DS02
            defaults={
                'is_available': True,
                'spot_type': 'standard',
                'hourly_rate': 5.00,
            }
        )
        
        if created:
            spots_created += 1
            print(f"Created parking spot: {spot.spot_number}")
    
    print(f"Created {spots_created} new parking spots")
    return ParkingSpot.objects.filter(parking_lot=parking_lot)

def create_iot_devices(parking_spots):
    """Create IoT device for dual sensor"""
    print("Creating IoT devices...")
    
    devices_created = 0
    
    # Create dual sensor device
    device, created = IoTDevice.objects.get_or_create(
        device_id="ESP32_DUAL_SENSOR_001",
        defaults={
            'device_type': 'sensor',
            'name': 'Dual Parking Sensor',
            'parking_lot': parking_spots[0].parking_lot,
            'location': 'Dual Sensor Setup - Slots DS01 & DS02',
            'is_active': True,
        }
    )
    
    if created:
        devices_created += 1
        print(f"Created IoT device: {device.name}")
    
    print(f"Created {devices_created} new IoT devices")
    return IoTDevice.objects.filter(is_active=True)

def main():
    """Main setup function"""
    print("Setting up Dual Sensor IoT integration for Smart Parking...")
    print("=" * 60)
    
    try:
        # Create parking lot
        parking_lot = create_parking_lots()
        
        # Create parking spots
        parking_spots = create_parking_spots(parking_lot)
        
        # Create IoT devices
        iot_devices = create_iot_devices(parking_spots)
        
        print("\n" + "=" * 60)
        print("Setup completed successfully!")
        print(f"Parking Lot: {parking_lot.name}")
        print(f"Total Spots: {parking_spots.count()}")
        print(f"Active IoT Devices: {iot_devices.count()}")
        print("\nNext steps:")
        print("1. Update ESP32 code with your WiFi credentials")
        print("2. Update server URL in ESP32 code if needed")
        print("3. Upload esp32_dual_sensor_integrated.ino to your ESP32")
        print("4. Start Django server: python manage.py runserver 0.0.0.0:8000")
        print("5. Test the integration!")
        
    except Exception as e:
        print(f"Error during setup: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 