#!/usr/bin/env python3
"""
Test script to verify profile update functionality
"""

import os
import sys
import django

# Add the project directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartparking_backend.settings')
django.setup()

from django.contrib.auth.models import User
from parking_app.models import UserProfile

def test_profile_update():
    """Test profile update functionality"""
    print("🧪 Testing Profile Update Functionality")
    print("=" * 50)
    
    # Get a test user
    try:
        user = User.objects.first()
        if not user:
            print("❌ No users found in database")
            return
        
        print(f"✅ Found user: {user.username} ({user.email})")
        
        # Get or create profile
        profile, created = UserProfile.objects.get_or_create(user=user)
        if created:
            print(f"✅ Created new profile for {user.username}")
        else:
            print(f"✅ Found existing profile for {user.username}")
        
        print(f"📱 Current phone: {profile.phone}")
        print(f"🚗 Current address/license_plate: {profile.address}")
        
        # Test updating profile
        print("\n🔄 Testing profile update...")
        profile.phone = "+1234567890"
        profile.address = "ABC123"
        profile.save()
        
        print(f"📱 Updated phone: {profile.phone}")
        print(f"🚗 Updated address/license_plate: {profile.address}")
        
        # Test serializer
        from parking_app.serializers import UserProfileSerializer
        serializer = UserProfileSerializer(profile)
        data = serializer.data
        
        print(f"\n📊 Serializer data:")
        print(f"   phone: {data.get('phone')}")
        print(f"   phone_number: {data.get('phone_number')}")
        print(f"   address: {data.get('address')}")
        print(f"   license_plate: {data.get('license_plate')}")
        print(f"   car_name: {data.get('car_name')}")
        
        print("\n✅ Profile update test completed successfully!")
        
    except Exception as e:
        print(f"❌ Error during test: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_profile_update()
