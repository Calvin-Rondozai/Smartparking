#!/usr/bin/env python
import os
import django
import requests
import time

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking_backend.settings')
django.setup()

from parking_app.models import ParkingLot, ParkingSpot

def test_manual_occupancy():
    """Test manually setting slot occupancy"""
    print("=== MANUAL OCCUPANCY TEST ===")
    
    try:
        # Get the IoT Smart Parking lot
        lot = ParkingLot.objects.get(name='IoT Smart Parking')
        print(f"✅ Found parking lot: {lot.name}")
        
        # Get the slots
        slot_a = ParkingSpot.objects.get(parking_lot=lot, spot_number='Slot A')
        slot_b = ParkingSpot.objects.get(parking_lot=lot, spot_number='Slot B')
        
        print(f"📱 Found slots: {slot_a.spot_number}, {slot_b.spot_number}")
        
        # Test 1: Set Slot A to occupied
        print(f"\n=== TEST 1: Set Slot A to Occupied ===")
        slot_a.is_occupied = True
        slot_a.save()
        print(f"✅ Set {slot_a.spot_number} to Occupied")
        
        # Check availability API
        time.sleep(1)
        response = requests.get('http://localhost:8000/api/iot/parking/availability/')
        if response.status_code == 200:
            data = response.json()
            print(f"📊 API Response:")
            print(f"   Total spots: {data['total_spots']}")
            print(f"   Available: {data['available_spots']}")
            print(f"   Occupied: {data['occupied_spots']}")
            for spot in data['spots']:
                status = "🔴 Occupied" if not spot['is_available'] else "🟢 Available"
                print(f"   - {spot['spot_number']}: {status}")
        
        # Test 2: Set Slot B to occupied
        print(f"\n=== TEST 2: Set Slot B to Occupied ===")
        slot_b.is_occupied = True
        slot_b.save()
        print(f"✅ Set {slot_b.spot_number} to Occupied")
        
        # Check availability API again
        time.sleep(1)
        response = requests.get('http://localhost:8000/api/iot/parking/availability/')
        if response.status_code == 200:
            data = response.json()
            print(f"📊 API Response:")
            print(f"   Total spots: {data['total_spots']}")
            print(f"   Available: {data['available_spots']}")
            print(f"   Occupied: {data['occupied_spots']}")
            for spot in data['spots']:
                status = "🔴 Occupied" if not spot['is_available'] else "🟢 Available"
                print(f"   - {spot['spot_number']}: {status}")
        
        # Test 3: Set both back to available
        print(f"\n=== TEST 3: Set Both to Available ===")
        slot_a.is_occupied = False
        slot_a.save()
        slot_b.is_occupied = False
        slot_b.save()
        print(f"✅ Set both slots to Available")
        
        # Final check
        time.sleep(1)
        response = requests.get('http://localhost:8000/api/iot/parking/availability/')
        if response.status_code == 200:
            data = response.json()
            print(f"📊 Final API Response:")
            print(f"   Total spots: {data['total_spots']}")
            print(f"   Available: {data['available_spots']}")
            print(f"   Occupied: {data['occupied_spots']}")
            for spot in data['spots']:
                status = "🔴 Occupied" if not spot['is_available'] else "🟢 Available"
                print(f"   - {spot['spot_number']}: {status}")
        
        print(f"\n✅ Manual occupancy test completed!")
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_manual_occupancy() 