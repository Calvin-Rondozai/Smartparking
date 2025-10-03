#!/usr/bin/env python3
"""
Test script to verify overtime system is working
"""

import os
import sys
import django
from datetime import datetime, timedelta

# Add the project directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking_backend.settings')
django.setup()

from django.utils import timezone
from parking_app.models import ParkingLot, ParkingSpot, Booking, User
from parking_app.views import check_if_car_still_parked

def test_overtime_system():
    """Test the overtime system"""
    print("🧪 Testing overtime system...")
    
    # Create test data if needed
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
            user.set_password('testpass123')
            user.save()
            print("✅ Created test user")
        
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
            print("✅ Created test parking lot")
        
        # Get or create parking spot
        parking_spot, created = ParkingSpot.objects.get_or_create(
            parking_lot=parking_lot,
            spot_number='A1',
            defaults={
                'spot_type': 'regular',
                'is_occupied': False
            }
        )
        if created:
            print("✅ Created test parking spot")
        
        # Create an expired booking
        end_time = timezone.now() - timedelta(minutes=30)  # Expired 30 minutes ago
        start_time = end_time - timedelta(hours=2)  # Started 2.5 hours ago
        
        booking, created = Booking.objects.get_or_create(
            user=user,
            parking_spot=parking_spot,
            start_time=start_time,
            end_time=end_time,
            defaults={
                'duration_minutes': 120,
                'vehicle_name': 'Test Car',
                'status': 'active',
                'total_cost': 5.00
            }
        )
        
        if created:
            print("✅ Created test booking (expired)")
        else:
            # Update existing booking to be expired
            booking.end_time = end_time
            booking.status = 'active'
            booking.save()
            print("✅ Updated existing booking to be expired")
        
        # Test overtime calculation
        print(f"\n📊 Testing overtime calculation for booking {booking.id}:")
        overtime_minutes, overtime_cost = booking.calculate_overtime()
        print(f"   Overtime minutes: {overtime_minutes}")
        print(f"   Overtime cost: ${overtime_cost:.2f}")
        
        # Test overtime billing update
        print(f"\n💰 Testing overtime billing update:")
        updated_minutes, updated_cost = booking.update_overtime_billing()
        print(f"   Updated overtime minutes: {updated_minutes}")
        print(f"   Updated overtime cost: ${updated_cost:.2f}")
        print(f"   Is overtime: {booking.is_overtime}")
        
        # Test car occupancy check
        print(f"\n🚗 Testing car occupancy check:")
        is_parked = check_if_car_still_parked(parking_spot)
        print(f"   Car still parked: {is_parked}")
        
        # Test booking completion
        if is_parked:
            print(f"\n⏰ Car is still parked - continuing overtime billing")
        else:
            print(f"\n✅ Car has left - completing booking")
            booking.status = 'completed'
            booking.parking_spot.is_occupied = False
            booking.parking_spot.save()
            booking.save()
        
        print(f"\n🎉 Overtime system test completed successfully!")
        
    except Exception as e:
        print(f"❌ Error testing overtime system: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_overtime_system()
