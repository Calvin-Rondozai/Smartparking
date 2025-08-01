#!/usr/bin/env python
import os
import sys
import django

# Add the project directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking_backend.settings')
django.setup()

from django.contrib.auth.models import User
from parking_app.models import ParkingLot, ParkingSpot, Booking
from datetime import datetime, timedelta

def test_extend_booking():
    print("=== Simple Extend Booking Test ===")
    
    # Get or create test user
    user, created = User.objects.get_or_create(
        username='testuser',
        defaults={'email': 'test@example.com'}
    )
    if created:
        user.set_password('testpass123')
        user.save()
        print("✅ Created test user")
    else:
        print("✅ Found test user")
    
    # Get or create parking lot
    parking_lot, created = ParkingLot.objects.get_or_create(
        name='IoT Smart Parking',
        defaults={
            'address': 'Test Address',
            'total_spots': 2,
            'hourly_rate': 2.50
        }
    )
    print("✅ Got parking lot")
    
    # Get or create parking spot
    parking_spot, created = ParkingSpot.objects.get_or_create(
        parking_lot=parking_lot,
        spot_number='Slot A',
        defaults={'spot_type': 'regular'}
    )
    print("✅ Got parking spot")
    
    # Create a test booking
    start_time = datetime.now()
    end_time = start_time + timedelta(hours=1)
    
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
    print(f"   Original duration: {booking.duration_minutes} minutes")
    print(f"   Original end time: {booking.end_time}")
    
    # Test extending the booking
    from parking_app.views import extend_booking
    from rest_framework.test import APIRequestFactory
    from rest_framework.test import force_authenticate
    from rest_framework import status
    
    factory = APIRequestFactory()
    
    # Create a request
    request = factory.post(
        f'/api/bookings/{booking.id}/extend/',
        {'additional_minutes': 30},
        content_type='application/json'
    )
    
    # Authenticate the request
    force_authenticate(request, user=user)
    
    # Call the view
    response = extend_booking(request, booking.id)
    
    if response.status_code == status.HTTP_200_OK:
        print("✅ Extend booking view working!")
        print(f"   Response: {response.data}")
        
        # Refresh booking from database
        booking.refresh_from_db()
        print(f"   New duration: {booking.duration_minutes} minutes")
        print(f"   New end time: {booking.end_time}")
        print(f"   New total cost: ${booking.total_cost}")
        
    else:
        print(f"❌ Extend booking failed: {response.status_code}")
        print(f"   Response: {response.data}")
    
    # Clean up
    booking.delete()
    print("✅ Cleaned up test booking")
    
    print("=== Test Complete ===")

if __name__ == "__main__":
    test_extend_booking() 