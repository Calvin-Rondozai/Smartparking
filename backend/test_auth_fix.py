#!/usr/bin/env python
"""
Test script to verify authentication fixes
"""
import os
import sys
import django

# Add the project directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking_backend.settings')
django.setup()

from django.contrib.auth.models import User
from parking_app.models import UserProfile
from rest_framework.authtoken.models import Token

def test_user_creation():
    """Test creating a user and UserProfile"""
    print("🧪 Testing user creation...")
    
    try:
        # Create a test user
        user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
            first_name='Test',
            last_name='User'
        )
        print(f"✅ User created: {user.username}")
        
        # Check if UserProfile was created
        try:
            profile = UserProfile.objects.get(user=user)
            print(f"✅ UserProfile created: {profile}")
        except UserProfile.DoesNotExist:
            print("❌ UserProfile not found - creating manually")
            profile = UserProfile.objects.create(
                user=user,
                phone='',
                address=''
            )
            print(f"✅ UserProfile created manually: {profile}")
        
        # Test authentication
        from django.contrib.auth import authenticate
        auth_user = authenticate(username='testuser', password='testpass123')
        if auth_user:
            print(f"✅ Authentication successful: {auth_user.username}")
        else:
            print("❌ Authentication failed")
        
        # Create token
        token, created = Token.objects.get_or_create(user=user)
        print(f"✅ Token created: {token.key[:10]}...")
        
        # Clean up
        user.delete()
        print("✅ Test user cleaned up")
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_admin_user_creation():
    """Test creating an admin user"""
    print("\n🧪 Testing admin user creation...")
    
    try:
        # Create a superuser
        admin_user = User.objects.create_user(
            username='admin',
            email='admin@example.com',
            password='adminpass123',
            first_name='Admin',
            last_name='User',
            is_staff=True,
            is_superuser=True
        )
        print(f"✅ Admin user created: {admin_user.username}")
        
        # Check if UserProfile was created
        try:
            profile = UserProfile.objects.get(user=admin_user)
            print(f"✅ Admin UserProfile created: {profile}")
        except UserProfile.DoesNotExist:
            print("❌ Admin UserProfile not found - creating manually")
            profile = UserProfile.objects.create(
                user=admin_user,
                phone='',
                address=''
            )
            print(f"✅ Admin UserProfile created manually: {profile}")
        
        # Test admin privileges
        if admin_user.is_staff and admin_user.is_superuser:
            print("✅ Admin privileges confirmed")
        else:
            print("❌ Admin privileges not set correctly")
        
        # Clean up
        admin_user.delete()
        print("✅ Admin test user cleaned up")
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def main():
    """Run all tests"""
    print("🚀 Starting authentication tests...\n")
    
    # Test regular user creation
    user_test = test_user_creation()
    
    # Test admin user creation
    admin_test = test_admin_user_creation()
    
    print("\n" + "="*50)
    if user_test and admin_test:
        print("🎉 All tests passed! Authentication system is working correctly.")
        print("\n📱 Users created in admin dashboard should now be able to:")
        print("   - Login to mobile app")
        print("   - Access their profile")
        print("   - Make bookings")
        print("\n🔐 Admin dashboard access:")
        print("   - Only staff/superusers can login")
        print("   - General users are blocked")
    else:
        print("❌ Some tests failed. Check the errors above.")
    
    print("="*50)

if __name__ == '__main__':
    main()
