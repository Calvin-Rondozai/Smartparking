#!/usr/bin/env python
import os
import sys
import django
import requests
from datetime import datetime, timedelta

# Add the project directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking_backend.settings')
django.setup()

from django.contrib.auth.models import User
from parking_app.models import ParkingLot, ParkingSpot, Booking

def test_extend_booking():
    print("=== Testing Extend Booking Functionality ===")
    
    # 1. Create or get a test user
    try:
        user = User.objects.get(username='testuser')
        print("✅ Found test user: testuser")
    except User.DoesNotExist:
        user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        print("✅ Created test user: testuser")
    
    # 2. Get or create parking lot and spot
    try:
        parking_lot = ParkingLot.objects.get(name='IoT Smart Parking')
        print("✅ Found parking lot: IoT Smart Parking")
    except ParkingLot.DoesNotExist:
        parking_lot = ParkingLot.objects.create(
            name='IoT Smart Parking',
            address='Test Address',
            total_spots=2,
            hourly_rate=2.50
        )
        print("✅ Created parking lot: IoT Smart Parking")
    
    try:
        parking_spot = ParkingSpot.objects.get(spot_number='Slot A', parking_lot=parking_lot)
        print("✅ Found parking spot: Slot A")
    except ParkingSpot.DoesNotExist:
        parking_spot = ParkingSpot.objects.create(
            parking_lot=parking_lot,
            spot_number='Slot A',
            spot_type='regular'
        )
        print("✅ Created parking spot: Slot A")
    
    # 3. Create a test booking
    start_time = datetime.now()
    end_time = start_time + timedelta(hours=1)
    
    try:
        booking = Booking.objects.create(
            user=user,
            parking_spot=parking_spot,
            start_time=start_time,
            end_time=end_time,
            duration_minutes=60,
            vehicle_name='Test Car',
            status='active'
        )
        print(f"✅ Created test booking: {booking.id}")
    except Exception as e:
        print(f"❌ Error creating booking: {e}")
        return
    
    # 4. Test the extend booking API
    print("\n4. Testing extend booking API...")
    
    # First, we need to get an auth token
    auth_url = "http://192.168.180.47:8000/api/auth/signin/"
    auth_data = {
        'username': 'testuser',
        'password': 'testpass123'
    }
    
    try:
        auth_response = requests.post(auth_url, json=auth_data)
        if auth_response.status_code == 200:
            token = auth_response.json().get('token')
            print("✅ Got auth token")
            
            # Now test extend booking
            extend_url = f"http://192.168.180.47:8000/api/bookings/{booking.id}/extend/"
            extend_data = {
                'additional_minutes': 30
            }
            headers = {
                'Authorization': f'Token {token}',
                'Content-Type': 'application/json'
            }
            
            extend_response = requests.post(extend_url, json=extend_data, headers=headers)
            
            if extend_response.status_code == 200:
                print("✅ Extend booking API working!")
                result = extend_response.json()
                print(f"   Message: {result.get('message')}")
                
                # Check if booking was actually extended
                booking.refresh_from_db()
                print(f"   Original duration: 60 minutes")
                print(f"   New duration: {booking.duration_minutes} minutes")
                print(f"   New end time: {booking.end_time}")
                
            else:
                print(f"❌ Extend booking failed: {extend_response.status_code}")
                print(f"   Response: {extend_response.text}")
                
        else:
            print(f"❌ Auth failed: {auth_response.status_code}")
            print(f"   Response: {auth_response.text}")
            
    except Exception as e:
        print(f"❌ Error testing extend booking: {e}")
    
    # 5. Clean up
    print("\n5. Cleaning up...")
    try:
        booking.delete()
        print("✅ Deleted test booking")
    except Exception as e:
        print(f"⚠️ Error cleaning up: {e}")
    
    print("\n=== Extend Booking Test Complete ===")

if __name__ == "__main__":
    test_extend_booking() 