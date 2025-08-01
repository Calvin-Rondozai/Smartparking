#!/usr/bin/env python
import os
import sys
import django

# Add the project directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking_backend.settings')
django.setup()

from parking_app.models import Booking

def update_total_costs():
    print("=== Updating Total Costs for Existing Bookings ===")
    
    # Get all bookings without total_cost
    bookings_without_cost = Booking.objects.filter(total_cost__isnull=True)
    print(f"Found {bookings_without_cost.count()} bookings without total cost")
    
    updated_count = 0
    for booking in bookings_without_cost:
        try:
            # Calculate total cost
            duration = booking.end_time - booking.start_time
            hours = duration.total_seconds() / 3600
            
            # Get hourly rate
            if hasattr(booking.parking_spot, 'parking_lot') and booking.parking_spot.parking_lot:
                if hasattr(booking.parking_spot.parking_lot, 'hourly_rate') and booking.parking_spot.parking_lot.hourly_rate:
                    hourly_rate = float(booking.parking_spot.parking_lot.hourly_rate)
                else:
                    hourly_rate = 2.50
            else:
                hourly_rate = 2.50
            
            booking.total_cost = hours * hourly_rate
            booking.save()
            updated_count += 1
            print(f"✅ Updated booking {booking.id}: ${booking.total_cost:.2f}")
            
        except Exception as e:
            print(f"❌ Error updating booking {booking.id}: {e}")
    
    print(f"\n=== Update Complete ===")
    print(f"Successfully updated {updated_count} bookings")

if __name__ == "__main__":
    update_total_costs() 