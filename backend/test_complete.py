#!/usr/bin/env python
"""
Comprehensive test script for the backend
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

def test_backend_health():
    """Test if backend is running"""
    print("🏥 Testing backend health...")
    
    try:
        response = requests.get('http://localhost:8000/api/auth/signup/', timeout=5)
        print(f"✅ Backend is running (status: {response.status_code})")
        return True
    except requests.exceptions.ConnectionError:
        print("❌ Backend is not running or not accessible")
        return False
    except Exception as e:
        print(f"⚠️  Backend test error: {e}")
        return False

def test_signup_endpoint():
    """Test the signup endpoint"""
    print("\n📝 Testing signup endpoint...")
    
    # Test data
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
        response = requests.post(
            'http://localhost:8000/api/auth/signup/',
            json=test_data,
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        
        print(f"📥 Response status: {response.status_code}")
        print(f"📥 Response headers: {dict(response.headers)}")
        print(f"📥 Response data: {response.text}")
        
        if response.status_code == 201:
            print("✅ Signup successful!")
            return True
        else:
            print(f"❌ Signup failed with status {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Error testing signup: {e}")
        return False

def test_signin_endpoint():
    """Test the signin endpoint"""
    print("\n🔑 Testing signin endpoint...")
    
    # Test data
    test_data = {
        'username': 'testuser123',
        'password': 'testpass123'
    }
    
    print(f"📤 Sending data: {json.dumps(test_data, indent=2)}")
    
    try:
        response = requests.post(
            'http://localhost:8000/api/auth/signin/',
            json=test_data,
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        
        print(f"📥 Response status: {response.status_code}")
        print(f"📥 Response data: {response.text}")
        
        if response.status_code == 200:
            print("✅ Signin successful!")
            return True
        else:
            print(f"❌ Signin failed with status {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Error testing signin: {e}")
        return False

def check_database():
    """Check database state"""
    print("\n🗄️  Checking database...")
    
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

def main():
    """Run all tests"""
    print("🚀 Starting comprehensive backend test...\n")
    
    # Test backend health
    if not test_backend_health():
        print("\n❌ Backend is not accessible. Please start it with:")
        print("   python manage.py runserver 0.0.0.0:8000")
        return
    
    # Test signup
    signup_success = test_signup_endpoint()
    
    # Test signin (only if signup worked)
    if signup_success:
        signin_success = test_signin_endpoint()
    else:
        signin_success = False
    
    # Check database
    check_database()
    
    print("\n" + "="*60)
    if signup_success and signin_success:
        print("🎉 All tests passed! Backend is working correctly.")
        print("\n📱 Mobile app should now work!")
    else:
        print("❌ Some tests failed. Check the errors above.")
        print("\n🔧 Common fixes:")
        print("   1. Make sure backend is running: python manage.py runserver 0.0.0.0:8000")
        print("   2. Check CORS settings")
        print("   3. Verify database migrations: python manage.py migrate")
    
    print("="*60)

if __name__ == '__main__':
    main()

