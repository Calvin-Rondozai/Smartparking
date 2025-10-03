#!/usr/bin/env python
"""
Debug script to test signup endpoint
"""
import os
import sys
import django
import requests
import json

# Setup Django
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking_backend.settings')
django.setup()

def test_signup_endpoint():
    """Test the signup endpoint directly"""
    print("🧪 Testing signup endpoint...")
    
    # Test data that should work
    test_data = {
        'username': 'testuser123',
        'email': 'test123@example.com',
        'password': 'testpass123',
        'fullName': 'Test User',
        'phoneNumber': '+1234567890',
        'numberPlate': 'ABC123',
        'carName': 'Test Car'
    }
    
    print(f"📤 Sending data: {json.dumps(test_data, indent=2)}")
    
    try:
        # Test the endpoint
        response = requests.post(
            'http://localhost:8000/api/auth/signup/',
            json=test_data,
            headers={'Content-Type': 'application/json'}
        )
        
        print(f"📥 Response status: {response.status_code}")
        print(f"📥 Response data: {response.text}")
        
        if response.status_code == 201:
            print("✅ Signup successful!")
        else:
            print(f"❌ Signup failed with status {response.status_code}")
            
    except Exception as e:
        print(f"❌ Error testing endpoint: {e}")
    
    # Test with missing fields
    print("\n🧪 Testing with missing fields...")
    incomplete_data = {
        'username': 'testuser456',
        'email': 'test456@example.com',
        'password': 'testpass456'
        # Missing fullName, phoneNumber, numberPlate, carName
    }
    
    try:
        response = requests.post(
            'http://localhost:8000/api/auth/signup/',
            json=incomplete_data,
            headers={'Content-Type': 'application/json'}
        )
        
        print(f"📥 Response status: {response.status_code}")
        print(f"📥 Response data: {response.text}")
        
    except Exception as e:
        print(f"❌ Error testing incomplete data: {e}")

def check_database():
    """Check what's in the database"""
    print("\n🔍 Checking database...")
    
    from django.contrib.auth.models import User
    from parking_app.models import UserProfile
    
    users = User.objects.all()
    profiles = UserProfile.objects.all()
    
    print(f"Total users: {users.count()}")
    print(f"Total profiles: {profiles.count()}")
    
    for user in users[:3]:
        try:
            profile = UserProfile.objects.get(user=user)
            print(f"✅ {user.username} - Profile: {profile.id}")
        except UserProfile.DoesNotExist:
            print(f"❌ {user.username} - NO PROFILE")

if __name__ == '__main__':
    print("🚀 Starting signup debug...")
    test_signup_endpoint()
    check_database()

