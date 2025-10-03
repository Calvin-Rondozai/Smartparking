#!/usr/bin/env python3
"""
Test script for booking LED control functionality
"""

import os
import sys
import django
from datetime import datetime, timedelta

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking_backend.settings')
django.setup()

from parking_app.models import ParkingLot, ParkingSpot, Booking, User
from iot_integration.models import IoTDevice
from parking_app.views import trigger_esp32_booking_led

def test_booking_led_control():
    """Test the booking LED control functionality"""
    print("=== Testing Booking LED Control ===")
    
    # Check if IoT device exists
    device = IoTDevice.objects.filter(device_type='sensor', is_active=True).first()
    if not device:
        print("❌ No active IoT device found")
        return
    
    print(f"✅ Found IoT device: {device.device_id}")
    
    # Check if parking lot exists
    lot = ParkingLot.objects.filter(name="IoT Smart Parking").first()
    if not lot:
        print("❌ IoT Smart Parking lot not found")
        return
    
    print(f"✅ Found parking lot: {lot.name}")
    
    # Check if parking spots exist
    slot_a = ParkingSpot.objects.filter(parking_lot=lot, spot_number="Slot A").first()
    slot_b = ParkingSpot.objects.filter(parking_lot=lot, spot_number="Slot B").first()
    
    if not slot_a or not slot_b:
        print("❌ Parking spots not found")
        return
    
    print(f"✅ Found parking spots: {slot_a.spot_number}, {slot_b.spot_number}")
    
    # Test LED control for Slot A
    print("\n🔵 Testing blue LED control for Slot A...")
    try:
        trigger_esp32_booking_led("Slot A", True)
        print("✅ Blue LED ON for Slot A")
    except Exception as e:
        print(f"❌ Failed to turn ON blue LED for Slot A: {e}")
    
    # Test LED control for Slot B
    print("\n🔵 Testing blue LED control for Slot B...")
    try:
        trigger_esp32_booking_led("Slot B", True)
        print("✅ Blue LED ON for Slot B")
    except Exception as e:
        print(f"❌ Failed to turn ON blue LED for Slot B: {e}")
    
    # Test turning off LEDs
    print("\n🔄 Testing LED turn OFF...")
    try:
        trigger_esp32_booking_led("Slot A", False)
        print("✅ Blue LED OFF for Slot A")
    except Exception as e:
        print(f"❌ Failed to turn OFF blue LED for Slot A: {e}")
    
    try:
        trigger_esp32_booking_led("Slot B", False)
        print("✅ Blue LED OFF for Slot B")
    except Exception as e:
        print(f"❌ Failed to turn OFF blue LED for Slot B: {e}")
    
    print("\n=== Test Complete ===")

def test_active_bookings_endpoint():
    """Test the active bookings endpoint"""
    print("\n=== Testing Active Bookings Endpoint ===")
    
    import requests
    
    try:
        response = requests.get('http://localhost:8000/api/iot/bookings/active/')
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Active bookings endpoint working")
            print(f"   Total active bookings: {data.get('total_active', 0)}")
            print(f"   Timestamp: {data.get('timestamp')}")
            
            bookings = data.get('bookings', [])
            for booking in bookings:
                spot = booking.get('parking_spot', {})
                print(f"   - {spot.get('spot_number')}: {booking.get('user')}")
        else:
            print(f"❌ Active bookings endpoint failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Failed to test active bookings endpoint: {e}")

if __name__ == "__main__":
    test_booking_led_control()
    test_active_bookings_endpoint()
