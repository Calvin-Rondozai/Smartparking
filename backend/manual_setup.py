#!/usr/bin/env python3
"""
Manual setup for dual sensor IoT integration
"""

import os
import sys
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking_backend.settings')
django.setup()

from parking_app.models import ParkingLot, ParkingSpot
from iot_integration.models import IoTDevice

def main():
    print("Setting up dual sensor IoT integration...")
    
    try:
        # Create parking lot
        parking_lot, created = ParkingLot.objects.get_or_create(
            name="Dual Sensor Parking Lot",
            defaults={
                'address': "123 Main Street",
                'total_spots': 2,
                'hourly_rate': 5.00,
                'rating': 4.5,
            }
        )
        print(f"Parking lot: {parking_lot.name}")
        
        # Create parking spots
        for i in range(1, 3):
            spot, created = ParkingSpot.objects.get_or_create(
                parking_lot=parking_lot,
                spot_number=f"DS{i:02d}",
                defaults={
                    'is_available': True,
                    'spot_type': 'standard',
                    'hourly_rate': 5.00,
                }
            )
            print(f"Parking spot: {spot.spot_number}")
        
        # Create IoT device
        device, created = IoTDevice.objects.get_or_create(
            device_id="ESP32_DUAL_SENSOR_001",
            defaults={
                'device_type': 'sensor',
                'name': 'Dual Parking Sensor',
                'parking_lot': parking_lot,
                'location': 'Dual Sensor Setup',
                'is_active': True,
            }
        )
        print(f"IoT device: {device.name}")
        
        print("\nSetup completed successfully!")
        print("You can now upload the ESP32 code and test the integration.")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main() 