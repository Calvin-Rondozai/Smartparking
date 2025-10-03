#!/usr/bin/env python3
"""Quick test of overtime system without waiting"""

import os
import sys
import django

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking_backend.settings')
django.setup()

from django.utils import timezone
from datetime import timedelta
from parking_app.models import User, ParkingLot, ParkingSpot, Booking
from parking_app.notifications import NotificationService

def quick_test():
    print("🧪 Quick Overtime Test")
    
    # Create expired booking
    user, _ = User.objects.get_or_create(username='quicktest')
    lot, _ = ParkingLot.objects.get_or_create(
        name='Quick Test Lot',
        defaults={'address': 'Quick Test Address', 'total_spots': 5, 'hourly_rate': 2.50}
    )
    spot, _ = ParkingSpot.objects.get_or_create(parking_lot=lot, spot_number='QT1')
    
    # Create booking that expired 10 minutes ago
    start_time = timezone.now() - timedelta(minutes=20)
    end_time = timezone.now() - timedelta(minutes=10)
    
    booking = Booking.objects.create(
        user=user,
        parking_spot=spot,
        start_time=start_time,
        end_time=end_time,
        duration_minutes=10,
        status='active'
    )
    
    print(f"✅ Created expired booking: {booking.id}")
    print(f"   Expired: {booking.is_expired()}")
    
    # Test overtime calculation
    overtime_minutes, overtime_cost = booking.calculate_overtime()
    print(f"   Overtime: {overtime_minutes} minutes, ${overtime_cost:.2f}")
    
    # Test notification
    try:
        NotificationService.send_overtime_alert(booking)
        print("   ✅ Notification sent")
    except Exception as e:
        print(f"   ❌ Notification failed: {e}")
    
    print("🎉 Quick test completed!")

if __name__ == "__main__":
    quick_test()
