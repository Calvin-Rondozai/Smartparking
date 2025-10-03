#!/usr/bin/env python3
"""
Test script to create a booking that expires quickly for overtime testing
"""

import os
import sys
import django
from datetime import datetime, timedelta

# Add the project directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking_backend.settings')
django.setup()

from django.contrib.auth.models import User
from parking_app.models import ParkingLot, ParkingSpot, Booking

def create_test_overtime_booking():
    """Create a booking that expires in 1 minute for testing"""
    print("🧪 Creating test overtime booking...")
    
    # Get or create test user
    user, created = User.objects.get_or_create(
        username='testuser',
        defaults={
            'email': 'test@example.com',
            'first_name': 'Test',
            'last_name': 'User'
        }
    )
    if created:
        print(f"✅ Created test user: {user.username}")
    else:
        print(f"✅ Using existing test user: {user.username}")
    
    # Get or create parking lot
    parking_lot, created = ParkingLot.objects.get_or_create(
        name='Test Parking Lot',
        defaults={
            'address': '123 Test Street',
            'total_spots': 10,
            'hourly_rate': 2.50
        }
    )
    if created:
        print(f"✅ Created test parking lot: {parking_lot.name}")
    else:
        print(f"✅ Using existing parking lot: {parking_lot.name}")
    
    # Get or create parking spot
    parking_spot, created = ParkingSpot.objects.get_or_create(
        parking_lot=parking_lot,
        spot_number='T1',
        defaults={
            'spot_type': 'regular',
            'is_occupied': False
        }
    )
    if created:
        print(f"✅ Created test parking spot: {parking_spot.spot_number}")
    else:
        print(f"✅ Using existing parking spot: {parking_spot.spot_number}")
    
    # Create booking that expires in 1 minute
    start_time = datetime.now()
    end_time = start_time + timedelta(minutes=1)  # Expires in 1 minute
    
    booking = Booking.objects.create(
        user=user,
        parking_spot=parking_spot,
        start_time=start_time,
        end_time=end_time,
        duration_minutes=1,
        vehicle_name='Test Vehicle',
        status='active'
    )
    
    # Mark spot as occupied
    parking_spot.is_occupied = True
    parking_spot.save()
    
    print(f"✅ Created test booking: {booking.id}")
    print(f"   Start time: {start_time}")
    print(f"   End time: {end_time}")
    print(f"   Duration: 1 minute")
    print(f"   Status: {booking.status}")
    print(f"   Parking spot: {parking_spot.spot_number}")
    print(f"   User: {user.username}")
    print(f"\n⏰ This booking will expire in 1 minute for overtime testing!")
    
    return booking

if __name__ == "__main__":
    create_test_overtime_booking()

