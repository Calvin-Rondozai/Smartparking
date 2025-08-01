#!/usr/bin/env python3
"""
Setup script for IoT integration with parking spots
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
        name="Main Parking Lot",
        defaults={
            'address': "123 Main Street",
            'total_spots': 20,
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
    """Create parking spots with IoT device associations"""
    print("Creating parking spots...")
    
    spots_created = 0
    for i in range(1, 21):  # Create 20 spots
        spot, created = ParkingSpot.objects.get_or_create(
            parking_lot=parking_lot,
            spot_number=f"A{i:02d}",
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
    """Create IoT devices for parking sensors"""
    print("Creating IoT devices...")
    
    devices_created = 0
    
    # Create parking sensors
    for i, spot in enumerate(parking_spots[:10]):  # Create sensors for first 10 spots
        device_id = f"ESP32_SENSOR_{i+1:03d}"
        
        device, created = IoTDevice.objects.get_or_create(
            device_id=device_id,
            defaults={
                'device_type': 'sensor',
                'name': f'Parking Sensor {i+1}',
                'parking_lot': spot.parking_lot,
                'parking_spot': spot,
                'location': f'Spot {spot.spot_number}',
                'is_active': True,
            }
        )
        
        if created:
            devices_created += 1
            print(f"Created IoT device: {device.name} for spot {spot.spot_number}")
    
    # Create LED display device
    display_device, created = IoTDevice.objects.get_or_create(
        device_id="ESP32_DISPLAY_001",
        defaults={
            'device_type': 'display',
            'name': 'LED Display',
            'parking_lot': parking_spots[0].parking_lot,
            'location': 'Parking Lot Entrance',
            'is_active': True,
        }
    )
    
    if created:
        devices_created += 1
        print(f"Created IoT device: {display_device.name}")
    
    print(f"Created {devices_created} new IoT devices")
    return IoTDevice.objects.filter(is_active=True)

def main():
    """Main setup function"""
    print("Setting up IoT integration for Smart Parking...")
    print("=" * 50)
    
    try:
        # Create parking lot
        parking_lot = create_parking_lots()
        
        # Create parking spots
        parking_spots = create_parking_spots(parking_lot)
        
        # Create IoT devices
        iot_devices = create_iot_devices(parking_spots)
        
        print("\n" + "=" * 50)
        print("Setup completed successfully!")
        print(f"Parking Lot: {parking_lot.name}")
        print(f"Total Spots: {parking_spots.count()}")
        print(f"Active IoT Devices: {iot_devices.count()}")
        print("\nNext steps:")
        print("1. Run migrations: python manage.py makemigrations && python manage.py migrate")
        print("2. Update ESP32 code with your WiFi credentials")
        print("3. Upload code to ESP32 devices")
        print("4. Start Django server: python manage.py runserver 0.0.0.0:8000")
        
    except Exception as e:
        print(f"Error during setup: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 