#!/usr/bin/env python3
"""
Script to manually fix the database schema for IoT integration
"""

import os
import sys
import django
import sqlite3

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking_backend.settings')
django.setup()

def fix_database():
    """Manually add the missing columns to the database"""
    print("Fixing database schema...")
    
    # Connect to the database
    db_path = os.path.join(os.path.dirname(__file__), 'db.sqlite3')
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if columns exist
        cursor.execute("PRAGMA table_info(iot_integration_sensordata)")
        columns = [column[1] for column in cursor.fetchall()]
        
        print(f"Existing columns: {columns}")
        
        # Add missing columns if they don't exist
        if 'slot1_occupied' not in columns:
            print("Adding slot1_occupied column...")
            cursor.execute("ALTER TABLE iot_integration_sensordata ADD COLUMN slot1_occupied BOOLEAN NULL")
        
        if 'slot2_occupied' not in columns:
            print("Adding slot2_occupied column...")
            cursor.execute("ALTER TABLE iot_integration_sensordata ADD COLUMN slot2_occupied BOOLEAN NULL")
        
        if 'ir_alert' not in columns:
            print("Adding ir_alert column...")
            cursor.execute("ALTER TABLE iot_integration_sensordata ADD COLUMN ir_alert BOOLEAN NULL")
        
        # Commit changes
        conn.commit()
        print("Database schema updated successfully!")
        
        # Verify the changes
        cursor.execute("PRAGMA table_info(iot_integration_sensordata)")
        new_columns = [column[1] for column in cursor.fetchall()]
        print(f"Updated columns: {new_columns}")
        
    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
    finally:
        conn.close()

def create_test_data():
    """Create some test data for the IoT integration"""
    print("Creating test data...")
    
    from parking_app.models import ParkingLot, ParkingSpot
    from iot_integration.models import IoTDevice
    
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
        
        print("Test data created successfully!")
        
    except Exception as e:
        print(f"Error creating test data: {e}")

def main():
    """Main function"""
    print("IoT Integration Database Fix")
    print("=" * 40)
    
    # Fix database schema
    fix_database()
    
    # Create test data
    create_test_data()
    
    print("\nDatabase fix completed!")
    print("You can now run the test script again.")

if __name__ == "__main__":
    main() 