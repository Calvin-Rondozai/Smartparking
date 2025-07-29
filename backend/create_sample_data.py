import os
import django
from datetime import datetime, timedelta

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking_backend.settings')
django.setup()

from django.contrib.auth.models import User
from parking_app.models import ParkingLot, ParkingSpot, UserProfile

def create_sample_data():
    # Create sample parking lots
    lot1 = ParkingLot.objects.create(
        name="Downtown Parking Center",
        address="123 Main Street, Downtown",
        total_spots=50,
        hourly_rate=3.00,
        rating=4.8
    )
    
    lot2 = ParkingLot.objects.create(
        name="Mall Parking Complex",
        address="456 Shopping Ave, Mall District",
        total_spots=100,
        hourly_rate=2.50,
        rating=4.6
    )
    
    # Create parking spots for lot 1
    for i in range(1, 26):
        ParkingSpot.objects.create(
            parking_lot=lot1,
            spot_number=f"A{i:02d}",
            spot_type='regular',
            is_occupied=False
        )
    
    # Create parking spots for lot 2
    for i in range(1, 51):
        ParkingSpot.objects.create(
            parking_lot=lot2,
            spot_number=f"B{i:02d}",
            spot_type='regular',
            is_occupied=False
        )
    
    # Create some handicap spots
    ParkingSpot.objects.create(
        parking_lot=lot1,
        spot_number="H01",
        spot_type='handicap',
        is_occupied=False
    )
    
    ParkingSpot.objects.create(
        parking_lot=lot2,
        spot_number="H01",
        spot_type='handicap',
        is_occupied=False
    )
    
    # Create some electric vehicle spots
    ParkingSpot.objects.create(
        parking_lot=lot1,
        spot_number="E01",
        spot_type='electric',
        is_occupied=False
    )
    
    ParkingSpot.objects.create(
        parking_lot=lot2,
        spot_number="E01",
        spot_type='electric',
        is_occupied=False
    )
    
    print("Sample data created successfully!")
    print(f"Created {ParkingLot.objects.count()} parking lots")
    print(f"Created {ParkingSpot.objects.count()} parking spots")

if __name__ == "__main__":
    create_sample_data() 