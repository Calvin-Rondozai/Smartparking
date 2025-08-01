#!/usr/bin/env python3
"""
Test script to verify booking creation and display
"""

import os
import sys
import django
from datetime import datetime, timedelta

# Add the backend directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking_backend.settings')
django.setup()

from parking_app.models import ParkingLot, ParkingSpot, Booking
from django.contrib.auth.models import User

def test_booking_display():
    print("=== Testing Booking Display ===")
    
    try:
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
            print(f"✅ Found existing test user: {user.username}")
        
        # Get parking lot and spots
        try:
            lot = ParkingLot.objects.get(name="IoT Smart Parking")
            print(f"✅ Found parking lot: {lot.name}")
        except ParkingLot.DoesNotExist:
            print("❌ IoT Smart Parking lot not found")
            return False
        
        spots = ParkingSpot.objects.filter(parking_lot=lot)
        print(f"✅ Found {spots.count()} parking spots")
        
        # Check existing bookings for this user
        existing_bookings = Booking.objects.filter(user=user)
        print(f"📋 User has {existing_bookings.count()} existing bookings:")
        
        for booking in existing_bookings:
            print(f"   - Booking {booking.id}: {booking.parking_spot.spot_number}")
            print(f"     * Status: {booking.status}")
            print(f"     * Start: {booking.start_time}")
            print(f"     * End: {booking.end_time}")
            print(f"     * Duration: {booking.duration_minutes} minutes")
            print(f"     * Vehicle: {booking.vehicle_name}")
            print(f"     * Cost: ${booking.total_cost}")
        
        # Create a test booking if none exist
        if existing_bookings.count() == 0:
            print("\n📝 Creating test booking...")
            
            # Get first available spot
            available_spot = spots.filter(is_occupied=False).first()
            if not available_spot:
                print("❌ No available spots found")
                return False
            
            # Create booking
            start_time = datetime.now()
            end_time = start_time + timedelta(hours=2)
            
            booking = Booking.objects.create(
                user=user,
                parking_spot=available_spot,
                start_time=start_time,
                end_time=end_time,
                duration_minutes=120,
                vehicle_name="Test Car",
                status='active'
            )
            
            print(f"✅ Created test booking: {booking.id}")
            print(f"   - Spot: {booking.parking_spot.spot_number}")
            print(f"   - Duration: {booking.duration_minutes} minutes")
            print(f"   - Vehicle: {booking.vehicle_name}")
        
        # Test fetching bookings
        print("\n🔄 Testing booking fetch...")
        user_bookings = Booking.objects.filter(user=user)
        print(f"✅ Fetched {user_bookings.count()} bookings for user")
        
        for booking in user_bookings:
            print(f"   - Booking {booking.id}: {booking.parking_spot.spot_number} ({booking.status})")
            print(f"     * Time remaining: {booking.end_time - datetime.now()}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_booking_display()
    if success:
        print("\n✅ Booking display test completed successfully!")
        print("Now check your mobile app - the booking should appear in My Bookings")
    else:
        print("\n❌ Booking display test failed") 