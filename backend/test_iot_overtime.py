#!/usr/bin/env python3
"""
Test script for IoT overtime detection system
This script simulates the IoT overtime detection process
"""

import os
import sys
import django
import requests
import time
from datetime import datetime, timedelta

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking_backend.settings')
django.setup()

from parking_app.models import ParkingLot, ParkingSpot, Booking, User, UserProfile
from iot_integration.models import IoTDevice, SensorData

def test_iot_overtime_system():
    """Test the complete IoT overtime detection system"""
    
    print("🚗 Testing IoT Overtime Detection System")
    print("=" * 50)
    
    try:
        # 1. Create test parking lot and spots
        print("\n1. Setting up test parking lot...")
        lot, created = ParkingLot.objects.get_or_create(
            name="IoT Smart Parking",
            defaults={
                'address': 'IoT Test Location',
                'total_spots': 2,
                'hourly_rate': 2.50
            }
        )
        print(f"   Parking lot: {lot.name} ({'created' if created else 'exists'})")
        
        # Create parking spots
        spots = []
        for slot_name in ["Slot A", "Slot B"]:
            spot, created = ParkingSpot.objects.get_or_create(
                parking_lot=lot,
                spot_number=slot_name,
                defaults={
                    'name': slot_name,
                    'is_occupied': False,
                    'price_per_hour': 2.50
                }
            )
            spots.append(spot)
            print(f"   Spot: {spot.spot_number} ({'created' if created else 'exists'})")
        
        # 2. Create test user and profile
        print("\n2. Creating test user...")
        user, created = User.objects.get_or_create(
            username='iot_test_user',
            defaults={
                'email': 'iot_test@example.com',
                'first_name': 'IoT',
                'last_name': 'Test'
            }
        )
        if created:
            user.set_password('testpass123')
            user.save()
            print(f"   User created: {user.username}")
        else:
            print(f"   User exists: {user.username}")
        
        # Create user profile
        profile, created = UserProfile.objects.get_or_create(
            user=user,
            defaults={
                'phone_number': '+1234567890',
                'license_plate': 'IOT123',
                'car_name': 'Test Car'
            }
        )
        print(f"   Profile: {profile.license_plate}")
        
        # 3. Create IoT device
        print("\n3. Setting up IoT device...")
        device, created = IoTDevice.objects.get_or_create(
            device_id='ESP32_TEST_001',
            defaults={
                'device_type': 'sensor',
                'name': 'ESP32 Test Sensor',
                'parking_lot': lot,
                'is_active': True
            }
        )
        print(f"   IoT Device: {device.name} ({'created' if created else 'exists'})")
        
        # 4. Create an expiring booking
        print("\n4. Creating test booking...")
        start_time = datetime.now() - timedelta(hours=1)  # Started 1 hour ago
        end_time = datetime.now() - timedelta(minutes=5)  # Expired 5 minutes ago
        
        booking, created = Booking.objects.get_or_create(
            user=user,
            parking_spot=spots[0],
            defaults={
                'start_time': start_time,
                'end_time': end_time,
                'duration_minutes': 60,
                'total_cost': 2.50,
                'status': 'active'
            }
        )
        print(f"   Booking: {booking.id} - Expired at {end_time.strftime('%H:%M:%S')}")
        
        # 5. Simulate IoT sensor data showing car still parked (red light on)
        print("\n5. Simulating IoT sensor data...")
        
        # Simulate car still parked after expiry (red light stays on)
        sensor_data = SensorData.objects.create(
            device=device,
            parking_spot=spots[0],
            is_occupied=True,  # Car is still there
            slot1_occupied=True,  # Slot A is occupied
            slot2_occupied=False,
            timestamp=datetime.now()
        )
        print(f"   Sensor data: Car detected in {spots[0].spot_number} (red light on)")
        
        # 6. Test the overtime detection API
        print("\n6. Testing overtime detection API...")
        
        # Wait a moment for the system to process
        time.sleep(2)
        
        # Check overtime status
        try:
            response = requests.get(f'http://localhost:8000/api/bookings/{booking.id}/overtime/')
            if response.status_code == 200:
                overtime_data = response.json()
                print(f"   ✅ Overtime API response: {overtime_data}")
                
                if overtime_data.get('is_overtime'):
                    print(f"   🎯 Overtime detected: {overtime_data.get('overtime_minutes')} minutes")
                    print(f"   💰 Overtime cost: ${overtime_data.get('overtime_cost', 0):.2f}")
                else:
                    print("   ⚠️  No overtime detected yet")
            else:
                print(f"   ❌ API error: {response.status_code}")
                
        except requests.exceptions.RequestException as e:
            print(f"   ❌ API request failed: {e}")
        
        # 7. Simulate car leaving (red light turns green)
        print("\n7. Simulating car departure...")
        
        # Update sensor data to show car left
        sensor_data.is_occupied = False
        sensor_data.slot1_occupied = False
        sensor_data.save()
        print(f"   Sensor data: Car left {spots[0].spot_number} (red light off)")
        
        # 8. Test final overtime calculation
        print("\n8. Testing final overtime calculation...")
        time.sleep(2)
        
        try:
            response = requests.get(f'http://localhost:8000/api/bookings/{booking.id}/overtime/')
            if response.status_code == 200:
                final_overtime = response.json()
                print(f"   ✅ Final overtime data: {final_overtime}")
                
                if final_overtime.get('is_overtime'):
                    total_minutes = final_overtime.get('overtime_minutes', 0)
                    total_cost = final_overtime.get('overtime_cost', 0)
                    print(f"   🎯 Total overtime: {total_minutes} minutes")
                    print(f"   💰 Total overtime cost: ${total_cost:.2f}")
                else:
                    print("   ⚠️  Overtime status unclear")
            else:
                print(f"   ❌ Final API check failed: {response.status_code}")
                
        except requests.exceptions.RequestException as e:
            print(f"   ❌ Final API request failed: {e}")
        
        print("\n" + "=" * 50)
        print("✅ IoT Overtime Test Completed!")
        print("\n📱 Frontend should now show:")
        print("   • Overtime information in red")
        print("   • IoT detection indicator")
        print("   • Real-time overtime calculation")
        print("   • Automatic billing updates")
        
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_iot_overtime_system()
