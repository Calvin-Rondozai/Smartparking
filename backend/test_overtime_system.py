#!/usr/bin/env python3
"""
Comprehensive test script for the overtime billing system
This demonstrates the complete overtime workflow:
1. Create a booking that expires quickly
2. Check overtime billing
3. Simulate car still parked (red light on)
4. Complete the booking when car leaves
"""

import os
import sys
import django
from datetime import datetime, timedelta
import time

# Add the project directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking_backend.settings')
django.setup()

from django.contrib.auth.models import User
from parking_app.models import ParkingLot, ParkingSpot, Booking
from parking_app.notifications import NotificationService
import requests

def test_overtime_system():
    """Test the complete overtime billing system"""
    print("🧪 Testing Overtime Billing System")
    print("=" * 50)
    
    # 1. Create test data
    print("\n1️⃣ Creating test data...")
    
    # Get or create test user
    user, created = User.objects.get_or_create(
        username='testuser_overtime',
        defaults={
            'email': 'overtime@example.com',
            'first_name': 'Overtime',
            'last_name': 'Test'
        }
    )
    if created:
        print(f"✅ Created test user: {user.username}")
    else:
        print(f"✅ Using existing test user: {user.username}")
    
    # Get or create parking lot
    parking_lot, created = ParkingLot.objects.get_or_create(
        name='Overtime Test Lot',
        defaults={
            'address': '456 Overtime Street',
            'total_spots': 5,
            'hourly_rate': 3.00
        }
    )
    if created:
        print(f"✅ Created test parking lot: {parking_lot.name}")
    else:
        print(f"✅ Using existing test parking lot: {parking_lot.name}")
    
    # Get or create parking spot
    parking_spot, created = ParkingSpot.objects.get_or_create(
        parking_lot=parking_lot,
        spot_number='OT1',
        defaults={
            'spot_type': 'regular',
            'is_occupied': False
        }
    )
    if created:
        print(f"✅ Created test parking spot: {parking_spot.spot_number}")
    else:
        print(f"✅ Using existing test parking spot: {parking_spot.spot_number}")
    
    # 2. Create booking that expires in 2 minutes
    print("\n2️⃣ Creating test booking...")
    
    from django.utils import timezone
    start_time = timezone.now()
    end_time = start_time + timedelta(minutes=2)  # Expires in 2 minutes
    
    booking = Booking.objects.create(
        user=user,
        parking_spot=parking_spot,
        start_time=start_time,
        end_time=end_time,
        duration_minutes=2,
        vehicle_name='Overtime Test Car',
        status='active'
    )
    
    # Mark spot as occupied
    parking_spot.is_occupied = True
    parking_spot.save()
    
    print(f"✅ Created test booking: {booking.id}")
    print(f"   Start time: {start_time}")
    print(f"   End time: {end_time}")
    print(f"   Duration: 2 minutes")
    print(f"   Status: {booking.status}")
    print(f"   Parking spot: {parking_spot.spot_number}")
    print(f"   User: {user.username}")
    
    # 3. Wait for booking to expire
    print(f"\n3️⃣ Waiting for booking to expire...")
    print(f"   Current time: {timezone.now()}")
    print(f"   Expiry time: {end_time}")
    
    # Calculate wait time
    wait_seconds = max(0, (end_time - timezone.now()).total_seconds())
    if wait_seconds > 0:
        print(f"   Waiting {wait_seconds:.0f} seconds...")
        time.sleep(wait_seconds)
    
    print(f"   Current time: {timezone.now()}")
    print(f"   Booking expired: {booking.is_expired()}")
    
    # 4. Test overtime calculation
    print("\n4️⃣ Testing overtime calculation...")
    
    overtime_minutes, overtime_cost = booking.calculate_overtime()
    print(f"   Overtime minutes: {overtime_minutes}")
    print(f"   Overtime cost: ${overtime_cost:.2f}")
    
    # 5. Test overtime billing update
    print("\n5️⃣ Testing overtime billing update...")
    
    updated_overtime_minutes, updated_overtime_cost = booking.update_overtime_billing()
    print(f"   Updated overtime minutes: {updated_overtime_minutes}")
    print(f"   Updated overtime cost: ${updated_overtime_cost:.2f}")
    print(f"   Is overtime: {booking.is_overtime}")
    
    # 6. Test API endpoints
    print("\n6️⃣ Testing API endpoints...")
    
    # Get auth token for the user
    try:
        from rest_framework.authtoken.models import Token
        token, created = Token.objects.get_or_create(user=user)
        print(f"   Auth token: {token.key[:10]}...")
        
        # Test overtime check endpoint
        headers = {'Authorization': f'Token {token.key}'}
        response = requests.post(
            f'http://localhost:8000/api/bookings/{booking.id}/overtime/check/',
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"   ✅ Overtime check successful:")
            print(f"      Overtime minutes: {data.get('overtime_minutes')}")
            print(f"      Overtime cost: ${data.get('overtime_cost')}")
            print(f"      Total cost: ${data.get('total_cost_with_overtime')}")
            print(f"      Car still parked: {data.get('car_still_parked')}")
        else:
            print(f"   ❌ Overtime check failed: {response.status_code}")
            print(f"      Response: {response.text}")
            
    except Exception as e:
        print(f"   ⚠️  API test failed: {e}")
    
    # 7. Test notifications
    print("\n7️⃣ Testing notifications...")
    
    try:
        # Send overtime alert
        NotificationService.send_overtime_alert(booking)
        print("   ✅ Overtime alert notification sent")
        
        # Send warning notification
        NotificationService.send_overtime_warning(booking, 1)
        print("   ✅ Overtime warning notification sent")
        
    except Exception as e:
        print(f"   ⚠️  Notification test failed: {e}")
    
    # 8. Simulate car leaving (complete booking)
    print("\n8️⃣ Simulating car leaving...")
    
    try:
        # Mark as completed
        booking.status = 'completed'
        parking_spot.is_occupied = False
        parking_spot.save()
        booking.save()
        
        print("   ✅ Booking marked as completed")
        print("   ✅ Parking spot freed")
        
        # Send completion notification
        NotificationService.send_booking_completion_notification(booking)
        print("   ✅ Completion notification sent")
        
    except Exception as e:
        print(f"   ⚠️  Completion test failed: {e}")
    
    # 9. Final summary
    print("\n9️⃣ Final Summary:")
    print(f"   Booking ID: {booking.id}")
    print(f"   Final status: {booking.status}")
    print(f"   Total cost: ${booking.total_cost:.2f}")
    print(f"   Overtime cost: ${booking.overtime_cost:.2f}")
    print(f"   Spot occupied: {parking_spot.is_occupied}")
    
    print("\n🎉 Overtime system test completed!")
    print("\n💡 To test the management command, run:")
    print("   python manage.py check_overtime_bookings --dry-run")
    print("\n💡 To test with real IoT data, ensure your ESP32 is connected")
    print("   and the IoT integration is properly configured.")

if __name__ == "__main__":
    test_overtime_system()
