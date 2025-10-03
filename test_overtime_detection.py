#!/usr/bin/env python3
"""
Test script to simulate slot occupancy and test overtime detection
"""

import requests
import time
import json

# Backend API base URL
API_BASE_URL = "http://10.94.110.47:8000/api"

def test_slot_occupancy(slot_name, is_occupied):
    """Test setting slot occupancy"""
    url = f"{API_BASE_URL}/iot/test/occupancy/"
    data = {
        "slot_name": slot_name,
        "is_occupied": is_occupied
    }
    
    try:
        response = requests.post(url, json=data)
        if response.status_code == 200:
            result = response.json()
            print(f"✅ {result['message']}")
            return True
        else:
            print(f"❌ Error: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"❌ Connection error: {e}")
        return False

def get_parking_availability():
    """Get current parking availability"""
    url = f"{API_BASE_URL}/iot/parking/availability/"
    
    try:
        response = requests.get(url)
        if response.status_code == 200:
            data = response.json()
            print(f"📊 Parking Status:")
            print(f"   Total Spots: {data['total_spots']}")
            print(f"   Available: {data['available_spots']}")
            print(f"   Occupied: {data['occupied_spots']}")
            print(f"   IoT Online: {not data.get('offline', True)}")
            print(f"   Spots:")
            for spot in data['spots']:
                status = "🟢 Available" if spot['is_available'] else "🔴 Occupied"
                print(f"     {spot['spot_number']}: {status}")
            return data
        else:
            print(f"❌ Error getting availability: {response.status_code}")
            return None
    except Exception as e:
        print(f"❌ Connection error: {e}")
        return None

def test_overtime_scenario():
    """Test the complete overtime scenario"""
    print("🧪 Testing Overtime Detection Scenario")
    print("=" * 50)
    
    # Step 1: Check initial status
    print("\n1. Initial Status:")
    get_parking_availability()
    
    # Step 2: Simulate car parking in Slot A
    print("\n2. Simulating car parking in Slot A...")
    test_slot_occupancy("Slot A", True)
    time.sleep(1)
    get_parking_availability()
    
    # Step 3: Wait and check status
    print("\n3. Waiting 10 seconds to simulate overtime...")
    for i in range(10):
        print(f"   Waiting... {i+1}/10")
        time.sleep(1)
    
    # Step 4: Check final status
    print("\n4. Final Status:")
    get_parking_availability()
    
    # Step 5: Simulate car leaving
    print("\n5. Simulating car leaving Slot A...")
    test_slot_occupancy("Slot A", False)
    time.sleep(1)
    get_parking_availability()

def interactive_test():
    """Interactive test mode"""
    print("🎮 Interactive Overtime Test")
    print("=" * 30)
    print("Commands:")
    print("  a - Set Slot A occupied")
    print("  b - Set Slot B occupied")
    print("  c - Set Slot A available")
    print("  d - Set Slot B available")
    print("  s - Show status")
    print("  q - Quit")
    print()
    
    while True:
        try:
            cmd = input("Enter command: ").lower().strip()
            
            if cmd == 'q':
                break
            elif cmd == 'a':
                test_slot_occupancy("Slot A", True)
            elif cmd == 'b':
                test_slot_occupancy("Slot B", True)
            elif cmd == 'c':
                test_slot_occupancy("Slot A", False)
            elif cmd == 'd':
                test_slot_occupancy("Slot B", False)
            elif cmd == 's':
                get_parking_availability()
            else:
                print("Invalid command. Try again.")
                
        except KeyboardInterrupt:
            print("\nExiting...")
            break

if __name__ == "__main__":
    print("🚗 Smart Parking Overtime Detection Test")
    print("=" * 40)
    
    # Check if backend is running
    try:
        response = requests.get(f"{API_BASE_URL}/iot/parking/availability/", timeout=5)
        if response.status_code == 200:
            print("✅ Backend is running")
        else:
            print("❌ Backend returned error")
            exit(1)
    except:
        print("❌ Cannot connect to backend. Make sure it's running on http://10.94.110.47:8000")
        exit(1)
    
    print("\nChoose test mode:")
    print("1. Automated scenario test")
    print("2. Interactive test")
    
    choice = input("Enter choice (1 or 2): ").strip()
    
    if choice == "1":
        test_overtime_scenario()
    elif choice == "2":
        interactive_test()
    else:
        print("Invalid choice. Running interactive test...")
        interactive_test()


